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
  const CW = 340; // ancho de cada columna cilindro + válvula
  const X0 = 340; // primera columna (a la izquierda van el compresor y la FR)
  const STROKE = 120;
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
      else if (d.type === "jwsim/limit-switch" && String(p.source ?? "") === `${valveId}.position`) list.push({ id: d.id, end: Number(p.min ?? 1) >= 0.5 ? 1 : 0, out: "actuated" });
    }
    return list;
  }
  // Nombre del cilindro: la letra de sus finales (A0/A1 → A) o el id de la válvula.
  function cylName(sens, v) {
    const l = sens.map((s) => /^([A-Z])\d$/.exec(s.id)?.[1]).find(Boolean);
    return l ? `Cilindro ${l}` : v.params?.label ? String(v.params.label) : `Cilindro ${v.id}`;
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
  const exhaust = (x, y) => `<path class="pn-sym" d="M${x} ${y}v10M${x - 6} ${y + 10}h12l-6 9z"/>`;
  const blocked = (x, y, up) => `<path class="pn-sym" d="M${x} ${y}v${up ? -9 : 9}M${x - 5} ${y + (up ? -9 : 9)}h10"/>`;
  const arrow = (x1, y1, x2, y2) => `<line class="pn-flow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#pn-arrow)"/>`;

  // Válvula 5/2: la casilla de la izquierda (lado de la bobina) es P→A, B→S;
  // la de la derecha (resorte o segunda bobina) P→B, A→R. La corredera se
  // desplaza para que la casilla activa quede frente a las conexiones.
  function valve(vc, y, v, o, act) {
    const bi = v.type === "jwsim/solenoid-valve-2";
    const box = (x, a) =>
      `<rect class="pn-box" x="${x}" y="${y}" width="44" height="44"/>` +
      (a
        ? arrow(x + 22, y + 44, x + 11, y + 3) + arrow(x + 33, y, x + 38, y + 41) + blocked(x + 6, y + 44, true)
        : arrow(x + 22, y + 44, x + 33, y + 3) + arrow(x + 11, y, x + 6, y + 41) + blocked(x + 38, y + 44, true));
    const coilL = bi ? !!o?.coilPlus : !!o?.energized;
    const coilR = bi && !!o?.coilMinus;
    const sol = (x, on, label) =>
      `<g class="pn-sol${on ? " on" : ""}"><rect x="${x}" y="${y + 11}" width="14" height="22"/><line x1="${x}" y1="${y + 33}" x2="${x + 14}" y2="${y + 11}"/></g>` +
      `<text class="pn-label" x="${x + 7}" y="${y + 50}" text-anchor="middle">${esc(label)}</text>`;
    const spring = (x) => `<path class="pn-sym" d="M${x} ${y + 22}l4 -8l6 16l6 -16l6 16l4 -8"/>`;
    const shift = act ? 44 : 0;
    return (
      `<g class="pn-spool" transform="translate(${shift} 0)">` +
      box(vc - 66, true) +
      box(vc - 22, false) +
      sol(vc - 80, coilL, bi ? `${v.id}+` : v.id) +
      (bi ? sol(vc + 22, coilR, `${v.id}−`) : spring(vc + 22)) +
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
    // ---- alimentación: compresor → tanque → FR → colector (abajo a la izquierda)
    const yM = 290; // colector
    const yS = 420; // línea de la alimentación
    const co = comp && outOf(comp.id);
    const pc = co ? co.pressure : comp ? Number(comp.params?.start ?? 8) : NaN;
    const fo = fr && outOf(fr.id);
    const pf = fo ? fo.pressure : fr ? Math.min(Number(fr.params?.setpoint ?? 6), Number.isFinite(pc) ? pc : 99) : NaN;
    const supply = fr ? pf : comp ? pc : 6;
    const sOn = supply >= MIN_BAR;
    const gauge = (x, y, v, label) =>
      `<circle class="pn-gauge" cx="${x}" cy="${y - 34}" r="11"/><path class="pn-sym" d="M${x - 6} ${y - 29}L${x + 6} ${y - 40}"/><line class="pn-sym" x1="${x}" y1="${y - 23}" x2="${x}" y2="${y - 18}"/>` +
      `<text class="pn-val" x="${x + 16}" y="${y - 38}">${fmt(v)} bar</text>${label ? `<text class="pn-port" x="${x + 16}" y="${y - 26}">${label}</text>` : ""}`;
    let xOut = 160; // de dónde sale el aire hacia el colector
    if (comp) {
      const on = !!co?.running;
      s +=
        `<g class="pn-dev${on ? " run" : ""}"><circle cx="60" cy="${yS}" r="18" class="pn-box"/><path class="pn-fill" d="M60 ${yS - 15}l12 22h-24z"/>` +
        `<line class="pn-sym" x1="60" y1="${yS + 18}" x2="60" y2="${yS + 33}"/><circle cx="60" cy="${yS + 46}" r="13" class="pn-box"/><text class="pn-m" x="60" y="${yS + 51}" text-anchor="middle">M</text></g>` +
        `<text class="pn-label" x="60" y="${yS + 78}" text-anchor="middle">${esc(comp.id)} · ${on ? "en marcha" : "parado"}</text>`;
      s += line([[78, yS], [110, yS]], pc > 0.2);
      s += `<rect class="pn-box" x="110" y="${yS - 16}" width="44" height="32" rx="12"/><text class="pn-label" x="132" y="${yS + 32}" text-anchor="middle">tanque</text>`;
      s += `<line class="pn-sym" x1="132" y1="${yS - 16}" x2="132" y2="${yS - 18}"/>` + gauge(132, yS, pc, "");
      s += line([[154, yS], [fr ? 200 : 260, yS], ...(fr ? [] : [[260, yM], [X0 - 40, yM]])], pc >= MIN_BAR);
      xOut = 260;
    }
    if (fr) {
      const x = 200;
      s +=
        `<rect class="pn-frame" x="${x}" y="${yS - 22}" width="76" height="44"/>` +
        `<path class="pn-box" d="M${x + 18} ${yS - 13}l12 13l-12 13l-12 -13z"/><line class="pn-sym" x1="${x + 8}" y1="${yS}" x2="${x + 28}" y2="${yS}" stroke-dasharray="3 2"/>` +
        `<rect class="pn-box" x="${x + 40}" y="${yS - 13}" width="24" height="26"/><line class="pn-flow" x1="${x + 52}" y1="${yS + 11}" x2="${x + 52}" y2="${yS - 10}" marker-end="url(#pn-arrow)"/>` +
        `<text class="pn-label" x="${x + 38}" y="${yS + 38}" text-anchor="middle">${esc(fr.id)} · filtro-regulador</text>` +
        `<line class="pn-sym" x1="${x + 52}" y1="${yS - 22}" x2="${x + 52}" y2="${yS - 18}"/>` +
        gauge(x + 52, yS, pf, "regulada");
      if (!comp) s += line([[x - 30, yS], [x, yS]], sOn) + `<circle class="pn-box" cx="${x - 36}" cy="${yS}" r="6"/><circle class="pn-fill" cx="${x - 36}" cy="${yS}" r="2.5"/>`;
      s += line([[x + 76, yS], [x + 100, yS], [x + 100, yM], [X0 - 40, yM]], sOn);
      xOut = x + 100;
    } else if (!comp) {
      // Aire de red ideal: fuente de presión.
      s += `<circle class="pn-box" cx="${xOut}" cy="${yM}" r="9"/><circle cx="${xOut}" cy="${yM}" r="3" class="pn-fill"/><text class="pn-label" x="${xOut - 20}" y="${yM - 16}">aire de red · 6 bar</text>`;
      s += line([[xOut + 9, yM], [X0 - 40, yM]], true);
    }
    // ---- colector y columnas
    const lastVc = X0 + (vs.length - 1) * CW + 75;
    s += line([[X0 - 40, yM], [lastVc, yM]], sOn);
    vs.forEach((v, i) => {
      const x0 = X0 + i * CW;
      const vc = x0 + 75;
      const o = outOf(v.id);
      const bi = v.type === "jwsim/solenoid-valve-2";
      const act = o ? (bi ? !!o.spoolA : !!o.energized) : bi ? v.params?.start === "afuera" : false;
      const pos = o && Number.isFinite(o.position) ? o.position : act ? 1 : 0;
      const moving = !!o && pos > 0.001 && pos < 0.999;
      const air = airOf(sp, v);
      const on = air >= MIN_BAR;
      const aOn = on && act;
      const bOn = on && !act;
      const yV = 170;
      // Cilindro de doble efecto.
      const px = x0 + 6 + pos * STROKE;
      s +=
        `<rect class="pn-chamber${aOn ? " on" : ""}" x="${x0 + 3}" y="43" width="${px - x0 - 3}" height="34"/>` +
        `<rect class="pn-chamber${bOn ? " on" : ""}" x="${px + 10}" y="43" width="${x0 + 147 - px - 10}" height="34"/>` +
        `<rect class="pn-cyl" x="${x0}" y="40" width="150" height="40"/>` +
        `<rect class="pn-piston" x="${px}" y="42" width="10" height="36"/>` +
        `<rect class="pn-rod" x="${px + 10}" y="56" width="154" height="8"/>` +
        `<text class="pn-name" x="${x0}" y="28">${esc(cylName(sensorsOf(sp, v.id), v))}</text>`;
      // Finales de carrera en el vástago.
      for (const se of sensorsOf(sp, v.id)) {
        const tx = x0 + 170 + se.end * STROKE;
        const lit = !!outOf(se.id)?.[se.out];
        s += `<g class="pn-ls${lit ? " on" : ""}"><line x1="${tx}" y1="84" x2="${tx}" y2="100"/><circle cx="${tx}" cy="104" r="4"/><text x="${tx}" y="118" text-anchor="middle">${esc(se.id)}</text></g>`;
      }
      // Tuberías A (al fondo: sale) y B (al frente: entra).
      s += line([[vc - 11, yV], [vc - 11, 130], [x0 + 20, 130], [x0 + 20, 80]], aOn, moving && aOn ? "flow" : moving && !aOn ? "vent" : "");
      s += line([[vc + 11, yV], [vc + 11, 145], [x0 + 130, 145], [x0 + 130, 80]], bOn, moving && bOn ? "flow" : moving && !bOn ? "vent" : "");
      s += `<text class="pn-port" x="${vc - 20}" y="${yV - 4}">4</text><text class="pn-port" x="${vc + 14}" y="${yV - 4}">2</text>`;
      // Válvula, alimentación (1) y escapes (5 y 3).
      s += valve(vc, yV, v, o, act);
      s += line([[vc, yV + 44], [vc, yM]], on);
      s += exhaust(vc - 16, yV + 44) + exhaust(vc + 16, yV + 44);
      s += `<text class="pn-port" x="${vc + 3}" y="${yV + 58}">1</text>`;
      s += `<text class="pn-label" x="${vc + 34}" y="${yV + 70}">${esc(v.id)} · 5/2 ${bi ? "biestable" : "monoestable"}</text>`;
      if (running && !on) s += `<text class="pn-warn" x="${x0}" y="${yV + 88}">sin presión (${fmt(air)} bar)</text>`;
    });
    const w = X0 + vs.length * CW;
    P.vb ??= [0, 0, w, 520];
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
    svg.setAttribute("viewBox", (P.vb ?? [0, 0, 1000, 520]).join(" "));
  }

  function fit() {
    const sp = spec();
    const n = Math.max(1, valvesOf(sp).length);
    P.vb = [0, 0, X0 + n * CW, 520];
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
