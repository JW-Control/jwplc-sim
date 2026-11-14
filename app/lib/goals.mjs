// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Objetivos en vivo de un ejercicio (sección "goals" de rubrica.json).
//
// Mientras el alumno corre la simulación y opera la escena a mano, cada
// objetivo muestra su lectura, la condición y una barra que se llena
// mientras la condición se sostiene (en tiempo simulado). No da nota: la
// nota sigue saliendo de "cases" con Calificar.
//
//   { "id": "arranca", "description": "…", "when": { "KM1.closed": true,
//     "T1.level": [60, 80] }, "hold_ms": 2000, "after": "otro_id",
//     "extra": "merit" | "distinction" }
//
// Valores: un escalar se compara por igualdad (true = 1); [min, max] es un
// rango cerrado. Claves: I0_k (entrada del PLC), Q0_k (relé de salida del
// PLC) y <equipo>.<salida>, como en los "cases".

const num = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : Number(v ?? 0));
const toMs = (t) => Number(t) / 1e6;

/**
 * Valor de una clave en un snapshot de la escena.
 * @param {{ inputs?: Record<string, unknown>, devices?: { id: string, type: string, outputs?: Record<string, unknown>, contacts?: Record<string, unknown> }[] }} snap
 * @param {string} key
 */
export function readSignal(snap, key) {
  if (/^I0_\d+$/.test(key)) return snap.inputs?.[key] ?? 0;
  if (/^Q0_\d+$/.test(key)) {
    const plc = snap.devices?.find((d) => d.contacts && key in d.contacts);
    return plc ? plc.contacts[key] : 0;
  }
  const dot = key.indexOf(".");
  if (dot < 0) return undefined;
  const dev = snap.devices?.find((d) => d.id === key.slice(0, dot));
  const k = key.slice(dot + 1);
  if (!dev) return undefined;
  if (dev.outputs && k in dev.outputs) return dev.outputs[k];
  if (dev.contacts && k in dev.contacts) return dev.contacts[k];
  return undefined;
}

/** ¿Cumple el valor lo pedido? @param {unknown} got @param {unknown} want */
export function matches(got, want) {
  if (got === undefined) return false;
  if (Array.isArray(want)) return num(got) >= num(want[0]) && num(got) <= num(want[1]);
  return Math.abs(num(got) - num(want)) < 1e-6;
}

/**
 * Valida la sección "goals"; lanza con un mensaje claro si algo no sirve.
 * @param {unknown} goals @param {string} [file]
 */
export function checkGoals(goals, file = "rubrica.json") {
  const bad = (m) => new Error(`${file}: goals: ${m}`);
  if (goals === undefined) return;
  if (!Array.isArray(goals)) throw bad("debe ser una lista");
  const ids = new Set();
  goals.forEach((g, i) => {
    if (!g || typeof g !== "object") throw bad(`[${i}] debe ser un objeto`);
    if (typeof g.id !== "string" || !g.id) throw bad(`[${i}] falta 'id'`);
    if (ids.has(g.id)) throw bad(`'${g.id}' repetido`);
    if (typeof g.description !== "string" || !g.description) throw bad(`'${g.id}': falta 'description'`);
    if (!g.when || typeof g.when !== "object" || !Object.keys(g.when).length) throw bad(`'${g.id}': 'when' debe tener al menos una señal`);
    for (const [k, v] of Object.entries(g.when)) {
      if (Array.isArray(v) && (v.length !== 2 || !(num(v[0]) <= num(v[1])))) throw bad(`'${g.id}': rango de ${k} debe ser [min, max]`);
    }
    if (g.hold_ms !== undefined && !(Number(g.hold_ms) >= 0)) throw bad(`'${g.id}': 'hold_ms' debe ser >= 0`);
    if (g.after !== undefined && !ids.has(g.after)) throw bad(`'${g.id}': 'after' debe nombrar un objetivo anterior`);
    if (g.extra !== undefined && !["merit", "distinction"].includes(g.extra)) throw bad(`'${g.id}': 'extra' es merit o distinction`);
    ids.add(g.id);
  });
}

/**
 * Sigue el avance de los objetivos durante una corrida. Un objetivo cumplido
 * queda cumplido hasta reset(); uno con "after" no empieza a contar hasta
 * que se cumpla el anterior.
 */
export class GoalTracker {
  /** @param {any[]} goals */
  constructor(goals) {
    this.goals = goals;
    this.reset();
  }

  reset() {
    /** @type {Map<string, { since: number | null, held: number, done: boolean }>} */
    this.st = new Map(this.goals.map((g) => [g.id, { since: null, held: 0, done: false }]));
    this.lastT = null;
  }

  /** Avance con un snapshot nuevo de la escena. */
  update(snap) {
    // Snapshot de la sesión (t_ms) o de la escena (t en ns).
    const t = snap.t_ms ?? toMs(snap.t ?? 0);
    // El tiempo volvió atrás: corrida nueva.
    if (this.lastT !== null && t < this.lastT) this.reset();
    this.lastT = t;
    const goals = this.goals.map((g) => {
      const s = this.st.get(g.id);
      const hold = Number(g.hold_ms ?? 0);
      const reading = Object.fromEntries(Object.keys(g.when).map((k) => [k, readSignal(snap, k)]));
      const blocked = g.after !== undefined && !this.st.get(g.after).done;
      const ok = !blocked && Object.entries(g.when).every(([k, want]) => matches(reading[k], want));
      if (!s.done) {
        if (ok) {
          s.since ??= t;
          s.held = t - s.since;
          if (s.held >= hold) s.done = true;
        } else {
          s.since = null;
          s.held = 0;
        }
      }
      const state = s.done ? "done" : blocked ? "blocked" : ok ? "active" : "pending";
      return {
        id: g.id,
        description: g.description,
        extra: g.extra ?? null,
        when: g.when,
        reading,
        hold_ms: hold,
        held_ms: Math.round(s.done ? hold : s.held),
        fraction: s.done ? 1 : hold > 0 ? Math.min(1, s.held / hold) : 0,
        state,
      };
    });
    const required = goals.filter((g) => !g.extra);
    return { t_ms: Math.round(t), goals, complete: required.length > 0 && required.every((g) => g.state === "done") };
  }
}
