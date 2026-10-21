// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Resolución de símbolos `weak` para enlazar con MinGW-w64 GCC (PE/COFF).
//
// En ELF (ESP32, Linux) una definición `__attribute__((weak))` o un alias
// weak es un símbolo global que el enlazador usa si no hay otro fuerte, y una
// referencia weak sin definición vale 0. GCC para MinGW los emite como
// "weak externals" de COFF (`w X` con un valor por defecto `.weak.X.<otro>`),
// y GNU ld 2.41 / lld 18 no los resuelven cuando otro objeto referencia X:
// "undefined reference to X" (hallazgo H11 en docs/ARCHITECTURE.md). El
// package usa ambos patrones (callbacks de jwplc_peripherals.cpp, profilers
// H3E, alias de esp32-hal-*.c, `yield`).
//
// Antes de enlazar se recorre cada objeto con nm y se genera un objeto con:
//   - X: jmp .weak.X.<otro>  cuando X no tiene definición fuerte en ningún
//                            objeto (equivale a elegir la definición weak);
//   - X = 0                  cuando X solo tiene referencias weak, sin
//                            definición (como ELF: `if (callback)` es falso).
// Si existe una definición fuerte no se genera nada y gana la fuerte, igual
// que en el ESP32.
//
// GCC nombra el valor por defecto `.weak.X.<primer símbolo global del
// archivo>`; dos unidades pueden generar el mismo nombre (p. ej. ambas
// empiezan con el `snprintf` inline de MinGW) y el enlace falla con
// "multiple definition of .weak.X...". Esos nombres se renombran con objcopy
// en una copia del objeto (la caché compartida no se toca).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const STRONG = new Set(["T", "D", "B", "R", "C", "S", "G", "I"]);

// Devuelve { asm, objects, thunks, zeros, renamed }: `objects` es la lista de
// objetos a enlazar (con las copias renombradas donde hizo falta).
export function resolveWeakPE(tc, objectFiles, outDir) {
  const strong = new Set();
  const weakRefs = new Set();
  const defaults = new Map(); // X -> { name, type, file }
  const defaultOwners = new Map(); // .weak.X.Y -> [archivos]
  // nm por lotes para no exceder la longitud de línea de comandos.
  for (let i = 0; i < objectFiles.length; i += 200) {
    const batch = objectFiles.slice(i, i + 200);
    const r = spawnSync(tc.nm[0], [...tc.nm.slice(1), "-P", "-A", ...batch], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`nm falló: ${r.stderr}`);
    for (const line of r.stdout.split(/\r?\n/)) {
      // "<archivo>: <nombre> <tipo> [valor] [tamaño]"
      const m = line.match(/: (\S+) ([A-Za-z?]) ?/);
      if (!m) continue;
      const [, name, type] = m;
      const file = line.slice(0, m.index);
      if (name.startsWith(".weak.")) {
        defaultOwners.set(name, [...(defaultOwners.get(name) ?? []), file]);
        const rest = name.slice(".weak.".length);
        const dot = rest.indexOf(".");
        // La primera definición en orden de enlace, como el enlazador ELF.
        if (dot > 0 && STRONG.has(type) && !defaults.has(rest.slice(0, dot))) {
          defaults.set(rest.slice(0, dot), { name, type, file });
        }
      } else if (type === "w" || type === "W" || type === "v" || type === "V") {
        weakRefs.add(name);
      } else if (STRONG.has(type)) {
        strong.add(name);
      }
    }
  }

  // Nombres de valor por defecto repetidos: renombrar en cada objeto.
  const renames = new Map(); // archivo -> [[viejo, nuevo]]
  for (const [name, files] of defaultOwners) {
    if (files.length < 2) continue;
    files.forEach((f, i) => renames.set(f, [...(renames.get(f) ?? []), [name, `${name}.jwsim${i}`]]));
  }
  const fixDir = join(outDir, "obj", "weak-pe");
  mkdirSync(fixDir, { recursive: true });
  const patched = new Map();
  for (const [file, pairs] of renames) {
    const out = join(fixDir, basename(file));
    const r = spawnSync(tc.objcopy[0], [...tc.objcopy.slice(1), ...pairs.flatMap(([a, b]) => ["--redefine-sym", `${a}=${b}`]), file, out], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`objcopy falló para ${file}: ${r.stderr}`);
    patched.set(file, out);
    for (const d of defaults.values()) {
      const pair = d.file === file && pairs.find(([a]) => a === d.name);
      if (pair) d.name = pair[1];
    }
  }

  const lines = [
    "# Generado por cli/lib/weak-pe.mjs: resolución de símbolos weak para PE/COFF.",
    ".text",
  ];
  const dataWeak = [];
  let thunks = 0;
  let zeros = 0;
  for (const x of [...weakRefs].sort()) {
    if (strong.has(x)) continue;
    const d = defaults.get(x);
    if (d && d.type !== "T") {
      dataWeak.push(x);
      continue;
    }
    lines.push(`.globl "${x}"`);
    if (d) {
      lines.push(`"${x}": jmp "${d.name}"`);
      thunks++;
    } else {
      lines.push(`.set "${x}", 0`);
      zeros++;
    }
  }
  if (dataWeak.length) {
    throw new Error(`variables weak sin definición fuerte no soportadas en Windows: ${dataWeak.join(", ")}`);
  }
  const asm = join(outDir, "jwsim_weak_pe.S");
  writeFileSync(asm, lines.join("\n") + "\n");
  return { asm, objects: objectFiles.map((f) => patched.get(f) ?? f), thunks, zeros, renamed: patched.size };
}
