// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Catálogo, tanda 3: equipos Modbus RTU para el bus RS-485 de la placa.
// Módulo de E/S remotas 8DI/8DO, medidor de energía PZEM-016 y controlador
// de temperatura con RS-485. Como los transmisores (process.mjs): se
// alimentan, se cablean al bus (A con A, B con B) y responden con su
// dirección y velocidad.

const BAUDS = ["2400", "4800", "9600", "19200", "38400", "57600", "115200"];
const RATINGS = ["24VDC", "230VAC"];
const int16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff;
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const K = [1, 2, 3, 4, 5, 6, 7, 8];

/** Parámetros del bus (dirección, velocidad 8N1, demora). @param {number} address @param {string} baud */
const busParams = (address, baud = "9600") => [
  { id: "address", label: "Dirección Modbus", type: "number", default: address, hint: "1 a 247" },
  { id: "baud", label: "Velocidad", type: "enum", options: BAUDS, default: baud, hint: "8N1" },
  { id: "responseMs", label: "Demora de respuesta", type: "number", default: 5, unit: "ms" },
];

/**
 * Tabla de registros a partir de un mapa dirección → valor (null si falta alguno).
 * @param {Record<number, number>} map @param {number} start @param {number} count
 */
function regs(map, start, count) {
  const out = [];
  for (let a = start; a < start + count; a++) {
    if (!(a in map)) return null;
    out.push(map[a] & 0xffff);
  }
  return out;
}

// ------------------------------------------------------------------ E/S remotas
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const remoteIo = {
  type: "jwsim/remote-io",
  version: "1.0.0",
  name: "Módulo de E/S remotas Modbus",
  category: "Controladores",
  description:
    "Módulo de E/S remotas Modbus RTU de riel DIN, 8 entradas de 24 VDC (DI1-DI8, común DC al 0 V) y 8 salidas a relé (DO1-DO4 con el común C1, DO5-DO8 con C2), alimentación 24 VDC y RS-485. Amplía las 8 E/S del JWPLC Basic. Mapa: bobinas 0-7 = DO1-DO8 (funciones 01, 05 y 15), entradas discretas 0-7 = DI1-DI8 (02); también en registros: holding 0 = salidas como máscara de bits (03, 06 y 16) e input 0 = entradas (04). Sin alimentación, los relés sueltan y no responde.",
  parameters: busParams(3),
  terminals: [
    { id: "+", label: "+24 V" }, { id: "-", label: "0 V" }, { id: "A", label: "RS-485 A" }, { id: "B", label: "RS-485 B" },
    { id: "DC", label: "Común de entradas (0 V)" },
    ...K.map((k) => ({ id: `DI${k}`, label: `Entrada DI${k}` })),
    { id: "C1", label: "Común DO1-DO4" }, ...K.slice(0, 4).map((k) => ({ id: `DO${k}`, label: `Salida DO${k}` })),
    { id: "C2", label: "Común DO5-DO8" }, ...K.slice(4).map((k) => ({ id: `DO${k}`, label: `Salida DO${k}` })),
  ],
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({
    loads: [
      { id: "supply", a: "+", b: "-", rating: "24VDC", polar: true },
      ...K.map((k) => ({ id: `di${k}`, a: `DI${k}`, b: "DC", rating: "24VDC", polar: true })),
    ],
    contacts: Object.fromEntries(K.map((k) => [`DO${k}`, [k <= 4 ? "C1" : "C2", `DO${k}`]])),
  }),
  create() {
    let powered = false;
    const coils = K.map(() => 0);
    let di = K.map(() => 0);
    const mask = (bits) => bits.reduce((m, b, k) => m | (b ? 1 << k : 0), 0);
    const inRange = (start, count) => start >= 0 && count >= 1 && start + count <= 8;
    return {
      update(_t, inp) {
        powered = inp.loads.supply.on;
        di = K.map((k) => (inp.loads[`di${k}`].on ? 1 : 0));
        /** @type {Record<string, unknown>} */
        const outs = { powered, salidas: mask(coils), entradas: mask(di) };
        K.forEach((k, i) => {
          outs[`do${k}`] = powered && !!coils[i];
          outs[`di${k}`] = !!di[i];
        });
        return { contacts: Object.fromEntries(K.map((k, i) => [`DO${k}`, powered && !!coils[i]])), outputs: outs };
      },
      modbusReadBits(table, start, count) {
        if (!powered) return undefined;
        if (!inRange(start, count)) return null;
        return (table === "coils" ? coils : di).slice(start, start + count);
      },
      modbusWriteBits(start, bits) {
        if (!powered) return undefined;
        if (!inRange(start, bits.length)) return false;
        bits.forEach((b, k) => (coils[start + k] = b ? 1 : 0));
        return true;
      },
      modbusRead(table, start, count) {
        if (!powered) return undefined;
        return regs({ 0: table === "holding" ? mask(coils) : mask(di) }, start, count);
      },
      modbusWrite(start, vals) {
        if (!powered) return undefined;
        if (start !== 0 || vals.length !== 1) return false;
        if (vals[0] > 255) return 3;
        K.forEach((_, k) => (coils[k] = (vals[0] >> k) & 1));
        return true;
      },
    };
  },
};

