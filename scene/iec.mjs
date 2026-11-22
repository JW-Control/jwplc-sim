// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Esquema normalizado (IEC 60617 / IEC 81346) generado del mismo circuito de
// la escena: no se dibuja a mano, se deduce de los bornes, los cables y lo que
// cada equipo declara en electrical() (contactos, cargas y fuentes).
//
// Hojas:
//   Potencia       una por fuente trifásica: barras L1 L2 L3 arriba y los
//                  bloques de 3 polos (contactor, térmico, motor) por niveles.
//   Mando          una o más por fuente de 2 polos (24 VDC, 230 VAC): cada
//                  camino de + a − es una columna vertical, con los contactos
//                  arriba y la carga (bobina, piloto, entrada del PLC) abajo,
//                  todas las cargas en la misma fila. Lo que varios caminos
//                  comparten (la parada de emergencia que alimenta las salidas)
//                  se dibuja una vez con su derivación.
//
// Devuelve geometría lista para dibujar (coordenadas de la hoja) con el borne
// de referencia de cada tramo: la vista lo pinta energizado mirando los polos
// del snapshot (`poles["PS1.+V1"]` contiene "PS1+"), sin repetir el análisis.

const COLW = 116; // ancho de columna del mando
const X0 = 60; // margen izquierdo (rótulos de las barras)
const RAIL_TOP = 74;
const ROWH = 78;
const SYM = 18; // media altura de un símbolo
const MAX_COLS = 12; // columnas por hoja de mando
const MAX_PATHS = 600;
const MAX_DEPTH = 16;

/** @typedef {[number, number]} Pt */
/**
 * @typedef {{ pts: Pt[], rep: string }} Wire
 * @typedef {{ x: number, y: number, rep: string }} Dot
 * @typedef {{
 *   key: string, kind: string, dev: string, cid: string, type: string,
 *   x: number, y: number, top: string, bot: string, tTop: string, tBot: string,
 *   label: string, text?: string, nc?: boolean, act?: string, col?: number,
 *   ref?: string, xref?: { cid: string, nc: boolean, at: string }[], io?: string,
 * }} Elem
 * @typedef {{
 *   kind: string, dev: string, type: string, label: string, text?: string, x: number, y: number, w: number, h: number,
 *   poles: { x: number, cid: string, top: string, bot: string, tTop: string, tBot: string }[], ref?: string,
 * }} Block
 * @typedef {{
 *   n: number, id: string, kind: "power" | "control", title: string, src: string, srcKind: string,
 *   w: number, h: number, cols: number, colW: number, x0: number,
 *   rails?: { top: { y: number, label: string, rep: string }, bot: { y: number, label: string, rep: string } },
 *   bus?: { y: number, label: string, rep: string }[],
 *   elems: Elem[], blocks: Block[], wires: Wire[], dots: Dot[], notes: { x: number, y: number, text: string }[],
 * }} Sheet
 */

class UF {
  /** @type {Map<string, string>} */
  p = new Map();
  /** @param {string} x */
  find(x) {
    let r = x;
    while (this.p.has(r) && this.p.get(r) !== r) r = /** @type {string} */ (this.p.get(r));
    this.p.set(x, r);
    return r;
  }
  /** @param {string} a @param {string} b */
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

const natural = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true });

/**
 * ¿Contacto normalmente cerrado? Numeración IEC 60947: la cifra de función
 * del segundo borne es 2/6 (NC) o 4/8 (NA). Los polos principales 1-2, 3-4,
 * 5-6 son NA. Para lo demás se mira el estado en reposo (t = 0).
 * @param {string} type @param {string} cid @param {boolean} restClosed
 */
export function contactIsNC(type, cid, restClosed) {
  if (/pressure-switch|thermostat/.test(type)) return cid === "1-2";
  if (/^[135]-[246]$/.test(cid)) return false;
  if (/^Q0_\d+$|^DO\d+$|^out$/.test(cid)) return false;
  const m = /^\d*(\d)-\d*(\d)$/.exec(cid);
  if (m) return m[2] === "2" || m[2] === "6";
  return restClosed;
}

