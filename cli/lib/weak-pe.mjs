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
// que en el ESP32. El resultado no depende del orden de los objetos.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const STRONG = new Set(["T", "D", "B", "R", "C", "S", "G", "I"]);

export function resolveWeakPE(tc, objectFiles, outDir) {
  const strong = new Set();
  const weakRefs = new Set();
  const defaults = new Map(); // X -> { name, type }
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
      if (name.startsWith(".weak.")) {
        const rest = name.slice(".weak.".length);
        const dot = rest.indexOf(".");
        if (dot > 0 && STRONG.has(type)) defaults.set(rest.slice(0, dot), { name, type });
      } else if (type === "w" || type === "W" || type === "v" || type === "V") {
        weakRefs.add(name);
      } else if (STRONG.has(type)) {
        strong.add(name);
      }
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
  return { asm, thunks, zeros };
}