// ------------------------------------------------------------------ medidor de energía
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const energyMeter = {
  type: "jwsim/energy-meter",
  version: "1.0.0",
  name: "Medidor de energía PZEM-016",
  category: "Instrumentación",
  description:
    "Medidor de energía monofásico Peacefair PZEM-016 (80-260 VAC, 100 A con TC) con RS-485 Modbus RTU: se alimenta de la tensión que mide (L-N) y la fase de la carga pasa por su TC (en la escena, en serie entre CT1 y CT2). Registros input (función 04), como en su hoja de datos: 0 = tensión × 10 (V), 1-2 = corriente × 1000 (A, 32 bits, parte baja primero), 3-4 = potencia × 10 (W), 5-6 = energía (Wh), 7 = frecuencia × 10 (Hz), 8 = factor de potencia × 100, 9 = alarma (FFFFh si la potencia supera el umbral). Holding 1 = umbral de alarma (W, escribible con 06). Mide la corriente de las cargas que la informan (motores, variador); el factor de potencia es un parámetro.",
  parameters: [
    ...busParams(1),
    { id: "fp", label: "Factor de potencia de la carga", type: "number", default: 0.85 },
    { id: "kwh0", label: "Energía inicial", type: "number", default: 0, unit: "kWh" },
    { id: "alarmaW", label: "Umbral de alarma", type: "number", default: 2300, unit: "W" },
  ],
  terminals: [
    { id: "L", label: "L (tensión y alimentación)" }, { id: "N", label: "N" },
    { id: "A", label: "RS-485 A" }, { id: "B", label: "RS-485 B" },
    { id: "CT1", label: "TC: entra la fase" }, { id: "CT2", label: "TC: sale a la carga" },
  ],
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "meter", a: "L", b: "N", rating: "230VAC", meter: true }], contacts: { "CT1-CT2": ["CT1", "CT2"] } }),
  currentSensors: () => [{ id: "i", terminals: ["CT2"] }],
  create(ctx) {
    const p = ctx.params;
    const fp = Math.max(0, Math.min(1, Number(p.fp) || 0.85));
    let wh = (Number(p.kwh0) || 0) * 1000;
    let watts = 0;
    let volts = 0;
    let amps = 0;
    let alarm = Number(p.alarmaW) || 2300;
    /** @type {bigint | null} */
    let lastT = null;
    const energyAt = (t) => wh + (lastT === null || t <= lastT ? 0 : (watts * Number(t - lastT)) / 3.6e12);
    return {
      update(t, inp) {
        wh = energyAt(t);
        lastT = t;
        const st = inp.loads.meter;
        volts = st?.on && st.kind === "AC" ? st.volts : 0;
        const a = Object.values(inp.currents?.i ?? {}).map(Number);
        amps = volts >= 80 && a.length ? Math.max(...a) : 0;
        watts = volts * amps * fp;
        return {
          // El TC no corta el circuito: la fase pasa siempre.
          contacts: { "CT1-CT2": true },
          outputs: {
            powered: volts >= 80,
            volts,
            amps: Math.round(amps * 1000) / 1000,
            watts: Math.round(watts * 10) / 10,
            kwh: Math.round(wh) / 1000,
            alarma: watts > alarm,
            lectura: volts >= 80 ? `${fmt(volts).replace(".", ",")} V · ${fmt(amps, 2).replace(".", ",")} A · ${Math.round(watts)} W` : "sin tensión",
          },
        };
      },
      modbusRead(table, start, count, t) {
        if (volts < 80) return undefined;
        if (table === "holding") return regs({ 1: alarm, 2: Number(p.address) }, start, count);
        const ma = Math.round(amps * 1000);
        const dw = Math.round(watts * 10);
        const e = Math.floor(energyAt(t));
        return regs(
          { 0: Math.round(volts * 10), 1: ma & 0xffff, 2: ma >>> 16, 3: dw & 0xffff, 4: dw >>> 16, 5: e & 0xffff, 6: e >>> 16, 7: 600, 8: Math.round(fp * 100), 9: watts > alarm ? 0xffff : 0 },
          start,
          count,
        );
      },
      modbusWrite(start, vals) {
        if (volts < 80) return undefined;
        if (start !== 1 || vals.length !== 1) return false;
        alarm = vals[0];
        return true;
      },
    };
  },
};

