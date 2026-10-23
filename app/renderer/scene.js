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

  const BOARD_SCALE = 0.5;
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
    boardTerms: {}, // borne -> [x, y] en la placa escalada
    drag: null,
    wiring: null, // { from, x, y }
    rendered: new Map(), // id -> firma del estado dibujado
    analyzeTimer: null,
  };

  // ------------------------------------------------------------ símbolos
  // Cada símbolo: tamaño, posición de los bornes y cuerpo según el estado.
  // Bornes "t" (arriba) o "b" (abajo) para orientar el cable al salir.
  const row = (ids, y, w) => Object.fromEntries(ids.map((id, i) => [id, [Math.round(((i + 1) * w) / (ids.length + 1)), y]]));

  function symbolFor(dev) {
    const t = dev.type;
    const short = t.split("/")[1];
    if (t === "jwsim/jwplc-basic") return { w: 970 * BOARD_SCALE, h: 1065 * BOARD_SCALE, terms: S.boardTerms, board: true };
    const sizes = {
      "pushbutton-no": [64, 96, ["13"], ["14"]],
      "pushbutton-nc": [64, 96, ["11"], ["12"]],
      "selector-2": [80, 96, ["13", "21"], ["14", "22"]],
      "selector-3": [80, 96, ["13", "23"], ["14", "24"]],
      "limit-switch": [80, 96, ["13", "21"], ["14", "22"]],
      "sensor-inductive": [84, 96, ["BN", "BU"], ["BK"]],
      "sensor-photoelectric": [84, 96, ["BN", "BU"], ["BK"]],
      lamp: [64, 90, ["X1"], ["X2"]],
      buzzer: [64, 90, ["+"], ["-"]],
      relay: [140, 104, ["A1", "11", "21"], ["A2", "12", "14", "22", "24"]],
      contactor: [170, 104, ["A1", "1", "3", "5", "13", "21"], ["A2", "2", "4", "6", "14", "22"]],
      "solenoid-valve": [190, 90, ["A1"], ["A2"]],
      motor: [96, 100, ["U1", "U2"], []],
      "power-24vdc": [110, 70, [], ["L+", "M"]],
      "power-230vac": [110, 70, [], ["L", "N"]],
    };
    let [w, h, top, bottom] = t.startsWith("jwsim/") && sizes[short] ? sizes[short] : [];
    if (!w) {
      // Dispositivo de terceros: caja genérica con los bornes repartidos.
      const ids = (S.defs.get(t)?.terminals ?? []).map((x) => x.id);
      top = ids.slice(0, Math.ceil(ids.length / 2));
      bottom = ids.slice(top.length);
      w = Math.max(110, Math.max(top.length, bottom.length) * 30 + 20);
      h = 96;
    }
    if (short === "solenoid-valve") return { w, h, terms: { A1: [16, 0], A2: [16, h] } };
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
    const [vx, vy] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    const terms = {};
    for (const g of svg.querySelectorAll(".borne")) {
      const u = g.querySelector("use");
      const sig = g.dataset.senal;
      const id = /^Q0_/.test(sig) ? `${sig}.${g.dataset.pos}` : sig;
      terms[id] = [(Number(u.getAttribute("x")) - vx) * BOARD_SCALE, (Number(u.getAttribute("y")) - vy) * BOARD_SCALE];
    }
    S.boardTerms = terms;
    svg.setAttribute("width", String(970 * BOARD_SCALE));
    svg.setAttribute("height", String(1065 * BOARD_SCALE));
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
    return { x: (dev.x ?? 0) + p[0], y: (dev.y ?? 0) + p[1], up: p[1] <= sym.h / 2 };
  }

  function wireColor(w) {
    const poles = S.snap?.poles?.[w.from] ?? [];
    for (const m of poles) {
      const src = devById(m.replace(/[+-]$/, "").split(".")[0]);
      const ac = src?.type === "jwsim/power-230vac";
      if (m.endsWith("+")) return ac ? "#c0703a" : "#ff5d5d";
      if (m.endsWith("-")) return ac ? "#6cb6ff" : "#3e7bfa";
    }
    return "#6b7480";
  }

  function wirePath(a, b) {
    const s1 = { x: a.x, y: a.y + (a.up ? -14 : 14) };
    const s2 = { x: b.x, y: b.y + (b.up ? -14 : 14) };
    return `M${a.x} ${a.y} L${s1.x} ${s1.y} L${s2.x} ${s1.y} L${s2.x} ${s2.y} L${b.x} ${b.y}`;
  }

  function renderWires() {
    const g = $("scene-wires");
    g.textContent = "";
    S.spec.wiring.forEach((w, i) => {
      const a = termPos(w.from);
      const b = termPos(w.to);
      if (!a || !b) return;
      const d = wirePath(a, b);
      const sel = S.sel?.kind === "wire" && S.sel.id === i;
      const color = wireColor(w);
      g.insertAdjacentHTML(
        "beforeend",
        `<g class="wire${sel ? " selected" : ""}" data-wire="${i}"><path class="wire-hit" d="${d}"/><path class="wire-line" d="${d}" stroke="${color}"/><title>${esc(w.from)} — ${esc(w.to)}</title></g>`,
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
        if (x !== undefined) html += `<circle cx="${x}" cy="${y - 16}" r="4" class="${st.outputs?.[`I0_${k}`] ? "led on" : "led"}"/>`;
        const [qx, qy] = sym.terms[`Q0_${k}.1`] ?? [];
        if (qx !== undefined) html += `<circle cx="${qx + 10}" cy="${qy + 16}" r="4" class="${st.contacts?.[`Q0_${k}`] ? "led on" : "led"}"/>`;
      }
      if (st.outputs && st.outputs.powered === false && S.snap) html += `<text class="dev-note bad" x="${sym.w / 2}" y="-8">sin 24 VDC en 24VDC/M0</text>`;
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
      th += `<g class="term" data-term="${esc(`${dev.id}.${id}`)}"><circle cx="${x}" cy="${y}" r="${sym.board ? 6 : 5}"/>`;
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
      if (w) html += `<div class="insp-title">Cable</div><p class="insp-desc">${esc(w.from)} — ${esc(w.to)}</p><button class="small" id="scene-del" ${S.running ? "disabled" : ""}>Quitar cable</button>`;
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
    S.spec.devices.push({ id, type, version: def?.version, params: {}, x: Math.round(x), y: Math.round(y) });
    S.sel = { kind: "device", id };
    changed();
    return id;
  }

  function addWire(from, to) {
    if (from === to || from.split(".")[0] === to.split(".")[0] && from === to) return false;
    if (S.spec.wiring.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) return false;
    S.spec.wiring.push({ from, to });
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
    render(true);
  }

  function cleanSpec() {
    return {
      devices: S.spec.devices.map(({ id, type, version, params, x, y }) => ({ id, type, ...(version ? { version } : {}), ...(params && Object.keys(params).length ? { params } : {}), x: x ?? 0, y: y ?? 0 })),
      wiring: S.spec.wiring.map(({ from, to }) => ({ from, to })),
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
        S.sel = { kind: "wire", id: Number(wireEl.dataset.wire) };
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
      } else {
        S.drag.dev.x = Math.round((w.x - S.drag.dx) / 5) * 5;
        S.drag.dev.y = Math.round((w.y - S.drag.dy) / 5) * 5;
        S.drag.moved = true;
        renderDevice(S.drag.dev);
        renderWires();
      }
    });
    svg.addEventListener("pointerup", () => {
      if (S.drag?.moved) S.dirty = true;
      S.drag = null;
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
      wireColor: (i) => document.querySelector(`.wire[data-wire="${i}"] .wire-line`)?.getAttribute("stroke") ?? null,
      // Punto medio del cable en pantalla (para hacer clic sobre él).
      wirePoint: (i) => {
        const path = document.querySelector(`.wire[data-wire="${i}"] .wire-line`);
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
