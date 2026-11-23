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
  const S = { colors: "iec", shown: false, model: null, key: "", sheet: 0, snap: null, vb: null, drag: null, loading: null, flash: null };
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
  // Color del conductor según IEC 60204-1 (13.2.4): potencia negro, mando
  // AC rojo, neutro azul claro, mando DC azul oscuro. «Negro»: todo en tinta.
  function wireCls(sh, rep) {
    if (S.colors === "mono") return "";
    if (sh.kind === "power" || sh.srcKind === "AC3") return " iec-c-pwr";
    if (sh.srcKind === "DC") return " iec-c-dc";
    if (sh.srcKind === "AC") return rep && rep === sh.rails?.bot.rep ? " iec-c-n" : " iec-c-ac";
    return "";
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

  // Flecha de continuación (▽) con su destino «hoja-FilaColumna», clicable.
  const arrowDown = (x, y, on) => `<path class="iec-l iec-arrow${on ? " on" : ""}" d="M${x - 5} ${y}L${x + 5} ${y}L${x} ${y + 9}z"/>`;
  // Atributos de una referencia clicable: celda «hoja-FilaColumna» y, si se
  // conoce, el punto exacto del destino (para marcar el elemento mismo).
  const goA = (ref, pt) => ` data-goto="${ref}"${pt ? ` data-pt="${pt}"` : ""}`;
  const gotoT = (x, y, ref, anchor = "start", pt) => (ref ? T(x, y, ref, "iec-ref iec-xref", anchor, goA(ref, pt)) : "");
  const hitOf = (e) => `<rect class="iec-hitbox" x="${e.x - 26}" y="${e.y - SYM - 4}" width="52" height="${2 * SYM + 8}"/>`;
  const wrapEl = (sh, e, inner) => {
    const flash = S.flash && S.flash.dev === e.dev ? " flash" : "";
    const sel = S.edit?.key === e.key && S.edit?.sheet === sh.n ? " sel" : "";
    return `<g class="iec-el${flash}${sel}" data-dev="${esc(e.dev)}" data-cid="${esc(e.cid)}" data-key="${esc(e.key)}">${hitOf(e)}${inner}</g>`;
  };

  // Entrada del PLC en su circuito: el cable termina en una flecha hacia el
  // borne del módulo («-plc:I0.0», hoja del PLC).
  function plcInArrow(sh, e) {
    const on = live(sh, e.top);
    const y = e.y - 6;
    let s = L(e.x, e.y - SYM, e.x, y, `iec-lead${wireCls(sh, e.top)}${on ? " on" : ""}`) + arrowDown(e.x, y, on);
    s += T(e.x + 9, y + 8, `${e.label}:${e.io ?? e.cid}`, "iec-io", "start");
    s += gotoT(e.x + 9, y + 20, e.ref, "start", e.refPt);
    return wrapEl(sh, e, s);
  }

  // Salida a relé del PLC dentro de su circuito: el cable baja hasta el COM
  // del relé (flecha a la hoja del PLC) y sigue desde su NA (otra flecha).
  function plcOutBreak(sh, e) {
    const onT = live(sh, e.top);
    const onB = live(sh, e.bot);
    let s = L(e.x, e.y - SYM, e.x, e.y - 14, `iec-lead${wireCls(sh, e.top)}${onT ? " on" : ""}`) + arrowDown(e.x, e.y - 14, onT);
    s += arrowDown(e.x, e.y + 3, onB) + L(e.x, e.y + 12, e.x, e.y + SYM, `iec-lead${wireCls(sh, e.bot)}${onB ? " on" : ""}`);
    // A la izquierda el borne del módulo; a la derecha, dónde está.
    s += T(e.x - 9, e.y - 6, `${e.io} COM`, "iec-io", "end") + gotoT(e.x + 9, e.y - 6, e.ref, "start", e.refPt);
    s += T(e.x - 9, e.y + 12, `${e.io} NA`, "iec-io", "end") + gotoT(e.x + 9, e.y + 12, e.ref2, "start", e.ref2Pt);
    s += T(e.x - 9, e.y - 20, e.label, "iec-desig", "end");
    return wrapEl(sh, e, s);
  }

  function elem(sh, e) {
    if (e.kind === "plcin" && e.arrow) return plcInArrow(sh, e);
    if (e.kind === "contact" && e.act === "plc") return plcOutBreak(sh, e);
    const top = live(sh, e.top);
    const isC = e.kind === "contact";
    const { s, cls } = isC ? contact(e, top) : loadSym(e, loadOn(sh, e));
    const plcBox = e.kind === "plcin" || e.kind === "plcpower";
    const lx = e.x - (isC && e.act && e.act !== "plc" ? 42 : plcBox ? 26 : 20);
    // Dentro del módulo del PLC la designación va una vez, en el marco.
    let lab = e.inModule ? "" : T(lx, e.y - 2, e.label, "iec-desig", "end");
    // La función va en la franja de arriba de su columna (colTexts).
    if (isC && e.io) lab += T(e.x + 19, e.y + 4, e.io, "iec-io", "start");
    if (e.ref) lab += T(lx, e.y + 11, `/${e.ref}`, "iec-ref", "end", goA(e.ref, e.refPt));
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
      s += T(xx, yy, `${r.cid} /${r.at}`, "iec-ref", r.nc ? "start" : "end", goA(r.at, r.pt));
    }
    return s;
  }

  // Conductor de protección: verde-amarillo a trazos (en «Negro», trazos).
  const pe = (x1, y1, x2, y2) =>
    S.colors === "mono" ? L(x1, y1, x2, y2, "iec-dash") : L(x1, y1, x2, y2, "iec-pe-g") + L(x1, y1, x2, y2, "iec-pe-y");

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
      s += pe(cx + r * 0.7, cy + r * 0.7, cx + r + 10, cy + r + 4) + T(cx + r + 12, cy + r + 8, "PE", "iec-term", "start");
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
    if (b.ref) lab += T(lx, y + b.h / 2 + 11, `/${b.ref}`, "iec-ref", "end", goA(b.ref, b.refPt));
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

  // Marco con la rejilla fija del documento: columnas 1–10 arriba, filas
  // A–F a la izquierda y franja del cajetín abajo (igual en todas las hojas).
  function frame(sh) {
    const N = S.model.sheets.length;
    const g = sh.grid ?? { x0: 34, colW: (sh.w - 44) / 10, cols: 10, y0: 50, rowH: (sh.h - 128) / 6, rows: 6 };
    const yB = g.y0 + g.rowH * g.rows; // arriba de la franja del cajetín
    let s = `<rect class="iec-paper" x="0" y="0" width="${sh.w}" height="${sh.h}"/>`;
    s += `<rect class="iec-frame" x="10" y="10" width="${sh.w - 20}" height="${sh.h - 20}"/>`;
    s += L(g.x0, 10, g.x0, yB, "iec-thin") + L(g.x0, 30, sh.w - 10, 30, "iec-thin") + L(g.x0, 50, sh.w - 10, 50, "iec-thin") + L(10, yB, sh.w - 10, yB, "iec-thin");
    for (let c = 0; c < g.cols; c++) {
      const x = g.x0 + c * g.colW;
      if (c) s += L(x, 10, x, 30, "iec-thin");
      s += T(x + g.colW / 2, 24, String(c + 1), "iec-colnum");
      if (S.flash && S.flash.sheet === sh.n && S.flash.col === c + 1) {
        const r = S.flash.row;
        s += `<rect class="iec-colflash${S.flash.pt ? " soft" : ""}" x="${x}" y="${r ? g.y0 + (r - 1) * g.rowH : 30}" width="${g.colW}" height="${r ? g.rowH : yB - 30}"/>`;
      }
    }
    for (let r = 0; r < g.rows; r++) {
      const y = g.y0 + r * g.rowH;
      if (r) s += L(10, y, g.x0, y, "iec-thin");
      s += T(22, y + g.rowH / 2 + 4, String.fromCharCode(65 + r), "iec-colnum");
    }
    // Texto de función de cada columna del circuito, en la franja de arriba.
    for (let c = 0; c < (sh.cols ?? 0); c++) {
      const ft = sh.kind === "control" || sh.kind === "power" ? colText(sh, c) : "";
      if (!ft) continue;
      const x = sh.x0 + c * sh.colW;
      s += T(x + sh.colW / 2, 43, ft.length > 18 ? `${ft.slice(0, 17)}…` : ft, "iec-coltext", "middle", ` data-full="${esc(ft)}"`);
    }
    // Cajetín.
    const bh = sh.h - 10 - yB;
    const bw = 400;
    const bx = sh.w - 10 - bw;
    const by = yB;
    s += `<rect class="iec-titleblock" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
    s += L(bx + 110, by, bx + 110, by + bh, "iec-thin") + L(bx + 110, by + bh / 2, bx + bw, by + bh / 2, "iec-thin") + L(bx + bw - 70, by, bx + bw - 70, by + bh, "iec-thin");
    s += T(bx + 55, by + bh / 2, "JW Control", "iec-brand") + T(bx + 55, by + bh / 2 + 16, "JWPLC Sim", "iec-tiny");
    s += T(bx + 118, by + bh / 2 - 10, S.model.title || "Proyecto sin título", "iec-tb", "start") + T(bx + 118, by + bh - 12, sh.title, "iec-tb iec-tb-strong", "start");
    s += T(bx + bw - 35, by + bh / 2 - 10, "Hoja", "iec-tiny") + T(bx + bw - 35, by + bh - 12, `${sh.n} / ${N}`, "iec-tb iec-tb-strong");
    s += T(20, by + 18, "Generado del circuito de la escena · símbolos IEC 60617 · designaciones IEC 81346", "iec-tiny", "start");
    if (S.colors !== "mono") {
      // Leyenda de colores de conductores (IEC 60204-1).
      let lx = 20;
      for (const [cls, txt] of [["iec-c-pwr", "potencia"], ["iec-c-ac", "mando AC"], ["iec-c-n", "neutro"], ["iec-c-dc", "mando DC"]]) {
        s += `<line class="iec-w ${cls}" x1="${lx}" y1="${by + 47}" x2="${lx + 16}" y2="${by + 47}"/>` + T(lx + 20, by + 50, txt, "iec-tiny", "start");
        lx += 30 + txt.length * 5;
      }
      s += L(lx, by + 47, lx + 16, by + 47, "iec-pe-g") + L(lx, by + 47, lx + 16, by + 47, "iec-pe-y") + T(lx + 20, by + 50, "PE · colores IEC 60204-1", "iec-tiny", "start");
    }
    s += T(20, by + 32, `Referencias hoja-FilaColumna (p. ej. 4-C3: hoja 4, fila C, columna 3) · estado: ${S.snap ? "simulación en curso" : "reposo"}`, "iec-tiny", "start");
    return s;
  }

  // Módulo del PLC con sus bornes (como en los planos de tablero): arriba
  // entradas, COM y alimentación; abajo salidas a relé. Las flechas remiten
  // a la hoja.columna del circuito de cada borne.
  function plcModule(sh, m) {
    let s = `<rect class="iec-l iec-plcmod" x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="4"/>`;
    s += T(m.x + m.w / 2, m.y + m.h / 2 - 2, m.name, "iec-plcname") + T(m.x + m.w / 2, m.y + m.h / 2 + 14, m.label, "iec-desig");
    const ins = m.terms.filter((t) => t.side === "top" && t.kind === "in");
    if (ins.length) {
      const xa = ins[0].x - 18;
      const xb = m.terms.filter((t) => t.side === "top" && t.kind !== "pwr").at(-1).x + 18;
      s += `<rect class="iec-l iec-nofill iec-module" x="${xa}" y="${m.y + 6}" width="${xb - xa}" height="38" rx="2"/>` + T(xa + 4, m.y + 54, "Entradas digitales (DI)", "iec-modt", "start");
    }
    const outs = m.terms.filter((t) => t.side === "bot");
    if (outs.length) {
      s += T(outs[0].x - 14, m.y + m.h - 58, "Salidas a relé (contacto seco: COM – NA)", "iec-modt", "start");
      // Un marco por salida con su nombre: Q0.0 = COM + NA.
      for (const io of [...new Set(outs.map((t) => t.io))]) {
        const ts = outs.filter((t) => t.io === io);
        const xa = ts[0].x - 12;
        const xb = ts.at(-1).x + 12;
        const free = ts.every((t) => t.free);
        s += `<rect class="iec-l iec-nofill iec-module" x="${xa}" y="${m.y + m.h - 50}" width="${xb - xa}" height="44" rx="2"/>`;
        s += T((xa + xb) / 2, m.y + m.h - 40, io, `iec-plcterm${free ? " iec-free" : ""}`);
      }
    }
    const pw = m.terms.filter((t) => t.kind === "pwr");
    if (pw.length) {
      const xa = pw[0].x - 18;
      const xb = pw.at(-1).x + 18;
      s += `<rect class="iec-l iec-nofill iec-module" x="${xa}" y="${m.y + 6}" width="${xb - xa}" height="38" rx="2"/>` + T(xa + 4, m.y + 54, "Alimentación", "iec-modt", "start");
    }
    for (const t of m.terms) {
      const y = t.side === "top" ? m.y : m.y + m.h;
      const ty = t.side === "top" ? m.y + 16 : m.y + m.h - 16;
      const ly = t.side === "top" ? m.y + 36 : m.y + m.h - 26;
      s += L(t.x, y, t.x, ty + (t.side === "top" ? -5 : 5), t.free ? "iec-thin" : "");
      s += `<circle class="iec-l iec-body" cx="${t.x}" cy="${ty}" r="5"/>` + L(t.x - 3.5, ty - 3.5, t.x + 3.5, ty + 3.5) + L(t.x - 3.5, ty + 3.5, t.x + 3.5, ty - 3.5);
      s += T(t.x, ly, t.label, `iec-term iec-plcterm${t.free ? " iec-free" : ""}`);
    }
    for (const ln of m.links) {
      const up = ln.dir === "up";
      const y = ln.y;
      s += `<path class="iec-l iec-body" d="M${ln.x - 5} ${up ? y + 9 : y - 9}L${ln.x + 5} ${up ? y + 9 : y - 9}L${ln.x} ${y}z"/>`;
      if (ln.at) s += T(ln.x, up ? y - 6 : y + 20, ln.at, "iec-ref iec-xref", "middle", goA(ln.at, ln.pt));
      if (ln.desc) {
        // Texto a lo largo del cable, leído de abajo arriba (como en los planos).
        const yy = up ? y + 16 : y - 16;
        s += T(ln.x - 4, yy, ln.desc.length > 24 ? `${ln.desc.slice(0, 23)}…` : ln.desc, "iec-wiretext", up ? "end" : "start", ` transform="rotate(-90 ${ln.x - 4} ${yy})"`);
      }
    }
    const flash = S.flash && S.flash.dev === m.dev ? " flash" : "";
    return `<g class="iec-el iec-block${flash}" data-dev="${esc(m.dev)}">${s}</g>`;
  }

  // Tabla (lista de E/S y bornes): encabezado gris, filas, referencia clicable.
  function table(t) {
    if (t.note) return T(t.x, t.y, t.note, "iec-tiny", "start");
    const W = t.cw.reduce((a, v) => a + v, 0);
    const xs = t.cw.reduce((a, v) => [...a, a[a.length - 1] + v], [t.x]);
    const y0 = t.y + 20;
    const H = t.rowH * (t.rows.length + 1);
    let s = T(t.x, t.y + 12, t.title, "iec-tabt", "start");
    s += `<rect class="iec-tabhead" x="${t.x}" y="${y0}" width="${W}" height="${t.rowH}"/>`;
    s += `<rect class="iec-l iec-nofill" x="${t.x}" y="${y0}" width="${W}" height="${H}"/>`;
    t.head.forEach((h, i) => (s += T(xs[i] + 4, y0 + t.rowH - 4, h, "iec-tabh", "start")));
    const fit = (txt, w) => (txt.length * 5.4 > w - 8 ? `${txt.slice(0, Math.max(1, Math.floor((w - 8) / 5.4) - 1))}…` : txt);
    t.rows.forEach((r, k) => {
      const y = y0 + t.rowH * (k + 1);
      s += L(t.x, y, t.x + W, y, "iec-thin");
      r.cells.forEach((c, i) => {
        const last = i === r.cells.length - 1 && r.at;
        const cls = i === 0 ? "iec-io" : last ? "iec-ref" : "iec-tabc";
        const ed = r.edit && r.edit.col === i ? r.edit : null;
        if (ed) s += `<rect class="iec-cellhit" x="${xs[i]}" y="${y}" width="${t.cw[i]}" height="${t.rowH}" data-borne="${esc(ed.ch ?? "")}" data-dev="${esc(ed.dev)}" data-value="${esc(ed.value)}"><title>Clic: escribir el borne</title></rect>`;
        s += T(xs[i] + 4, y + t.rowH - 4, fit(String(c), t.cw[i]), `${cls}${r.free && !last ? " iec-free" : ""}`, "start", last ? goA(r.at, r.pt) : "");
      });
    });
    for (let i = 1; i < xs.length - 1; i++) s += L(xs[i], y0, xs[i], y0 + H, "iec-thin");
    return s;
  }

  function drawSheet(sh) {
    let s = frame(sh);
    // Barras / rieles.
    if (sh.rails) {
      const { top, bot } = sh.rails;
      const xr = sh.railEnd ?? sh.w - 30;
      s += `<polyline class="iec-w iec-rail${wireCls(sh, top.rep)}${live(sh, top.rep) ? " on" : ""}" points="${sh.x0 - 10},${top.y} ${xr},${top.y}"/>`;
      s += `<line class="iec-hit" data-rail="top" x1="${sh.x0 - 10}" y1="${top.y}" x2="${xr}" y2="${top.y}"><title>Clic: columna nueva</title></line>`;
      // El riel de retorno solo si algo llega a él (p. ej. las entradas del
      // PLC terminan en flechas y su común va en la hoja del PLC).
      const usesBot = sh.dots.some((d) => d.y === bot.y) || sh.wires.some((w) => w.pts.some((p) => p[1] === bot.y));
      if (usesBot) s += `<polyline class="iec-w iec-rail${wireCls(sh, bot.rep)}" points="${sh.x0 - 10},${bot.y} ${xr},${bot.y}"/>` + T(sh.x0 - 14, bot.y + 4, bot.label, "iec-railt", "end");
      s += T(sh.x0 - 14, top.y + 4, top.label, "iec-railt", "end");
      s += T(xr, top.y - 6, top.desig ?? "", "iec-tiny", "end");
    }
    for (const b of sh.bus ?? []) {
      s += T(sh.x0 - 4, b.y + 4, b.label, "iec-railt", "end");
    }
    if (sh.bus?.length) s += T(sh.w - 40, sh.bus[0].y - 8, sh.bus[0].desig ?? "", "iec-tiny", "end");
    for (const w of sh.wires) s += `<polyline class="iec-w${wireCls(sh, w.rep)}${live(sh, w.rep) ? " on" : ""}${sh.bus && sh.bus.some((b) => b.rep === w.rep && w.pts[0][1] === b.y && w.pts[1][1] === b.y) ? " iec-rail" : ""}" points="${w.pts.map((p) => p.join(",")).join(" ")}"/>`;
    for (const d of sh.dots) s += `<circle class="iec-dot${wireCls(sh, d.rep)}${live(sh, d.rep) ? " on" : ""}" cx="${d.x}" cy="${d.y}" r="2.6"/>`;
    for (const t of sh.tables ?? []) s += table(t);
    if (sh.plc) s += plcModule(sh, sh.plc);
    for (const b of sh.blocks) s += block(sh, b);
    for (const e of sh.elems) s += elem(sh, e);
    if (sh.rails) for (const e of sh.elems) if (/^coil/.test(e.kind)) s += xrefTable(e, sh.rails.bot.y + 14);
    // Destino exacto de la referencia seguida: anillo y mira sobre el
    // elemento (en zonas apretadas, como los bornes del PLC, la celda sola
    // no dice cuál es).
    if (S.flash?.pt && S.flash.sheet === sh.n) {
      const [x, y] = S.flash.pt;
      s += `<g class="iec-target"><circle cx="${x}" cy="${y}" r="13"/>${L(x - 21, y, x - 15, y)}${L(x + 15, y, x + 21, y)}${L(x, y - 21, x, y - 15)}${L(x, y + 15, x, y + 21)}</g>`;
    }
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
    svg.innerHTML = `<g id="iec-root">${drawSheet(sh)}${probes(sh)}</g>`;
    if (!S.vb || S.vb.sheet !== S.sheet) fit();
    else svg.setAttribute("viewBox", S.vb.box.join(" "));
  }

  /**
   * Modo Diagnóstico: con el multímetro abierto, cada borne del plano (y el
   * inicio de cada riel o barra) es un punto donde apoyar las puntas, como en
   * el tablero; las puntas puestas se dibujan encima.
   */
  function probes(sh) {
    const Dg = window.JwsimDiag;
    if (!Dg?.measuring?.()) return "";
    const Sc = window.JwsimScene;
    const pts = [];
    const add = (end, x, y) => {
      if (!end || (Sc?.terminalOf && !Sc.terminalOf(end))) return;
      pts.push({ end, x, y });
    };
    for (const e of sh.elems ?? []) {
      if (e.tTop) add(`${e.dev}.${e.tTop}`, e.x, e.y - SYM);
      if (e.tBot) add(`${e.dev}.${e.tBot}`, e.x, e.y + SYM);
    }
    for (const b of sh.blocks ?? []) {
      for (const p of b.poles ?? []) {
        if (p.tTop) add(`${b.dev}.${p.tTop}`, p.x, b.y);
        if (p.tBot && b.kind !== "motor3") add(`${b.dev}.${p.tBot}`, p.x, b.y + b.h);
      }
    }
    if (sh.rails) for (const r of [sh.rails.top, sh.rails.bot]) add(r.rep, sh.x0 - 10, r.y);
    for (const r of sh.bus ?? []) add(r.rep, sh.x0 - 10, r.y);
    const st = Dg.state();
    const at = new Map();
    for (const p of pts) if (!at.has(p.end)) at.set(p.end, p);
    let s = pts.map((p) => `<circle class="iec-probe" data-probe="${esc(p.end)}" cx="${p.x}" cy="${p.y}" r="4.5"><title>${esc(p.end)}</title></circle>`).join("");
    if (st.mode !== "A") {
      const vb = S.vb?.box ?? [0, 0, sh.w, sh.h];
      const pr = st.red && at.get(st.red);
      const pb = st.black && at.get(st.black);
      // Cada punta hacia su lado: nunca se cruzan.
      const redLeft = !pr || !pb || pr.x <= pb.x;
      for (const [p, cls, txt, left] of [[pr, "red", "+", redLeft], [pb, "black", "COM", !redLeft]]) {
        if (p) s += `<g transform="translate(${p.x} ${p.y})">${Dg.probeSvg(cls, txt, 0.8, p.y < vb[1] + vb[3] * 0.35, left)}</g>`;
      }
    } else if (st.wire != null) {
      const w = window.JwsimScene?.specForView?.()?.wiring?.[st.wire];
      const p = w && (at.get(w.from) ?? at.get(w.to));
      if (p) s += `<g class="diag-clamp" transform="translate(${p.x} ${p.y})"><circle r="10"/><text y="-15" style="font-size:11px">A</text></g>`;
    }
    return `<g class="iec-probes">${s}</g>`;
  }

  function fit() {
    const sh = S.model?.sheets[S.sheet];
    if (!sh) return;
    // Arriba queda lugar para la barra de hojas.
    S.vb = { sheet: S.sheet, box: [-10, -56, sh.w + 20, sh.h + 66] };
    $("iec-svg").setAttribute("viewBox", S.vb.box.join(" "));
  }

  function goto(at, pt) {
    // «4-C3» (hoja-FilaColumna); también acepta el formato viejo «4.3».
    const m = /^(\d+)-([A-Z])(\d+)$/.exec(String(at)) ?? /^(\d+)\.(\d+)$/.exec(String(at));
    if (!m) return;
    const n = Number(m[1]);
    const row = m.length === 4 ? m[2].charCodeAt(0) - 64 : 0;
    const col = Number(m[m.length - 1]);
    const i = S.model.sheets.findIndex((s) => s.n === n);
    if (i < 0) return;
    S.sheet = i;
    S.vb = null;
    const p = /^(-?\d+),(-?\d+)$/.exec(String(pt ?? ""));
    S.flash = { sheet: n, col, row, pt: p ? [Number(p[1]), Number(p[2])] : null };
    draw();
    clearTimeout(S.flashT);
    // Con punto exacto la marca dura más: hay que encontrarla con la vista.
    S.flashT = setTimeout(
      () => {
        S.flash = null;
        draw();
      },
      p ? 2600 : 1400,
    );
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
  // Borne de un canal del PLC (hoja de bornes): se guarda en el equipo.
  function openBorne(ds, ev) {
    if (window.JwsimScene?.isRunning?.()) return;
    const box = $("iec-edit");
    const view = $("iec-view").getBoundingClientRect();
    S.edit = { sheet: S.model.sheets[S.sheet].n, borne: ds.borne, dev: ds.dev };
    box.innerHTML =
      `<div class="iec-edit-h">Borne de -${esc(ds.dev)} ${esc(ds.borne.replace("_", "."))}</div>` +
      `<input id="iec-borne-in" class="iec-borne-in" maxlength="16" placeholder="p. ej. XI:00" value="${esc(ds.value ?? "")}">` +
      `<button data-act="borne-ok">Guardar</button><button data-act="borne-auto">Usar el propuesto</button>` +
      `<div class="iec-edit-foot">Se guarda en el proyecto · Ctrl+Z deshace</div>`;
    box.hidden = false;
    box.style.left = `${Math.max(8, Math.min(ev.clientX - view.left + 12, view.width - 250))}px`;
    box.style.top = `${Math.max(48, Math.min(ev.clientY - view.top + 12, view.height - 160))}px`;
    const inp = $("iec-borne-in");
    inp.focus();
    inp.select();
    inp.addEventListener("keydown", (k) => {
      if (k.key === "Enter") saveBorne(inp.value);
      else if (k.key === "Escape") closeEdit();
      k.stopPropagation();
    });
  }
  function saveBorne(value) {
    const ed = S.edit;
    if (!ed?.borne) return;
    const dev = (spec().devices ?? []).find((d) => d.id === ed.dev);
    const cur = { ...(dev?.params?.bornes ?? {}) };
    const v = value == null ? "" : String(value).trim();
    if (v) cur[ed.borne] = v;
    else delete cur[ed.borne];
    window.JwsimScene?.setDeviceParam?.(ed.dev, "bornes", Object.keys(cur).length ? cur : undefined);
    closeEdit();
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
      if (g) return goto(g.dataset.goto, g.dataset.pt);
      if (!S.vb) return;
      S.drag = { x: e.clientX, y: e.clientY, box: [...S.vb.box], target: e.target, moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    // Clic sin arrastrar: sobre un elemento o sobre el riel +, el menú de edición.
    svg.addEventListener("pointerup", (e) => {
      const d = S.drag;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const pr = d.target.closest?.("[data-probe]");
      if (pr) {
        window.JwsimDiag?.probe?.(pr.dataset.probe);
        return draw();
      }
      const el = d.target.closest?.(".iec-el[data-key]");
      const rail = d.target.closest?.("[data-rail]");
      const borne = d.target.closest?.("[data-borne]");
      if (borne) openBorne(borne.dataset, e);
      else if (el) openEdit({ key: el.dataset.key }, e);
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
    const col = $("iec-colors");
    if (col) {
      try {
        const v = localStorage.getItem("jwsim.iec.colors");
        if (v === "mono" || v === "iec") col.value = v;
      } catch {}
      S.colors = col.value;
      col.addEventListener("change", () => {
        S.colors = col.value;
        try {
          localStorage.setItem("jwsim.iec.colors", S.colors);
        } catch {}
        draw();
      });
    }
    $("iec-edit")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "borne-ok") return saveBorne($("iec-borne-in")?.value);
      if (b.dataset.act === "borne-auto") return saveBorne("");
      doEdit(b.dataset.act, Number(b.dataset.i ?? 0));
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
      // Celdas «Borne» de la hoja de bornes (E/S → texto).
      bornes: Object.fromEntries((S.model?.sheets.at(-1)?.tables ?? []).flatMap((t) => t.rows.filter((r) => r.edit).map((r) => [r.cells[0], r.cells[1]]))),
    }),
    goto,
    exportPdf,
    // Para las pruebas: abre el menú de un elemento (o del riel) y aplica una opción.
    edit: (what, act, i = 0) => {
      const r = $("iec-view").getBoundingClientRect();
      openEdit(what, { clientX: r.left + 200, clientY: r.top + 200 });
      return S.edit ? doEdit(act, i) : { error: "sin menú" };
    },
    // Para las pruebas: escribe el borne de un canal como lo haría el usuario.
    borne: (dev, ch, value) => {
      S.edit = { borne: ch, dev };
      saveBorne(value);
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