// ------------------------------------------------------------------ controlador de temperatura
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const tempController = {
  type: "jwsim/temp-controller",
  version: "1.0.0",
  name: "Controlador de temperatura RS-485",
  category: "Instrumentación",
  description:
    "Controlador de temperatura de panel 48 × 48 mm con RS-485 Modbus RTU (tipo Autonics TK4S o REX-C100 con opción de comunicación), entrada PT100 de 3 hilos (R1, R2, R3) y control ON-OFF con histéresis: en calentar cierra la salida 11-14 bajo SV − histéresis y la abre al llegar a SV; en enfriar, al revés. Alarma 21-24 cuando PV supera SV + desvío o la sonda está abierta. Registros: input 0 = PV × 10 (°C, con signo; 32767 sonda abierta), input 1 = estado (bit 0 salida, bit 1 alarma, bit 2 sonda abierta); holding 0 = SV × 10, 1 = histéresis × 10, 2 = modo (0 calentar, 1 enfriar), 3 = desvío de alarma × 10, escribibles (06 y 16).",
  parameters: [
    ...busParams(4),
    { id: "coil", label: "Alimentación", type: "enum", options: RATINGS, default: "230VAC" },
    { id: "sonda", label: "Sonda", type: "enum", options: ["cableada", "simulada"], default: "simulada", hint: "cableada: la PT100 de otro dispositivo (p. ej. el fermentador)" },
    { id: "temp", label: "Temperatura (simulada)", type: "number", default: 25, unit: "°C" },
    { id: "sv", label: "Consigna (SV)", type: "number", default: 40, unit: "°C" },
    { id: "hist", label: "Histéresis", type: "number", default: 2, unit: "°C" },
    { id: "modo", label: "Modo", type: "enum", options: ["calentar", "enfriar"], default: "calentar" },
    { id: "alarma", label: "Desvío de alarma", type: "number", default: 10, unit: "°C" },
  ],
  terminals: [
    { id: "L", label: "Alimentación" }, { id: "N", label: "Alimentación" },
    { id: "A", label: "RS-485 A" }, { id: "B", label: "RS-485 B" },
    { id: "R1", label: "PT100 rojo" }, { id: "R2", label: "PT100 rojo" }, { id: "R3", label: "PT100 blanco" },
    { id: "11", label: "Salida (común)" }, { id: "14", label: "Salida (NA)" },
    { id: "21", label: "Alarma (común)" }, { id: "24", label: "Alarma (NA)" },
  ],
  actions: [{ id: "temp", label: "Temperatura (simulada)", kind: "value", min: -50, max: 200, unit: "°C" }],
  probeInputs: (p) => (p.sonda === "cableada" ? [{ id: "temp", kind: "pt100", terminals: ["R1", "R2", "R3"] }] : []),
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: (p) => ({
    loads: [{ id: "supply", a: "L", b: "N", rating: String(p.coil) }],
    contacts: { "11-14": ["11", "14"], "21-24": ["21", "24"] },
  }),
  create(ctx) {
    const p = ctx.params;
    // Ajustes (en décimas de °C): los del inspector, cambiables por Modbus.
    const set = { sv: Math.round(Number(p.sv) * 10), hist: Math.round(Math.abs(Number(p.hist)) * 10), modo: p.modo === "enfriar" ? 1 : 0, alarma: Math.round(Number(p.alarma) * 10) };
    let powered = false;
    let out = false;
    let alarm = false;
    /** @type {number | null} */
    let pv = null;
    return {
      update(_t, inp) {
        powered = inp.loads.supply.on;
        const v = p.sonda === "simulada" ? Number(inp.actions.temp ?? p.temp) : Number(inp.values?.temp);
        pv = Number.isFinite(v) ? v : null;
        if (!powered || pv === null) out = false;
        else {
          const x = pv * 10;
          if (set.modo === 0) {
            if (x <= set.sv - set.hist) out = true;
            else if (x >= set.sv) out = false;
          } else if (x >= set.sv + set.hist) out = true;
          else if (x <= set.sv) out = false;
        }
        alarm = powered && (pv === null || pv * 10 >= set.sv + set.alarma);
        return {
          contacts: { "11-14": out, "21-24": alarm },
          outputs: {
            powered,
            pv: pv === null ? null : Math.round(pv * 10) / 10,
            sv: set.sv / 10,
            salida: out,
            alarma: alarm,
            pvTxt: !powered ? "" : pv === null ? "oPEn" : fmt(pv),
            svTxt: powered ? fmt(set.sv / 10) : "",
          },
        };
      },
      modbusRead(table, start, count) {
        if (!powered) return undefined;
        if (table === "input") return regs({ 0: pv === null ? 32767 : int16(pv * 10), 1: (out ? 1 : 0) | (alarm ? 2 : 0) | (pv === null ? 4 : 0) }, start, count);
        return regs({ 0: int16(set.sv), 1: set.hist, 2: set.modo, 3: int16(set.alarma) }, start, count);
      },
      modbusWrite(start, vals) {
        if (!powered) return undefined;
        const keys = ["sv", "hist", "modo", "alarma"];
        if (start < 0 || start + vals.length > keys.length) return false;
        for (const [k, raw] of vals.entries()) {
          const v = (raw << 16) >> 16;
          const key = keys[start + k];
          if (key === "modo" && raw > 1) return 3;
          if (key === "hist" && v < 0) return 3;
          set[key] = v;
        }
        return true;
      },
    };
  },
};
