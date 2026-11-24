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

  return { graphicBody, ladderSvg, fbdSvg };
});