/** Tipo de accionamiento del contacto (dibujo del símbolo). */
function actuatorOf(type, cid) {
  if (/emergency-stop/.test(type)) return "mushroom";
  if (/pushbutton/.test(type)) return "push";
  if (/selector-key/.test(type)) return "key";
  if (/selector/.test(type)) return "turn";
  if (/limit-switch/.test(type)) return "roller";
  if (/sensor-/.test(type)) return "prox";
  if (/float-switch|level-relay/.test(type)) return "float";
  if (/pressure-switch/.test(type)) return "pressure";
  if (/thermostat|temp-controller/.test(type)) return "temp";
  if (/overload-relay|motor-protector/.test(type) && /^9[5-8]-/.test(cid)) return "thermal";
  if (/timer-relay/.test(type)) return "timer";
  if (/jwplc-basic|remote-io/.test(type)) return "plc";
  if (/breaker/.test(type)) return "breaker";
  return "";
}

/** Clase de carga (dibujo). */
function loadKind(type, l) {
  if (/jwplc-basic|remote-io/.test(type)) return l.id === "power" || l.id === "supply" ? "plcpower" : "plcin";
  if (l.id === "supply" || l.id === "input" && /vfd/.test(type)) return "supply";
  if (/lamp|stack-light|pushbutton-lit/.test(type)) return "lamp";
  if (/buzzer/.test(type)) return "buzzer";
  if (/^jwsim\/motor/.test(type) || /winding|main|aux|bomba/.test(l.id)) return "motor1";
  if (/solenoid|water-valve|valvula/.test(type + l.id)) return "valve";
  if (/vfd/.test(type)) return "plcin";
  if (l.coil || l.id === "coil") return /timer/.test(type) ? "coiltimer" : "coil";
  return "load";
}

/** Designación IEC 81346 del equipo: "-KM1". */
const desig = (id) => `-${id}`;

/** Texto de función del equipo (rótulo que el usuario le puso). */
function funcText(spec, id) {
  const d = (spec.devices ?? []).find((x) => x.id === id);
  const p = d?.params ?? {};
  return typeof p.label === "string" && p.label ? p.label : "";
}

/**
 * Modelo del esquema IEC de una escena ya construida.
 * @param {import("./scene.mjs").Scene} scene
 * @param {{ title?: string }} [opts]
 */
