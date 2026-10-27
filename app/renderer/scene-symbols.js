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
    "motor-1ph": [160, 140, ["U1", "U2", "Z1", "Z2", "PE"], []],
    "motor-3ph": [160, 140, ["U1", "V1", "W1", "PE"], []],
    "motor-2v": [200, 140, ["1U", "1V", "1W", "2U", "2V", "2W", "PE"], []],
    "overload-relay": [160, 160, ["1", "3", "5", "95", "97"], ["2", "4", "6", "96", "98"]],
    "vfd-el": [580, 220, ["R", "S", "PE"], ["RA", "RB", "RC", "+24V", "MI2", "MI1", "MI4", "MI3", "MI6", "MI5", "DCM", "SG+", "SG-", "U", "V", "W"]],
    "power-24vdc": [100, 120, [], ["+V1", "-V1"]],
    "power-230vac": [80, 120, [], ["L", "N"]],
  };
  // Segunda línea del rótulo (más chica): función del borne.
  const SUBLABELS = {
    contactor: { 1: "L1", 3: "L2", 5: "L3", 2: "T1", 4: "T2", 6: "T3", 13: "NO", 14: "NO", 21: "NC", 22: "NC" },
    relay: { 11: "COM", 21: "COM", 12: "NC", 14: "NO", 22: "NC", 24: "NO" },
    "sensor-inductive": { BN: "+", BU: "0V", BK: "OUT" },
    "sensor-photoelectric": { BN: "+", BU: "0V", BK: "OUT" },
  };

  // ------------------------------------------------------------ plantillas .svg
  // Un símbolo puede venir de un archivo .svg (assets/devices/<nombre>.svg o
  // symbol.svg de un dispositivo instalado) con el contrato de docs/SIMBOLOS.md:
  // tamaño en múltiplos de 20, bornes marcados con .jw-term (data-term) y
  // partes que dependen del estado con data-show, data-fill, data-text,
  // data-translate, data-rotate y data-action. Si el archivo no cumple el
  // contrato se usa el símbolo dibujado en código.
  const templates = new Map();
  const warnings = [];
  const spins = new Map(); // ángulo de cada data-spin por dispositivo

  /**
   * Placa de bornes de un motor trifásico (U1 V1 W1 arriba, W2 U2 V2 abajo)
   * con las chapas de la conexión: triángulo (verticales), estrella (una
   * horizontal abajo) o «6 cables» (sin chapas). Como en los esquemas de
   * taller: bobinado U rojo, V azul y W magenta.
   */
  function motorBornera(mode, { x = 0, y = 0, w = 120, h = 90 } = {}) {
    const cols = [x + w * 0.2, x + w * 0.5, x + w * 0.8];
    const yt = y + h * 0.3, yb = y + h * 0.75, r = Math.min(w, h) * 0.075;
    const top = ["U1", "V1", "W1"], bot = ["W2", "U2", "V2"];
    const dot = { U1: "#e0392b", U2: "#e0392b", V1: "#2f62d6", V2: "#2f62d6", W1: "#c03bd0", W2: "#c03bd0" };
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#c9ced5" stroke="#2a3a8a" stroke-width="${Math.max(1, r * 0.45)}"/>`;
    const plate = "#f0b7a0";
    if (mode === "triangulo") for (const c of cols) s += `<rect x="${c - r * 1.6}" y="${yt - r * 1.6}" width="${r * 3.2}" height="${yb - yt + r * 3.2}" rx="${r * 1.6}" fill="${plate}" stroke="#8a4b33" stroke-width="${r * 0.25}"/>`;
    if (mode === "estrella") s += `<rect x="${cols[0] - r * 1.6}" y="${yb - r * 1.6}" width="${cols[2] - cols[0] + r * 3.2}" height="${r * 3.2}" rx="${r * 1.6}" fill="${plate}" stroke="#8a4b33" stroke-width="${r * 0.25}"/>`;
    const stud = (cx, cy, t) =>
      `<circle cx="${cx}" cy="${cy}" r="${r * 1.25}" fill="#e8c63a" stroke="#6b5a12" stroke-width="${r * 0.2}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="${dot[t]}"/>`;
    top.forEach((t, i) => (s += stud(cols[i], yt, t)));
    bot.forEach((t, i) => (s += stud(cols[i], yb, t)));
    if (h >= 60) {
      const fs = Math.max(7, h * 0.11);
      top.forEach((t, i) => (s += `<text x="${cols[i] - r * 1.4}" y="${yt - r * 1.9}" font-size="${fs}" text-anchor="end" fill="#1b1e22" font-family="sans-serif">${t}</text>`));
      bot.forEach((t, i) => (s += `<text x="${cols[i] - r * 1.4}" y="${yb + r * 1.9 + fs * 0.8}" font-size="${fs}" text-anchor="end" fill="#1b1e22" font-family="sans-serif">${t}</text>`));
    }
    return s;
  }

  function registerTemplate(type, text) {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    const bad = (m) => {
      warnings.push(`${type}: ${m}`);
      console.warn(`[símbolos] ${type}: ${m}`);
    };
    if (svg.nodeName !== "svg" || doc.querySelector("parsererror")) return bad("no es un SVG válido");
    const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0) return bad('viewBox debe ser "0 0 ancho alto"');
    const [, , w, h] = vb;
    if (w % GRID || h % GRID) return bad(`ancho y alto deben ser múltiplos de ${GRID} (${w} × ${h})`);
    // Sin scripts ni eventos en línea: el archivo solo dibuja. Una <image> solo
    // puede traer su contenido incrustado (p. ej. el logo oficial en PNG).
    for (const el of svg.querySelectorAll("script, foreignObject")) el.remove();
    for (const el of svg.querySelectorAll("image")) {
      const href = el.getAttribute("href") ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
      if (!/^data:image\/(png|jpeg|svg\+xml)[;,]/i.test(href)) el.remove();
    }
    for (const el of svg.querySelectorAll("*")) {
      for (const at of [...el.attributes]) if (/^on/i.test(at.name) || /javascript:/i.test(at.value)) el.removeAttribute(at.name);
    }
    const terms = {};
    for (const t of svg.querySelectorAll(".jw-term")) {
      const id = t.getAttribute("data-term");
      const x = Number(t.getAttribute("cx"));
      const y = Number(t.getAttribute("cy"));
      if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return bad("cada .jw-term necesita data-term, cx y cy");
      if (x % GRID) return bad(`el borne ${id} debe tener cx múltiplo de ${GRID} (tiene ${x})`);
      const side = (t.getAttribute("data-side") ?? (y < h / 2 ? "t" : "b")) === "b" ? "b" : "t";
      terms[id] = { x, y: side === "t" ? 0 : h, side, screw: y };
    }
    if (!Object.keys(terms).length) return bad("no marca ningún borne (.jw-term)");
    templates.set(type, { w, h, terms, svg, animated: !!svg.querySelector("[data-spin]") });
  }

  // Valor de una expresión del contrato: out.<salida>, param.<parámetro>,
  // contact.<contacto>, damaged, tripped; con "!" niega, "=v" compara y
  // "a|b" toma b si a no tiene valor (p. ej. out.distance|param.distance:
  // la salida con la simulación en marcha, el parámetro en edición).
  function valueOf(expr, ctx) {
    if (expr.includes("|")) {
      for (const e of expr.split("|")) {
        const v = valueOf(e, ctx);
        if (v !== undefined) return v;
      }
      return undefined;
    }
    // Comparación numérica: "out.serpentin>0.05", "out.tMasa<20".
    const num = expr.match(/^(!?)([^<>]+)([<>])(-?[\d.]+)$/);
    if (num) {
      const v = Number(valueOf(num[2], ctx));
      const r = num[3] === ">" ? v > Number(num[4]) : v < Number(num[4]);
      return num[1] ? !r : r;
    }
    const [path, cmp] = expr.split("=");
    const [ns, key] = path.replace(/^!/, "").split(".");
    let v =
      ns === "out" ? ctx.o[key] : ns === "param" ? ctx.p[key] : ns === "contact" ? ctx.st.contacts?.[key] :
      ns === "damaged" ? !!ctx.st.damaged?.length : ns === "tripped" ? !!ctx.st.tripped :
      // wired.<borne>: hay un cable en ese borne (sin cable: sin valor, para "a|b").
      ns === "wired" ? (ctx.wired.has(key) ? true : undefined) : undefined;
    if (cmp !== undefined) v = String(v) === cmp;
    return path.startsWith("!") ? !v : v;
  }

  // Escala por tramos: los valores vs (crecientes) caen en las posiciones ps.
  const nums = (s) => s.split(",").map(Number);
  function piecewise(vs, ps, v) {
    if (v <= vs[0]) return ps[0];
    for (let i = 1; i < vs.length; i++) {
      if (v <= vs[i]) return ps[i - 1] + ((v - vs[i - 1]) / (vs[i] - vs[i - 1] || 1)) * (ps[i] - ps[i - 1]);
    }
    return ps[ps.length - 1];
  }

  // data-drag="eje:px0:px_por_unidad:min:max" (lineal) o "eje:px0:v0,v1,…:p0,p1,…"
  // (por tramos, como data-translate). dragPos: valor → px local en el eje;
  // dragValue: px local → valor, limitado al recorrido.
  function dragPos(spec, v) {
    const f = spec.split(":");
    return Number(f[1]) + (f.length === 4 ? piecewise(nums(f[2]), nums(f[3]), v) : v * Number(f[2]));
  }
  function dragValue(spec, px) {
    const f = spec.split(":");
    const x = px - Number(f[1]);
    if (f.length === 4) return piecewise(nums(f[3]), nums(f[2]), x);
    return Math.max(Number(f[3]), Math.min(Number(f[4]), x / Number(f[2])));
  }

  // Caracteres de 7 segmentos (a arriba, b-c derecha, d abajo, e-f izquierda, g centro).
  const SEG7 = {
    0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
    A: "abcefg", b: "cdefg", C: "adef", c: "deg", d: "bcdeg", E: "adefg", F: "aefg", G: "acdef", H: "bcefg", h: "cefg",
    I: "ef", i: "c", J: "bcde", L: "def", n: "ceg", o: "cdeg", O: "abcdef", P: "abefg", q: "abcfg", r: "eg", S: "acdfg",
    t: "defg", U: "bcdef", u: "cde", v: "cde", y: "bcdfg", Y: "bcdfg", Z: "abdeg", "-": "g", "_": "d", " ": "",
  };
  function segCells(text, n) {
    const cells = [];
    for (const ch of text) {
      if (ch === "." && cells.length && !cells.at(-1).includes("p")) cells[cells.length - 1] += "p";
      else cells.push(ch === "." ? "p" : SEG7[ch] ?? SEG7[ch.toUpperCase()] ?? SEG7[ch.toLowerCase()] ?? "");
    }
    while (cells.length < n) cells.unshift("");
    return cells.slice(-n);
  }

  function drawTemplate(tpl, st, p) {
    const ctx = { o: st.outputs ?? {}, p, st, wired: new Set(st.wired ?? []) };
    const root = tpl.svg.cloneNode(true);
    for (const el of root.querySelectorAll(".jw-term")) el.setAttribute("opacity", "0");
    for (const el of root.querySelectorAll("[data-show]")) {
      if (!valueOf(el.getAttribute("data-show"), ctx)) el.setAttribute("display", "none");
    }
    for (const el of root.querySelectorAll("[data-fill]")) {
      // data-fill="param.color" toma el color de la paleta de lentes.
      const v = valueOf(el.getAttribute("data-fill"), ctx);
      if (v !== undefined) el.setAttribute("fill", LENS[v] ?? v);
    }
    for (const el of root.querySelectorAll("[data-text]")) {
      // data-text="out.speed:%" muestra 0..1 como porcentaje; ":mm", un
      // largo con un decimal ("12,5 mm").
      // ":d1:°C" con 1 decimal y la unidad ("27,4 °C"; "—" sin valor);
      // ":hm" horas como "8 h 05 min".
      const [expr, fmt, unit] = el.getAttribute("data-text").split(":");
      const v = valueOf(expr, ctx);
      const dec = /^d(\d)$/.exec(fmt ?? "");
      const none = v === undefined || v === null || Number.isNaN(Number(v));
      el.textContent =
        fmt === "%" ? `${Math.round(Number(v ?? 0) * 100)} %` :
        fmt === "mm" ? `${Number(v ?? 0).toFixed(1).replace(".", ",")} mm` :
        dec ? (none ? "—" : `${Number(v).toFixed(Number(dec[1])).replace(".", ",")}${unit ? ` ${unit}` : ""}`) :
        fmt === "hm" ? (none ? "—" : `${Math.floor(Number(v))} h ${String(Math.floor((Number(v) % 1) * 60)).padStart(2, "0")} min`) : String(v ?? "");
    }
    for (const el of root.querySelectorAll("[data-seg]")) {
      // data-seg="out.lcd:4": pantalla de 7 segmentos de N dígitos (texto
      // alineado a la derecha; el punto se suma al dígito anterior). Cada
      // segmento lleva data-s="<dígito><a-g|p>" y se pinta con data-on/data-off.
      const [expr, n] = el.getAttribute("data-seg").split(":");
      const cells = segCells(String(valueOf(expr, ctx) ?? ""), Number(n));
      const on = el.getAttribute("data-on") ?? "#ff3b26";
      const off = el.getAttribute("data-off") ?? "#2a0c08";
      for (const sg of el.querySelectorAll("[data-s]")) {
        const k = sg.getAttribute("data-s");
        sg.setAttribute("fill", cells[Number(k.slice(0, -1))]?.includes(k.slice(-1)) ? on : off);
      }
    }
    for (const el of root.querySelectorAll("[data-translate]")) {
      // data-translate="out.position:0:1:x:60": valor de 0 a 1 → 0 a 60 px en x.
      // Por tramos: "out.distance:0,8,8.8,20:x:0,160,200,300" (cada valor → su px).
      const f = el.getAttribute("data-translate").split(":");
      const v = Number(valueOf(f[0], ctx) ?? 0);
      let axis, d;
      if (f.length === 4) {
        axis = f[2];
        d = piecewise(nums(f[1]), nums(f[3]), v);
      } else {
        axis = f[3];
        d = Math.max(0, Math.min(1, (v - Number(f[1])) / (Number(f[2]) - Number(f[1]) || 1))) * Number(f[4]);
      }
      el.setAttribute("transform", `${el.getAttribute("transform") ?? ""} translate(${axis === "y" ? 0 : d} ${axis === "y" ? d : 0})`);
    }
    for (const el of root.querySelectorAll("[data-rotate]")) {
      // data-rotate="out.position:-1:1:-45:45:40:50": valor → ángulo, centro (40, 50).
      const [expr, v0, v1, a0, a1, cx, cy] = el.getAttribute("data-rotate").split(":");
      const v = Number(valueOf(expr, ctx) ?? 0);
      const f = Math.max(0, Math.min(1, (v - Number(v0)) / (Number(v1) - Number(v0) || 1)));
      el.setAttribute("transform", `${el.getAttribute("transform") ?? ""} rotate(${Number(a0) + f * (Number(a1) - Number(a0))} ${cx} ${cy})`);
    }
    // data-spin="out.speed:cx:cy:vueltas_por_s": giro continuo con la simulación
    // (motor). El ángulo se integra con el tiempo simulado de cada dispositivo:
    // se detiene en pausa y sigue la rampa de la velocidad.
    root.querySelectorAll("[data-spin]").forEach((el, i) => {
      const [expr, cx, cy, rps] = el.getAttribute("data-spin").split(":");
      const v = Number(valueOf(expr, ctx) ?? 0) || 0;
      const key = `${st.id ?? ""}:${i}`;
      const t = Number(st.t_ms ?? 0);
      const prev = spins.get(key) ?? { t, a: 0, v };
      const a = t > prev.t ? (prev.a + ((prev.v + v) / 2) * Number(rps) * 360 * ((t - prev.t) / 1000)) % 360 : t < prev.t ? 0 : prev.a;
      spins.set(key, { t, a, v });
      el.setAttribute("transform", `${el.getAttribute("transform") ?? ""} rotate(${a.toFixed(2)} ${cx} ${cy})`);
    });
    for (const el of root.querySelectorAll("[data-action]")) el.classList.add("act");
    const ser = new XMLSerializer();
    // En un grupo .tpl: los estilos de los textos de la app no lo alcanzan.
    return `<g class="tpl">${[...root.childNodes].map((n) => (n.nodeType === 1 ? ser.serializeToString(n) : "")).join("")}</g>`;
  }

  // Plantilla de un dispositivo: la de su variante si un parámetro de lista la
  // elige (<tipo>__<valor>, p. ej. power-24vdc__mdr60 con model = "MDR-60"),
  // si no la del tipo. null: se dibuja en código.
  const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
  function templateKey(type, def, p) {
    for (const prm of def?.parameters ?? []) {
      if (prm.type !== "enum") continue;
      const k = `${type}__${slug(p?.[prm.id] ?? prm.default)}`;
      if (templates.has(k)) return k;
    }
    return templates.has(type) ? type : null;
  }

  /** Disposición de un dispositivo: tamaño y bornes { id: { x, y, side } } (y = borde: entrada del cable). */
  function layout(type, def, p) {
    const key = templateKey(type, def, p);
    const tpl = key && templates.get(key);
    if (tpl) return { w: tpl.w, h: tpl.h, terms: tpl.terms, template: key };
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
    // Motor trifásico: con «6 cables» salen también W2, U2 y V2; con chapas,
    // solo U1, V1, W1 y PE.
    if (short === "motor-3ph" && p?.bornera === "6 cables") {
      w = 200;
      top = ["U1", "V1", "W1", "W2", "U2", "V2", "PE"];
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
    const key = templateKey(type, def, p);
    if (key) return drawTemplate(templates.get(key), st, p);
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
      case "motor-3ph": {
        // Provisorio hasta el símbolo del WEG W22: bornera de 6 bornes,
        // carcasa con aletas, giro con el sentido y la conexión detectada.
        // La placa de bornes muestra las chapas de la bornera.
        const box = motorBornera(String(p.bornera ?? "triangulo"), { x: w - 54, y: 40, w: 50, h: 40 });
        const sp = Number(o.speed ?? 0);
        const run = !!o.running;
        const conn = o.connection === "triangulo" ? "Δ triángulo" : o.connection === "estrella" ? "Y estrella" : "";
        return (
          `<rect class="dev-box" x="4" y="0" width="${w - 8}" height="34" rx="4" fill="${face}" stroke="${ink}" stroke-width="1.6"/>` +
          terminals(type, lay) +
          `<rect x="8" y="38" width="${w - 30}" height="80" rx="12" fill="#3f6fa0" stroke="${ink}" stroke-width="1.6"/>` +
          Array.from({ length: 7 }, (_, i) => `<line x1="16" y1="${46 + i * 11}" x2="${w - 30}" y2="${46 + i * 11}" stroke="#335b85" stroke-width="2"/>`).join("") +
          `<rect x="${w - 22}" y="90" width="18" height="14" fill="#aeb4bc" stroke="${ink}"/>` + box +
          `<circle cx="${(w - 22) / 2 + 4}" cy="78" r="18" fill="#1d2025" stroke="${ink}"/>` +
          `<text class="sym-big light" x="${(w - 22) / 2 + 4}" y="84">M3~</text>` +
          (run ? `<path class="spin" d="M${(w - 22) / 2 + 4} 60 A18 18 0 0 1 ${(w - 22) / 2 + 22} 78" fill="none" stroke="#37d67a" stroke-width="3" style="transform-origin:${(w - 22) / 2 + 4}px 78px;animation-duration:${(1 / Math.max(0.1, Math.abs(sp))).toFixed(2)}s;animation-direction:${sp < 0 ? "reverse" : "normal"}"/>` : "") +
          (o.faltaFase ? `<text class="sym-bad" x="${w / 2}" y="${h - 4}">FALTA DE FASE</text>` : `<text class="sym-tag" x="${w / 2}" y="${h - 4}">${conn}${conn ? " · " : ""}${Math.round(sp * 100)} %</text>`) + dmg
        );
      }
      case "overload-relay": {
        // Provisorio hasta el símbolo del CHINT NR2-25: módulo con los polos,
        // indicador de disparo, perilla de ajuste y botones TEST / RESET.
        const tr = !!o.tripped;
        return (
          module(w, h) + band(w, 28, 26, "#3a3f46") + terminals(type, lay) +
          `<text class="sym-big light" x="${cx}" y="46">NR2-25 · ${esc(p.range ?? "")}</text>` +
          `<circle cx="40" cy="${cy}" r="14" fill="#e8eaed" stroke="${ink}"/><path d="M40 ${cy} L50 ${cy - 8}" stroke="${ink}" stroke-width="2"/>` +
          `<rect x="64" y="${cy - 10}" width="32" height="20" rx="3" fill="${tr ? "#e0392b" : "#2fbf5a"}" stroke="${ink}"/>` +
          `<text class="sym-tag light" x="80" y="${cy + 4}">${tr ? "DISP." : "OK"}</text>` +
          `<g class="act" data-action="test" data-kind="momentary"><rect x="104" y="${cy - 18}" width="44" height="16" rx="3" fill="#c94b2c"/><text class="sym-tag light" x="126" y="${cy - 6}">TEST</text></g>` +
          `<g class="act" data-action="reset" data-kind="momentary"><rect x="104" y="${cy + 2}" width="44" height="16" rx="3" fill="#2f62d6"/><text class="sym-tag light" x="126" y="${cy + 14}">RESET</text></g>` +
          (o.faltaFase ? `<text class="sym-bad" x="${cx}" y="${h - 34}">FALTA DE FASE</text>` : "")
        );
      }
      case "vfd-el": {
        // Respaldo si falta vfd-el.svg: frente con la pantalla y los LED.
        const led = (x, on, col, t) => `<circle cx="${x}" cy="118" r="5" fill="${on ? col : "#2a2d31"}" stroke="${ink}"/><text class="sym-tag light" x="${x}" y="134">${t}</text>`;
        return (
          `<rect class="dev-box" x="10" y="22" width="${w - 20}" height="${h - 44}" rx="8" fill="#2e3237" stroke="${ink}" stroke-width="1.6"/>` +
          `<text class="sym-big light" x="${cx}" y="44">DELTA · VFD-EL</text>` +
          terminals(type, lay) +
          `<rect x="${cx - 80}" y="58" width="160" height="40" rx="4" fill="#120606" stroke="${ink}"/>` +
          `<text x="${cx}" y="87" text-anchor="middle" font-family="monospace" font-size="24" font-weight="700" fill="#ff3b26">${esc(o.lcd ?? "")}</text>` +
          led(cx - 75, o.ledRun, "#3ddc84", "RUN") + led(cx - 25, o.ledStop, "#e0392b", "STOP") +
          led(cx + 25, o.ledFwd, "#3ddc84", "FWD") + led(cx + 75, o.ledRev, "#3ddc84", "REV") +
          ["run", "stop", "mode", "enter", "up", "down"].map((k, i) => `<g class="act" data-action="${k}" data-kind="momentary"><rect x="${cx - 135 + i * 46}" y="146" width="42" height="22" rx="4" fill="#4b5158"/><text class="sym-tag light" x="${cx - 114 + i * 46}" y="161">${{ run: "RUN", stop: "STOP", mode: "MODE", enter: "ENTER", up: "▲", down: "▼" }[k]}</text></g>`).join("")
        );
      }
      case "power-24vdc": {
        const ok = !st.tripped;
        return (
          module(w, h) + band(w, 6, 22, "#3a3f46") + terminals(type, lay) +
          `<text class="sym-big light" x="${cx}" y="22">24 V DC</text>` +
          led(18, 46, ok, "#37d67a") + `<text class="sym-tag" x="44" y="49">DC OK</text>` +
          (ok ? "" : `<text class="sym-bad" x="${cx}" y="70">DISPARADA</text>`) +
          `<rect x="${lay.terms["+V1"].x - 9}" y="${h - 46}" width="18" height="5" fill="#e0392b"/>` +
          `<rect x="${lay.terms["-V1"].x - 9}" y="${h - 46}" width="18" height="5" fill="#2f62d6"/>`
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

  /** ¿La plantilla del dispositivo cambia con el tiempo (data-spin)? */
  const animated = (type, def, p) => !!templates.get(templateKey(type, def, p) ?? "")?.animated;

  window.JwsimSymbols = { GRID, SCREW_INSET, layout, draw, templateKey, animated, registerTemplate, templates, warnings, dragPos, dragValue, motorBornera };
})();
