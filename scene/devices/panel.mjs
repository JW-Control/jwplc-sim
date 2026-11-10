// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Equipos de tablero de la tanda 1: relé temporizador multifunción, relé de
// estado sólido, torre de señalización, interruptor termomagnético y
// guardamotor.

import { Delay, earliest, ms } from "../device-kit.mjs";
import { NR2_25_RANGES } from "./drives.mjs";

const RATINGS = ["24VDC", "230VAC"];
const fmtA = (v) => `${Number(v.toFixed(2))}`.replace(".", ",");

/**
 * Imagen térmica de un bimetal: θ tiende a (I / In)² con la constante τ (s).
 * 1 = régimen con la corriente nominal.
 * @param {number} tauS
 */
function thermalImage(tauS) {
  const tau = Math.max(1, tauS);
  let theta = 0;
  let x2 = 0;
  /** @type {bigint | null} */
  let lastT = null;
  return {
    /** @param {bigint} t @param {number} ratio corriente / nominal */
    update(t, ratio) {
      if (lastT !== null && t > lastT) theta = x2 + (theta - x2) * Math.exp(-Number(t - lastT) / 1e9 / tau);
      lastT = t;
      x2 = ratio * ratio;
      return theta;
    },
    get theta() {
      return theta;
    },
    /** Instante (ns) en que θ llega a `goal` con la corriente actual, o undefined. @param {bigint} t @param {number} goal */
    when(t, goal) {
      if ((x2 - goal) * (x2 - theta) <= 0 || (goal - theta) * (x2 - theta) < 0) return undefined;
      const sec = -tau * Math.log((x2 - goal) / (x2 - theta));
      return t + BigInt(Math.max(1, Math.ceil(sec * 1e9)));
    },
  };
}

/**
 * Palanca o manija que el usuario alterna con una acción "toggle": cada
 * cambio de la acción es un giro. Devuelve true en el instante del giro.
 */
function lever() {
  /** @type {boolean | undefined} */
  let last;
  return (/** @type {unknown} */ action) => {
    const a = !!action;
    if (last === undefined) {
      last = a;
      return false;
    }
    if (a === last) return false;
    last = a;
    return true;
  };
}

