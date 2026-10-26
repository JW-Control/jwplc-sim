// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Variador de frecuencia Delta VFD-EL (VFD007EL21A, estructura A: entrada
// monofásica 220 V, salida trifásica 220 V, 0,75 kW) programable como el
// real: parámetros Pr.GG.NN, teclado con pantalla de 7 segmentos (MODE,
// ENTER, ▲, ▼, RUN, STOP/RESET), potenciómetro, entradas MI1-MI6, relé
// RA/RB/RC y Modbus por el puerto RS-485. Trae plantillas de taller que dejan
// el equipo listo para un uso típico.
//
// Códigos, rangos, valores de fábrica, direcciones Modbus y códigos de falla
// según el manual del usuario del VFD-EL (cap. 2.4, 3, 4.1 y 4.3 «Lista de
// direcciones»). Lo que se programa en el teclado o por Modbus queda en la
// escena (el variador lo guarda como en su memoria).

import { Ramp, earliest, ms } from "../device-kit.mjs";

/** Funciones de las entradas multifunción MI3-MI6 (Pr.04.05 a 04.08) que el modelo implementa. */
const MI_FUNCS = [
  "0: sin función", "1: multivelocidad 1", "2: multivelocidad 2", "3: multivelocidad 3", "4: multivelocidad 4",
  "5: reset externo", "6: inhibir acel/desacel", "7: rampa 2 (01.11/01.12)", "8: JOG", "9: bloque base externo (bb)",
  "10: subir frecuencia (UP)", "11: bajar frecuencia (DOWN)", "14: falla externa (EF)", "16: desconexión de la salida",
  "17: bloqueo de parámetros", "18: marcha por bornes", "19: marcha por teclado",
];

/**
 * @typedef {{ code: string, group?: string, name: string, unit?: string, dec?: number, min?: number, max?: number,
 *   def: number, options?: string[], inspector?: boolean, ro?: boolean }} VfdParam
 */

