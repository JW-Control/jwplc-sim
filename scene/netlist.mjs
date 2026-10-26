// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Netlist eléctrica simplificada de la escena (gate JWSIM_G7_NETLIST).
//
// No resuelve tensiones ni corrientes: trabaja por conectividad. Cada borne
// ("KM1.A1", "plc.Q0_0.1") es un nodo; los cables y los contactos cerrados
// unen nodos en grupos equipotenciales. Una fuente marca su polo positivo
// (L+ o L) y su retorno (M o N) en el grupo de cada borne. Una carga (bobina,
// lámpara, entrada del PLC) está energizada si un extremo está en el polo
// positivo de una fuente y el otro en el retorno de la misma fuente.
//
// Fallas que detecta:
//   short       polo positivo y retorno de una fuente en el mismo grupo: la
//               protección de la fuente dispara y queda sin tensión hasta que
//               se rearme (la escena guarda el disparo)
//   cross       el polo positivo de una fuente unido a un polo de otra
//               (24 VDC con 230 VAC, o dos fuentes en paralelo): disparan ambas
//   overvoltage una carga de menor tensión nominal alimentada con más tensión
//               (bobina de 24 VDC en 230 VAC): la carga se quema
// Avisos:
//   undervoltage carga de 230 VAC en una fuente de 24 VDC: no se energiza
//   polarity     carga polarizada (entrada sink, sensor PNP) con la polaridad
//                invertida: no se energiza
//   unpowered    (análisis estático) una carga que no puede energizarse con
//                ninguna combinación de contactos: un extremo no llega a un
//                polo de alimentación (bobina sin retorno, borne sin cablear)
//
// Trifásico (red de 220 V entre fases): la fuente marca cada fase (L1, L2,
// L3) en su grupo. Dos fases distintas en un grupo son un cortocircuito entre
// fases; una fase unida a otra fuente, un cruce. Una carga de dos bornes entre
// dos fases distintas recibe la tensión entre fases (bobina de 230 VAC entre
// L1 y L2). phaseOf(borne) dice qué fase llega a un borne: así los
// dispositivos trifásicos (motor) deducen conexión y secuencia.
//
// Simplificaciones (documentadas en ARCHITECTURE §4.1): dos cargas en serie
// no se energizan (el nodo intermedio no tiene polo); no hay caídas de
// tensión, corrientes ni potencia; CA y CC no se mezclan.

/**
 * @typedef {{ id: string, pos?: string, neg?: string, kind: "DC" | "AC" | "AC3", volts: number,
 *   phases?: { L1: string, L2: string, L3: string } }} Source  AC3: sin pos/neg, volts entre fases
 * @typedef {{ id: string, a: string, b: string, rating: string, polar?: boolean, coil?: boolean }} Load
 * @typedef {{ a: string, b: string }} Switch
 * @typedef {{
 *   on: boolean, polarity: 1 | -1 | 0, source: string | null, volts: number, kind: "DC" | "AC" | null,
 *   issue?: "overvoltage" | "undervoltage" | "polarity"
 * }} LoadState
 * @typedef {{ type: string, source?: string, sources?: string[], load?: string, terminals?: string[], message: string }} Finding
 */

const PHASES = ["L1", "L2", "L3"];

/** "24VDC" → { kind: "DC", volts: 24 }; "230VAC" → { kind: "AC", volts: 230 }. */
export function parseRating(rating) {
  const m = /^(\d+(?:\.\d+)?)V(AC|DC)$/.exec(rating);
  if (!m) throw new Error(`tensión nominal inválida: ${rating} (se espera p. ej. 24VDC o 230VAC)`);
  return { volts: Number(m[1]), kind: /** @type {"DC"|"AC"} */ (m[2]) };
}

