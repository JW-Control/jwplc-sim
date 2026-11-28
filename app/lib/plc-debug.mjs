// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Cliente del depurador del OpenPLC Editor para el JWPLC simulado.
//
// El firmware de OpenPLC (Baremetal) trae el depurador siempre activo en la
// UART0 (DEBUG_IFACE = Serial, 115200, esclavo 1): tramas Modbus RTU con las
// funciones propias del editor (0x41-0x4B). Aquí se le habla con el mismo
// código del editor —constructores y lectores de PDU de
// backend/shared/debug/modbus-pdu.ts y la decodificación de
// cli/debug/variables.ts—, empaquetado en deps/ladder-ops.cjs
// (scripts/fetch-editor.mjs). Las direcciones salen del debug-map.json que
// deja STruC++ en la compilación, como en el editor.
//
// Transporte: el runner deriva lo que transmite la UART0 ({"type":"tap"} →
// {"type":"uart_out"}) y la petición entra con {"type":"uart_rx"}, que no
// queda en la grabación (no es una entrada del alumno). El mismo cliente
// sirve contra un JWPLC real por su puerto COM cambiando el transporte.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** CRC-16 Modbus (polinomio 0xA001, inicio 0xFFFF): se envía byte bajo primero. */
export function crc16(buf) {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}
export function rtuFrame(slave, pdu) {
  const f = Buffer.alloc(pdu.length + 3);
  f[0] = slave;
  Buffer.from(pdu).copy(f, 1);
  const c = crc16(f.subarray(0, f.length - 2));
  f[f.length - 2] = c & 0xff;
  f[f.length - 1] = c >>> 8;
  return f;
}

/** debug-map.json de la compilación OpenPLC del ejecutable (build/<x>/native/<exe>). */
export function debugMapFor(exe) {
  if (!exe) return null;
  const p = join(dirname(dirname(exe)), "openplc", "src", "debug-map.json");
  return existsSync(p) ? p : null;
}


export class PlcDebugLink {
  /**
   * @param {{ops: object, mapFile: string, slave?: number, uart?: number, timeoutMs?: number}} o
   * ops: deps/ladder-ops.cjs (funciones del editor).
   */
  constructor({ ops, mapFile, slave = 1, uart = 0, timeoutMs = 1500 }) {
    this.ops = ops;
    this.slave = slave;
    this.uart = uart;
    this.timeoutMs = timeoutMs;
    this.map = ops.parseDebugMap(readFileSync(mapFile, "utf8"));
    if (!this.map) throw new Error(`debug-map.json no válido: ${mapFile}`);
    // Variables del programa: «INSTANCE0.RETARDO.ET» → «RETARDO.ET».
    const info = ops.buildLeafInfoMap(this.map);
    this.vars = [...info].map(([path, l]) => ({ name: path.replace(/^INSTANCE\d+\./, ""), index: ops.packDebugAddr({ arrayIdx: l.arr, elemIdx: l.elem }), type: l.type, size: l.size, arr: l.arr, elem: l.elem }));
    this.proc = null;
    this.rx = Buffer.alloc(0);
    this.pending = null;
    this.queue = Promise.resolve();
    this.lastRx = 0;
    this.md5ok = null;
    // Tandas del editor para RTU (debug-medium-profile.ts): 19 direcciones
    // por petición. Si la respuesta no entra en la trama del firmware
    // (ERROR_OUT_OF_MEMORY, p. ej. muchos TIME), se achica a la mitad.
    this.batch = ops.debugProfileFor("rtu").batchSize;
    this.onMessage = (m) => {
      if (m.type !== "uart_out" || m.port !== this.uart) return;
      this.feed(Buffer.from(m.hex.replaceAll(" ", ""), "hex"));
    };
    this.onData = (d) => this.feed(d);
  }

  /** Bytes que llegan del PLC (simulado o real). */
  feed(bytes) {
    this.lastRx = Date.now();
    if (!this.pending) return;
    this.rx = Buffer.concat([this.rx, bytes]);
    this.tryFrame();
  }

  /** Transporte: la UART0 del runner del Sim. */
  attach(proc) {
    this.detach();
    this.proc = proc;
    // Todos los bytes en el instante actual: el firmware arma la trama por
    // el silencio que sigue (T3.5).
    this.send = (frame) => proc.send({ type: "uart_rx", port: this.uart, data: frame.toString("hex").match(/../g).map((h) => `0:${h}`).join(",") });
    this.off = () => proc.off?.("message", this.onMessage);
    proc.on("message", this.onMessage);
    proc.send({ type: "tap", port: this.uart, on: 1 });
  }

