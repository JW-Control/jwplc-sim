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
  // múltiplos de GRID. El SVG de la placa declara cada cuántas unidades
  // caen sus tornillos (data-grid): con esa escala, cada 20 px.
  const GRID = 20;
  const BOARD_K = GRID / 57;
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
    board: { w: 460, h: 540, k: BOARD_K },
    boardLeds: {}, // señal -> [x, y] del LED de estado (I0_n, Q0_n)
    boardTitles: {}, // borne -> descripción (se ve al pasar el mouse)
    staticPoles: {}, // polos del último análisis sin simular (color automático de cables)
    boardTerms: {}, // borne -> [x, y] en la placa escalada
    drag: null,
    openGroups: new Set(),   // grupos de parámetros desplegados en el inspector
    wiring: null, // { from, x, y }
    rendered: new Map(), // id -> firma del estado dibujado
    analyzeTimer: null,
    undoStack: [],
    redoStack: [],
    clipboard: null,
    // Paleta «Agregar»: bajo el puntero, último clic, elegido para poner
    // (doble clic, con el modelo escogido) y el que se está arrastrando.
    pal: { hover: null, pinned: null, armed: null, dragType: null, shownRunning: false, choice: {} },
    keepPane: false,
    groupExclude: new Set(), // hilos desmarcados al agrupar en un cable multipolar
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
    // El motor trifásico cambia de bornes con la bornera.
    const key = window.JwsimSymbols.templateKey(t, def, p) ?? (t === "jwsim/motor-3ph" ? `${t}#${p.bornera}` : t);
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
      layouts.set(key, { w: lay.w, h: lay.h, terms, screws, sides, alts: lay.alts ?? {}, lay });
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
    const k = GRID / (Number(svg.getAttribute("data-grid")) || 64);
    S.board = { w: vw * k, h: vh * k, k };
    // Tornillos (clic para cablear) y entrada del cable: el borde de la
    // bornera hacia afuera de la placa (data-entrada: el borde de arriba de
    // la bornera superior, el de abajo de los relés y del RS-485, la boca
    // del USB-C).
    const terms = {};
    const titles = {};
    const entries = {};
    const sides = {};
    for (const g of svg.querySelectorAll(".borne")) {
      const u = g.querySelector("use");
      const sig = g.dataset.senal;
      const id = /^Q0_/.test(sig) ? `${sig}.${g.dataset.pos}` : sig;
      const x = (Number(u.getAttribute("x")) - vx) * k;
      terms[id] = [x, (Number(u.getAttribute("y")) - vy) * k];
      entries[id] = [x, (Number(g.dataset.entrada) - vy) * k];
      // El cable llega desde el lado de la entrada: arriba o abajo del tornillo
      // (abajo: relés, RS-485 y el USB-C).
      sides[id] = entries[id][1] > terms[id][1] ? "b" : "t";
      titles[id] = g.querySelector("title")?.textContent ?? "";
    }
    const leds = {};
    for (const c of svg.querySelectorAll(".led-ancla")) leds[c.dataset.senal] = [(Number(c.getAttribute("cx")) - vx) * k, (Number(c.getAttribute("cy")) - vy) * k];
    S.boardLeds = leds;
    S.boardTitles = titles;
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

  // ------------------------------------------------------------ cables multipolares y referencias
  // Solo cambian el dibujo: cada hilo sigue conectando sus dos bornes (el
  // simulador no los ve). Un cable multipolar (spec.cables, hilos con
  // cable: "W1") junta los hilos entre dos equipos en un tronco grueso que se
  // abre en abanico junto a cada equipo. Una referencia (ref: true, en un
  // hilo o en un cable) no traza el recorrido largo: en cada extremo queda un
  // tramo corto con el destino («→ VF1.MI1»); un clic ahí lleva al otro lado.
  const cablesOf = () => (S.spec.cables ??= []);
  const cableById = (id) => cablesOf().find((c) => c.id === id);
  const devOf = (end) => end.slice(0, end.indexOf("."));
  const pairOf = (w) => [devOf(w.from), devOf(w.to)].sort().join(" — ");
  const cableMembers = (id) => S.spec.wiring.flatMap((w, i) => (w.cable === id ? [i] : []));
  const inCable = (w) => !!w.cable && !!cableById(w.cable);
  // Recorrido propio (A* y puntos de doblez) solo para los cables sueltos.
  const plainWire = (w) => !inCable(w) && !w.ref;

  // Cables con menos de dos hilos o hilos de un cable que ya no existe: se
  // deshacen (p. ej. tras borrar un equipo o sacar hilos). Si el cable se
  // veía como referencia, el hilo que queda sigue como referencia.
  function normalizeCables() {
    const cables = cablesOf();
    for (const c of [...cables]) {
      if (cableMembers(c.id).length >= 2) continue;
      if (c.ref) for (const w of S.spec.wiring) if (w.cable === c.id) w.ref = true;
      cables.splice(cables.indexOf(c), 1);
    }
    for (const w of S.spec.wiring) if (w.cable && !cableById(w.cable)) delete w.cable;
  }

  function nextCableId() {
    for (let n = 1; ; n++) if (!cableById(`W${n}`)) return `W${n}`;
  }

  // Hilos que pueden ir en el mismo cable que el hilo i: entre los mismos dos
  // equipos (no un puente dentro de un equipo) y sin cable todavía.
  function groupCandidates(i) {
    const w = S.spec.wiring[i];
    if (!w || inCable(w) || devOf(w.from) === devOf(w.to)) return [];
    const key = pairOf(w);
    return S.spec.wiring.flatMap((x, j) => (!inCable(x) && devOf(x.from) !== devOf(x.to) && pairOf(x) === key ? [j] : []));
  }

  function groupWires(indices) {
    const list = [...new Set(indices)].filter((j) => S.spec.wiring[j] && !inCable(S.spec.wiring[j]));
    if (S.running || list.length < 2 || new Set(list.map((j) => pairOf(S.spec.wiring[j]))).size !== 1) return null;
    pushHistory();
    const id = nextCableId();
    // Si todos eran referencias, el cable también: el dibujo no cambia de golpe.
    const allRef = list.every((j) => S.spec.wiring[j].ref);
    cablesOf().push({ id, ...(allRef ? { ref: true } : {}) });
    // Cada hilo conserva su referencia y sus puntos de doblez: dentro del
    // cable no se usan y vuelven al desagrupar o al sacarlo del cable.
    for (const j of list) S.spec.wiring[j].cable = id;
    S.sel = { kind: "cable", id };
    changed();
    return id;
  }

  function ungroupCable(id) {
    if (S.running || !cableById(id)) return;
    pushHistory();
    // Un cable que se veía como referencia deja sus hilos como referencias.
    const ref = !!cableById(id).ref;
    for (const w of S.spec.wiring) {
      if (w.cable !== id) continue;
      delete w.cable;
      if (ref) w.ref = true;
    }
    S.spec.cables = cablesOf().filter((c) => c.id !== id);
    S.sel = null;
    changed();
  }

  function leaveCable(i) {
    const w = S.spec.wiring[i];
    if (S.running || !w?.cable) return;
    pushHistory();
    if (cableById(w.cable)?.ref) w.ref = true;
    delete w.cable;
    normalizeCables();
    changed();
  }

  function setRef(target, on) {
    if (S.running || !target) return;
    pushHistory();
    // Los puntos de doblez se conservan: al quitar la referencia vuelven.
    if (on) target.ref = true;
    else delete target.ref;
    changed();
  }

  // Salida de un cable junto a un equipo: centrada bajo (o sobre) sus
  // bornes, a dos pasos de grilla de la entrada más alejada.
  function breakout(ps) {
    const up = ps.filter((p) => p.up).length * 2 >= ps.length;
    const x = snap(ps.reduce((s, p) => s + p.x, 0) / ps.length);
    const y = up ? Math.floor((Math.min(...ps.map((p) => p.y)) - 30) / GRID) * GRID : Math.ceil((Math.max(...ps.map((p) => p.y)) + 30) / GRID) * GRID;
    return { x, y, up };
  }

  // Geometría de un cable: extremos de cada hilo (lado A y lado B), sus
  // salidas y el tronco (A* sobre la grilla, como un cable más).
  function cableGeometry(c, ctx) {
    const idx = cableMembers(c.id);
    if (idx.length < 2) return null;
    const ws = idx.map((i) => S.spec.wiring[i]);
    const devA = devOf(ws[0].from);
    const ends = ws.map((w) => (devOf(w.from) === devA ? [w.from, w.to] : [w.to, w.from]));
    const A = ends.map(([a]) => termPos(a));
    const B = ends.map(([, b]) => termPos(b));
    if (A.some((p) => !p) || B.some((p) => !p)) return null;
    const ba = breakout(A);
    const bb = breakout(B);
    let mid = null;
    if (c.ref) mid = null;
    else if (ctx) {
      const g = (p) => ({ x: Math.round(p.x / GRID), y: Math.round(p.y / GRID) });
      mid = astar(g(ba), g(bb), ba.up ? 3 : 2, bb.up ? 2 : 3, ctx.boxes, ctx.occ, new Set(ends.flat()), ctx.bounds, ctx.limit);
    }
    if (!mid && !c.ref) {
      const ym = ba.up && bb.up ? Math.min(ba.y, bb.y) : !ba.up && !bb.up ? Math.max(ba.y, bb.y) : snap((ba.y + bb.y) / 2);
      mid = [ba, { x: ba.x, y: ym }, { x: bb.x, y: ym }, bb];
    }
    let trunk = null;
    if (mid) {
      trunk = [];
      for (const p of mid) {
        if (trunk.length && trunk.at(-1).x === p.x && trunk.at(-1).y === p.y) continue;
        if (trunk.length >= 2) {
          const [q, r] = trunk.slice(-2);
          if ((q.x === r.x && r.x === p.x) || (q.y === r.y && r.y === p.y)) trunk.pop();
        }
        trunk.push(p);
      }
      if (ctx) occupy(ctx, { from: `cable:${c.id}`, to: `cable:${c.id}` }, trunk);
    }
    return { id: c.id, idx, ends, A, B, ba, bb, trunk, devA, devB: devOf(ends[0][1]) };
  }

  // Abanico de un hilo: sale de su borne un tramo corto y va en diagonal
  // hasta la salida del cable, en su carril dentro de la funda. Un borne del
  // otro borde del equipo (p. ej. entradas arriba y salidas abajo en el mismo
  // cable) rodea el equipo por el costado más cercano a la salida.
  function fanPath(p, out, lane, dOff) {
    const x = p.x + dOff;
    const sy = p.up ? p.y - 10 : p.y + 10;
    if (p.up === out.up) return [{ x, y: p.y }, { x, y: sy }, { x: out.x + lane, y: out.y }];
    const side = out.x - p.box.x1 < p.box.x2 - out.x ? p.box.x1 - GRID : p.box.x2 + GRID;
    return [{ x, y: p.y }, { x, y: sy }, { x: side, y: sy }, { x: side, y: out.y }, { x: out.x + lane, y: out.y }];
  }

  // Centra la vista en un punto de la escena (referencias: «ir al otro lado»).
  function focusOn(x, y) {
    const r = $("scene-svg").getBoundingClientRect();
    S.pan = { x: r.width / 2 - x * S.zoom, y: r.height / 2 - y * S.zoom };
    render();
  }

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
    if (!plainWire(w)) return null; // en un cable multipolar o como referencia
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
  // Cable cortado por una falla inyectada (G9).
  const wireKey = (w) => `open:${[w.from, w.to].sort().join(" ")}`;
  function wireCut(w) {
    return S.running && (S.snap?.injected ?? []).some((f) => f.key === wireKey(w));
  }

  const FAULT_LABEL = { stuck: "pegado", welded: "contactos soldados", burnt: "carga quemada" };
  const faultLabel = (k) => FAULT_LABEL[k] ?? k;

  // Fallas que admite un dispositivo (según sus acciones y salidas).
  function faultOptions(dev, def, st) {
    const o = st.outputs ?? {};
    const opts = [];
    if ((def.actions ?? []).some((a) => a.kind !== "select") || dev.params?.source) {
      opts.push({ kind: "stuck", value: true, label: "Pegado accionado" }, { kind: "stuck", value: false, label: "Pegado en reposo" });
    }
    if ("closed" in o) opts.push({ kind: "welded", label: "Contactos soldados" });
    const short = dev.type.split("/")[1];
    const burnt = { lamp: "Lámpara quemada", buzzer: "Zumbador quemado", relay: "Bobina cortada", contactor: "Bobina cortada", "solenoid-valve": "Bobina cortada", "solenoid-valve-2": "Bobinas cortadas", motor: "Bobinado abierto", "motor-1ph": "Bobinado abierto", "motor-3ph": "Bobinado abierto", "motor-2v": "Bobinado abierto", "vfd-el": "Variador dañado" }[short] ??
      (short?.startsWith("sensor-") ? "Sensor dañado" : null);
    if (burnt) opts.push({ kind: "burnt", label: burnt });
    return opts;
  }

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
    const layout = JSON.stringify([
      S.spec.devices.map((d) => [d.id, d.type, d.x, d.y]),
      S.spec.wiring.map((w) => [w.from, w.to, w.points, w.cable, w.ref]),
      cablesOf().map((c) => [c.id, c.ref]),
    ]);
    if (S.routeKey !== layout) {
      const ctx = routeContext();
      const moving = S.drag?.moved && S.routes?.length === S.spec.wiring.length;
      const affected = (w, i) =>
        S.drag.kind === "device" ? w.from.startsWith(`${S.drag.dev.id}.`) || w.to.startsWith(`${S.drag.dev.id}.`) : S.drag.kind === "vertex" && i === S.drag.i;
      if (moving) {
        S.spec.wiring.forEach((w, i) => !affected(w, i) && S.routes[i] && occupy(ctx, w, S.routes[i].mid));
        ctx.limit = 40000;
        S.cableGeo = cablesOf().map((c) => cableGeometry(c, ctx)).filter(Boolean);
        S.routes = S.spec.wiring.map((w, i) => (affected(w, i) ? route(w, ctx) : S.routes[i]));
      } else {
        S.cableGeo = cablesOf().map((c) => cableGeometry(c, ctx)).filter(Boolean);
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
      const cut = wireCut(w);
      const live = wireLive(w) && !cut;
      const mid = pts[Math.floor(pts.length / 2)];
      const prev = pts[Math.floor(pts.length / 2) - 1] ?? mid;
      html +=
        `<g class="wire${sel ? " selected" : ""}${live ? " live" : ""}${cut ? " cut" : ""}" data-wire="${i}" data-color="${esc(wireColorName(w))}">` +
        (cut ? `<text class="wire-cut" x="${(mid.x + prev.x) / 2}" y="${(mid.y + prev.y) / 2 + 5}">✂</text>` : "") +
        `<path class="wire-hit" d="${d}"/>` +
        (live ? `<path class="wire-glow" d="${d}"/>` : "") +
        `<path class="wire-outline" d="${d}" stroke="${shade(c, 0.45)}"/>` +
        `<path class="wire-core" d="${d}" stroke="${c}"/>` +
        `<path class="wire-shine" d="${d}"/>` +
        `<title>${esc(w.from)} — ${esc(w.to)}</title></g>`;
    });
    // Hilo (de un cable suelto o de un abanico): sus cuatro trazos.
    const wireBody = (d, c, live) =>
      `<path class="wire-hit" d="${d}"/>` +
      (live ? `<path class="wire-glow" d="${d}"/>` : "") +
      `<path class="wire-outline" d="${d}" stroke="${shade(c, 0.45)}"/>` +
      `<path class="wire-core" d="${d}" stroke="${c}"/>` +
      `<path class="wire-shine" d="${d}"/>`;
    // Rótulo de una referencia: sigue la dirección del tramo (vertical) y
    // lleva al otro extremo con un clic.
    const refLabel = (x, y, up, text, jump, sel) =>
      `<text class="ref-label" data-jump="${jump.x},${jump.y}" data-jump-sel="${esc(sel)}" transform="translate(${x} ${up ? y - 5 : y + 5}) rotate(-90)" text-anchor="${up ? "start" : "end"}" dominant-baseline="middle">${esc(text)}</text>`;
    const REF_LEN = 34;
    // Referencias: un tramo corto con flecha en cada extremo y el destino.
    S.spec.wiring.forEach((w, i) => {
      if (inCable(w) || !w.ref) return;
      const sel = S.sel?.kind === "wire" && S.sel.id === i;
      const c = WIRE_COLORS[wireColorName(w)] ?? WIRE_COLORS.negro;
      const cut = wireCut(w);
      const live = wireLive(w) && !cut;
      html += `<g class="wire ref${sel ? " selected" : ""}${live ? " live" : ""}${cut ? " cut" : ""}" data-wire="${i}" data-color="${esc(wireColorName(w))}">`;
      for (const [end, other] of [[w.from, w.to], [w.to, w.from]]) {
        const p = termPos(end);
        const q = termPos(other);
        if (!p || !q) continue;
        const x = p.x + offset(end, i);
        const y2 = p.up ? p.y - REF_LEN : p.y + REF_LEN;
        const k = p.up ? 5 : -5;
        html += wireBody(`M${x} ${p.y} L${x} ${y2}`, c, live);
        html += `<path class="ref-arrow" d="M${x - 4} ${y2 + k} L${x} ${y2} L${x + 4} ${y2 + k}" stroke="${c}"/>`;
        html += refLabel(x, y2, p.up, `→ ${other}`, { x: q.x, y: q.y }, `wire:${i}`);
      }
      html += `<title>${esc(w.from)} — ${esc(w.to)} (referencia)</title></g>`;
    });
    // Cables multipolares: los abanicos (cada hilo con su color, se puede
    // elegir solo) y encima el tronco con su funda, sus prensaestopas y el
    // nombre; o, si el cable es una referencia, un tramo corto en cada salida.
    for (const geo of S.cableGeo ?? []) {
      const cable = cableById(geo.id);
      if (!cable) continue;
      const n = geo.idx.length;
      const selC = S.sel?.kind === "cable" && S.sel.id === geo.id;
      const lane = (k) => (k - (n - 1) / 2) * 3;
      const width = Math.min(18, 8 + 1.5 * n);
      let liveAny = false;
      geo.idx.forEach((i, k) => {
        const w = S.spec.wiring[i];
        const [ea, eb] = geo.ends[k];
        const c = WIRE_COLORS[wireColorName(w)] ?? WIRE_COLORS.negro;
        const cut = wireCut(w);
        const live = wireLive(w) && !cut;
        liveAny ||= live;
        const sel = selC || (S.sel?.kind === "wire" && S.sel.id === i);
        const d = roundedPath(fanPath(geo.A[k], geo.ba, lane(k), offset(ea, i)), 6) + " " + roundedPath(fanPath(geo.B[k], geo.bb, lane(k), offset(eb, i)), 6);
        html +=
          `<g class="wire fan${sel ? " selected" : ""}${live ? " live" : ""}${cut ? " cut" : ""}" data-wire="${i}" data-color="${esc(wireColorName(w))}">` +
          wireBody(d, c, live) +
          `<title>${esc(w.from)} — ${esc(w.to)} (cable ${esc(geo.id)})</title></g>`;
      });
      const name = `${geo.id}${cable.label ? ` · ${cable.label}` : ""} · ${n} hilos`;
      const gland = (b) => `<rect class="cable-gland" x="${b.x - width / 2 - 3}" y="${b.y - 5}" width="${width + 6}" height="10" rx="2"/>`;
      html += `<g class="cable${selC ? " selected" : ""}${liveAny ? " live" : ""}${cable.ref ? " ref" : ""}" data-cable="${esc(geo.id)}" style="--cable-w:${width}px">`;
      if (geo.trunk) {
        const d = roundedPath(geo.trunk, 14);
        // El nombre va en el tramo más largo del tronco.
        let best = [geo.trunk[0], geo.trunk[1] ?? geo.trunk[0]];
        for (let j = 1; j < geo.trunk.length; j++) {
          const [a, b] = [geo.trunk[j - 1], geo.trunk[j]];
          if (Math.hypot(b.x - a.x, b.y - a.y) > Math.hypot(best[1].x - best[0].x, best[1].y - best[0].y)) best = [a, b];
        }
        const mx = (best[0].x + best[1].x) / 2;
        const my = (best[0].y + best[1].y) / 2;
        const lw = name.length * 6.1 + 12;
        html +=
          `<path class="cable-hit" d="${d}"/>` +
          (liveAny ? `<path class="cable-glow" d="${d}"/>` : "") +
          `<path class="cable-outline" d="${d}"/>` +
          `<path class="cable-sheath" d="${d}"/>` +
          `<path class="cable-shine" d="${d}"/>` +
          gland(geo.ba) +
          gland(geo.bb) +
          `<g class="cable-label" transform="translate(${mx} ${my})"><rect x="${-lw / 2}" y="-9" width="${lw}" height="18" rx="9"/><text text-anchor="middle" dominant-baseline="central">${esc(name)}</text></g>`;
      } else {
        for (const [b, q, other] of [[geo.ba, geo.bb, geo.devB], [geo.bb, geo.ba, geo.devA]]) {
          const y2 = b.up ? b.y - REF_LEN : b.y + REF_LEN;
          const d = `M${b.x} ${b.y} L${b.x} ${y2}`;
          const k = b.up ? 6 : -6;
          html +=
            `<path class="cable-hit" d="${d}"/>` +
            (liveAny ? `<path class="cable-glow" d="${d}"/>` : "") +
            `<path class="cable-outline" d="${d}"/>` +
            `<path class="cable-sheath" d="${d}"/>` +
            gland(b) +
            `<path class="ref-arrow cable-arrow" d="M${b.x - 7} ${y2 + k} L${b.x} ${y2} L${b.x + 7} ${y2 + k}"/>` +
            refLabel(b.x, y2, b.up, `${geo.id} → ${other}`, q, `cable:${geo.id}`);
        }
      }
      html += `<title>Cable ${esc(geo.id)}: ${n} hilos (${esc(geo.devA)} — ${esc(geo.devB)})${cable.ref ? ", como referencia" : ""}</title></g>`;
    }
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
    // Bornes con cable (la plantilla puede mostrar su cable interno: wired.<borne>).
    const pre = `${dev.id}.`;
    const wired = [...new Set(S.spec.wiring.flatMap((w) => [w.from, w.to]).filter((e) => e.startsWith(pre)).map((e) => e.slice(pre.length)))].sort();
    const st = { ...out(dev.id), id: dev.id, wired };
    // Un símbolo con giro (data-spin) se redibuja en cada instante simulado.
    const pp = { ...defaultsOf(dev.type), ...(dev.params ?? {}) };
    if (!sym.board && window.JwsimSymbols.animated(dev.type, S.defs.get(dev.type), pp)) st.t_ms = S.snap?.t_ms ?? 0;
    const sig = JSON.stringify([st.outputs, st.contacts, st.damaged, st.tripped, st.injected, dev.params, S.running, st.t_ms, wired]);
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
        const [x, y] = S.boardLeds[`I0_${k}`] ?? [];
        if (x !== undefined) html += `<circle cx="${x}" cy="${y}" r="4" class="${st.outputs?.[`I0_${k}`] ? "led on" : "led"}"/>`;
        const [qx, qy] = S.boardLeds[`Q0_${k}`] ?? [];
        if (qx !== undefined) html += `<circle cx="${qx}" cy="${qy}" r="4" class="${st.contacts?.[`Q0_${k}`] ? "led on" : "led"}"/>`;
      }
      const plcWired = S.spec.wiring.some((w) => w.from.startsWith(`${dev.id}.`) || w.to.startsWith(`${dev.id}.`));
      if (plcWired && st.outputs && st.outputs.powered === false && S.snap) html += `<text class="dev-note bad" x="${sym.w / 2}" y="-8">sin 24 VDC en 24VDC/M0</text>`;
      leds.innerHTML = html;
    } else {
      const p = { ...defaultsOf(dev.type), ...(dev.params ?? {}) };
      g.innerHTML =
        window.JwsimSymbols.draw(dev.type, sym.lay, st, p, S.defs.get(dev.type)) +
        `<rect class="sel-frame" x="-6" y="-6" width="${sym.w + 12}" height="${sym.h + 12}" rx="6"/>` +
        `<text class="dev-id" x="${sym.w / 2}" y="${sym.h + 16}">${esc(dev.id)}${p.label ? ` · ${esc(p.label)}` : ""}</text>` +
        // Falla inyectada (G9): marca roja arriba a la derecha.
        (st.injected?.length
          ? `<g class="dev-fault" transform="translate(${sym.w - 4} 4)"><circle r="11"/><text y="4.5">!</text><title>Falla inyectada: ${esc(st.injected.map(faultLabel).join(", "))}</title></g>`
          : "");
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
      const what = sym.board ? S.boardTitles[id] : "";
      th += `<title>${esc(`${dev.id}.${id}${what ? ` · ${what}` : ""}`)}</title></g>`;
    }
    // Otros puntos de clic del mismo borne (.jw-term-alt de la plantilla).
    for (const [id, pts] of Object.entries(sym.alts ?? {})) {
      for (const [x, y] of pts) th += `<g class="term alt" data-term="${esc(`${dev.id}.${id}`)}"><circle cx="${x}" cy="${y}" r="7"/><title>${esc(`${dev.id}.${id}`)}</title></g>`;
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
    // La ficha de la paleta avisa si la simulación impide agregar equipos.
    if (S.pal.shownRunning !== S.running) {
      renderPartInfo();
      if (S.running) showGhost(null);
    }
  }

  // ------------------------------------------------------------ panel lateral
  function renderSide() {
    const side = $("scene-inspector");
    const sel = S.sel;
    const selKey = sel ? `${sel.kind}:${sel.id}` : "";
    if (selKey && selKey !== S.lastSelKey && !S.keepPane) window.JwsimScenePane?.showProps();
    if (selKey !== S.lastSelKey) S.groupExclude = new Set();
    S.lastSelKey = selKey;
    S.keepPane = false;
    let html = "";
    let stateHtml = "";
    if (sel?.kind === "device") {
      const dev = devById(sel.id);
      const def = dev && S.defs.get(dev.type);
      if (dev && def) {
        const st = out(dev.id);
        html += `<div class="insp-title">${esc(dev.id)} <span class="muted">${esc(def.name)} · ${esc(def.type)}@${esc(def.version)}</span></div>`;
        html += `<p class="insp-desc">${esc(def.description)}</p>`;
        // Plantillas de taller: dejan el equipo listo para un uso típico.
        if (def.presets?.length) {
          html += `<div class="insp-sub">Plantillas de taller</div><div class="preset-pick">`;
          for (const pr of def.presets) {
            const on = presetMatches(dev, def, pr);
            html += `<button class="preset-opt${on ? " on" : ""}" data-preset="${esc(pr.id)}" ${S.running ? "disabled" : ""}><b>${esc(pr.label)}</b><span>${esc(pr.description ?? "")}</span></button>`;
          }
          html += `</div>`;
        }
        let group = null;
        for (const p of def.parameters) {
          const v = dev.params?.[p.id] ?? p.default;
          const dis = S.running ? "disabled" : "";
          // Grupos plegables (parámetros del variador por grupo 00, 01, 02…).
          if ((p.group ?? null) !== group) {
            if (group !== null) html += `</details>`;
            group = p.group ?? null;
            if (group !== null) html += `<details class="insp-group" data-group="${esc(group)}" ${S.openGroups.has(group) ? "open" : ""}><summary>${esc(group)}</summary>`;
          }
          let input;
          if (dev.type === "jwsim/motor-3ph" && p.id === "bornera") {
            // Placa de bornes con sus chapas: se elige con un clic.
            const names = { triangulo: "Δ triángulo", estrella: "Y estrella", "6 cables": "6 cables" };
            html += `<div class="insp-sub">${esc(p.label)}</div><div class="bornera-pick">`;
            for (const o of p.options) {
              html += `<button class="bornera-opt${o === v ? " on" : ""}" data-setparam="${esc(p.id)}" data-value="${esc(o)}" ${dis} title="${esc(names[o] ?? o)}">` +
                `<svg viewBox="0 0 120 90" width="62" height="47">${window.JwsimSymbols.motorBornera(o, { x: 4, y: 4, w: 112, h: 82 })}</svg><span>${esc(names[o] ?? o)}</span></button>`;
            }
            html += `</div>`;
            continue;
          }
          if (p.type === "enum") input = `<select data-param="${esc(p.id)}" ${dis}>${p.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
          else if (p.type === "boolean") input = `<input type="checkbox" data-param="${esc(p.id)}" ${v ? "checked" : ""} ${dis}/>`;
          else input = `<input type="${p.type === "number" ? "number" : "text"}" data-param="${esc(p.id)}" value="${esc(v)}" ${dis} placeholder="${esc(p.hint ?? "")}"/>`;
          const wide = p.type === "enum" && p.options.some((o) => String(o).length > 16);
          html += `<label class="insp-row${wide ? " wide" : ""}"><span>${esc(p.label ?? p.id)}${p.unit ? ` (${esc(p.unit)})` : ""}</span>${input}</label>`;
        }
        if (group !== null) html += `</details>`;
        const vals = Object.entries(st.outputs ?? {});
        if (vals.length) {
          // El estado cambia con cada instantánea: va en su propio contenedor
          // para no reemplazar el resto del inspector (botones, campos).
          stateHtml = `<div class="insp-sub">Estado${S.snap ? ` · t = ${S.snap.t_ms.toFixed(1)} ms` : ""}</div><table class="insp-vals">`;
          for (const [k, v] of vals) stateHtml += `<tr><td>${esc(k)}</td><td>${esc(typeof v === "number" ? Math.round(v * 1000) / 1000 : v)}</td></tr>`;
          stateHtml += "</table>";
          html += `<div class="insp-state"></div>`;
        }
        // Fallas (G9): con la simulación en marcha, se inyectan y se quitan.
        const opts = dev.type === "jwsim/jwplc-basic" ? [] : faultOptions(dev, def, st);
        if (opts.length) {
          const act = (S.snap?.injected ?? []).filter((f) => f.device === dev.id);
          html += `<div class="insp-sub">Fallas</div><div class="fault-btns">`;
          for (const f of opts) {
            const on = act.some((a) => a.kind === f.kind && (f.kind !== "stuck" || (a.value !== false) === f.value));
            const data = esc(JSON.stringify({ kind: f.kind, device: dev.id, ...(f.kind === "stuck" ? { value: f.value } : {}) }));
            html += `<button class="small fault${on ? " on" : ""}" data-fault="${data}" data-on="${on ? 1 : 0}" ${S.running ? "" : "disabled"}>${esc(f.label)}</button>`;
          }
          html += `</div>${S.running ? "" : `<p class="insp-desc muted">Las fallas se inyectan con la simulación en marcha.</p>`}`;
        }
        if (dev.type !== "jwsim/jwplc-basic") html += `<p class="insp-desc muted">Supr o Ctrl+X lo quita; Ctrl+C / Ctrl+V lo copia; Ctrl+Z deshace.</p>`;
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
        html += `</div><p class="insp-desc">Actual: ${esc(cur)}.${plainWire(w) ? " Clic sobre el cable: agrega un punto de doblez; arrástrelo para dar forma; ✕ lo quita." : ""}</p>`;
        if (plainWire(w) && w.points?.length) html += `<button class="small" id="scene-wire-auto">Recorrido automático</button> `;
        html += `<p class="insp-desc muted">Supr o Ctrl+X quita el cable; Ctrl+Z deshace.</p>`;
        // Cable multipolar y referencia: solo cambian el dibujo.
        const dis = S.running ? "disabled" : "";
        const swatch = (x) => `<span class="sw" style="background:${WIRE_COLORS[wireColorName(x)] ?? WIRE_COLORS.negro}"></span>`;
        if (inCable(w)) {
          html +=
            `<div class="insp-sub">Cable multipolar</div><p class="insp-desc">Va dentro del cable <b>${esc(w.cable)}</b> (${cableMembers(w.cable).length} hilos).</p>` +
            `<button class="small" data-cable-act="show" data-cable="${esc(w.cable)}">Ver el cable ${esc(w.cable)}</button> <button class="small" data-cable-act="leave" ${dis}>Sacar del cable</button>`;
        } else {
          const cand = groupCandidates(sel.id);
          html += `<div class="insp-sub">Cable multipolar</div>`;
          if (cand.length >= 2) {
            html += `<p class="insp-desc">Junte en un solo cable grueso los hilos entre ${esc(pairOf(w))}:</p><div class="cable-pick">`;
            for (const j of cand) {
              const x = S.spec.wiring[j];
              const on = j === sel.id || !S.groupExclude?.has(j);
              html += `<label class="insp-check"><input type="checkbox" data-group-wire="${j}" ${on ? "checked" : ""} ${j === sel.id || S.running ? "disabled" : ""}/>${swatch(x)}${esc(x.from)} — ${esc(x.to)}</label>`;
            }
            html += `</div><button class="small" id="scene-cable-group" ${dis}>Agrupar en cable (Ctrl+G)</button>`;
          } else {
            html += `<p class="insp-desc muted">Con dos o más cables entre los mismos dos equipos, aquí se juntan en un cable multipolar.</p>`;
          }
          html +=
            `<div class="insp-sub">Referencia</div><label class="insp-check"><input type="checkbox" id="scene-wire-ref" ${w.ref ? "checked" : ""} ${dis}/>` +
            `Mostrar como referencia: sin el recorrido largo, con «→ destino» en cada borne (clic: va al otro lado)</label>`;
        }
        if (S.running) {
          const cut = wireCut(w);
          html += `<div class="insp-sub">Fallas</div><div class="fault-btns"><button class="small fault${cut ? " on" : ""}" data-fault="${esc(JSON.stringify({ kind: "open", wire: `${w.from} ${w.to}` }))}" data-on="${cut ? 1 : 0}">${cut ? "Reparar cable" : "Cortar cable"}</button></div>`;
        }
      }
    } else if (sel?.kind === "cable") {
      const c = cableById(sel.id);
      const idx = c ? cableMembers(c.id) : [];
      if (c && idx.length) {
        const dis = S.running ? "disabled" : "";
        html += `<div class="insp-title">Cable ${esc(c.id)} <span class="muted">${idx.length} hilos · ${esc(pairOf(S.spec.wiring[idx[0]]))}</span></div>`;
        html += `<p class="insp-desc">Cable multipolar: los hilos van juntos en una funda y se abren junto a cada equipo. Solo cambia el dibujo; cada hilo sigue uniendo sus dos bornes.</p>`;
        html += `<label class="insp-row wide"><span>Nombre</span><input type="text" data-cable-field="label" value="${esc(c.label ?? "")}" placeholder="p. ej. 4×1 mm² mando" ${dis}/></label>`;
        html +=
          `<label class="insp-check"><input type="checkbox" id="scene-cable-ref" ${c.ref ? "checked" : ""} ${dis}/>` +
          `Mostrar como referencia: sin el tronco, con «${esc(c.id)} → destino» en cada salida</label>`;
        html += `<div class="insp-sub">Hilos</div><table class="insp-vals cable-wires">`;
        for (const i of idx) {
          const x = S.spec.wiring[i];
          html += `<tr data-select-wire="${i}" title="Elegir este hilo"><td><span class="sw" style="background:${WIRE_COLORS[wireColorName(x)] ?? WIRE_COLORS.negro}"></span>${esc(x.from)}</td><td>${esc(x.to)}</td></tr>`;
        }
        html += `</table><button class="small" data-cable-act="ungroup" ${dis}>Desagrupar (Ctrl+Mayús+G)</button>`;
        html += `<p class="insp-desc muted">Supr o Ctrl+X quita el cable con todos sus hilos; Ctrl+Z deshace.</p>`;
      }
    } else {
      // Nada seleccionado: información general de la escena.
      const nDev = S.spec.devices.filter((d) => d.type !== "jwsim/jwplc-basic").length;
      const nWire = S.spec.wiring.length;
      html += `<div class="insp-title">Escena</div><table class="insp-vals"><tr><td>Dispositivos</td><td>${nDev}</td></tr><tr><td>Cables</td><td>${nWire}</td></tr>` +
        `<tr><td>Simulación</td><td>${S.running ? "en marcha" : "detenida"}</td></tr></table>`;
      html += `<p class="insp-desc muted">Clic en un equipo o un cable para ver y cambiar sus propiedades. Arrastre los dispositivos. Para cablear, haga clic en un borne y luego en otro. Supr o Ctrl+X quita lo seleccionado; Ctrl+C y Ctrl+V copian y pegan; Ctrl+Z y Ctrl+Y deshacen y rehacen. Con la simulación en marcha, haga clic en los pulsadores, selectores y sensores.</p>`;
    }
    if (side.dataset.key !== html) {
      side.innerHTML = html;
      side.dataset.key = html;
    }
    const stateEl = side.querySelector(".insp-state");
    if (stateEl && stateEl.innerHTML !== stateHtml) stateEl.innerHTML = stateHtml;
    // Diagnóstico: fallas, avisos del cableado y de la solución actual.
    const diag = $("scene-diag");
    const items = [];
    for (const f of S.snap?.faults ?? []) items.push(["bad", `${f.t_ms.toFixed(1)} ms · ${f.message}`, f.device]);
    if (S.running) {
      for (const f of S.snap?.injected ?? []) {
        const what = f.kind === "open" ? `cable ${f.wire} cortado` : `${f.device}: ${faultLabel(f.kind)}${f.kind === "stuck" ? (f.value === false ? " en reposo" : " accionado") : ""}`;
        items.push(["inj", `Falla inyectada · ${what}`, f.device]);
      }
    }
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
    const prefix = { "pushbutton-no": "S", "pushbutton-nc": "S", "selector-2": "SA", "selector-3": "SA", "limit-switch": "B", "sensor-inductive": "B", "sensor-photoelectric": "B", lamp: "H", buzzer: "HA", relay: "K", contactor: "KM", "solenoid-valve": "Y", "solenoid-valve-2": "Y", motor: "M", "motor-1ph": "M", "motor-3ph": "M", "motor-2v": "M", "overload-relay": "F", "vfd-el": "VF", potentiometer: "RP", "signal-source": "CAL", "power-24vdc": "PS", "power-230vac": "L", "power-3ph": "Q", "emergency-stop": "S", "pushbutton-lit": "S", "selector-key": "SA", "sensor-capacitive": "B", "stack-light": "H", "timer-relay": "KT", ssr: "K", breaker: "Q", "motor-protector": "QM", "float-switch": "BL", "level-electrodes": "BL", "level-relay": "KL", "pressure-switch": "BP", thermostat: "BT", voltmeter: "PV", ammeter: "PA", "remote-io": "KF", "energy-meter": "PM", "temp-controller": "TC", tank: "T", "usb-rs485": "TF", "usb-pc": "XD" }[type.split("/")[1]] ?? "D";
    for (let n = 1; ; n++) if (!devById(`${prefix}${n}`)) return `${prefix}${n}`;
  }

  function currentSnapshot() {
    return {
      spec: structuredClone(cleanSpec()),
      sel: S.sel ? { ...S.sel } : null,
    };
  }

  function updateUndoRedoButtons() {
    const u = $("scene-undo");
    const r = $("scene-redo");
    if (u) u.disabled = S.running || !S.undoStack.length;
    if (r) r.disabled = S.running || !S.redoStack.length;
  }

  function pushHistory() {
    if (S.running) return;
    const snapState = currentSnapshot();
    const last = S.undoStack[S.undoStack.length - 1];
    if (last && JSON.stringify(last.spec) === JSON.stringify(snapState.spec)) return;
    S.undoStack.push(snapState);
    if (S.undoStack.length > 50) S.undoStack.shift();
    S.redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function undo() {
    if (S.running || !S.undoStack.length) return;
    if (S.drag) S.drag = null;
    if (S.wiring) {
      S.wiring = null;
      $("scene-rubber").setAttribute("d", "");
    }
    const curr = currentSnapshot();
    S.redoStack.push(curr);
    const prev = S.undoStack.pop();
    S.spec = structuredClone(prev.spec);
    S.sel = prev.sel ? { ...prev.sel } : null;
    changed();
    updateUndoRedoButtons();
  }

  function redo() {
    if (S.running || !S.redoStack.length) return;
    if (S.drag) S.drag = null;
    if (S.wiring) {
      S.wiring = null;
      $("scene-rubber").setAttribute("d", "");
    }
    const curr = currentSnapshot();
    S.undoStack.push(curr);
    const next = S.redoStack.pop();
    S.spec = structuredClone(next.spec);
    S.sel = next.sel ? { ...next.sel } : null;
    changed();
    updateUndoRedoButtons();
  }

  function copy() {
    if (S.running || !S.sel) return;
    if (S.sel.kind === "device") {
      const dev = devById(S.sel.id);
      if (dev && dev.type !== "jwsim/jwplc-basic") {
        S.clipboard = {
          kind: "device",
          type: dev.type,
          version: dev.version,
          params: structuredClone(dev.params ?? {}),
          x: dev.x ?? 0,
          y: dev.y ?? 0,
        };
      }
    }
  }

  function paste() {
    if (S.running || !S.clipboard) return;
    if (S.clipboard.kind === "device") {
      const type = S.clipboard.type;
      const x = snap((S.clipboard.x ?? 0) + 40);
      const y = snap((S.clipboard.y ?? 0) + 40);
      const id = addDevice(type, x, y);
      if (!id) return;
      const dev = devById(id);
      if (dev) {
        if (S.clipboard.version) dev.version = S.clipboard.version;
        dev.params = structuredClone(S.clipboard.params ?? {});
      }
      S.clipboard.x = x;
      S.clipboard.y = y;
      changed();
    }
  }

  // Cortar: un equipo queda en el portapapeles (Ctrl+V lo vuelve a poner);
  // un cable solo se quita. La placa no se corta.
  function cut() {
    if (S.running || !S.sel) return;
    if (S.sel.kind === "device") {
      if (devById(S.sel.id)?.type === "jwsim/jwplc-basic") return;
      copy();
    }
    removeSelected();
  }

  function duplicate() {
    if (S.running || S.sel?.kind !== "device") return;
    const dev = devById(S.sel.id);
    if (!dev || dev.type === "jwsim/jwplc-basic") return;
    copy();
    paste();
  }

  function addDevice(type, x, y, id = nextId(type), params = {}) {
    if (type === "jwsim/jwplc-basic" && S.spec.devices.some((d) => d.type === type)) return null;
    pushHistory();
    const def = S.defs.get(type);
    S.spec.devices.push({ id, type, version: def?.version, params: structuredClone(params), x: snap(x), y: snap(y) });
    S.sel = { kind: "device", id };
    changed();
    return id;
  }

  function addWire(from, to) {
    if (from === to || from.split(".")[0] === to.split(".")[0] && from === to) return false;
    if (S.spec.wiring.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) return false;
    pushHistory();
    // El color se fija al crear (según el polo de las puntas; negro para el mando).
    const color = poleColor(from, S.staticPoles) ?? poleColor(to, S.staticPoles) ?? "negro";
    S.spec.wiring.push({ from, to, color });
    S.sel = { kind: "wire", id: S.spec.wiring.length - 1 };
    changed();
    return true;
  }

  function removeSelected() {
    if (S.running || !S.sel) return;
    pushHistory();
    if (S.sel.kind === "wire") S.spec.wiring.splice(S.sel.id, 1);
    else if (S.sel.kind === "cable") {
      const id = S.sel.id;
      S.spec.wiring = S.spec.wiring.filter((w) => w.cable !== id);
      S.spec.cables = cablesOf().filter((c) => c.id !== id);
    } else {
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
  /**
   * Cambia un parámetro. Si el cambio oculta bornes (la bornera del motor
   * pasa de «6 cables» a chapas), se quitan los cables que llegaban a ellos.
   */
  function setParam(dev, id, value, record = true) {
    if (record) pushHistory();
    dev.params = { ...(dev.params ?? {}), [id]: value };
    const def = S.defs.get(dev.type);
    const lay = window.JwsimSymbols.layout(dev.type, def, { ...defaultsOf(dev.type), ...dev.params });
    const gone = (end) => end.startsWith(`${dev.id}.`) && !(end.slice(dev.id.length + 1) in lay.terms);
    const before = S.spec.wiring.length;
    S.spec.wiring = S.spec.wiring.filter((w) => !gone(w.from) && !gone(w.to));
    if (S.spec.wiring.length !== before) S.sel = { kind: "device", id: dev.id };
    changed();
  }

  /** La plantilla describe los parámetros actuales (los demás, de fábrica). */
  function presetMatches(dev, def, pr) {
    const keep = new Set(pr.keep ?? []);
    return def.parameters.every((p) => keep.has(p.id) || String(dev.params?.[p.id] ?? p.default) === String(pr.params[p.id] ?? p.default));
  }

  /** Aplica una plantilla: fábrica + sus parámetros (conserva los de `keep`). */
  function applyPreset(dev, def, pr) {
    pushHistory();
    const kept = Object.fromEntries((pr.keep ?? []).filter((k) => dev.params?.[k] !== undefined).map((k) => [k, dev.params[k]]));
    dev.params = { ...kept, ...pr.params };
    changed();
  }

  function changed() {
    normalizeCables();
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
    window.Jwsim3D?.onSnapshot(S.snap);
    S.staticPoles = S.snap?.poles ?? {};
    render(true);
  }

  function cleanSpec() {
    return {
      devices: S.spec.devices.map(({ id, type, version, params, x, y }) => ({ id, type, ...(version ? { version } : {}), ...(params && Object.keys(params).length ? { params } : {}), x: x ?? 0, y: y ?? 0 })),
      wiring: S.spec.wiring.map(({ from, to, color, points, cable, ref }) => ({
        from,
        to,
        ...(color ? { color } : {}),
        ...(points?.length ? { points } : {}),
        ...(cable && cableById(cable) ? { cable } : {}),
        ...(ref ? { ref: true } : {}),
      })),
      // Cables multipolares (solo dibujo: el simulador usa from/to de cada hilo).
      ...(cablesOf().length ? { cables: cablesOf().map(({ id, label, ref }) => ({ id, ...(label ? { label } : {}), ...(ref ? { ref: true } : {}) })) } : {}),
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

  // Cable que se está tendiendo (de un borne al puntero).
  function cancelWiring() {
    if (!S.wiring) return;
    S.wiring = null;
    $("scene-rubber").setAttribute("d", "");
  }
  function updateRubber(e) {
    if (!S.wiring) return;
    const a = termPos(S.wiring.from);
    const w = toWorld(e);
    if (a) $("scene-rubber").setAttribute("d", `M${a.x} ${a.y} L${w.x} ${w.y}`);
  }

  function wirePointer() {
    const svg = $("scene-svg");
    // Rueda presionada (o clic derecho): sin desplazamiento automático ni menú.
    svg.addEventListener("mousedown", (e) => e.button === 1 && e.preventDefault());
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    svg.addEventListener("pointerdown", (e) => {
      const term = e.target.closest(".term");
      const actEl = e.target.closest(".act");
      const devEl = e.target.closest(".dev");
      // (los bornes están en #scene-terms, fuera del grupo del dispositivo)
      const wireEl = e.target.closest(".wire");
      const handle = e.target.closest(".wire-handle");
      const delV = e.target.closest(".wire-del");
      const cableEl = e.target.closest(".cable");
      const w = toWorld(e);
      // Rueda presionada o clic derecho: siempre mueven la vista, también
      // sobre un equipo o un borne; no cortan el cable que se está tendiendo
      // ni cambian la selección. Un clic sin arrastrar sí corta el cable.
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        S.drag = { kind: "pan", x: e.clientX - S.pan.x, y: e.clientY - S.pan.y, sx: e.clientX, sy: e.clientY, panned: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      // Equipo elegido en la paleta (doble clic): el clic lo pone ahí. Con
      // Mayús sigue elegido para poner otro igual.
      if (S.pal.armed && e.button === 0) {
        e.preventDefault();
        const { type, params } = S.pal.armed;
        if (placePart(type, params, e) && !e.shiftKey) disarmPart();
        return;
      }
      // Rótulo de una referencia: la vista va al otro extremo y lo elige.
      const jump = e.target.closest("[data-jump]");
      if (jump) {
        e.preventDefault();
        cancelWiring();
        const [x, y] = jump.dataset.jump.split(",").map(Number);
        const [kind, id] = jump.dataset.jumpSel.split(":");
        S.sel = kind === "wire" ? { kind, id: Number(id) } : { kind, id };
        focusOn(x, y);
        return;
      }
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
          cancelWiring();
        } else {
          // Clic en un borne y clic en otro, o arrastrar de uno a otro.
          S.wiring = { from: term.dataset.term, pressed: true };
        }
        return;
      }
      // Clic en un equipo o un cable: corta el cable en curso. En un lugar
      // vacío se decide al soltar (arrastrar mueve la vista y lo conserva).
      if (actEl || devEl || wireEl || cableEl) cancelWiring();
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
        S.drag = { kind: "device", dev, dx: w.x - (dev.x ?? 0), dy: w.y - (dev.y ?? 0), moved: false, snapshot: currentSnapshot() };
        svg.setPointerCapture(e.pointerId);
        render();
        return;
      }
      if (cableEl) {
        S.sel = { kind: "cable", id: cableEl.dataset.cable };
        render();
        return;
      }
      if (wireEl) {
        const i = Number(wireEl.dataset.wire);
        // Clic sobre el cable ya seleccionado: agrega un punto de doblez ahí
        // (en la grilla) y empieza a arrastrarlo. Los hilos de un cable
        // multipolar y las referencias no tienen recorrido propio.
        if (S.sel?.kind === "wire" && S.sel.id === i && !S.running && S.routes?.[i]) {
          const snapshot = currentSnapshot();
          const k = insertVertex(i, { x: snap(w.x), y: snap(w.y) });
          S.drag = { kind: "vertex", i, k, moved: false, snapshot };
          svg.setPointerCapture(e.pointerId);
          renderWires();
          return;
        }
        S.sel = { kind: "wire", id: i };
        render();
        return;
      }
      // Lugar vacío: mover la vista. Con un cable en curso, la selección se
      // conserva (solo se suelta el cable si el clic no arrastra).
      if (!S.wiring) S.sel = null;
      S.drag = { kind: "pan", x: e.clientX - S.pan.x, y: e.clientY - S.pan.y, sx: e.clientX, sy: e.clientY, panned: false };
      svg.setPointerCapture(e.pointerId);
      render();
    });
    svg.addEventListener("pointermove", (e) => {
      const w = toWorld(e);
      if (S.pal.armed && !S.drag) showGhost(e);
      if (S.drag?.kind !== "pan") updateRubber(e);
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
        if (!S.drag.panned && Math.hypot(e.clientX - S.drag.sx, e.clientY - S.drag.sy) > 4) S.drag.panned = true;
        S.pan = { x: e.clientX - S.drag.x, y: e.clientY - S.drag.y };
        $("scene-root").setAttribute("transform", `translate(${S.pan.x} ${S.pan.y}) scale(${S.zoom})`);
        // La punta del cable en curso sigue al puntero con la vista nueva.
        updateRubber(e);
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
    svg.addEventListener("pointerup", (e) => {
      // Cable arrastrado desde un borne: al soltar sobre otro, se conecta; al
      // soltar sobre el mismo, sigue como clic (el siguiente clic lo termina).
      if (S.wiring?.pressed && e.button === 0) {
        S.wiring.pressed = false;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".term");
        if (over && over.dataset.term !== S.wiring.from) {
          addWire(S.wiring.from, over.dataset.term);
          cancelWiring();
        }
        return;
      }
      // Mover la vista: un clic sin arrastrar (cualquier botón) suelta el cable
      // en curso; si hubo arrastre, el cable sigue.
      if (S.drag?.kind === "pan") {
        const clicked = !S.drag.panned;
        S.drag = null;
        if (clicked) cancelWiring();
        return;
      }
      if (S.drag?.kind === "act") {
        const changedParam = S.drag.changed;
        S.drag = null;
        if (changedParam) changed();
        return;
      }
      const moved = S.drag?.moved;
      const snapshot = S.drag?.snapshot;
      if (moved) S.dirty = true;
      S.drag = null;
      if (moved && snapshot) {
        S.undoStack.push(snapshot);
        if (S.undoStack.length > 50) S.undoStack.shift();
        S.redoStack.length = 0;
        updateUndoRedoButtons();
      }
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
        updateRubber(e);
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (S.view !== "scene" || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
      } else if ((ctrl && (e.key === "y" || e.key === "Y")) || (ctrl && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
        e.preventDefault();
        redo();
      } else if (ctrl && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copy();
      } else if (ctrl && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        if (e.shiftKey) {
          const id = S.sel?.kind === "cable" ? S.sel.id : S.sel?.kind === "wire" ? S.spec.wiring[S.sel.id]?.cable : null;
          if (id) ungroupCable(id);
        } else if (S.sel?.kind === "wire") {
          groupWires(groupCandidates(S.sel.id).filter((j) => j === S.sel.id || !S.groupExclude?.has(j)));
        }
      } else if (ctrl && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        cut();
      } else if (ctrl && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        paste();
      } else if (ctrl && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape" && S.pal.armed) {
        disarmPart();
      } else if (e.key === "Escape" && S.wiring) {
        S.wiring = null;
        $("scene-rubber").setAttribute("d", "");
      }
    });
    // Edición ▸ Cortar (y Ctrl+X si lo atiende el menú).
    window.addEventListener("cut", (e) => {
      if (S.view !== "scene" || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      if (S.sel) {
        cut();
        e.preventDefault();
      }
    });
    window.addEventListener("copy", (e) => {
      if (S.view !== "scene" || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      if (S.sel?.kind === "device") {
        copy();
        e.preventDefault();
      }
    });
    window.addEventListener("paste", (e) => {
      if (S.view !== "scene" || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
      if (S.clipboard) {
        paste();
        e.preventDefault();
      }
    });
    // Cables multipolares y referencias.
    $("scene-inspector").addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.groupWire !== undefined) {
        const j = Number(el.dataset.groupWire);
        if (el.checked) S.groupExclude.delete(j);
        else S.groupExclude.add(j);
      } else if (el.id === "scene-wire-ref" && S.sel?.kind === "wire") setRef(S.spec.wiring[S.sel.id], el.checked);
      else if (el.id === "scene-cable-ref" && S.sel?.kind === "cable") setRef(cableById(S.sel.id), el.checked);
      else if (el.dataset.cableField === "label" && S.sel?.kind === "cable") {
        const c = cableById(S.sel.id);
        if (!c || S.running) return;
        pushHistory();
        const v = el.value.trim();
        if (v) c.label = v;
        else delete c.label;
        changed();
      }
    });
    $("scene-inspector").addEventListener("click", (e) => {
      if (e.target.closest("#scene-cable-group") && S.sel?.kind === "wire") {
        groupWires(groupCandidates(S.sel.id).filter((j) => j === S.sel.id || !S.groupExclude?.has(j)));
        return;
      }
      const act = e.target.closest("[data-cable-act]");
      if (act) {
        const a = act.dataset.cableAct;
        if (a === "show") S.sel = { kind: "cable", id: act.dataset.cable };
        else if (a === "leave" && S.sel?.kind === "wire") return leaveCable(S.sel.id);
        else if (a === "ungroup" && S.sel?.kind === "cable") return ungroupCable(S.sel.id);
        render();
        return;
      }
      const row = e.target.closest("[data-select-wire]");
      if (row) {
        S.sel = { kind: "wire", id: Number(row.dataset.selectWire) };
        render();
      }
    });
    $("scene-inspector").addEventListener("change", (e) => {
      const el = e.target;
      const id = el.dataset.param;
      if (!id || S.sel?.kind !== "device") return;
      const dev = devById(S.sel.id);
      const p = S.defs.get(dev.type).parameters.find((x) => x.id === id);
      setParam(dev, id, p.type === "boolean" ? el.checked : p.type === "number" ? Number(el.value) : el.value);
    });
    $("scene-inspector").addEventListener("click", (e) => {
      const b = e.target.closest("[data-preset]");
      if (!b || b.disabled || S.sel?.kind !== "device") return;
      const dev = devById(S.sel.id);
      const def = S.defs.get(dev.type);
      const pr = def.presets?.find((x) => x.id === b.dataset.preset);
      if (pr) applyPreset(dev, def, pr);
    });
    $("scene-inspector").addEventListener(
      "toggle",
      (e) => {
        const d = e.target;
        if (!d.classList?.contains("insp-group")) return;
        if (d.open) S.openGroups.add(d.dataset.group);
        else S.openGroups.delete(d.dataset.group);
      },
      true,
    );
    // Selectores gráficos de parámetros (bornera del motor trifásico).
    $("scene-inspector").addEventListener("click", (e) => {
      const b = e.target.closest("[data-setparam]");
      if (!b || b.disabled || S.sel?.kind !== "device") return;
      setParam(devById(S.sel.id), b.dataset.setparam, b.dataset.value);
    });
    // Fallas (G9): en marcha el inspector se redibuja con cada instantánea;
    // con pointerdown el botón responde aunque se reemplace antes de soltar.
    $("scene-inspector").addEventListener("pointerdown", (e) => {
      const fb = e.target.closest("[data-fault]");
      if (!fb || !S.running || fb.disabled) return;
      e.preventDefault();
      const f = JSON.parse(fb.dataset.fault);
      const key = f.kind === "open" ? `open:${f.wire.split(" ").sort().join(" ")}` : `${f.kind}:${f.device}`;
      if (fb.dataset.on === "1") api.sceneClearFault(key);
      else api.sceneInject(f);
    });
    $("scene-inspector").addEventListener("click", (e) => {
      if (e.target.id === "scene-wire-auto" && S.sel?.kind === "wire") {
        pushHistory();
        delete S.spec.wiring[S.sel.id].points;
        changed();
      }
      const sw = e.target.closest(".swatch");
      if (sw && S.sel?.kind === "wire") {
        pushHistory();
        const w = S.spec.wiring[S.sel.id];
        if (sw.dataset.color) w.color = sw.dataset.color;
        else delete w.color;
        changed();
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
    // Margen para los cables que pasan por encima y por debajo de los equipos
    // y, si hay referencias, para sus rótulos («→ destino»).
    const refs = S.spec.wiring.some((w) => w.ref) || cablesOf().some((c) => c.ref) ? 60 : 0;
    for (const d of S.spec.devices) {
      const s = symbolFor(d);
      x0 = Math.min(x0, d.x ?? 0);
      y0 = Math.min(y0, (d.y ?? 0) - 70 - refs);
      x1 = Math.max(x1, (d.x ?? 0) + s.w);
      y1 = Math.max(y1, (d.y ?? 0) + s.h + 60 + refs);
    }
    S.zoom = Math.min(2, Math.max(0.2, Math.min((box.width - 40) / (x1 - x0), (box.height - 40) / (y1 - y0))));
    // Centrado a lo ancho (la escena a todo el ancho deja aire a los lados).
    S.pan = { x: Math.max(20, (box.width - (x1 - x0) * S.zoom) / 2) - x0 * S.zoom, y: 20 - y0 * S.zoom };
    render();
  }

  // ------------------------------------------------------------ paleta (como Fritzing)
  // Pestaña «Agregar»: miniaturas por categoría, con búsqueda. Pasar el
  // puntero o un clic muestra la ficha del equipo debajo; al salir el puntero
  // queda la del último clic. Doble clic lo elige: se escoge el modelo y se
  // coloca con un clic en el esquema (Mayús: sigue elegido para poner otro),
  // o se arrastra al esquema. Esc lo suelta.
  const DND = "application/x-jwsim-device";
  const EMPTY_STATE = () => ({ outputs: {}, contacts: {}, actions: {}, damaged: [], id: "", wired: [] });
  let thumbSeq = 0;
  function thumbSvg(type, params = {}) {
    const sym = symbolFor({ type, params });
    const p = { ...defaultsOf(type), ...params };
    // Ids propios en cada copia: las plantillas traen degradados (url(#…)) y
    // un id repetido apuntaría al de otra copia, quizá oculta.
    const pre = `th${++thumbSeq}-`;
    const body = window.JwsimSymbols.draw(type, sym.lay, EMPTY_STATE(), p, S.defs.get(type))
      .replace(/\bid="([^"]+)"/g, `id="${pre}$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`)
      .replace(/href="#([^"]+)"/g, `href="#${pre}$1"`);
    return `<svg viewBox="-6 -6 ${sym.w + 12} ${sym.h + 12}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="dev">${body}</g></svg>`;
  }

  // Parámetros que cambian el dibujo: los que eligen una plantilla propia
  // (<tipo>__<valor>.svg, p. ej. el modelo de la fuente), el color y los
  // marcados como modelo en la definición (design: true, p. ej. la forma del tanque).
  const slugOf = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
  function designParams(def) {
    return (def?.parameters ?? []).filter(
      (p) =>
        p.type === "enum" &&
        !p.group &&
        p.options.length <= 8 &&
        (p.design || p.id === "color" || p.options.some((o) => window.JwsimSymbols.templates.has(`${def.type}__${slugOf(o)}`))),
    );
  }

  // Ficha del equipo, por secciones como el Inspector de Fritzing: nombre,
  // vista previa, Modelo (se escoge con un clic), Propiedades, Descripción y
  // Conexiones (bornes).
  function renderPartInfo() {
    const box = $("scene-part-info");
    const pal = S.pal;
    const type = pal.hover ?? pal.pinned;
    const def = type && S.defs.get(type);
    for (const b of $("scene-add").querySelectorAll(".palette-item")) {
      b.classList.toggle("pinned", b.dataset.add === pal.pinned);
      b.classList.toggle("armed", b.dataset.add === pal.armed?.type);
    }
    $("scene-svg").classList.toggle("placing", !!pal.armed && !S.running);
    pal.shownRunning = S.running;
    if (!def) {
      box.innerHTML = `<p class="part-empty">Pase el puntero o haga clic en un equipo para ver su ficha. Doble clic para elegirlo y ponerlo en el esquema.</p>`;
      pal.shownType = null;
      return;
    }
    const armed = pal.armed?.type === type ? pal.armed : null;
    const params = paramsFor(type);
    const terms = def.terminals ?? [];
    const design = designParams(def);
    const sec = (title) => `<div class="part-sec">${esc(title)}</div>`;
    const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
    let html =
      `<div class="part-name insp-title${armed ? " armed" : ""}">${esc(def.name)}${armed ? `<span class="part-state">elegido</span>` : ""}</div>` +
      `<div class="part-head"><div class="part-preview" draggable="true" data-drag-part="${esc(type)}" title="Arrastre al esquema">${thumbSvg(type, params)}</div>` +
      `<div class="part-meta"><span>${esc(def.type)}</span><span>v. ${esc(def.version)}</span>${def.installed ? "<span>instalado</span>" : ""}</div></div>`;
    if (S.running) html += `<p class="part-hint bad">Detenga la simulación para agregar equipos.</p>`;
    else if (armed) html += `<p class="part-hint">Clic en el esquema para ponerlo (con Mayús queda elegido para poner otro) o arrástrelo. Esc cancela.</p>`;
    else html += `<p class="part-hint muted">${design.length ? "Escoja un modelo o haga" : "Haga"} doble clic en la miniatura para elegirlo; también puede arrastrarlo al esquema.</p>`;
    if (design.length) {
      html += sec("Modelo");
      for (const p of design) {
        const cur = params[p.id] ?? p.default;
        if (design.length > 1) html += `<div class="part-sub">${esc(p.label ?? p.id)}</div>`;
        html += `<div class="model-pick">`;
        for (const o of p.options) {
          html +=
            `<button class="model-opt${o === cur ? " on" : ""}" data-type="${esc(type)}" data-model-param="${esc(p.id)}" data-value="${esc(o)}" title="${esc(`${p.label ?? p.id}: ${o}`)}">` +
            `${thumbSvg(type, { ...params, [p.id]: o })}<span>${esc(o)}</span></button>`;
        }
        html += `</div>`;
      }
    }
    // Propiedades: la familia y los valores con que llega (se cambian luego en
    // Propiedades del equipo puesto).
    const shown = def.parameters.filter((p) => !p.group && !design.includes(p) && p.type !== "string").slice(0, 8);
    html += sec("Propiedades") + `<table class="part-table">` + row("familia", esc(def.category));
    for (const p of design) html += row(p.label ?? p.id, esc(params[p.id] ?? p.default));
    for (const p of shown) html += row(p.label ?? p.id, `${esc(p.type === "boolean" ? (p.default ? "sí" : "no") : p.default)}${p.unit ? ` ${esc(p.unit)}` : ""}`);
    const groups = new Set(def.parameters.filter((p) => p.group).map((p) => p.group));
    if (groups.size) html += row("parámetros", `${def.parameters.length} en ${groups.size} grupos`);
    if (def.presets?.length) html += row("plantillas", esc(def.presets.map((pr) => pr.label).join(", ")));
    html += `</table>`;
    if (def.description) html += sec("Descripción") + `<p class="part-desc">${esc(def.description)}</p>`;
    if (terms.length) {
      html += sec(`Conexiones (${terms.length})`) + `<table class="part-table part-terms">`;
      for (const t of terms) html += row(t.id, esc(t.label && t.label !== t.id ? t.label : "—"));
      html += `</table>`;
    }
    box.innerHTML = html;
    // Otro equipo: la ficha empieza arriba (al escoger modelo se queda donde está).
    if (pal.shownType !== type) box.scrollTop = 0;
    pal.shownType = type;
  }

  // Divisor entre «Equipos» y la ficha: arrastrar cambia el alto de la ficha
  // (se recuerda); doble clic vuelve al de fábrica.
  const INFO_H_KEY = "jwsim.partsInfoHeight";
  function wirePartsSplitter() {
    const pane = document.querySelector(".parts-pane");
    const bar = $("parts-splitter");
    const clamp = (h) => Math.round(Math.max(120, Math.min(pane.clientHeight - 150, h)));
    const set = (h, save) => {
      if (h === null) pane.style.removeProperty("--info-h");
      else pane.style.setProperty("--info-h", `${h}px`);
      if (!save) return;
      try {
        if (h === null) localStorage.removeItem(INFO_H_KEY);
        else localStorage.setItem(INFO_H_KEY, String(h));
      } catch {}
    };
    let saved = null;
    try {
      saved = Number(localStorage.getItem(INFO_H_KEY)) || null;
    } catch {}
    if (saved) set(saved, false);
    bar.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      const y0 = e.clientY;
      const h0 = document.querySelector(".parts-inspector").getBoundingClientRect().height;
      bar.classList.add("dragging");
      const move = (ev) => set(clamp(h0 - (ev.clientY - y0)), false);
      const up = (ev) => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.classList.remove("dragging");
        set(clamp(h0 - (ev.clientY - y0)), true);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });
    bar.addEventListener("dblclick", () => set(null, true));
  }

  // Modelo con que se pone cada equipo: el último escogido en la ficha.
  const paramsFor = (type) => (S.pal.armed?.type === type ? S.pal.armed.params : (S.pal.choice[type] ?? {}));

  function armPart(type) {
    if (!S.defs.has(type)) return;
    S.pal.armed = { type, params: { ...(S.pal.choice[type] ?? {}) } };
    S.pal.pinned = type;
    if (S.wiring) {
      S.wiring = null;
      $("scene-rubber").setAttribute("d", "");
    }
    renderPartInfo();
  }

  function disarmPart() {
    if (!S.pal.armed) return;
    S.pal.armed = null;
    showGhost(null);
    renderPartInfo();
  }

  // Vista previa semitransparente que sigue al puntero mientras se coloca.
  function showGhost(e, type = S.pal.armed?.type, params = S.pal.armed?.params ?? {}) {
    const g = $("scene-ghost");
    if (!g) return; // la paleta aún no se armó
    if (!e || !type || S.running) {
      g.setAttribute("visibility", "hidden");
      return;
    }
    const key = JSON.stringify([type, params]);
    const sym = symbolFor({ type, params });
    if (g.dataset.key !== key) {
      g.innerHTML = `<g class="dev">${window.JwsimSymbols.draw(type, sym.lay, EMPTY_STATE(), { ...defaultsOf(type), ...params }, S.defs.get(type))}</g>`;
      g.dataset.key = key;
    }
    const w = toWorld(e);
    g.setAttribute("transform", `translate(${snap(w.x - sym.w / 2)} ${snap(w.y - sym.h / 2)})`);
    g.setAttribute("visibility", "visible");
  }

  // Pone el equipo con su centro bajo el puntero.
  function placePart(type, params, e) {
    if (S.running || !S.defs.has(type)) return null;
    const w = toWorld(e);
    const sym = symbolFor({ type, params });
    // Se queda en «Agregar»: las propiedades se ven al hacer clic en el equipo.
    S.keepPane = true;
    return addDevice(type, w.x - sym.w / 2, w.y - sym.h / 2, nextId(type), params);
  }

  function populatePalette() {
    const box = $("scene-add");
    const groups = new Map();
    for (const d of S.defs.values()) {
      if (d.type === "jwsim/jwplc-basic") continue;
      if (!groups.has(d.category)) groups.set(d.category, []);
      groups.get(d.category).push(d);
    }
    box.innerHTML = [...groups]
      .map(
        ([cat, list]) =>
          `<div class="palette-cat" data-cat="${esc(cat)}">${esc(cat)}</div><div class="palette-grid" data-cat="${esc(cat)}">` +
          list
            .map(
              (d) =>
                `<button class="palette-item" role="listitem" draggable="true" data-add="${esc(d.type)}" data-cat="${esc(cat)}" ` +
                `data-search="${esc(`${d.name} ${d.description} ${cat}`.toLowerCase())}" title="${esc(d.name)}" aria-label="${esc(d.name)}">` +
                `${thumbSvg(d.type)}${d.installed ? `<span class="palette-badge">+</span>` : ""}</button>`,
            )
            .join("") +
          `</div>`,
      )
      .join("");
    const itemOf = (e) => e.target.closest?.(".palette-item");
    box.addEventListener("pointerover", (e) => {
      const b = itemOf(e);
      if (!b || S.pal.hover === b.dataset.add) return;
      S.pal.hover = b.dataset.add;
      renderPartInfo();
    });
    box.addEventListener("pointerleave", () => {
      if (S.pal.hover === null) return;
      S.pal.hover = null;
      renderPartInfo();
    });
    box.addEventListener("click", (e) => {
      const b = itemOf(e);
      if (!b) return;
      S.pal.pinned = b.dataset.add;
      renderPartInfo();
    });
    box.addEventListener("dblclick", (e) => {
      const b = itemOf(e);
      if (b) armPart(b.dataset.add);
    });
    // Arrastrar una miniatura (o la vista previa de la ficha) al esquema.
    const dragStart = (e, type) => {
      S.pal.dragType = type;
      e.dataTransfer.setData(DND, type);
      e.dataTransfer.effectAllowed = "copy";
    };
    const dragEnd = () => {
      S.pal.dragType = null;
      showGhost(null);
    };
    box.addEventListener("dragstart", (e) => {
      const b = itemOf(e);
      if (b) dragStart(e, b.dataset.add);
    });
    box.addEventListener("dragend", dragEnd);
    const info = $("scene-part-info");
    info.addEventListener("dragstart", (e) => {
      const el = e.target.closest?.("[data-drag-part]");
      if (el) dragStart(e, el.dataset.dragPart);
    });
    info.addEventListener("dragend", dragEnd);
    // Escoger un modelo lo recuerda para ese equipo, lo deja elegido para
    // ponerlo y actualiza su miniatura.
    info.addEventListener("click", (e) => {
      const b = e.target.closest("[data-model-param]");
      if (!b) return;
      const type = b.dataset.type;
      S.pal.choice[type] = { ...paramsFor(type), [b.dataset.modelParam]: b.dataset.value };
      const tileEl = box.querySelector(`.palette-item[data-add="${CSS.escape(type)}"]`);
      const old = tileEl?.querySelector("svg");
      if (old) old.outerHTML = thumbSvg(type, S.pal.choice[type]);
      armPart(type);
    });
    const svg = $("scene-svg");
    const ghost = document.createElementNS(NS, "g");
    ghost.id = "scene-ghost";
    ghost.setAttribute("visibility", "hidden");
    $("scene-root").appendChild(ghost);
    svg.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes(DND) || S.running) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      showGhost(e, S.pal.dragType, paramsFor(S.pal.dragType));
    });
    svg.addEventListener("dragleave", (e) => {
      if (!svg.contains(e.relatedTarget)) showGhost(null);
    });
    svg.addEventListener("drop", (e) => {
      const type = e.dataTransfer.getData(DND);
      if (!type) return;
      e.preventDefault();
      showGhost(null);
      const id = placePart(type, paramsFor(type), e);
      if (id && S.pal.armed?.type === type) disarmPart();
    });
    svg.addEventListener("pointerleave", () => showGhost(null));
    $("scene-add-filter").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      const shown = new Set();
      for (const b of box.querySelectorAll(".palette-item")) {
        b.hidden = !!q && !b.dataset.search.includes(q);
        if (!b.hidden) shown.add(b.dataset.cat);
      }
      for (const c of box.querySelectorAll(".palette-cat, .palette-grid")) c.hidden = !shown.has(c.dataset.cat);
    });
    wirePartsSplitter();
    renderPartInfo();
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
    $("view3d").hidden = view !== "3d";
    document.querySelector(".plc").hidden = view !== "board";
    document.querySelector(".board-card").classList.toggle("scene-mode", view !== "board");
    window.JwsimTabs?.onView(view);
    window.Jwsim3D?.show(view === "3d");
    // scene3d.js es un módulo: si no carga (falta three.js en la instalación),
    // el aviso de «escena sin planta» engañaba; se dice qué pasa.
    if (view === "3d" && !window.Jwsim3D) {
      const msg = $("view3d-empty");
      msg.textContent = "La vista 3D no se pudo cargar: falta three.js en esta instalación (Ver > Herramientas de desarrollo > Consola muestra el archivo). Reinstale JWPLC Sim.";
      msg.hidden = false;
    }
    if (view === "3d" && !S.snap && !S.running) analyze();
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
      S.spec = { devices: structuredClone(sc?.devices ?? []), wiring: structuredClone(sc?.wiring ?? []), cables: structuredClone(sc?.cables ?? []) };
      normalizeCables();
      S.undoStack = [];
      S.redoStack = [];
      updateUndoRedoButtons();
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
    // Para la vista 3D: la escena tal como está y si corre la simulación.
    specForView: () => S.spec,
    // Pestañas de la ventana (tabs.js): cambian la vista del panel derecho.
    setView: (v) => setView(v),
    view: () => S.view,
    undo,
    redo,
    copy,
    paste,
    duplicate,
    cut,
    removeSelected,
    // Vista 3D vacía: agrega un equipo de planta a la escena, a la derecha
    // de lo que ya hay (sin cablear; se cablea en Esquema eléctrico).
    async addPlant(type) {
      if (S.running) return null;
      await loadBoard();
      ensurePlc();
      const right = Math.max(0, ...S.spec.devices.map((d) => (d.x ?? 0) + 400));
      return addDevice(type, right + 80, 0);
    },
    isRunning: () => S.running,
    owns(signal) {
      return S.running && !!S.snap && signal in (S.snap.inputs ?? {});
    },
    onStatus(kind) {
      const run = kind === "running" || kind === "paused" || kind === "break";
      if (run === S.running) return;
      S.running = run;
      updateUndoRedoButtons();
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
      // Paleta «Agregar»: estado (último clic, elegido con su modelo) y tamaño
      // del símbolo (para calcular dónde quedó el centro).
      palette: () => ({ hover: S.pal.hover, pinned: S.pal.pinned, armed: S.pal.armed && structuredClone(S.pal.armed) }),
      symbolSize: (type, params = {}) => {
        const s = symbolFor({ type, params });
        return { w: s.w, h: s.h };
      },
      toScreen: (x, y) => {
        const r = $("scene-svg").getBoundingClientRect();
        return { x: r.left + S.pan.x + x * S.zoom, y: r.top + S.pan.y + y * S.zoom };
      },
      wire: (a, b) => addWire(a, b),
      act: (id, action, value) => act(id, action, value),
      view3d: () => window.Jwsim3D?.objects() ?? [],
      fps3d: () => window.Jwsim3D?.fps() ?? 0,
      spec: () => cleanSpec(),
      snapshot: () => S.snap,
      cables: () => structuredClone(cablesOf()),
      group: (indices) => groupWires(indices),
      select: (id) => {
        S.sel = typeof id === "number" ? { kind: "wire", id } : String(id).startsWith("cable:") ? { kind: "cable", id: id.slice(6) } : { kind: "device", id };
        render();
      },
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
      undo,
      redo,
      copy,
      paste,
      duplicate,
      removeSelected,
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
    $("scene-undo")?.addEventListener("click", () => undo());
    $("scene-redo")?.addEventListener("click", () => redo());
    $("scene-fit").addEventListener("click", fit);
    $("scene-rearm").addEventListener("click", () => api.sceneRearm());
    api.onSceneSnapshot((snap) => {
      // Relés y contactores externos: clic al atraer y al soltar.
      for (const d of snap.devices) {
        if (typeof d.outputs?.closed !== "boolean") continue;
        const prev = S.snap?.devices.find((x) => x.id === d.id)?.outputs?.closed;
        if (prev !== undefined && prev !== d.outputs.closed) window.JwsimSound?.click(d.type === "jwsim/contactor" ? "contactor" : "relay", d.outputs.closed);
      }
      // Lo que el equipo reprogramó (teclado o Modbus del variador) queda en la escena.
      for (const d of snap.devices) {
        if (!d.params) continue;
        const dev = devById(d.id);
        if (dev && Object.entries(d.params).some(([k, v]) => dev.params?.[k] !== v)) {
          dev.params = { ...(dev.params ?? {}), ...d.params };
          S.dirty = true;
        }
      }
      S.snap = snap;
      window.Jwsim3D?.onSnapshot(snap);
      render();
    });
    const sound = $("scene-sound");
    const paintSound = () => {
      sound.textContent = window.JwsimSound?.enabled ? "🔊" : "🔇";
      sound.title = window.JwsimSound?.enabled ? "Sonido de relés y contactores: activado" : "Sonido de relés y contactores: apagado";
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
