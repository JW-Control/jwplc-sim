// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Símbolo de un componente declarativo (contrato en docs/SIMBOLOS.md): el
// dibujo del autor (art.svg, el SVG que subió) dentro de una caja en la
// grilla de 20 px, los bornes donde los ubicó en el editor y los
// indicadores en vivo (valor y luz). Sin Node: lo usan el editor y el
// guardado.

export const GRID = 20;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const snap = (v, min = GRID) => Math.max(min, Math.round(Number(v) / GRID) * GRID);

/**
 * Limpia el SVG del autor: sin <script>, <foreignObject>, atributos on…,
 * enlaces javascript: ni imágenes externas (las mismas reglas que la app al
 * cargar). Devuelve el contenido interior y su viewBox.
 * @param {string} text
 */
export function cleanArt(text) {
  let s = String(text ?? "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, "$1#");
  s = s.replace(/<image\b[^>]*>/gi, (tag) => (/(?:xlink:)?href\s*=\s*["']data:image\/(png|jpeg|svg\+xml)/i.test(tag) ? tag : ""));
  const root = /<svg\b([^>]*)>/i.exec(s);
  if (!root) throw new Error("el archivo no es un SVG (falta <svg>)");
  const a = root[1];
  const attr = (n) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, "i").exec(a)?.[1];
  let vb = (attr("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(attr("width") ?? "");
    const h = parseFloat(attr("height") ?? "");
    if (!(w > 0 && h > 0)) throw new Error("el SVG no tiene viewBox ni ancho y alto");
    vb = [0, 0, w, h];
  }
  const end = s.lastIndexOf("</svg>");
  const inner = s.slice(root.index + root[0].length, end < 0 ? undefined : end);
  return { inner, viewBox: vb };
}

/**
 * Bornes del componente con su lado y posición. Lo que el autor ubicó se
 * respeta (ajustado a la grilla); lo demás se reparte: entradas arriba,
 * salidas abajo.
 * @param {{ id: string, side?: "t" | "b" }[]} terminals bornes con su lado sugerido
 * @param {Record<string, { side?: string, x?: number }>} pins lo guardado en symbol.pins
 * @param {number} width
 */
export function layoutPins(terminals, pins, width) {
  /** @type {Record<string, { side: "t" | "b", x: number }>} */
  const out = {};
  const taken = { t: new Set(), b: new Set() };
  for (const t of terminals) {
    const p = pins?.[t.id];
    if (p && Number.isFinite(Number(p.x))) {
      const side = p.side === "b" ? "b" : "t";
      const x = Math.min(width - GRID, snap(p.x));
      out[t.id] = { side, x };
      taken[side].add(x);
    }
  }
  for (const t of terminals) {
    if (out[t.id]) continue;
    const side = t.side === "b" ? "b" : "t";
    let x = GRID;
    while (taken[side].has(x) && x < width - GRID) x += GRID;
    out[t.id] = { side, x };
    taken[side].add(x);
  }
  return out;
}

/** Ancho mínimo para que entren los bornes de cada lado. */
export function minWidth(terminals) {
  const n = (s) => terminals.filter((t) => (t.side === "b" ? "b" : "t") === s).length;
  return Math.max(n("t"), n("b"), 2) * GRID + GRID;
}

/**
 * symbol.svg completo.
 * @param {{ name?: string, symbol?: any }} spec
 * @param {{ id: string, side?: "t" | "b", label?: string }[]} terminals
 * @param {string | null} art SVG del autor (o null: caja con el nombre)
 */
export function symbolSvg(spec, terminals, art) {
  const sym = spec.symbol ?? {};
  const W = Math.max(snap(sym.width ?? 160, 40), minWidth(terminals));
  const H = snap(sym.height ?? 120, 60);
  const pins = layoutPins(terminals, sym.pins ?? {}, W);
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`);
  parts.push(`  <!-- Generado por el editor de componentes de JWPLC Sim. Contrato: docs/SIMBOLOS.md. -->`);
  if (art) {
    const { inner, viewBox } = cleanArt(art);
    // El dibujo ocupa la caja entre las borneras (24 px arriba y abajo), sin deformarse.
    parts.push(`  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="#f4f5f7" stroke="#1b1e22" stroke-width="1.4"/>`);
    parts.push(`  <svg x="4" y="24" width="${W - 8}" height="${Math.max(10, H - 48)}" viewBox="${viewBox.join(" ")}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
  } else {
    parts.push(`  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="#e4e7eb" stroke="#1b1e22" stroke-width="1.6"/>`);
    parts.push(`  <text x="${W / 2}" y="${H / 2 + 4}" font-size="12" font-weight="600" text-anchor="middle" fill="#1b1e22" font-family="sans-serif">${esc(spec.name ?? "")}</text>`);
  }
  // Indicadores en vivo: valor (texto) y luz (círculo que se enciende con la variable > 0,5).
  (sym.widgets ?? []).forEach((w, i) => {
    const x = Number(w.x) || 0;
    const y = Number(w.y) || 0;
    parts.push(`  <g data-widget="${i}">`);
    if (w.kind === "lamp") {
      parts.push(`  <circle cx="${x}" cy="${y}" r="${Number(w.r) || 6}" fill="#3a3f46" stroke="#1b1e22"/>`);
      parts.push(`  <circle data-show="out.${esc(w.var)}>0.5" cx="${x}" cy="${y}" r="${Number(w.r) || 6}" fill="${esc(w.color || "#37d67a")}" stroke="#1b1e22"/>`);
    } else {
      const d = Math.max(0, Math.min(4, Number(w.decimals ?? 1)));
      const unit = w.unit ? `:${esc(w.unit)}` : ":";
      parts.push(`  <rect x="${x - 34}" y="${y - 12}" width="68" height="17" rx="3" fill="#10161c" opacity="0.85"/>`);
      parts.push(`  <text data-text="out.${esc(w.var)}:d${d}${unit}" x="${x}" y="${y + 1}" font-size="11" text-anchor="middle" fill="#7fe0a4" font-family="monospace">—</text>`);
      if (w.label) parts.push(`  <text x="${x}" y="${y - 15}" font-size="9" text-anchor="middle" fill="#5b636c" font-family="sans-serif">${esc(w.label)}</text>`);
    }
    parts.push(`  </g>`);
  });
  // Bornes: tornillo, rótulo y la zona .jw-term (cx en la grilla).
  for (const t of terminals) {
    const p = pins[t.id];
    const cy = p.side === "t" ? 12 : H - 12;
    const ly = p.side === "t" ? 30 : H - 24;
    parts.push(`  <circle cx="${p.x}" cy="${cy}" r="7" fill="#f4f5f7" stroke="#1b1e22" stroke-width="1.2"/>`);
    parts.push(`  <path d="M${p.x - 4} ${cy}h8" stroke="#1b1e22" stroke-width="1.4"/>`);
    parts.push(`  <text x="${p.x}" y="${ly}" font-size="8.5" text-anchor="middle" fill="#1b1e22" font-family="sans-serif">${esc(t.id)}</text>`);
    parts.push(`  <circle class="jw-term" data-term="${esc(t.id)}" data-side="${p.side}" cx="${p.x}" cy="${cy}" r="9"/>`);
  }
  parts.push(`</svg>`);
  return { svg: parts.join("\n") + "\n", width: W, height: H, pins };
}