export function iecModel(scene, opts = {}) {
  const spec = scene.spec ?? { devices: [] };
  const uf = new UF();
  for (const [a, b] of scene.wires) uf.union(a, b);
  const devs = [...scene.devices.values()];
  const snap = scene.snapshot();
  const rest = new Map(snap.devices.map((d) => [d.id, d.contacts ?? {}]));
  // Fuentes de 2 polos y trifásicas; los puentes internos de la fuente
  // (+V1/+V2) cuentan como el mismo nodo.
  /** @type {{ id: string, dev: any, pos: string, neg: string, kind: string, volts: number }[]} */
  const two = [];
  /** @type {{ id: string, dev: any, phases: Record<string, string>, volts: number }[]} */
  const three = [];
  /** @type {Set<string>} contactos que son puente interno */
  const bridged = new Set();
  for (const dev of devs) {
    for (const s of dev.el.sources ?? []) {
      const id = s.id ? `${dev.id}.${s.id}` : dev.id;
      if (s.phases) three.push({ id, dev, phases: Object.fromEntries(Object.entries(s.phases).map(([k, t]) => [k, `${dev.id}.${t}`])), volts: s.volts });
      else {
        two.push({ id, dev, pos: `${dev.id}.${s.pos}`, neg: `${dev.id}.${s.neg}`, kind: s.kind, volts: s.volts });
        for (const [cid, [a, b]] of Object.entries(dev.el.contacts ?? {})) {
          if ([a, b].includes(s.pos) || [a, b].includes(s.neg)) {
            uf.union(`${dev.id}.${a}`, `${dev.id}.${b}`);
            bridged.add(`${dev.id}.${cid}`);
          }
        }
      }
    }
  }
  const net = (t) => uf.find(t);
  const isWired = (t) => scene.wired.has(t);
  // Borne de referencia de un nodo (uno cableado, para leer sus polos).
  /** @type {Map<string, string>} */
  const repOf = new Map();
  for (const t of scene.wired) if (!repOf.has(net(t))) repOf.set(net(t), t);
  const rep = (t) => (isWired(t) ? t : repOf.get(net(t)) ?? t);

  // Ramas de dos bornes: contactos y cargas.
  /** @type {any[]} */
  const edges = [];
  for (const dev of devs) {
    const type = dev.def.type;
    const hasContacts = Object.keys(dev.el.contacts ?? {}).length > 0;
    for (const [cid, [a, b]] of Object.entries(dev.el.contacts ?? {})) {
      if (bridged.has(`${dev.id}.${cid}`)) continue;
      const ta = `${dev.id}.${a}`;
      const tb = `${dev.id}.${b}`;
      if (net(ta) === net(tb)) continue;
      const nc = contactIsNC(type, cid, !!rest.get(dev.id)?.[cid]);
      edges.push({ key: `${dev.id}.${cid}`, kind: "contact", dev: dev.id, cid, type, a, b, ta, tb, nc, act: actuatorOf(type, cid) });
    }
    for (const l of dev.el.loads ?? []) {
      const ta = `${dev.id}.${l.a}`;
      const tb = `${dev.id}.${l.b}`;
      if (net(ta) === net(tb)) continue;
      // Alimentación de un sensor de 3 hilos: va con su contacto (BN-BK).
      const kind = loadKind(type, l);
      if (kind === "supply" && hasContacts && /sensor-|level-relay/.test(type)) continue;
      edges.push({ key: `${dev.id}.${l.id}`, kind: "load", lk: kind, dev: dev.id, cid: l.id, type, a: l.a, b: l.b, ta, tb, coil: !!l.coil || l.id === "coil" });
    }
  }
  /** @type {Map<string, any[]>} */
  const adj = new Map();
  for (const e of edges) {
    for (const t of [e.ta, e.tb]) {
      const n = net(t);
      if (!adj.has(n)) adj.set(n, []);
      adj.get(n).push(e);
    }
  }

  /** @type {Sheet[]} */
  const sheets = [];
  const projectTitle = opts.title ?? "";

  // ---------- Potencia (trifásica)
  for (const src of three) {
    const sh = powerSheet(src, devs, net, rep, isWired, spec);
    if (sh) sheets.push(sh);
  }

  // ---------- Mando: caminos de + a − por fuente de 2 polos
  const usedPower = new Set(sheets.flatMap((s) => s.blocks.flatMap((b) => b.poles.map((p) => `${b.dev}.${p.cid}`))));
  for (const src of two) {
    const pn = net(src.pos);
    const nn = net(src.neg);
    const otherRails = new Set(two.filter((s) => s !== src).flatMap((s) => [net(s.pos), net(s.neg)]));
    /** @type {any[][]} */
    const paths = [];
    const used = new Set();
    const seen = new Set([pn]);
    /** @param {string} n @param {any[]} path */
    const dfs = (n, path) => {
      if (paths.length >= MAX_PATHS) return;
      if (n === nn) {
        if (path.some((s) => s.e.kind === "load")) paths.push([...path]);
        return;
      }
      if (path.length >= MAX_DEPTH || (otherRails.has(n) && path.length)) return;
      for (const e of adj.get(n) ?? []) {
        if (used.has(e.key) || usedPower.has(e.key)) continue;
        const fwd = net(e.ta) === n;
        const other = net(fwd ? e.tb : e.ta);
        if (seen.has(other)) continue;
        // Una carga con polaridad no se recorre al revés.
        used.add(e.key);
        seen.add(other);
        path.push({ e, top: fwd ? e.a : e.b, bot: fwd ? e.b : e.a });
        dfs(other, path);
        path.pop();
        seen.delete(other);
        used.delete(e.key);
      }
    };
    dfs(pn, []);
    if (!paths.length) continue;
    // Caminos por carga final.
    /** @type {Map<string, any[][]>} */
    const byTarget = new Map();
    for (const p of paths) {
      const last = [...p].reverse().find((s) => s.e.kind === "load");
      // Lo que queda después de la carga final va al riel − (cables).
      const cut = p.lastIndexOf(last);
      const q = p.slice(0, cut + 1);
      const k = last.e.key;
      if (!byTarget.has(k)) byTarget.set(k, []);
      const list = byTarget.get(k);
      if (!list.some((x) => x.map((s) => s.e.key).join() === q.map((s) => s.e.key).join())) list.push(q);
    }
    /** @type {{ target: any, items: any[], group: string, order: number[] }[]} */
    const rungs = [];
    for (const [, ps] of byTarget) {
      const target = ps[0][ps[0].length - 1];
      const items = mergeParallel(ps);
      const t = target.e;
      const group = t.lk === "plcin" ? "in" : t.lk === "plcpower" || t.lk === "supply" ? "sup" : "out";
      const q = items.flatMap((it) => (it.par ? it.par.flat() : [it])).find((s) => s.e.act === "plc");
      const ord = t.lk === "plcin" ? Number(/\d+$/.exec(t.cid)?.[0] ?? 99) : q ? Number(/\d+$/.exec(q.e.cid)?.[0] ?? 99) : 100;
      rungs.push({ target, items, group, order: [t.lk === "plcpower" ? 0 : 1, ord, devs.findIndex((d) => d.id === t.dev)] });
    }
    const dc = src.kind === "DC";
    const vtxt = `${src.volts} V${dc ? "DC" : "AC"}`;
    const groups = dc
      ? [
          ["sup", `Alimentación ${vtxt}`],
          ["in", "Entradas del PLC"],
          ["out", "Mando y salidas del PLC"],
        ]
      : [["*", `Circuito ${vtxt}`]];
    for (const [g, title] of groups) {
      const rs = rungs.filter((r) => g === "*" || r.group === g).sort((a, b) => cmpArr(a.order, b.order));
      if (!rs.length) continue;
      for (const chunk of chunkRungs(rs)) {
        sheets.push(controlSheet(chunk, { src, title: title + (chunk.part ? ` (${chunk.part})` : ""), rep, spec, dc }));
      }
    }
  }

  // Numeración y referencias cruzadas: dónde está la bobina de cada equipo
  // y dónde aparecen sus contactos.
  sheets.forEach((s, i) => {
    s.n = i + 1;
    s.id = `h${i + 1}`;
  });
  /** @type {Map<string, { cid: string, nc: boolean, at: string, sheet: number, col: number }[]>} */
  const contactsOf = new Map();
  /** @type {Map<string, string>} */
  const coilAt = new Map();
  for (const s of sheets) {
    for (const e of s.elems) {
      const at = `${s.n}.${(e.col ?? 0) + 1}`;
      if (e.kind === "contact") {
        if (!contactsOf.has(e.dev)) contactsOf.set(e.dev, []);
        contactsOf.get(e.dev)?.push({ cid: e.cid, nc: !!e.nc, at, sheet: s.n, col: e.col ?? 0 });
      } else if (/^coil/.test(e.kind) && !coilAt.has(e.dev)) coilAt.set(e.dev, at);
    }
    for (const b of s.blocks) {
      if (!contactsOf.has(b.dev)) contactsOf.set(b.dev, []);
      for (const p of b.poles) contactsOf.get(b.dev)?.push({ cid: p.cid, nc: false, at: `${s.n}.${Math.max(1, Math.round((p.x - s.x0) / s.colW) + 1)}`, sheet: s.n, col: 0 });
    }
  }
  for (const s of sheets) {
    for (const e of s.elems) {
      if (e.kind === "contact" && coilAt.has(e.dev)) e.ref = coilAt.get(e.dev);
      if (/^coil/.test(e.kind)) e.xref = (contactsOf.get(e.dev) ?? []).map(({ cid, nc, at }) => ({ cid, nc, at }));
    }
    for (const b of s.blocks) if (coilAt.has(b.dev)) b.ref = coilAt.get(b.dev);
  }
  // Contactos libres (sin cables en sus bornes) de los equipos con bobina:
  // la vista los ofrece para agregar una autorretención o un enclavamiento.
  const free = [];
  for (const dev of devs) {
    if (!(dev.el.loads ?? []).some((l) => l.coil || l.id === "coil")) continue;
    for (const [cid, [a, b]] of Object.entries(dev.el.contacts ?? {})) {
      if (/^[135]-[246]$/.test(cid) || isWired(`${dev.id}.${a}`) || isWired(`${dev.id}.${b}`)) continue;
      free.push({ dev: dev.id, cid, a, b, nc: contactIsNC(dev.def.type, cid, !!rest.get(dev.id)?.[cid]) });
    }
  }
  return { title: projectTitle, sheets, free };
}