// ------------------------------------------------------------------ temporizador
export const TIMER_MODES = ["retardo a la conexión", "retardo a la desconexión", "intermitente", "impulso", "estrella-triángulo"];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const timerRelay = {
  type: "jwsim/timer-relay",
  version: "1.0.0",
  name: "Relé temporizador",
  category: "Maniobra",
  description:
    "Relé temporizador multifunción de riel DIN (Schneider RE22R2 / CHINT NJS2-Z), bobina A1-A2 y dos contactos conmutados 15-16-18 y 25-26-28. Modos: retardo a la conexión (cierra 15-18 el tiempo después de energizar), retardo a la desconexión (se mantiene el tiempo después de quitar la bobina), intermitente (alterna cada tiempo, empieza cerrado), impulso (cierra al energizar durante el tiempo) y estrella-triángulo (15-18 = estrella desde que se energiza hasta el tiempo; 25-28 = triángulo después de la pausa de conmutación). LED U: alimentado; LED R: relé cerrado.",
  parameters: [
    { id: "coil", label: "Alimentación A1-A2", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "mode", label: "Función", type: "enum", options: TIMER_MODES, default: TIMER_MODES[0] },
    { id: "time", label: "Tiempo", type: "number", default: 5, unit: "s", hint: "0,1 a 300 s" },
    { id: "pauseMs", label: "Pausa estrella → triángulo", type: "number", default: 50, unit: "ms" },
  ],
  terminals: [
    { id: "A1" }, { id: "A2" },
    { id: "15", label: "15 (común 1)" }, { id: "16", label: "16 (NC 1)" }, { id: "18", label: "18 (NA 1)" },
    { id: "25", label: "25 (común 2)" }, { id: "26", label: "26 (NC 2)" }, { id: "28", label: "28 (NA 2)" },
  ],
  electrical: (p) => ({
    loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.coil), coil: true }],
    contacts: { "15-18": ["15", "18"], "15-16": ["15", "16"], "25-28": ["25", "28"], "25-26": ["25", "26"] },
  }),
  create(ctx) {
    const p = ctx.params;
    const mode = TIMER_MODES.includes(String(p.mode)) ? String(p.mode) : TIMER_MODES[0];
    const T = ms(Math.max(0.1, Math.min(300, Number(p.time) || 0.1)) * 1000);
    const pause = ms(Math.max(0, Number(p.pauseMs) || 0));
    /** @type {bigint | null} */
    let onSince = null;
    /** @type {bigint | null} */
    let offSince = null;
    let wasOn = false;
    return {
      update(t, inp) {
        const on = inp.loads.coil.on;
        if (on && onSince === null) {
          onSince = t;
          offSince = null;
          wasOn = true;
        } else if (!on && onSince !== null) {
          onSince = null;
          offSince = t;
        }
        const since = onSince === null ? 0n : t - onSince;
        /** @type {boolean} */
        let c1 = false;
        /** @type {boolean} */
        let c2 = false;
        /** @type {bigint | undefined} */
        let next;
        let timing = false;
        let progress = 0;
        if (mode === "retardo a la conexión") {
          c1 = on && since >= T;
          timing = on && !c1;
          if (timing && onSince !== null) next = onSince + T;
          progress = on ? Math.min(1, Number(since) / Number(T)) : 0;
        } else if (mode === "retardo a la desconexión") {
          const rest = offSince === null ? undefined : offSince + T;
          c1 = on || (wasOn && rest !== undefined && t < rest);
          timing = !on && c1;
          if (timing) next = rest;
          progress = timing && offSince !== null ? Math.min(1, Number(t - offSince) / Number(T)) : 0;
        } else if (mode === "intermitente") {
          if (on && onSince !== null) {
            const k = since / T;
            c1 = k % 2n === 0n;
            next = onSince + (k + 1n) * T;
            timing = true;
            progress = Number(since % T) / Number(T);
          }
        } else if (mode === "impulso") {
          c1 = on && since < T;
          timing = c1;
          if (c1 && onSince !== null) next = onSince + T;
          progress = c1 ? Number(since) / Number(T) : 0;
        } else {
          // Estrella-triángulo: 15-18 estrella hasta T; 25-28 triángulo desde T + pausa.
          c1 = on && since < T;
          c2 = on && since >= T + pause;
          timing = on && !c2;
          if (on && onSince !== null) next = since < T ? onSince + T : !c2 ? onSince + T + pause : undefined;
          progress = on ? Math.min(1, Number(since) / Number(T)) : 0;
        }
        if (mode !== "estrella-triángulo") c2 = c1;
        const remaining = timing && next !== undefined ? Math.max(0, Number(next - t) / 1e9) : 0;
        return {
          contacts: { "15-18": c1, "15-16": !c1, "25-28": c2, "25-26": !c2 },
          outputs: {
            energized: on,
            closed: c1 || c2,
            closed1: c1,
            closed2: c2,
            timing,
            progress: Math.round(progress * 1000) / 1000,
            remaining: Math.round(remaining * 10) / 10,
            timeTxt: `${String(Number(p.time) || 0).replace(".", ",")} s`,
          },
          nextEventNs: earliest(next),
        };
      },
    };
  },
};

// ------------------------------------------------------------------ relé de estado sólido
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const ssr = {
  type: "jwsim/ssr",
  version: "1.0.0",
  name: "Relé de estado sólido",
  category: "Maniobra",
  description:
    "Relé de estado sólido Fotek SSR-40DA: entrada 3-32 VDC en 3 (+) y 4 (−), salida 24-380 VAC 40 A en 1-2, sin contactos móviles (conmuta en el cruce por cero, en menos de 10 ms). Sirve para resistencias calefactoras y cargas que conmutan seguido. La salida solo es para corriente alterna. LED rojo: entrada activa.",
  parameters: [{ id: "label", label: "Rótulo", type: "string", default: "" }],
  terminals: [
    { id: "1", label: "1 (carga AC)" }, { id: "2", label: "2 (carga AC)" },
    { id: "3", label: "3 (+ entrada)" }, { id: "4", label: "4 (− entrada)" },
  ],
  electrical: () => ({
    loads: [{ id: "input", a: "3", b: "4", rating: "24VDC", polar: true }],
    contacts: { "1-2": ["1", "2"] },
  }),
  create() {
    const d = new Delay(ms(8.3), ms(8.3));
    return {
      update(t, inp) {
        const on = d.step(t, inp.loads.input.on);
        return { contacts: { "1-2": on }, outputs: { on, input: inp.loads.input.on }, nextEventNs: earliest(d.next) };
      },
    };
  },
};

