// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Dibujo SVG de un programa Ladder (.ld) o FBD (.fbd) del OpenPLC Editor, con
// las posiciones que guardó el editor. Lo usan la interfaz (script clásico:
// window.JwsimPlcDiagram, vista del programa) y scripts/iec (wiki y teoría).
// Trazo y texto en currentColor, con atributos y sin <style>: pasa por el
// filtro de figuras de la teoría y se ve en tema claro y oscuro.
"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JwsimPlcDiagram = api;
})(typeof self !== "undefined" ? self : this, function () {
  // También * _ { } `: el SVG va dentro de MDX, donde serían Markdown o JSX.
  const esc = (s) => String(s ?? "").replace(/[&<>"*_{}`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? `&#${c.charCodeAt(0)};`);

  /** Cuerpo JSON de un .ld/.fbd (lo que va entre END_VAR y END_PROGRAM). */
  function graphicBody(text) {
    const s = String(text);
    return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  }

  const hpos = (n, id) => {
    const h = (n.data.handles ?? []).find((x) => x.id === id) ?? n.data.outputHandles?.find((x) => x.id === id) ?? n.data.inputHandles?.find((x) => x.id === id);
    const r = h?.relPosition ?? { x: 0, y: (n.height ?? 0) / 2 };
    return { x: n.position.x + r.x, y: n.position.y + r.y };
  };
  const step = (a, b) => {
    if (Math.abs(a.y - b.y) < 0.5) return `M${a.x} ${a.y}H${b.x}`;
    const mx = Math.round((a.x + b.x) / 2);
    return `M${a.x} ${a.y}H${mx}V${b.y}H${b.x}`;
  };
  const FONT = { b: ' font-weight="700"', var: ' font-weight="600"', inst: ' font-style="italic" opacity="0.8"', cmt: ' font-style="italic" opacity="0.75"', pin: ' font-size="9"' };
  const text = (x, y, s, anchor = "middle", cls = "") => `<text x="${x}" y="${y}" text-anchor="${anchor}"${FONT[cls] ?? ""}>${esc(s)}</text>`;

  function blockSvg(n) {
    const { x, y } = n.position;
    const w = n.width ?? n.measured?.width ?? 60;
    const h = n.height ?? n.measured?.height ?? 60;
    const v = n.data.variant ?? {};
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>` + text(x + w / 2, y + 13, v.name ?? "", "middle", "b");
    if (n.data.variable?.name) s += text(x + w / 2, y - 5, n.data.variable.name, "middle", "inst");
    for (const hd of n.data.inputHandles ?? []) s += text(x + 4, y + hd.relPosition.y + 3.5, hd.id, "start", "pin");
    for (const hd of n.data.outputHandles ?? []) s += text(x + w - 4, y + hd.relPosition.y + 3.5, hd.id, "end", "pin");
    return s;
  }

  // Contactos y bobinas de una E/S de la placa (AT %IX0.n / %QX0.n): un fondo
  // con data-sig="I0_n" / "Q0_n" que la interfaz pinta mientras la señal está en 1.
  function live(d, x, y, w) {
    const m = /^%([IQ])X0\.([0-7])$/.exec(d.variable?.location ?? "");
    return m ? `<rect data-sig="${m[1]}0_${m[2]}" x="${x - 3}" y="${y - 1}" width="${w + 6}" height="26" rx="4" stroke="none"/>` : "";
  }

  function ldNode(n) {
    const { x, y } = n.position;
    const d = n.data;
    const name = d.variable?.name ?? "";
    if (n.type === "contact") {
      const w = n.width ?? 24;
      const cy = y + 12;
      let s = live(d, x, y, w) + `<path d="M${x} ${cy}H${x + 7}M${x + 7} ${cy - 10}V${cy + 10}M${x + w - 7} ${cy - 10}V${cy + 10}M${x + w - 7} ${cy}H${x + w}"/>`;
      if (d.variant === "negated") s += `<path d="M${x + 9} ${cy + 8}L${x + w - 9} ${cy - 8}"/>`;
      if (d.variant === "risingEdge" || d.variant === "fallingEdge") s += text(x + w / 2, cy + 4, d.variant === "risingEdge" ? "P" : "N", "middle", "pin");
      return s + text(x + w / 2, y - 6, name, "middle", "var");
    }
    if (n.type === "coil") {
      const w = n.width ?? 28;
      const cy = y + 12;
      let s = live(d, x, y, w) + `<path d="M${x} ${cy}H${x + 6}M${x + w - 6} ${cy}H${x + w}"/><path d="M${x + 10} ${cy - 10}Q${x + 4} ${cy} ${x + 10} ${cy + 10}M${x + w - 10} ${cy - 10}Q${x + w - 4} ${cy} ${x + w - 10} ${cy + 10}"/>`;
      const mark = { set: "S", reset: "R", negated: "/", risingEdge: "P", fallingEdge: "N" }[d.variant];
      if (mark) s += text(x + w / 2, cy + 4, mark, "middle", "pin");
      return s + text(x + w / 2, y - 6, name, "middle", "var");
    }
    if (n.type === "block") return blockSvg(n);
    if (n.type === "variable") {
      if (!name) return "";
      const right = d.variant === "output";
      return text(right ? x + 4 : x + (n.width ?? 80) - 4, y + (n.height ?? 32) / 2 + 4, name, right ? "start" : "end", "var");
    }
    return "";
  }

  // Envoltura: los trazos heredan del <g> de líneas y el texto del <g> de texto.
  function wrap(viewBox, w, h, label, lines, texts) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${esc(label)}" style="width: 100%; height: auto; max-width: ${Math.round(w)}px; color: var(--sl-color-white, currentColor);">` +
      `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${lines}</g>` +
      `<g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11">${texts}</g></svg>\n`
    );
  }
  // Ladder: cada peldaño trasladado; trazos y textos por separado en cada uno.
  function wrapGroups(viewBox, w, h, label, groups) {
    const parts = [...groups.matchAll(/<g transform="([^"]+)">([\s\S]*?)<\/g>/g)];
    const lines = parts.map(([, t, body]) => `<g transform="${t}">${split(body).lines}</g>`).join("");
    const texts = parts.map(([, t, body]) => `<g transform="${t}">${split(body).texts}</g>`).join("");
    return wrap(viewBox, w, h, label, lines, texts);
  }
  // Separa lo que dibuja un trozo en trazos y textos.
  const split = (svg) => ({ lines: svg.replace(/<text[^>]*>[^<]*<\/text>/g, ""), texts: (svg.match(/<text[^>]*>[^<]*<\/text>/g) ?? []).join("") });

  /** SVG de un programa Ladder (todos sus peldaños, uno debajo del otro). */
  function ladderSvg(ldText) {
    const body = graphicBody(ldText);
    let out = "";
    let top = 0;
    let maxW = 0;
    for (const r of body.rungs) {
      const nodes = r.nodes.filter((n) => !/placeholder/i.test(n.type));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const y0 = Math.min(...nodes.map((n) => n.position.y)) - 22;
      const y1 = Math.max(...nodes.map((n) => n.position.y + (n.height ?? 24)));
      const right = nodes.find((n) => n.type === "powerRail" && n.data.variant === "right");
      const w = (right?.position.x ?? 300) + 3;
      maxW = Math.max(maxW, w);
      let g = "";
      if (r.comment) g += text(0, y0 - 6, `(* ${r.comment} *)`, "start", "cmt");
      const cx = right ? right.position.x + 1.5 : w;
      g += `<path stroke-width="3" d="M1.5 ${y0}V${y1 + 6}M${cx} ${y0}V${y1 + 6}"/>`;
      for (const e of r.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        if ((a.type === "variable" && !a.data.variable?.name) || (b.type === "variable" && !b.data.variable?.name)) continue;
        const pa = a.type === "powerRail" ? { x: 3, y: hpos(a, e.sourceHandle).y } : hpos(a, e.sourceHandle);
        const pb = b.type === "powerRail" ? { x: cx, y: hpos(b, e.targetHandle).y } : hpos(b, e.targetHandle);
        // Ramas en paralelo: bajan desde la unión y suben hasta la otra.
        const d = e.sourceHandle === "output-down" ? `M${pa.x} ${pa.y}V${pb.y}H${pb.x}` : e.targetHandle === "input-down" ? `M${pa.x} ${pa.y}H${pb.x}V${pb.y}` : step(pa, pb);
        g += `<path d="${d}"/>`;
      }
      for (const n of nodes) g += ldNode(n);
      const dy = top - y0 + (r.comment ? 18 : 0);
      out += `<g transform="translate(6 ${dy})">${g}</g>`;
      top += y1 - y0 + (r.comment ? 18 : 0) + 26;
    }
    return wrapGroups(`0 0 ${maxW + 12} ${top}`, maxW + 12, top, "Programa Ladder", out);
  }

  /** SVG de un programa FBD. */
  function fbdSvg(fbdText) {
    const body = graphicBody(fbdText);
    const nodes = body.rung.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let g = "";
    for (const e of body.rung.edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (a && b) g += `<path d="${step(hpos(a, e.sourceHandle), hpos(b, e.targetHandle))}"/>`;
    }
    for (const n of nodes) {
      const { x, y } = n.position;
      if (n.type === "block") g += blockSvg(n);
      else if (/variable$/.test(n.type)) {
        const w = n.width ?? 100;
        const h = n.height ?? 30;
        g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>` + text(x + w / 2, y + h / 2 + 4, n.data.variable?.name ?? "", "middle", "var");
        if (n.data.negated) g += `<circle cx="${x + w + 4}" cy="${y + h / 2}" r="4"/>`;
      }
    }
    const x0 = Math.min(...nodes.map((n) => n.position.x)) - 10;
    const y0 = Math.min(...nodes.map((n) => n.position.y)) - 20;
    const x1 = Math.max(...nodes.map((n) => n.position.x + (n.width ?? 100))) + 10;
    const y1 = Math.max(...nodes.map((n) => n.position.y + (n.height ?? 30))) + 10;
    const { lines, texts } = split(g);
    return wrap(`${x0} ${y0} ${x1 - x0} ${y1 - y0}`, x1 - x0, y1 - y0, "Programa FBD", lines, texts);
  }

  // ---------------------------------------------------------------------
  // Vista de la app con el aspecto del OpenPLC Editor (4.3): cada peldaño en
  // su tarjeta con el comentario arriba, barras de alimentación grises,
  // contactos de dos barras, bobinas entre paréntesis, letras de variante en
  // azul, nombres encima, bloques con esquinas redondeadas y uniones
  // «smoothstep». En vivo, como el depurador del editor: verde (#00FF00) lo
  // que está en 1 y la corriente que pasa, azul (#0464FB) lo que está en 0;
  // forzado en verde oliva / azul claro. Colores y trazos por clase (CSS de
  // la app), para el tema claro y el oscuro. El dibujo es propio; solo imita
  // el aspecto del editor.
  const VAR_MAX = 11;
  const short = (s) => (String(s).length > VAR_MAX ? `${String(s).slice(0, VAR_MAX - 1)}…` : String(s));
  const sigOf = (d) => {
    const m = /^%([IQ])X0\.([0-7])$/.exec(d?.variable?.location ?? "");
    return m ? `${m[1]}0_${m[2]}` : null;
  };
  const MARK = { contact: { risingEdge: "P", fallingEdge: "N" }, coil: { set: "S", reset: "R", risingEdge: "P", fallingEdge: "N" } };

  // Unión con codos redondeados (como el «smoothstep» de React Flow).
  function smooth(a, b, r = 5) {
    if (Math.abs(a.y - b.y) < 0.5) return `M${a.x} ${a.y}H${b.x}`;
    const mx = Math.round((a.x + b.x) / 2);
    const k = Math.min(r, Math.abs(b.y - a.y) / 2, Math.abs(mx - a.x), Math.abs(b.x - mx));
    const sy = b.y > a.y ? 1 : -1;
    const sx1 = mx >= a.x ? 1 : -1;
    const sx2 = b.x >= mx ? 1 : -1;
    return `M${a.x} ${a.y}H${mx - sx1 * k}Q${mx} ${a.y} ${mx} ${a.y + sy * k}V${b.y - sy * k}Q${mx} ${b.y} ${mx + sx2 * k} ${b.y}H${b.x}`;
  }

  // Un solo codo (ramas en paralelo), también redondeado.
  function corner(a, c, b, r = 5) {
    const k = Math.min(r, Math.hypot(c.x - a.x, c.y - a.y) / 2, Math.hypot(b.x - c.x, b.y - c.y) / 2);
    if (k < 0.5) return `M${a.x} ${a.y}L${c.x} ${c.y}L${b.x} ${b.y}`;
    const u = (p, q) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
    };
    const ua = u(c, a);
    const ub = u(c, b);
    return `M${a.x} ${a.y}L${c.x + ua.x * k} ${c.y + ua.y * k}Q${c.x} ${c.y} ${c.x + ub.x * k} ${c.y + ub.y * k}L${b.x} ${b.y}`;
  }

  function viewNode(n) {
    const { x, y } = n.position;
    const d = n.data;
    const name = d.variable?.name ?? "";
    const sig = sigOf(d);
    const attrs = ` data-node="${esc(n.id)}"${sig ? ` data-sig="${sig}"` : ""}${name ? ` data-var="${esc(name)}"` : ""}`;
    const label = (w) => (name ? `<text class="ld-name" x="${x + w / 2}" y="${y - 7}" text-anchor="middle"><title>${esc(name)}</title>${esc(short(name))}</text>` : "");
    if (n.type === "contact") {
      const w = n.width ?? 24;
      const h = n.height ?? 24;
      let s = `<g class="ld-el ld-contact" data-variant="${esc(d.variant ?? "default")}"${attrs}><rect class="ld-hit" x="${x - 4}" y="${y - 2}" width="${w + 8}" height="${h + 4}" rx="3"/>`;
      s += `<path class="ld-stroke" d="M${x + 0.7} ${y}V${y + h}M${x + w - 0.7} ${y}V${y + h}"/>`;
      if (d.variant === "negated") s += `<path class="ld-mod-line" d="M${x + 5} ${y + h - 4}L${x + w - 5} ${y + 4}"/>`;
      const m = MARK.contact[d.variant];
      if (m) s += `<text class="ld-mod" x="${x + w / 2}" y="${y + h / 2 + 4.5}" text-anchor="middle">${m}</text>`;
      return `${s}</g>${label(w)}`;
    }
    if (n.type === "coil") {
      const w = n.width ?? 28;
      const h = n.height ?? 24;
      // Paréntesis rellenos, más gruesos al centro (como el ícono del editor).
      const L = `M${x + 5} ${y}C${x + 1.4} ${y + 6} ${x + 1.4} ${y + h - 6} ${x + 5} ${y + h}H${x + 3.2}C${x - 0.6} ${y + h - 6} ${x - 0.6} ${y + 6} ${x + 3.2} ${y}Z`;
      const R = `M${x + w - 5} ${y}C${x + w - 1.4} ${y + 6} ${x + w - 1.4} ${y + h - 6} ${x + w - 5} ${y + h}H${x + w - 3.2}C${x + w + 0.6} ${y + h - 6} ${x + w + 0.6} ${y + 6} ${x + w - 3.2} ${y}Z`;
      let s = `<g class="ld-el ld-coil" data-variant="${esc(d.variant ?? "default")}"${attrs}><rect class="ld-hit" x="${x - 4}" y="${y - 2}" width="${w + 8}" height="${h + 4}" rx="3"/><path class="ld-fill" d="${L}${R}"/>`;
      if (d.variant === "negated") s += `<path class="ld-mod-line" d="M${x + 9} ${y + h - 5}L${x + w - 9} ${y + 5}"/>`;
      const m = MARK.coil[d.variant];
      if (m) s += `<text class="ld-mod" x="${x + w / 2}" y="${y + h / 2 + 4.5}" text-anchor="middle">${m}</text>`;
      return `${s}</g>${label(w)}`;
    }
    if (n.type === "block") {
      const w = n.width ?? 66;
      const h = n.height ?? 100;
      const v = d.variant ?? {};
      let s = `<g class="ld-block" data-node="${esc(n.id)}"><rect class="ld-block-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
      s += `<text class="ld-block-name" x="${x + w / 2}" y="${y + 19}" text-anchor="middle">${esc(v.name ?? "")}</text>`;
      for (const hd of d.inputHandles ?? []) s += `<text class="ld-pin" x="${x + 6}" y="${y + hd.relPosition.y + 4}">${esc(hd.id)}</text>`;
      for (const hd of d.outputHandles ?? []) s += `<text class="ld-pin" x="${x + w - 6}" y="${y + hd.relPosition.y + 4}" text-anchor="end">${esc(hd.id)}</text>`;
      s += "</g>";
      if (name) s += `<text class="ld-name" x="${x + w / 2}" y="${y - 7}" text-anchor="middle">${esc(name)}</text>`;
      return s;
    }
    if (n.type === "variable") {
      if (!name) return "";
      const right = d.variant === "output";
      const w = n.width ?? 80;
      return `<text class="ld-varbox" x="${right ? x + 6 : x + w - 6}" y="${y + (n.height ?? 32) / 2 + 4}" text-anchor="${right ? "start" : "end"}"><title>${esc(name)}</title>${esc(short(name))}</text>`;
    }
    return "";
  }

  /** HTML de la vista Ladder de la app (una tarjeta por peldaño). */
  function ladderView(ldText) {
    const body = graphicBody(ldText);
    let html = '<div class="ld-view">';
    body.rungs.forEach((r, i) => {
      const nodes = r.nodes.filter((n) => !/placeholder/i.test(n.type));
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const left = nodes.find((n) => n.type === "powerRail" && n.data.variant === "left");
      const right = nodes.find((n) => n.type === "powerRail" && n.data.variant === "right");
      const tops = nodes.filter((n) => n.type !== "powerRail").map((n) => n.position.y - (n.type === "variable" ? 0 : 20));
      const bots = nodes.map((n) => n.position.y + (n.height ?? 24));
      const y0 = Math.min(left?.position.y ?? 0, ...tops) - 8;
      const y1 = Math.max(...bots) + 12;
      const rx = right ? right.position.x : Math.max(...nodes.map((n) => n.position.x + (n.width ?? 0))) + 20;
      const w = rx + 3 + 16;
      let g = "";
      // Barras: cubren todo el peldaño (con ramas en paralelo, todas sus salidas).
      const railH = (n) => Math.max(40, ...(n.data.handles ?? []).map((hd) => (hd.relPosition?.y ?? 0) + 20));
      if (left) g += `<rect class="ld-rail" x="${left.position.x}" y="${left.position.y}" width="3" height="${railH(left)}"/>`;
      if (right) g += `<rect class="ld-rail" x="${rx}" y="${right.position.y}" width="3" height="${railH(right)}"/>`;
      for (const e of r.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        if ((a.type === "variable" && !a.data.variable?.name) || (b.type === "variable" && !b.data.variable?.name)) continue;
        const pa = a.type === "powerRail" ? { x: a.position.x + 3, y: hpos(a, e.sourceHandle).y } : hpos(a, e.sourceHandle);
        const pb = b.type === "powerRail" ? { x: rx, y: hpos(b, e.targetHandle).y } : hpos(b, e.targetHandle);
        const dd = e.sourceHandle === "output-down" ? corner(pa, { x: pa.x, y: pb.y }, pb) : e.targetHandle === "input-down" ? corner(pa, { x: pb.x, y: pa.y }, pb) : smooth(pa, pb);
        g += `<path class="ld-edge" data-edge="${esc(e.id)}" d="${dd}"/>`;
      }
      for (const n of nodes) g += viewNode(n);
      const cmt = r.comment ? `<span class="ld-rung-c">${esc(r.comment)}</span>` : '<span class="ld-rung-c ld-rung-c-empty">Sin comentario</span>';
      html +=
        `<section class="ld-rung" data-rung="${esc(r.id)}"><header class="ld-rung-h"><span class="ld-rung-n">${i + 1}</span>${cmt}</header>` +
        `<div class="ld-rung-b"><svg class="ld-svg" xmlns="http://www.w3.org/2000/svg" viewBox="-6 ${y0} ${w + 6} ${y1 - y0}" width="${w + 6}" height="${y1 - y0}" role="img" aria-label="Peldaño ${i + 1}">${g}</svg></div></section>`;
    });
    return `${html}</div>`;
  }

  /**
   * Estado en vivo del Ladder, con las reglas del depurador del OpenPLC
   * Editor (rung-debug-states.ts): la corriente sale de la barra izquierda,
   * pasa un contacto si su variable (o su negada) está en 1 y atraviesa las
   * bobinas. valueOf(nodeData) da true/false o undefined si no se conoce
   * (en el Sim se conocen las E/S de la placa). La salida de un bloque se
   * toma de la bobina que alimenta, cuando esa bobina es de una E/S.
   * Devuelve { edges: Map(id → bool), nodes: Map(id → bool|undefined) }.
   */
  function ladderFlow(ldText, valueOf) {
    const body = graphicBody(ldText);
    const edges = new Map();
    const nodesOut = new Map();
    for (const r of body.rungs) {
      const byId = new Map(r.nodes.map((n) => [n.id, n]));
      const into = new Map();
      const outOf = new Map();
      for (const e of r.edges) {
        (into.get(e.target) ?? into.set(e.target, []).get(e.target)).push(e);
        (outOf.get(e.source) ?? outOf.set(e.source, []).get(e.source)).push(e);
      }
      const memo = new Map();
      const state = (e, seen = new Set()) => {
        if (memo.has(e.id)) return memo.get(e.id);
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        const n = byId.get(e.source);
        const ins = into.get(e.source) ?? [];
        const inGreen = ins.length ? ins.some((x) => state(x, seen)) : n?.type === "powerRail" && n.data.variant === "left";
        let out;
        if (!n) out = false;
        else if (n.type === "powerRail") out = n.data.variant === "left";
        else if (n.type === "parallel") out = inGreen;
        else if (n.type === "coil") out = inGreen;
        else if (n.type === "contact") {
          const v = MARK.contact[n.data.variant] ? undefined : valueOf(n.data);
          out = v === undefined ? undefined : inGreen && (n.data.variant === "negated" ? !v : v);
        } else if (n.type === "block") {
          const t = byId.get(e.target);
          out = t?.type === "coil" && (t.data.variant ?? "default") === "default" ? valueOf(t.data) : undefined;
        }
        const green = out === true;
        memo.set(e.id, green);
        return green;
      };
      for (const e of r.edges) edges.set(e.id, state(e));
      for (const n of r.nodes) if (n.type === "contact" || n.type === "coil") nodesOut.set(n.id, valueOf(n.data));
    }
    return { edges, nodes: nodesOut };
  }

  return { graphicBody, ladderSvg, fbdSvg, ladderView, ladderFlow, sigOf };
});