const cmpArr = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

/** Varios caminos a la misma carga: prefijo común, ramas en paralelo y sufijo común. */
function mergeParallel(ps) {
  if (ps.length === 1) return ps[0];
  const keys = ps.map((p) => p.map((s) => s.e.key));
  let pre = 0;
  while (keys.every((k) => k[pre] !== undefined && k[pre] === keys[0][pre])) pre++;
  let suf = 0;
  while (keys.every((k) => k.length - 1 - suf > pre - 1 && k[k.length - 1 - suf] === keys[0][keys[0].length - 1 - suf])) suf++;
  const mids = ps.map((p) => p.slice(pre, p.length - suf));
  return [...ps[0].slice(0, pre), { par: mids, key: `par(${mids.map((m) => m.map((s) => s.e.key).join("+")).join("|")})` }, ...ps[0].slice(ps[0].length - suf)];
}

/** Columnas que ocupa un camino (las ramas en paralelo van lado a lado). */
const rungWidth = (r) => Math.max(1, ...r.items.map((it) => (it.par ? it.par.length : 1)));

/** Reparte los caminos en hojas de hasta MAX_COLS columnas sin cortar un grupo que comparte prefijo. */
function chunkRungs(rs) {
  /** @type {any[][] & { part?: number }[]} */
  const out = [];
  let cur = [];
  let w = 0;
  for (const r of rs) {
    const rw = rungWidth(r);
    const shares = cur.length && itemKey(cur[cur.length - 1].items[0]) === itemKey(r.items[0]);
    if (cur.length && w + rw > MAX_COLS && !shares) {
      out.push(cur);
      cur = [];
      w = 0;
    }
    cur.push(r);
    w += rw;
  }
  if (cur.length) out.push(cur);
  if (out.length > 1) out.forEach((c, i) => (/** @type {any} */ (c).part = i + 1));
  return out;
}