/** Parámetros implementados (código Delta GG-NN; en el teclado, GG.NN). @type {VfdParam[]} */
export const VFD_EL_PARAMS = [
  { code: "00-02", group: "00 Usuario", name: "Reinicio de parámetros", def: 0, inspector: false,
    options: ["0: lectura y escritura", "1: solo lectura", "9: fábrica 50 Hz", "10: fábrica 60 Hz"] },
  { code: "00-03", name: "Pantalla de inicio", def: 0,
    options: ["0: F (frecuencia de referencia)", "1: H (frecuencia de salida)", "2: A (corriente)", "3: U (unidad de usuario)", "4: Frd/rEu (sentido)"] },
  { code: "00-05", name: "Coeficiente K (U = F × K)", dec: 1, min: 0.1, max: 160, def: 1 },
  { code: "01-00", group: "01 Básicos", name: "Frecuencia máxima de salida", unit: "Hz", dec: 2, min: 50, max: 600, def: 60 },
  { code: "01-01", name: "Frecuencia de tensión máxima (Fbase)", unit: "Hz", dec: 2, min: 0.1, max: 600, def: 60 },
  { code: "01-02", name: "Tensión máxima de salida", unit: "V", dec: 1, min: 0.1, max: 255, def: 220 },
  { code: "01-05", name: "Frecuencia mínima de salida (Fmin)", unit: "Hz", dec: 2, min: 0.1, max: 600, def: 1.5 },
  { code: "01-07", name: "Límite superior de frecuencia", unit: "%", dec: 1, min: 0.1, max: 120, def: 110 },
  { code: "01-08", name: "Límite inferior de frecuencia", unit: "%", dec: 1, min: 0, max: 100, def: 0 },
  { code: "01-09", name: "Aceleración 1 (0 a 01.00)", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-10", name: "Desaceleración 1 (01.00 a 0)", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-11", name: "Aceleración 2", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-12", name: "Desaceleración 2", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-13", name: "Aceleración de JOG", unit: "s", dec: 1, min: 0.1, max: 600, def: 1 },
  { code: "01-14", name: "Desaceleración de JOG", unit: "s", dec: 1, min: 0.1, max: 600, def: 1 },
  { code: "01-15", name: "Frecuencia de JOG", unit: "Hz", dec: 2, min: 0.1, max: 600, def: 6 },
  { code: "02-00", group: "02 Operación", name: "Fuente de la frecuencia maestra", def: 1,
    options: ["0: teclado ▲▼ / UP-DOWN (02.11)", "1: AVI 0-10 V", "2: ACI 4-20 mA", "3: RS-485", "4: potenciómetro del teclado"] },
  { code: "02-01", name: "Fuente del comando de operación", def: 1,
    options: ["0: teclado", "1: bornes, STOP/RESET del teclado habilitado", "2: bornes, STOP/RESET del teclado deshabilitado", "3: RS-485, STOP/RESET del teclado habilitado", "4: RS-485, STOP/RESET del teclado deshabilitado"] },
  { code: "02-02", name: "Método de detención", def: 0,
    options: ["0: STOP en rampa, EF libre", "1: STOP libre, EF libre", "2: STOP en rampa, EF en rampa", "3: STOP libre, EF en rampa"] },
  { code: "02-04", name: "Control de dirección", def: 0, options: ["0: adelante y atrás", "1: atrás deshabilitado", "2: adelante deshabilitado"] },
  { code: "02-05", name: "Bloqueo del inicio (al energizar)", def: 1,
    options: ["0: deshabilitado", "1: habilitado", "2: deshabilitado (cambia con 02.01)", "3: habilitado (cambia con 02.01)"] },
  { code: "02-07", name: "Modo UP/DOWN (MI = 10/11)", def: 0,
    options: ["0: como las teclas ▲▼ (0,01 Hz por pulso)", "1: según la rampa 01.09/01.10", "2: velocidad constante (02.08)", "3: por pulso (02.08)"] },
  { code: "02-08", name: "Paso UP/DOWN", unit: "Hz", dec: 2, min: 0.01, max: 10, def: 0.01 },
  { code: "02-11", name: "Frecuencia del teclado (F)", unit: "Hz", dec: 2, min: 0, max: 600, def: 60 },
  { code: "02-12", name: "Frecuencia por comunicación", unit: "Hz", dec: 2, min: 0, max: 600, def: 60 },
  { code: "03-00", group: "03 Salida", name: "Relé RA/RB/RC", def: 8,
    options: ["0: sin función", "1: variador operativo", "2: frecuencia maestra alcanzada", "3: velocidad cero", "5: bloque base (bb)",
      "8: falla", "9: frecuencia deseada alcanzada (03.02)", "17: comando adelante", "18: comando atrás", "22: variador listo"] },
  { code: "03-02", name: "Frecuencia deseada", unit: "Hz", dec: 2, min: 0, max: 600, def: 0 },
  { code: "04-00", group: "04 Entradas", name: "Polarización del potenciómetro", unit: "%", dec: 1, min: 0, max: 100, def: 0 },
  { code: "04-02", name: "Ganancia del potenciómetro", unit: "%", dec: 1, min: 0.1, max: 200, def: 100 },
  { code: "04-04", name: "Modo de operación MI1/MI2", def: 0,
    options: ["0: 2 cables, MI1 adelante/parar, MI2 atrás/parar", "1: 2 cables, MI1 operar/parar, MI2 adelante/atrás", "2: 3 cables, MI1 operar, MI3 parar, MI2 sentido"] },
  { code: "04-05", name: "MI3", def: 1, options: MI_FUNCS },
  { code: "04-06", name: "MI4", def: 2, options: MI_FUNCS },
  { code: "04-07", name: "MI5", def: 3, options: MI_FUNCS },
  { code: "04-08", name: "MI6", def: 4, options: MI_FUNCS },
  { code: "04-09", name: "Contacto NA/NC (bit 0 = MI1 … bit 5 = MI6; 1 = NC)", dec: 0, min: 0, max: 63, def: 0 },
  ...Array.from({ length: 15 }, (_, i) => ({
    code: `05-${String(i).padStart(2, "0")}`, ...(i === 0 ? { group: "05 Multivelocidad" } : {}),
    name: `Velocidad ${i + 1}`, unit: "Hz", dec: 2, min: 0, max: 600, def: 0,
  })),
  ...["actual", "2.ª", "3.ª", "4.ª", "5.ª"].map((n, i) => ({
    code: `06-${String(8 + i).padStart(2, "0")}`, ...(i === 0 ? { group: "06 Protección" } : {}),
    name: `Registro de falla (${n})`, dec: 0, min: 0, max: 40, def: 0, ro: true, inspector: false,
  })),
  { code: "09-00", group: "09 Comunicación", name: "Dirección", dec: 0, min: 1, max: 254, def: 1 },
  { code: "09-01", name: "Velocidad de transmisión", def: 1, options: ["0: 4800 bps", "1: 9600 bps", "2: 19200 bps", "3: 38400 bps"] },
  { code: "09-02", name: "Tratamiento de falla de transmisión", def: 3,
    options: ["0: advertir y seguir", "1: advertir y parar en rampa", "2: advertir y parar libre", "3: sin advertencia, seguir"] },
  { code: "09-03", name: "Tiempo sin comunicación (0 = deshabilitado)", unit: "s", dec: 1, min: 0, max: 120, def: 0 },
  { code: "09-04", name: "Protocolo", def: 0,
    options: ["0: ASCII 7,N,2", "1: ASCII 7,E,1", "2: ASCII 7,O,1", "3: RTU 8,N,2", "4: RTU 8,E,1", "5: RTU 8,O,1", "6: RTU 8,N,1",
      "7: RTU 8,E,2", "8: RTU 8,O,2", "9: ASCII 7,N,1", "10: ASCII 7,E,2", "11: ASCII 7,O,2"] },
  { code: "09-07", name: "Demora de respuesta (× 2 ms)", dec: 0, min: 0, max: 200, def: 1 },
];
// Cada parámetro hereda el grupo del anterior.
{
  let g = "";
  for (const p of VFD_EL_PARAMS) p.group = g = p.group ?? g;
}
const BY_CODE = new Map(VFD_EL_PARAMS.map((p) => [p.code, p]));
const STORED = VFD_EL_PARAMS.filter((p) => !p.ro);
const codeOf = (/** @type {unknown} */ v) => Number.parseInt(String(v), 10);
const BAUDS = [4800, 9600, 19200, 38400];
const isRtu = (n) => n >= 3 && n <= 8;
/** Pr.GG.NN como dirección Modbus GGNNh. */
const addrOf = (code) => (Number(code.slice(0, 2)) << 8) | Number(code.slice(3));
const BY_ADDR = new Map(VFD_EL_PARAMS.map((p) => [addrOf(p.code), p]));