// ------------------------------------------------------------------ torre de señalización
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const stackLight = {
  type: "jwsim/stack-light",
  version: "1.0.0",
  name: "Torre de señalización",
  category: "Señalización",
  description:
    "Torre de señalización LED de 3 niveles con zumbador (tipo LTA-205-3, Ø50 mm): rojo (falla), ámbar (aviso) y verde (en marcha), cada uno entre su borne y el común COM (cable negro). Z hace sonar el zumbador.",
  parameters: [
    { id: "rating", label: "Tensión", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "label", label: "Rótulo", type: "string", default: "" },
  ],
  terminals: [
    { id: "COM", label: "COM (común, negro)" },
    { id: "R", label: "Rojo" },
    { id: "A", label: "Ámbar" },
    { id: "V", label: "Verde" },
    { id: "Z", label: "Zumbador" },
  ],
  electrical: (p) => ({
    loads: ["R", "A", "V", "Z"].map((k) => ({ id: k, a: k, b: "COM", rating: String(p.rating) })),
  }),
  create: () => ({
    update: (_t, inp) => ({
      outputs: { red: inp.loads.R.on, amber: inp.loads.A.on, green: inp.loads.V.on, buzzer: inp.loads.Z.on },
    }),
  }),
};

// ------------------------------------------------------------------ termomagnético
const MCB_CURRENTS = ["2", "4", "6", "10", "16", "20", "25", "32"];
// Disparo magnético instantáneo (múltiplo de In) según la curva (IEC 60898-1:
// B de 3 a 5, C de 5 a 10, D de 10 a 20): aquí el punto medio.
const MCB_MAGNETIC = { B: 4, C: 7.5, D: 15 };

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const breaker = {
  type: "jwsim/breaker",
  version: "1.0.0",
  name: "Interruptor termomagnético",
  category: "Protección",
  description:
    "Interruptor termomagnético CHINT NXB-63 (IEC 60898-1) de 1, 2 o 3 polos: entrada 1/3/5 arriba y salida 2/4/6 abajo. Mide la corriente de la salida: dispara por sobrecarga según su imagen térmica (no dispara con 1,13 × In, sí con 1,45 × In) y al instante por cortocircuito o pico (curva B: 4 × In, C: 7,5 × In, D: 15 × In). Al disparar la palanca baja; se rearma subiéndola cuando se enfría. Un cortocircuito directo de la red lo corta la protección de la fuente.",
  parameters: [
    { id: "poles", label: "Polos", type: "enum", options: ["1P", "2P", "3P"], default: "1P" },
    { id: "In", label: "Corriente nominal", type: "enum", options: MCB_CURRENTS, default: "6", unit: "A" },
    { id: "curve", label: "Curva", type: "enum", options: ["B", "C", "D"], default: "C" },
    { id: "start", label: "Al arrancar", type: "enum", options: ["cerrado (I)", "abierto (O)"], default: "cerrado (I)" },
    { id: "tauS", label: "Constante térmica", type: "number", default: 60, unit: "s", hint: "acortada para el taller" },
  ],
  terminals: [
    { id: "1", label: "1 (entrada)" }, { id: "3", label: "3 (entrada)" }, { id: "5", label: "5 (entrada)" },
    { id: "2", label: "2 (salida)" }, { id: "4", label: "4 (salida)" }, { id: "6", label: "6 (salida)" },
  ],
  actions: [{ id: "lever", label: "Palanca I/O", kind: "toggle" }],
  electrical: () => ({ contacts: { "1-2": ["1", "2"], "3-4": ["3", "4"], "5-6": ["5", "6"] } }),
  currentSensors: () => [{ id: "out", terminals: ["2", "4", "6"] }],
  create(ctx) {
    const p = ctx.params;
    const In = Number(p.In) || 6;
    const curve = /** @type {"B" | "C" | "D"} */ (["B", "C", "D"].includes(String(p.curve)) ? String(p.curve) : "C");
    const heat = thermalImage(Number(p.tauS) || 60);
    const TRIP = 1.3 ** 2; // entre 1,13 y 1,45 × In
    const flip = lever();
    let on = !String(p.start).startsWith("abierto");
    let tripped = false;
    return {
      update(t, inp) {
        const amps = Object.values(inp.currents?.out ?? {});
        const I = on && amps.length ? Math.max(...amps) : 0;
        const theta = heat.update(t, I / In);
        if (flip(inp.actions.lever)) {
          // Subir la palanca rearma solo si el bimetal se enfrió.
          if (on) on = false;
          else if (heat.theta < 1) {
            on = true;
            tripped = false;
          }
        }
        if (on && (theta >= TRIP - 1e-9 || I >= MCB_MAGNETIC[curve] * In)) {
          on = false;
          tripped = true;
        }
        return {
          contacts: { "1-2": on, "3-4": on, "5-6": on },
          outputs: {
            on,
            tripped,
            corriente: Math.round(I * 100) / 100,
            calor: Math.round((theta / TRIP) * 100),
            rating: `${curve}${In}`,
          },
          nextEventNs: on ? heat.when(t, TRIP) : undefined,
        };
      },
    };
  },
};

