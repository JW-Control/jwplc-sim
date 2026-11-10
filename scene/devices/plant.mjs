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

// Tanque: modelo de balance de volumen discretizado. La forma da el área de
// la sección a cada altura, A(h) ∝ f(h / H), y de ahí V(h); el estado es el
// volumen, que se integra con RK4 a paso fijo (pasoMs):
//   dV/dt = bomba × caudal − consumo − válvula × Cd · a · √(2 g h)
// (la última es la descarga por gravedad de Torricelli por un orificio de
// diámetro salidaMm). El nivel publicado es la fracción de la altura, en
// tramos lineales de un paso: los sensores enlazados ven el cruce exacto.
// Con área constante y sin descarga por gravedad el nivel es lineal y no
// hace falta discretizar (un solo tramo hasta el próximo cambio).
export const TANK_SHAPES = {
  "cilindro vertical": () => 1,
  rectangular: () => 1,
  "cilindro horizontal": (x) => Math.sqrt(Math.max(0, x * (1 - x))),
  "cono (tolva)": (x) => x * x,
  "prisma en V": (x) => x,
  "cuarto de círculo": (x) => Math.sqrt(Math.max(0, x * (2 - x))),
  esfera: (x) => Math.max(0, x * (1 - x)),
};
const CONSTANT_AREA = new Set(["cilindro vertical", "rectangular"]);
const G = 9.81;
const CD = 0.61; // coeficiente de descarga de un orificio de borde vivo

/**
 * Tabla V(x) normalizada (0 a 1) de una forma, para pasar de volumen a altura.
 * @param {(x: number) => number} f
 */
function volumeTable(f, n = 400) {
  const F = [0];
  for (let i = 1; i <= n; i++) F.push(F[i - 1] + (f((i - 1) / n) + f(i / n)) / 2 / n);
  const total = F[n];
  return F.map((v) => v / total);
}

/** Fracción de altura x para una fracción de volumen v (tabla monótona). @param {number[]} F @param {number} v */
function heightOf(F, v) {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  let lo = 0;
  let hi = F.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (F[mid] < v) lo = mid;
    else hi = mid;
  }
  const n = F.length - 1;
  const span = F[hi] - F[lo] || 1;
  return (lo + (v - F[lo]) / span) / n;
}

