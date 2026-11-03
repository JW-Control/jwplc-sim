// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Copia de un ejercicio en la carpeta de trabajo del alumno.
//
// La primera vez se copia todo (sin la solución) y se anota en
// `.jwsim-ejercicio.json` el hash de cada archivo copiado. Al volver a
// abrirlo, los archivos que el alumno no tocó (mismo hash que al copiarlos) se
// ponen al día con la versión del Sim; lo que el alumno editó no se toca.
// Copias anteriores a la marca: el enunciado y la rúbrica se actualizan
// siempre y el sketch solo si sigue siendo la plantilla de antes (la que
// configuraba las E/S con pinMode).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const MARK = ".jwsim-ejercicio.json";
const ALWAYS = new Set(["ENUNCIADO.md", "rubrica.json"]);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "solucion" || dir !== base) out.push(...listFiles(p, base));
    } else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

// Plantilla anterior: igual a la actual salvo por la configuración de E/S.
const OLD_IO = /^[ \t]*for \(uint8_t i = 0; i < (I0|Q0)_COUNT; i\+\+\) pinMode\(\1_X\[i\], (INPUT|OUTPUT)\);\r?\n/gm;
const NEW_IO = /^[ \t]*\/\/ Las entradas y salidas del JWPLC ya vienen configuradas: no hace falta pinMode\.\r?\n/gm;
function isOldTemplate(old, now) {
  const a = old.toString("utf8");
  return a !== now.toString("utf8") && a.replace(OLD_IO, "") === now.toString("utf8").replace(NEW_IO, "");
}

// Copia o pone al día `dst` desde `src`; devuelve los archivos actualizados.
export function syncExercise(src, dst) {
  const files = listFiles(src);
  const markFile = join(dst, MARK);
  const fresh = !existsSync(dst);
  let mark = null;
  try {
    mark = JSON.parse(readFileSync(markFile, "utf8"));
  } catch {
    mark = null;
  }
  const hashes = {};
  const updated = [];
  for (const f of files) {
    const from = join(src, f);
    const to = join(dst, f);
    const now = readFileSync(from);
    hashes[f] = sha(now);
    if (!existsSync(to)) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
      if (!fresh) updated.push(f);
      continue;
    }
    const have = readFileSync(to);
    const cur = sha(have);
    if (cur === hashes[f]) continue;
    const untouched = mark ? mark.files?.[f] === cur : ALWAYS.has(f.split("/").pop()) || (f.endsWith(".ino") && isOldTemplate(have, now));
    if (untouched) {
      writeFileSync(to, now);
      updated.push(f);
    } else {
      // El alumno lo cambió: se conserva. La marca sigue siendo la de la
      // copia (o ninguna, si no se sabe), para no pisarlo más adelante.
      hashes[f] = mark?.files?.[f] ?? null;
    }
  }
  if (statSync(dst).isDirectory()) writeFileSync(markFile, `${JSON.stringify({ files: hashes }, null, 2)}\n`);
  return updated;
}
