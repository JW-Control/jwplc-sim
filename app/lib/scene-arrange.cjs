// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Ordenar como tablero»: acomoda el esquema «A colores» siguiendo las
// columnas del esquema normalizado (scene/iec.mjs), con reglas fijas para que
// los cables no se crucen:
//
//   1. El PLC al centro y las fuentes de mando a su izquierda.
//   2. Entradas ARRIBA del PLC: una columna por entrada, en el mismo orden
//      que sus bornes (I0.0, I0.1…), con los contactos en serie apilados.
//   3. Salidas ABAJO del PLC: una columna por salida en el orden de Q0.0,
//      Q0.1…; los contactos intermedios en filas y las cargas (contactores,
//      pilotos, válvulas) alineadas en la última fila. Lo que alimenta a
//      varias salidas (la parada de emergencia) va a la izquierda de ellas.
//   4. Potencia debajo de su contactor: térmico acoplado y motor; la fuente
//      trifásica a la derecha de los contactores.
//   5. Mando cableado sin PLC: columnas a la derecha del PLC, de + a −.
//   6. Equipos de planta (sin bornes) a la derecha; lo demás, al final.
//   7. Los cables largos de las fuentes (+24 V y 0 V repartidos a muchos
//      equipos) se dibujan como referencia de potencial «→ PS1.+V1», como en
//      los planos, igual que los muy largos entre bandas; los cortos quedan
//      como cable. Se borran los dobleces
//      manuales (ya no corresponden).
//
// Es puro (sin DOM): la vista le pasa el tamaño y los bornes de cada símbolo.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JwsimArrange = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const GRID = 20;
  const GAP = 40; // entre equipos de una fila
  const ROW_GAP = 120; // entre bandas (lugar para los cables)
  const REF_LEN = 520; // un cable de fuente más largo que esto va como referencia
  const LONG_LEN = 900; // cualquier otro cable más largo que esto, también
  const snap = (v) => Math.round(v / GRID) * GRID;
  const devOf = (end) => String(end).slice(0, String(end).indexOf("."));
  const termOf = (end) => String(end).slice(String(end).indexOf(".") + 1);
  const isPlc = (t) => /jwplc-basic|remote-io/.test(t);
  const isSource2 = (t) => /power-24vdc|power-230vac/.test(t);

  /**
   * @param {{ sheets: any[] }} model  esquema IEC (scene/iec.mjs)
   * @param {{ id: string, type: string, w: number, h: number, mount?: string, terms: Record<string, [number, number, string]>, x?: number, y?: number }[]} devs
   * @param {{ from: string, to: string, ref?: boolean }[]} wiring
   * @param {{ mountDy?: Record<string, number> }} [opts]
   * @returns {{ pos: Record<string, { x: number, y: number }>, refs: number[], bands: Record<string, string[]> }}
   */
  function arrange(model, devs, wiring, opts = {}) {
    const byId = new Map(devs.map((d) => [d.id, d]));
    const mounted = new Set(devs.filter((d) => d.mount && byId.has(d.mount)).map((d) => d.id));
    const guestOf = (id) => devs.filter((d) => d.mount === id);
    /** Alto con lo acoplado debajo (térmico bajo el contactor). */
    const fullH = (d) => Math.max(d.h, ...guestOf(d.id).map((g) => (opts.mountDy?.[g.type] ?? d.h) + g.h));
    const fullW = (d) => Math.max(d.w, ...guestOf(d.id).map((g) => g.w));
    /** @type {Map<string, { x: number, y: number }>} */
    const pos = new Map();
    const bands = { left: [], above: [], below: [], feed: [], aside: [], power: [], plant: [], rest: [] };
    const free = (id) => byId.has(id) && !pos.has(id) && !mounted.has(id);
    const place = (id, x, y, band) => {
      pos.set(id, { x, y });
      bands[band].push(id);
    };

    // Columnas del esquema IEC: elementos de arriba abajo.
    const cols = [];
    for (const sh of model.sheets ?? []) {
      if (sh.kind !== "control") continue;
      const byCol = new Map();
      for (const e of sh.elems) {
        if (!byCol.has(e.col)) byCol.set(e.col, []);
        byCol.get(e.col).push(e);
      }
      for (const [c, es] of [...byCol].sort((a, b) => a[0] - b[0])) {
        es.sort((a, b) => a.y - b.y);
        cols.push({ sheet: sh, col: c, es, title: sh.title });
      }
    }
    // El IEC dibuja una vez lo compartido: las columnas que salen de una
    // derivación no repiten la parada de emergencia, pero la heredan.
    const plc = devs.find((d) => isPlc(d.type));
    const sources = devs.filter((d) => isSource2(d.type));

    // ---- 1. PLC y fuentes
    const X0 = 0;
    let leftW = 0;
    {
      let y = 0;
      for (const s of sources) {
        place(s.id, X0, y, "left");
        y += s.h + GAP;
        leftW = Math.max(leftW, s.w);
      }
    }
    const plcX = snap(X0 + (sources.length ? leftW + 2 * GAP + 40 : 0));
    const plcY = 0;
    if (plc) place(plc.id, plcX, plcY, "left");
    const termX = (end) => {
      const d = byId.get(devOf(end));
      const p = pos.get(d?.id);
      const t = d?.terms[termOf(end)];
      return p && t ? p.x + t[0] : null;
    };

    // ---- 2 y 3. Entradas arriba y salidas abajo, por el orden de los bornes del PLC
    const ins = [];
    const outs = [];
    const feeders = [];
    const aside = [];
    // Un equipo con bobina va en la columna de su bobina; sus contactos
    // auxiliares en otras columnas (enclavamientos) no lo mueven.
    const loadDevs = new Set(cols.flatMap((c) => c.es.filter((e) => e.kind !== "contact").map((e) => e.dev)));
    for (const c of cols) {
      const k = c.es.findIndex((e) => plc && e.dev === plc.id);
      const field = (list) =>
        list
          .filter((e) => !isPlc(byId.get(e.dev)?.type ?? "") && !isSource2(byId.get(e.dev)?.type ?? ""))
          .filter((e) => e.kind !== "contact" || !loadDevs.has(e.dev))
          .map((e) => e.dev);
      if (k >= 0 && c.es[k].kind === "plcin") ins.push({ key: termX(`${plc.id}.${c.es[k].cid}`), devs: field(c.es.slice(0, k)) });
      else if (k >= 0 && c.es[k].kind === "contact") {
        for (const id of field(c.es.slice(0, k))) if (!feeders.includes(id)) feeders.push(id);
        outs.push({ key: termX(`${plc.id}.${c.es[k].cid}.2`) ?? termX(`${plc.id}.${c.es[k].tBot}`), devs: field(c.es.slice(k + 1)) });
      } else if (k < 0 && /^Alimentación/.test(c.title)) ins.push({ key: Infinity, devs: field(c.es) }); // transmisores y sensores: campo
      else if (k < 0) aside.push({ devs: field(c.es) });
    }
    // Primero las columnas con PLC (fijan su lugar a cada equipo); un
    // equipo que ya está en otra columna no se repite.
    ins.sort((a, b) => (a.key ?? 0) - (b.key ?? 0));
    for (const g of ins) if (g.key === Infinity) g.key = null;
    outs.sort((a, b) => (a.key ?? 0) - (b.key ?? 0));
    const dedupe = (groups) => {
      for (const g of groups) g.devs = g.devs.filter((id, i, a) => a.indexOf(id) === i && free(id) && !claimed.has(id) && claimed.add(id));
      return groups.filter((g) => g.devs.length);
    };
    const claimed = new Set();
    const insG = dedupe(ins);
    for (const id of feeders) claimed.add(id);
    const outsG = dedupe(outs);
    const asideG = dedupe(aside);

    const colW = (g) => Math.max(...g.devs.map((id) => fullW(byId.get(id)))) + GAP;
    const plcW = plc ? plc.w : 0;
    const plcH = plc ? plc.h : 0;
    const startX = (groups, keys) => {
      const W = groups.reduce((a, g) => a + colW(g), 0) - GAP;
      const ks = keys.filter((k) => k !== null);
      const cx = ks.length ? ks.reduce((a, k) => a + k, 0) / ks.length : plcX + plcW / 2;
      return Math.max(plcX - (sources.length ? 0 : 0), cx - W / 2);
    };

    // Entradas: el último de cada columna (el que va al PLC) abajo, a la misma altura.
    if (insG.length) {
      let x = startX(insG, insG.map((g) => g.key));
      // Filas contadas desde el PLC hacia arriba.
      const rows = Math.max(...insG.map((g) => g.devs.length));
      const rowH = [];
      for (let r = 0; r < rows; r++) rowH[r] = Math.max(...insG.map((g) => byId.get(g.devs[g.devs.length - 1 - r])?.h ?? 0));
      for (const g of insG) {
        const w = colW(g);
        let y = plcY - ROW_GAP;
        g.devs
          .slice()
          .reverse()
          .forEach((id, r) => {
            const d = byId.get(id);
            y -= rowH[r];
            place(id, snap(x + (w - GAP - d.w) / 2), snap(y + (rowH[r] - d.h)), "above");
            y -= GAP;
          });
        x += w;
      }
    }

    // Salidas: contactos intermedios en filas y la carga en la última fila.
    let belowBottom = plcY + plcH;
    let outRight = plcX + plcW;
    if (outsG.length) {
      const y0 = plcY + plcH + ROW_GAP + 40;
      let x = startX(outsG, outsG.map((g) => g.key));
      // Alimentadores (emergencia) a la izquierda de las salidas.
      let fx = x;
      for (const id of feeders.slice().reverse()) {
        if (!free(id)) continue;
        const d = byId.get(id);
        fx -= d.w + GAP;
        place(id, snap(fx), snap(y0), "feed");
      }
      const mids = Math.max(0, ...outsG.map((g) => g.devs.length - 1));
      const rowH = [];
      for (let r = 0; r < mids; r++) rowH[r] = Math.max(0, ...outsG.map((g) => (g.devs.length - 1 > r ? byId.get(g.devs[r]).h : 0)));
      const loadY = y0 + rowH.reduce((a, h) => a + h + GAP, 0);
      let loadBottom = loadY;
      for (const g of outsG) {
        const w = colW(g);
        let y = y0;
        g.devs.forEach((id, r) => {
          const d = byId.get(id);
          const last = r === g.devs.length - 1;
          const yy = last ? loadY : y;
          place(id, snap(x + (w - GAP - d.w) / 2), snap(yy), "below");
          if (!last) y += rowH[r] + GAP;
          else loadBottom = Math.max(loadBottom, loadY + fullH(d));
        });
        x += w;
      }
      belowBottom = loadBottom;
      outRight = Math.max(outRight, x);
    }

    const bottomOf = (id) => {
      const d = byId.get(id);
      const p = pos.get(id);
      return p.y + fullH(d);
    };
    // ---- 4b. Cargas de circuitos de 230 VAC que siguen a un equipo ya ubicado (KM1 1-2 → motor).
    for (const c of cols) {
      c.es.forEach((e, i) => {
        if (!free(e.dev)) return;
        const prev = c.es.slice(0, i).reverse().find((o) => pos.has(o.dev) || mounted.has(o.dev));
        const host = prev && (mounted.has(prev.dev) ? byId.get(prev.dev).mount : prev.dev);
        if (!host || !pos.has(host)) return;
        const a = byId.get(host);
        const d = byId.get(e.dev);
        const p = pos.get(host);
        place(e.dev, snap(p.x + (fullW(a) - d.w) / 2), snap(bottomOf(host) + ROW_GAP), "power");
      });
    }

    // ---- 5. Mando cableado sin PLC: columnas a la derecha.
    let asideX = Math.max(outRight, plcX + plcW) + 2 * GAP;
    for (const g of asideG) {
      let y = plcY;
      const w = colW(g);
      for (const id of g.devs) {
        if (!free(id)) continue;
        const d = byId.get(id);
        place(id, snap(asideX + (w - GAP - d.w) / 2), snap(y), "aside");
        y += fullH(d) + GAP;
      }
      asideX += w;
    }

    // ---- 4. Potencia: la fuente trifásica a la derecha y cada bloque bajo el que lo alimenta.
    for (const sh of model.sheets ?? []) {
      if (sh.kind !== "power") continue;
      const srcId = String(sh.src).split(".")[0];
      if (free(srcId)) {
        const d = byId.get(srcId);
        const ref = sh.blocks.find((b) => pos.has(b.dev));
        const y = ref ? pos.get(ref.dev).y - d.h - GAP : plcY + plcH + ROW_GAP;
        place(srcId, snap(asideX), snap(y), "power");
        asideX += d.w + 2 * GAP;
      }
      // Niveles de arriba abajo (y del IEC).
      const blocks = sh.blocks.slice().sort((a, b) => a.y - b.y);
      for (const b of blocks) {
        if (!free(b.dev)) continue;
        const d = byId.get(b.dev);
        // Lo que lo alimenta: el bloque de arriba en la misma vertical del IEC.
        const up = blocks.filter((o) => o.y < b.y && Math.abs(o.x - b.x) < 30 && pos.has(o.dev) || o.y < b.y && Math.abs(o.x - b.x) < 30 && mounted.has(o.dev)).pop();
        const host = up && (mounted.has(up.dev) ? byId.get(up.dev).mount : up.dev);
        const anchor = host && pos.has(host) ? host : pos.has(srcId) ? srcId : null;
        if (anchor) {
          const a = byId.get(anchor);
          const p = pos.get(anchor);
          place(b.dev, snap(p.x + (fullW(a) - d.w) / 2), snap(bottomOf(anchor) + ROW_GAP), "power");
        } else {
          place(b.dev, snap(asideX), snap(belowBottom + ROW_GAP), "power");
          asideX += d.w + GAP;
        }
      }
    }
    // ---- 6. Planta (sin bornes) y lo que quedó.
    let maxX = Math.max(...[...pos].map(([id, p]) => p.x + fullW(byId.get(id))), plcX + plcW);
    let px = maxX + 3 * GAP;
    const top = Math.min(0, ...[...pos.values()].map((p) => p.y));
    let py = top;
    for (const d of devs) {
      if (!free(d.id) || Object.keys(d.terms).length) continue;
      place(d.id, snap(px), snap(py), "plant");
      py += d.h + GAP;
    }
    px = Math.max(px, ...bands.plant.map((id) => pos.get(id).x + byId.get(id).w + 2 * GAP));
    let ry = top;
    for (const d of devs) {
      if (!free(d.id)) continue;
      place(d.id, snap(px), snap(ry), "rest");
      ry += fullH(d) + GAP;
    }

    // Sin encimarse: lo que choca se corre a la derecha.
    const order = [...pos.keys()];
    const boxes = [];
    const hit = (b) => boxes.some((o) => b.x1 < o.x2 + GAP / 2 && b.x2 + GAP / 2 > o.x1 && b.y1 < o.y2 + GAP / 2 && b.y2 + GAP / 2 > o.y1);
    for (const id of order) {
      const d = byId.get(id);
      const p = pos.get(id);
      const box = () => ({ x1: p.x, y1: p.y, x2: p.x + fullW(d), y2: p.y + fullH(d) });
      for (let k = 0; k < 200 && hit(box()); k++) p.x += GRID;
      boxes.push(box());
    }
    // Origen arriba a la izquierda.
    const mx = Math.min(...[...pos.values()].map((p) => p.x));
    const my = Math.min(...[...pos.values()].map((p) => p.y));
    for (const p of pos.values()) {
      p.x = snap(p.x - mx);
      p.y = snap(p.y - my);
    }

    // ---- 7. Cables largos de las fuentes → referencia de potencial.
    const at = (end) => {
      const d = byId.get(devOf(end));
      const h = d && mounted.has(d.id) ? pos.get(d.mount) : null;
      const p = h ? { x: h.x, y: h.y + (opts.mountDy?.[d.type] ?? 0) } : pos.get(d?.id);
      const t = d?.terms[termOf(end)];
      return p && t ? { x: p.x + t[0], y: p.y + t[1] } : null;
    };
    const refs = [];
    wiring.forEach((w, i) => {
      const a = byId.get(devOf(w.from));
      const b = byId.get(devOf(w.to));
      if (!a || !b || w.ref) return;
      const src = isSource2(a.type) ? a : isSource2(b.type) ? b : null;
      // Lo que entra o sale del PLC queda como cable (se lee la E/S).
      if (isPlc(a.type) || isPlc(b.type)) return;
      const p = at(w.from);
      const q = at(w.to);
      if (!p || !q) return;
      const len = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
      // De las fuentes: los repartidos lejos; entre bandas (el térmico que
      // sube a una entrada): solo los muy largos.
      if (len > (src ? REF_LEN : LONG_LEN)) refs.push(i);
    });
    const out = {};
    for (const [id, p] of pos) out[id] = p;
    return { pos: out, refs, bands };
  }

  return { arrange };
});