/** Fracción de volumen para una fracción de altura x. @param {number[]} F @param {number} x */
function volumeOf(F, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const n = F.length - 1;
  const i = Math.min(n - 1, Math.floor(x * n));
  return F[i] + (F[i + 1] - F[i]) * (x * n - i);
}

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const tank = {
  type: "jwsim/tank",
  version: "1.1.0",
  name: "Tanque con bomba",
  category: "Planta",
  description:
    "Tanque con modelo de balance de volumen discretizado. Forma (cilindro vertical u horizontal, rectangular, cono, prisma en V, cuarto de círculo o esfera): da el área de la sección a cada altura, así el nivel sube más rápido donde el tanque es angosto. Lo llena una bomba de la escena (parámetro Bomba, p. ej. M1.running o la velocidad de un variador) y lo vacían un consumo fijo y, con «Diámetro de la descarga», una descarga por gravedad (Torricelli: más caudal con más altura) que abre otra salida (p. ej. Y1.open de una electroválvula; vacía = siempre abierta). Se integra con RK4 al paso de discretización. El nivel (T1.nivel, fracción de la altura de 0 a 1) acciona los sensores de nivel con Desde/Hasta (p. ej. nivel alto: Desde 0,8 Hasta 1). Avisa si rebalsa o queda vacío.",
  parameters: [
    { id: "forma", label: "Forma", type: "enum", options: Object.keys(TANK_SHAPES), default: "cilindro vertical", design: true },
    { id: "volumen", label: "Capacidad", type: "number", default: 200, unit: "L" },
    { id: "alto", label: "Alto", type: "number", default: 1.2, unit: "m", hint: "en el cilindro horizontal y la esfera, el diámetro" },
    { id: "bomba", label: "Bomba", type: "string", default: "", hint: "dispositivo.salida de 0 a 1, p. ej. M1.running" },
    { id: "caudal", label: "Caudal de la bomba", type: "number", default: 40, unit: "L/min" },
    { id: "consumo", label: "Consumo fijo", type: "number", default: 15, unit: "L/min" },
    { id: "salidaMm", label: "Diámetro de la descarga", type: "number", default: 0, unit: "mm", hint: "0 = sin descarga por gravedad" },
    { id: "valvula", label: "Válvula de descarga", type: "string", default: "", hint: "dispositivo.salida, p. ej. Y1.open (vacía: siempre abierta)" },
    { id: "nivel0", label: "Nivel inicial", type: "number", default: 50, unit: "%" },
    { id: "pasoMs", label: "Paso de discretización", type: "number", default: 100, unit: "ms", hint: "1 a 1000 ms: más chico, más preciso y más lento" },
  ],
  terminals: [],
  actions: [{ id: "consumo", label: "Consumo", kind: "value", min: 0, max: 100, unit: "L/min" }],
  reads: (p) => [
    ...(p.bomba ? [{ id: "bomba", source: String(p.bomba) }] : []),
    ...(p.valvula ? [{ id: "valvula", source: String(p.valvula) }] : []),
  ],
  create(ctx) {
    const p = ctx.params;
    const forma = String(p.forma) in TANK_SHAPES ? String(p.forma) : "cilindro vertical";
    const F = volumeTable(TANK_SHAPES[forma]);
    const vmax = Math.max(1, num(p.volumen, 200)); // L
    const H = Math.max(0.05, num(p.alto, 1.2)); // m
    const dOut = Math.max(0, num(p.salidaMm, 0)) / 1000; // m
    const aOut = (Math.PI * dOut * dOut) / 4;
    const stepS = Math.max(1, Math.min(1000, num(p.pasoMs, 100))) / 1000;
    const linear = CONSTANT_AREA.has(forma) && aOut === 0;
    let V = vmax * volumeOf(F, clamp01(num(p.nivel0, 50) / 100));
    /** @type {bigint | null} */
    let lastT = null;
    // Entradas vigentes desde el último update (las aplica la integración).
    let inp0 = { pump: 0, consumo: 0, valve: 0 };
    /** Caudal neto (L/s) con el volumen V y las entradas `u`. */
    const flow = (vol, u) => {
      const h = heightOf(F, vol / vmax) * H;
      const grav = u.valve * CD * aOut * Math.sqrt(2 * G * Math.max(0, h)) * 1000;
      let d = (u.pump * num(p.caudal, 40) - u.consumo) / 60 - grav;
      if ((vol >= vmax && d > 0) || (vol <= 0 && d < 0)) d = 0;
      return d;
    };
    const clampV = (v) => Math.max(0, Math.min(vmax, v));
    /** Avanza el volumen `sec` segundos (RK4 a paso fijo; exacto si es lineal). */
    const advance = (sec) => {
      if (sec <= 0) return;
      if (linear) {
        V = clampV(V + flow(V, inp0) * sec);
        return;
      }
      const n = Math.max(1, Math.ceil(sec / stepS - 1e-9));
      const h = sec / n;
      for (let i = 0; i < n; i++) {
        const k1 = flow(V, inp0);
        const k2 = flow(clampV(V + (k1 * h) / 2), inp0);
        const k3 = flow(clampV(V + (k2 * h) / 2), inp0);
        const k4 = flow(clampV(V + k3 * h), inp0);
        V = clampV(V + ((k1 + 2 * k2 + 2 * k3 + k4) * h) / 6);
      }
    };
    return {
      update(t, inp) {
        if (lastT !== null && t > lastT) advance(Number(t - lastT) / 1e9);
        lastT = t;
        const valveSrc = p.valvula ? Math.max(0, Math.min(1, Math.abs(num(inp.values.valvula, 0)))) : 1;
        inp0 = {
          pump: Math.max(0, Math.min(1, Math.abs(num(inp.values.bomba, 0)))),
          consumo: Math.max(0, num(inp.actions.consumo ?? p.consumo, 15)),
          valve: aOut > 0 ? valveSrc : 0,
        };
        const x = heightOf(F, V / vmax);
        const dV = flow(V, inp0);
        // Tramo del nivel: la pendiente de un paso (o la exacta si es lineal).
        let rate = 0;
        /** @type {number | undefined} */
        let next;
        if (dV !== 0) {
          const toEdge = dV > 0 ? (vmax - V) / dV : -V / dV;
          if (linear) {
            rate = dV / vmax;
            next = toEdge;
          } else {
            const dt = Math.min(stepS, toEdge);
            rate = dt > 0 ? (heightOf(F, clampV(V + dV * dt) / vmax) - x) / dt : 0;
            next = Math.max(dt, 1e-6);
          }
        }
        const h = x * H;
        const grav = inp0.valve * CD * aOut * Math.sqrt(2 * G * h) * 60000;
        return {
          outputs: {
            nivel: { value: x, rate },
            nivelPct: { value: x * 100, rate: rate * 100 },
            alturaM: { value: h, rate: rate * H },
            volumenL: Math.round(V * 10) / 10,
            caudalEntrada: Math.round(inp0.pump * num(p.caudal, 40) * 10) / 10,
            caudalSalida: Math.round((inp0.consumo + (V > 0 ? grav : 0)) * 10) / 10,
            rebalse: V >= vmax && inp0.pump * num(p.caudal, 40) / 60 - inp0.consumo / 60 - grav / 60000 > 0,
            vacio: V <= 0,
            bombeando: inp0.pump > 0,
            descargando: inp0.valve > 0 && V > 0,
          },
          nextEventNs: after(t, next),
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
