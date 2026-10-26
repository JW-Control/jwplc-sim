// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Arranque de motores: relé térmico, motor trifásico de dos velocidades
// (bobinados independientes, como el de la JWPLC Laundry) y variador de
// frecuencia Delta MS300 (marcha por bornes o por Modbus RTU).

import { Ramp, earliest, ms } from "../device-kit.mjs";

const PHASE_INDEX = { L1: 0, L2: 1, L3: 2 };

/**
 * Bobinado trifásico en estrella interna con sus tres principios: gira si
 * llegan tres fases distintas (sentido por la secuencia); con una o dos,
 * falta de fase.
 */
export function windingRun(terms, starts) {
  const ph = starts.map((t) => terms[t]?.phase ?? null);
  const n = new Set(ph.filter(Boolean)).size;
  if (n === 3) return { on: true, direction: (PHASE_INDEX[ph[1]] - PHASE_INDEX[ph[0]] + 3) % 3 === 1 ? 1 : -1, faltaFase: false };
  return { on: false, direction: 0, faltaFase: n > 0 };
}

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const overloadRelay = {
  type: "jwsim/overload-relay",
  version: "1.0.0",
  name: "Relé térmico",
  category: "Protección",
  description:
    "Relé de sobrecarga térmico tripolar (CHINT NR2-25 / Schneider LRD) que se monta bajo el contactor: polos 1-2, 3-4 y 5-6, contacto auxiliar 95-96 NC (va en serie con la bobina del contactor) y 97-98 NO (señal de disparo). Dispara por falta de fase (corriente desequilibrada) después del tiempo de disparo, o con el botón TEST. Se rearma con RESET una vez quitada la causa.",
  parameters: [
    { id: "range", label: "Rango", type: "enum", options: ["0.63-1 A", "1-1.6 A", "1.6-2.5 A", "2.5-4 A", "4-6 A", "5.5-8 A"], default: "2.5-4 A" },
    { id: "tripMs", label: "Tiempo de disparo (falta de fase)", type: "number", default: 4000, unit: "ms" },
  ],
  terminals: [
    { id: "1", label: "1/L1" }, { id: "3", label: "3/L2" }, { id: "5", label: "5/L3" },
    { id: "2", label: "2/T1" }, { id: "4", label: "4/T2" }, { id: "6", label: "6/T3" },
    { id: "95" }, { id: "96" }, { id: "97" }, { id: "98" },
  ],
  actions: [
    { id: "test", label: "TEST (disparar)", kind: "momentary" },
    { id: "reset", label: "RESET", kind: "momentary" },
  ],
  electrical: () => ({
    phaseLoads: [{ id: "line", terminals: ["1", "3", "5"] }],
    contacts: { "1-2": ["1", "2"], "3-4": ["3", "4"], "5-6": ["5", "6"], "95-96": ["95", "96"], "97-98": ["97", "98"] },
  }),
  create(ctx) {
    let tripped = false;
    /** @type {bigint | null} */
    let lossSince = null;
    return {
      update(t, inp) {
        const terms = inp.phases?.line?.terms ?? {};
        const n = new Set(["1", "3", "5"].map((k) => terms[k]?.phase).filter(Boolean)).size;
        // Falta de fase: llegan una o dos fases (corriente desequilibrada).
        const loss = n === 1 || n === 2;
        if (loss) lossSince ??= t;
        else lossSince = null;
        const due = lossSince === null ? undefined : lossSince + ms(ctx.params.tripMs);
        if (inp.actions.test || (due !== undefined && t >= due)) tripped = true;
        if (inp.actions.reset && !inp.actions.test && !loss) tripped = false;
        return {
          contacts: { "1-2": true, "3-4": true, "5-6": true, "95-96": !tripped, "97-98": tripped },
          outputs: { tripped, faltaFase: loss },
          nextEventNs: tripped ? undefined : due,
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const motor2v = {
  type: "jwsim/motor-2v",
  version: "1.0.0",
  name: "Motor trifásico de dos velocidades",
  category: "Actuadores",
  description:
    "Motor trifásico de 220 V con dos bobinados independientes, como el de lavado y centrifugado de la JWPLC Laundry: 1U 1V 1W para la velocidad baja y 2U 2V 2W para la alta, cada uno con su contactor. Energizar los dos a la vez es un conflicto (el motor no gira y la protección debe actuar). La secuencia de fases fija el sentido.",
  parameters: [
    { id: "rpmLow", label: "Velocidad baja", type: "number", default: 470, unit: "rpm" },
    { id: "rpmHigh", label: "Velocidad alta", type: "number", default: 2800, unit: "rpm" },
    { id: "accelMs", label: "Arranque", type: "number", default: 600, unit: "ms" },
    { id: "stopMs", label: "Parada (inercia)", type: "number", default: 2500, unit: "ms" },
  ],
  terminals: [{ id: "1U" }, { id: "1V" }, { id: "1W" }, { id: "2U" }, { id: "2V" }, { id: "2W" }, { id: "PE", label: "PE (tierra)" }],
  electrical: () => ({
    phaseLoads: [
      { id: "low", terminals: ["1U", "1V", "1W"] },
      { id: "high", terminals: ["2U", "2V", "2W"] },
    ],
  }),
  create(ctx) {
    const speed = new Ramp(0);
    return {
      update(t, inp) {
        const lo = windingRun(inp.phases?.low?.terms ?? {}, ["1U", "1V", "1W"]);
        const hi = windingRun(inp.phases?.high?.terms ?? {}, ["2U", "2V", "2W"]);
        const conflict = lo.on && hi.on;
        const k = Number(ctx.params.rpmLow) / Number(ctx.params.rpmHigh);
        const goal = conflict ? 0 : hi.on ? hi.direction : lo.on ? lo.direction * k : 0;
        const cur = speed.at(t);
        // Sube con la rampa de arranque (escalada a la diferencia); baja por inercia.
        const up = Math.abs(goal) > Math.abs(cur) && Math.sign(goal) !== -Math.sign(cur);
        speed.step(t, goal, 1000 / Number(up ? ctx.params.accelMs : ctx.params.stopMs));
        const seg = speed.segment(t);
        return {
          outputs: {
            energized: lo.on || hi.on,
            velocidad: conflict ? "conflicto" : hi.on ? "alta" : lo.on ? "baja" : "",
            conflicto: conflict,
            faltaFase: (lo.faltaFase || hi.faltaFase) && !conflict,
            speed: seg,
            running: seg.value !== 0 || seg.rate !== 0,
            rpm: Math.round(Math.abs(seg.value) * Number(ctx.params.rpmHigh)),
          },
          nextEventNs: earliest(speed.next),
        };
      },
    };
  },
};

// ---------------------------------------------------------------- variador
const MI = ["MI1", "MI2", "MI3", "MI4", "MI5", "MI6", "MI7"];
/** Códigos de falla del registro 2100h (provisionales: verificar con el manual del MS300). */
export const VFD_FAULTS = { EF: 49 };

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const vfdMs300 = {
  type: "jwsim/vfd-ms300",
  version: "1.0.0",
  name: "Variador Delta MS300",
  category: "Actuadores",
  description:
    "Variador de frecuencia Delta MS300 (entrada monofásica 220 V en R/L1-S/L2, salida trifásica 220 V en U/T1 V/T2 W/T3). Entradas MI en modo NPN: se activan al unirlas a DCM (un contacto o la salida a relé del PLC). MI1 marcha adelante, MI2 marcha atrás, MI3-MI5 multivelocidad (8 velocidades), MI6 falla externa (EF), MI7 reset. Rampas de aceleración y desaceleración. Relé RA/RB/RC según el parámetro (falla, en marcha o frecuencia alcanzada). Modbus RTU en SG+/SG-: 2000h control (bit 1-0: 01 parar, 10 marcha; bit 5-4: 01 adelante, 10 atrás), 2001h frecuencia × 100, 2002h bit 1 reset; lectura de 2100h falla, 2101h estado, 2102h referencia × 100, 2103h frecuencia de salida × 100.",
  parameters: [
    { id: "control", label: "Marcha por (00-21)", type: "enum", options: ["bornes", "modbus"], default: "bornes" },
    { id: "freqSource", label: "Frecuencia por (00-20)", type: "enum", options: ["multivelocidad", "modbus"], default: "multivelocidad" },
    { id: "fMaster", label: "Frecuencia maestra (sin MI3-MI5)", type: "number", default: 60, unit: "Hz" },
    { id: "f1", label: "Velocidad 1 (04-00)", type: "number", default: 10, unit: "Hz" },
    { id: "f2", label: "Velocidad 2 (04-01)", type: "number", default: 20, unit: "Hz" },
    { id: "f3", label: "Velocidad 3 (04-02)", type: "number", default: 30, unit: "Hz" },
    { id: "f4", label: "Velocidad 4 (04-03)", type: "number", default: 40, unit: "Hz" },
    { id: "f5", label: "Velocidad 5 (04-04)", type: "number", default: 50, unit: "Hz" },
    { id: "f6", label: "Velocidad 6 (04-05)", type: "number", default: 55, unit: "Hz" },
    { id: "f7", label: "Velocidad 7 (04-06)", type: "number", default: 60, unit: "Hz" },
    { id: "fMax", label: "Frecuencia máxima (01-00)", type: "number", default: 60, unit: "Hz" },
    { id: "accelS", label: "Aceleración 0-fmáx (01-12)", type: "number", default: 10, unit: "s" },
    { id: "decelS", label: "Desaceleración fmáx-0 (01-13)", type: "number", default: 10, unit: "s" },
    { id: "relay", label: "Relé RA/RB/RC (02-13)", type: "enum", options: ["falla", "en marcha", "frecuencia alcanzada"], default: "falla" },
    { id: "address", label: "Dirección Modbus (09-00)", type: "number", default: 1, hint: "1 a 247" },
    { id: "baud", label: "Velocidad (09-01)", type: "enum", options: ["4800", "9600", "19200", "38400"], default: "9600", hint: "RTU 8N1" },
  ],
  terminals: [
    { id: "R", label: "R/L1" }, { id: "S", label: "S/L2" }, { id: "T", label: "T/L3" },
    { id: "U", label: "U/T1" }, { id: "V", label: "V/T2" }, { id: "W", label: "W/T3" }, { id: "PE", label: "PE (tierra)" },
    ...MI.map((id) => ({ id })), { id: "DCM", label: "DCM (común)" }, { id: "+24V" },
    { id: "RA" }, { id: "RB" }, { id: "RC" },
    { id: "SG+", label: "SG+ (RS-485)" }, { id: "SG-", label: "SG- (RS-485)" },
  ],
  actions: [
    { id: "stop", label: "STOP (teclado)", kind: "momentary" },
    { id: "reset", label: "RESET (teclado)", kind: "momentary" },
  ],
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: 5, a: "SG+", b: "SG-" }),
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
    const p = ctx.params;
    const hz = new Ramp(0);    // frecuencia con signo (negativa: atrás)
    let fault = "";
    let run = false;           // orden de marcha por Modbus
    let reverse = false;
    let fModbus = 0;
    let resetReq = false;
    let prevReset = false;
    let prevStop = false;
    let stopLatch = false;     // STOP del teclado: para hasta que se quite la orden de marcha
    let regs = { status: 0, fRef: 0, fOut: 0 };
    let powered = false;
    const fStep = [p.fMaster, p.f1, p.f2, p.f3, p.f4, p.f5, p.f6, p.f7].map(Number);
    return {
      update(t, inp) {
        powered = inp.loads.input.on;
        const mi = Object.fromEntries(MI.map((id) => [id, powered && inp.loads[id].on]));
        // Fallas: EF por MI6 (enclavada); se rearma con MI7, el teclado o Modbus.
        if (mi.MI6) fault = "EF";
        const resetIn = mi.MI7 || !!inp.actions.reset;
        const resetEdge = (resetIn && !prevReset) || resetReq;
        prevReset = resetIn;
        if (resetEdge && !mi.MI6) fault = "";
        resetReq = false;
        // Orden de marcha y sentido.
        let wantRun;
        let wantRev;
        if (p.control === "modbus") {
          wantRun = run;
          wantRev = reverse;
        } else {
          wantRun = mi.MI1 !== mi.MI2;
          wantRev = mi.MI2 && !mi.MI1;
        }
        if (inp.actions.stop && !prevStop) stopLatch = true;
        prevStop = !!inp.actions.stop;
        if (!wantRun) stopLatch = false;
        const going = powered && !fault && wantRun && !stopLatch;
        // Frecuencia de referencia.
        const idx = (mi.MI3 ? 1 : 0) + (mi.MI4 ? 2 : 0) + (mi.MI5 ? 4 : 0);
        const fRef = Math.min(Number(p.fMax), Math.max(0, p.freqSource === "modbus" ? fModbus : fStep[idx]));
        const target = going ? (wantRev ? -fRef : fRef) : 0;
        // Rampa: si cambia el sentido, primero baja a 0.
        const cur = hz.at(t);
        const goal = cur !== 0 && Math.sign(target) === -Math.sign(cur) ? 0 : target;
        const up = Math.abs(goal) > Math.abs(cur);
        const rate = Number(p.fMax) / Math.max(0.01, Number(up ? p.accelS : p.decelS));
        if (!powered || fault) hz.set(t, 0);   // sin tensión o en falla: la salida se corta (el motor sigue por inercia)
        else hz.step(t, goal, rate);
        const seg = hz.segment(t);
        const outOn = powered && !fault && (seg.value !== 0 || going);
        const reached = going && seg.rate === 0 && seg.value === target && target !== 0;
        const relay = p.relay === "en marcha" ? outOn && seg.value !== 0 : p.relay === "frecuencia alcanzada" ? reached : !!fault;
        regs = {
          status: (outOn ? 0b11 : 0) | ((seg.value < 0 || (seg.value === 0 && wantRev) ? 0b11 : 0) << 3),
          fRef: Math.round(fRef * 100),
          fOut: Math.round(Math.abs(seg.value) * 100),
        };
        const rev = seg.value < 0 || (seg.value === 0 && target < 0);
        return {
          sources: {
            dc: { on: powered },
            out: { on: outOn, reverse: rev, hz: { value: Math.abs(seg.value), rate: Math.sign(seg.value || target) * seg.rate, goal: Math.abs(goal) } },
          },
          contacts: { "RA-RC": relay, "RB-RC": !relay },
          outputs: {
            powered,
            running: outOn,
            hz: { value: seg.value, rate: seg.rate },
            fRef,
            direction: rev ? -1 : outOn ? 1 : 0,
            fault,
            display: !powered ? "" : fault ? fault : `${outOn ? "H" : "F"} ${(outOn ? Math.abs(seg.value) : fRef).toFixed(2)}`,
          },
          nextEventNs: earliest(hz.next),
        };
      },
      modbusRead(_table, start, count) {
        if (!powered) return undefined;
        const map = { 0x2100: fault ? VFD_FAULTS[fault] ?? 1 : 0, 0x2101: regs.status, 0x2102: regs.fRef, 0x2103: regs.fOut, 0x2104: 0 };
        const out = [];
        for (let a = start; a < start + count; a++) {
          if (!(a in map)) return null;
          out.push(map[a]);
        }
        return out;
      },
      modbusWrite(start, vals) {
        if (!powered) return undefined;
        for (let k = 0; k < vals.length; k++) {
          const a = start + k;
          const v = vals[k];
          if (a === 0x2000) {
            const cmd = v & 0b11;
            if (cmd === 0b01) run = false;
            else if (cmd === 0b10 || cmd === 0b11) run = true;
            const dir = (v >> 4) & 0b11;
            if (dir === 0b01) reverse = false;
            else if (dir === 0b10) reverse = true;
            else if (dir === 0b11) reverse = !reverse;
          } else if (a === 0x2001) fModbus = v / 100;
          else if (a === 0x2002) {
            if (v & 0b10) resetReq = true;
          } else return false;
        }
        return true;
      },
    };
  },
};
