// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Variador de frecuencia Delta VFD-EL (VFD007EL21A: entrada monofásica 220 V,
// salida trifásica 220 V, 0,75 kW) programable como el real: tabla de
// parámetros por grupos (00-xx a 09-xx), teclado con pantalla LED (MODE,
// ENTER, ▲, ▼, RUN, STOP/RESET), perilla de frecuencia, entradas MI1-MI6,
// relé RA/RB/RC y Modbus RTU. Trae plantillas de taller que dejan el equipo
// listo para un uso típico.
//
// Códigos, rangos y valores de fábrica según la serie Delta VFD-E/EL;
// pendientes de contrastar con el manual del VFD-EL (marcados en
// docs/ARCHITECTURE.md). Lo que se programa en el teclado o por Modbus queda
// en la escena (el variador lo guarda como en su memoria).

import { Ramp, earliest, ms } from "../device-kit.mjs";

/** Funciones de las entradas multifunción MI3-MI6 (04-05 a 04-08). */
const MI_FUNCS = [
  "0: sin función", "1: multivelocidad 1", "2: multivelocidad 2", "3: multivelocidad 3", "4: multivelocidad 4",
  "5: reset externo", "6: retener rampa", "7: rampa 2 (01-11/01-12)", "8: JOG", "9: bloqueo externo (bb)", "14: falla externa (EF)",
];

/**
 * @typedef {{ code: string, group?: string, name: string, unit?: string, dec?: number, min?: number, max?: number,
 *   def: number, options?: string[], hidden?: boolean }} VfdParam
 */

