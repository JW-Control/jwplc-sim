// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Vista de escena (G7): la placa JWPLC Basic (SVG del render, con su pantalla
// y su botonera) y los dispositivos industriales como objetos movibles,
// cableados borne a borne. Sin simular, la escena se analiza en t = 0
// (avisos de cableado, fallas inmediatas); con la simulación en marcha el
// proceso principal co-simula (app/lib/scene-session.mjs) y aquí se ven los
// estados y se accionan los dispositivos.
"use strict";

(() => {
  const NS = "http://www.w3.org/2000/svg";
  const api = window.jwsim;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Grilla de la escena: bornes, dispositivos y tramos de cable caen en
  // múltiplos de GRID. El SVG de la placa tiene sus tornillos cada 64
  // unidades desde el origen del viewBox: con esta escala, cada 20 px.
  const GRID = 20;
  const BOARD_K = GRID / 64;
  const snap = (v) => Math.round(v / GRID) * GRID;
  // Colores de cable (IEC 60445 y usuales en tablero).
  const WIRE_COLORS = {
    rojo: "#e0392b", azul: "#2f62d6", celeste: "#55aef0", "marrón": "#8a5a2b", negro: "#2a2e35",
    gris: "#8b929b", blanco: "#eef1f4", naranja: "#f08a24", violeta: "#8e5bd0", "verde-amarillo": "#3fae49",
  };
  const COLORS = { verde: "#37d67a", rojo: "#ff5d5d", amarillo: "#ffc53d", azul: "#3e9bff", blanco: "#f2f4f7", negro: "#2b2f35" };

  const S = {
    defs: new Map(), // tipo -> definición (sin funciones)
    spec: { devices: [], wiring: [] },
    snap: null,
    running: false,
    view: "board",
    sel: null, // { kind: "device" | "wire", id }
    zoom: 0.8,
    pan: { x: 20, y: 20 },
    boardSvg: null,
    boardEntries: {},
    boardSides: {},
    board: { w: 452, h: 500, k: BOARD_K },
    staticPoles: {}, // polos del último análisis sin simular (color automático de cables)
    boardTerms: {}, // borne -> [x, y] en la placa escalada
    drag: null,
    wiring: null, // { from, x, y }
    rendered: new Map(), // id -> firma del estado dibujado
    analyzeTimer: null,
  };

  // ------------------------------------------------------------ símbolos
  // Cada símbolo: tamaño, posición de los bornes y cuerpo según el estado.
  // Bornes "t" (arriba) o "b" (abajo) para orientar el cable al salir.
  // Disposición de cada dispositivo (scene-symbols.js); la placa sale de su SVG.
  // terms: { id: [x, y] } con el punto de entrada del cable (en la grilla).
  const layouts = new Map();
  function symbolFor(dev) {
    const t = dev.type;
    if (t === "jwsim/jwplc-basic") return { w: S.board.w, h: S.board.h, terms: S.boardEntries, screws: S.boardTerms, sides: S.boardSides, board: true };
    // Una plantilla por variante (p. ej. el modelo de la fuente): la caché va por plantilla.
    const def = S.defs.get(t);
    const p = { ...defaultsOf(t), ...(dev.params ?? {}) };
    const key = window.JwsimSymbols.templateKey(t, def, p) ?? t;
    if (!layouts.has(key)) {
      const lay = window.JwsimSymbols.layout(t, def, p);
      const terms = {};
      const screws = {};
      const sides = {};
      const k = window.JwsimSymbols.SCREW_INSET;
      for (const [id, v] of Object.entries(lay.terms)) {
        terms[id] = [v.x, v.y];
        screws[id] = [v.x, v.screw ?? (v.side === "t" ? v.y + k : v.y - k)];
        sides[id] = v.side;
      }
      layouts.set(key, { w: lay.w, h: lay.h, terms, screws, sides, lay });
    }
    return layouts.get(key);
  }

  const out = (id) => S.snap?.devices.find((d) => d.id === id) ?? { outputs: {}, contacts: {}, actions: {}, damaged: [] };

  function defaultsOf(type) {
    return Object.fromEntries((S.defs.get(type)?.parameters ?? []).map((p) => [p.id, p.default]));
  }

  // ------------------------------------------------------------ placa
  async function loadBoard() {
    if (S.boardSvg) return;
    let text = await api.sceneBoardSvg();
    // Ids propios dentro del documento (la app ya usa #tft para el canvas).
    text = text.replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "");
    text = text.replace(/\bid="([^"]+)"/g, 'id="plcsvg-$1"').replace(/href="#/g, 'href="#plcsvg-').replace(/url\(#/g, "url(#plcsvg-");
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    const [vx, vy, vw, vh] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    const k = BOARD_K;
    S.board = { w: vw * k, h: vh * k, k };
    // Tornillos (clic para cablear) y entrada del cable: el borde de la
    // bornera hacia afuera de la placa (arriba, abajo o el borde superior de
    // la bornera RS-485).
    const ENTRY_Y = { sup: 18, med: 1126, inf: 1600 };
    const terms = {};
    const entries = {};
    const sides = {};
    for (const g of svg.querySelectorAll(".borne")) {
      const u = g.querySelector("use");
      const sig = g.dataset.senal;
      const id = /^Q0_/.test(sig) ? `${sig}.${g.dataset.pos}` : sig;
      const x = (Number(u.getAttribute("x")) - vx) * k;
      const block = g.dataset.bloque.split("-")[0];
      terms[id] = [x, (Number(u.getAttribute("y")) - vy) * k];
      entries[id] = [x, (ENTRY_Y[block] - vy) * k];
      sides[id] = block === "inf" ? "b" : "t";
    }
    S.boardTerms = terms;
    S.boardEntries = entries;
    S.boardSides = sides;
    svg.setAttribute("width", String(S.board.w));
    svg.setAttribute("height", String(S.board.h));
    svg.removeAttribute("role");
    // Pantalla: un canvas que copia el de la app en cada cuadro.
    const tft = svg.querySelector("#plcsvg-tft");
    if (tft) {
      const fo = doc.createElementNS(NS, "foreignObject");
      for (const k of ["x", "y", "width", "height"]) fo.setAttribute(k, tft.getAttribute(k));
      const c = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      c.setAttribute("id", "scene-tft");
      c.setAttribute("width", "320");
      c.setAttribute("height", "170");
      c.setAttribute("style", "width:100%;height:100%;display:block");
      fo.appendChild(c);
      tft.after(fo);
    }
    S.boardSvg = svg;
  }

  function copyTft() {
    const dst = $("scene-tft");
    const src = $("tft");
    if (dst && src && S.view === "scene") dst.getContext("2d").drawImage(src, 0, 0);
  }

  // ------------------------------------------------------------ dibujo
  const devById = (id) => S.spec.devices.find((d) => d.id === id);

  // Borne: entrada del cable (x, y), tornillo (sx, sy) y lado (arriba/abajo).
  function termPos(end) {
    const i = end.indexOf(".");
    const dev = devById(end.slice(0, i));
    if (!dev) return null;
    const sym = symbolFor(dev);
    const id = end.slice(i + 1);
    const p = sym.terms[id];
    if (!p) return null;
    const x0 = dev.x ?? 0;
    const y0 = dev.y ?? 0;
    return {
      x: x0 + p[0],
      y: y0 + p[1],
      sx: x0 + sym.screws[id][0],
      sy: y0 + sym.screws[id][1],
      up: sym.sides[id] === "t",
      box: { x1: x0, y1: y0, x2: x0 + sym.w, y2: y0 + sym.h },
    };
  }

  // Color de un borne según su polo: +V rojo, −V azul, L marrón, N celeste.
  function poleColor(term, poles) {
    const i = term.indexOf(".");
    const dev = devById(term.slice(0, i));
    const t = term.slice(i + 1);
    if (dev?.type === "jwsim/power-24vdc" && /^[+-]V/.test(t)) return t[0] === "+" ? "rojo" : "azul";
    if (dev?.type === "jwsim/power-230vac") return t === "L" ? "marrón" : "celeste";
    for (const m of poles?.[term] ?? []) {
      const ac = devById(m.replace(/[+-]$/, "").split(".")[0])?.type === "jwsim/power-230vac";
      if (m.endsWith("+")) return ac ? "marrón" : "rojo";
      if (m.endsWith("-")) return ac ? "celeste" : "azul";
    }
    return null;
  }

  // Color propio del cable o, si no tiene, según el polo de sus bornes en el
  // análisis sin simular (negro para el mando).
  function wireColorName(w) {
    return w.color ?? poleColor(w.from, S.staticPoles) ?? poleColor(w.to, S.staticPoles) ?? "negro";
  }

  const shade = (hex, f) =>
    "#" + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).toString(16).padStart(2, "0")).join("");

  // ------------------------------------------------------------ ruteo
  // A* sobre la grilla (pasos de GRID): los cables esquivan las cajas de los
  // dispositivos, prefieren pocas curvas y no comparten tramos con otros
  // cables (salvo los que comparten un borne: son el mismo puente). Si el
  // usuario movió el tramo horizontal de un cable (points), se respeta.
  const BEND = 4; // costo de una curva, en pasos de grilla
  const SHARED = 8; // costo por paso sobre un tramo de otro cable
  const THROUGH = 60; // costo por paso dentro de la caja de un dispositivo

  // Cajas que los cables no atraviesan (en celdas de grilla, bordes incluidos).
  function obstacles() {
    return S.spec.devices.map((dev) => {
      const sym = symbolFor(dev);
      const x = dev.x ?? 0;
      const y = dev.y ?? 0;
      if (sym.board) {
        // La placa: entre la fila de bornes de arriba y la de abajo.
        const ys = Object.values(sym.terms).map((t) => t[1]);
        return { x1: x / GRID, y1: (y + Math.min(...ys)) / GRID, x2: (x + sym.w) / GRID, y2: (y + Math.max(...ys)) / GRID };
      }
      return { x1: x / GRID, y1: y / GRID, x2: (x + sym.w) / GRID, y2: (y + sym.h) / GRID };
    });
  }

  function astar(from, to, dir0, dirEnd, boxes, occ, ends, bounds, limit = 400000) {
    const blocked = (x, y) => boxes.some((b) => x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2);
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const k = (x, y, d) => `${x},${y},${d}`;
    const h = (x, y) => Math.abs(x - to.x) + Math.abs(y - to.y);
    const heap = [];
    const push = (n) => {
      heap.push(n);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const best = new Map();
    push({ x: from.x, y: from.y, d: dir0, g: 0, f: h(from.x, from.y), prev: null });
    best.set(k(from.x, from.y, dir0), 0);
    let n = 0;
    while (heap.length && n++ < limit) {
      const c = pop();
      if (c.x === to.x && c.y === to.y) {
        const pts = [];
        for (let p = c; p; p = p.prev) pts.push({ x: p.x * GRID, y: p.y * GRID });
        return pts.reverse();
      }
      if (c.g > (best.get(k(c.x, c.y, c.d)) ?? Infinity)) continue;
      for (let d = 0; d < 4; d++) {
        if ((d ^ 1) === c.d) continue; // sin volver atrás
        const x = c.x + D[d][0];
        const y = c.y + D[d][1];
        if (x < bounds.x1 || x > bounds.x2 || y < bounds.y1 || y > bounds.y2) continue;
        const goal = x === to.x && y === to.y;
        // Atravesar un dispositivo se permite, muy caro: solo si no hay otro
        // camino (p. ej. dos equipos pegados).
        const through = !goal && blocked(x, y) ? THROUGH : 0;
        const seg = d < 2 ? `h${Math.min(x, c.x)},${y}` : `v${x},${Math.min(y, c.y)}`;
        const others = occ.get(seg);
        let g = c.g + 1 + through + (d !== c.d ? BEND : 0) + (others && !others.some((e) => ends.has(e)) ? SHARED : 0);
        if (goal && d !== dirEnd) g += BEND;
        const key = k(x, y, d);
        if (g < (best.get(key) ?? Infinity)) {
          best.set(key, g);
          push({ x, y, d, g, f: g + h(x, y), prev: c });
        }
      }
    }
    return null;
  }

  const dirOf = (p, q) => (q.x > p.x ? 0 : q.x < p.x ? 1 : q.y > p.y ? 2 : 3);

  // Primer punto de la grilla hacia afuera de la entrada (a 10 px o más).
  const stubOf = (a) => ({ x: a.x, y: a.up ? Math.floor((a.y - 10) / GRID) * GRID : Math.ceil((a.y + 10) / GRID) * GRID });

  function route(w, ctx) {
    const a = termPos(w.from);
    const b = termPos(w.to);
    if (!a || !b) return null;
    const s1 = stubOf(a);
    const s2 = stubOf(b);
    let mid = null;
    if (w.points?.length) {
      // Recorrido del usuario: sus puntos de doblez, en orden.
      mid = [s1, ...w.points.map(([x, y]) => ({ x, y })), s2];
    } else if (ctx) {
      const g = (p) => ({ x: Math.round(p.x / GRID), y: Math.round(p.y / GRID) });
      mid = astar(g(s1), g(s2), dirOf(a, s1), dirOf(s2, b), ctx.boxes, ctx.occ, new Set([w.from, w.to]), ctx.bounds, ctx.limit);
    }
    const routed = !!mid;
    if (!mid) {
      const ym = a.up && b.up ? Math.min(s1.y, s2.y) : !a.up && !b.up ? Math.max(s1.y, s2.y) : snap((s1.y + s2.y) / 2);
      mid = [s1, { x: s1.x, y: ym }, { x: s2.x, y: ym }, s2];
    }
    // Sin puntos repetidos ni intermedios alineados (el recorrido automático).
    const out = [];
    for (const p of mid) {
      if (out.length && out.at(-1).x === p.x && out.at(-1).y === p.y) continue;
      if (!w.points?.length && out.length >= 2) {
        const [q, r] = out.slice(-2);
        if ((q.x === r.x && r.x === p.x) || (q.y === r.y && r.y === p.y)) out.pop();
      }
      out.push(p);
    }
    if (ctx) occupy(ctx, w, out);
    // Puntos de doblez editables: los interiores entre las dos salidas.
    return { mid: out, vertices: out.slice(1, -1), a, b, s1, s2, routed };
  }

  // Registra los tramos de un cable (para los siguientes) con sus bornes.
  function occupy(ctx, w, out) {
    {
      for (let i = 1; i < out.length; i++) {
        const [p, q] = [out[i - 1], out[i]];
        if (p.x !== q.x && p.y !== q.y) continue;
        const steps = Math.round(Math.hypot(q.x - p.x, q.y - p.y) / GRID);
        for (let j = 0; j < steps; j++) {
          const x = Math.round(p.x / GRID) + j * Math.sign(q.x - p.x);
          const y = Math.round(p.y / GRID) + j * Math.sign(q.y - p.y);
          const seg = p.y === q.y ? `h${Math.min(x, x + Math.sign(q.x - p.x))},${y}` : `v${x},${Math.min(y, y + Math.sign(q.y - p.y))}`;
          if (!ctx.occ.has(seg)) ctx.occ.set(seg, []);
          ctx.occ.get(seg).push(w.from, w.to);
        }
      }
    }
  }

  function routeContext() {
    const boxes = obstacles();
    const xs = boxes.flatMap((b) => [b.x1, b.x2]);
    const ys = boxes.flatMap((b) => [b.y1, b.y2]);
    const m = 12;
    return {
      boxes,
      occ: new Map(),
      bounds: { x1: Math.min(...xs) - m, x2: Math.max(...xs) + m, y1: Math.min(...ys) - m, y2: Math.max(...ys) + m },
    };
  }

  // Trazo con esquinas redondeadas.
  function roundedPath(pts, r = 9) {
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [p, q, n] = [pts[i - 1], pts[i], pts[i + 1]];
      const l1 = Math.hypot(q.x - p.x, q.y - p.y);
      const l2 = Math.hypot(n.x - q.x, n.y - q.y);
      const k = Math.min(r, l1 / 2, l2 / 2);
      const a = { x: q.x - ((q.x - p.x) / l1) * k, y: q.y - ((q.y - p.y) / l1) * k };
      const b = { x: q.x + ((n.x - q.x) / l2) * k, y: q.y + ((n.y - q.y) / l2) * k };
      d += ` L${a.x} ${a.y} Q${q.x} ${q.y} ${b.x} ${b.y}`;
    }
    return d + ` L${pts.at(-1).x} ${pts.at(-1).y}`;
  }

  // Con tensión: el cable está en el polo positivo (L+ o L) de una fuente en
  // servicio, con la simulación en marcha.
  function wireLive(w) {
    if (!S.running) return false;
    return (S.snap?.poles?.[w.from] ?? []).some((m) => m.endsWith("+"));
  }

  function renderWires() {
    const g = $("scene-wires");
    g.textContent = "";
    // Los recorridos se recalculan solo si cambió la geometría (no con cada
    // instantánea de la simulación). Al arrastrar un equipo o un punto de
    // doblez se vuelven a trazar solo los cables afectados, con A* y los
    // demás como ocupados: el cable esquiva los equipos también mientras se
    // mueve.
    const layout = JSON.stringify([S.spec.devices.map((d) => [d.id, d.type, d.x, d.y]), S.spec.wiring.map((w) => [w.from, w.to, w.points])]);
    if (S.routeKey !== layout) {
      const ctx = routeContext();
      const moving = S.drag?.moved && S.routes?.length === S.spec.wiring.length;
      const affected = (w, i) =>
        S.drag.kind === "device" ? w.from.startsWith(`${S.drag.dev.id}.`) || w.to.startsWith(`${S.drag.dev.id}.`) : S.drag.kind === "vertex" && i === S.drag.i;
      if (moving) {
        S.spec.wiring.forEach((w, i) => !affected(w, i) && S.routes[i] && occupy(ctx, w, S.routes[i].mid));
        ctx.limit = 40000;
        S.routes = S.spec.wiring.map((w, i) => (affected(w, i) ? route(w, ctx) : S.routes[i]));
      } else {
        S.routes = S.spec.wiring.map((w) => route(w, ctx));
      }
      S.routeKey = layout;
    }
    // Puentes: los cables de un mismo borne entran juntos, uno al lado del
    // otro, en un casquillo doble.
    const byTerm = new Map();
    S.spec.wiring.forEach((w, i) => {
      for (const t of [w.from, w.to]) {
        if (!byTerm.has(t)) byTerm.set(t, []);
        byTerm.get(t).push(i);
      }
    });
    const offset = (t, i) => {
      const list = byTerm.get(t);
      return (list.indexOf(i) - (list.length - 1) / 2) * 5;
    };
    let html = "";
    S.spec.wiring.forEach((w, i) => {
      const r = S.routes[i];
      if (!r) return;
      const da = offset(w.from, i);
      const db = offset(w.to, i);
      const pts = [
        { x: r.a.x + da, y: r.a.y },
        { x: r.s1.x + da, y: r.s1.y },
        ...r.mid,
        { x: r.s2.x + db, y: r.s2.y },
        { x: r.b.x + db, y: r.b.y },
      ].filter((p, k, all) => !k || p.x !== all[k - 1].x || p.y !== all[k - 1].y);
      const d = roundedPath(pts);
      const sel = S.sel?.kind === "wire" && S.sel.id === i;
      const c = WIRE_COLORS[wireColorName(w)] ?? WIRE_COLORS.negro;
      const live = wireLive(w);
      html +=
        `<g class="wire${sel ? " selected" : ""}${live ? " live" : ""}" data-wire="${i}" data-color="${esc(wireColorName(w))}">` +
        `<path class="wire-hit" d="${d}"/>` +
        (live ? `<path class="wire-glow" d="${d}"/>` : "") +
        `<path class="wire-outline" d="${d}" stroke="${shade(c, 0.45)}"/>` +
        `<path class="wire-core" d="${d}" stroke="${c}"/>` +
        `<path class="wire-shine" d="${d}"/>` +
        `<title>${esc(w.from)} — ${esc(w.to)}</title></g>`;
    });
    // Casquillos: la parte plástica del terminal asoma de la entrada de la
    // bornera (uno por borne; más ancho si es un puente).
    for (const [t, list] of byTerm) {
      const p = termPos(t);
      if (!p) continue;
      const wd = 6 + 5 * list.length;
      const len = 11;
      const y = p.up ? p.y - len : p.y;
      const c = WIRE_COLORS[wireColorName(S.spec.wiring[list[0]])] ?? WIRE_COLORS.negro;
      html += `<rect class="ferrule" x="${p.x - wd / 2}" y="${y}" width="${wd}" height="${len}" rx="2" fill="${shade(c, 0.8)}"/>`;
      html += `<rect class="ferrule-tip" x="${p.x - wd / 2 + 1}" y="${p.up ? p.y - 3 : p.y}" width="${wd - 2}" height="3" fill="#c9ced5"/>`;
    }
    // Puntos de doblez del cable seleccionado (arrastrables; ✕ los quita), en
    // su propia capa sobre los equipos para que ninguno los tape.
    let handles = "";
    if (S.sel?.kind === "wire" && S.routes[S.sel.id] && !S.running) {
      const r = S.routes[S.sel.id];
      const own = !!S.spec.wiring[S.sel.id].points?.length;
      r.vertices.forEach((v, k) => {
        handles += `<circle class="wire-handle" data-v="${k}" cx="${v.x}" cy="${v.y}" r="5"/>`;
        if (own) handles += `<g class="wire-del" data-v="${k}" transform="translate(${v.x + 11} ${v.y - 11})"><circle r="5.5"/><path d="M-2.5 -2.5L2.5 2.5M2.5 -2.5L-2.5 2.5"/></g>`;
      });
    }
    g.innerHTML = html;
    $("scene-handles").innerHTML = handles;
  }

  function renderDevice(dev, force = false) {
    const sym = symbolFor(dev);
    let g = document.querySelector(`#scene-root .dev[data-id="${CSS.escape(dev.id)}"]`);
    if (!g) {
      g = document.createElementNS(NS, "g");
      g.setAttribute("class", "dev");
      g.dataset.id = dev.id;
      // La placa va debajo de los cables; el resto encima (sus botones no
      // quedan tapados por un cable que pasa).
      $(sym.board ? "scene-board" : "scene-devices").appendChild(g);
      force = true;
    }
    g.setAttribute("transform", `translate(${dev.x ?? 0} ${dev.y ?? 0})`);
    g.classList.toggle("selected", S.sel?.kind === "device" && S.sel.id === dev.id);
    const st = { ...out(dev.id), id: dev.id };
    // Un símbolo con giro (data-spin) se redibuja en cada instante simulado.
    const pp = { ...defaultsOf(dev.type), ...(dev.params ?? {}) };
    if (!sym.board && window.JwsimSymbols.animated(dev.type, S.defs.get(dev.type), pp)) st.t_ms = S.snap?.t_ms ?? 0;
    const sig = JSON.stringify([st.outputs, st.contacts, st.damaged, st.tripped, dev.params, S.running, st.t_ms]);
    const tg = document.querySelector(`#scene-terms > g[data-id="${CSS.escape(dev.id)}"]`);
    tg?.setAttribute("transform", `translate(${dev.x ?? 0} ${dev.y ?? 0})`);
    if (!force && S.rendered.get(dev.id) === sig && tg) return;
    S.rendered.set(dev.id, sig);
    if (sym.board) {
      if (!g.querySelector("svg")) {
        g.textContent = "";
        g.appendChild(document.importNode(S.boardSvg, true));
        g.insertAdjacentHTML("beforeend", `<g class="board-leds"></g><text class="dev-id" x="${sym.w / 2}" y="${sym.h + 16}">${esc(dev.id)} · JWPLC Basic</text>`);
        for (const k of g.querySelectorAll(".tecla")) {
          k.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            if (S.running) window.pressKey?.(k.dataset.btn, true);
          });
          const up = () => S.running && window.pressKey?.(k.dataset.btn, false);
          k.addEventListener("pointerup", up);
          k.addEventListener("pointerleave", up);
        }
      }
      // Estado de E/S junto a cada borne: entrada energizada, relé cerrado.
      const leds = g.querySelector(".board-leds");
      let html = "";
      for (let k = 0; k < 8; k++) {
        const [x, y] = sym.screws[`I0_${k}`] ?? [];
        if (x !== undefined) html += `<circle cx="${x}" cy="${y + 70 * S.board.k}" r="4" class="${st.outputs?.[`I0_${k}`] ? "led on" : "led"}"/>`;
        const [qx, qy] = sym.screws[`Q0_${k}.1`] ?? [];
        const [qx2] = sym.screws[`Q0_${k}.2`] ?? [];
        if (qx !== undefined) html += `<circle cx="${(qx + qx2) / 2}" cy="${qy - 80 * S.board.k}" r="4" class="${st.contacts?.[`Q0_${k}`] ? "led on" : "led"}"/>`;
      }
      const plcWired = S.spec.wiring.some((w) => w.from.startsWith(`${dev.id}.`) || w.to.startsWith(`${dev.id}.`));
      if (plcWired && st.outputs && st.outputs.powered === false && S.snap) html += `<text class="dev-note bad" x="${sym.w / 2}" y="-8">sin 24 VDC en 24VDC/M0</text>`;
      leds.innerHTML = html;
    } else {
      const p = { ...defaultsOf(dev.type), ...(dev.params ?? {}) };
      g.innerHTML =
        window.JwsimSymbols.draw(dev.type, sym.lay, st, p, S.defs.get(dev.type)) +
        `<rect class="sel-frame" x="-6" y="-6" width="${sym.w + 12}" height="${sym.h + 12}" rx="6"/>` +
        `<text class="dev-id" x="${sym.w / 2}" y="${sym.h + 16}">${esc(dev.id)}${p.label ? ` · ${esc(p.label)}` : ""}</text>`;
    }
    // Bornes en su propia capa, encima de los cables (un clic en un borne ya
    // cableado empieza otro cable en vez de seleccionar el existente).
    let t = document.querySelector(`#scene-terms > g[data-id="${CSS.escape(dev.id)}"]`);
    if (!t) {
      t = document.createElementNS(NS, "g");
      t.setAttribute("class", "terms");
      t.dataset.id = dev.id;
      $("scene-terms").appendChild(t);
    }
    t.setAttribute("transform", `translate(${dev.x ?? 0} ${dev.y ?? 0})`);
    if (t.childElementCount && !force) return;
    let th = "";
    for (const [id, [x, y]] of Object.entries(sym.screws)) {
      // El borne es el tornillo dibujado: el círculo es invisible (resalta
      // al pasar el mouse).
      th += `<g class="term" data-term="${esc(`${dev.id}.${id}`)}"><circle cx="${x}" cy="${y}" r="${sym.board ? 26 * S.board.k : 10}"/>`;
      th += `<title>${esc(`${dev.id}.${id}`)}</title></g>`;
    }
    t.innerHTML = th;
  }

  function render(force = false) {
    if (S.view !== "scene") return;
    const keep = new Set(S.spec.devices.map((d) => d.id));
    for (const g of [...$("scene-board").children, ...$("scene-devices").children, ...$("scene-terms").children]) if (!keep.has(g.dataset.id)) g.remove();
    for (const dev of S.spec.devices) renderDevice(dev, force);
    renderWires();
    $("scene-root").setAttribute("transform", `translate(${S.pan.x} ${S.pan.y}) scale(${S.zoom})`);
    renderSide();
  }

  // ------------------------------------------------------------ panel lateral
  function renderSide() {
    const side = $("scene-inspector");
    const sel = S.sel;
    let html = "";
    if (sel?.kind === "device") {
      const dev = devById(sel.id);
      const def = dev && S.defs.get(dev.type);
      if (dev && def) {
        const st = out(dev.id);
        html += `<div class="insp-title">${esc(dev.id)} <span class="muted">${esc(def.name)} · ${esc(def.type)}@${esc(def.version)}</span></div>`;
        html += `<p class="insp-desc">${esc(def.description)}</p>`;
        for (const p of def.parameters) {
          const v = dev.params?.[p.id] ?? p.default;
          const dis = S.running ? "disabled" : "";
          let input;
          if (p.type === "enum") input = `<select data-param="${esc(p.id)}" ${dis}>${p.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
          else if (p.type === "boolean") input = `<input type="checkbox" data-param="${esc(p.id)}" ${v ? "checked" : ""} ${dis}/>`;
          else input = `<input type="${p.type === "number" ? "number" : "text"}" data-param="${esc(p.id)}" value="${esc(v)}" ${dis} placeholder="${esc(p.hint ?? "")}"/>`;
          html += `<label class="insp-row"><span>${esc(p.label ?? p.id)}${p.unit ? ` (${esc(p.unit)})` : ""}</span>${input}</label>`;
        }
        const vals = Object.entries(st.outputs ?? {});
        if (vals.length) {
          html += `<div class="insp-sub">Estado${S.snap ? ` · t = ${S.snap.t_ms.toFixed(1)} ms` : ""}</div><table class="insp-vals">`;
          for (const [k, v] of vals) html += `<tr><td>${esc(k)}</td><td>${esc(typeof v === "number" ? Math.round(v * 1000) / 1000 : v)}</td></tr>`;
          html += "</table>";
        }
        if (dev.type !== "jwsim/jwplc-basic") html += `<button class="small" id="scene-del" ${S.running ? "disabled" : ""}>Quitar ${esc(dev.id)}</button>`;
      }
    } else if (sel?.kind === "wire") {
      const w = S.spec.wiring[sel.id];
      if (w) {
        const cur = wireColorName(w);
        html += `<div class="insp-title">Cable</div><p class="insp-desc">${esc(w.from)} — ${esc(w.to)}</p>`;
        html += `<div class="insp-sub">Color</div><div class="wire-swatches">`;
        html += `<button class="swatch auto${w.color ? "" : " on"}" data-color="" title="Automático (según el polo)">A</button>`;
        for (const [name, hex] of Object.entries(WIRE_COLORS)) {
          html += `<button class="swatch${w.color === name ? " on" : ""}" data-color="${esc(name)}" title="${esc(name)}" style="background:${hex}"></button>`;
        }
        html += `</div><p class="insp-desc">Actual: ${esc(cur)}. Clic sobre el cable: agrega un punto de doblez; arrástrelo para dar forma; ✕ lo quita.</p>`;
        if (w.points?.length) html += `<button class="small" id="scene-wire-auto">Recorrido automático</button> `;
        html += `<button class="small" id="scene-del" ${S.running ? "disabled" : ""}>Quitar cable</button>`;
      }
    } else {
      html += `<p class="insp-desc muted">Arrastre los dispositivos. Para cablear, haga clic en un borne y luego en otro. Supr quita lo seleccionado. Con la simulación en marcha, haga clic en los pulsadores, selectores y sensores.</p>`;
    }
    side.innerHTML = html;
    // Diagnóstico: fallas, avisos del cableado y de la solución actual.
    const diag = $("scene-diag");
    const items = [];
    for (const f of S.snap?.faults ?? []) items.push(["bad", `${f.t_ms.toFixed(1)} ms · ${f.message}`, f.device]);
    for (const f of S.snap?.findings ?? []) items.push(["warn", f.message, f.load?.split(".")[0]]);
    for (const f of S.snap?.warnings ?? []) items.push(["warn", f.message, f.load?.split(".")[0]]);
    if (S.error) items.unshift(["bad", S.error, null]);
    diag.innerHTML = items.length
      ? items.slice(-30).map(([c, m, d]) => `<li class="${c}" data-dev="${esc(d ?? "")}">${esc(m)}</li>`).join("")
      : `<li class="ok">${S.snap ? "Sin fallas ni avisos" : "—"}</li>`;
    $("scene-rearm").disabled = !S.running || !(S.snap?.faults?.length || S.snap?.devices.some((d) => d.tripped || d.damaged.length));
  }

  // ------------------------------------------------------------ edición
  function toWorld(e) {
    const r = $("scene-svg").getBoundingClientRect();
    return { x: (e.clientX - r.left - S.pan.x) / S.zoom, y: (e.clientY - r.top - S.pan.y) / S.zoom };
  }

  function nextId(type) {
    const prefix = { "pushbutton-no": "S", "pushbutton-nc": "S", "selector-2": "SA", "selector-3": "SA", "limit-switch": "B", "sensor-inductive": "B", "sensor-photoelectric": "B", lamp: "H", buzzer: "HA", relay: "K", contactor: "KM", "solenoid-valve": "Y", motor: "M", "power-24vdc": "PS", "power-230vac": "L" }[type.split("/")[1]] ?? "D";
    for (let n = 1; ; n++) if (!devById(`${prefix}${n}`)) return `${prefix}${n}`;
  }

  function addDevice(type, x, y, id = nextId(type)) {
    if (type === "jwsim/jwplc-basic" && S.spec.devices.some((d) => d.type === type)) return null;
    const def = S.defs.get(type);
    S.spec.devices.push({ id, type, version: def?.version, params: {}, x: snap(x), y: snap(y) });
    S.sel = { kind: "device", id };
    changed();
    return id;
  }

  function addWire(from, to) {
    if (from === to || from.split(".")[0] === to.split(".")[0] && from === to) return false;
    if (S.spec.wiring.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) return false;
    // El color se fija al crear (según el polo de las puntas; negro para el mando).
    const color = poleColor(from, S.staticPoles) ?? poleColor(to, S.staticPoles) ?? "negro";
    S.spec.wiring.push({ from, to, color });
    S.sel = { kind: "wire", id: S.spec.wiring.length - 1 };
    changed();
    return true;
  }

  function removeSelected() {
    if (S.running || !S.sel) return;
    if (S.sel.kind === "wire") S.spec.wiring.splice(S.sel.id, 1);
    else {
      const id = S.sel.id;
      if (devById(id)?.type === "jwsim/jwplc-basic") return;
      S.spec.devices = S.spec.devices.filter((d) => d.id !== id);
      S.spec.wiring = S.spec.wiring.filter((w) => !w.from.startsWith(`${id}.`) && !w.to.startsWith(`${id}.`));
    }
    S.sel = null;
    changed();
  }

  // El cable pasa a tener recorrido propio: sus puntos de doblez son los del
  // recorrido automático actual.
  function ownPoints(i) {
    const wire = S.spec.wiring[i];
    if (!wire.points?.length) wire.points = (S.routes?.[i]?.vertices ?? []).map((v) => [v.x, v.y]);
  }

  // Inserta un punto de doblez en el tramo más cercano a p; devuelve su índice.
  function insertVertex(i, p) {
    ownPoints(i);
    const wire = S.spec.wiring[i];
    const r = S.routes[i];
    const full = [r.s1, ...wire.points.map(([x, y]) => ({ x, y })), r.s2];
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < full.length - 1; j++) {
      const [a, b] = [full[j], full[j + 1]];
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
      const d = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    wire.points.splice(best, 0, [p.x, p.y]);
    S.dirty = true;
    return best;
  }

  // La escena cambió (edición): se vuelve a analizar en t = 0.
  function changed() {
    S.dirty = true;
    clearTimeout(S.analyzeTimer);
    S.analyzeTimer = setTimeout(analyze, 120);
    render();
  }

  async function analyze() {
    if (S.running) return;
    const r = await api.sceneAnalyze(cleanSpec());
    S.error = r.error ?? null;
    S.snap = r.snapshot ?? null;
    S.staticPoles = S.snap?.poles ?? {};
    render(true);
  }

  function cleanSpec() {
    return {
      devices: S.spec.devices.map(({ id, type, version, params, x, y }) => ({ id, type, ...(version ? { version } : {}), ...(params && Object.keys(params).length ? { params } : {}), x: x ?? 0, y: y ?? 0 })),
      wiring: S.spec.wiring.map(({ from, to, color, points }) => ({ from, to, ...(color ? { color } : {}), ...(points?.length ? { points } : {}) })),
    };
  }

  async function act(id, action, value) {
    if (!S.running) return;
    await api.sceneAct(id, action, value);
  }

  // Al arrastrar se manda solo el último valor: un envío a la vez.
  async function actLatest(id, action, value) {
    S.actQ = { id, action, value };
    if (S.actBusy) return;
    S.actBusy = true;
    try {
      while (S.actQ) {
        const q = S.actQ;
        S.actQ = null;
        await act(q.id, q.action, q.value);
      }
    } finally {
      S.actBusy = false;
    }
  }

  function wirePointer() {
    const svg = $("scene-svg");
    svg.addEventListener("pointerdown", (e) => {
      const term = e.target.closest(".term");
      const actEl = e.target.closest(".act");
      const devEl = e.target.closest(".dev");
      // (los bornes están en #scene-terms, fuera del grupo del dispositivo)
      const wireEl = e.target.closest(".wire");
      const handle = e.target.closest(".wire-handle");
      const delV = e.target.closest(".wire-del");
      const w = toWorld(e);
      // Puntos de doblez del cable seleccionado: quitar o arrastrar.
      if ((handle || delV) && S.sel?.kind === "wire" && !S.running) {
        e.preventDefault();
        const wire = S.spec.wiring[S.sel.id];
        ownPoints(S.sel.id);
        const k = Number((handle ?? delV).dataset.v);
        if (delV) {
          wire.points.splice(k, 1);
          if (!wire.points.length) delete wire.points;
          S.dirty = true;
          renderWires();
          renderSide();
        } else {
          S.drag = { kind: "vertex", i: S.sel.id, k, moved: false };
          svg.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (term) {
        e.preventDefault();
        if (S.running) return;
        if (S.wiring) {
          addWire(S.wiring.from, term.dataset.term);
          S.wiring = null;
          $("scene-rubber").setAttribute("d", "");
        } else {
          S.wiring = { from: term.dataset.term };
        }
        return;
      }
      if (S.wiring) {
        S.wiring = null;
        $("scene-rubber").setAttribute("d", "");
      }
      // Pieza arrastrable (data-kind="drag" con data-drag, lineal o por tramos):
      // en marcha mueve la acción; detenida, fija el parámetro del mismo nombre.
      if (actEl?.dataset.kind === "drag" && devEl && actEl.dataset.drag) {
        e.preventDefault();
        const dev = devById(devEl.dataset.id);
        const spec = actEl.dataset.drag;
        const action = actEl.dataset.action;
        const cur = Number(
          (S.running ? out(dev.id).outputs?.[action] : undefined) ?? dev.params?.[action] ?? defaultsOf(dev.type)[action] ?? 0,
        );
        const local = (q) => (spec.startsWith("y") ? q.y - (dev.y ?? 0) : q.x - (dev.x ?? 0));
        S.drag = { kind: "act", dev, action, spec, local, off: local(w) - window.JwsimSymbols.dragPos(spec, cur), last: cur, moved: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      if (actEl && devEl && S.running) {
        e.preventDefault();
        const id = devEl.dataset.id;
        const kind = actEl.dataset.kind;
        const action = actEl.dataset.action;
        const cur = out(id).actions?.[action];
        if (kind === "momentary") {
          act(id, action, true);
          const up = () => {
            act(id, action, false);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointerup", up);
        } else if (kind === "toggle") act(id, action, !cur);
        else if (kind === "cycle") {
          const opts = actEl.dataset.options.split(",").map(Number);
          const i = opts.indexOf(Number(cur ?? 0));
          act(id, action, opts[(i + 1) % opts.length]);
        }
        return;
      }
      if (devEl) {
        const dev = devById(devEl.dataset.id);
        S.sel = { kind: "device", id: dev.id };
        S.drag = { kind: "device", dev, dx: w.x - (dev.x ?? 0), dy: w.y - (dev.y ?? 0), moved: false };
        svg.setPointerCapture(e.pointerId);
        render();
        return;
      }
      if (wireEl) {
        const i = Number(wireEl.dataset.wire);
        // Clic sobre el cable ya seleccionado: agrega un punto de doblez ahí
        // (en la grilla) y empieza a arrastrarlo.
        if (S.sel?.kind === "wire" && S.sel.id === i && !S.running) {
          const k = insertVertex(i, { x: snap(w.x), y: snap(w.y) });
          S.drag = { kind: "vertex", i, k, moved: false };
          svg.setPointerCapture(e.pointerId);
          renderWires();
          return;
        }
        S.sel = { kind: "wire", id: i };
        render();
        return;
      }
      S.sel = null;
      S.drag = { kind: "pan", x: e.clientX - S.pan.x, y: e.clientY - S.pan.y };
      svg.setPointerCapture(e.pointerId);
      render();
    });
    svg.addEventListener("pointermove", (e) => {
      const w = toWorld(e);
      if (S.wiring) {
        const a = termPos(S.wiring.from);
        if (a) $("scene-rubber").setAttribute("d", `M${a.x} ${a.y} L${w.x} ${w.y}`);
      }
      if (!S.drag) return;
      if (S.drag.kind === "act") {
        const d = S.drag;
        const v = Math.round(window.JwsimSymbols.dragValue(d.spec, d.local(w) - d.off) * 10) / 10;
        if (v === d.last) return;
        d.last = v;
        if (S.running) actLatest(d.dev.id, d.action, v);
        else {
          d.dev.params = { ...(d.dev.params ?? {}), [d.action]: v };
          d.changed = true;
          // La vista estática (analyze) se recalcula al soltar; mientras tanto
          // la pieza sigue al puntero.
          const sd = S.snap?.devices.find((x) => x.id === d.dev.id);
          if (sd?.outputs && d.action in sd.outputs) sd.outputs[d.action] = v;
          renderDevice(d.dev);
        }
        return;
      }
      if (S.drag.kind === "pan") {
        S.pan = { x: e.clientX - S.drag.x, y: e.clientY - S.drag.y };
        $("scene-root").setAttribute("transform", `translate(${S.pan.x} ${S.pan.y}) scale(${S.zoom})`);
      } else if (S.drag.kind === "vertex") {
        const wire = S.spec.wiring[S.drag.i];
        const p = [snap(w.x), snap(w.y)];
        const cur = wire.points[S.drag.k];
        if (cur[0] !== p[0] || cur[1] !== p[1]) {
          wire.points[S.drag.k] = p;
          S.drag.moved = true;
          renderWires();
        }
      } else {
        const nx = snap(w.x - S.drag.dx);
        const ny = snap(w.y - S.drag.dy);
        if (nx !== S.drag.dev.x || ny !== S.drag.dev.y) {
          S.drag.dev.x = nx;
          S.drag.dev.y = ny;
          S.drag.moved = true;
          renderDevice(S.drag.dev);
          // Un trazado por cuadro como máximo.
          if (!S.wireFrame) {
            S.wireFrame = requestAnimationFrame(() => {
              S.wireFrame = 0;
              renderWires();
            });
          }
        }
      }
    });
    svg.addEventListener("pointerup", () => {
      if (S.drag?.kind === "act") {
        const changedParam = S.drag.changed;
        S.drag = null;
        if (changedParam) changed();
        return;
      }
      const moved = S.drag?.moved;
      if (moved) S.dirty = true;
      S.drag = null;
      // Al soltar, todos los cables se vuelven a trazar con la escena nueva.
      if (moved) {
        S.routeKey = null;
        renderWires();
      }
    });
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const z = Math.min(3, Math.max(0.2, S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        S.pan = { x: mx - ((mx - S.pan.x) * z) / S.zoom, y: my - ((my - S.pan.y) * z) / S.zoom };
        S.zoom = z;
        $("scene-root").setAttribute("transform", `translate(${S.pan.x} ${S.pan.y}) scale(${S.zoom})`);
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (S.view !== "scene" || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      if (e.key === "Escape" && S.wiring) {
        S.wiring = null;
        $("scene-rubber").setAttribute("d", "");
      }
    });
    $("scene-inspector").addEventListener("change", (e) => {
      const el = e.target;
      const id = el.dataset.param;
      if (!id || S.sel?.kind !== "device") return;
      const dev = devById(S.sel.id);
      const p = S.defs.get(dev.type).parameters.find((x) => x.id === id);
      dev.params = { ...(dev.params ?? {}), [id]: p.type === "boolean" ? el.checked : p.type === "number" ? Number(el.value) : el.value };
      changed();
    });
    $("scene-inspector").addEventListener("click", (e) => {
      if (e.target.id === "scene-del") removeSelected();
      if (e.target.id === "scene-wire-auto" && S.sel?.kind === "wire") {
        delete S.spec.wiring[S.sel.id].points;
        S.dirty = true;
        render();
      }
      const sw = e.target.closest(".swatch");
      if (sw && S.sel?.kind === "wire") {
        const w = S.spec.wiring[S.sel.id];
        if (sw.dataset.color) w.color = sw.dataset.color;
        else delete w.color;
        S.dirty = true;
        render();
      }
    });
    $("scene-diag").addEventListener("click", (e) => {
      const d = e.target.closest("li")?.dataset.dev;
      if (d && devById(d)) {
        S.sel = { kind: "device", id: d };
        render();
      }
    });
  }

  function fit() {
    const box = $("scene-svg").getBoundingClientRect();
    if (!S.spec.devices.length || !box.width) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of S.spec.devices) {
      const s = symbolFor(d);
      x0 = Math.min(x0, d.x ?? 0);
      y0 = Math.min(y0, (d.y ?? 0) - 20);
      x1 = Math.max(x1, (d.x ?? 0) + s.w);
      y1 = Math.max(y1, (d.y ?? 0) + s.h + 24);
    }
    S.zoom = Math.min(2, Math.max(0.2, Math.min((box.width - 40) / (x1 - x0), (box.height - 40) / (y1 - y0))));
    S.pan = { x: 20 - x0 * S.zoom, y: 20 - y0 * S.zoom };
    render();
  }

  function populatePalette() {
    const sel = $("scene-add");
    const groups = new Map();
    for (const d of S.defs.values()) {
      if (d.type === "jwsim/jwplc-basic") continue;
      if (!groups.has(d.category)) groups.set(d.category, []);
      groups.get(d.category).push(d);
    }
    sel.innerHTML = `<option value="">Agregar dispositivo…</option>` +
      [...groups].map(([cat, list]) => `<optgroup label="${esc(cat)}">${list.map((d) => `<option value="${esc(d.type)}" title="${esc(d.description)}">${esc(d.name)}${d.installed ? " (instalado)" : ""}</option>`).join("")}</optgroup>`).join("");
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      const r = $("scene-svg").getBoundingClientRect();
      const c = toWorld({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 3 });
      addDevice(sel.value, c.x, c.y);
      sel.value = "";
    });
  }

  // ------------------------------------------------------------ API para app.js
  function ensurePlc() {
    if (!S.spec.devices.some((d) => d.type === "jwsim/jwplc-basic")) S.spec.devices.unshift({ id: "plc", type: "jwsim/jwplc-basic", x: 0, y: 0 });
  }

  async function setView(view) {
    S.view = view;
    for (const b of document.querySelectorAll("#board-view .seg")) {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
    }
    $("scene-view").hidden = view !== "scene";
    document.querySelector(".plc").hidden = view === "scene";
    document.querySelector(".board-card").classList.toggle("scene-mode", view === "scene");
    if (view === "scene") {
      await loadBoard();
      ensurePlc();
      render(true);
      if (!S.fitted) {
        S.fitted = true;
        fit();
      }
      copyTft();
      if (!S.snap && !S.running) analyze();
    }
  }

  const Scene = {
    // Escena del proyecto (campo "scene" del .jwsim).
    load(sc) {
      S.spec = { devices: structuredClone(sc?.devices ?? []), wiring: structuredClone(sc?.wiring ?? []) };
      // Bornes renombrados (igual que migrateScene de scene/scene.mjs): la fuente
      // de 24 VDC 1.x tenía L+/M; desde la 2.0, +V1 +V2 −V1 −V2.
      const ren = { "L+": "+V1", M: "-V1" };
      const ps = new Set(S.spec.devices.filter((d) => d.type === "jwsim/power-24vdc").map((d) => d.id));
      const fix = (e) => {
        const i = e.indexOf(".");
        return ps.has(e.slice(0, i)) && ren[e.slice(i + 1)] ? `${e.slice(0, i)}.${ren[e.slice(i + 1)]}` : e;
      };
      for (const w of S.spec.wiring) [w.from, w.to] = [fix(w.from), fix(w.to)];
      S.snap = null;
      S.sel = null;
      S.fitted = false;
      S.rendered.clear();
      if (S.spec.devices.length) setView("scene");
      else if (S.view === "scene") setView("scene");
      if (!S.running) analyze();
    },
    // Para correr: solo si hay algo más que la placa sola.
    specForRun() {
      const sc = cleanSpec();
      return sc.devices.some((d) => d.type !== "jwsim/jwplc-basic") || sc.wiring.length ? sc : null;
    },
    specForSave() {
      const sc = cleanSpec();
      return sc.devices.length > 1 || sc.wiring.length ? sc : { devices: [], wiring: [] };
    },
    // Entradas de la placa que maneja la escena (la interfaz no las toca).
    owns(signal) {
      return S.running && !!S.snap && signal in (S.snap.inputs ?? {});
    },
    onStatus(kind) {
      const run = kind === "running" || kind === "paused" || kind === "break";
      if (run === S.running) return;
      S.running = run;
      if (!run) analyze();
      render(true);
    },
    onStart(res) {
      S.error = res?.error ?? null;
      render(true);
    },
  };
  window.JwsimScene = Scene;

  window.jwsimTest = Object.assign(window.jwsimTest ?? {}, {
    scene: {
      view: (v) => setView(v),
      add: (type, x, y, id) => addDevice(type, x, y, id),
      wire: (a, b) => addWire(a, b),
      act: (id, action, value) => act(id, action, value),
      spec: () => cleanSpec(),
      snapshot: () => S.snap,
      analyze: () => analyze(),
      setParam: (id, key, value) => {
        const d = devById(id);
        d.params = { ...(d.params ?? {}), [key]: value };
        render(true);
        if (!S.running) analyze();
      },
      templateOf: (id) => {
        const d = devById(id);
        return window.JwsimSymbols.templateKey(d.type, S.defs.get(d.type), { ...defaultsOf(d.type), ...(d.params ?? {}) });
      },
      move: (id, x, y) => {
        const d = devById(id);
        d.x = x;
        d.y = y;
        render();
      },
      termScreen: (end) => {
        const el = document.querySelector(`.term[data-term="${CSS.escape(end)}"] circle`);
        const r = el?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      },
      // Plantilla .svg en caliente: la registra y redibuja la escena.
      useSymbol: (type, text) => {
        const n = window.JwsimSymbols.warnings.length;
        window.JwsimSymbols.registerTemplate(type, text);
        layouts.clear();
        render(true);
        return window.JwsimSymbols.warnings.slice(n);
      },
      routes: () => (S.routes ?? []).map((r, i) => ({ wire: `${S.spec.wiring[i].from}-${S.spec.wiring[i].to}`, routed: r?.routed, mid: r?.mid })),
      wireColor: (i) => document.querySelector(`.wire[data-wire="${i}"]`)?.dataset.color ?? null,
      wireLive: (i) => !!document.querySelector(`.wire[data-wire="${i}"]`)?.classList.contains("live"),
      // Punto medio del cable en pantalla (para hacer clic sobre él).
      wirePoint: (i) => {
        const path = document.querySelector(`.wire[data-wire="${i}"] .wire-core`);
        if (!path) return null;
        const p = path.getPointAtLength(path.getTotalLength() / 2);
        const m = path.getScreenCTM();
        return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
      },
    },
  });

  async function init() {
    const defs = await api.sceneDevices();
    for (const d of defs) S.defs.set(d.type, d);
    // Símbolos en archivos .svg (assets/devices y dispositivos instalados).
    for (const [type, text] of Object.entries((await api.sceneSymbols?.()) ?? {})) window.JwsimSymbols.registerTemplate(type, text);
    populatePalette();
    wirePointer();
    for (const b of document.querySelectorAll("#board-view .seg")) b.addEventListener("click", () => setView(b.dataset.view));
    $("scene-fit").addEventListener("click", fit);
    $("scene-rearm").addEventListener("click", () => api.sceneRearm());
    api.onSceneSnapshot((snap) => {
      // Relés y contactores externos: clic al atraer y al soltar.
      for (const d of snap.devices) {
        if (typeof d.outputs?.closed !== "boolean") continue;
        const prev = S.snap?.devices.find((x) => x.id === d.id)?.outputs?.closed;
        if (prev !== undefined && prev !== d.outputs.closed) window.JwsimSound?.click(d.type === "jwsim/contactor" ? "contactor" : "relay", d.outputs.closed);
      }
      S.snap = snap;
      render();
    });
    const sound = $("scene-sound");
    const paintSound = () => {
      sound.textContent = window.JwsimSound?.enabled ? "🔊 Sonido" : "🔇 Sonido";
      sound.classList.toggle("off", !window.JwsimSound?.enabled);
    };
    sound.addEventListener("click", () => {
      window.JwsimSound.enabled = !window.JwsimSound.enabled;
      paintSound();
    });
    paintSound();
    api.onDisplay(() => requestAnimationFrame(copyTft));
    new ResizeObserver(() => S.view === "scene" && !S.fitted && fit()).observe($("scene-svg"));
  }

  init();
})();
