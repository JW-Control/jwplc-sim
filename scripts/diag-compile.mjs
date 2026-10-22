#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnóstico de la recompilación del sketch (JWSIM_G2_LOCAL_COMPILE): mide
// por separado el arranque del compilador, la carga del header precompilado
// y la compilación del .ino con y sin él, en el host donde se ejecuta.
//
//   node scripts/diag-compile.mjs [--target windows]
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { targetArg } from "./lib/gate-util.mjs";

const target = targetArg();
const work = mkdtempSync(join(tmpdir(), "jwsim-diag-"));
const sketch = join(work, "diag_io");
cpSync(join(resolvePackageRoot().root, "tools", "build-speed-benchmark", "sketches", "02_io_basic"), sketch, { recursive: true });
renameSync(join(sketch, "02_io_basic.ino"), join(sketch, "diag_io.ino"));

// Primera compilación (no se mide) y captura del comando exacto del .ino.
await buildSketch(sketch, { target, log: () => {} });
writeFileSync(join(sketch, "diag_io.ino"), readFileSync(join(sketch, "diag_io.ino"), "utf8") + "\n// cambio\n");
process.env.JWSIM_BUILD_VERBOSE = "1";
const lines = [];
await buildSketch(sketch, { target, timing: true, log: (m) => lines.push(m) });
delete process.env.JWSIM_BUILD_VERBOSE;
const cmdLine = lines.find((l) => l.startsWith("[cmd] ") && l.includes("diag_io.ino.cpp"));
if (!cmdLine) throw new Error("no se capturó el comando del sketch");
const argv = JSON.parse(cmdLine.slice(6));
const [cc, ...args] = argv;
const outIdx = args.indexOf("-o");
const base = args.slice(0, outIdx);
const inc = base.indexOf("-include");
const pch = inc >= 0 && /prefix/.test(base[inc + 1]) ? base[inc + 1] + ".gch" : null;
const noPch = base.filter((a, i) => !(pch && (i === inc || i === inc + 1)) && a !== "-Winvalid-pch");

const time = (label, a) => {
  const best = [];
  let out = "";
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    const r = spawnSync(cc, a, { encoding: "utf8" });
    best.push(performance.now() - t0);
    out = (r.stderr ?? "") + (r.status !== 0 ? ` (código ${r.status})` : "");
  }
  const ms = Math.round(Math.min(...best));
  console.log(`${label.padEnd(44)} ${String(ms).padStart(6)} ms${/not used|código/.test(out) ? `   ${out.split(/\r?\n/).find((l) => /not used|código/.test(l))}` : ""}`);
  return ms;
};

const empty = join(work, "vacio.cpp");
writeFileSync(empty, "int x;\n");
console.log(`compilador: ${cc}`);
if (pch) console.log(`header precompilado: ${(statSync(pch).size / 1e6).toFixed(1)} MB`);
console.log("fases del build incremental:", lines.filter((l) => l.startsWith("[tiempo]")).map((l) => l.slice(9)).join(" · "));
console.log("— mejor de 3 corridas —");
time("archivo vacío (arranque de cc1plus + as)", ["-c", empty, "-o", join(work, "v.o")]);
if (pch) time("sketch con PCH, solo análisis", [...base, "-fsyntax-only"]);
if (pch) time("sketch con PCH, objeto completo", [...base, "-o", join(work, "a.o")]);
time("sketch sin PCH, objeto completo", [...noPch, "-o", join(work, "b.o")]);
