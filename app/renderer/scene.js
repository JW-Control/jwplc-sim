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
  // Bornes repartidos sobre la grilla.
  const row = (ids, y, w) => {
    const n = ids.length;
    const step = n > 1 ? Math.max(GRID, Math.floor((w - 2 * GRID) / (n - 1) / GRID) * GRID) : 0;
    const x0 = snap((w - step * (n - 1)) / 2);
    return Object.fromEntries(ids.map((id, i) => [id, [x0 + i * step, y]]));
  };

  function symbolFor(dev) {
    const t = dev.type;
    const short = t.split("/")[1];
    if (t === "jwsim/jwplc-basic") return { w: S.board.w, h: S.board.h, terms: S.boardTerms, board: true };
    const sizes = {
      "pushbutton-no": [60, 100, ["13"], ["14"]],
      "pushbutton-nc": [60, 100, ["11"], ["12"]],
      "selector-2": [80, 100, ["13", "21"], ["14", "22"]],
      "selector-3": [80, 100, ["13", "23"], ["14", "24"]],
      "limit-switch": [80, 100, ["13", "21"], ["14", "22"]],
      "sensor-inductive": [80, 100, ["BN", "BU"], ["BK"]],
      "sensor-photoelectric": [80, 100, ["BN", "BU"], ["BK"]],
      lamp: [60, 80, ["X1"], ["X2"]],
      buzzer: [60, 80, ["+"], ["-"]],
      relay: [140, 100, ["A1", "11", "21"], ["A2", "12", "14", "22", "24"]],
      contactor: [160, 100, ["A1", "1", "3", "5", "13", "21"], ["A2", "2", "4", "6", "14", "22"]],
      "solenoid-valve": [180, 80, ["A1"], ["A2"]],
      motor: [100, 100, ["U1", "U2"], []],
      "power-24vdc": [100, 60, [], ["L+", "M"]],
      "power-230vac": [100, 60, [], ["L", "N"]],
    };
    let [w, h, top, bottom] = t.startsWith("jwsim/") && sizes[short] ? sizes[short] : [];
    if (!w) {
      // Dispositivo de terceros: caja genérica con los bornes repartidos.
      const ids = (S.defs.get(t)?.terminals ?? []).map((x) => x.id);
      top = ids.slice(0, Math.ceil(ids.length / 2));
      bottom = ids.slice(top.length);
      w = Math.max(120, (Math.max(top.length, bottom.length) + 1) * 2 * GRID);
      h = 100;
    }
    if (short === "solenoid-valve") return { w, h, terms: { A1: [GRID, 0], A2: [GRID, h] } };
    return { w, h, terms: { ...row(top, 0, w), ...row(bottom, h, w) } };
  }

  const out = (id) => S.snap?.devices.find((d) => d.id === id) ?? { outputs: {}, contacts: {}, actions: {}, damaged: [] };

  function body(dev, sym) {
    const st = out(dev.id);
    const o = st.outputs ?? {};
    const p = { ...defaultsOf(dev.type), ...(dev.params ?? {}) };
    const short = dev.type.split("/")[1];
    const { w, h } = sym;
    const box = (extra = "") => `<rect class="dev-box${st.damaged?.length ? " damaged" : ""}${st.tripped ? " tripped" : ""}" x="0" y="0" width="${w}" height="${h}" rx="6" ${extra}/>`;
    const title = `<text class="dev-id" x="${w / 2}" y="${h + 16}">${esc(dev.id)}</text>`;
    const label = (txt, y = 14) => (txt ? `<text class="dev-label" x="${w / 2}" y="${y}">${esc(txt)}</text>` : "");
    switch (dev.type.startsWith("jwsim/") ? short : "") {
      case "pushbutton-no":
      case "pushbutton-nc": {
        const c = COLORS[p.color] ?? COLORS.verde;
        const pr = !!o.pressed;
        return `${box()}${label(p.label)}<g class="act" data-action="press" data-kind="momentary">
          <circle cx="${w / 2}" cy="${h / 2 + 6}" r="20" fill="#14171b" stroke="#596270"/>
          <circle cx="${w / 2}" cy="${h / 2 + 6}" r="${pr ? 13 : 15}" fill="${c}" opacity="${pr ? 0.7 : 1}"/></g>
          <text class="dev-note" x="${w / 2}" y="${h - 6}">${short.endsWith("no") ? "NA" : "NC"}</text>${title}`;
      }
      case "selector-2":
      case "selector-3": {
        const pos = Number(o.position ?? 0);
        const ang = short === "selector-2" ? (pos ? 45 : -45) : pos * 45;
        const labels = short === "selector-2" ? ["0", "I"] : ["I", "0", "II"];
        return `${box()}${label(p.label)}<g class="act" data-action="position" data-kind="cycle" data-options="${short === "selector-2" ? "0,1" : "-1,0,1"}">
          <circle cx="${w / 2}" cy="${h / 2 + 6}" r="20" fill="#2b2f35" stroke="#596270"/>
          <rect x="${w / 2 - 4}" y="${h / 2 - 12}" width="8" height="36" rx="3" fill="#d7dee7" transform="rotate(${ang} ${w / 2} ${h / 2 + 6})"/></g>
          <text class="dev-note" x="${w / 2}" y="${h - 6}">${labels.join(" · ")}</text>${title}`;
      }
      case "limit-switch": {
        const on = !!o.actuated;
        return `${box()}${label(p.source ? `← ${p.source}` : "Fin de carrera")}<g class="act" data-action="actuate" data-kind="momentary">
          <line x1="${w / 2 - 18}" y1="${h / 2 + 18}" x2="${w / 2 + 14}" y2="${h / 2 + (on ? 14 : -4)}" stroke="#d7dee7" stroke-width="4" stroke-linecap="round"/>
          <circle cx="${w / 2 + 16}" cy="${h / 2 + (on ? 14 : -6)}" r="7" fill="${on ? COLORS.amarillo : "#596270"}"/></g>${title}`;
      }
      case "sensor-inductive":
      case "sensor-photoelectric": {
        const det = !!o.detecting;
        const led = o.output ? COLORS.amarillo : o.powered ? "#3b4450" : "#22262b";
        return `${box()}${label(String(p.output).toUpperCase() + " " + String(p.contact).toUpperCase(), 30)}
          <g class="act" data-action="target" data-kind="toggle"><rect x="${w / 2 - 22}" y="${h / 2 - 6}" width="44" height="22" rx="4" fill="${det ? "#596270" : "#2b2f35"}" stroke="#596270"/>
          <text class="dev-note" x="${w / 2}" y="${h / 2 + 9}">${short === "sensor-inductive" ? "metal" : "objeto"}</text></g>
          <circle cx="${w - 12}" cy="12" r="6" fill="${led}"/>${label(short === "sensor-inductive" ? "Inductivo" : "Fotoeléctrico")}${title}`;
      }
      case "lamp": {
        const c = COLORS[p.color] ?? COLORS.verde;
        return `${box()}<circle cx="${w / 2}" cy="${h / 2}" r="20" fill="${o.lit ? c : "#22262b"}" stroke="${c}" stroke-width="2"/>
          ${o.lit ? `<circle cx="${w / 2}" cy="${h / 2}" r="27" fill="none" stroke="${c}" opacity="0.4" stroke-width="3"/>` : ""}
          <path d="M${w / 2 - 13} ${h / 2 - 13} L${w / 2 + 13} ${h / 2 + 13} M${w / 2 + 13} ${h / 2 - 13} L${w / 2 - 13} ${h / 2 + 13}" stroke="#596270" stroke-width="2"/>
          <text class="dev-note" x="${w / 2}" y="${h - 4}">${esc(p.rating)}</text>${title}`;
      }
      case "buzzer":
        return `${box()}<path d="M${w / 2 - 16} ${h / 2 + 10} A16 16 0 0 1 ${w / 2 + 16} ${h / 2 + 10} Z" fill="${o.sounding ? COLORS.amarillo : "#2b2f35"}" stroke="#596270"/>
          ${o.sounding ? `<path class="waves" d="M${w / 2 - 22} ${h / 2 - 14} q22 -14 44 0 M${w / 2 - 28} ${h / 2 - 22} q28 -18 56 0" fill="none" stroke="${COLORS.amarillo}" stroke-width="2"/>` : ""}${title}`;
      case "relay":
      case "contactor": {
        const on = !!o.closed;
        const coil = o.energized ? COLORS.amarillo : "#2b2f35";
        return `${box()}<rect x="6" y="${h / 2 - 14}" width="22" height="28" fill="${coil}" stroke="#596270"/>
          <text class="dev-note" x="17" y="${h / 2 + 30}">A1–A2</text>
          <rect x="40" y="${h / 2 - 9}" width="${w - 50}" height="18" rx="3" fill="${on ? "#2f6d4a" : "#2b2f35"}" stroke="#596270"/>
          <text class="dev-note" x="${w / 2 + 15}" y="${h / 2 + 4}">${on ? "cerrado" : "abierto"}</text>
          ${label(short === "relay" ? "Relé" : "Contactor")}${title}`;
      }
      case "solenoid-valve": {
        const pos = Math.max(0, Math.min(1, Number(o.position ?? 0)));
        const cx = 60;
        return `${box()}<rect x="6" y="${h / 2 - 14}" width="22" height="28" fill="${o.energized ? COLORS.amarillo : "#2b2f35"}" stroke="#596270"/>
          <rect x="${cx}" y="${h / 2 - 16}" width="80" height="32" rx="3" fill="#2b2f35" stroke="#8794a2"/>
          <rect x="${cx + 6 + pos * 50}" y="${h / 2 - 13}" width="10" height="26" fill="#d7dee7"/>
          <rect x="${cx + 16 + pos * 50}" y="${h / 2 - 3}" width="${64}" height="6" fill="#b8bec6"/>
          <text class="dev-note" x="${cx + 40}" y="${h - 6}">${o.extended ? "afuera" : o.retracted ? "adentro" : `${Math.round(pos * 100)} %`}</text>${label("Electroválvula 5/2")}${title}`;
      }
      case "motor": {
        const sp = Number(o.speed ?? 0);
        return `${box()}<circle cx="${w / 2}" cy="${h / 2 + 4}" r="26" fill="${o.running ? "#2f6d4a" : "#2b2f35"}" stroke="#8794a2" stroke-width="2"/>
          <text class="dev-big" x="${w / 2}" y="${h / 2 + 12}">M</text>
          <text class="dev-note" x="${w / 2}" y="${h - 6}">${Math.round(sp * 100)} %</text>${title}`;
      }
      case "power-24vdc":
      case "power-230vac":
        return `${box()}<text class="dev-big" x="${w / 2}" y="${h / 2 - 2}">${short === "power-24vdc" ? "24 VDC" : "230 VAC"}</text>
          <text class="dev-note${st.tripped ? " bad" : ""}" x="${w / 2}" y="${h / 2 + 16}">${st.tripped ? "DISPARADA" : "en servicio"}</text>${title}`;
      default: {
        // Genérico: nombre, salidas y acciones declaradas.
        const def = S.defs.get(dev.type);
        const vals = Object.entries(o).slice(0, 3).map(([k, v], i) => `<text class="dev-note" x="8" y="${44 + i * 13}" text-anchor="start">${esc(k)}: ${esc(typeof v === "number" ? Math.round(v * 100) / 100 : v)}</text>`).join("");
        const acts = (def?.actions ?? []).slice(0, 2).map((a, i) => `<g class="act" data-action="${esc(a.id)}" data-kind="${a.kind === "select" ? "cycle" : a.kind}" data-options="${esc((a.options ?? []).join(","))}"><rect x="${w - 60}" y="${36 + i * 24}" width="52" height="20" rx="4" fill="#2b2f35" stroke="#596270"/><text class="dev-note" x="${w - 34}" y="${50 + i * 24}">${esc(a.label ?? a.id)}</text></g>`).join("");
        return `${box()}${label(def?.name ?? dev.type, 16)}${vals}${acts}${title}`;
      }
    }
  }

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
    const terms = {};
    for (const g of svg.querySelectorAll(".borne")) {
      const u = g.querySelector("use");
      const sig = g.dataset.senal;
      const id = /^Q0_/.test(sig) ? `${sig}.${g.dataset.pos}` : sig;
      terms[id] = [(Number(u.getAttribute("x")) - vx) * k, (Number(u.getAttribute("y")) - vy) * k];
    }
    S.boardTerms = terms;
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

  function termPos(end) {
    const i = end.indexOf(".");
    const dev = devById(end.slice(0, i));
    if (!dev) return null;
    const sym = symbolFor(dev);
    const p = sym.terms[end.slice(i + 1)];
    if (!p) return null;
    return {
      x: (dev.x ?? 0) + p[0],
      y: (dev.y ?? 0) + p[1],
      up: p[1] <= sym.h / 2,
      box: { x1: dev.x ?? 0, y1: dev.y ?? 0, x2: (dev.x ?? 0) + sym.w, y2: (dev.y ?? 0) + sym.h },
    };
  }

  // Color de un borne según su polo: L+ rojo, M azul, L marrón, N celeste.
  function poleColor(term, poles) {
    const i = term.indexOf(".");
    const dev = devById(term.slice(0, i));
    const t = term.slice(i + 1);
    if (dev?.type === "jwsim/power-24vdc") return t === "L+" ? "rojo" : "azul";
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

  function astar(from, to, dir0, dirEnd, boxes, occ, ends, bounds) {
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
    while (heap.length && n++ < 60000) {
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
        if (!goal && blocked(x, y)) continue;
        const seg = d < 2 ? `h${Math.min(x, c.x)},${y}` : `v${x},${Math.min(y, c.y)}`;
        const others = occ.get(seg);
        let g = c.g + 1 + (d !== c.d ? BEND : 0) + (others && !others.some((e) => ends.has(e)) ? SHARED : 0);
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

  function route(w, ctx) {
    const a = termPos(w.from);
    const b = termPos(w.to);
    if (!a || !b) return null;
    const s1 = { x: a.x, y: a.y + (a.up ? -GRID : GRID) };
    const s2 = { x: b.x, y: b.y + (b.up ? -GRID : GRID) };
    let mid = null;
    let ym;
    if (w.points?.length) {
      ym = w.points[0][1];
      mid = [s1, { x: s1.x, y: ym }, { x: s2.x, y: ym }, s2];
    } else if (ctx) {
      const g = (p) => ({ x: Math.round(p.x / GRID), y: Math.round(p.y / GRID) });
      mid = astar(g(s1), g(s2), dirOf(a, s1), dirOf(s2, b), ctx.boxes, ctx.occ, new Set([w.from, w.to]), ctx.bounds);
    }
    if (!mid) {
      ym = a.up && b.up ? Math.min(s1.y, s2.y) : !a.up && !b.up ? Math.max(s1.y, s2.y) : snap((s1.y + s2.y) / 2);
      mid = [s1, { x: s1.x, y: ym }, { x: s2.x, y: ym }, s2];
    }
    const pts = [a, ...mid, b];
    // Sin puntos repetidos ni intermedios alineados.
    const out = [];
    for (const p of pts) {
      if (out.length && out.at(-1).x === p.x && out.at(-1).y === p.y) continue;
      if (out.length >= 2) {
        const [q, r] = out.slice(-2);
        if ((q.x === r.x && r.x === p.x) || (q.y === r.y && r.y === p.y)) out.pop();
      }
      out.push(p);
    }
    // Registra los tramos (para los cables siguientes) con los bornes del cable.
    if (ctx) {
      for (let i = 1; i < out.length; i++) {
        const [p, q] = [out[i - 1], out[i]];
        const steps = Math.round(Math.hypot(q.x - p.x, q.y - p.y) / GRID);
        for (let j = 0; j < steps; j++) {
          const x = Math.round(p.x / GRID) + (j * Math.sign(q.x - p.x));
          const y = Math.round(p.y / GRID) + (j * Math.sign(q.y - p.y));
          const seg = p.y === q.y ? `h${Math.min(x, x + Math.sign(q.x - p.x))},${y}` : `v${x},${Math.min(y, y + Math.sign(q.y - p.y))}`;
          if (!ctx.occ.has(seg)) ctx.occ.set(seg, []);
          ctx.occ.get(seg).push(w.from, w.to);
        }
      }
    }
    if (ym === undefined) ym = out.length > 3 ? out[2].y : s1.y;
    return { pts: out, a, b, s1, s2, ym };
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
    // Durante un arrastre se usa el trazado simple (rápido); al soltar, A*.
    // Los recorridos se recalculan solo si cambió la geometría (no con cada
    // instantánea de la simulación).
    const dragging = !!S.drag?.moved;
    const layout = JSON.stringify([S.spec.devices.map((d) => [d.id, d.type, d.x, d.y]), S.spec.wiring.map((w) => [w.from, w.to, w.points])]);
    if (dragging || S.routeKey !== layout) {
      const ctx = dragging ? null : routeContext();
      S.routes = S.spec.wiring.map((w) => route(w, ctx));
      S.routeKey = dragging ? null : layout;
    }
    S.spec.wiring.forEach((w, i) => {
      const r = S.routes[i];
      if (!r) return;
      const d = roundedPath(r.pts);
      const sel = S.sel?.kind === "wire" && S.sel.id === i;
      const c = WIRE_COLORS[wireColorName(w)] ?? WIRE_COLORS.negro;
      const live = wireLive(w);
      // Casquillo en cada punta (un tramo corto sobre la salida del borne).
      const ferrule = (p, s) => `<line class="wire-ferrule" x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${p.y + Math.sign(s.y - p.y) * 9}"/>`;
      g.insertAdjacentHTML(
        "beforeend",
        `<g class="wire${sel ? " selected" : ""}${live ? " live" : ""}" data-wire="${i}" data-color="${esc(wireColorName(w))}">` +
          `<path class="wire-hit" d="${d}"/>` +
          (live ? `<path class="wire-glow" d="${d}"/>` : "") +
          `<path class="wire-outline" d="${d}" stroke="${shade(c, 0.45)}"/>` +
          `<path class="wire-core" d="${d}" stroke="${c}"/>` +
          `<path class="wire-shine" d="${d}"/>` +
          ferrule(r.a, r.s1) + ferrule(r.b, r.s2) +
          `<title>${esc(w.from)} — ${esc(w.to)}</title></g>`,
      );
    });
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
    const st = out(dev.id);
    const sig = JSON.stringify([st.outputs, st.contacts, st.damaged, st.tripped, dev.params, S.running]);
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
        const [x, y] = sym.terms[`I0_${k}`] ?? [];
        if (x !== undefined) html += `<circle cx="${x}" cy="${y + 70 * S.board.k}" r="4" class="${st.outputs?.[`I0_${k}`] ? "led on" : "led"}"/>`;
        const [qx, qy] = sym.terms[`Q0_${k}.1`] ?? [];
        const [qx2] = sym.terms[`Q0_${k}.2`] ?? [];
        if (qx !== undefined) html += `<circle cx="${(qx + qx2) / 2}" cy="${qy - 80 * S.board.k}" r="4" class="${st.contacts?.[`Q0_${k}`] ? "led on" : "led"}"/>`;
      }
      const plcWired = S.spec.wiring.some((w) => w.from.startsWith(`${dev.id}.`) || w.to.startsWith(`${dev.id}.`));
      if (plcWired && st.outputs && st.outputs.powered === false && S.snap) html += `<text class="dev-note bad" x="${sym.w / 2}" y="-8">sin 24 VDC en 24VDC/M0</text>`;
      leds.innerHTML = html;
    } else {
      g.innerHTML = body(dev, sym);
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
    for (const [id, [x, y]] of Object.entries(sym.terms)) {
      const up = y <= sym.h / 2;
      // En la placa el borne es el tornillo del SVG: el círculo es invisible
      // (solo resalta al pasar el mouse).
      th += `<g class="term${sym.board ? " on-board" : ""}" data-term="${esc(`${dev.id}.${id}`)}"><circle cx="${x}" cy="${y}" r="${sym.board ? 26 * S.board.k : 5}"/>`;
      if (!sym.board) th += `<text x="${x}" y="${up ? y - 8 : y + 15}">${esc(id)}</text>`;
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
        html += `</div><p class="insp-desc">Actual: ${esc(cur)}. Arrastre el cable para mover su tramo horizontal.</p>`;
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

  function wirePointer() {
    const svg = $("scene-svg");
    svg.addEventListener("pointerdown", (e) => {
      const term = e.target.closest(".term");
      const actEl = e.target.closest(".act");
      const devEl = e.target.closest(".dev");
      // (los bornes están en #scene-terms, fuera del grupo del dispositivo)
      const wireEl = e.target.closest(".wire");
      const w = toWorld(e);
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
        S.sel = { kind: "wire", id: i };
        if (!S.running) {
          S.drag = { kind: "wire", i, moved: false };
          svg.setPointerCapture(e.pointerId);
        }
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
      if (S.drag.kind === "pan") {
        S.pan = { x: e.clientX - S.drag.x, y: e.clientY - S.drag.y };
        $("scene-root").setAttribute("transform", `translate(${S.pan.x} ${S.pan.y}) scale(${S.zoom})`);
      } else if (S.drag.kind === "wire") {
        // Mueve el tramo horizontal del cable (queda en la grilla).
        const wire = S.spec.wiring[S.drag.i];
        const r = route(wire);
        const ym = snap(w.y);
        if (r && ym !== r.ym) {
          wire.points = [[r.s1.x, ym], [r.s2.x, ym]];
          S.drag.moved = true;
          renderWires();
        }
      } else {
        S.drag.dev.x = snap(w.x - S.drag.dx);
        S.drag.dev.y = snap(w.y - S.drag.dy);
        S.drag.moved = true;
        renderDevice(S.drag.dev);
        renderWires();
      }
    });
    svg.addEventListener("pointerup", () => {
      const moved = S.drag?.moved;
      if (moved) S.dirty = true;
      S.drag = null;
      if (moved) renderWires();
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
    populatePalette();
    wirePointer();
    for (const b of document.querySelectorAll("#board-view .seg")) b.addEventListener("click", () => setView(b.dataset.view));
    $("scene-fit").addEventListener("click", fit);
    $("scene-rearm").addEventListener("click", () => api.sceneRearm());
    api.onSceneSnapshot((snap) => {
      S.snap = snap;
      render();
    });
    api.onDisplay(() => requestAnimationFrame(copyTft));
    new ResizeObserver(() => S.view === "scene" && !S.fitted && fit()).observe($("scene-svg"));
  }

  init();
})();
