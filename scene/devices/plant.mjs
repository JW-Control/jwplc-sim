// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Planta (G8 3D): procesos que mueve un motor de la escena y cuyas salidas
// accionan los sensores (finales de carrera, inductivo, fotoeléctrico) por
// su parámetro «source». No tienen bornes: se enlazan por nombre
// (p. ej. «M1.speed»), como un sensor se enlaza a la posición de un cilindro.
// La vista 3D (app/renderer/scene3d.js) los dibuja con su estado.

import { earliest, ms } from "../device-kit.mjs";

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Instante (ns) dentro de `sec` segundos, al menos 1 ns después de t. */
const after = (t, sec) => (sec === undefined || !Number.isFinite(sec) || sec < 0 ? undefined : t + BigInt(Math.max(1, Math.ceil(sec * 1e9))));
const RAMP_STEP_S = 0.02; // con la velocidad cambiando, la planta se reevalúa cada 20 ms

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const conveyor = {
  type: "jwsim/conveyor",
  version: "1.0.0",
  name: "Cinta transportadora",
  category: "Planta",
  description:
    "Cinta de rodillos movida por un motor de la escena (parámetro Motor, p. ej. M1.speed: la velocidad del motor de -1 a 1). Las piezas se ponen con «Poner pieza» o solas cada cierto tiempo, avanzan con la cinta y caen al final. Dos puntos de detección (A y B) accionan los sensores con source C1.sensorA / C1.sensorB (Desde 1, Hasta 1). Cuenta las piezas que salen.",
  parameters: [
    { id: "motor", label: "Motor", type: "string", default: "", hint: "dispositivo.salida de -1 a 1, p. ej. M1.speed" },
    { id: "largo", label: "Largo", type: "number", default: 2, unit: "m" },
    { id: "velocidad", label: "Velocidad nominal", type: "number", default: 0.25, unit: "m/s" },
    { id: "pieza", label: "Largo de la pieza", type: "number", default: 0.2, unit: "m" },
    { id: "sensorA", label: "Punto A (desde el inicio)", type: "number", default: 0.4, unit: "m" },
    { id: "sensorB", label: "Punto B (desde el inicio)", type: "number", default: 1.7, unit: "m" },
    { id: "cada", label: "Pieza nueva cada", type: "number", default: 0, unit: "s", hint: "0 = solo a mano" },
  ],
  terminals: [],
  actions: [{ id: "poner", label: "Poner pieza", kind: "momentary" }],
  reads: (p) => (p.motor ? [{ id: "motor", source: String(p.motor) }] : []),
  create(ctx) {
    const p = ctx.params;
    const L = Math.max(0.2, num(p.largo, 2));
    const vNom = num(p.velocidad, 0.25);
    const len = Math.max(0.02, num(p.pieza, 0.2));
    const sA = num(p.sensorA, 0.4);
    const sB = num(p.sensorB, 1.7);
    const every = Math.max(0, num(p.cada, 0));
    /** @type {number[]} centro de cada pieza (m desde el inicio) */
    let pieces = [];
    let salidas = 0;
    /** @type {bigint | null} */
    let lastT = null;
    let lastV = 0;
    let lastPut = false;
    /** @type {bigint | null} */
    let nextAuto = every > 0 ? 0n : null;
    const covers = (s) => pieces.some((x) => Math.abs(x - s) <= len / 2 + 1e-9);
    return {
      update(t, inp) {
        const speed = Math.max(-1, Math.min(1, num(inp.values.motor, 0)));
        const v = speed * vNom;
        // Avance desde la última evaluación (trapecio: exacto en una rampa lineal).
        if (lastT !== null && t > lastT) {
          const dx = ((lastV + v) / 2) * (Number(t - lastT) / 1e9);
          pieces = pieces.map((x) => x + dx);
        }
        lastT = t;
        lastV = v;
        // Caen al pasar el final; las que retroceden más allá del inicio también se quitan.
        const before = pieces.length;
        pieces = pieces.filter((x) => x - len / 2 < L);
        salidas += before - pieces.length;
        pieces = pieces.filter((x) => x + len / 2 > 0);
        // Pieza nueva: a mano (flanco) o sola; solo si el inicio está libre.
        const put = !!inp.actions.poner;
        const free = !pieces.some((x) => x - len / 2 < len * 1.05);
        if (put && !lastPut && free) pieces.push(len / 2);
        lastPut = put;
        if (nextAuto !== null && t >= nextAuto) {
          if (free) pieces.push(len / 2);
          nextAuto = t + ms(every * 1000);
        }
        pieces.sort((a, b) => a - b);
        // Próximo cambio: un borde de pieza que llega a un punto o al final.
        let dt;
        if (v !== 0) {
          for (const x of pieces) {
            for (const target of [sA - len / 2, sA + len / 2, sB - len / 2, sB + len / 2, L + len / 2]) {
              const s = (target - x) / v;
              if (s > 1e-9 && (dt === undefined || s < dt)) dt = s;
            }
          }
        }
        return {
          outputs: {
            sensorA: covers(sA),
            sensorB: covers(sB),
            piezas: pieces.map((x) => Math.round(x * 1000) / 1000),
            avance: Math.round(v * 1000) / 1000,
            salidas,
            enCinta: pieces.length,
          },
          nextEventNs: earliest(after(t, dt), nextAuto ?? undefined, speed !== 0 && Math.abs(speed) < 1 ? after(t, RAMP_STEP_S) : undefined),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const tank = {
  type: "jwsim/tank",
  version: "1.0.0",
  name: "Tanque con bomba",
  category: "Planta",
  description:
    "Tanque que llena una bomba de la escena (parámetro Bomba, p. ej. M1.running) y vacía un consumo continuo. El nivel (T1.nivel, de 0 a 1) acciona los finales de carrera o sensores de nivel con Desde/Hasta (p. ej. nivel alto: Desde 0,8 Hasta 1). Avisa si rebalsa o queda vacío.",
  parameters: [
    { id: "bomba", label: "Bomba", type: "string", default: "", hint: "dispositivo.salida: 1 = bombea, p. ej. M1.running" },
    { id: "volumen", label: "Volumen", type: "number", default: 200, unit: "L" },
    { id: "caudal", label: "Caudal de la bomba", type: "number", default: 40, unit: "L/min" },
    { id: "consumo", label: "Consumo", type: "number", default: 15, unit: "L/min" },
    { id: "nivel0", label: "Nivel inicial", type: "number", default: 50, unit: "%" },
  ],
  terminals: [],
  actions: [{ id: "consumo", label: "Consumo", kind: "value", min: 0, max: 100, unit: "L/min" }],
  reads: (p) => (p.bomba ? [{ id: "bomba", source: String(p.bomba) }] : []),
  create(ctx) {
    const p = ctx.params;
    const vol = Math.max(1, num(p.volumen, 200));
    let level = clamp01(num(p.nivel0, 50) / 100);
    /** @type {bigint | null} */
    let lastT = null;
    let rate = 0; // fracción por segundo
    return {
      update(t, inp) {
        if (lastT !== null && t > lastT) level = clamp01(level + rate * (Number(t - lastT) / 1e9));
        lastT = t;
        const pump = Math.max(0, Math.min(1, Math.abs(num(inp.values.bomba, 0))));
        const out = Math.max(0, num(inp.actions.consumo ?? p.consumo, 15));
        const net = (pump * num(p.caudal, 40) - out) / 60 / vol;
        rate = (level >= 1 && net > 0) || (level <= 0 && net < 0) ? 0 : net;
        const toEdge = rate > 0 ? (1 - level) / rate : rate < 0 ? -level / rate : undefined;
        return {
          outputs: {
            nivel: { value: level, rate },
            nivelPct: { value: level * 100, rate: rate * 100 },
            rebalse: level >= 1 && net > 0,
            vacio: level <= 0,
            bombeando: pump > 0,
          },
          nextEventNs: after(t, toEdge),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const door = {
  type: "jwsim/door",
  version: "1.0.0",
  name: "Puerta corrediza",
  category: "Planta",
  description:
    "Puerta corrediza movida por un motor de la escena (parámetro Motor, p. ej. M1.speed: positivo abre, negativo cierra). La posición (P1.posicion, 0 = cerrada, 1 = abierta) acciona los finales de carrera (cerrada: Desde 0 Hasta 0,01; abierta: Desde 0,99 Hasta 1). «Persona en la puerta» acciona la fotocelda (source P1.persona). Si el motor empuja contra un tope, avisa.",
  parameters: [
    { id: "motor", label: "Motor", type: "string", default: "", hint: "dispositivo.salida de -1 a 1, p. ej. M1.speed" },
    { id: "recorrido", label: "Tiempo de recorrido", type: "number", default: 6, unit: "s" },
    { id: "ancho", label: "Ancho", type: "number", default: 3, unit: "m" },
    { id: "posicion0", label: "Posición inicial", type: "number", default: 0, unit: "%" },
  ],
  terminals: [],
  actions: [{ id: "persona", label: "Persona en la puerta", kind: "toggle" }],
  reads: (p) => (p.motor ? [{ id: "motor", source: String(p.motor) }] : []),
  create(ctx) {
    const p = ctx.params;
    const T = Math.max(0.5, num(p.recorrido, 6));
    let pos = clamp01(num(p.posicion0, 0) / 100);
    /** @type {bigint | null} */
    let lastT = null;
    let lastS = 0;
    return {
      update(t, inp) {
        const s = Math.max(-1, Math.min(1, num(inp.values.motor, 0)));
        if (lastT !== null && t > lastT) pos = clamp01(pos + ((lastS + s) / 2 / T) * (Number(t - lastT) / 1e9));
        lastT = t;
        lastS = s;
        const blocked = (pos >= 1 && s > 0) || (pos <= 0 && s < 0);
        const rate = blocked ? 0 : s / T;
        const toEdge = rate > 0 ? (1 - pos) / rate : rate < 0 ? -pos / rate : undefined;
        return {
          outputs: {
            posicion: { value: pos, rate },
            posicionPct: { value: pos * 100, rate: rate * 100 },
            abierta: pos >= 0.99,
            cerrada: pos <= 0.01,
            forzando: blocked,
            persona: !!inp.actions.persona,
          },
          nextEventNs: earliest(after(t, toEdge), s !== 0 && Math.abs(s) < 1 ? after(t, RAMP_STEP_S) : undefined),
        };
      },
    };
  },
};
