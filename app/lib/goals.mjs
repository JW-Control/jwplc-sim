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
//
// En lugar de "when" (o junto con él) un objetivo puede pedir:
//   "console": "expresión"   una línea del Monitor Serie que coincide
//   "period": "Q0_0" | { "console": "expresión" }, con "cycle_ms",
//     "on_ms" u "off_ms" ([min, max]) y "cycles" (3 por defecto): la señal
//     o la línea se repite con ese ritmo; la barra cuenta los ciclos buenos.
// "hint" (pista si cuesta) y "why" (qué enseña, al lograrlo) son texto.

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
    const hasWhen = g.when !== undefined;
    if (!hasWhen && g.console === undefined && g.period === undefined) throw bad(`'${g.id}': falta 'when', 'console' o 'period'`);
    if (hasWhen && (!g.when || typeof g.when !== "object" || !Object.keys(g.when).length)) throw bad(`'${g.id}': 'when' debe tener al menos una señal`);
    if (g.console !== undefined) {
      if (typeof g.console !== "string" || !g.console) throw bad(`'${g.id}': 'console' es una expresión regular`);
      try {
        new RegExp(g.console);
      } catch {
        throw bad(`'${g.id}': 'console' no es una expresión regular válida`);
      }
    }
    if (g.period !== undefined) checkPeriodGoal(g, bad);
    for (const x of ["hint", "why"]) if (g[x] !== undefined && typeof g[x] !== "string") throw bad(`'${g.id}': '${x}' es texto`);
    for (const [k, v] of Object.entries(g.when ?? {})) {
      if (Array.isArray(v) && (v.length !== 2 || !(num(v[0]) <= num(v[1])))) throw bad(`'${g.id}': rango de ${k} debe ser [min, max]`);
    }
    if (g.hold_ms !== undefined && !(Number(g.hold_ms) >= 0)) throw bad(`'${g.id}': 'hold_ms' debe ser >= 0`);
    if (g.after !== undefined && !ids.has(g.after)) throw bad(`'${g.id}': 'after' debe nombrar un objetivo anterior`);
    if (g.extra !== undefined && !["merit", "distinction"].includes(g.extra)) throw bad(`'${g.id}': 'extra' es merit o distinction`);
    ids.add(g.id);
  });
}

const isRange = (r) => Array.isArray(r) && r.length === 2 && num(r[0]) <= num(r[1]);
const PERIOD_KEYS = ["cycle_ms", "on_ms", "off_ms"];

function checkPeriodGoal(g, bad) {
  const p = g.period;
  if (!(typeof p === "string" && p) && !(p && typeof p.console === "string")) throw bad(`'${g.id}': 'period' es una señal («Q0_0») o { "console": "…" }`);
  if (!PERIOD_KEYS.some((x) => x in g)) throw bad(`'${g.id}': 'period' requiere cycle_ms, on_ms u off_ms`);
  for (const x of PERIOD_KEYS) if (x in g && !isRange(g[x])) throw bad(`'${g.id}': '${x}' debe ser [min, max]`);
  if (typeof p !== "string" && ("on_ms" in g || "off_ms" in g)) throw bad(`'${g.id}': on_ms y off_ms solo valen para una señal`);
  if (g.cycles !== undefined && !(Number.isInteger(g.cycles) && g.cycles >= 1)) throw bad(`'${g.id}': 'cycles' debe ser un entero >= 1`);
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
    /** @type {Map<string, { since: number | null, held: number, done: boolean, level: number | null, edges: [number, number][], lines: number[] }>} */
    this.st = new Map(this.goals.map((g) => [g.id, { since: null, held: 0, done: false, level: null, edges: [], lines: [] }]));
    this.lastT = null;
    this.partial = "";
    /** @type {[number, string][]} líneas nuevas desde el último update */
    this.pending = [];
  }

  /** Texto del Monitor Serie (puerto 0) que llegó del firmware. */
  serial(text, t_ms) {
    const parts = (this.partial + String(text)).split(/\r?\n/);
    this.partial = parts.pop() ?? "";
    for (const l of parts) this.pending.push([t_ms ?? this.lastT ?? 0, l]);
  }

  /** Avance con un snapshot nuevo de la escena. */
  update(snap) {
    // Snapshot de la sesión (t_ms) o de la escena (t en ns).
    const t = snap.t_ms ?? toMs(snap.t ?? 0);
    // El tiempo volvió atrás: corrida nueva.
    if (this.lastT !== null && t < this.lastT) this.reset();
    this.lastT = t;
    const lines = this.pending;
    this.pending = [];
    const goals = this.goals.map((g) => {
      const s = this.st.get(g.id);
      const hold = Number(g.hold_ms ?? 0);
      const when = g.when ?? {};
      const reading = Object.fromEntries(Object.keys(when).map((k) => [k, readSignal(snap, k)]));
      const blocked = g.after !== undefined && !this.st.get(g.after).done;
      let ok = !blocked && Object.entries(when).every(([k, want]) => matches(reading[k], want));
      if (g.console !== undefined) {
        const re = new RegExp(g.console);
        const hit = !blocked && lines.find(([, l]) => re.test(l));
        if (hit) s.lastLine = hit[1];
        if (s.lastLine !== undefined) reading.consola = s.lastLine;
        ok = ok && !blocked && !!(hit || (s.lastLine !== undefined && s.consoleOk));
        if (hit) s.consoleOk = true;
      }
      let fraction = null;
      if (g.period !== undefined) {
        const p = periodStep(g, s, snap, t, lines, blocked);
        reading.ritmo = p.reading;
        fraction = p.fraction;
        ok = ok && !blocked && p.ok;
      }
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
      const state = s.done ? "done" : blocked ? "blocked" : ok || (fraction ?? 0) > 0 ? "active" : "pending";
      return {
        id: g.id,
        description: g.description,
        extra: g.extra ?? null,
        when,
        ...(g.console !== undefined ? { console: g.console } : {}),
        ...(g.period !== undefined ? { period: periodLabel(g) } : {}),
        ...(g.hint ? { hint: g.hint } : {}),
        ...(g.why ? { why: g.why } : {}),
        reading,
        hold_ms: hold,
        held_ms: Math.round(s.done ? hold : s.held),
        fraction: s.done ? 1 : fraction !== null ? fraction : hold > 0 ? Math.min(1, s.held / hold) : 0,
        state,
      };
    });
    const required = goals.filter((g) => !g.extra);
    return { t_ms: Math.round(t), goals, complete: required.length > 0 && required.every((g) => g.state === "done") };
  }
}

