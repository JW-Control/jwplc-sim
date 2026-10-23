// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Símbolos de los dispositivos de la escena (G7), con aspecto de equipo de
// tablero: módulos claros con tornillos Phillips rotulados, la cara frontal
// del equipo (botón, lente, perilla, ventana del contactor) y su estado.
//
// Cada símbolo tiene un tamaño en múltiplos de la grilla (20 px) y sus bornes
// sobre el borde superior o inferior, también en la grilla: ese punto es la
// entrada del cable (el cable entra a la bornera; el tornillo queda adentro,
// a SCREW_INSET del borde).
"use strict";

(() => {
  const GRID = 20;
  const SCREW_INSET = 14;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const snap = (v) => Math.round(v / GRID) * GRID;
  const LENS = { verde: "#2fd05a", rojo: "#ff3b30", amarillo: "#ffcc00", azul: "#2f8cff", blanco: "#f5f7fa", negro: "#2b2f35" };
  const ink = "#1b1e22";
  const face = "#e4e7eb";
  const face2 = "#cfd4da";

  // Bornes repartidos sobre la grilla.
  const row = (ids, w) => {
    const n = ids.length;
    const step = n > 1 ? Math.max(GRID, Math.floor((w - 2 * GRID) / (n - 1) / GRID) * GRID) : 0;
    const x0 = snap((w - step * (n - 1)) / 2);
    return ids.map((id, i) => [id, x0 + i * step]);
  };

  // Disposición: [ancho, alto, bornes arriba, bornes abajo, rótulos].
  const LAYOUT = {
    "pushbutton-no": [60, 100, ["13"], ["14"]],
    "pushbutton-nc": [60, 100, ["11"], ["12"]],
    "selector-2": [80, 100, ["13", "21"], ["14", "22"]],
    "selector-3": [80, 100, ["13", "23"], ["14", "24"]],
    "limit-switch": [80, 100, ["13", "21"], ["14", "22"]],
    "sensor-inductive": [100, 100, ["BN", "BU"], ["BK"]],
    "sensor-photoelectric": [100, 100, ["BN", "BU"], ["BK"]],
    lamp: [60, 100, ["X1"], ["X2"]],
    buzzer: [60, 100, ["+"], ["-"]],
    relay: [120, 140, ["A1", "11", "21"], ["A2", "12", "14", "22", "24"]],
    contactor: [160, 160, ["1", "3", "5", "13", "21", "A1"], ["2", "4", "6", "14", "22", "A2"]],
    "solenoid-valve": [200, 100, ["A1"], ["A2"]],
    motor: [120, 120, ["U1", "U2"], []],
    "power-24vdc": [100, 120, [], ["L+", "M"]],
    "power-230vac": [80, 120, [], ["L", "N"]],
  };
  // Segunda línea del rótulo (más chica): función del borne.
  const SUBLABELS = {
    contactor: { 1: "L1", 3: "L2", 5: "L3", 2: "T1", 4: "T2", 6: "T3", 13: "NO", 14: "NO", 21: "NC", 22: "NC" },
    relay: { 11: "COM", 21: "COM", 12: "NC", 14: "NO", 22: "NC", 24: "NO" },
    "sensor-inductive": { BN: "+", BU: "0V", BK: "OUT" },
    "sensor-photoelectric": { BN: "+", BU: "0V", BK: "OUT" },
  };

  /** Disposición de un tipo: tamaño y bornes { id: { x, y, side } } (y = borde: entrada del cable). */
  function layout(type, def) {
    const short = type.split("/")[1];
    let [w, h, top, bottom] = type.startsWith("jwsim/") && LAYOUT[short] ? LAYOUT[short] : [];
    if (!w) {
      // Dispositivo de terceros: módulo genérico con los bornes repartidos.
      const ids = (def?.terminals ?? []).map((t) => t.id);
      top = ids.slice(0, Math.ceil(ids.length / 2));
      bottom = ids.slice(top.length);
      w = Math.max(120, (Math.max(top.length, bottom.length) + 1) * GRID);
      h = 120;
    }
    const terms = {};
    if (short === "solenoid-valve") {
      terms.A1 = { x: GRID, y: 0, side: "t" };
      terms.A2 = { x: 2 * GRID, y: 0, side: "t" };
      return { w, h, terms };
    }
    for (const [id, x] of row(top, w)) terms[id] = { x, y: 0, side: "t" };
    for (const [id, x] of row(bottom, w)) terms[id] = { x, y: h, side: "b" };
    return { w, h, terms };
  }

  /** Tornillo Phillips (centro x, y). */
  const screw = (x, y, r = 8) =>
    `<circle cx="${x}" cy="${y}" r="${r + 2}" fill="${face2}" stroke="${ink}" stroke-width="1"/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#f4f5f7" stroke="${ink}" stroke-width="1.4"/>` +
    `<path d="M${x - r * 0.55} ${y}H${x + r * 0.55}M${x} ${y - r * 0.55}V${y + r * 0.55}" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;

  /** Bornes: entrada (ranura en el borde), tornillo y rótulo. */
  function terminals(type, lay) {
    const short = type.split("/")[1];
    const sub = SUBLABELS[short] ?? {};
    let s = "";
    for (const [id, t] of Object.entries(lay.terms)) {
      const top = t.side === "t";
      const sy = top ? t.y + SCREW_INSET : t.y - SCREW_INSET;
      // Ranura de entrada del cable en el borde.
      s += `<rect x="${t.x - 5}" y="${top ? t.y : t.y - 4}" width="10" height="4" fill="${ink}" opacity="0.75"/>`;
      s += screw(t.x, sy);
      s += `<text class="sym-term" x="${t.x}" y="${top ? sy + 18 : sy - 12}">${esc(id)}</text>`;
      if (sub[id]) s += `<text class="sym-sub" x="${t.x}" y="${top ? sy + 25 : sy - 19}">${esc(sub[id])}</text>`;
    }
    return s;
  }

  const module = (w, h, fill = face, extra = "") =>
    `<rect class="dev-box" x="0" y="0" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${ink}" stroke-width="1.6" ${extra}/>`;
  const band = (w, y, h, fill = face2) => `<rect x="1" y="${y}" width="${w - 2}" height="${h}" fill="${fill}"/>`;
  const brand = (x, y, txt = "JW Sim") => `<text class="sym-brand" x="${x}" y="${y}">${esc(txt)}</text>`;
  const led = (x, y, on, color = "#2fd05a") =>
    `<circle cx="${x}" cy="${y}" r="4" fill="${on ? color : "#59606a"}" stroke="${ink}" stroke-width="1"/>` +
    (on ? `<circle cx="${x}" cy="${y}" r="8" fill="${color}" opacity="0.3"/>` : "");

  /**
   * Cuerpo del dispositivo según su estado.
   * @param {string} type
   * @param {{w:number,h:number,terms:object}} lay
   * @param {{outputs:object, contacts:object, damaged:string[], tripped:boolean}} st
   * @param {Record<string, any>} p parámetros
   * @param {object} def definición (para genéricos)
   */
  function draw(type, lay, st, p, def) {
    const o = st.outputs ?? {};
    const { w, h } = lay;
    const short = type.startsWith("jwsim/") ? type.split("/")[1] : "";
    const dmg = st.damaged?.length ? `<text class="sym-bad" x="${w / 2}" y="${h / 2}">QUEMADO</text>` : "";
    const cx = w / 2;
    const cy = h / 2;
    switch (short) {
      case "pushbutton-no":
      case "pushbutton-nc": {
        const c = LENS[p.color] ?? LENS.verde;
        const pr = !!o.pressed;
        return (
          module(w, h) + band(w, 30, 40, "#3a3f46") + terminals(type, lay) +
          `<g class="act" data-action="press" data-kind="momentary">` +
          `<circle cx="${cx}" cy="${cy}" r="17" fill="#2b2f35" stroke="${ink}" stroke-width="1.5"/>` +
          `<circle cx="${cx}" cy="${cy + (pr ? 1.5 : 0)}" r="${pr ? 11.5 : 13}" fill="${c}" stroke="${ink}" stroke-width="1"/>` +
          `<ellipse cx="${cx - 4}" cy="${cy - 5}" rx="5" ry="3" fill="#fff" opacity="${pr ? 0.15 : 0.35}"/></g>` +
          `<text class="sym-tag" x="${cx}" y="${h - 30}">${short.endsWith("no") ? "NA" : "NC"}</text>`
        );
      }
      case "selector-2":
      case "selector-3": {
        const pos = Number(o.position ?? 0);
        const ang = short === "selector-2" ? (pos ? 45 : -45) : pos * 45;
        const labels = short === "selector-2" ? ["0", "I"] : ["I", "0", "II"];
        const marks = short === "selector-2" ? [-45, 45] : [-45, 0, 45];
        return (
          module(w, h) + band(w, 28, 44, "#3a3f46") + terminals(type, lay) +
          marks.map((a, i) => {
            const r = (a - 90) * (Math.PI / 180);
            return `<text class="sym-dial" x="${cx + Math.cos(r) * 24}" y="${cy + 3 + Math.sin(r) * 24}">${labels[i]}</text>`;
          }).join("") +
          `<g class="act" data-action="position" data-kind="cycle" data-options="${short === "selector-2" ? "0,1" : "-1,0,1"}">` +
          `<circle cx="${cx}" cy="${cy}" r="15" fill="#15171a" stroke="#8a9099" stroke-width="2"/>` +
          `<rect x="${cx - 3.5}" y="${cy - 13}" width="7" height="20" rx="2" fill="#f2f4f7" transform="rotate(${ang} ${cx} ${cy})"/></g>`
        );
      }
      case "limit-switch": {
        const on = !!o.actuated;
        return (
          module(w, h, "#f0c63a") + terminals(type, lay) +
          `<g class="act" data-action="actuate" data-kind="momentary">` +
          `<rect x="${cx - 16}" y="${cy - 10}" width="32" height="20" rx="3" fill="#3a3f46" stroke="${ink}"/>` +
          `<line x1="${cx}" y1="${cy - 4}" x2="${cx + (on ? 10 : 18)}" y2="${cy - (on ? 14 : 20)}" stroke="#c9ced5" stroke-width="4" stroke-linecap="round"/>` +
          `<circle cx="${cx + (on ? 10 : 18)}" cy="${cy - (on ? 14 : 20)}" r="6" fill="${on ? "#ff9f1a" : "#8a9099"}" stroke="${ink}"/></g>` +
          (p.source ? `<text class="sym-tag" x="${cx}" y="${h - 32}">← ${esc(p.source)}</text>` : "")
        );
      }
      case "sensor-inductive":
      case "sensor-photoelectric": {
        const ind = short === "sensor-inductive";
        const det = !!o.detecting;
        const out = !!o.output;
        const tip = ind ? "#2f6fd0" : "#d33a2c";
        const y = cy - 2;
        return (
          module(w, h, "#2b2f35") + terminals(type, lay).replaceAll('class="sym-term"', 'class="sym-term light"') +
          // Cuerpo cilíndrico roscado (M18) con el frente activo a la derecha.
          `<rect x="14" y="${y - 9}" width="58" height="18" rx="3" fill="#b9bfc7" stroke="${ink}"/>` +
          Array.from({ length: 9 }, (_, i) => `<line x1="${20 + i * 6}" y1="${y - 9}" x2="${20 + i * 6}" y2="${y + 9}" stroke="#8a9099" stroke-width="1"/>`).join("") +
          `<rect x="72" y="${y - 8}" width="10" height="16" rx="2" fill="${tip}" stroke="${ink}"/>` +
          led(18, y - 15, out, "#ffb020") +
          (ind ? "" : `<path d="M82 ${y} L98 ${y - 9} L98 ${y + 9} Z" fill="${det ? "#ff5d5d" : "#ff9a9a"}" opacity="0.35"/>`) +
          `<g class="act" data-action="target" data-kind="toggle"><rect x="${w - 22}" y="${y + 14}" width="18" height="14" rx="2" fill="${det ? "#c9ced5" : "#3a3f46"}" stroke="#8a9099"/>` +
          `<text class="sym-tag light" x="${w - 13}" y="${y + 24}">${det ? "◼" : "□"}</text></g>` +
          `<text class="sym-tag light" x="${cx - 8}" y="${y + 24}">${esc(String(p.output).toUpperCase())} ${esc(String(p.contact).toUpperCase())}</text>`
        );
      }
      case "lamp": {
        const c = LENS[p.color] ?? LENS.verde;
        const lit = !!o.lit;
        return (
          module(w, h) + band(w, 28, 44, "#3a3f46") + terminals(type, lay) +
          (lit ? `<circle cx="${cx}" cy="${cy}" r="22" fill="${c}" opacity="0.35"/>` : "") +
          `<circle cx="${cx}" cy="${cy}" r="16" fill="#9aa1aa" stroke="${ink}"/>` +
          `<circle cx="${cx}" cy="${cy}" r="12" fill="${lit ? c : c}" opacity="${lit ? 1 : 0.35}" stroke="${ink}"/>` +
          `<ellipse cx="${cx - 4}" cy="${cy - 4}" rx="4" ry="2.5" fill="#fff" opacity="0.45"/>` +
          `<text class="sym-tag" x="${cx}" y="${h - 30}">${esc(p.rating)}</text>` + dmg
        );
      }
      case "buzzer": {
        const on = !!o.sounding;
        return (
          module(w, h) + terminals(type, lay) +
          `<circle cx="${cx}" cy="${cy}" r="17" fill="#15171a" stroke="${ink}"/>` +
          [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, 0]].map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="2" fill="#59606a"/>`).join("") +
          (on ? `<path d="M${cx + 20} ${cy - 10} q6 10 0 20 M${cx - 20} ${cy - 10} q-6 10 0 20" fill="none" stroke="#ffb020" stroke-width="2"/>` : "") + dmg
        );
      }
      case "relay": {
        const on = !!o.closed;
        return (
          // Base enchufable (oscura) con el relé encima (cubierta clara).
          module(w, h, "#2b2f35") + terminals(type, lay).replaceAll('class="sym-term"', 'class="sym-term light"') +
          `<rect x="14" y="44" width="${w - 28}" height="52" rx="4" fill="#d9dde2" stroke="${ink}"/>` +
          `<rect x="22" y="52" width="${w - 44}" height="16" rx="2" fill="#f4f5f7" stroke="#8a9099"/>` +
          `<text class="sym-tag" x="${cx}" y="63">${esc(p.coil)}</text>` +
          led(28, 84, !!o.energized, "#ff3b30") +
          `<rect x="${cx - 6}" y="76" width="34" height="12" rx="2" fill="${on ? "#2f6d4a" : "#59606a"}"/>` +
          `<text class="sym-tag light" x="${cx + 11}" y="85">${on ? "ON" : "OFF"}</text>` + dmg
        );
      }
      case "contactor": {
        const on = !!o.closed;
        return (
          module(w, h) + band(w, 30, 6) + band(w, h - 36, 6) + terminals(type, lay) +
          brand(16, 48) +
          `<text class="sym-tag" x="${w - 18}" y="48">${esc(p.coil)}</text>` +
          // Ventana del portacontactos: baja al atraer.
          `<rect x="${cx - 34}" y="${cy - 10}" width="68" height="34" rx="3" fill="#1d2025" stroke="${ink}"/>` +
          `<rect x="${cx - 28}" y="${cy - 6 + (on ? 12 : 0)}" width="56" height="12" rx="2" fill="${on ? "#37d67a" : "#f4f5f7"}"/>` +
          `<text class="sym-tag light" x="${cx}" y="${cy + 34}">${on ? "I" : "O"}</text>` +
          led(cx + 46, cy + 7, !!o.energized, "#ff3b30") + dmg
        );
      }
      case "solenoid-valve": {
        const pos = Math.max(0, Math.min(1, Number(o.position ?? 0)));
        const x0 = 70;
        return (
          `<rect class="dev-box" x="0" y="0" width="60" height="${h}" rx="5" fill="#2b2f35" stroke="${ink}" stroke-width="1.6"/>` +
          terminals(type, lay).replaceAll('class="sym-term"', 'class="sym-term light"') +
          `<rect x="10" y="44" width="40" height="34" rx="3" fill="${o.energized ? "#ffb020" : "#59606a"}" stroke="${ink}"/>` +
          `<text class="sym-tag light" x="30" y="${h - 6}">Y 5/2</text>` +
          // Cilindro de doble efecto.
          `<rect x="${x0}" y="${cy - 16}" width="90" height="32" rx="6" fill="#d9dde2" stroke="${ink}" stroke-width="1.6"/>` +
          `<rect x="${x0 + 6 + pos * 60}" y="${cy - 13}" width="10" height="26" fill="#59606a"/>` +
          `<rect x="${x0 + 16 + pos * 60}" y="${cy - 3}" width="${54}" height="6" fill="#aeb4bc" stroke="${ink}" stroke-width="0.8"/>` +
          `<text class="sym-tag" x="${x0 + 45}" y="${cy + 30}">${o.extended ? "afuera" : o.retracted ? "adentro" : `${Math.round(pos * 100)} %`}</text>` + dmg
        );
      }
      case "motor": {
        const sp = Number(o.speed ?? 0);
        const run = !!o.running;
        return (
          // Caja de bornes arriba, carcasa con aletas y eje.
          `<rect class="dev-box" x="4" y="0" width="112" height="34" rx="4" fill="${face}" stroke="${ink}" stroke-width="1.6"/>` +
          terminals(type, lay) +
          `<rect x="6" y="36" width="96" height="70" rx="12" fill="#5b7fa6" stroke="${ink}" stroke-width="1.6"/>` +
          Array.from({ length: 6 }, (_, i) => `<line x1="14" y1="${44 + i * 11}" x2="94" y2="${44 + i * 11}" stroke="#4a6a8d" stroke-width="2"/>`).join("") +
          `<rect x="102" y="64" width="16" height="12" fill="#aeb4bc" stroke="${ink}"/>` +
          `<circle cx="54" cy="71" r="16" fill="#1d2025" stroke="${ink}"/>` +
          `<text class="sym-big light" x="54" y="77">M</text>` +
          (run ? `<path class="spin" d="M54 55 A16 16 0 0 1 70 71" fill="none" stroke="#37d67a" stroke-width="3" style="transform-origin:54px 71px;animation-duration:${(1 / Math.max(0.1, Math.abs(sp))).toFixed(2)}s;animation-direction:${sp < 0 ? "reverse" : "normal"}"/>` : "") +
          `<text class="sym-tag" x="60" y="${h - 2}">${Math.round(sp * 100)} %</text>` + dmg
        );
      }
      case "power-24vdc": {
        const ok = !st.tripped;
        return (
          module(w, h) + band(w, 6, 22, "#3a3f46") + terminals(type, lay) +
          `<text class="sym-big light" x="${cx}" y="22">24 V DC</text>` +
          led(18, 46, ok, "#37d67a") + `<text class="sym-tag" x="44" y="49">DC OK</text>` +
          (ok ? "" : `<text class="sym-bad" x="${cx}" y="70">DISPARADA</text>`) +
          `<rect x="${lay.terms["L+"].x - 9}" y="${h - 46}" width="18" height="5" fill="#e0392b"/>` +
          `<rect x="${lay.terms.M.x - 9}" y="${h - 46}" width="18" height="5" fill="#2f62d6"/>`
        );
      }
      case "power-230vac": {
        const ok = !st.tripped;
        // Bornes de alimentación: fase (gris) y neutro (azul).
        return (
          `<rect class="dev-box" x="0" y="0" width="${w / 2}" height="${h}" rx="4" fill="#9aa1aa" stroke="${ink}" stroke-width="1.6"/>` +
          `<rect x="${w / 2}" y="0" width="${w / 2}" height="${h}" rx="4" fill="#3d72c4" stroke="${ink}" stroke-width="1.6"/>` +
          terminals(type, lay) +
          `<text class="sym-big" x="${w / 4}" y="28">L</text><text class="sym-big light" x="${(3 * w) / 4}" y="28">N</text>` +
          `<text class="sym-tag" x="${cx}" y="56">230 VAC</text>` +
          (ok ? "" : `<text class="sym-bad" x="${cx}" y="72">DISPARADA</text>`)
        );
      }
      default: {
        // Genérico (dispositivos del SDK sin símbolo propio).
        const vals = Object.entries(o).slice(0, 3)
          .map(([k, v], i) => `<text class="sym-tag" x="10" y="${48 + i * 12}" text-anchor="start">${esc(k)}: ${esc(typeof v === "number" ? Math.round(v * 100) / 100 : v)}</text>`).join("");
        const acts = (def?.actions ?? []).slice(0, 2)
          .map((a, i) => `<g class="act" data-action="${esc(a.id)}" data-kind="${a.kind === "select" ? "cycle" : a.kind}" data-options="${esc((a.options ?? []).join(","))}"><rect x="${w - 56}" y="${40 + i * 22}" width="48" height="18" rx="3" fill="#3a3f46"/><text class="sym-tag light" x="${w - 32}" y="${52 + i * 22}">${esc(a.label ?? a.id)}</text></g>`).join("");
        return module(w, h) + terminals(type, lay) + `<text class="sym-tag" x="${cx}" y="34">${esc(def?.name ?? type)}</text>` + vals + acts + dmg;
      }
    }
  }

  window.JwsimSymbols = { GRID, SCREW_INSET, layout, draw };
})();
