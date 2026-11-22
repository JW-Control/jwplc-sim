// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Esquema normalizado (IEC 60617, designaciones IEC 81346) generado de la
// escena por scene/iec.mjs: hojas de potencia y de mando con columnas
// numeradas, contactos en su estado real, referencias cruzadas bobina ↔
// contactos y cajetín. Con la simulación corriendo, lo que tiene tensión se
// pinta en verde. Es una vista: se edita en «A colores».
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const S = { shown: false, model: null, key: "", sheet: 0, snap: null, vb: null, drag: null, loading: null, flash: null };
  const SYM = 18;

  const spec = () => window.JwsimScene?.specForSave?.() ?? { devices: [], wiring: [] };
  const has = () => (window.JwsimScene?.specForView?.()?.devices ?? []).some((d) => d.type !== "jwsim/jwplc-basic");
  const title = () => document.title.replace(/\s+—\s+JWPLC Sim$/, "").replace(/^JWPLC Sim$/, "");

  // ---------- estado en vivo (snapshot)
  const polesOf = (rep) => S.snap?.poles?.[rep] ?? [];
  function live(sh, rep) {
    const ps = polesOf(rep);
    if (sh.srcKind === "AC3") return ps.some((p) => p.startsWith(`${sh.src}~`));
    return ps.includes(`${sh.src}+`) && !ps.includes(`${sh.src}-`);
  }
  const devSnap = (id) => S.snap?.devices?.find((d) => d.id === id);
  function closed(e) {
    const c = devSnap(e.dev)?.contacts;
    if (c && e.cid in c) return !!c[e.cid];
    return !!(e.nc && !S.snap);
  }
  function loadOn(sh, e) {
    if (!S.snap) return false;
    return live(sh, e.top) && polesOf(e.bot).includes(`${sh.src}-`);
  }

  // ---------- símbolos (IEC 60617, en vertical, centrados en x, y)
  const T = (x, y, s, cls = "", anchor = "middle", extra = "") => `<text class="iec-t ${cls}" x="${x}" y="${y}" text-anchor="${anchor}"${extra}>${esc(s)}</text>`;
  const L = (x1, y1, x2, y2, cls = "") => `<line class="iec-l ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

  function actuator(act, x, y) {
    // Varilla de mando punteada desde la lengüeta hacia la izquierda y el
    // símbolo del accionamiento en su extremo.
    if (!act || act === "plc") return "";
    const ax = x - 24;
    let s = L(x - 5, y, ax, y, "iec-mech");
    switch (act) {
      case "push":
        s += `<path class="iec-l" d="M${ax} ${y - 6}h-4v12h4"/>`;
        break;
      case "mushroom":
        s += `<path class="iec-l" d="M${ax} ${y - 8}a8 8 0 0 0 0 16z"/>`;
        break;
      case "turn":
        s += `<path class="iec-l" d="M${ax - 4} ${y - 6}v6h4v6"/>`;
        break;
      case "key":
        s += `<circle class="iec-l iec-nofill" cx="${ax - 5}" cy="${y}" r="4"/>` + L(ax - 1, y, ax, y);
        break;
      case "roller":
        s += `<circle class="iec-l iec-nofill" cx="${ax - 5}" cy="${y}" r="4.5"/>`;
        break;
      case "prox":
        s += `<path class="iec-l iec-nofill" d="M${ax - 7} ${y}l7-7 7 7-7 7z" transform="translate(-6 0)"/>` + L(ax - 15, y - 3, ax - 11, y - 3);
        break;
      case "float":
        s += `<circle class="iec-l iec-nofill" cx="${ax - 6}" cy="${y}" r="5"/>` + L(ax - 14, y + 7, ax + 2, y + 7);
        break;
      case "pressure":
        s += `<rect class="iec-l iec-nofill" x="${ax - 12}" y="${y - 6}" width="12" height="12"/>` + T(ax - 6, y + 4, "p", "iec-tiny");
        break;
      case "temp":
        s += `<rect class="iec-l iec-nofill" x="${ax - 12}" y="${y - 6}" width="12" height="12"/>` + T(ax - 6, y + 4, "θ", "iec-tiny");
        break;
      case "thermal":
        s += `<path class="iec-l" d="M${ax} ${y - 5}h-4v5h-4v5h-4"/>`;
        break;
      case "timer":
        s += `<path class="iec-l" d="M${ax} ${y - 6}h-6v12h6M${ax - 6} ${y - 6}l-5 6 5 6"/>`;
        break;
      case "breaker":
        s += "";
        break;
    }
    return s;
  }

  function contact(e, on) {
    const { x, y } = e;
    const c = closed(e);
    const cls = on ? "on" : "";
    let s = L(x, y - SYM, x, y - 10, on ? "on" : "") + L(x, y + 10, x, y + SYM, c && on ? "on" : "");
    // Lengüeta: cerrada llega al borne de arriba; abierta queda girada.
    const bx = c ? (e.nc ? x + 2 : x - 1) : e.nc ? x - 10 : x - 10;
    const by = c ? y - 10 : y - 11;
    if (e.nc) s += L(x, y - 10, x + 7, y - 10);
    s += L(x, y + 10, e.nc && c ? x + 8 : bx, e.nc && c ? y - 12 : by, `iec-blade ${c && on ? "on" : ""}`);
    s += actuator(e.act, x, y);
    if (e.act === "plc") s += `<rect class="iec-l iec-nofill iec-plcbox" x="${x - 16}" y="${y - SYM - 2}" width="32" height="${2 * SYM + 4}" rx="2"/>`;
    return { s, cls };
  }

  function loadSym(e, on) {
    const { x, y } = e;
    let s = L(x, y - SYM, x, y - 10) + L(x, y + 10, x, y + SYM);
    switch (e.kind) {
      case "coil":
      case "coiltimer":
      case "valve":
        s += `<rect class="iec-l iec-body" x="${x - 15}" y="${y - 10}" width="30" height="20"/>`;
        if (e.kind === "coiltimer") s += `<rect class="iec-l iec-fill" x="${x - 15}" y="${y - 10}" width="7" height="20"/>`;
        if (e.kind === "valve") s += L(x - 15, y + 10, x + 15, y - 10);
        break;
      case "lamp":
        s += `<circle class="iec-l iec-body" cx="${x}" cy="${y}" r="10"/>` + L(x - 7, y - 7, x + 7, y + 7) + L(x - 7, y + 7, x + 7, y - 7);
        break;
      case "buzzer":
        s += `<path class="iec-l iec-body" d="M${x - 12} ${y - 4}a12 12 0 0 1 24 0z"/>` + L(x - 12, y - 4, x - 12, y + 10) + L(x + 12, y - 4, x + 12, y + 10) + L(x - 12, y + 10, x + 12, y + 10);
        break;
      case "motor1":
        s += `<circle class="iec-l iec-body" cx="${x}" cy="${y}" r="13"/>` + T(x, y - 1, "M", "iec-sym-t") + T(x, y + 9, "1~", "iec-tiny");
        break;
      case "plcin":
      case "plcpower":
        s += `<rect class="iec-l iec-body iec-plc" x="${x - 20}" y="${y - 11}" width="40" height="22" rx="2"/>` + T(x, y + 4, e.io ?? "", "iec-io");
        break;
      default:
        s += `<rect class="iec-l iec-body" x="${x - 15}" y="${y - 10}" width="30" height="20"/>`;
    }
    return { s, cls: on ? "on" : "" };
  }

  function elem(sh, e) {
    const top = live(sh, e.top);
    const isC = e.kind === "contact";
    const { s, cls } = isC ? contact(e, top) : loadSym(e, loadOn(sh, e));
    const plcBox = e.kind === "plcin" || e.kind === "plcpower";
    const lx = e.x - (isC && e.act && e.act !== "plc" ? 42 : plcBox ? 26 : 20);
    let lab = T(lx, e.y - 2, e.label, "iec-desig", "end");
    // La función va en la franja de arriba de su columna (colTexts).
    if (isC && e.io) lab += T(e.x + 19, e.y + 4, e.io, "iec-io", "start");
    if (e.ref) lab += T(lx, e.y + 11, `/${e.ref}`, "iec-ref", "end", ` data-goto="${e.ref}"`);
    // Bornes.
    const tt = T(e.x + 5, e.y - SYM + 7, e.tTop, "iec-term", "start") + T(e.x + 5, e.y + SYM - 1, e.tBot, "iec-term", "start");
    const flash = S.flash && S.flash.dev === e.dev ? " flash" : "";
    const sel = S.edit?.key === e.key && S.edit?.sheet === sh.n ? " sel" : "";
    const hit = `<rect class="iec-hitbox" x="${e.x - 26}" y="${e.y - SYM - 4}" width="52" height="${2 * SYM + 8}"/>`;
    return `<g class="iec-el ${cls}${flash}${sel}" data-dev="${esc(e.dev)}" data-cid="${esc(e.cid)}" data-key="${esc(e.key)}">${hit}${s}${lab}${plcBox || e.act === "plc" ? "" : tt}</g>`;
  }

  // Tabla de referencias bajo la bobina: dónde están sus contactos.
  function xrefTable(e, y0) {
    if (!e.xref?.length) return "";
    let s = L(e.x - 22, y0, e.x + 22, y0, "iec-thin") + T(e.x - 11, y0 + 10, "NA", "iec-tiny") + T(e.x + 11, y0 + 10, "NC", "iec-tiny") + L(e.x, y0 + 2, e.x, y0 + 14 + 10 * Math.max(1, Math.max(e.xref.filter((r) => !r.nc).length, e.xref.filter((r) => r.nc).length)), "iec-thin");
    const rows = { na: 0, nc: 0 };
    for (const r of e.xref) {
      const k = r.nc ? "nc" : "na";
      const yy = y0 + 22 + rows[k]++ * 10;
      const xx = r.nc ? e.x + 3 : e.x - 3;
      s += T(xx, yy, `${r.cid} /${r.at}`, "iec-ref", r.nc ? "start" : "end", ` data-goto="${r.at}"`);
    }
    return s;
  }

  function block(sh, b) {
    const on = b.poles.some((p) => live(sh, p.top));
    let s = "";
    const x0 = b.poles[0].x;
    const x1 = b.poles[b.poles.length - 1].x;
    const y = b.y;
    const snapC = devSnap(b.dev)?.contacts ?? {};
    if (b.kind === "motor3") {
      const cx = (x0 + x1) / 2;
      const r = 26;
      const cy = y + 14 + r;
      for (const p of b.poles) {
        const yy = cy - Math.sqrt(Math.max(0, r * r - (p.x - cx) ** 2));
        s += L(p.x, y, p.x, yy, live(sh, p.top) ? "on" : "") + T(p.x + 3, y + 10, p.tTop, "iec-term", "start");
      }
      const spd = Number(devSnap(b.dev)?.outputs?.speed ?? 0);
      s += `<circle class="iec-l iec-body${spd > 0.01 ? " iec-run" : ""}" cx="${cx}" cy="${cy}" r="${r}"/>` + T(cx, cy + 1, "M", "iec-sym-t iec-big") + T(cx, cy + 14, "3~", "iec-tiny");
      s += L(cx + r * 0.7, cy + r * 0.7, cx + r + 10, cy + r + 4) + T(cx + r + 12, cy + r + 8, "PE", "iec-term", "start");
    } else {
      for (const p of b.poles) {
        const pon = live(sh, p.top);
        const c = p.cid in snapC ? !!snapC[p.cid] : false;
        const ym = y + b.h / 2;
        if (b.kind === "thermal3") {
          s += L(p.x, y, p.x, ym - 10, pon ? "on" : "") + `<path class="iec-l ${pon ? "on" : ""}" d="M${p.x} ${ym - 10}h-5v6h10v6h-5v8"/>` + L(p.x, ym + 10, p.x, y + b.h, pon ? "on" : "");
        } else {
          s += L(p.x, y, p.x, ym - 10, pon ? "on" : "") + L(p.x, ym + 10, p.x, y + b.h, pon && c ? "on" : "");
          s += L(p.x, ym + 10, c ? p.x - 1 : p.x - 10, ym - 11, `iec-blade ${pon && c ? "on" : ""}`);
          if (b.kind === "poles3") s += `<path class="iec-l iec-nofill" d="M${p.x} ${ym - 10}a3.5 3.5 0 0 1 7 0"/>`;
          if (b.kind === "breaker3") s += L(p.x - 3, ym - 13, p.x + 3, ym - 7) + L(p.x - 3, ym - 7, p.x + 3, ym - 13);
        }
        s += T(p.x + 4, y + 9, p.tTop, "iec-term", "start") + (p.tBot ? T(p.x + 4, y + b.h - 2, p.tBot, "iec-term", "start") : "");
      }
      if (b.kind === "thermal3") s += `<rect class="iec-l iec-nofill iec-dash" x="${x0 - 12}" y="${y + b.h / 2 - 15}" width="${x1 - x0 + 24}" height="30"/>`;
      else s += L(x0 - 6, y + b.h / 2, x1 - 4, y + b.h / 2, "iec-mech");
    }
    const lx = x0 - 16;
    let lab = T(lx, y + b.h / 2 - 2, b.label, "iec-desig", "end");
    if (b.ref) lab += T(lx, y + b.h / 2 + 11, `/${b.ref}`, "iec-ref", "end", ` data-goto="${b.ref}"`);
    const flash = S.flash && S.flash.dev === b.dev ? " flash" : "";
    return `<g class="iec-el iec-block ${on ? "on" : ""}${flash}" data-dev="${esc(b.dev)}">${s}${lab}</g>`;
  }

  // Texto de función de cada columna (como en los planos: arriba de la
  // columna): el rótulo de su carga o, si no tiene, el de su primer contacto.
  function colText(sh, c) {
    const es = sh.elems.filter((e) => e.col === c && e.text);
    const ld = es.find((e) => e.kind !== "contact");
    return (ld ?? es[0])?.text ?? (sh.blocks ?? []).find((b) => b.text && Math.floor((b.x - sh.x0) / sh.colW) === c)?.text ?? "";
  }

  function frame(sh) {
    const N = S.model.sheets.length;
    let s = `<rect class="iec-paper" x="0" y="0" width="${sh.w}" height="${sh.h}"/>`;
    s += `<rect class="iec-frame" x="10" y="10" width="${sh.w - 20}" height="${sh.h - 20}"/>`;
    // Franja de columnas numeradas.
    s += L(10, 30, sh.w - 10, 30, "iec-thin") + L(10, 50, sh.w - 10, 50, "iec-thin");
    for (let c = 0; c < sh.cols; c++) {
      const x = sh.x0 + c * sh.colW;
      if (x + sh.colW > sh.w - 10) break;
      s += L(x, 10, x, 30, "iec-thin") + T(x + sh.colW / 2, 24, String(c + 1), "iec-colnum");
      const ft = colText(sh, c);
      if (ft) s += T(x + sh.colW / 2, 43, ft.length > 20 ? `${ft.slice(0, 19)}…` : ft, "iec-coltext", "middle", ` data-full="${esc(ft)}"`);
      if (S.flash && S.flash.sheet === sh.n && S.flash.col === c + 1) s += `<rect class="iec-colflash" x="${x}" y="30" width="${sh.colW}" height="${sh.h - 130}"/>`;
    }
    // Cajetín.
    const bw = 380;
    const bx = sh.w - 10 - bw;
    const by = sh.h - 10 - 58;
    s += `<rect class="iec-titleblock" x="${bx}" y="${by}" width="${bw}" height="58"/>`;
    s += L(bx + 110, by, bx + 110, by + 58, "iec-thin") + L(bx + 110, by + 29, bx + bw, by + 29, "iec-thin") + L(bx + bw - 70, by, bx + bw - 70, by + 58, "iec-thin");
    s += T(bx + 55, by + 25, "JW Control", "iec-brand") + T(bx + 55, by + 42, "JWPLC Sim", "iec-tiny");
    s += T(bx + 118, by + 19, S.model.title || "Proyecto sin título", "iec-tb", "start") + T(bx + 118, by + 48, sh.title, "iec-tb iec-tb-strong", "start");
    s += T(bx + bw - 35, by + 19, "Hoja", "iec-tiny") + T(bx + bw - 35, by + 48, `${sh.n} / ${N}`, "iec-tb iec-tb-strong");
    s += T(20, sh.h - 22, "Generado del circuito de la escena · símbolos IEC 60617 · designaciones IEC 81346", "iec-tiny", "start");
    return s;
  }

  function drawSheet(sh) {
    let s = frame(sh);
    // Barras / rieles.
    if (sh.rails) {
      const { top, bot } = sh.rails;
      const xr = sh.w - 30;
      s += `<polyline class="iec-w iec-rail${live(sh, top.rep) ? " on" : ""}" points="${sh.x0 - 10},${top.y} ${xr},${top.y}"/>`;
      s += `<line class="iec-hit" data-rail="top" x1="${sh.x0 - 10}" y1="${top.y}" x2="${xr}" y2="${top.y}"><title>Clic: columna nueva</title></line>`;
      s += `<polyline class="iec-w iec-rail" points="${sh.x0 - 10},${bot.y} ${xr},${bot.y}"/>`;
      s += T(sh.x0 - 14, top.y + 4, top.label, "iec-railt", "end") + T(sh.x0 - 14, bot.y + 4, bot.label, "iec-railt", "end");
      s += T(xr, top.y - 6, top.desig ?? "", "iec-tiny", "end");
    }
    for (const b of sh.bus ?? []) {
      s += T(sh.x0 - 4, b.y + 4, b.label, "iec-railt", "end");
    }
    if (sh.bus?.length) s += T(sh.w - 40, sh.bus[0].y - 8, sh.bus[0].desig ?? "", "iec-tiny", "end");
    for (const w of sh.wires) s += `<polyline class="iec-w${live(sh, w.rep) ? " on" : ""}${sh.bus && sh.bus.some((b) => b.rep === w.rep && w.pts[0][1] === b.y && w.pts[1][1] === b.y) ? " iec-rail" : ""}" points="${w.pts.map((p) => p.join(",")).join(" ")}"/>`;
    for (const d of sh.dots) s += `<circle class="iec-dot${live(sh, d.rep) ? " on" : ""}" cx="${d.x}" cy="${d.y}" r="2.6"/>`;
    for (const b of sh.blocks) s += block(sh, b);
    for (const e of sh.elems) s += elem(sh, e);
    if (sh.rails) for (const e of sh.elems) if (/^coil/.test(e.kind)) s += xrefTable(e, sh.rails.bot.y + 14);
    return s;
  }

  function draw() {
    if (!S.shown) return;
    const svg = $("iec-svg");
    const tabs = $("iec-sheets");
    const m = S.model;
    if (!m || !m.sheets.length) {
      svg.innerHTML = "";
      $("iec-empty").hidden = false;
      $("iec-empty").textContent = m?.error ? `No se pudo generar el esquema: ${m.error}` : S.loading ? "Generando el esquema…" : "Sin circuitos para dibujar: cablee una fuente con sus cargas en «A colores».";
      tabs.innerHTML = "";
      return;
    }
    $("iec-empty").hidden = true;
    S.sheet = Math.min(S.sheet, m.sheets.length - 1);
    const sh = m.sheets[S.sheet];
    const tabsHtml = m.sheets.map((x, i) => `<button class="seg${i === S.sheet ? " active" : ""}" data-sheet="${i}" title="${esc(x.title)}">${x.n} · ${esc(x.title)}</button>`).join("");
    if (tabs.dataset.html !== tabsHtml) {
      tabs.innerHTML = tabsHtml;
      tabs.dataset.html = tabsHtml;
    }
    svg.innerHTML = `<g id="iec-root">${drawSheet(sh)}</g>`;
    if (!S.vb || S.vb.sheet !== S.sheet) fit();
    else svg.setAttribute("viewBox", S.vb.box.join(" "));
  }

  function fit() {
    const sh = S.model?.sheets[S.sheet];
    if (!sh) return;
    // Arriba queda lugar para la barra de hojas.
    S.vb = { sheet: S.sheet, box: [-10, -56, sh.w + 20, sh.h + 66] };
    $("iec-svg").setAttribute("viewBox", S.vb.box.join(" "));
  }

  function goto(at) {
    const [n, col] = String(at).split(".").map(Number);
    const i = S.model.sheets.findIndex((s) => s.n === n);
    if (i < 0) return;
    S.sheet = i;
    S.vb = null;
    S.flash = { sheet: n, col };
    draw();
    clearTimeout(S.flashT);
    S.flashT = setTimeout(() => {
      S.flash = null;
      draw();
    }, 1400);
  }

  async function load() {
    const sp = spec();
    const key = JSON.stringify({ d: sp.devices.map(({ id, type, version, params, mount }) => ({ id, type, version, params, mount })), w: sp.wiring.map((w) => [w.from, w.to]), t: title() });
    if (key === S.key && S.model) return draw();
    S.key = key;
    const ticket = (S.loading = {});
    draw();
    const m = await window.jwsim.sceneIec(sp, title());
    if (S.loading !== ticket) return;
    S.loading = null;
    S.model = m;
    S.vb = null;
    draw();
  }

  // ---------- PDF: todas las hojas en reposo (sin el estado en vivo).
  function printCss() {
    let css = "";
    for (const ss of document.styleSheets) {
      let rules;
      try {
        rules = ss.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) if (/\.iec-/.test(r.selectorText ?? r.cssText.split("{")[0])) css += r.cssText;
    }
    return css;
  }
  async function exportPdf() {
    if (!S.model?.sheets.length) return null;
    const keep = { snap: S.snap, flash: S.flash };
    S.snap = null;
    S.flash = null;
    let pages;
    try {
      pages = S.model.sheets.map((sh) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sh.w} ${sh.h}" preserveAspectRatio="xMidYMid meet" font-family="Segoe UI, Arial, sans-serif">${drawSheet(sh)}</svg>`);
    } finally {
      Object.assign(S, keep);
    }
    const name = (S.model.title || "esquema").replace(/[\\/:*?"<>|]+/g, "_");
    const btn = $("iec-pdf");
    btn.disabled = true;
    try {
      return await window.jwsim.iecPdf(pages, printCss(), name, $("iec-size").value);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- edición: lo que se hace en el plano cambia la escena (scene.js editCircuit)
  const NEW = [
    { label: "Pulsador NA", type: "jwsim/pushbutton-no", io: ["13", "14"] },
    { label: "Pulsador NC", type: "jwsim/pushbutton-nc", io: ["11", "12"] },
    { label: "Final de carrera NA", type: "jwsim/limit-switch", io: ["13", "14"] },
    { label: "Final de carrera NC", type: "jwsim/limit-switch", io: ["21", "22"] },
  ];
  const RUNGS = [
    { label: "Pulsador NA + piloto", chain: [NEW[0], { type: "jwsim/lamp", io: ["X1", "X2"] }] },
    { label: "Pulsador NA + contactor", chain: [NEW[0], { type: "jwsim/contactor", io: ["A1", "A2"] }] },
    { label: "Piloto", chain: [{ type: "jwsim/lamp", io: ["X1", "X2"] }] },
  ];
  function contactChoices() {
    const own = (S.model?.free ?? []).map((f) => ({ label: `Contacto ${f.nc ? "NC" : "NA"} ${f.cid} de -${f.dev}`, dev: f.dev, io: [f.a, f.b] }));
    return [...NEW, ...own];
  }
  function closeEdit() {
    S.edit = null;
    const box = $("iec-edit");
    if (box) box.hidden = true;
    draw();
  }
  function openEdit(what, ev) {
    if (window.JwsimScene?.isRunning?.()) return;
    const sh = S.model.sheets[S.sheet];
    const box = $("iec-edit");
    const view = $("iec-view").getBoundingClientRect();
    let html = "";
    const btns = (list, act) => list.map((c, i) => `<button data-act="${act}" data-i="${i}">${esc(c.label)}</button>`).join("");
    if (what.rail) {
      if (sh.kind !== "control" || sh.srcKind !== "DC") return;
      S.edit = { sheet: sh.n, rail: true };
      html = `<div class="iec-edit-h">Columna nueva desde ${esc(sh.rails.top.label)}</div>${btns(RUNGS, "rung")}`;
    } else {
      const e = sh.elems.find((x) => x.key === what.key);
      if (!e) return;
      S.edit = { sheet: sh.n, key: e.key, e };
      const isC = e.kind === "contact";
      const plcLoad = e.kind === "plcin" || e.kind === "plcpower";
      html =
        `<div class="iec-edit-h">${esc(e.label)} ${esc(e.io ?? e.cid)}</div>` +
        `<div class="iec-edit-s">En serie, arriba</div>${btns(contactChoices(), "series")}` +
        (plcLoad ? "" : `<div class="iec-edit-s">En paralelo</div>${btns(contactChoices(), "parallel")}`) +
        (isC && e.act !== "plc" ? `<div class="iec-edit-s">Quitar</div><button data-act="bridge" class="danger">Quitar este contacto (se unen sus lados)</button>` : "") +
        (!isC && !plcLoad ? `<div class="iec-edit-s">Quitar</div><button data-act="cut" class="danger">Quitar esta carga del circuito</button>` : "");
    }
    box.innerHTML = html + `<div class="iec-edit-foot">Cambia la escena · Ctrl+Z deshace</div>`;
    box.hidden = false;
    const x = Math.min(ev.clientX - view.left + 12, view.width - 250);
    const y = Math.min(ev.clientY - view.top + 12, view.height - box.offsetHeight - 10);
    box.style.left = `${Math.max(8, x)}px`;
    box.style.top = `${Math.max(48, y)}px`;
    draw();
  }
  function doEdit(act, i) {
    const sh = S.model.sheets[S.sheet];
    const ed = S.edit;
    if (!ed) return;
    const api = window.JwsimScene;
    let r;
    if (act === "rung") {
      const k = RUNGS[i];
      r = api.editCircuit({ kind: "rung", pos: sh.rails.top.rep, neg: sh.rails.bot.rep, chain: k.chain.map((c) => ({ type: c.type, dev: c.dev, io: c.io })) });
    } else {
      const e = ed.e;
      const top = `${e.dev}.${e.tTop}`;
      const bot = `${e.dev}.${e.tBot}`;
      const c = contactChoices()[i];
      if (act === "series") r = api.editCircuit({ kind: "series", before: top, type: c.type, dev: c.dev, io: c.io });
      else if (act === "parallel") r = api.editCircuit({ kind: "parallel", top, bot, type: c.type, dev: c.dev, io: c.io });
      else r = api.editCircuit({ kind: act, top, bot });
    }
    if (r?.error) console.warn(r.error);
    closeEdit();
    return r;
  }

  function setup() {
    const svg = $("iec-svg");
    if (!svg || svg.dataset.ready) return;
    svg.dataset.ready = "1";
    svg.addEventListener(
      "wheel",
      (e) => {
        if (!S.vb) return;
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const [x, y, w, h] = S.vb.box;
        const k = e.deltaY < 0 ? 1 / 1.15 : 1.15;
        const sx = Math.max(w / r.width, h / r.height);
        const ox = x + (e.clientX - r.left - (r.width - w / sx) / 2) * sx;
        const oy = y + (e.clientY - r.top - (r.height - h / sx) / 2) * sx;
        S.vb.box = [ox - (ox - x) * k, oy - (oy - y) * k, w * k, h * k];
        svg.setAttribute("viewBox", S.vb.box.join(" "));
      },
      { passive: false },
    );
    svg.addEventListener("pointerdown", (e) => {
      const g = e.target.closest?.("[data-goto]");
      if (g) return goto(g.dataset.goto);
      if (!S.vb) return;
      S.drag = { x: e.clientX, y: e.clientY, box: [...S.vb.box], target: e.target, moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    // Clic sin arrastrar: sobre un elemento o sobre el riel +, el menú de edición.
    svg.addEventListener("pointerup", (e) => {
      const d = S.drag;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const el = d.target.closest?.(".iec-el[data-key]");
      const rail = d.target.closest?.("[data-rail]");
      if (el) openEdit({ key: el.dataset.key }, e);
      else if (rail) openEdit({ rail: rail.dataset.rail }, e);
      else closeEdit();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!S.drag) return;
      const r = svg.getBoundingClientRect();
      const [x, y, w, h] = S.drag.box;
      const sx = Math.max(w / r.width, h / r.height);
      S.vb.box = [x - (e.clientX - S.drag.x) * sx, y - (e.clientY - S.drag.y) * sx, w, h];
      svg.setAttribute("viewBox", S.vb.box.join(" "));
    });
    const end = () => (S.drag = null);
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    $("iec-fit")?.addEventListener("click", fit);
    $("iec-pdf")?.addEventListener("click", () => exportPdf());
    $("iec-edit")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b) doEdit(b.dataset.act, Number(b.dataset.i ?? 0));
    });
    window.addEventListener("keydown", (e) => e.key === "Escape" && S.edit && closeEdit());
    $("iec-sheets")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sheet]");
      if (!b) return;
      S.sheet = Number(b.dataset.sheet);
      S.vb = null;
      draw();
    });
    window.addEventListener("keydown", (e) => {
      if (!S.shown || e.target.closest?.("input, textarea, .monaco-editor")) return;
      if (e.key === "PageDown" || e.key === "PageUp") {
        const n = S.model?.sheets.length ?? 0;
        if (!n) return;
        S.sheet = (S.sheet + (e.key === "PageDown" ? 1 : n - 1)) % n;
        S.vb = null;
        draw();
        e.preventDefault();
      }
    });
  }

  window.JwsimIec = {
    available: has,
    show(on) {
      setup();
      S.shown = !!on;
      $("iec-view").hidden = !on;
      if (on) {
        document.body.dataset.schem = "iec";
        load();
      }
    },
    shown: () => S.shown,
    onSnapshot(snap) {
      S.snap = snap;
      if (!S.shown) return;
      // Editando (sin simular) el circuito pudo cambiar: se regenera si hace falta.
      if (!window.JwsimScene?.isRunning?.()) load();
      else if (S.model) draw();
    },
    onSpec() {
      S.key = "";
      S.sheet = 0;
      if (S.shown) load();
      window.JwsimTabs?.refreshSchem?.();
    },
    // Para las pruebas.
    debug: () => ({
      shown: S.shown,
      sheets: (S.model?.sheets ?? []).map((s) => ({ n: s.n, title: s.title, kind: s.kind, elems: s.elems.length, blocks: s.blocks.length })),
      sheet: S.sheet,
      on: document.querySelectorAll("#iec-root .iec-w.on").length,
      error: S.model?.error ?? null,
    }),
    goto,
    exportPdf,
    // Para las pruebas: abre el menú de un elemento (o del riel) y aplica una opción.
    edit: (what, act, i = 0) => {
      const r = $("iec-view").getBoundingClientRect();
      openEdit(what, { clientX: r.left + 200, clientY: r.top + 200 });
      return S.edit ? doEdit(act, i) : { error: "sin menú" };
    },
    elems: () => (S.model?.sheets[S.sheet]?.elems ?? []).map((e) => ({ key: e.key, dev: e.dev, cid: e.cid, kind: e.kind, col: e.col })),
    free: () => S.model?.free ?? [],
    sheet: (i) => {
      S.sheet = i;
      S.vb = null;
      draw();
    },
  };
})();
