// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Montacargas: cabina en su pozo, movida por el motor de la escena a través
// del cable y el reductor (velocidad nominal a speed = 1), con una puerta de
// rejilla por piso que se abre y cierra a mano y una celda de carga.

import { earliest } from "../device-kit.mjs";

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
/** Más allá del último piso el pozo sigue unos centímetros (sobrerrecorrido) y luego el tope. */
const OVER_M = 0.4;
const RAMP_STEP_S = 0.02;
const after = (t, s) => (s === undefined || !Number.isFinite(s) ? undefined : t + BigInt(Math.max(1, Math.round(s * 1e9))));

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const lift = {
  type: "jwsim/lift",
  version: "1.0.0",
  name: "Montacargas (cabina y pozo)",
  category: "Planta",
  description:
    "Cabina de montacargas en su pozo, movida por un motor de la escena (parámetro Motor, p. ej. M1.speed: positivo sube). altura es la del piso de la cabina en m (0 = planta baja). Los finales de carrera de piso se enlazan a altura (piso 1 con 3 m entre pisos: Desde 2,98 Hasta 3,02); los de sobrerrecorrido, más allá del último piso o bajo la planta baja. Cada piso tiene su puerta de rejilla (acciones puerta0, puerta1…, salidas igual: true = abierta; el contacto de puerta se enlaza con Desde 0 Hasta 0 para que actúe con la puerta cerrada). «Sobrecarga» simula la celda de carga (salida sobrecarga). Si el motor la lleva contra el tope, avisa.",
  parameters: [
    { id: "motor", label: "Motor", type: "string", default: "", hint: "dispositivo.salida de -1 a 1, p. ej. M1.speed" },
    { id: "pisos", label: "Paradas", type: "number", default: 3, hint: "2 a 6" },
    { id: "entrePisos", label: "Altura entre pisos", type: "number", default: 3, unit: "m" },
    { id: "velocidad", label: "Velocidad nominal", type: "number", default: 0.3, unit: "m/s" },
    { id: "altura0", label: "Altura inicial", type: "number", default: 0, unit: "m" },
  ],
  terminals: [],
  actions: [
    { id: "puerta0", label: "Puerta planta baja", kind: "toggle" },
    { id: "puerta1", label: "Puerta piso 1", kind: "toggle" },
    { id: "puerta2", label: "Puerta piso 2", kind: "toggle" },
    { id: "puerta3", label: "Puerta piso 3", kind: "toggle" },
    { id: "puerta4", label: "Puerta piso 4", kind: "toggle" },
    { id: "puerta5", label: "Puerta piso 5", kind: "toggle" },
    { id: "sobrecarga", label: "Sobrecarga en la cabina", kind: "toggle" },
  ],
  reads: (p) => (p.motor ? [{ id: "motor", source: String(p.motor) }] : []),
  create(ctx) {
    const p = ctx.params;
    const n = Math.max(2, Math.min(6, Math.round(num(p.pisos, 3))));
    const H = Math.max(0.5, num(p.entrePisos, 3));
    const v = Math.max(0.01, num(p.velocidad, 0.3));
    const top = (n - 1) * H;
    const lo = -OVER_M;
    const hi = top + OVER_M;
    let z = Math.max(lo, Math.min(hi, num(p.altura0, 0)));
    /** @type {bigint | null} */
    let lastT = null;
    let lastS = 0;
    return {
      update(t, inp) {
        const s = Math.max(-1, Math.min(1, num(inp.values.motor, 0)));
        if (lastT !== null && t > lastT) z = Math.max(lo, Math.min(hi, z + ((lastS + s) / 2) * v * (Number(t - lastT) / 1e9)));
        lastT = t;
        lastS = s;
        const blocked = (z >= hi && s > 0) || (z <= lo && s < 0);
        const rate = blocked ? 0 : s * v;
        const toEdge = rate > 0 ? (hi - z) / rate : rate < 0 ? (lo - z) / rate : undefined;
        const doors = Array.from({ length: n }, (_, i) => !!inp.actions[`puerta${i}`]);
        const near = Math.round(z / H);
        const at = Math.abs(z - near * H) <= 0.02 && near >= 0 && near < n ? near : -1;
        return {
          outputs: {
            altura: { value: z, rate },
            piso: Math.max(0, Math.min(n - 1, near)),
            enPiso: at,
            pisoTxt: at >= 0 ? (at === 0 ? "PB" : `P${at}`) : z > top || z < 0 ? "¡SOBRERRECORRIDO!" : rate > 0 ? "▲" : rate < 0 ? "▼" : "entre pisos",
            ...Object.fromEntries(doors.map((d, i) => [`puerta${i}`, d])),
            puertasCerradas: doors.every((d) => !d),
            sobrecarga: !!inp.actions.sobrecarga,
            movimiento: rate !== 0,
            tope: blocked,
            pisos: n,
            entrePisos: H,
          },
          nextEventNs: earliest(after(t, toEdge), s !== 0 && Math.abs(s) < 1 ? after(t, RAMP_STEP_S) : undefined),
        };
      },
    };
  },
};
