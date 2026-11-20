// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Esquema neumático (ISO 1219-1) generado de la escena, al estilo de los
// simuladores de neumática: compresor, unidad de mantenimiento, una válvula
// 5/2 por cilindro y los finales de carrera en el vástago. Con la simulación
// corriendo se ve la corredera conmutar, las líneas con presión (azul oscuro)
// y sin presión (celeste), el aire que circula y el vástago que se mueve.
// Es una vista: se edita en «A colores» (la escena sigue siendo una sola).
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const VALVES = new Set(["jwsim/solenoid-valve", "jwsim/solenoid-valve-2"]);
  const MIN_BAR = 1.5; // como scene/devices/pneumatics.mjs
  const CW = 330; // ancho de cada columna cilindro + válvula
  const X0 = 260; // primera columna (a la izquierda van la fuente y unidad de mantenimiento)
  const STROKE = 84;
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1).replace(".", ",") : "—");

  const P = { shown: false, snap: null, html: "", vb: null, drag: null };

  const outOf = (id) => P.snap?.devices.find((d) => d.id === id)?.outputs ?? null;
  const spec = () => window.JwsimScene?.specForView?.() ?? { devices: [], wiring: [] };
  const valvesOf = (sp) => sp.devices.filter((d) => VALVES.has(d.type));
  const has = () => valvesOf(spec()).length > 0;

  // Finales de carrera de un cilindro: final de rodillo con «Detecta = Y1.position»
  // o magnético con «Cilindro = Y1». end: 0 retraído, 1 extendido.
  function sensorsOf(sp, valveId) {
    const list = [];
    for (const d of sp.devices) {
      const p = d.params ?? {};
      if (d.type === "jwsim/sensor-cylinder" && p.cylinder === valveId) list.push({ id: d.id, end: p.end === "extendido" ? 1 : 0, out: "detecting" });
      else if (d.type === "jwsim/limit-switch" && String(p.source ?? "") === `${valveId}.position`) {
        const min = Number(p.min ?? 1);
        const max = Number(p.max ?? min);
        list.push({ id: d.id, end: Math.max(0, Math.min(1, (min + max) / 2)), out: "actuated" });
      }
    }
    return list;
  }
  function cylLetter(sens, idx) {
    const l = sens.map((s) => /^([A-Z])\d+$/.exec(s.id)?.[1]).find(Boolean);
    return l || String.fromCharCode(65 + (idx % 26));
  }
  function cylTitle(v, letter) {
    const custom = String(v.params?.label ?? "").trim();
    return custom ? `${custom} (${v.id})` : `Cilindro ${letter} · ${v.id}`;
  }

  // Presión del aire de cada válvula (bar): la de su FR o compresor; sin aire
  // indicado, aire ideal a 6 bar.
  function airOf(sp, v) {
    const air = String(v.params?.air ?? "");
    const src = air && sp.devices.find((d) => d.id === air);
    const o = outOf(v.id);
    if (o && Number.isFinite(o.pressure)) return o.pressure;
    if (src) {
      const so = outOf(src.id);
      if (so && Number.isFinite(so.pressure)) return so.pressure;
      return src.type === "jwsim/service-unit" ? Number(src.params?.setpoint ?? 6) : Number(src.params?.start ?? 8);
    }
    return 6;
  }

  const line = (pts, on, cls = "") => `<polyline class="pn-line${on ? " on" : ""}${cls ? ` ${cls}` : ""}" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
  const portRing = (x, y, r = 2.8) => `<circle class="pn-port-ring" cx="${x}" cy="${y}" r="${r}"/>`;
  const exhaust = (x, y) => `<path class="pn-box" d="M${x - 5} ${y}h10l-5 9z"/>` + portRing(x, y + 3.2, 2);
  const blocked = (x, y, up) => `<path class="pn-sym" d="M${x} ${y}v${up ? -8 : 8}M${x - 4.5} ${y + (up ? -8 : 8)}h9"/>`;
  const arrow = (x1, y1, x2, y2) => `<line class="pn-flow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#pn-arrow)"/>`;

  // Regla graduada superior estilo FluidSIM sobre el recorrido del vástago.
  function strokeRuler(xR0, yR, sens) {
    if (!sens.length) return "";
    const xR1 = xR0 + STROKE;
    let ticks = `M${xR0} ${yR}H${xR1}`;
    for (let k = 0; k <= 10; k++) {
      const tx = Math.round((xR0 + (k / 10) * STROKE) * 10) / 10;
      const h = k === 0 || k === 10 ? 13 : k === 5 ? 10 : 7;
      ticks += `M${tx} ${yR}V${yR + h}`;
    }
    let s = `<path class="pn-ruler" d="${ticks}"/>`;
    for (const se of sens) {
      const tx = xR0 + se.end * STROKE;
      const lit = !!outOf(se.id)?.[se.out];
      s +=
        `<g class="pn-ls${lit ? " on" : ""}">` +
        `<text x="${tx}" y="${yR + 27}" text-anchor="middle">${esc(se.id)}</text>` +
        `<line x1="${tx}" y1="${yR + 33}" x2="${tx}" y2="${yR + 42}"/>` +
        `<circle cx="${tx}" cy="${yR + 43}" r="2.4"/>` +
        `</g>`;
    }
    return s;
  }

  // Cilindro de doble efecto ISO 1219-1 con imán permanente y amortiguación regulable.
  function cylinderIso(x0, yC, pos, aOn, bOn) {
    const px = x0 + 8 + pos * STROKE;
    const xA = x0 + 12;
    const xB = x0 + 124;
    return (
      `<rect class="pn-chamber${aOn ? " on" : ""}" x="${x0 + 2}" y="${yC + 2}" width="${Math.max(0, px - x0 - 2)}" height="40"/>` +
      `<rect class="pn-chamber${bOn ? " on" : ""}" x="${px + 22}" y="${yC + 2}" width="${Math.max(0, x0 + 134 - px - 22)}" height="40"/>` +
      `<rect class="pn-cyl" x="${x0}" y="${yC}" width="136" height="44"/>` +
      `<g transform="translate(${px} ${yC})">` +
      `<rect class="pn-cush" x="0" y="13" width="5" height="18"/>` +
      `<rect class="pn-piston" x="5" y="1" width="12" height="42"/>` +
      `<path class="pn-magnet" d="M7 7h8v7h-4v16h4v7h-8z"/>` +
      `<rect class="pn-cush" x="17" y="13" width="5" height="18"/>` +
      `<rect class="pn-rod" x="22" y="17" width="136" height="10"/>` +
      arrow(3, 50, 19, -8) +
      `</g>` +
      `<line class="pn-sym" x1="${xA}" y1="${yC + 44}" x2="${xA}" y2="${yC + 58}"/>` +
      `<line class="pn-sym" x1="${xB}" y1="${yC + 44}" x2="${xB}" y2="${yC + 58}"/>` +
      portRing(xA, yC + 54) +
      portRing(xB, yC + 54)
    );
  }

  // Válvula 5/2 ISO 1219-1: casilla izquierda (1→4, 2→3, 5 cerrado), casilla
  // derecha (1→2, 4→5, 3 cerrado). Pilotajes horizontales a los costados.
  function valve(vc, y, v, o, act, letter) {
    const bi = v.type === "jwsim/solenoid-valve-2";
    const box = (x, a) =>
      `<rect class="pn-box" x="${x}" y="${y}" width="44" height="34"/>` +
      (a
        ? arrow(x + 22, y + 34, x + 11, y + 2) + arrow(x + 33, y, x + 33, y + 32) + blocked(x + 11, y + 34, true)
        : arrow(x + 11, y, x + 11, y + 32) + arrow(x + 22, y + 34, x + 33, y + 2) + blocked(x + 33, y + 34, true));
    const coilL = bi ? !!o?.coilPlus : !!o?.energized;
    const coilR = bi && !!o?.coilMinus;
    const sol = (x, on, label, side) => {
      const rx = side === "l" ? x : x + 26;
      const tx = side === "l" ? x - 9 : x + 35;
      const anc = side === "l" ? "end" : "start";
      const sx1 = side === "l" ? x + 9 : x + 17;
      const sx2 = side === "l" ? x + 16 : x + 10;
      return (
        `<g class="pn-sol${on ? " on" : ""}"><rect x="${x}" y="${y + 18}" width="26" height="16"/><line x1="${sx1}" y1="${y + 34}" x2="${sx2}" y2="${y + 18}"/></g>` +
        portRing(rx, y + 26) +
        `<text class="pn-pilot-lbl" x="${tx}" y="${y + 30}" text-anchor="${anc}">${esc(label)}</text>`
      );
    };
    const spring = (x) => `<path class="pn-sym" d="M${x} ${y + 26}l4 -7l5 14l5 -14l5 14l4 -7"/>`;
    const shift = act ? 44 : 0;
    const lblL = bi ? `${letter}+` : `${letter}+`;
    const lblR = `${letter}-`;
    return (
      `<g class="pn-spool" transform="translate(${shift} 0)">` +
      box(vc - 66, true) +
      box(vc - 22, false) +
      sol(vc - 92, coilL, lblL, "l") +
      (bi ? sol(vc + 22, coilR, lblR, "r") : spring(vc + 22)) +
      `</g>`
    );
  }

  function build() {
    const sp = spec();
    const vs = valvesOf(sp);
    if (!vs.length) return `<text class="pn-empty" x="20" y="40">La escena no tiene electroválvulas con cilindro.</text>`;
    const comp = sp.devices.find((d) => d.type === "jwsim/compressor");
    const fr = sp.devices.find((d) => d.type === "jwsim/service-unit");
    const running = !!P.snap;
    let s = "";
    // ---- alimentación estilo FluidSIM: triángulo ISO (compresor) → unidad de mantenimiento → colector
    const yM = 316; // línea principal del colector
    const co = comp && outOf(comp.id);
    const pc = co ? co.pressure : comp ? Number(comp.params?.start ?? 8) : NaN;
    const fo = fr && outOf(fr.id);
    const pf = fo ? fo.pressure : fr ? Math.min(Number(fr.params?.setpoint ?? 6), Number.isFinite(pc) ? pc : 99) : NaN;
    const supply = fr ? pf : comp ? pc : 6;
    const sOn = supply >= MIN_BAR;

    const xSrc = 44;
    const xFr = 78;
    const wFr = 68;
    // Triángulo ISO 1219-1 de fuente de aire comprimido + tubería a la unidad de mantenimiento.
    s +=
      line([[xSrc, yM + 26], [xSrc, yM], [xFr, yM]], sOn) +
      `<path class="pn-box" d="M${xSrc} ${yM + 26}l10 18h-20z"/>` +
      (comp ? `<text class="pn-port" x="${xSrc}" y="${yM + 56}" text-anchor="middle">${esc(comp.id)}</text>` : "");
    // Unidad de mantenimiento simplificada ISO (filtro punteado + purga + manómetro).
    s +=
      `<rect class="pn-box" x="${xFr}" y="${yM - 16}" width="${wFr}" height="32"/>` +
      `<line class="pn-sym" x1="${xFr + 10}" y1="${yM - 16}" x2="${xFr + 10}" y2="${yM + 16}" stroke-dasharray="3 2"/>` +
      `<line class="pn-flow" x1="${xFr + 10}" y1="${yM + 16}" x2="${xFr + 10}" y2="${yM + 25}" marker-end="url(#pn-arrow)"/>` +
      `<circle class="pn-gauge" cx="${xFr + 38}" cy="${yM}" r="10.5"/>` +
      `<line class="pn-flow" x1="${xFr + 44}" y1="${yM + 6}" x2="${xFr + 32}" y2="${yM - 6}" marker-end="url(#pn-arrow)"/>` +
      `<text class="pn-val" x="${xFr + 34}" y="${yM - 22}" text-anchor="middle">${fmt(supply)} bar</text>` +
      (fr ? `<text class="pn-port" x="${xFr + 34}" y="${yM + 30}" text-anchor="middle">${esc(fr.id)}</text>` : "");

    // ---- colector principal y columnas de cilindros
    const lastVc = X0 + (vs.length - 1) * CW + 68;
    s += line([[xFr + wFr, yM], [lastVc, yM]], sOn);

    vs.forEach((v, i) => {
      const x0 = X0 + i * CW;
      const vc = x0 + 68;
      const o = outOf(v.id);
      const bi = v.type === "jwsim/solenoid-valve-2";
      const act = o ? (bi ? !!o.spoolA : !!o.energized) : bi ? v.params?.start === "afuera" : false;
      const pos = o && Number.isFinite(o.position) ? o.position : act ? 1 : 0;
      const moving = !!o && pos > 0.001 && pos < 0.999;
      const air = airOf(sp, v);
      const on = air >= MIN_BAR;
      const aOn = on && act;
      const bOn = on && !act;
      const sens = sensorsOf(sp, v.id);
      const letter = cylLetter(sens, i);
      const yC = 76;
      const yV = 194;
      const xA = x0 + 12;
      const xB = x0 + 124;

      // 1. Regla graduada superior y marcas de posición (A0, A1...).
      s += strokeRuler(x0 + 166, 18, sens);

      // 2. Tuberías 4 → toma trasera y 2 → toma delantera (con quiebre en Z).
      s += line([[vc - 11, yV], [vc - 11, 148], [xA, 148], [xA, yC + 58]], aOn, moving && aOn ? "flow" : moving && !aOn ? "vent" : "");
      s += line([[vc + 11, yV], [vc + 11, 148], [xB, 148], [xB, yC + 58]], bOn, moving && bOn ? "flow" : moving && !bOn ? "vent" : "");
      s += portRing(vc - 11, yV - 14) + portRing(vc + 11, yV - 14);
      s += `<text class="pn-port" x="${vc - 26}" y="${yV - 10}">4</text><text class="pn-port" x="${vc + 19}" y="${yV - 10}">2</text>`;

      // 3. Cilindro ISO 1219-1 con émbolo magnético, amortiguación y rótulo de identificación.
      s += `<text class="pn-name" x="${x0}" y="${yC - 22}">${esc(cylTitle(v, letter))}</text>`;
      s += cylinderIso(x0, yC, pos, aOn, bOn);

      // 4. Válvula 5/2, escapes (5 y 3), alimentación (1) y nodo en T sobre el colector.
      s += line([[vc, yV + 34], [vc, yM]], on);
      s += valve(vc, yV, v, o, act, letter);
      s += exhaust(vc - 11, yV + 34) + exhaust(vc + 11, yV + 34);
      s += portRing(vc, yV + 47);
      s += `<text class="pn-port" x="${vc - 25}" y="${yV + 48}">5</text><text class="pn-port" x="${vc + 18}" y="${yV + 48}">3</text>`;
      s += `<text class="pn-port" x="${vc + 10}" y="${yV + 62}">1</text>`;
      if (i < vs.length - 1) s += `<circle class="pn-junction" cx="${vc}" cy="${yM}" r="3.8"/>`;
      if (running && !on) s += `<text class="pn-warn" x="${x0}" y="${yV + 80}">sin presión (${fmt(air)} bar)</text>`;
    });
    const w = X0 + vs.length * CW + 40;
    P.vb ??= [0, 0, w, 400];
    return s;
  }

  function draw() {
    if (!P.shown) return;
    const g = $("pn-root");
    const html = build();
    if (html !== P.html) {
      P.html = html;
      g.innerHTML = html;
    }
    const svg = $("pn-svg");
    svg.setAttribute("viewBox", (P.vb ?? [0, 0, 1000, 400]).join(" "));
  }

  function fit() {
    const sp = spec();
    const n = Math.max(1, valvesOf(sp).length);
    P.vb = [0, 0, X0 + n * CW + 40, 400];
    draw();
  }

  function setup() {
    const svg = $("pn-svg");
    if (!svg || svg.dataset.ready) return;
    svg.dataset.ready = "1";
    svg.innerHTML =
      `<defs><marker id="pn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>` +
      `<g id="pn-root"></g>`;
    // Zoom con la rueda y arrastre: cambian el viewBox.
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const [x, y, w, h] = P.vb;
        const k = e.deltaY < 0 ? 1 / 1.15 : 1.15;
        const sx = Math.min(w / r.width, h / r.height);
        // Punto bajo el puntero (preserveAspectRatio xMidYMid meet).
        const ox = x + (e.clientX - r.left - (r.width - w / sx) / 2) * sx;
        const oy = y + (e.clientY - r.top - (r.height - h / sx) / 2) * sx;
        P.vb = [ox - (ox - x) * k, oy - (oy - y) * k, w * k, h * k];
        svg.setAttribute("viewBox", P.vb.join(" "));
      },
      { passive: false },
    );
    svg.addEventListener("pointerdown", (e) => {
      P.drag = { x: e.clientX, y: e.clientY, vb: [...P.vb] };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!P.drag) return;
      const r = svg.getBoundingClientRect();
      const [x, y, w, h] = P.drag.vb;
      const sx = Math.max(w / r.width, h / r.height);
      P.vb = [x - (e.clientX - P.drag.x) * sx, y - (e.clientY - P.drag.y) * sx, w, h];
      svg.setAttribute("viewBox", P.vb.join(" "));
    });
    const end = () => (P.drag = null);
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    $("pn-fit")?.addEventListener("click", fit);
  }

  window.JwsimPneu = {
    available: has,
    show(on) {
      setup();
      P.shown = !!on;
      $("pn-view").hidden = !on;
      document.body.dataset.schem = on ? "pneu" : "color";
      if (on) {
        P.html = "";
        if (!P.vb) fit();
        else draw();
      }
    },
    shown: () => P.shown,
    onSnapshot(snap) {
      P.snap = snap;
      // Al agregar o quitar la última electroválvula cambia si se puede elegir la vista.
      const can = has();
      if (can !== P.can) {
        P.can = can;
        window.JwsimTabs?.refreshSchem?.();
      }
      draw();
    },
    onSpec() {
      P.vb = null;
      P.html = "";
      P.can = has();
      window.JwsimTabs?.refreshSchem?.();
      if (P.shown) fit();
    },
    // Para las pruebas.
    debug: () => ({ shown: P.shown, html: P.html.length, cylinders: document.querySelectorAll("#pn-root .pn-cyl").length }),
  };
})();
