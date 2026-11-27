// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Cinta con física (planta 3D, etapa 1 de PROPUESTA_PLANTA3D.md): las cajas
// tienen masa y fricción, la siguen por Coulomb, chocan entre sí, se
// acumulan contra un tope y caen al final. El accionamiento puede tener
// rampas propias (como el variador de la cinta de Open Industry Project, en
// cuyo diseño se basa). Física en scene/physics/cargo-line.mjs, a paso fijo
// sobre el tiempo de la simulación: determinista, sigue a ×10 y en las
// grabaciones.
//
// Mismos parámetros y salidas que jwsim/conveyor (piezas, avance, sensorA,
// sensorB, salidas, enCinta), así que el esquema y la vista 3D la dibujan
// igual; los sensores se enlazan con source C1.sensorA / C1.sensorB.

import { earliest, ms } from "../device-kit.mjs";
import { CargoLine } from "../physics/cargo-line.mjs";

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const conveyorPhysics = {
  type: "jwsim/conveyor-physics",
  version: "1.0.0",
  name: "Cinta con física",
  category: "Planta",
  description:
    "Cinta movida por un motor de la escena (Motor, p. ej. M1.speed de -1 a 1) en la que las cajas tienen masa y fricción: la siguen al arrancar y frenar (si la cinta frena más rápido que μ·g, la caja resbala), chocan entre sí, se acumulan contra el tope y caen al final. Rampas de arranque y frenado propias, como un variador. Fotoceldas A y B: haz que cruza la cinta en ese punto (sensores con source C1.sensorA / C1.sensorB). Física basada en el diseño de Open Industry Project.",
  parameters: [
    { id: "motor", label: "Motor", type: "string", default: "", hint: "dispositivo.salida de -1 a 1, p. ej. M1.speed" },
    { id: "largo", label: "Largo", type: "number", default: 3, unit: "m" },
    { id: "velocidad", label: "Velocidad nominal", type: "number", default: 0.5, unit: "m/s" },
    { id: "arranque", label: "Rampa de arranque", type: "number", default: 0, unit: "s", hint: "0 a la velocidad nominal; 0 = la del motor" },
    { id: "frenado", label: "Rampa de frenado", type: "number", default: 0, unit: "s", hint: "nominal a 0; la caja sigue avanzando mientras frena" },
    { id: "pieza", label: "Largo de la caja", type: "number", default: 0.3, unit: "m" },
    { id: "masa", label: "Masa de la caja", type: "number", default: 2, unit: "kg" },
    { id: "friccion", label: "Fricción caja-cinta (μ)", type: "number", default: 0.5 },
    { id: "sensorA", label: "Fotocelda A (desde el inicio)", type: "number", default: 2, unit: "m" },
    { id: "sensorB", label: "Fotocelda B (desde el inicio)", type: "number", default: 2.7, unit: "m" },
    { id: "tope", label: "Tope (desde el inicio)", type: "number", default: 0, unit: "m", hint: "0 = sin tope: las cajas caen al final" },
    { id: "iniciales", label: "Cajas al empezar", type: "number", default: 1 },
    { id: "cada", label: "Caja nueva cada", type: "number", default: 0, unit: "s", hint: "0 = solo a mano" },
    { id: "hz", label: "Pasos de física por segundo", type: "number", default: 60 },
  ],
  terminals: [],
  actions: [{ id: "poner", label: "Poner caja", kind: "momentary" }],
  // La escena no despierta a quien lee una salida en rampa; con un motor
  // (M1.speed) se lee también M1.running, que cambia al empezar la rampa,
  // para dar pasos desde ese instante.
  reads: (p) => {
    if (!p.motor) return [];
    const src = String(p.motor);
    return [{ id: "motor", source: src }, ...(/\.speed$/.test(src) ? [{ id: "run", source: src.replace(/\.speed$/, ".running") }] : [])];
  },
  create(ctx) {
    const p = ctx.params;
    const len = Math.max(0.02, num(p.pieza, 0.3));
    const box = { len, mass: Math.max(0.01, num(p.masa, 2)), mu: Math.max(0, num(p.friccion, 0.5)) };
    const hz = Math.max(10, Math.min(1000, Math.round(num(p.hz, 60))));
    const stepNs = BigInt(Math.round(1e9 / hz));
    const line = new CargoLine({
      length: num(p.largo, 3),
      vNominal: num(p.velocidad, 0.5),
      accelTime: num(p.arranque, 0),
      decelTime: num(p.frenado, 0),
      stop: num(p.tope, 0),
      hz,
    });
    line.h = Number(stepNs) / 1e9; // el paso exacto de la grilla de ns
    const sA = num(p.sensorA, 2);
    const sB = num(p.sensorB, 2.7);
    const every = Math.max(0, num(p.cada, 0));
    for (let i = 0; i < Math.max(0, Math.round(num(p.iniciales, 1))); i++) line.add({ ...box, x: len / 2 + i * len * 1.5 });
    /** pasos dados: el estado corresponde a t = k · stepNs */
    let k = 0n;
    /** orden y t de la actualización anterior (para interpolar una rampa) */
    let prevCmd = 0;
    let prevT = 0n;
    let lastPut = false;
    /** @type {bigint | null} */
    let nextAuto = every > 0 ? ms(every * 1000) : null;
    const startFree = () => !line.boxes.some((b) => b.x - b.len / 2 < len * 1.05);
    return {
      update(t, inp) {
        // Avanza la física hasta t. Si la orden cambió desde la actualización
        // anterior, se interpola en cada paso (las rampas de los motores son
        // lineales: exacto).
        const cmd = Math.max(-1, Math.min(1, num(inp.values.motor, 0)));
        const ramping = cmd !== prevCmd && t > prevT;
        const target = t / stepNs;
        if (!line.moving && !ramping) k = target > k ? target : k;
        while (k < target) {
          if (ramping) line.command(prevCmd + ((cmd - prevCmd) * Number((k + 1n) * stepNs - prevT)) / Number(t - prevT));
          line.step();
          k++;
          if (!line.moving && !ramping) k = target;
        }
        line.command(cmd);
        const active = line.moving || num(inp.values.run, 0) === 1 || cmd !== prevCmd;
        prevCmd = cmd;
        prevT = t;
        // Caja nueva: a mano (flanco) o sola; solo si el inicio está libre.
        const put = !!inp.actions.poner;
        if (put && !lastPut && startFree()) line.add({ ...box, x: len / 2 });
        lastPut = put;
        if (nextAuto !== null && t >= nextAuto) {
          if (startFree()) line.add({ ...box, x: len / 2 });
          nextAuto = t + ms(every * 1000);
        }
        return {
          outputs: {
            sensorA: line.covers(sA),
            sensorB: line.covers(sB),
            piezas: line.boxes.map((b) => r3(b.x)),
            velPiezas: line.boxes.map((b) => r3(b.v)),
            avance: r3(line.vBelt),
            salidas: line.dischargedEnd,
            enCinta: line.boxes.length,
          },
          nextEventNs: earliest(active ? (k + 1n) * stepNs : undefined, nextAuto ?? undefined),
        };
      },
    };
  },
};
