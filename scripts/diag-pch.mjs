#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnóstico del header precompilado (JWSIM_G2_EXTERNAL_EDIT_RELOAD en
// Windows): genera el PCH del sketch con distintos niveles de información de
// depuración y mide su tamaño y la compilación del .ino con cada uno, más el
// -ftime-report del caso actual. Uso: node scripts/diag-pch.mjs
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";

const work = mkdtempSync(join(tmpdir(), "jwsim-pch-"));
const sketch = join(work, "diag_io");
cpSync(join(resolvePackageRoot().root, "tools", "build-speed-benchmark", "sketches", "02_io_basic"), sketch, { recursive: true });
renameSync(join(sketch, "02_io_basic.ino"), join(sketch, "diag_io.ino"));
await buildSketch(sketch, { log: () => {} });
writeFileSync(join(sketch, "diag_io.ino"), readFileSync(join(sketch, "diag_io.ino"), "utf8") + "\n// cambio\n");
process.env.JWSIM_BUILD_VERBOSE = "1";
const lines = [];
await buildSketch(sketch, { log: (m) => lines.push(m) });
const cmd = JSON.parse(lines.find((l) => l.startsWith("[cmd] ") && l.includes("diag_io.ino.cpp")).slice(6));
const [cc, ...args] = cmd;
const base = args.slice(0, args.indexOf("-o")).filter((a) => a !== "-MMD");
const inc = base.indexOf("-include");
const header = base[inc + 1];
const src = base[base.length - 1];
const flags = base.slice(0, inc).filter((a) => a !== "-c");
const rest = base.slice(inc + 2, -1).filter((a) => a !== "-Winvalid-pch");

const best = (a, n = 3) => {
  let ms = Infinity;
  let out = "";
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    const r = spawnSync(cc, a, { encoding: "utf8" });
    ms = Math.min(ms, performance.now() - t0);
    out = (r.stderr ?? "") + (r.status ? ` [código ${r.status}]` : "");
  }
  return { ms: Math.round(ms), out };
};

console.log(`compilador: ${cc}`);
const report = best([...base, "-o", join(work, "r.o"), "-ftime-report"], 1);
console.log("— -ftime-report del .ino con el PCH actual —");
console.log(report.out.split(/\r?\n/).filter((l) => /phase|PCH|TOTAL|template|preprocess|lexical|parser|symout/.test(l)).join("\n"));

console.log("— variantes del PCH (mejor de 3) —");
for (const g of ["-g", "-g1", "-g0"]) {
  const dir = join(work, `pch${g}`);
  mkdirSync(dir, { recursive: true });
  const h = join(dir, "prefix.h");
  writeFileSync(h, readFileSync(header, "utf8"));
  const f = flags.map((x) => (x === "-g" ? g : x));
  const gen = spawnSync(cc, ["-x", "c++-header", ...f.filter((x) => x !== "-x"), ...rest.filter((x) => x.startsWith("-I") || x.startsWith("-D")), h, "-o", h + ".gch"], { encoding: "utf8" });
  if (gen.status !== 0) {
    console.log(`${g}: no se generó el PCH: ${(gen.stderr ?? "").split(/\r?\n/).slice(0, 3).join(" | ")}`);
    continue;
  }
  const size = (statSync(h + ".gch").size / 1e6).toFixed(1);
  const syntax = best([...f, "-include", h, "-Winvalid-pch", ...rest, src, "-fsyntax-only"]);
  const full = best([...f, "-include", h, "-Winvalid-pch", ...rest, "-c", src, "-o", join(dir, "a.o")]);
  console.log(`${g.padEnd(4)} PCH ${size.padStart(6)} MB   análisis ${String(syntax.ms).padStart(5)} ms   objeto ${String(full.ms).padStart(5)} ms${/not used|código/.test(full.out) ? "   " + full.out.split(/\r?\n/).find((l) => /not used|código/.test(l)) : ""}`);
}
rmSync(work, { recursive: true, force: true });
