// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prototipos automáticos para el .ino preprocesado, como arduino-cli: cada
// función definida en el ámbito global de las pestañas .ino recibe un
// prototipo antes de la primera definición de función, para poder llamarla
// antes de su definición.
//
// Reglas (las de arduino-cli/ctags, con las mismas limitaciones conocidas):
//   - solo funciones de ámbito global (no métodos `A::f`, no dentro de
//     namespace/clase/struct);
//   - se omiten las que ya tienen una declaración, las plantillas y las que
//     tienen argumentos por defecto (repetirlos en el prototipo sería un error);
//   - cada prototipo lleva un #line a la línea de su definición y al final se
//     resincroniza con #line, así los errores siguen apuntando al .ino.

const KEYWORDS = new Set(["if", "while", "for", "switch", "return", "catch", "sizeof", "do", "else", "case"]);
const AGGREGATE = /^(?:typedef\s+)?(?:struct|class|union|enum|namespace)\b/;

// Reemplaza comentarios, literales y directivas del preprocesador por
// espacios (conservando los saltos de línea) para analizar solo código.
function blank(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  let lineStart = true;
  const fill = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = src[i];
    if (lineStart && /\s/.test(c) && c !== "\n") {
      i++;
      continue;
    }
    if (lineStart && c === "#") {
      let j = i;
      while (j < n && !(src[j] === "\n" && src[j - 1] !== "\\")) j++;
      fill(i, j);
      i = j;
      continue;
    }
    lineStart = c === "\n";
    if (c === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      fill(i, j);
      i = j;
    } else if (c === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j < 0 ? n : j + 2;
      fill(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      // Literal crudo R"x(...)x" incluido.
      if (c === '"' && src[i - 1] === "R") {
        const open = src.indexOf("(", i);
        const delim = src.slice(i + 1, open);
        const close = src.indexOf(`)${delim}"`, open);
        const end = close < 0 ? n : close + delim.length + 2;
        fill(i + 1, end - 1);
        i = end;
        continue;
      }
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      fill(i + 1, Math.min(j, n));
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

// Índice → { file, line } según las directivas #line del texto original.
function lineMapper(src) {
  const marks = [];
  const re = /^#line (\d+) "([^"]*)"\s*$/gm;
  let m;
  while ((m = re.exec(src))) marks.push({ at: m.index + m[0].length + 1, line: Number(m[1]), file: m[2] });
  return (pos) => {
    let mark = null;
    for (const k of marks) if (k.at <= pos) mark = k;
    if (!mark) return null;
    let line = mark.line;
    for (let k = mark.at; k < pos; k++) if (src[k] === "\n") line++;
    return { file: mark.file, line };
  };
}

function topLevelParens(header) {
  // Posición del primer "(" de nivel 0 y su cierre.
  let depth = 0;
  let open = -1;
  for (let i = 0; i < header.length; i++) {
    const c = header[i];
    if (c === "(" || c === "[" || c === "<") {
      if (c === "(" && depth === 0 && open < 0) open = i;
      if (c !== "<") depth++;
    } else if (c === ")" || c === "]") {
      depth--;
      if (depth === 0 && open >= 0 && c === ")") return { open, close: i };
    }
  }
  return null;
}

function hasTopLevelAssign(params) {
  let depth = 0;
  for (const c of params) {
    if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c)) depth--;
    else if (c === "=" && depth === 0) return true;
  }
  return false;
}

// Devuelve { functions: [{ name, proto, start, defLine }], declared: Set }.
export function findFunctions(src) {
  const code = blank(src);
  const functions = [];
  const declared = new Set();
  let depth = 0;
  let stmtStart = 0; // inicio del enunciado actual en nivel 0
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "{") {
      if (depth === 0) {
        const header = code.slice(stmtStart, i).trim();
        const fn = parseHeader(header);
        if (fn) {
          const start = stmtStart + code.slice(stmtStart, i).indexOf(header);
          functions.push({ ...fn, start, proto: src.slice(start, start + header.length).replace(/\s+/g, " ").trim() });
        }
      }
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) stmtStart = i + 1;
    } else if (c === ";" && depth === 0) {
      const stmt = code.slice(stmtStart, i).trim();
      const p = topLevelParens(stmt);
      if (p && !/=/.test(stmt.slice(0, p.open))) {
        const m = stmt.slice(0, p.open).match(/([A-Za-z_]\w*)\s*$/);
        if (m) declared.add(m[1]);
      }
      stmtStart = i + 1;
    }
  }
  return { functions, declared };
}

function parseHeader(header) {
  if (!header || AGGREGATE.test(header) || /^template\b/.test(header) || /^extern\s+"/.test(header)) return null;
  const p = topLevelParens(header);
  if (!p) return null;
  const before = header.slice(0, p.open).trim();
  if (/[=]/.test(before)) return null;
  const m = before.match(/^(.*?)([A-Za-z_]\w*)$/s);
  if (!m) return null;
  const name = m[2];
  const type = m[1].trim();
  if (!type || KEYWORDS.has(name) || type.endsWith("::") || /::\s*$/.test(type) || /operator\s*$/.test(type)) return null;
  // Tras ")": solo calificadores (const, noexcept, override, atributos).
  const after = header.slice(p.close + 1).trim();
  if (after && !/^(?:const|noexcept|override|final|throw\s*\(\s*\)|__attribute__\s*\(\(.*\)\)|\s)*$/s.test(after)) return null;
  const params = header.slice(p.open + 1, p.close);
  if (hasTopLevelAssign(params)) return { name, skip: "argumentos por defecto" };
  return { name };
}

// Inserta los prototipos en el texto preprocesado (con #line) y lo devuelve.
export function addPrototypes(src) {
  const { functions, declared } = findFunctions(src);
  const defs = functions.filter((f) => !f.skip && !declared.has(f.name));
  if (!functions.length) return src;
  const where = lineMapper(src);
  const first = functions[0].start;
  // Inicio de la línea de la primera definición.
  const insertAt = src.lastIndexOf("\n", first - 1) + 1;
  const resync = where(insertAt);
  if (!resync || !defs.length) return src;
  const seen = new Set();
  const lines = [];
  for (const f of defs) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    const loc = where(f.start);
    lines.push(`#line ${loc.line} "${loc.file}"`, `${f.proto};`);
  }
  lines.push(`#line ${resync.line} "${resync.file}"`);
  return src.slice(0, insertAt) + lines.join("\n") + "\n" + src.slice(insertAt);
}
