// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Decodificador del analizador de buses (G3): convierte los ítems crudos
// que captura el runner en filas legibles. Lo usan la interfaz (script
// clásico: window.JwsimBus) y los gates en Node (require).
//
// Ítems del runner (docs/ARCHITECTURE.md §7):
//   I2C : [t_ns, "I2C0", dirección, escritos_hex, leídos_hex, resultado]
//         resultado 0 = OK, 1 = NACK de dirección, 2 = NACK de datos
//   SPI : [t_ns, "VSPI", chip, mosi_hex, miso_hex, [[índice, dc]...], bytes]
//   UART: [t_ns, "UARTn TX", -1, hex, "", 0, bytes]
//
// Cada fila: { t, bus, dev, op, data, level, fields } con level "ok",
// "warn" (p. ej. NACK) o "err" (CRC incorrecto, trama inválida) y `fields`
// con los valores decodificados (lo que comparan las capturas de referencia).
"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JwsimBus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const hx = (b, n = 2) => `0x${b.toString(16).padStart(n, "0").toUpperCase()}`;
  const bytesOf = (hex) => (hex ? hex.split(" ").filter((x) => /^[0-9a-f]{2}$/i.test(x)).map((x) => parseInt(x, 16)) : []);
  const hexOf = (arr) => arr.map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const u16 = (b, i) => (b[i] << 8) | b[i + 1];
  const short = (arr, max = 16) => (arr.length > max ? `${hexOf(arr.slice(0, max))} … (${arr.length} bytes)` : hexOf(arr));

  // ------------------------------------------------------------ CRC
  // CRC-16/MODBUS (polinomio 0xA001 reflejado, inicial 0xFFFF).
  function crc16(bytes, start = 0, end = bytes.length) {
    let crc = 0xffff;
    for (let i = start; i < end; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc;
  }
  // CRC7 de los comandos SD (polinomio x^7 + x^3 + 1), devuelto con el bit
  // de fin: el byte que va en el cable.
  function crc7(bytes) {
    let crc = 0;
    for (const b of bytes) {
      for (let k = 7; k >= 0; k--) {
        const bit = ((b >> k) & 1) ^ ((crc >> 6) & 1);
        crc = (crc << 1) & 0x7f;
        if (bit) crc ^= 0x09;
      }
    }
    return (crc << 1) | 1;
  }

  // ------------------------------------------------------------ Modbus
  const MB_FN = {
    1: "Leer bobinas",
    2: "Leer entradas discretas",
    3: "Leer registros holding",
    4: "Leer registros de entrada",
    5: "Escribir una bobina",
    6: "Escribir un registro",
    7: "Leer estado de excepción",
    8: "Diagnóstico",
    11: "Contador de eventos",
    15: "Escribir varias bobinas",
    16: "Escribir varios registros",
    17: "Identificación del esclavo",
    22: "Escritura con máscara",
    23: "Leer/escribir varios registros",
  };
  const MB_EXC = {
    1: "función ilegal",
    2: "dirección de datos ilegal",
    3: "valor de datos ilegal",
    4: "falla del esclavo",
    5: "reconocido, en proceso",
    6: "esclavo ocupado",
    8: "error de paridad de memoria",
    10: "ruta de gateway no disponible",
    11: "el dispositivo destino no respondió",
  };

  // Longitudes posibles (sin dirección ni CRC: solo la PDU) para la PDU que
  // empieza en pdu[0] = función. Cada candidato: [largo, tipo].
  function pduCandidates(p, avail) {
    const fn = p[0];
    if (fn === undefined) return [];
    if (fn & 0x80) return [[2, "excepción"]];
    const c = [];
    const bc = (i) => (p.length > i ? p[i] : -1);
    switch (fn) {
      case 1:
      case 2:
      case 3:
      case 4:
        c.push([5, "petición"]);
        if (bc(1) >= 0) c.push([2 + bc(1), "respuesta"]);
        break;
      case 5:
      case 6:
        // La respuesta normal repite la petición byte a byte.
        c.push([5, "petición o eco"]);
        break;
      case 15:
      case 16:
        if (bc(5) >= 0) c.push([6 + bc(5), "petición"]);
        c.push([5, "respuesta"]);
        break;
      case 22:
        c.push([7, "petición"]);
        break;
      case 23:
        if (bc(9) >= 0) c.push([10 + bc(9), "petición"]);
        if (bc(1) >= 0) c.push([2 + bc(1), "respuesta"]);
        break;
      case 7:
      case 11:
      case 17:
        c.push([1, "petición"]);
        if (fn === 7) c.push([2, "respuesta"]);
        if (fn === 11) c.push([5, "respuesta"]);
        if (fn === 17 && bc(1) >= 0) c.push([2 + bc(1), "respuesta"]);
        break;
      case 8:
        c.push([5, "petición"]);
        break;
      default:
        break;
    }
    return c.filter(([len]) => len >= 1 && len <= avail);
  }

  // Campos y texto de una PDU ya delimitada.
  function decodePdu(p, kind) {
    const fn = p[0] & 0x7f;
    const f = { fn, kind };
    const name = MB_FN[fn] ?? `función ${hx(fn)}`;
    let detail = "";
    if (kind === "excepción") {
      f.exception = p[1];
      detail = `excepción ${hx(p[1])}: ${MB_EXC[p[1]] ?? "desconocida"}`;
      return { f, op: `${hx(fn)} ${name} · excepción`, detail };
    }
    if ([1, 2, 3, 4].includes(fn)) {
      if (kind === "petición") {
        f.start = u16(p, 1);
        f.qty = u16(p, 3);
        detail = `inicio ${f.start} · cantidad ${f.qty}`;
      } else {
        const data = p.slice(2, 2 + p[1]);
        f.byteCount = p[1];
        if (fn >= 3) {
          f.values = [];
          for (let i = 0; i + 1 < data.length; i += 2) f.values.push(u16(data, i));
          detail = `${f.values.length} registros: ${f.values.join(", ")}`;
        } else {
          f.bits = data.flatMap((b) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (b >> k) & 1));
          detail = `${data.length} bytes de estados: ${hexOf(data)}`;
        }
      }
    } else if (fn === 5) {
      f.address = u16(p, 1);
      f.value = u16(p, 3);
      detail = `bobina ${f.address} ← ${f.value === 0xff00 ? "ON" : f.value === 0 ? "OFF" : `valor inválido ${hx(f.value, 4)}`}`;
    } else if (fn === 6) {
      f.address = u16(p, 1);
      f.value = u16(p, 3);
      detail = `registro ${f.address} ← ${f.value}`;
    } else if (fn === 15 || fn === 16) {
      f.start = u16(p, 1);
      f.qty = u16(p, 3);
      detail = `inicio ${f.start} · cantidad ${f.qty}`;
      if (kind === "petición") {
        const data = p.slice(6, 6 + p[5]);
        f.byteCount = p[5];
        if (fn === 16) {
          f.values = [];
          for (let i = 0; i + 1 < data.length; i += 2) f.values.push(u16(data, i));
          detail += ` · valores ${f.values.join(", ")}`;
        } else {
          detail += ` · estados ${hexOf(data)}`;
        }
      }
    } else if (fn === 22) {
      f.address = u16(p, 1);
      f.and = u16(p, 3);
      f.or = u16(p, 5);
      detail = `registro ${f.address} · AND ${hx(f.and, 4)} · OR ${hx(f.or, 4)}`;
    } else if (fn === 23 && kind === "petición") {
      f.readStart = u16(p, 1);
      f.readQty = u16(p, 3);
      f.writeStart = u16(p, 5);
      f.writeQty = u16(p, 7);
      detail = `lee ${f.readStart}+${f.readQty} · escribe ${f.writeStart}+${f.writeQty}`;
    } else {
      detail = hexOf(p.slice(1));
    }
    return { f, op: `${hx(fn)} ${name} · ${kind}`, detail };
  }

  // Separa tramas Modbus RTU de un bloque de bytes: en cada posición prueba
  // los largos posibles según la función y se queda con el que tiene CRC
  // válido. Devuelve [{ bytes, slave, crc: { ok, got, want }, ...pdu }].
  function modbusRtuFrames(b) {
    const out = [];
    let i = 0;
    while (i < b.length) {
      const avail = b.length - i - 3; // dirección + CRC
      const pdu = b.slice(i + 1);
      const cands = avail >= 1 ? pduCandidates(pdu, avail) : [];
      let pick = null;
      for (const [len, kind] of cands) {
        const end = i + 1 + len;
        if (crc16(b, i, end) === (b[end] | (b[end + 1] << 8))) {
          pick = [len, kind];
          break;
        }
      }
      if (!pick && cands.length) pick = cands[0];
      if (!pick) {
        out.push({ bytes: b.slice(i), invalid: true });
        break;
      }
      const end = i + 1 + pick[0];
      const want = crc16(b, i, end);
      const got = b[end] | (b[end + 1] << 8);
      const d = decodePdu(b.slice(i + 1, end), pick[1]);
      out.push({ bytes: b.slice(i, end + 2), slave: b[i], crc: { ok: want === got, got, want }, ...d });
      i = end + 2;
    }
    return out;
  }

  // Modbus TCP: MBAP (transacción, protocolo = 0, largo, unidad) + PDU.
  function modbusTcpFrames(b) {
    const out = [];
    let i = 0;
    while (i + 8 <= b.length) {
      const tid = u16(b, i);
      const pid = u16(b, i + 2);
      const len = u16(b, i + 4);
      const unit = b[i + 6];
      const pdu = b.slice(i + 7, i + 6 + len);
      if (pid !== 0 || len < 2 || i + 6 + len > b.length) {
        out.push({ bytes: b.slice(i), invalid: true, tid, pid, len });
        return out;
      }
      const cands = pduCandidates(pdu, pdu.length).filter(([l]) => l === pdu.length);
      const kind = cands[0]?.[1] ?? (pdu[0] & 0x80 ? "excepción" : "petición");
      out.push({ bytes: b.slice(i, i + 6 + len), tid, unit, mbap: { ok: true, len }, ...decodePdu(pdu, kind) });
      i += 6 + len;
    }
    if (i < b.length) out.push({ bytes: b.slice(i), invalid: true });
    return out;
  }

  // ------------------------------------------------------------ I2C
  const TCA_REGS = ["Entrada 0", "Entrada 1", "Entrada 2", null, "Salida 0", "Salida 1", "Salida 2", null, "Polaridad 0", "Polaridad 1", "Polaridad 2", null, "Config. 0", "Config. 1", "Config. 2"];
  const DS3232_REGS = ["Segundos", "Minutos", "Horas", "Día de semana", "Fecha", "Mes/siglo", "Año", "Alarma 1 seg.", "Alarma 1 min.", "Alarma 1 hora", "Alarma 1 día", "Alarma 2 min.", "Alarma 2 hora", "Alarma 2 día", "Control", "Control/estado", "Aging", "Temperatura MSB", "Temperatura LSB", "Desactivar temperatura"];
  const I2C_DEVICES = {
    0x22: { name: "TCA6424A (E/S)", reg: (r) => TCA_REGS[r & 0x7f] ?? `reg ${hx(r & 0x7f)}`, ai: (r) => !!(r & 0x80) },
    0x68: { name: "DS3232M (RTC)", reg: (r) => DS3232_REGS[r] ?? (r >= 0x14 ? `SRAM ${hx(r)}` : `reg ${hx(r)}`) },
  };

  function decodeI2c([t, bus, addr, w, r, res]) {
    const wb = bytesOf(w);
    const rb = bytesOf(r);
    const dev = I2C_DEVICES[addr];
    const devName = `${dev ? `${dev.name} ` : ""}@${hx(addr)}`;
    const fields = { addr, write: wb, read: rb, result: res };
    if (res === 1) return { t, bus, dev: devName, op: "NACK de dirección", data: hexOf(wb), level: "warn", fields };
    let op;
    let data;
    if (wb.length) {
      const reg = wb[0];
      fields.reg = reg;
      const regName = dev ? dev.reg(reg) : `reg ${hx(reg)}`;
      fields.regName = regName;
      const ai = dev?.ai?.(reg) ? " (AI)" : "";
      if (rb.length) {
        op = `Leer ${regName}${ai}`;
        data = `→ ${hexOf(rb)}`;
        // DS3232M: hora y fecha en BCD desde el registro 0.
        if (addr === 0x68 && reg === 0 && rb.length >= 7) {
          const bcd = (v) => (v >> 4) * 10 + (v & 15);
          const p2 = (v) => String(v).padStart(2, "0");
          const h = rb[2] & 0x40 ? `${bcd(rb[2] & 0x1f)}${rb[2] & 0x20 ? " PM" : " AM"}` : p2(bcd(rb[2] & 0x3f));
          fields.time = `${h}:${p2(bcd(rb[1]))}:${p2(bcd(rb[0] & 0x7f))}`;
          fields.date = `${p2(bcd(rb[4]))}/${p2(bcd(rb[5] & 0x1f))}/${p2(bcd(rb[6]))}`;
          data += ` (${fields.time} ${fields.date})`;
        }
      } else if (wb.length > 1) {
        op = `Escribir ${regName}${ai}`;
        data = `← ${hexOf(wb.slice(1))}`;
      } else {
        op = `Apuntar a ${regName}`;
        data = "";
      }
    } else {
      op = "Leer";
      data = `→ ${hexOf(rb)}`;
    }
    return { t, bus, dev: devName, op, data, level: res === 2 ? "warn" : "ok", fields };
  }

  // ------------------------------------------------------------ SPI
  const ST7789 = {
    0x00: "NOP", 0x01: "SWRESET", 0x04: "RDDID", 0x09: "RDDST", 0x10: "SLPIN", 0x11: "SLPOUT", 0x12: "PTLON", 0x13: "NORON",
    0x20: "INVOFF", 0x21: "INVON", 0x26: "GAMSET", 0x28: "DISPOFF", 0x29: "DISPON", 0x2a: "CASET", 0x2b: "RASET", 0x2c: "RAMWR",
    0x2e: "RAMRD", 0x30: "PTLAR", 0x33: "VSCRDEF", 0x34: "TEOFF", 0x35: "TEON", 0x36: "MADCTL", 0x37: "VSCSAD", 0x38: "IDMOFF",
    0x39: "IDMON", 0x3a: "COLMOD", 0x3c: "RAMWRC", 0xb0: "RAMCTRL", 0xb2: "PORCTRL", 0xb7: "GCTRL", 0xbb: "VCOMS", 0xc0: "LCMCTRL",
    0xc2: "VDVVRHEN", 0xc3: "VRHS", 0xc4: "VDVS", 0xc6: "FRCTRL2", 0xd0: "PWCTRL1", 0xe0: "PVGAMCTRL", 0xe1: "NVGAMCTRL",
  };
  const FRAM_OPS = { 0x06: "WREN", 0x04: "WRDI", 0x05: "RDSR", 0x01: "WRSR", 0x03: "READ", 0x02: "WRITE", 0x9f: "RDID", 0xb9: "SLEEP" };
  const SD_CMDS = {
    0: "GO_IDLE_STATE", 1: "SEND_OP_COND", 8: "SEND_IF_COND", 9: "SEND_CSD", 10: "SEND_CID", 12: "STOP_TRANSMISSION", 13: "SEND_STATUS",
    16: "SET_BLOCKLEN", 17: "READ_SINGLE_BLOCK", 18: "READ_MULTIPLE_BLOCK", 23: "SET_BLOCK_COUNT", 24: "WRITE_BLOCK", 25: "WRITE_MULTIPLE_BLOCK",
    32: "ERASE_WR_BLK_START", 33: "ERASE_WR_BLK_END", 38: "ERASE", 55: "APP_CMD", 58: "READ_OCR", 59: "CRC_ON_OFF",
  };
  const SD_ACMDS = { 13: "SD_STATUS", 22: "SEND_NUM_WR_BLOCKS", 23: "SET_WR_BLK_ERASE_COUNT", 41: "SD_SEND_OP_COND", 51: "SEND_SCR" };
  const W5500_COMMON = {
    0x00: "MR", 0x01: "GAR", 0x05: "SUBR", 0x09: "SHAR", 0x0f: "SIPR", 0x13: "INTLEVEL", 0x15: "IR", 0x16: "IMR", 0x17: "SIR", 0x18: "SIMR",
    0x19: "RTR", 0x1b: "RCR", 0x1c: "PTIMER", 0x1d: "PMAGIC", 0x1e: "PHAR", 0x24: "PSID", 0x26: "PMRU", 0x28: "UIPR", 0x2c: "UPORTR",
    0x2e: "PHYCFGR", 0x39: "VERSIONR",
  };
  const W5500_SOCKET = {
    0x00: "MR", 0x01: "CR", 0x02: "IR", 0x03: "SR", 0x04: "PORT", 0x06: "DHAR", 0x0c: "DIPR", 0x10: "DPORT", 0x12: "MSSR", 0x15: "TOS",
    0x16: "TTL", 0x1e: "RXBUF_SIZE", 0x1f: "TXBUF_SIZE", 0x20: "TX_FSR", 0x22: "TX_RD", 0x24: "TX_WR", 0x26: "RX_RSR", 0x28: "RX_RD",
    0x2a: "RX_WR", 0x2c: "IMR", 0x2d: "FRAG", 0x2f: "KPALVTR",
  };

  function decodeSpi(item, st) {
    const [t, bus, chip, mosiHex, misoHex, dc, total] = item;
    const mosi = bytesOf(mosiHex);
    const miso = bytesOf(misoHex);
    const truncated = total > mosi.length;
    const base = { t, bus, dev: chip, level: "ok" };
    const fields = { chip, total };
    if (chip === "FRAM") {
      const op = FRAM_OPS[mosi[0]] ?? `opcode ${hx(mosi[0])}`;
      fields.op = op;
      if (mosi[0] === 0x03 || mosi[0] === 0x02) {
        fields.address = u16(mosi, 1);
        const data = mosi[0] === 0x03 ? miso.slice(3) : mosi.slice(3);
        fields.data = data;
        const n = total - 3;
        return { ...base, op: `${op} ${hx(fields.address, 4)}`, data: `${mosi[0] === 0x03 ? "→" : "←"} ${short(data)}${truncated ? ` (${n} bytes)` : ""}`, fields };
      }
      if (mosi[0] === 0x05) return { ...base, op, data: `estado → ${hx(miso[1] ?? 0xff)}`, fields: { ...fields, status: miso[1] } };
      if (mosi[0] === 0x01) return { ...base, op, data: `estado ← ${hx(mosi[1] ?? 0)}`, fields: { ...fields, status: mosi[1] } };
      if (mosi[0] === 0x9f) return { ...base, op, data: `→ ${hexOf(miso.slice(1))}`, fields };
      return { ...base, op, data: "", fields };
    }
    if (chip === "SD") return decodeSd(base, mosi, miso, fields, st);
    if (chip === "W5500") return decodeW5500(base, mosi, miso, fields, total);
    if (chip === "TFT") return decodeTft(base, mosi, dc, total, fields, st);
    return { ...base, op: `${total} bytes`, data: `MOSI ${short(mosi)} · MISO ${short(miso)}`, fields: { ...fields, mosi, miso } };
  }

  function decodeSd(base, mosi, miso, fields, st) {
    const i = mosi.findIndex((b) => (b & 0xc0) === 0x40);
    if (i < 0 || i + 6 > mosi.length) {
      if (mosi[0] === 0xfe || mosi[0] === 0xfc) return { ...base, op: "Bloque de datos (escritura)", data: `${mosi.length - 1} bytes`, fields: { ...fields, token: mosi[0] } };
      if (mosi.every((b) => b === 0xff)) {
        const tok = miso.indexOf(0xfe);
        if (tok >= 0) return { ...base, op: "Bloque de datos (lectura)", data: `token 0xFE + ${miso.length - tok - 1} bytes`, fields: { ...fields, token: 0xfe } };
        return { ...base, op: "Relleno / espera", data: `${mosi.length} × 0xFF · MISO ${short(miso, 8)}`, fields };
      }
      return { ...base, op: `${mosi.length} bytes`, data: short(mosi), fields };
    }
    const cmd = mosi[i] & 0x3f;
    const arg = ((mosi[i + 1] << 24) | (mosi[i + 2] << 16) | (mosi[i + 3] << 8) | mosi[i + 4]) >>> 0;
    const crc = mosi[i + 5];
    const want = crc7(mosi.slice(i, i + 5));
    const app = !!st.sdApp;
    st.sdApp = cmd === 55;
    const name = app ? `ACMD${cmd} ${SD_ACMDS[cmd] ?? ""}`.trim() : `CMD${cmd} ${SD_CMDS[cmd] ?? ""}`.trim();
    const r1i = miso.findIndex((b, k) => k > i + 5 && b !== 0xff);
    const r1 = r1i >= 0 ? miso[r1i] : null;
    Object.assign(fields, { cmd, app, arg, crc: { ok: crc === want, got: crc, want }, r1 });
    const crcText = crc === want ? `CRC7 ${hx(crc)} ✓` : `CRC7 ${hx(crc)} (no verificado; esperado ${hx(want)})`;
    return { ...base, op: name, data: `arg ${hx(arg, 8)} · ${crcText}${r1 !== null ? ` · R1 ${hx(r1)}` : " · sin respuesta"}`, fields };
  }

  function decodeW5500(base, mosi, miso, fields, total) {
    if (mosi.length < 3) return { ...base, op: "trama corta", data: hexOf(mosi), level: "warn", fields };
    const addr = u16(mosi, 0);
    const ctrl = mosi[2];
    const bsb = ctrl >> 3;
    const write = !!(ctrl & 0x04);
    const om = ctrl & 3;
    const sock = bsb ? (bsb - 1) >> 2 : null;
    const kind = bsb ? (bsb - 1) & 3 : null;
    Object.assign(fields, { address: addr, bsb, write, om });
    if (bsb > 0 && (kind === 3 || sock > 7)) {
      return { ...base, op: "Trama fuera del formato W5500", data: `${short(mosi)} (sondeo de otro chip WIZnet)`, level: "warn", fields };
    }
    const data = write ? mosi.slice(3) : miso.slice(3);
    fields.data = data;
    let block;
    let reg;
    if (bsb === 0) {
      block = "Común";
      reg = W5500_COMMON[addr] ?? hx(addr, 4);
    } else if (kind === 0) {
      block = `Socket ${sock}`;
      reg = `Sn_${W5500_SOCKET[addr] ?? hx(addr, 4)}`;
    } else {
      block = `Socket ${sock} ${kind === 1 ? "TX" : "RX"}`;
      reg = `buffer ${hx(addr, 4)}`;
      // Contenido de los buffers: Modbus TCP si encaja (puerto 502).
      const frames = modbusTcpFrames(data);
      if (frames.length && !frames[0].invalid) {
        const f = frames[0];
        fields.modbus = { tid: f.tid, unit: f.unit, ...f.f };
        return { ...base, op: `${block} · Modbus TCP ${f.op}`, data: `tx ${f.tid} · unidad ${f.unit} · ${f.detail}`, fields };
      }
    }
    fields.reg = reg;
    const n = total - 3;
    return { ...base, op: `${block} · ${write ? "escribir" : "leer"} ${reg}`, data: `${write ? "←" : "→"} ${short(data)}${total > mosi.length ? ` (${n} bytes)` : ""}`, fields };
  }

  // ST7789: con D/C = 0 el byte es un comando; con D/C = 1, datos del último
  // comando (el driver suele enviar comando y datos en ciclos de CS
  // distintos: el estado se conserva entre transacciones).
  function decodeTft(base, mosi, dc, total, fields, st) {
    const marks = dc.length ? dc : [[0, 1]];
    const parts = [];
    const cmds = [];
    let bare = false; // la última parte es un comando aún sin sus datos
    for (let m = 0; m < marks.length; m++) {
      const [start, level] = marks[m];
      const end = m + 1 < marks.length ? marks[m + 1][0] : mosi.length;
      const seg = mosi.slice(start, end);
      if (!level) {
        for (const c of seg) {
          st.tftCmd = c;
          st.tftArgs = [];
          cmds.push(c);
          parts.push(ST7789[c] ?? hx(c));
          bare = true;
        }
      } else {
        // Datos del comando enviado en esta misma transacción: una sola parte.
        if (bare) parts.pop();
        bare = false;
        st.tftArgs = (st.tftArgs ?? []).concat(seg);
        fields.cmd = st.tftCmd;
        fields.data = seg;
        const isLast = m + 1 === marks.length;
        const extra = isLast ? total - mosi.length : 0;
        const n = seg.length + extra;
        const name = ST7789[st.tftCmd] ?? (st.tftCmd !== undefined ? hx(st.tftCmd) : "datos");
        if ((st.tftCmd === 0x2a || st.tftCmd === 0x2b) && st.tftArgs.length >= 4) {
          const a = st.tftArgs;
          parts.push(`${name} ${st.tftCmd === 0x2a ? "x" : "y"} ${u16(a, 0)}..${u16(a, 2)}`);
          fields[st.tftCmd === 0x2a ? "caset" : "raset"] = [u16(a, 0), u16(a, 2)];
        } else if (st.tftCmd === 0x2c) {
          parts.push(`${name} ${n} bytes (${Math.floor(n / 2)} píxeles RGB565)`);
          fields.ramwrBytes = n;
        } else {
          parts.push(`${name} ← ${short(seg, 8)}`);
        }
      }
    }
    fields.commands = cmds;
    return { ...base, op: parts.join(" · "), data: "", fields };
  }

  // ------------------------------------------------------------ UART
  function asciiOf(arr) {
    return arr.map((b) => (b === 10 ? "⏎" : b === 13 ? "" : b >= 32 && b < 127 ? String.fromCharCode(b) : "·")).join("");
  }

  function decodeUart([t, bus, , hex, , , total]) {
    const b = bytesOf(hex);
    const port = Number(/UART(\d)/.exec(bus)?.[1] ?? 0);
    const busName = bus.replace(" TX", "");
    const rows = [];
    // Fuera de la consola, se prueba Modbus RTU (RS-485 en UART2).
    if (port !== 0) {
      const frames = modbusRtuFrames(b);
      // RS-485 (UART2): toda trama con estructura Modbus se muestra, con su
      // CRC; en otras UART, solo si alguna trama tiene CRC válido.
      if (frames.some((f) => !f.invalid && f.crc.ok) || (port === 2 && frames.length && !frames[0].invalid)) {
        for (const f of frames) {
          if (f.invalid) {
            rows.push({ t, bus: busName, dev: "Modbus RTU", op: "Bytes sin trama válida", data: hexOf(f.bytes), level: "err", fields: { proto: "Modbus RTU", invalid: true } });
            continue;
          }
          const crc = f.crc.ok ? `CRC ${hx(f.crc.got, 4)} ✓` : `CRC ${hx(f.crc.got, 4)} ✗ (esperado ${hx(f.crc.want, 4)})`;
          rows.push({
            t,
            bus: busName,
            dev: `Modbus RTU · esclavo ${f.slave}`,
            op: f.op,
            data: `${f.detail} · ${crc}`,
            level: f.crc.ok ? "ok" : "err",
            fields: { proto: "Modbus RTU", slave: f.slave, ...f.f, crc: f.crc.ok ? "ok" : "mal" },
          });
        }
        return rows;
      }
    }
    const text = port === 0 || b.every((x) => x === 10 || x === 13 || (x >= 32 && x < 127));
    return [
      {
        t,
        bus: busName,
        dev: port === 0 ? "Consola" : port === 2 ? "RS-485" : `UART${port}`,
        op: `TX ${total ?? b.length} bytes`,
        data: text ? asciiOf(b) : short(b, 24),
        level: "ok",
        fields: text ? { text: b.map((x) => String.fromCharCode(x)).join("") } : { bytes: b },
      },
    ];
  }

  // ------------------------------------------------------------ entrada
  function createDecoder() {
    const state = new Map(); // estado por chip (comando TFT, ACMD de SD)
    return {
      decode(item) {
        const bus = item[1];
        if (/^UART/.test(bus)) return decodeUart(item);
        if (/^I2C/.test(bus)) return [decodeI2c(item)];
        if (typeof item[2] === "string") {
          if (!state.has(item[2])) state.set(item[2], {});
          return [decodeSpi(item, state.get(item[2]))];
        }
        return [{ t: item[0], bus, dev: "—", op: "desconocido", data: JSON.stringify(item), level: "warn", fields: {} }];
      },
    };
  }

  return { createDecoder, crc16, crc7, modbusRtuFrames, modbusTcpFrames, bytesOf, hexOf };
});