const itemKey = (it) => (it.par ? it.key : it.e.key);

/**
 * Hoja de mando: árbol de prefijos comunes, columnas verticales y cargas
 * alineadas en la última fila.
 */
function controlSheet(rungs, { src, title, rep, spec, dc }) {
  // Árbol de prefijos.
  const root = { item: null, kids: /** @type {any[]} */ ([]) };
  for (const r of rungs) {
    let node = root;
    r.items.forEach((it, i) => {
      const last = i === r.items.length - 1;
      let k = node.kids.find((c) => itemKey(c.item) === itemKey(it) && !c.leaf && !last);
      if (!k) {
        k = { item: it, kids: [], leaf: last };
        node.kids.push(k);
      }
      node = k;
    });
  }
  // Filas: alto de cada ítem (los paralelos, su rama más larga).
  const h = (it) => (it.par ? Math.max(1, ...it.par.map((m) => m.length)) : 1);
  const depth = (node) => (node.leaf ? 0 : h(node.item) + Math.max(0, ...node.kids.map(depth)));
  const loadRow = Math.max(0, ...root.kids.map((k) => (k.leaf ? 0 : depth(k))));
  const colX = (c) => X0 + COLW * (c + 0.5);
  const rowY = (r) => RAIL_TOP + 26 + ROWH * (r + 0.5);
  const loadY = rowY(loadRow);
  const railBot = loadY + SYM + 34;

  /** @type {Elem[]} */
  const elems = [];
  /** @type {Wire[]} */
  const wires = [];
  /** @type {Dot[]} */
  const dots = [];
  const posRep = rep(src.pos);
  const negRep = rep(src.neg);

  const mk = (s, col, row, isLoad) => {
    const e = s.e;
    const el = /** @type {Elem} */ ({
      key: e.key,
      kind: e.kind === "contact" ? "contact" : e.lk,
      dev: e.dev,
      cid: e.cid,
      type: e.type,
      x: colX(col),
      y: isLoad ? loadY : rowY(row),
      top: rep(`${e.dev}.${s.top}`),
      bot: rep(`${e.dev}.${s.bot}`),
      tTop: s.top,
      tBot: s.bot,
      label: desig(e.dev),
      col,
    });
    const tx = funcText(spec, e.dev);
    if (tx) el.text = tx;
    if (e.kind === "contact") {
      el.nc = e.nc;
      el.act = e.act;
      if (e.act === "plc") el.io = e.cid.replace("_", ".");
    } else if (e.lk === "plcin" || e.lk === "plcpower") el.io = e.cid === "power" || e.cid === "supply" ? "24V / M" : e.cid.replace("_", ".");
    elems.push(el);
    return el;
  };

  /**
   * Coloca un nodo del árbol. from: punto de donde baja el cable (fondo del
   * anterior); devuelve las columnas que ocupa.
   */
  const place = (node, col, row, from) => {
    const it = node.item;
    let bottom; // punto inferior del ítem: [x, y, rep]
    let w = 1;
    if (it.par) {
      // Ramas lado a lado entre dos uniones horizontales.
      const k = it.par.length;
      w = k;
      const hh = h(it);
      const yT = rowY(row) - SYM - 12;
      const yB = rowY(row + hh - 1) + SYM + 12;
      const x0 = colX(col);
      const x1 = colX(col + k - 1);
      const topRep = rep(`${it.par[0][0]?.e.dev}.${it.par[0][0]?.top}`) || from[2];
      wires.push({ pts: [[from[0], from[1]], [x0, yT]], rep: from[2] });
      wires.push({ pts: [[x0, yT], [x1, yT]], rep: from[2] });
      let bRep = "";
      it.par.forEach((m, j) => {
        const x = colX(col + j);
        let prev = [x, yT, from[2]];
        if (j > 0) dots.push({ x: colX(col + j - 1), y: yT, rep: from[2] });
        m.forEach((s, i) => {
          const el = mk(s, col + j, row + i, false);
          wires.push({ pts: [[prev[0], prev[1]], [x, el.y - SYM]], rep: el.top });
          prev = [x, el.y + SYM, el.bot];
        });
        if (m.length) bRep = /** @type {string} */ (prev[2]);
        wires.push({ pts: [[x, /** @type {number} */ (prev[1])], [x, yB]], rep: /** @type {string} */ (prev[2]) });
      });
      bRep ||= topRep;
      wires.push({ pts: [[x0, yB], [x1, yB]], rep: bRep });
      for (let j = 1; j < k; j++) dots.push({ x: colX(col + j - 1), y: yB, rep: bRep });
      bottom = [x0, yB, bRep];
      row += hh;
    } else {
      const el = mk(it, col, row, node.leaf);
      wires.push({ pts: [[from[0], from[1]], [el.x, el.y - SYM]], rep: el.top });
      bottom = [el.x, el.y + SYM, el.bot];
      row += 1;
      if (node.leaf) {
        wires.push({ pts: [[el.x, el.y + SYM], [el.x, railBot]], rep: el.bot });
        dots.push({ x: el.x, y: railBot, rep: negRep });
        return 1;
      }
    }
    // Hijos: el primero sigue la columna; los demás salen por una derivación.
    let c = col;
    const jy = bottom[1] + 12;
    node.kids.forEach((kid, i) => {
      const x = colX(c);
      if (i === 0) {
        if (node.kids.length > 1) wires.push({ pts: [[bottom[0], bottom[1]], [bottom[0], jy]], rep: bottom[2] });
        c += place(kid, c, row, node.kids.length > 1 ? [x, jy, bottom[2]] : bottom);
      } else {
        wires.push({ pts: [[colX(col), jy], [x, jy]], rep: bottom[2] });
        c += place(kid, c, row, [x, jy, bottom[2]]);
      }
    });
    // Puntos de derivación: en cada columna intermedia donde baja un hijo.
    if (node.kids.length > 1) {
      let cc = col;
      node.kids.forEach((kid, i) => {
        if (i < node.kids.length - 1) dots.push({ x: colX(cc), y: jy, rep: bottom[2] });
        cc += widthOf(kid);
      });
    }
    return Math.max(w, c - col);
  };
  const widthOf = (node) => {
    const w = node.item.par ? node.item.par.length : 1;
    if (node.leaf) return w;
    return Math.max(w, node.kids.reduce((a, k) => a + widthOf(k), 0));
  };

  let c = 0;
  root.kids.forEach((kid) => {
    const x = colX(c);
    dots.push({ x, y: RAIL_TOP, rep: posRep });
    c += place(kid, c, 0, [x, RAIL_TOP, posRep]);
  });
  const cols = Math.max(c, 4);
  const w = X0 + COLW * cols + 40;
  const H = railBot + 96 + 70;
  const vt = `${src.volts} V${dc ? "DC" : "AC"}`;
  return /** @type {Sheet} */ ({
    n: 0,
    id: "",
    kind: "control",
    title,
    src: src.id,
    srcKind: src.kind,
    w: Math.max(w, 760),
    h: H,
    cols,
    colW: COLW,
    x0: X0,
    rails: {
      top: { y: RAIL_TOP, label: dc ? `+${src.volts} V` : "L", rep: posRep, desig: `${desig(src.dev.id)} ${vt}` },
      bot: { y: railBot, label: dc ? "0 V" : "N", rep: negRep },
    },
    elems,
    blocks: [],
    wires,
    dots,
    notes: [],
  });
}