/** Valor de la escena (texto de la opción o número) → número del variador. */
function toNum(p, v) {
  if (p.options) {
    const n = codeOf(v);
    return p.options.some((o) => codeOf(o) === n) ? n : p.def;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : p.def;
}
/** Número del variador → valor de la escena (texto de la opción). */
const toScene = (p, n) => (p.options ? p.options.find((o) => codeOf(o) === n) ?? p.options[0] : n);

/** Plantillas de taller: parámetros que cambian respecto de fábrica. */
export const VFD_EL_PRESETS = [
  { id: "fabrica", label: "Valores de fábrica", description: "Como sale de la caja: marcha por bornes (MI1 adelante, MI2 atrás) y frecuencia por AVI 0-10 V (en el simulador AVI no está modelada: 0 Hz).", params: {} },
  { id: "teclado", label: "Teclado y potenciómetro", description: "RUN y STOP/RESET del teclado; el potenciómetro fija la frecuencia (0 a 60 Hz). El sentido se elige en la pantalla Frd/rEu con ▲▼.",
    params: { "02-00": 4, "02-01": 0 } },
  { id: "bornes", label: "Marcha por bornes + potenciómetro", description: "2 cables: MI1 adelante/parar, MI2 atrás/parar (selectores o salidas del PLC a DCM); el potenciómetro fija la frecuencia; relé de falla en RA-RC.",
    params: { "02-00": 4, "02-01": 1 } },
  { id: "multivelocidad", label: "Multivelocidad por PLC", description: "MI1/MI2 marcha y sentido; MI3-MI5 eligen las velocidades 1 a 7 (10, 20, 30, 40, 50, 55 y 60 Hz); sin ninguna, el potenciómetro. MI6 reset. Rampas de 5 s.",
    params: { "02-00": 4, "02-01": 1, "04-08": 5, "05-00": 10, "05-01": 20, "05-02": 30, "05-03": 40, "05-04": 50, "05-05": 55, "05-06": 60, "01-09": 5, "01-10": 5 } },
  { id: "tres-cables", label: "Marcha/paro con pulsadores (3 cables)", description: "MI1 operar (pulsador NA), MI3 parar (pulsador NC), MI2 sentido; el potenciómetro fija la frecuencia.",
    params: { "02-00": 4, "02-01": 1, "04-04": 2 } },
  { id: "motopot", label: "Motopotenciómetro (UP/DOWN)", description: "MI1/MI2 marcha y sentido; MI3 sube y MI4 baja la frecuencia mientras se mantienen (según la rampa); la frecuencia queda en 02.11.",
    params: { "02-00": 0, "02-01": 1, "02-07": 1, "04-05": 10, "04-06": 11, "02-11": 0 } },
  { id: "modbus", label: "Modbus RTU con el JWPLC", description: "Marcha y frecuencia por RS-485: dirección 1, 9600 bps, RTU 8,N,1. 2000H operar/sentido, 2001H frecuencia × 100. STOP/RESET del teclado habilitado; MI6 falla externa. Parada en rampa si se pierde la comunicación 3 s.",
    params: { "02-00": 3, "02-01": 3, "09-00": 1, "09-01": 1, "09-04": 6, "04-08": 14, "09-02": 1, "09-03": 3 } },
];

/** Códigos de falla del registro 2100H y de Pr.06.08 (manual, Lista de direcciones). */
export const VFD_EL_FAULTS = { EF: 8 };

const MI = ["MI1", "MI2", "MI3", "MI4", "MI5", "MI6"];
const KEYS = ["run", "stop", "mode", "enter", "up", "down"];
/** Valor en los 3 dígitos tras la letra («F60.0», «H5.00», «U180»). */
function f3(v) {
  const a = Math.abs(v);
  if (a < 9.995) return a.toFixed(2);
  if (a < 99.95) return a.toFixed(1);
  return String(Math.round(a));
}
const PAGES = ["F", "H", "A", "U", "dir", "sel"];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const vfdEl = {
  type: "jwsim/vfd-el",
  version: "1.1.0",
  name: "Variador Delta VFD-EL",
  category: "Actuadores",
  description:
    "Variador de frecuencia Delta VFD007EL21A (estructura A: entrada monofásica 220 V en R/L1-S/L2, salida trifásica 220 V en U/T1 V/T2 W/T3, 0,75 kW). Se programa como el real: con el teclado (MODE recorre F, H, A, U, Frd/rEu y la selección de parámetros GG.NN; ENTER entra y guarda; ▲▼ cambian) o desde este inspector, y por Modbus (dirección GGNNH = Pr.GG.NN). El potenciómetro fija la frecuencia si 02.00 = 4. Entradas MI en modo NPN: se activan al unirlas a DCM. Relé RA/RB/RC según 03.00. Modbus por el puerto RS-485 (SG+/SG-): 2000H operar/sentido, 2001H frecuencia × 100, 2002H EF/reset; 2100H falla, 2101H estado, 2102H-2109H monitoreo. Elija una plantilla de taller para empezar.",
  parameters: [
    ...VFD_EL_PARAMS.filter((p) => p.inspector !== false).map((p) => ({
      id: p.code,
      label: `${p.code.replace("-", ".")} ${p.name}`,
      group: p.group,
      ...(p.options
        ? { type: /** @type {const} */ ("enum"), options: p.options, default: toScene(p, p.def) }
        : { type: /** @type {const} */ ("number"), default: p.def, unit: p.unit, hint: `${p.min} a ${p.max}` }),
    })),
    { id: "pot", label: "Potenciómetro del teclado", group: "Teclado", type: "number", default: 0, unit: "%", hint: "0 a 100; se gira en el símbolo" },
  ],
  presets: VFD_EL_PRESETS.map((pr) => ({
    id: pr.id, label: pr.label, description: pr.description, keep: ["pot"],
    params: Object.fromEntries(Object.entries(pr.params).map(([k, n]) => [k, toScene(BY_CODE.get(k), n)])),
  })),
  terminals: [
    { id: "R", label: "R/L1" }, { id: "S", label: "S/L2" }, { id: "PE", label: "PE (tierra)" },
    { id: "U", label: "U/T1" }, { id: "V", label: "V/T2" }, { id: "W", label: "W/T3" },
    { id: "RA", label: "RA (NA)" }, { id: "RB", label: "RB (NC)" }, { id: "RC", label: "RC (común)" },
    { id: "+24V" }, ...MI.map((id) => ({ id })), { id: "DCM", label: "DCM (común)" },
    { id: "SG+", label: "SG+ (RS-485)" }, { id: "SG-", label: "SG- (RS-485)" },
  ],
  actions: [
    { id: "run", label: "RUN", kind: "momentary" },
    { id: "stop", label: "STOP/RESET", kind: "momentary" },
    { id: "mode", label: "MODE", kind: "momentary" },
    { id: "enter", label: "ENTER", kind: "momentary" },
    { id: "up", label: "▲", kind: "momentary" },
    { id: "down", label: "▼", kind: "momentary" },
    { id: "pot", label: "Potenciómetro", kind: "value", min: 0, max: 100, unit: "%" },
  ],
  modbus: (p) => ({
    address: Number(p["09-00"]) || 1, baud: BAUDS[codeOf(p["09-01"])] ?? 9600,
    responseMs: Math.max(1, 2 * Number(p["09-07"] ?? 1)), a: "SG+", b: "SG-",
  }),
  electrical: () => ({
    sources: [
      // 24 V interna para las entradas MI (solo con el variador alimentado).
      { id: "dc", pos: "+24V", neg: "DCM", kind: "DC", volts: 24, controlled: true },
      { id: "out", kind: "AC3", volts: 220, phases: { L1: "U", L2: "V", L3: "W" }, controlled: true },
    ],
    loads: [
      { id: "input", a: "R", b: "S", rating: "230VAC" },
      ...MI.map((id) => ({ id, a: "+24V", b: id, rating: "24VDC" })),
    ],
    contacts: { "RA-RC": ["RA", "RC"], "RB-RC": ["RB", "RC"] },
  }),
  create(ctx) {
    /** Parámetros vivos (números del variador). @type {Record<string, number>} */
    const P = {};
    const factory = (hz50 = false) => {
      for (const p of VFD_EL_PARAMS) if (!p.ro) P[p.code] = p.def;
      if (hz50) {
        P["01-00"] = 50;
        P["01-01"] = 50;
      }
    };
    factory();
    for (const p of VFD_EL_PARAMS) P[p.code] ??= p.def;
    for (const p of STORED) if (p.code in ctx.params) P[p.code] = toNum(p, ctx.params[p.code]);
    const pot0 = Number(ctx.params.pot ?? 0);
    let pot = pot0;
    let edits = 0;          // cambios hechos en el equipo (teclado, Modbus): se guardan en la escena

    const hz = new Ramp(0); // frecuencia con signo (negativa: atrás)
    let powered = false;
    let fault = "";
    let mb = { run: false, rev: false, jog: false, r2: false, reset: false, ef: false };
    let lastComm = /** @type {bigint} */ (0n), commLost = false, coastComm = false;
    let powerOnT = /** @type {bigint | null} */ (null);
    let keyRun = false, keyRev = false;    // marcha y sentido del teclado (02.01 = 0)
    let stopLatch = false;                 // STOP del teclado, falla o bloqueo del inicio: espera que se quite la orden
    let wire3 = false;                     // 3 cables: operación retenida
    let prevMI = /** @type {Record<string, boolean>} */ ({});
    let prevKeys = /** @type {Record<string, boolean>} */ ({});
    // UP/DOWN por las entradas (02.07 = 1 o 2): cada 100 ms mientras se mantienen.
    let updn = /** @type {{ dir: number, next: bigint } | null} */ (null);
    // Interfaz del teclado.
    let page = "F";
    let si = 0, edit = 0;                  // parámetro seleccionado y valor en edición
    let msg = "", msgUntil = /** @type {bigint | null} */ (null);
    /** @type {{ key: string, since: bigint, next: bigint } | null} */
    let hold = null;
    let regs = { status: 0, fRef: 0, fOut: 0, vOut: 0 };
    let last = { fRef: 0, rev: false, going: false, outOn: false, fOut: 0 };

    const fmax = () => P["01-00"];
    const startPage = () => ["F", "H", "A", "U", "dir"][P["00-03"]] ?? "F";
    const flash = (t, text) => {
      msg = text;
      msgUntil = t + ms(1000);
    };
    const locked = () => P["00-02"] === 1;
    /** Guarda un parámetro (teclado o Modbus). false: valor o parámetro inválido. */
    const commit = (code, n, viaLock = false) => {
      const p = BY_CODE.get(code);
      if (!p || p.ro) return false;
      if (p.options ? !p.options.some((o) => codeOf(o) === n) : n < p.min - 1e-9 || n > p.max + 1e-9) return false;
      if (code !== "00-02" && (locked() || viaLock)) return false;
      if (code === "00-02" && (n === 9 || n === 10)) factory(n === 9);
      else P[code] = p.options ? n : Number(n.toFixed(p.dec ?? 0));
      edits++;
      return true;
    };
    const setKeyF = (f) => {
      const v = Math.min(fmax(), Math.max(0, Math.round(f * 100) / 100));
      if (v !== P["02-11"]) {
        P["02-11"] = v;
        edits++;
      }
    };

    /** Una pulsación (o repetición) de tecla del teclado. */
    function key(t, k, mult, lockKeys) {
      if (k === "mode") {
        msg = "";
        page = page === "val" ? "sel" : PAGES[(PAGES.indexOf(page) + 1) % PAGES.length];
        return;
      }
      if (k === "enter") {
        if (page === "sel") {
          page = "val";
          edit = P[VFD_EL_PARAMS[si].code];
        } else if (page === "val") {
          flash(t, commit(VFD_EL_PARAMS[si].code, edit, lockKeys) ? "End" : "Err");
          page = "sel";
        }
        return;
      }
      const s = k === "up" ? 1 : -1;
      if (page === "F" && P["02-00"] === 0) setKeyF(P["02-11"] + s * 0.01 * mult);
      else if (page === "dir") keyRev = s < 0;
      else if (page === "sel") si = (si + s * Math.min(mult, 1) + VFD_EL_PARAMS.length) % VFD_EL_PARAMS.length;
      else if (page === "val") {
        const p = VFD_EL_PARAMS[si];
        if (p.ro) return;
        if (p.options) {
          const codes = p.options.map(codeOf);
          edit = codes[(codes.indexOf(edit) + s + codes.length) % codes.length];
        } else {
          const k10 = 10 ** (p.dec ?? 0);
          edit = Math.min(p.max, Math.max(p.min, Math.round((edit + (s * mult) / k10) * k10) / k10));
        }
      }
    }

    function display(going, seg) {
      if (!powered) return "";
      if (msg) return msg;
      if (fault) return fault;
      if (commLost && P["09-02"] !== 3) return "CE10";
      if (page === "F") return `F${f3(last.fRef)}`;
      if (page === "H") return `H${f3(seg.value)}`;
      if (page === "A") return last.outOn ? "A---" : "A0.0";   // la corriente no se modela
      if (page === "U") return `U${f3(last.fRef * P["00-05"])}`;
      if (page === "dir") return (going ? seg.value < 0 || (seg.value === 0 && last.rev) : keyRev) ? "rEu" : "Frd";
      const p = VFD_EL_PARAMS[si];
      if (page === "sel") return p.code.replace("-", ".");
      return p.options || p.ro ? String(edit) : edit.toFixed(p.dec ?? 0);
    }

    return {
      update(t, inp) {
        const wasPowered = powered;
        powered = inp.loads.input.on;
        if (!powered) {
          page = startPage();
          msg = "";
          hold = null;
          updn = null;
          wire3 = false;
          keyRun = false;
        } else if (!wasPowered) {
          page = startPage();
          lastComm = t;
          commLost = false;
          powerOnT = t;
        }
        if (msgUntil !== null && t >= msgUntil) {
          msg = "";
          msgUntil = null;
        }
        // Entradas MI (NPN; 04.09 las invierte a NC) y sus funciones.
        const mode = P["04-04"];
        const mi = Object.fromEntries(MI.map((id, i) => {
          const raw = powered && !!inp.loads[id]?.on;
          const nc = (P["04-09"] >> i) & 1 && !(mode === 2 && i < 3);
          return [id, powered && (nc ? !raw : raw)];
        }));
        const fnIds = (f) => ["MI3", "MI4", "MI5", "MI6"].filter((id, i) => P[`04-0${5 + i}`] === f && !(mode === 2 && id === "MI3"));
        const fn = (f) => fnIds(f).some((id) => mi[id]);
        const fnEdge = (f) => fnIds(f).some((id) => mi[id] && !prevMI[id]);
        // Fuente de la operación: 02.01, o la que fuerzan las entradas 18/19.
        const src = fn(19) ? 0 : fn(18) ? 1 : P["02-01"];
        const keyStopOk = src === 0 || src === 1 || src === 3;
        const lockKeys = fn(17);

        // Teclas: flanco de subida; ▲▼ se repiten al mantenerlas (más rápido con el tiempo).
        const keys = Object.fromEntries(KEYS.map((k) => [k, powered && !!inp.actions[k]]));
        let stopKey = false, runKey = false, resetKey = false;
        for (const k of KEYS) {
          if (!keys[k] || prevKeys[k]) continue;
          if (k === "run") runKey = true;
          else if (k === "stop") {
            if (!keyStopOk) continue;
            if (fault) resetKey = true;
            else stopKey = true;
          } else {
            key(t, k, 1, lockKeys);
            if (k === "up" || k === "down") hold = { key: k, since: t, next: t + ms(500) };
          }
        }
        if (hold && !keys[hold.key]) hold = null;
        while (hold && t >= hold.next) {
          const held = Number(hold.next - hold.since) / 1e9;
          key(t, hold.key, held > 3 ? 100 : held > 1.5 ? 10 : 1, lockKeys);
          hold.next += ms(100);
        }
        prevKeys = keys;
        pot = Math.max(0, Math.min(100, Number(inp.actions.pot ?? pot)));

        // Fallas: EF (MI = 14 o 2002H bit 0); reset por la tecla, MI = 5 o 2002H bit 1.
        if ((fn(14) || mb.ef) && fault !== "EF") {
          fault = "EF";
          for (let i = 12; i > 8; i--) P[`06-${String(i).padStart(2, "0")}`] = P[`06-${String(i - 1).padStart(2, "0")}`];
          P["06-08"] = VFD_EL_FAULTS.EF;
        }
        if ((fnEdge(5) || resetKey || mb.reset) && !fn(14) && !mb.ef) fault = "";
        mb.reset = false;

        // UP/DOWN por las entradas (02.07).
        const up = fn(10), down = fn(11);
        const ud = up && !down ? 1 : down && !up ? -1 : 0;
        if (P["02-07"] === 0 || P["02-07"] === 3) {
          const step = P["02-07"] === 0 ? 0.01 : P["02-08"];
          if (fnEdge(10) && !down) setKeyF(P["02-11"] + step);
          if (fnEdge(11) && !up) setKeyF(P["02-11"] - step);
          updn = null;
        } else if (!ud) updn = null;
        else {
          if (!updn || updn.dir !== ud) updn = { dir: ud, next: t + ms(100) };
          while (t >= updn.next) {
            const rate = P["02-07"] === 1 ? fmax() / P[ud > 0 ? "01-09" : "01-10"] : P["02-08"] * 10;   // Hz/s
            setKeyF(P["02-11"] + ud * rate * 0.1);
            updn.next += ms(100);
          }
        }

        // Comando de operación según la fuente.
        let wantRun = false, wantRev = false, jog = false;
        if (src === 0) {
          if (runKey) keyRun = true;
          if (stopKey) keyRun = false;
          wantRun = keyRun;
          wantRev = keyRev;
        } else if (src === 1 || src === 2) {
          if (mode === 0) {
            wantRun = mi.MI1 !== mi.MI2;
            wantRev = mi.MI2 && !mi.MI1;
          } else if (mode === 1) {
            wantRun = mi.MI1;
            wantRev = mi.MI2;
          } else {
            // 3 cables: MI3 es el paro (abierto = parar); MI1 da la operación con un pulso.
            if (!mi.MI3) wire3 = false;
            else if (mi.MI1 && !prevMI.MI1) wire3 = true;
            wantRun = wire3;
            wantRev = mi.MI2;
          }
        } else {
          // Sin comunicación por más de 09.03: 09.02 decide.
          const lost = P["09-03"] > 0 && t - lastComm >= ms(P["09-03"] * 1000);
          if (lost && !commLost) {
            commLost = true;
            if (P["09-02"] === 1 || P["09-02"] === 2) {
              mb.run = false;
              coastComm = P["09-02"] === 2;
            }
          }
          wantRun = mb.run;
          wantRev = mb.rev;
          jog = mb.jog && mb.run;
        }
        if (fn(8) && !wantRun) {
          jog = true;
          wantRev = false;
        }
        prevMI = mi;
        if (stopKey && (src === 1 || src === 3)) stopLatch = true;
        if (!wantRun && !jog) stopLatch = false;
        // Bloqueo del inicio (02.05 = 1 o 3): con la orden presente al energizar
        // (en el mismo instante, cuando la 24 V interna llega a las MI), no arranca.
        if (P["02-05"] % 2 === 1 && t === powerOnT && (wantRun || jog)) stopLatch = true;
        if (fault) {
          // La falla corta la operación: hay que quitar la orden y darla de nuevo.
          stopLatch = true;
          keyRun = false;
          wire3 = false;
        }
        const blocked = (wantRev && P["02-04"] === 1) || (!wantRev && P["02-04"] === 2);
        const bb = fn(9) || fn(16);
        const going = powered && !fault && !bb && (wantRun || jog) && !stopLatch && !blocked;
        if (going) coastComm = false;

        // Frecuencia: 02.00, multivelocidad (05.00-05.14) y JOG (01.15); límites 01.07/01.08 y Fmin 01.05.
        const step = (fn(1) ? 1 : 0) + (fn(2) ? 2 : 0) + (fn(3) ? 4 : 0) + (fn(4) ? 8 : 0);
        const fs = P["02-00"];
        const potF = (fmax() * Math.max(0, Math.min(100, (pot * P["04-02"]) / 100 + P["04-00"]))) / 100;
        const master = fs === 0 ? P["02-11"] : fs === 3 ? P["02-12"] : fs === 4 ? potF : 0;
        const aviso = powered && (fs === 1 || fs === 2) ? "02.00 = AVI/ACI: entrada analógica no modelada (0 Hz)" : "";
        let fRef = jog ? P["01-15"] : step > 0 ? P[`05-${String(step - 1).padStart(2, "0")}`] : master;
        fRef = Math.min(fRef, fmax(), (fmax() * P["01-07"]) / 100);
        const fCmd = Math.max(fRef, (fmax() * P["01-08"]) / 100);
        const fRun = fCmd < P["01-05"] ? 0 : fCmd;     // bajo la mínima: no sale tensión
        const target = going ? (wantRev ? -fRun : fRun) : 0;

        // Rampa (01.09/01.10, 01.11/01.12 con MI = 7 o 2000H bit 6, JOG 01.13/01.14); al invertir, primero a 0.
        const cur = hz.at(t);
        const goal = fn(6) ? cur : cur !== 0 && Math.sign(target) === -Math.sign(cur) ? 0 : target;
        const up2 = Math.abs(goal) > Math.abs(cur);
        const r2 = fn(7) || (src >= 3 && mb.r2);
        const time = jog ? P[up2 ? "01-13" : "01-14"] : up2 ? P[r2 ? "01-11" : "01-09"] : P[r2 ? "01-12" : "01-10"];
        const stopFree = P["02-02"] === 1 || P["02-02"] === 3;
        const efRamp = P["02-02"] >= 2;
        const coast = !powered || bb || coastComm || (!!fault && !efRamp) || (!going && !fault && stopFree);
        if (coast) hz.set(t, 0);   // salida cortada: el motor sigue por inercia
        else hz.step(t, goal, fmax() / Math.max(0.01, time));
        const seg = hz.segment(t);
        const fOut = Math.abs(seg.value);
        const outOn = !coast && (seg.value !== 0 || going);
        const reached = going && seg.rate === 0 && fOut === Math.abs(target) && target !== 0;
        const rev = seg.value < 0 || (seg.value === 0 && target < 0);
        const relay = {
          1: outOn && fOut > 0, 2: reached, 3: powered && fOut < P["01-05"], 5: powered && bb, 8: !!fault,
          9: outOn && fOut >= P["03-02"] && P["03-02"] > 0, 17: going && !wantRev, 18: going && wantRev, 22: powered && !fault,
        }[P["03-00"]] ?? false;
        last = { fRef: fCmd, rev, going, outOn, fOut };
        const decel = outOn && !going;
        regs = {
          status: (outOn ? (going ? 0b11 : 0b01) : going ? 0b10 : 0) | (jog ? 0b100 : 0) | (rev ? 0b11 << 3 : 0) |
            (fs === 3 ? 1 << 8 : 0) | (fs === 1 || fs === 2 ? 1 << 9 : 0) | (src >= 3 ? 1 << 10 : 0),
          fRef: Math.round(fCmd * 100),
          fOut: Math.round(fOut * 100),
          vOut: Math.round(Math.min(P["01-02"], (P["01-02"] * fOut) / Math.max(0.1, P["01-01"])) * 10),
        };
        const commDue = src >= 3 && P["09-03"] > 0 && !commLost && powered ? lastComm + ms(P["09-03"] * 1000) : undefined;
        return {
          sources: {
            dc: { on: powered },
            out: { on: outOn, reverse: rev, hz: { value: fOut, rate: Math.sign(seg.value || target) * seg.rate, goal: Math.abs(goal) } },
          },
          contacts: { "RA-RC": relay, "RB-RC": !relay },
          outputs: {
            powered,
            running: outOn,
            hz: { value: seg.value, rate: seg.rate },
            fRef: fCmd,
            direction: rev ? -1 : outOn ? 1 : 0,
            fault,
            lcd: display(going, seg),
            ledRun: powered && outOn,
            ledStop: powered && (!outOn || decel),
            ledFwd: powered && !rev,
            ledRev: powered && rev,
            pot,
            aviso,
            ...Object.fromEntries(KEYS.map((k) => [`k_${k}`, keys[k]])),
          },
          // Lo programado en el equipo se guarda en la escena.
          ...(edits || pot !== pot0
            ? { params: { ...Object.fromEntries(STORED.map((p) => [p.code, toScene(p, P[p.code])])), pot } }
            : {}),
          nextEventNs: earliest(hz.next, msgUntil ?? undefined, hold?.next, updn?.next, commDue),
        };
      },
      modbusConfig: () => ({ address: P["09-00"], baud: BAUDS[P["09-01"]] ?? 9600, responseMs: Math.max(1, 2 * P["09-07"]) }),
      modbusRead(_table, start, count, t) {
        if (!powered || !isRtu(P["09-04"])) return undefined;   // apagado o en ASCII: no responde a RTU
        lastComm = t ?? lastComm;
        commLost = false;
        const st = {
          0x2100: fault ? VFD_EL_FAULTS[fault] ?? 1 : 0, 0x2101: regs.status, 0x2102: regs.fRef, 0x2103: regs.fOut,
          0x2104: 0, 0x2108: 3110, 0x2109: regs.vOut, 0x210a: 30,
        };
        // Un parámetro por lectura (manual: con 03H se lee un único parámetro por vez).
        const p = BY_ADDR.get(start);
        if (p && count === 1) return [Math.round(P[p.code] * 10 ** (p.options ? 0 : p.dec ?? 0))];
        const out = [];
        for (let a = start; a < start + count; a++) {
          if (!(a in st)) {
            if (t !== undefined) flash(t, "CE02");
            return null;
          }
          out.push(st[a]);
        }
        return out;
      },
      modbusWrite(start, vals, t) {
        if (!powered || !isRtu(P["09-04"])) return undefined;
        lastComm = t ?? lastComm;
        commLost = false;
        for (let k = 0; k < vals.length; k++) {
          const a = start + k;
          const v = vals[k];
          if (a === 0x2000) {
            const cmd = v & 0b11;
            if (cmd === 0b01) {
              mb.run = false;
              mb.jog = false;
            } else if (cmd === 0b10 || cmd === 0b11) {
              mb.run = true;
              mb.jog = cmd === 0b11;
            }
            const dir = (v >> 4) & 0b11;
            if (dir === 0b01) mb.rev = false;
            else if (dir === 0b10) mb.rev = true;
            else if (dir === 0b11) mb.rev = !mb.rev;
            mb.r2 = ((v >> 6) & 0b11) === 0b01;
          } else if (a === 0x2001) {
            const f = Math.min(600, v / 100);
            if (f !== P["02-12"]) {
              P["02-12"] = f;
              edits++;
            }
          } else if (a === 0x2002) {
            mb.ef = !!(v & 0b1);
            if (v & 0b10) mb.reset = true;
          } else {
            const p = BY_ADDR.get(a);
            if (!p) {
              if (t !== undefined) flash(t, "CE02");
              return 2;
            }
            if (!commit(p.code, p.options ? v : v / 10 ** (p.dec ?? 0))) {
              if (t !== undefined) flash(t, "CE03");
              return 3;
            }
          }
        }
        return true;
      },
    };
  },
};