/** Tabla de parámetros del VFD-EL implementados (código Delta GG-NN). @type {VfdParam[]} */
export const VFD_EL_PARAMS = [
  { code: "00-02", group: "00 Usuario", name: "Restablecer (10 = fábrica)", dec: 0, min: 0, max: 10, def: 0, hidden: true },
  { code: "00-03", group: "00 Usuario", name: "Pantalla al encender", def: 0, options: ["0: F (frecuencia de referencia)", "1: H (frecuencia de salida)", "2: Frd/rEu (sentido)"] },
  { code: "01-00", group: "01 Básicos", name: "Frecuencia máxima", unit: "Hz", dec: 2, min: 50, max: 600, def: 60 },
  { code: "01-01", name: "Frecuencia base (tensión máxima)", unit: "Hz", dec: 2, min: 0.1, max: 600, def: 60 },
  { code: "01-02", name: "Tensión máxima de salida", unit: "V", dec: 1, min: 0.1, max: 255, def: 220 },
  { code: "01-09", name: "Aceleración 1 (0 a 01-00)", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-10", name: "Desaceleración 1 (01-00 a 0)", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-11", name: "Aceleración 2", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-12", name: "Desaceleración 2", unit: "s", dec: 1, min: 0.1, max: 600, def: 10 },
  { code: "01-13", name: "Rampa de JOG", unit: "s", dec: 1, min: 0.1, max: 600, def: 1 },
  { code: "01-14", name: "Frecuencia de JOG", unit: "Hz", dec: 2, min: 0, max: 600, def: 6 },
  { code: "02-00", group: "02 Operación", name: "Fuente de frecuencia", def: 1,
    options: ["0: teclado ▲▼", "1: AVI 0-10 V", "2: ACI 4-20 mA", "3: RS-485 (Modbus)", "4: perilla del teclado"] },
  { code: "02-01", name: "Fuente de la orden de marcha", def: 0,
    options: ["0: teclado (RUN/STOP)", "1: bornes, STOP del teclado activo", "2: bornes, STOP del teclado inactivo", "3: RS-485, STOP del teclado activo", "4: RS-485, STOP del teclado inactivo"] },
  { code: "02-02", name: "Método de parada", def: 0, options: ["0: rampa", "1: libre (por inercia)"] },
  { code: "02-04", name: "Sentidos permitidos", def: 0, options: ["0: adelante y atrás", "1: atrás bloqueado", "2: adelante bloqueado"] },
  { code: "03-00", group: "03 Salida", name: "Relé RA/RB/RC", def: 8,
    options: ["0: sin función", "1: en marcha", "2: frecuencia alcanzada", "3: velocidad cero", "8: falla"] },
  { code: "04-04", group: "04 Entradas", name: "MI1/MI2: modo de marcha", def: 0,
    options: ["0: 2 hilos, MI1 adelante, MI2 atrás", "1: 2 hilos, MI1 marcha, MI2 sentido", "2: 3 hilos, MI1 marcha, MI3 paro, MI2 sentido"] },
  { code: "04-05", name: "MI3", def: 1, options: MI_FUNCS },
  { code: "04-06", name: "MI4", def: 2, options: MI_FUNCS },
  { code: "04-07", name: "MI5", def: 3, options: MI_FUNCS },
  { code: "04-08", name: "MI6", def: 4, options: MI_FUNCS },
  ...Array.from({ length: 15 }, (_, i) => ({
    code: `05-${String(i).padStart(2, "0")}`, ...(i === 0 ? { group: "05 Multivelocidad" } : {}),
    name: `Velocidad ${i + 1}`, unit: "Hz", dec: 2, min: 0, max: 600, def: 0,
  })),
  { code: "09-00", group: "09 Comunicación", name: "Dirección Modbus", dec: 0, min: 1, max: 247, def: 1 },
  { code: "09-01", name: "Velocidad", def: 1, options: ["0: 4800 bps", "1: 9600 bps", "2: 19200 bps", "3: 38400 bps"] },
  { code: "09-04", name: "Protocolo", def: 0,
    options: ["0: ASCII 7,N,2", "1: ASCII 7,E,1", "2: ASCII 7,O,1", "3: RTU 8,N,2", "4: RTU 8,E,1", "5: RTU 8,O,1"] },
];
// Cada parámetro hereda el grupo del anterior.
{
  let g = "";
  for (const p of VFD_EL_PARAMS) p.group = g = p.group ?? g;
}
const BY_CODE = new Map(VFD_EL_PARAMS.map((p) => [p.code, p]));
const GROUPS = [...new Set(VFD_EL_PARAMS.filter((p) => !p.hidden).map((p) => p.code.slice(0, 2)))];
const codeOf = (/** @type {unknown} */ v) => Number.parseInt(String(v), 10);
const BAUDS = [4800, 9600, 19200, 38400];

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
  { id: "fabrica", label: "Valores de fábrica", description: "Como sale de la caja: marcha con RUN/STOP del teclado y frecuencia por AVI (en el simulador AVI no está modelada: 0 Hz).", params: {} },
  { id: "teclado", label: "Teclado y perilla", description: "RUN/STOP del teclado; la perilla fija la frecuencia (0 a 60 Hz). Sentido en la pantalla Frd/rEu.",
    params: { "02-00": 4, "02-01": 0 } },
  { id: "bornes", label: "Marcha por bornes + perilla", description: "2 hilos: MI1 adelante, MI2 atrás (pulsadores con retención o salidas del PLC a DCM); la perilla fija la frecuencia; relé de falla en RA-RC.",
    params: { "02-00": 4, "02-01": 1, "04-04": 0, "03-00": 8 } },
  { id: "multivelocidad", label: "Multivelocidad por PLC", description: "MI1/MI2 marcha y sentido; MI3-MI5 eligen las velocidades 1 a 7 (10, 20, 30, 40, 50, 55 y 60 Hz); sin ninguna, la perilla. MI6 reset. Rampas de 5 s.",
    params: { "02-00": 4, "02-01": 1, "04-04": 0, "04-05": 1, "04-06": 2, "04-07": 3, "04-08": 5, "05-00": 10, "05-01": 20, "05-02": 30, "05-03": 40, "05-04": 50, "05-05": 55, "05-06": 60, "01-09": 5, "01-10": 5, "03-00": 8 } },
  { id: "tres-hilos", label: "Marcha/paro con pulsadores (3 hilos)", description: "MI1 marcha (pulsador NA), MI3 paro (pulsador NC), MI2 sentido; la perilla fija la frecuencia.",
    params: { "02-00": 4, "02-01": 1, "04-04": 2 } },
  { id: "modbus", label: "Modbus RTU con el JWPLC", description: "Marcha y frecuencia por RS-485 (SG+/SG-): dirección 1, 9600 bps, RTU 8,N,2. 2000h marcha/sentido, 2001h frecuencia × 100. STOP del teclado activo; MI6 falla externa.",
    params: { "02-00": 3, "02-01": 3, "09-00": 1, "09-01": 1, "09-04": 3, "04-08": 14 } },
];