// ------------------------------------------------------------------ guardamotor
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const motorProtector = {
  type: "jwsim/motor-protector",
  version: "1.0.0",
  name: "Guardamotor CHINT NS2-25",
  category: "Protección",
  description:
    "Guardamotor (disyuntor de motor) CHINT NS2-25 con contacto auxiliar NS2-AE11: polos 1-2, 3-4 y 5-6 con protección térmica de clase 10 ajustable (dial) y magnética instantánea a 13 veces el máximo del rango, más disparo por falta de fase. La perilla se gira a I para cerrar y a O para abrir; al disparar queda en TRIP y hay que llevarla a O antes de volver a I (con el bimetal frío). TEST dispara. Auxiliar: 13-14 NA y 21-22 NC siguen a los polos.",
  parameters: [
    { id: "range", label: "Rango", type: "enum", options: NR2_25_RANGES, default: "2.5-4 A" },
    { id: "ajuste", label: "Ajuste (dial)", type: "number", default: 3.2, unit: "A", hint: "dentro del rango; corriente nominal del motor" },
    { id: "start", label: "Al arrancar", type: "enum", options: ["abierto (O)", "cerrado (I)"], default: "abierto (O)" },
    { id: "tripMs", label: "Tiempo de disparo (falta de fase)", type: "number", default: 4000, unit: "ms" },
    { id: "tauS", label: "Constante térmica", type: "number", default: 120, unit: "s", hint: "120 s da la curva de clase 10" },
  ],
  terminals: [
    { id: "1", label: "1/L1" }, { id: "3", label: "3/L2" }, { id: "5", label: "5/L3" },
    { id: "2", label: "2/T1" }, { id: "4", label: "4/T2" }, { id: "6", label: "6/T3" },
    { id: "13" }, { id: "14" }, { id: "21" }, { id: "22" },
  ],
  actions: [
    { id: "knob", label: "Perilla I/O", kind: "toggle" },
    { id: "test", label: "TEST (disparar)", kind: "momentary" },
  ],
  electrical: () => ({
    phaseLoads: [{ id: "line", terminals: ["1", "3", "5"] }],
    contacts: { "1-2": ["1", "2"], "3-4": ["3", "4"], "5-6": ["5", "6"], "13-14": ["13", "14"], "21-22": ["21", "22"] },
  }),
  currentSensors: () => [{ id: "line", terminals: ["2", "4", "6"] }],
  create(ctx) {
    const p = ctx.params;
    const [lo, hi] = String(p.range).replace(" A", "").split("-").map(Number);
    const ajuste = Math.min(hi, Math.max(lo, Number(p.ajuste) || lo));
    const heat = thermalImage(Number(p.tauS) || 120);
    const TRIP = 1.15 ** 2;
    const flip = lever();
    let on = String(p.start).startsWith("cerrado");
    let tripped = false;
    /** @type {bigint | null} */
    let lossSince = null;
    return {
      update(t, inp) {
        const amps = Object.values(inp.currents?.line ?? {});
        const I = on && amps.length ? Math.max(...amps) : 0;
        const theta = heat.update(t, I / ajuste);
        const terms = inp.phases?.line?.terms ?? {};
        const n = new Set(["1", "3", "5"].map((k) => terms[k]?.phase).filter(Boolean)).size;
        const loss = on && (n === 1 || n === 2);
        if (loss) lossSince ??= t;
        else lossSince = null;
        const due = lossSince === null ? undefined : lossSince + ms(p.tripMs);
        if (flip(inp.actions.knob)) {
          // Disparado: la perilla va a O (rearma); en O, a I si el bimetal se enfrió.
          if (tripped) tripped = false;
          else if (on) on = false;
          else if (heat.theta < 1) on = true;
        }
        if (on && (inp.actions.test || theta >= TRIP - 1e-9 || I >= 13 * hi || (due !== undefined && t >= due))) {
          on = false;
          tripped = true;
        }
        return {
          contacts: { "1-2": on, "3-4": on, "5-6": on, "13-14": on, "21-22": !on },
          outputs: {
            on,
            tripped,
            // Perilla: 0 = O, 0,5 = TRIP, 1 = I.
            knob: on ? 1 : tripped ? 0.5 : 0,
            faltaFase: loss,
            corriente: Math.round(I * 100) / 100,
            calor: Math.round((theta / TRIP) * 100),
            ajusteRel: hi > lo ? (ajuste - lo) / (hi - lo) : 0,
            ajusteTxt: `${fmtA(ajuste)} A (${fmtA(lo)}-${fmtA(hi)})`,
          },
          nextEventNs: on ? earliest(due, heat.when(t, TRIP)) : undefined,
        };
      },
    };
  },
};