class UnionFind {
  /** @type {Map<string, string>} */
  parent = new Map();
  find(x) {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    while (p !== x) {
      const gp = this.parent.get(p);
      this.parent.set(x, gp);
      x = p;
      p = gp;
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

/**
 * Agrupa bornes por cables y contactos y marca los polos de las fuentes.
 * @param {{ wires: [string, string][], sources: Source[], switches: Switch[] }} net
 * @param {Set<string>} disabled  fuentes sin tensión (disparadas)
 */
function group(net, disabled) {
  const uf = new UnionFind();
  for (const [a, b] of net.wires) uf.union(a, b);
  for (const s of net.switches) uf.union(s.a, s.b);
  /** @type {Map<string, Set<string>>} grupo → marcas "fuente+" / "fuente-" */
  const marks = new Map();
  const mark = (term, m) => {
    const g = uf.find(term);
    if (!marks.has(g)) marks.set(g, new Set());
    marks.get(g).add(m);
  };
  for (const s of net.sources) {
    if (disabled.has(s.id)) continue;
    if (s.phases) {
      for (const [ph, term] of Object.entries(s.phases)) mark(term, `${s.id}~${ph}`);
      continue;
    }
    mark(s.pos, `${s.id}+`);
    mark(s.neg, `${s.id}-`);
  }
  return { uf, marks };
}

/** Bornes de un grupo (para los mensajes). */
function members(uf, g, terms) {
  return [...terms].filter((t) => uf.find(t) === g).sort();
}

/**
 * Resuelve la netlist en un instante.
 * @param {{ wires: [string, string][], sources: Source[], switches: Switch[], loads: Load[] }} net
 * @param {Set<string>} [tripped]  fuentes ya disparadas (la escena las recuerda)
 * @returns {{ loads: Map<string, LoadState>, faults: Finding[], warnings: Finding[], tripped: Set<string>,
 *             groupOf: (term: string) => string, poles: (term: string) => string[],
 *             phaseOf: (term: string) => { source: string, phase: string, volts: number } | null }}
 */
export function solve(net, tripped = new Set()) {
  const disabled = new Set(tripped);
  /** @type {Finding[]} */
  const faults = [];
  const terms = new Set();
  for (const [a, b] of net.wires) terms.add(a).add(b);
  for (const s of net.switches) terms.add(s.a).add(s.b);
  for (const s of net.sources) for (const t of s.phases ? Object.values(s.phases) : [s.pos, s.neg]) terms.add(t);
  for (const l of net.loads) terms.add(l.a).add(l.b);
  const byId = new Map(net.sources.map((s) => [s.id, s]));

  // Disparos: se repite hasta que ninguna fuente activa quede en falla.
  let g = group(net, disabled);
  for (;;) {
    const trip = new Set();
    for (const [grp, ms] of g.marks) {
      for (const m of ms) {
        // Polos "vivos": el positivo de una fuente o una fase de la red trifásica.
        const ph = m.indexOf("~");
        if (!m.endsWith("+") && ph < 0) continue;
        const id = ph < 0 ? m.slice(0, -1) : m.slice(0, ph);
        const sameSource = [...ms].filter((x) => x !== m && x.startsWith(`${id}~`));
        if (ph >= 0 && sameSource.length) {
          if (!trip.has(id)) {
            trip.add(id);
            const fases = [m, ...sameSource].map((x) => x.slice(ph + 1)).sort();
            faults.push({
              type: "short",
              source: id,
              terminals: members(g.uf, grp, terms),
              message: `Cortocircuito entre fases en ${id}: ${fases.join(" y ")} quedan unidas (${members(g.uf, grp, terms).join(", ")})`,
            });
          }
        } else if (ph < 0 && ms.has(`${id}-`)) {
          trip.add(id);
          faults.push({
            type: "short",
            source: id,
            terminals: members(g.uf, grp, terms),
            message: `Cortocircuito en ${id}: ${byId.get(id).pos} y ${byId.get(id).neg} quedan unidos (${members(g.uf, grp, terms).join(", ")})`,
          });
        }
        const srcOf = (x) => (x.includes("~") ? x.slice(0, x.indexOf("~")) : x.slice(0, -1));
        const others = [...ms].map(srcOf).filter((o) => o !== id);
        if (others.length) {
          const all = [id, ...new Set(others)].sort();
          for (const o of all) trip.add(o);
          if (!faults.some((f) => f.type === "cross" && f.sources.join() === all.join())) {
            faults.push({
              type: "cross",
              sources: all,
              terminals: members(g.uf, grp, terms),
              message: `Cruce de alimentaciones entre ${all.join(" y ")} (${members(g.uf, grp, terms).join(", ")})`,
            });
          }
        }
      }
    }
    const fresh = [...trip].filter((id) => !disabled.has(id));
    if (!fresh.length) break;
    for (const id of fresh) disabled.add(id);
    g = group(net, disabled);
  }

  /** @type {Map<string, LoadState>} */
  const loads = new Map();
  /** @type {Finding[]} */
  const warnings = [];
  for (const l of net.loads) {
    const ma = g.marks.get(g.uf.find(l.a)) ?? new Set();
    const mb = g.marks.get(g.uf.find(l.b)) ?? new Set();
    /** @type {LoadState} */
    let st = { on: false, polarity: 0, source: null, volts: 0, kind: null };
    for (const s of net.sources) {
      if (disabled.has(s.id)) continue;
      if (s.phases) {
        // Entre dos fases distintas: la tensión entre fases, en alterna.
        const pa = PHASES.find((p) => ma.has(`${s.id}~${p}`));
        const pb = PHASES.find((p) => mb.has(`${s.id}~${p}`));
        if (!pa || !pb || pa === pb) continue;
        st = { on: true, polarity: 1, source: s.id, volts: s.volts, kind: "AC" };
        break;
      }
      const fwd = ma.has(`${s.id}+`) && mb.has(`${s.id}-`);
      const rev = ma.has(`${s.id}-`) && mb.has(`${s.id}+`);
      if (!fwd && !rev) continue;
      st = { on: true, polarity: fwd ? 1 : -1, source: s.id, volts: s.volts, kind: /** @type {"DC" | "AC"} */ (s.kind) };
      break;
    }
    if (st.on) {
      const r = parseRating(l.rating);
      if (st.volts > r.volts * 1.1) {
        st = { ...st, on: false, issue: "overvoltage" };
        faults.push({
          type: "overvoltage",
          load: l.id,
          source: st.source,
          message: `Sobretensión: ${l.id} (${l.rating}) alimentada con ${st.volts} V${st.kind === "AC" ? "AC" : "DC"} desde ${st.source}`,
        });
      } else if (st.volts < r.volts * 0.85 || st.kind !== r.kind) {
        st = { ...st, on: false, issue: "undervoltage" };
        warnings.push({
          type: "undervoltage",
          load: l.id,
          source: st.source,
          message: `${l.id} (${l.rating}) no se energiza con ${st.volts} V${st.kind === "AC" ? "AC" : "DC"} de ${st.source}`,
        });
      } else if (l.polar && st.polarity < 0) {
        st = { ...st, on: false, issue: "polarity" };
        warnings.push({ type: "polarity", load: l.id, source: st.source, message: `${l.id}: polaridad invertida (${l.a} debe ir al positivo)` });
      }
    }
    loads.set(l.id, st);
  }
  const groupOf = (t) => g.uf.find(t);
  const poles = (t) => [...(g.marks.get(g.uf.find(t)) ?? [])].sort();
  /** Fase de la red trifásica que llega a un borne, o null. */
  const phaseOf = (t) => {
    for (const m of g.marks.get(g.uf.find(t)) ?? []) {
      const i = m.indexOf("~");
      if (i < 0) continue;
      const source = m.slice(0, i);
      return { source, phase: m.slice(i + 1), volts: byId.get(source).volts };
    }
    return null;
  };
  return { loads, faults, warnings, tripped: disabled, groupOf, poles, phaseOf };
}

/**
 * Análisis estático: con todos los contactos cerrados a la vez (todo lo que
 * algún estado de la escena podría unir), ¿cada carga tiene un extremo que
 * llega al positivo de una fuente y el otro a su retorno? Si no, la carga no
 * puede energizarse nunca: bobina sin alimentación o sin retorno.
 * @param {{ wires: [string, string][], sources: Source[], switches: Switch[], loads: Load[] }} net
 *        `switches` son todos los contactos posibles, abiertos o cerrados
 * @param {Set<string>} [wired]  bornes con algún cable (los dispositivos sin cablear no avisan)
 * @param {(load: Load) => boolean} [skip]  cargas que no se analizan (p. ej. entradas sin usar)
 * @returns {Finding[]}
 */
export function analyze(net, wired, skip) {
  const g = group(net, new Set());
  /** @type {Finding[]} */
  const out = [];
  const has = (t, suffix) => [...(g.marks.get(g.uf.find(t)) ?? [])].some((m) => m.endsWith(suffix));
  for (const l of net.loads) {
    if (wired && !wired.has(l.a) && !wired.has(l.b)) continue;
    if (skip?.(l)) continue;
    const ok = net.sources.some((s) => {
      const ma = g.marks.get(g.uf.find(l.a)) ?? new Set();
      const mb = g.marks.get(g.uf.find(l.b)) ?? new Set();
      if (s.phases) return PHASES.some((p) => ma.has(`${s.id}~${p}`)) && PHASES.some((p) => mb.has(`${s.id}~${p}`));
      return (ma.has(`${s.id}+`) && mb.has(`${s.id}-`)) || (ma.has(`${s.id}-`) && mb.has(`${s.id}+`));
    });
    if (ok) continue;
    const why = [];
    for (const t of [l.a, l.b]) {
      if (wired && !wired.has(t)) why.push(`${t} sin cablear`);
      else if (!has(t, "+") && !has(t, "-") && !PHASES.some((p) => has(t, `~${p}`))) why.push(`${t} no llega a ningún polo de alimentación`);
    }
    if (!why.length) why.push(`${l.a} y ${l.b} no llegan a los dos polos de una misma fuente`);
    out.push({
      type: "unpowered",
      load: l.id,
      terminals: [l.a, l.b],
      message: `${l.coil ? "Bobina sin alimentación" : "Carga sin alimentación"}: ${l.id} nunca se energiza (${why.join("; ")})`,
    });
  }
  return out;
}
