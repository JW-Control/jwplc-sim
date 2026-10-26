// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Arranque de motores: relé térmico CHINT NR2-25 y motor trifásico de dos
// velocidades (bobinados independientes, como el de la JWPLC Laundry). El
// variador Delta VFD-EL está en vfd-el.mjs.

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

/** Rangos de ajuste del NR2-25 (ficha CHINT serie NR2, §4.2). */
export const NR2_25_RANGES = ["0.63-1 A", "1-1.6 A", "1.6-2.5 A", "2.5-4 A", "4-6 A", "5.5-8 A", "7-10 A", "9-13 A", "12-18 A", "17-25 A"];
const fmtA = (v) => `${Number(v.toFixed(2))}`.replace(".", ",");

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const overloadRelay = {
  type: "jwsim/overload-relay",
  version: "1.1.0",
  name: "Relé térmico CHINT NR2-25",
  category: "Protección",
  description:
    "Relé de sobrecarga térmico tripolar CHINT NR2-25 (clase 10A, IEC 60947-4-1) que se monta bajo el contactor: polos 1-2, 3-4 y 5-6, contactos 95-96 NC (va en serie con la bobina del contactor) y 97-98 NO (señal de disparo), separados eléctricamente. Dispara por falta de fase (corriente desequilibrada) después del tiempo de disparo, o con la lengüeta TEST. STOP abre 95-96 mientras se pulsa. RESET azul: en H el rearme es manual (pulsar RESET quitada la causa); en A se rearma solo al enfriarse. El ajuste de corriente gira el dial; el simulador todavía no modela la corriente del motor, así que no cambia el disparo.",
  parameters: [
    { id: "range", label: "Rango", type: "enum", options: NR2_25_RANGES, default: "2.5-4 A" },
    { id: "ajuste", label: "Ajuste (dial)", type: "number", default: 3.2, unit: "A", hint: "dentro del rango; corriente nominal del motor" },
    { id: "rearme", label: "Rearme (botón RESET)", type: "enum", options: ["manual (H)", "automático (A)"], default: "manual (H)" },
    { id: "tripMs", label: "Tiempo de disparo (falta de fase)", type: "number", default: 4000, unit: "ms", hint: "acortado para el taller (el real llega a minutos)" },
    { id: "rearmeMs", label: "Enfriamiento (rearme automático)", type: "number", default: 20000, unit: "ms" },
  ],
  terminals: [
    { id: "1", label: "1/L1" }, { id: "3", label: "3/L2" }, { id: "5", label: "5/L3" },
    { id: "2", label: "2/T1" }, { id: "4", label: "4/T2" }, { id: "6", label: "6/T3" },
    { id: "95" }, { id: "96" }, { id: "97" }, { id: "98" },
  ],
  actions: [
    { id: "test", label: "TEST (disparar)", kind: "momentary" },
    { id: "stop", label: "STOP (abre 95-96)", kind: "momentary" },
    { id: "reset", label: "RESET", kind: "momentary" },
  ],
  electrical: () => ({
    phaseLoads: [{ id: "line", terminals: ["1", "3", "5"] }],
    contacts: { "1-2": ["1", "2"], "3-4": ["3", "4"], "5-6": ["5", "6"], "95-96": ["95", "96"], "97-98": ["97", "98"] },
  }),
  create(ctx) {
    const p = ctx.params;
    const [lo, hi] = String(p.range).replace(" A", "").split("-").map(Number);
    const ajuste = Math.min(hi, Math.max(lo, Number(p.ajuste) || lo));
    const auto = String(p.rearme).startsWith("auto");
    let tripped = false;
    /** @type {bigint | null} */
    let lossSince = null;
    /** @type {bigint | null} */
    let clearSince = null;   // disparado y sin causa: cuenta el enfriamiento (rearme A)
    return {
      update(t, inp) {
        const terms = inp.phases?.line?.terms ?? {};
        const n = new Set(["1", "3", "5"].map((k) => terms[k]?.phase).filter(Boolean)).size;
        // Falta de fase: llegan una o dos fases (corriente desequilibrada).
        const loss = n === 1 || n === 2;
        if (loss) lossSince ??= t;
        else lossSince = null;
        const due = lossSince === null ? undefined : lossSince + ms(p.tripMs);
        if (inp.actions.test || (due !== undefined && t >= due)) tripped = true;
        if (inp.actions.reset && !inp.actions.test && !loss) tripped = false;
        // Rearme automático: quitada la causa, se rearma al enfriarse.
        const cause = loss || !!inp.actions.test;
        if (!tripped || cause) clearSince = null;
        else clearSince ??= t;
        const cool = auto && clearSince !== null ? clearSince + ms(p.rearmeMs) : undefined;
        if (cool !== undefined && t >= cool) {
          tripped = false;
          clearSince = null;
        }
        return {
          contacts: { "1-2": true, "3-4": true, "5-6": true, "95-96": !tripped && !inp.actions.stop, "97-98": tripped },
          outputs: {
            tripped,
            faltaFase: loss,
            test: !!inp.actions.test,
            stop: !!inp.actions.stop,
            ajusteRel: hi > lo ? (ajuste - lo) / (hi - lo) : 0,
            ajusteTxt: `${fmtA(ajuste)} A (${fmtA(lo)}-${fmtA(hi)})`,
          },
          nextEventNs: earliest(tripped ? undefined : due, tripped ? cool : undefined),
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
