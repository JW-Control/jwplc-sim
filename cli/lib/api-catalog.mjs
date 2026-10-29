// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Catálogo de la API del JWPLC Basic para el autocompletado del editor,
// generado de los headers del package fijado (package.lock): así sigue a la
// versión del package sin una lista a mano.
//
//   pins       I0_x y Q0_x (variants/jwplcbasic/pins_is.h)
//   buttons    valores de JWPLCButtonId (BTN_*, sin BTN_COUNT)
//   globals    objetos globales `extern <Clase> JWPLC_*;` con los métodos
//              públicos de su clase que el sketch debe usar
//   functions  funciones libres JWPLC_* del core y JWPLCButtons::*
//
// Lo que maneja el runtime no se ofrece (docs de jwplc-firmware,
// GUIA_SKETCH_BASIC.md §2 y §5: el runtime arranca y atiende los objetos
// globales): begin*, end, update, tareas, escaneo y repetición de la botonera.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HIDDEN_METHOD = /^(begin\w*|end|init\w*|update|startTask|stopTask|setTaskPeriodMs|setScanDelays|setRepeat\w*)$/;
// JWPLC_LogicRuntime(_UI) es un proyecto aparte y pausado (CLAUDE.md de
// platform-jwplc): no se ofrece.
const HIDDEN_GLOBAL = /LogicRuntime/;

function headersOf(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!["examples", "extras", "test", "tests", "esp32"].includes(e.name)) headersOf(p, out);
    } else if (/\.(h|hpp)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Quita los comentarios, pero deja el último comentario antes de cada
// declaración como documentación (@@doc …@@).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/([^\n]*)/g, (_m, c) => {
      const t = c.trim().replace(/^[-=\s]+$/, "");
      return t ? `@@doc ${t.replace(/@@/g, "")}@@` : "";
    });
}

