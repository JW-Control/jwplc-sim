// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Multímetro del modo Diagnóstico: lecturas de tensión, resistencia y
// corriente sobre la netlist de la escena (scene/netlist.mjs), sin resolver
// un circuito analógico.
//
// Tensión: dos bornes que llegan a los polos de una misma fuente leen su
// tensión (con signo en continua). Una carga sin corriente no hace caída,
// así que también lleva el potencial: entre los bornes de un contacto
// abierto en serie con una bobina se leen los 24 V, y entre los extremos de
// un cable cortado o de una bobina quemada que debería estar alimentada,
// también. Lo que queda flotando lee 0.
//
// Resistencia: cables y contactos cerrados valen 0 Ω; cada carga vale la
// resistencia que corresponde a su tensión y una corriente típica (bobina de
// contactor, lámpara piloto, entrada del PLC, bobinado de motor); una carga
// quemada o un cable cortado no conducen (OL). Se toma el camino de menor
// resistencia (sin paralelos): suficiente para diagnosticar continuidad.
//
// Corriente (pinza en un cable): la suma de las corrientes de las cargas que
// se quedarían sin alimentación si ese cable no estuviera; en el cable de
// potencia de un equipo trifásico, la corriente que el equipo declara en el
// borne (DeviceStep.currents).

import { parseRating } from "./netlist.mjs";

/** Corriente típica (A) de una carga energizada, por tipo. */
function typicalAmps(l, kind) {
  if (/^I\d_\d$/.test(String(l.id).split(".").pop() ?? "")) return 0.005; // entrada del PLC (≈ 4,8 kΩ)
  if (String(l.id).endsWith(".power")) return 0.15; // alimentación de un equipo electrónico
  if (l.coil) return kind === "AC" ? 0.03 : 0.1;
  if (String(l.id).endsWith(".lamp")) return 0.02;
  return 0.03;
}

/** Resistencia (Ω) de una carga sana: su tensión nominal sobre la corriente típica. */
export function loadOhms(l) {
  let r;
  try {
    r = parseRating(l.rating);
  } catch {
    r = { volts: 24, kind: "DC" };
  }
  return Math.round(r.volts / typicalAmps(l, r.kind));
}

/** Corriente (A) de una carga energizada con `volts`. */
export function loadAmps(l, volts) {
  return volts / loadOhms(l);
}

/** Bobinados de un motor (U1-U2, V1-V2, W1-W2): resistencia por fase. */
export const WINDING_OHMS = 12;
export function windings(terminals) {
  const out = [];
  for (const x of terminals) {
    const m = /^([UVW])1$/.exec(x);
    if (m && terminals.includes(`${m[1]}2`)) out.push([x, `${m[1]}2`]);
  }
  return out;
}

class UF {
  parent = new Map();
  find(x) {
    while (this.parent.has(x) && this.parent.get(x) !== x) x = this.parent.get(x);
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const PHASES = ["L1", "L2", "L3"];

/**
 * Tensión entre dos bornes.
 * @param {{ wires: [string, string][], switches: { a: string, b: string }[], loads: any[], sources: any[] }} net  netlist en el instante
 * @param {Map<string, { on: boolean }>} loadStates  estado de cada carga (solve().loads)
 * @param {Set<string>} disabled  fuentes sin tensión (disparadas o bloqueadas)
 * @param {string} red  borne de la punta roja
 * @param {string} black  borne de la punta negra
 * @param {"VDC" | "VAC"} mode
 * @returns {number} voltios (con signo en continua)
 */
export function voltsBetween(net, loadStates, disabled, red, black, mode) {
  const uf = new UF();
  for (const [a, b] of net.wires) uf.union(a, b);
  for (const s of net.switches) uf.union(s.a, s.b);
  // Sin corriente no hay caída: la carga apagada lleva el potencial.
  for (const l of net.loads) if (!loadStates.get(l.id)?.on) uf.union(l.a, l.b);
  /** @type {Map<string, Set<string>>} */
  const marks = new Map();
  const mark = (t, m) => {
    const g = uf.find(t);
    if (!marks.has(g)) marks.set(g, new Set());
    marks.get(g).add(m);
  };
  for (const s of net.sources) {
    if (disabled.has(s.id)) continue;
    if (s.phases) for (const [ph, t] of Object.entries(s.phases)) mark(t, `${s.id}~${ph}`);
    else {
      mark(s.pos, `${s.id}+`);
      mark(s.neg, `${s.id}-`);
    }
  }
  const ma = marks.get(uf.find(red)) ?? new Set();
  const mb = marks.get(uf.find(black)) ?? new Set();
  for (const s of net.sources) {
    if (disabled.has(s.id)) continue;
    if (s.phases) {
      const pa = PHASES.filter((p) => ma.has(`${s.id}~${p}`));
      const pb = PHASES.filter((p) => mb.has(`${s.id}~${p}`));
      if (pa.length !== 1 || pb.length !== 1 || pa[0] === pb[0]) continue;
      return mode === "VAC" ? s.volts : 0;
    }
    // Un grupo con los dos polos (dos cargas apagadas en serie) no tiene un potencial definido.
    const amb = (m) => m.has(`${s.id}+`) && m.has(`${s.id}-`);
    if (amb(ma) || amb(mb)) continue;
    const fwd = ma.has(`${s.id}+`) && mb.has(`${s.id}-`);
    const rev = ma.has(`${s.id}-`) && mb.has(`${s.id}+`);
    if (!fwd && !rev) continue;
    if (s.kind === "DC") return mode === "VDC" ? (fwd ? s.volts : -s.volts) : 0;
    return mode === "VAC" ? s.volts : 0;
  }
  return 0;
}

/**
 * Resistencia entre dos bornes (Ω), o Infinity si no hay camino (OL).
 * @param {{ wires: [string, string][], switches: { a: string, b: string }[], loads: any[] }} net  con las cargas sanas
 * @param {[string, string, number][]} extra  otras resistencias (bobinados)
 */
export function ohmsBetween(net, extra, red, black) {
  /** @type {Map<string, [string, number][]>} */
  const adj = new Map();
  const add = (a, b, r) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, r]);
    adj.get(b).push([a, r]);
  };
  for (const [a, b] of net.wires) add(a, b, 0);
  for (const s of net.switches) add(s.a, s.b, 0);
  for (const l of net.loads) add(l.a, l.b, loadOhms(l));
  for (const [a, b, r] of extra) add(a, b, r);
  if (red === black) return 0;
  // Dijkstra sobre pocos cientos de nodos: una lista basta.
  const dist = new Map([[red, 0]]);
  const done = new Set();
  for (;;) {
    let u = null;
    let du = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < du) [u, du] = [n, d];
    if (u === null) return Infinity;
    if (u === black) return du;
    done.add(u);
    for (const [v, r] of adj.get(u) ?? []) if (du + r < (dist.get(v) ?? Infinity)) dist.set(v, du + r);
  }
}