/**
 * Hoja de potencia: barras de la fuente trifásica arriba y bloques de 3 polos
 * por niveles (lo que alimenta cada uno), unidos por pistas horizontales.
 */
function powerSheet(src, devs, net, rep, isWired, spec) {
  const PH = 26; // separación entre polos
  const BW = 170; // ancho de cada bloque
  const BH = 64; // alto del cuerpo de un bloque
  const TRACK = 14;
  /** @type {Map<string, number>} nivel del nodo (0 = barras) */
  const level = new Map();
  const order = ["L1", "L2", "L3"];
  order.forEach((ph) => src.phases[ph] && level.set(net(src.phases[ph]), 0));
  /** @type {Map<string, { dev: any, level: number, poles: any[] }>} */
  const placed = new Map();
  for (let guard = 0; guard < 20; guard++) {
    let changed = false;
    for (const dev of devs) {
      if (placed.has(dev.id) || dev === src.dev) continue;
      const poles = [];
      for (const [cid, [a, b]] of Object.entries(dev.el.contacts ?? {})) {
        const ta = `${dev.id}.${a}`;
        const tb = `${dev.id}.${b}`;
        const la = level.get(net(ta));
        const lb = level.get(net(tb));
        // El borne del lado de la fuente (nivel menor) va arriba.
        if (la !== undefined && (lb === undefined || lb > la)) poles.push({ cid, top: ta, bot: tb, tTop: a, tBot: b, lv: la });
        else if (lb !== undefined && (la === undefined || la > lb)) poles.push({ cid, top: tb, bot: ta, tTop: b, tBot: a, lv: lb });
      }
      const motor = (dev.el.phaseLoads ?? []).length && !Object.keys(dev.el.contacts ?? {}).some((c) => /^[135]-[246]$/.test(c));
      if (motor) {
        // Motor: los bornes de entrada con tensión (U1 V1 W1); lo demás es su conexión interna.
        poles.length = 0;
        for (const pl of dev.el.phaseLoads) for (const t of pl.terminals) {
          const lv = level.get(net(`${dev.id}.${t}`));
          if (lv !== undefined && !poles.some((p) => net(p.top) === net(`${dev.id}.${t}`))) poles.push({ cid: t, top: `${dev.id}.${t}`, bot: "", tTop: t, tBot: "", lv });
        }
      }
      if (!poles.length) continue;
      const lv = Math.max(...poles.map((p) => p.lv)) + 1;
      placed.set(dev.id, { dev, level: lv, poles, motor: !!motor });
      for (const p of poles) if (p.bot && !level.has(net(p.bot))) level.set(net(p.bot), lv);
      changed = true;
    }
    if (!changed) break;
  }
  if (!placed.size) return null;
  const blocks = [...placed.values()];
  const maxLv = Math.max(...blocks.map((b) => b.level));
  // Pistas: nodos que llegan a cada nivel.
  /** @type {Map<number, string[]>} */
  const tracks = new Map();
  tracks.set(1, order.filter((ph) => src.phases[ph]).map((ph) => net(src.phases[ph])));
  for (let lv = 2; lv <= maxLv; lv++) {
    const ns = [];
    for (const b of blocks.filter((x) => x.level === lv)) for (const p of b.poles) if (!ns.includes(net(p.top)) && level.get(net(p.top)) !== 0) ns.push(net(p.top));
    tracks.set(lv, ns);
  }
  // Orden en cada nivel: por el promedio de la posición de lo que lo alimenta.
  /** @type {Map<string, number>} x de cada borne de salida ya dibujado */
  const outX = new Map();
  const X = 80;
  let y = 70;
  /** @type {Block[]} */
  const out = [];
  /** @type {Wire[]} */
  const wires = [];
  /** @type {Dot[]} */
  const dots = [];
  const bus = [];
  let maxX = X + BW;
  const lvY = new Map();
  // Primero calculamos y por nivel.
  for (let lv = 1; lv <= maxLv; lv++) {
    const n = (tracks.get(lv) ?? []).length;
    const trackY0 = y;
    lvY.set(lv, { trackY0, top: trackY0 + (n - 1) * TRACK + 26 });
    y = trackY0 + (n - 1) * TRACK + 26 + BH + 30;
  }
  for (let lv = 1; lv <= maxLv; lv++) {
    const row = blocks.filter((b) => b.level === lv);
    const bary = (b) => {
      const xs = b.poles.map((p) => outX.get(net(p.top))).filter((v) => v !== undefined);
      return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : devs.indexOf(b.dev) * 1e-3;
    };
    if (lv > 1) row.sort((a, b) => bary(a) - bary(b));
    const { top } = lvY.get(lv);
    row.forEach((b, i) => {
      b.poles.sort((p, q) => natural(p.tTop, q.tTop));
      const bx = X + 40 + i * BW;
      const kind = b.motor ? "motor3" : /overload|protector/.test(b.dev.def.type) ? "thermal3" : /breaker/.test(b.dev.def.type) ? "breaker3" : /vfd/.test(b.dev.def.type) ? "vfd" : "poles3";
      const blk = /** @type {Block} */ ({
        kind,
        dev: b.dev.id,
        type: b.dev.def.type,
        label: desig(b.dev.id),
        x: bx,
        y: top,
        w: (b.poles.length - 1) * PH,
        h: BH,
        poles: b.poles.map((p, j) => ({ x: bx + j * PH, cid: p.cid, top: rep(p.top), bot: p.bot ? rep(p.bot) : "", tTop: p.tTop, tBot: p.tBot })),
      });
      const tx = funcText(spec, b.dev.id);
      if (tx) blk.text = tx;
      out.push(blk);
      maxX = Math.max(maxX, bx + BW);
      b.poles.forEach((p, j) => p.bot && outX.set(net(p.bot), bx + j * PH));
    });
  }
  // Pistas y bajadas.
  for (let lv = 1; lv <= maxLv; lv++) {
    const { trackY0 } = lvY.get(lv);
    const ns = tracks.get(lv) ?? [];
    ns.forEach((n, k) => {
      const ty = trackY0 + k * TRACK;
      const r = rep(n);
      const xs = [];
      // Consumidores de este nodo (en este nivel o más abajo).
      for (const b of out) for (const p of b.poles) if (net(p.top) === n) {
        xs.push(p.x);
        wires.push({ pts: [[p.x, ty], [p.x, b.y]], rep: p.top });
        dots.push({ x: p.x, y: ty, rep: r });
      }
      // Productores (salidas de bloques de arriba).
      for (const b of out) for (const p of b.poles) if (p.bot && net(p.bot) === n) {
        xs.push(p.x);
        wires.push({ pts: [[p.x, b.y + b.h], [p.x, ty]], rep: p.bot });
        dots.push({ x: p.x, y: ty, rep: r });
      }
      if (lv === 1) {
        const ph = order[k];
        bus.push({ y: ty, label: src.phases[ph].split(".").pop() ?? ph, rep: rep(src.phases[ph]) });
      } else if (xs.length) wires.push({ pts: [[Math.min(...xs), ty], [Math.max(...xs), ty]], rep: r });
    });
  }
  const w = Math.max(maxX + 40, 760);
  for (const b of bus) wires.push({ pts: [[X - 20, b.y], [w - 40, b.y]], rep: b.rep });
  const cols = Math.max(4, Math.ceil((w - X) / COLW));
  return /** @type {Sheet} */ ({
    n: 0,
    id: "",
    kind: "power",
    title: /power-3ph/.test(src.dev.def.type) ? `Potencia ${src.volts} VAC 3~` : `Potencia: salida de ${desig(src.dev.id)}`,
    src: src.id,
    srcKind: "AC3",
    w,
    h: y + 96 + 40,
    cols,
    colW: COLW,
    x0: X - 20,
    bus: bus.map((b) => ({ ...b, desig: `${desig(src.dev.id)} 3~ ${src.volts} V` })),
    elems: [],
    blocks: out,
    wires,
    dots,
    notes: [],
  });
}