// Parámetros "uint8_t id, bool on = false" → [{ type, name, def }].
function parseParams(text) {
  const t = text.trim();
  if (!t || t === "void") return [];
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of t) {
    if (ch === "<" || ch === "(") depth++;
    if (ch === ">" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((p) => {
    const [decl, def] = p.split("=").map((s) => s.trim());
    const m = decl.match(/^(.*?)([A-Za-z_]\w*)\s*(\[\s*\])?$/);
    return m ? { type: (m[1] + (m[3] ?? "")).replace(/\s+/g, " ").trim(), name: m[2], ...(def !== undefined ? { def } : {}) } : { type: decl, name: "" };
  });
}

// Declaraciones de funciones públicas del cuerpo de una clase.
function publicMethods(body, className) {
  const out = [];
  let access = "private";
  let depth = 0;
  let stmt = "";
  let doc = "";
  let lastDoc = "";
  const flush = (end) => {
    const s = stmt.replace(/@@doc ([^@]*)@@/g, (_m, d) => ((lastDoc = d.trim()), " ")).replace(/\s+/g, " ").trim();
    stmt = "";
    const acc = s.match(/^(public|private|protected)\s*:\s*(.*)$/);
    let rest = s;
    if (acc) {
      access = acc[1];
      rest = acc[2];
    }
    if (access !== "public" || !rest) return;
    if (/^(enum|struct|class|typedef|using|friend|static_assert)\b/.test(rest)) return;
    const m = rest.match(/^(?:(?:virtual|static|inline|explicit|constexpr)\s+)*(.+?)\s*\b([A-Za-z_]\w*)\s*\((.*)\)\s*(const)?\s*(?:override|noexcept)?\s*$/);
    if (!m || m[2] === className || m[2].startsWith("operator") || /^[A-Z_]+$/.test(m[2])) return;
    const ret = m[1].trim();
    if (!ret || /[=(]/.test(ret)) return;
    out.push({ name: m[2], ret, params: parseParams(m[3]), ...(doc || lastDoc ? { doc: doc || lastDoc } : {}) });
    doc = "";
    lastDoc = end === "{" ? "" : lastDoc;
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (depth === 0) {
      if (ch === ";") {
        flush(";");
        lastDoc = "";
        continue;
      }
      if (ch === "{") {
        flush("{");
        depth = 1;
        continue;
      }
      if (ch === ":" && /\b(public|private|protected)\s*$/.test(stmt) && body[i + 1] !== ":") {
        access = stmt.match(/\b(public|private|protected)\s*$/)[1];
        stmt = "";
        continue;
      }
      stmt += ch;
    } else {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth === 0) {
        stmt = "";
        // fin de un bloque (cuerpo inline, enum, struct): lo que sigue hasta ';' se descarta
        const semi = body.indexOf(";", i);
        const brace = body.indexOf("\n", i);
        if (semi >= 0 && (brace < 0 || semi < brace)) i = semi;
      }
    }
  }
  return out;
}

function classBody(src, className) {
  const re = new RegExp(`\\b(?:class|struct)\\s+${className}\\b[^;{]*\\{`, "g");
  const m = re.exec(src);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < src.length && depth; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  const body = src.slice(start, i - 1);
  // En un struct todo es público.
  return /^\s*struct/.test(m[0]) || m[0].startsWith("struct") ? `public: ${body}` : body;
}

const sig = (name, f) => `${f.ret} ${name}(${f.params.map((p) => `${p.type} ${p.name}${p.def !== undefined ? ` = ${p.def}` : ""}`.trim()).join(", ")})`;

/** Catálogo de la API a partir del árbol JWPLC/2.1.0 del package. */
export function buildApiCatalog(pkgTree) {
  const files = [...headersOf(join(pkgTree, "cores", "jwcontrol")), ...headersOf(join(pkgTree, "libraries")), join(pkgTree, "variants", "jwplcbasic", "pins_is.h")];
  const sources = files.filter(existsSync).map((f) => ({ file: f, src: stripComments(readFileSync(f, "utf8")) }));
  const all = sources.map((s) => s.src).join("\n");

  const pinsSrc = readFileSync(join(pkgTree, "variants", "jwplcbasic", "pins_is.h"), "utf8");
  const pins = {
    inputs: [...pinsSrc.matchAll(/\b(I0_\d+)\s*=/g)].map((m) => m[1]),
    outputs: [...pinsSrc.matchAll(/\b(Q0_\d+)\s*=/g)].map((m) => m[1]),
  };

  const btnEnum = all.match(/enum\s+JWPLCButtonId[^{]*\{([^}]*)\}/);
  const buttons = btnEnum ? [...btnEnum[1].matchAll(/\b(BTN_[A-Z]+)\b/g)].map((m) => m[1]).filter((b) => b !== "BTN_COUNT") : [];

  const globals = [];
  const seen = new Set();
  for (const m of all.matchAll(/\bextern\s+([A-Za-z_]\w*)\s+(JWPLC_\w+)\s*;/g)) {
    const [, cls, name] = m;
    if (seen.has(name) || HIDDEN_GLOBAL.test(name)) continue;
    seen.add(name);
    const body = sources.map((s) => classBody(s.src, cls)).find(Boolean);
    if (!body) continue;
    const members = publicMethods(body, cls)
      .filter((f) => !HIDDEN_METHOD.test(f.name))
      .map((f) => ({ ...f, signature: sig(f.name, f) }));
    // Sobrecargas: una entrada por nombre, con todas las firmas.
    const byName = new Map();
    for (const f of members) {
      if (!byName.has(f.name)) byName.set(f.name, { ...f, signatures: [] });
      byName.get(f.name).signatures.push(f.signature);
    }
    globals.push({ name, cls, members: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }

  const functions = [];
  for (const { src } of sources) {
    // Funciones libres: JWPLC_ seguido de minúscula (las clases y tipos van en mayúscula).
    for (const m of src.matchAll(/^\s*((?:const\s+)?[A-Za-z_][\w:]*\s*\*?)\s+(JWPLC_[a-z]\w*)\s*\(([^)]*)\)\s*;/gm)) {
      const f = { name: m[2], ret: m[1].trim(), params: parseParams(m[3]) };
      if (!functions.some((x) => x.name === f.name)) functions.push({ ...f, signature: sig(f.name, f) });
    }
  }
  const ns = all.match(/namespace\s+JWPLCButtons\s*\{([^}]*)\}/);
  if (ns) {
    for (const m of ns[1].matchAll(/([A-Za-z_][\w:]*\s*\*?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/g)) {
      if (HIDDEN_METHOD.test(m[2])) continue;
      const f = { name: `JWPLCButtons::${m[2]}`, ret: m[1].trim(), params: parseParams(m[3]) };
      functions.push({ ...f, signature: sig(f.name, f) });
    }
  }
  functions.sort((a, b) => a.name.localeCompare(b.name));
  return { pins, buttons, globals: globals.sort((a, b) => a.name.localeCompare(b.name)), functions };
}