/** Códigos de falla del registro 2100h (serie E/EL; verificar con el manual del VFD-EL). */
export const VFD_EL_FAULTS = { EF: 8 };

const MI = ["MI1", "MI2", "MI3", "MI4", "MI5", "MI6"];
const KEYS = ["run", "stop", "mode", "enter", "up", "down"];
const fmt = (v, dec) => v.toFixed(dec);

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const vfdEl = {
  type: "jwsim/vfd-el",
  version: "1.0.0",
  name: "Variador Delta VFD-EL",
  category: "Actuadores",
  description:
    "Variador de frecuencia Delta VFD007EL21A (entrada monofásica 220 V en R/L1-S/L2, salida trifásica 220 V en U/T1 V/T2 W/T3, 0,75 kW). Se programa como el real: con el teclado (MODE recorre F, H, Frd/rEu y los grupos de parámetros; ENTER entra y guarda; ▲▼ cambian) o desde este inspector, y por Modbus (dirección 0GNNh = parámetro GG-NN). La perilla del teclado fija la frecuencia si 02-00 = 4. Entradas MI en modo NPN: se activan al unirlas a DCM. Relé RA/RB/RC según 03-00. Modbus RTU en SG+/SG-: 2000h marcha/sentido, 2001h frecuencia × 100, 2002h reset; 2100h-2106h estado. Elija una plantilla de taller para empezar.",
  parameters: [
    ...VFD_EL_PARAMS.filter((p) => !p.hidden).map((p) => ({
      id: p.code,
      label: `${p.code} ${p.name}`,
      group: p.group,
      ...(p.options
        ? { type: /** @type {const} */ ("enum"), options: p.options, default: toScene(p, p.def) }
        : { type: /** @type {const} */ ("number"), default: p.def, unit: p.unit, hint: `${p.min} a ${p.max}` }),
    })),
    { id: "fTeclado", label: "F del teclado (02-00 = 0)", group: "Teclado", type: "number", default: 60, unit: "Hz" },
    { id: "pot", label: "Perilla", group: "Teclado", type: "number", default: 0, unit: "%", hint: "0 a 100; se gira en el símbolo" },
  ],
  presets: VFD_EL_PRESETS.map((pr) => ({
    id: pr.id, label: pr.label, description: pr.description, keep: ["pot", "fTeclado"],
    params: Object.fromEntries(Object.entries(pr.params).map(([k, n]) => [k, toScene(BY_CODE.get(k), n)])),
  })),
  terminals: [
    { id: "R", label: "R/L1" }, { id: "S", label: "S/L2" }, { id: "PE", label: "PE (tierra)" },
    { id: "RA" }, { id: "RB" }, { id: "RC" },
    { id: "SG+", label: "SG+ (RS-485)" }, { id: "SG-", label: "SG- (RS-485)" },
    { id: "U", label: "U/T1" }, { id: "V", label: "V/T2" }, { id: "W", label: "W/T3" },
    ...MI.map((id) => ({ id })), { id: "DCM", label: "DCM (común)" }, { id: "+24V" },
  ],
  actions: [
    { id: "run", label: "RUN", kind: "momentary" },
    { id: "stop", label: "STOP/RESET", kind: "momentary" },
    { id: "mode", label: "MODE", kind: "momentary" },
    { id: "enter", label: "ENTER", kind: "momentary" },
    { id: "up", label: "▲", kind: "momentary" },
    { id: "down", label: "▼", kind: "momentary" },
    { id: "pot", label: "Perilla", kind: "value", min: 0, max: 100, unit: "%" },
  ],
  modbus: (p) => ({ address: Number(p["09-00"]) || 1, baud: BAUDS[codeOf(p["09-01"])] ?? 9600, responseMs: 5, a: "SG+", b: "SG-" }),
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
    const factory = () => {
      for (const p of VFD_EL_PARAMS) P[p.code] = p.def;
    };
    factory();
    for (const p of VFD_EL_PARAMS) if (p.code in ctx.params) P[p.code] = toNum(p, ctx.params[p.code]);
    P["00-02"] = 0;
    let fKey = Number(ctx.params.fTeclado ?? 60);
    const pot0 = Number(ctx.params.pot ?? 0);
    let pot = pot0;
    let edits = 0;          // cambios hechos en el equipo (teclado, Modbus): se guardan en la escena
    /** @type {Record<string, unknown> | undefined} */
    let saved;

    const hz = new Ramp(0); // frecuencia con signo (negativa: atrás)
    let powered = false;
    let fault = "";
    let mbRun = false, mbRev = false, mbF = 0, mbReset = false, mbEF = false, mbBB = false;
    let keyRun = false, keyRev = false;    // marcha y sentido del teclado (02-01 = 0)
    let stopLatch = false;                 // STOP del teclado o falla: espera que se quite la orden
    let wire3 = false;                     // 3 hilos: marcha retenida
    let prevMI = /** @type {Record<string, boolean>} */ ({});
    let prevKeys = /** @type {Record<string, boolean>} */ ({});
    let prevResetIn = false;
    // Interfaz del teclado.
    let page = "F";                        // F, H, dir, grp, code, val
    let gi = 0, ci = 0, edit = 0;
    let msg = "", msgUntil = /** @type {bigint | null} */ (null);
    /** @type {{ key: string, since: bigint, next: bigint, n: number } | null} */
    let hold = null;
    let regs = { status: 0, fRef: 0, fOut: 0, vOut: 0 };
    let last = /** @type {any} */ ({});

    const fmax = () => P["01-00"];
    const visible = (g) => VFD_EL_PARAMS.filter((p) => !p.hidden && p.code.startsWith(`${g}-`));
    const startPage = () => ["F", "H", "dir"][P["00-03"]] ?? "F";
    const commit = (code, n) => {
      const p = BY_CODE.get(code);
      if (!p) return false;
      if (p.options ? !p.options.some((o) => codeOf(o) === n) : n < p.min - 1e-9 || n > p.max + 1e-9) return false;
      if (code === "00-02") {
        if (n === 10) {
          factory();
          edits++;
        }
        return true;
      }
      P[code] = p.options ? n : Number(n.toFixed(p.dec ?? 0));
      edits++;
      return true;
    };
    const flash = (t, text) => {
      msg = text;
      msgUntil = t + ms(1000);
    };

    /** Una pulsación (o repetición) de tecla. */
    function key(t, k, mult) {
      if (k === "mode") {
        msg = "";
        page = page === "F" ? "H" : page === "H" ? "dir" : page === "dir" ? "grp" : page === "grp" ? "F" : page === "code" ? "grp" : "code";
        return;
      }
      if (k === "enter") {
        if (page === "grp") {
          page = "code";
          ci = 0;
        } else if (page === "code") {
          page = "val";
          edit = P[visible(GROUPS[gi])[ci].code];
        } else if (page === "val") {
          const p = visible(GROUPS[gi])[ci];
          flash(t, commit(p.code, edit) ? "End" : "Err");
          page = "code";
        }
        return;
      }
      const s = k === "up" ? 1 : -1;
      if (page === "F" && P["02-00"] === 0) {
        fKey = Math.min(fmax(), Math.max(0, Math.round((fKey + s * 0.01 * mult) * 100) / 100));
        edits++;
      } else if (page === "dir") keyRev = !keyRev;
      else if (page === "grp") gi = (gi + s + GROUPS.length) % GROUPS.length;
      else if (page === "code") {
        const n = visible(GROUPS[gi]).length;
        ci = (ci + s + n) % n;
      } else if (page === "val") {
        const p = visible(GROUPS[gi])[ci];
        if (p.options) {
          const codes = p.options.map(codeOf);
          edit = codes[(codes.indexOf(edit) + s + codes.length) % codes.length];
        } else {
          const step = 10 ** -(p.dec ?? 0) * mult;
          edit = Math.min(p.max, Math.max(p.min, Math.round((edit + s * step) * 10 ** (p.dec ?? 0)) / 10 ** (p.dec ?? 0)));
        }
      }
    }

    function display(seg, going) {
      if (!powered) return { lcd: "", modo: "" };
      if (msg) return { lcd: msg, modo: "" };
      if (fault) return { lcd: fault, modo: "" };
      if (page === "F") return { lcd: fmt(last.fRef ?? 0, 2), modo: "F" };
      if (page === "H") return { lcd: fmt(Math.abs(seg.value), 2), modo: "H" };
      if (page === "dir") return { lcd: (going ? seg.value < 0 || (seg.value === 0 && last.rev) : keyRev) ? "rEu" : "Frd", modo: "" };
      if (page === "grp") return { lcd: `${GROUPS[gi]}-`, modo: "" };
      const p = visible(GROUPS[gi])[ci];
      if (page === "code") return { lcd: p.code, modo: "" };
      return { lcd: p.options ? String(edit) : fmt(edit, p.dec ?? 0), modo: "U" };
    }

    return {
      update(t, inp) {
        const wasPowered = powered;
        powered = inp.loads.input.on;
        if (!powered) {
          page = startPage();
          msg = "";
          hold = null;
          wire3 = false;
          keyRun = false;
        } else if (!wasPowered) page = startPage();
        if (msgUntil !== null && t >= msgUntil) {
          msg = "";
          msgUntil = null;
        }
        // Teclas: flanco de subida; ▲▼ se repiten al mantenerlas (más rápido con el tiempo).
        const keys = Object.fromEntries(KEYS.map((k) => [k, powered && !!inp.actions[k]]));
        const edge = (k) => keys[k] && !prevKeys[k];
        let stopKey = false, runKey = false, resetKey = false;
        for (const k of KEYS) {
          if (!edge(k)) continue;
          if (k === "run") runKey = true;
          else if (k === "stop") {
            if (fault) resetKey = true;
            else stopKey = true;
          } else {
            key(t, k, 1);
            if (k === "up" || k === "down") hold = { key: k, since: t, next: t + ms(500), n: 0 };
          }
        }
        if (hold && !keys[hold.key]) hold = null;
        while (hold && t >= hold.next) {
          const held = Number(hold.next - hold.since) / 1e9;
          key(t, hold.key, held > 3 ? 100 : held > 1.5 ? 10 : 1);
          hold.next += ms(100);
          hold.n++;
        }
        prevKeys = keys;
        pot = Math.max(0, Math.min(100, Number(inp.actions.pot ?? pot)));

        // Entradas MI (NPN) y sus funciones.
        const mi = Object.fromEntries(MI.map((id) => [id, powered && !!inp.loads[id]?.on]));
        const mode = P["04-04"];
        const fn = (f) => ["MI3", "MI4", "MI5", "MI6"].filter((id, i) => P[`04-0${5 + i}`] === f && !(mode === 2 && id === "MI3")).some((id) => mi[id]);
        const fnEdge = (f) => ["MI3", "MI4", "MI5", "MI6"].some((id, i) => P[`04-0${5 + i}`] === f && !(mode === 2 && id === "MI3") && mi[id] && !prevMI[id]);
        if (fn(14) || mbEF) fault = "EF";
        const resetIn = fn(5);
        if ((resetIn && !prevResetIn) || fnEdge(5) || resetKey || mbReset) {
          if (!fn(14) && !mbEF) fault = "";
        }
        prevResetIn = resetIn;
        mbReset = false;

        // Orden de marcha según 02-01.
        const src = P["02-01"];
        let wantRun = false, wantRev = false;
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
            // 3 hilos: MI3 es el paro (NC: abierto = parar); MI1 da la marcha con un pulso.
            if (!mi.MI3) wire3 = false;
            else if (mi.MI1 && !prevMI.MI1) wire3 = true;
            wantRun = wire3;
            wantRev = mi.MI2;
          }
        } else {
          wantRun = mbRun;
          wantRev = mbRev;
        }
        const jog = fn(8) && !wantRun;
        if (jog) wantRev = false;
        prevMI = mi;
        // STOP del teclado con la marcha por bornes o RS-485 (si está activo).
        if (stopKey && (src === 1 || src === 3)) stopLatch = true;
        if (!wantRun && !jog) stopLatch = false;
        if (fault) {
          // La falla corta la marcha: hay que quitar la orden y darla de nuevo.
          stopLatch = true;
          keyRun = false;
          wire3 = false;
        }
        // Sentidos permitidos (02-04).
        const blocked = (wantRev && P["02-04"] === 1) || (!wantRev && P["02-04"] === 2);
        const bb = fn(9) || mbBB;
        const going = powered && !fault && !bb && (wantRun || jog) && !stopLatch && !blocked;

        // Frecuencia de referencia (02-00), multivelocidad y JOG.
        const step = (fn(1) ? 1 : 0) + (fn(2) ? 2 : 0) + (fn(3) ? 4 : 0) + (fn(4) ? 8 : 0);
        const fs = P["02-00"];
        const master = fs === 0 ? fKey : fs === 3 ? mbF : fs === 4 ? (pot / 100) * fmax() : 0;
        const aviso = powered && (fs === 1 || fs === 2) ? "AVI/ACI no modeladas: referencia 0 Hz (use una plantilla)" : "";
        let fRef = jog ? P["01-14"] : step > 0 ? P[`05-${String(step - 1).padStart(2, "0")}`] : master;
        fRef = Math.min(fmax(), Math.max(0, fRef));
        const target = going ? (wantRev ? -fRef : fRef) : 0;

        // Rampa (01-09/01-10, o 01-11/01-12 con la función 7, o JOG 01-13);
        // al cambiar de sentido, primero baja a 0.
        const cur = hz.at(t);
        const goal = fn(6) ? cur : cur !== 0 && Math.sign(target) === -Math.sign(cur) ? 0 : target;
        const up = Math.abs(goal) > Math.abs(cur);
        const r2 = fn(7);
        const time = jog ? P["01-13"] : up ? P[r2 ? "01-11" : "01-09"] : P[r2 ? "01-12" : "01-10"];
        const coast = !powered || !!fault || bb || (!going && P["02-02"] === 1);
        if (coast) hz.set(t, 0);   // salida cortada: el motor sigue por inercia
        else hz.step(t, goal, fmax() / Math.max(0.01, time));
        const seg = hz.segment(t);
        const outOn = !coast && (seg.value !== 0 || going);
        const fOut = Math.abs(seg.value);
        const reached = going && seg.rate === 0 && fOut === Math.abs(target) && target !== 0;
        const rf = P["03-00"];
        const relay = rf === 1 ? outOn && fOut > 0 : rf === 2 ? reached : rf === 3 ? powered && fOut === 0 : rf === 8 ? !!fault : false;
        const rev = seg.value < 0 || (seg.value === 0 && target < 0);
        last = { fRef, rev };
        regs = {
          status: (outOn ? (going ? 0b11 : 0b01) : 0b00) | (jog ? 0b100 : 0) | (rev ? 0b11 << 3 : 0) |
            (fs === 3 ? 1 << 8 : 0) | (fs === 1 || fs === 2 ? 1 << 9 : 0) | (src >= 3 ? 1 << 10 : 0),
          fRef: Math.round(fRef * 100),
          fOut: Math.round(fOut * 100),
          vOut: Math.round(Math.min(P["01-02"], (P["01-02"] * fOut) / Math.max(0.1, P["01-01"])) * 10),
        };
        const lcd = display(seg, going);
        // Lo programado en el equipo se guarda en la escena.
        if (edits || pot !== pot0) {
          saved = Object.fromEntries(VFD_EL_PARAMS.filter((p) => !p.hidden).map((p) => [p.code, toScene(p, P[p.code])]));
          saved.fTeclado = fKey;
          saved.pot = pot;
        }
        const repeat = hold?.next;
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
            fRef,
            direction: rev ? -1 : outOn ? 1 : 0,
            fault,
            lcd: lcd.lcd,
            modo: lcd.modo,
            ledRun: powered && outOn,
            ledStop: powered && !outOn,
            ledFwd: powered && !rev,
            ledRev: powered && rev,
            pot,
            aviso,
            ...Object.fromEntries(KEYS.map((k) => [`k_${k}`, keys[k]])),
          },
          ...(saved ? { params: saved } : {}),
          nextEventNs: earliest(hz.next, msgUntil ?? undefined, repeat),
        };
      },
      modbusRead(_table, start, count) {
        if (!powered || P["09-04"] < 3) return undefined;   // apagado o en ASCII: no responde a RTU
        const out = [];
        for (let a = start; a < start + count; a++) {
          const st = { 0x2100: fault ? VFD_EL_FAULTS[fault] ?? 1 : 0, 0x2101: regs.status, 0x2102: regs.fRef, 0x2103: regs.fOut, 0x2104: 0, 0x2105: 3110, 0x2106: regs.vOut };
          if (a in st) {
            out.push(st[a]);
            continue;
          }
          const p = BY_CODE.get(`${String(a >> 8).padStart(2, "0")}-${String(a & 0xff).padStart(2, "0")}`);
          if (!p) return null;
          out.push(Math.round(P[p.code] * 10 ** (p.options ? 0 : p.dec ?? 0)));
        }
        return out;
      },
      modbusWrite(start, vals) {
        if (!powered || P["09-04"] < 3) return undefined;
        for (let k = 0; k < vals.length; k++) {
          const a = start + k;
          const v = vals[k];
          if (a === 0x2000) {
            const cmd = v & 0b11;
            if (cmd === 0b01) mbRun = false;
            else if (cmd === 0b10 || cmd === 0b11) mbRun = true;
            const dir = (v >> 4) & 0b11;
            if (dir === 0b01) mbRev = false;
            else if (dir === 0b10) mbRev = true;
            else if (dir === 0b11) mbRev = !mbRev;
          } else if (a === 0x2001) mbF = v / 100;
          else if (a === 0x2002) {
            mbEF = !!(v & 0b1);
            if (v & 0b10) mbReset = true;
            mbBB = !!(v & 0b100);
          } else {
            const p = BY_CODE.get(`${String(a >> 8).padStart(2, "0")}-${String(a & 0xff).padStart(2, "0")}`);
            if (!p || !commit(p.code, p.options ? v : v / 10 ** (p.dec ?? 0))) return false;
          }
        }
        return true;
      },
    };
  },
};
