#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Compila y ejecuta los tests de modelos (tests/models/*_test.cpp) contra el
// motor y los modelos, sin firmware. Uso: node scripts/test-models.mjs [--target windows] [--only <modelo>]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";

const target = process.argv.includes("--target") ? process.argv[process.argv.indexOf("--target") + 1] : "native";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const tc = toolchain(target);
const outDir = join(ROOT, "build", `models-${target}`);
mkdirSync(outDir, { recursive: true });

const listCpp = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .filter((f) => f.endsWith(".cpp"))
        .map((f) => join(dir, f))
    : [];
const support = [...listCpp(join(ROOT, "sim", "engine", "src")), ...listCpp(join(ROOT, "sim", "models"))];
const includes = ["sim/engine/include", "sim/models/include", "tests/models"].map((d) => `-I${join(ROOT, d)}`);

let failed = 0;
for (const test of readdirSync(join(ROOT, "tests", "models")).filter((f) => f.endsWith("_test.cpp") && (!only || f === `${only}_test.cpp`)).sort()) {
  const exe = join(outDir, test.replace(/\.cpp$/, tc.exeSuffix));
  const args = [...tc.cxx.slice(1), ...tc.cxxflags, ...includes, join(ROOT, "tests", "models", test), ...support, ...tc.ldflags, "-o", exe];
  const b = spawnSync(tc.cxx[0], args, { encoding: "utf8" });
  if (b.status !== 0) {
    console.log(`${test}: no compila\n${b.stderr}`);
    failed++;
    continue;
  }
  const runner = target === "windows" && process.platform !== "win32" ? ["/usr/lib/wine/wine64", exe] : [exe];
  const r = spawnSync(runner[0], runner.slice(1), { encoding: "utf8", env: { ...process.env, WINEDEBUG: "-all" } });
  process.stdout.write(r.stdout);
  if (r.status !== 0) failed++;
}
console.log(failed ? `RESULTADO: ${failed} suite(s) con fallas` : "RESULTADO: todas las suites pasan");
process.exit(failed ? 1 : 0);