const fmtR = (r) => `${r[0]}–${r[1]} ms`;

/** Lo que pide un objetivo de ritmo, en palabras cortas. */
function periodLabel(g) {
  const what = typeof g.period === "string" ? g.period : "consola";
  const parts = [];
  if (g.cycle_ms) parts.push(`ciclo ${fmtR(g.cycle_ms)}`);
  if (g.on_ms) parts.push(`encendido ${fmtR(g.on_ms)}`);
  if (g.off_ms) parts.push(`apagado ${fmtR(g.off_ms)}`);
  return `${what}: ${parts.join(", ")}, ${g.cycles ?? 3} ciclos`;
}

/**
 * Avance de un objetivo de ritmo. Guarda los flancos (o las líneas) desde que
 * el objetivo se desbloquea y cuenta cuántos de los últimos tramos cumplen.
 */
function periodStep(g, s, snap, t, lines, blocked) {
  const need = g.cycles ?? 3;
  /** @type {{ kind: string, d: number }[]} */
  const spans = [];
  if (typeof g.period === "string") {
    const v = num(readSignal(snap, g.period)) ? 1 : 0;
    if (!blocked && s.level !== null && v !== s.level) s.edges.push([t, v]);
    s.level = v;
    if (s.edges.length > 4 * need + 4) s.edges.splice(0, s.edges.length - (4 * need + 4));
    const e = s.edges;
    for (let i = 1; i < e.length; i++) {
      spans.push({ kind: e[i - 1][1] ? "on_ms" : "off_ms", d: e[i][0] - e[i - 1][0] });
      if (i >= 2 && e[i][1] === e[i - 2][1]) spans.push({ kind: "cycle_ms", d: e[i][0] - e[i - 2][0] });
    }
  } else {
    const re = new RegExp(g.period.console);
    if (!blocked) for (const [lt, l] of lines) if (re.test(l)) s.lines.push(lt);
    if (s.lines.length > need + 2) s.lines.splice(0, s.lines.length - (need + 2));
    for (let i = 1; i < s.lines.length; i++) spans.push({ kind: "cycle_ms", d: s.lines[i] - s.lines[i - 1] });
  }
  let good = Infinity;
  let last = null;
  for (const kind of PERIOD_KEYS) {
    if (!(kind in g)) continue;
    const list = spans.filter((x) => x.kind === kind);
    if (list.length) last ??= Math.round(list[list.length - 1].d);
    // Tramos buenos seguidos, contando desde el último.
    let n = 0;
    for (let i = list.length - 1; i >= 0 && matches(list[i].d, g[kind]); i--) n++;
    good = Math.min(good, n);
  }
  good = Number.isFinite(good) ? good : 0;
  return { ok: good >= need, fraction: Math.min(1, good / need), reading: last === null ? "—" : `${last} ms` };
}