  /**
   * Transporte: un puerto serie (el JWPLC real por USB, «Ejecutar en vivo»).
   * port: objeto de serialport (write(buf), on("data")).
   */
  attachSerial(port) {
    this.detach();
    this.proc = port;
    this.send = (frame) => port.write(frame);
    this.off = () => port.off?.("data", this.onData);
    port.on("data", this.onData);
  }

  detach() {
    if (!this.proc) return;
    this.off?.();
    this.proc = null;
    this.pending?.reject(new Error("la simulación se detuvo"));
    this.pending = null;
  }

  /** ¿Hay una petición en curso o llegaron bytes hace poco? (para no mostrarlos en el Monitor serie) */
  busy() {
    return !!this.pending || Date.now() - this.lastRx < 300;
  }

  // Una respuesta completa: [esclavo][FC]…[CRC]. Se busca el inicio (puede
  // haber texto del programa antes) y se acepta cuando el CRC cierra.
  tryFrame() {
    const b = this.rx;
    for (let s = 0; s + 4 <= b.length; s++) {
      if (b[s] !== this.slave) continue;
      for (let e = s + 4; e <= b.length; e++) {
        const c = crc16(b.subarray(s, e - 2));
        if (b[e - 2] === (c & 0xff) && b[e - 1] === c >>> 8) {
          const pdu = new Uint8Array(b.subarray(s + 1, e - 2));
          this.rx = b.subarray(e);
          const p = this.pending;
          this.pending = null;
          clearTimeout(p.timer);
          p.resolve(pdu);
          return;
        }
      }
    }
  }

  /** Envía un PDU y espera su respuesta (de a una, como el editor). */
  request(pdu) {
    const run = () =>
      new Promise((resolve, reject) => {
        if (!this.proc) return reject(new Error("el PLC no está conectado"));
        this.rx = Buffer.alloc(0);
        const timer = setTimeout(() => {
          this.pending = null;
          reject(new Error("el depurador no respondió"));
        }, this.timeoutMs);
        this.pending = { resolve, reject, timer };
        this.send(rtuFrame(this.slave, pdu));
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  /** MD5 del programa en la placa contra el del debug-map (el editor hace lo mismo). */
  async checkMd5() {
    const r = this.ops.parseGetMd5Response(await this.request(this.ops.buildGetMd5Request()));
    this.md5ok = r.md5.toLowerCase() === String(this.map.md5).toLowerCase();
    return { md5: r.md5, expected: this.map.md5, ok: this.md5ok };
  }

  /**
   * Lee variables (todas si no se indican): { tick, values: {NOMBRE: valor} }.
   * Valores como los da el editor: BOOL true/false, números, TIME en texto.
   */
  async read(names) {
    if (this.md5ok === null) await this.checkMd5();
    if (!this.md5ok) throw new Error("el programa de la placa no coincide con el compilado (MD5)");
    const want = names?.length ? this.vars.filter((v) => names.some((n) => n.toUpperCase() === v.name)) : this.vars;
    const values = {};
    let tick;
    for (let i = 0; i < want.length; ) {
      const part = want.slice(i, i + this.batch);
      const r = this.ops.parseGetListResponse(await this.request(this.ops.buildGetListRequest(part.map((v) => v.index))));
      if (!r.success && r.error === "ERROR_OUT_OF_MEMORY" && this.batch > 1) {
        this.batch = Math.max(1, Math.floor(part.length / 2));
        continue;
      }
      if (!r.success) throw new Error(r.error);
      tick = r.tick;
      const got = this.ops.decodeVariableValues({ requested: part, payload: r.data, lastIndex: r.lastIndex, endian: "le", forced: new Set() });
      for (const v of got) values[v.name] = v.value;
      // Lo que no entró en la respuesta se pide en la tanda siguiente.
      i += Math.max(1, Math.min(part.length, (r.lastIndex ?? part.length - 1) + 1));
    }
    return { tick, values };
  }

  /**
   * Fuerza una variable a un valor (como «Forzar» del editor) o, con
   * value === null, la libera. Valor como texto o número: "TRUE", 1, "T#2s"…
   */
  async force(name, value) {
    const v = this.vars.find((x) => x.name === String(name).toUpperCase());
    if (!v) throw new Error(`la variable ${name} no está en el programa`);
    let bytes;
    if (value !== null && value !== undefined) {
      const text = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
      const e = this.ops.encodeValue(v, text);
      if (!e.success) throw new Error(e.error);
      bytes = e.bytes;
    }
    const r = this.ops.parseSetVariableResponse(await this.request(this.ops.buildSetVariableRequest(v.index, value !== null && value !== undefined, bytes)));
    if (!r.success) throw new Error(r.error);
    return true;
  }
}
