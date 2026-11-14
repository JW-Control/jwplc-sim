// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Validación de los símbolos .svg de un dispositivo (contrato en
// docs/SIMBOLOS.md) sin navegador, para `jwsim-cli device test`, `device
// link` y el gestor de dispositivos de la app. Las mismas reglas de grilla
// que aplica la app al cargar la plantilla (app/renderer/scene-symbols.js):
//   - viewBox "0 0 ANCHO ALTO" con ANCHO y ALTO múltiplos de 20;
//   - cada borne, un elemento .jw-term con data-term y cx múltiplo de 20;
//   - cada data-term es un borne de la definición, sin repetir.
// Errores: el símbolo no se usaría. Avisos: se usa, pero falta algo (un
// borne sin dibujar no se puede cablear) o se quitará al cargarlo.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const GRID = 20;

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[3] ?? m[4]]));
const hasClass = (a, c) => String(a.class ?? "").split(/\s+/).includes(c);

/**
 * @param {string} text contenido del .svg
 * @param {{ terminals?: { id: string }[] }} [def] definición del dispositivo
 * @returns {{ errors: string[], warnings: string[], w?: number, h?: number, terms: string[] }}
 */
export function checkSymbolSvg(text, def) {
  const errors = [];
  const warnings = [];
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return { errors: ["no es un SVG (falta <svg>)"], warnings, terms: [] };
  const vb = String(attrs(root).viewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  let w;
  let h;
  if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x))) errors.push('falta viewBox="0 0 ANCHO ALTO"');
  else {
    [, , w, h] = vb;
    if (vb[0] !== 0 || vb[1] !== 0) errors.push(`el viewBox debe empezar en 0 0 (tiene ${vb[0]} ${vb[1]})`);
    if (w % GRID || h % GRID) errors.push(`ancho y alto deben ser múltiplos de ${GRID} (${w} × ${h})`);
  }
  const terms = [];
  const known = new Set((def?.terminals ?? []).map((t) => t.id));
  for (const m of text.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (!hasClass(a, "jw-term")) continue;
    const id = a["data-term"];
    if (!id) {
      errors.push("un .jw-term no tiene data-term");
      continue;
    }
    if (terms.includes(id)) errors.push(`el borne ${id} está dos veces`);
    terms.push(id);
    const x = Number(a.cx ?? a.x);
    if (!Number.isFinite(x)) errors.push(`el borne ${id} no tiene cx`);
    else if (x % GRID) errors.push(`el borne ${id} debe tener cx múltiplo de ${GRID} (tiene ${x}); el cable entra en la grilla`);
    const side = a["data-side"];
    if (side && !["t", "b"].includes(side)) errors.push(`el borne ${id}: data-side es t o b (tiene ${side})`);
    if (known.size && !known.has(id)) errors.push(`el borne ${id} no está en la definición (bornes: ${[...known].join(", ")})`);
  }
  if (!terms.length && known.size) warnings.push("no marca ningún borne (.jw-term): no se podrá cablear");
  const missing = [...known].filter((id) => !terms.includes(id));
  if (terms.length && missing.length) warnings.push(`bornes de la definición sin dibujar (no se podrán cablear): ${missing.join(", ")}`);
  if (/<script\b/i.test(text)) warnings.push("<script> se quita al cargar");
  if (/<foreignObject\b/i.test(text)) warnings.push("<foreignObject> se quita al cargar");
  if (/\son[a-z]+\s*=/i.test(text)) warnings.push("los atributos on… se quitan al cargar");
  if (/javascript:/i.test(text)) warnings.push("los enlaces javascript: se quitan al cargar");
  for (const m of text.matchAll(/<image\b[^>]*>/gi)) {
    const href = attrs(m[0]).href ?? attrs(m[0])["xlink:href"] ?? "";
    if (!/^data:image\/(png|jpeg|svg\+xml)/.test(href)) warnings.push(`una <image> que no está incrustada se quita al cargar (${href.slice(0, 40)})`);
  }
  return { errors, warnings, w, h, terms };
}

/**
 * Símbolos de la carpeta de un dispositivo (symbol.svg y symbol__<variante>.svg).
 * @param {string} dir @param {{ type: string, terminals?: { id: string }[] }[]} defs
 * @returns {{ file: string, errors: string[], warnings: string[] }[]}
 */
export function checkDeviceSymbols(dir, defs) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => /^symbol(__[a-z0-9]+)?\.svg$/.test(f));
  const def = defs[0];
  return files.map((f) => {
    const r = checkSymbolSvg(readFileSync(join(dir, f), "utf8"), def);
    // Una variante puede no dibujar todos los bornes (SIMBOLOS.md §1.1): sin aviso.
    return { file: f, errors: r.errors, warnings: f === "symbol.svg" ? r.warnings : r.warnings.filter((x) => !x.startsWith("bornes de la definición")) };
  });
}
