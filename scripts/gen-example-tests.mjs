#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera el borrador de tests/examples/<librería>/<ejemplo>.jwtest.json para
// los ejemplos del package que aún no tienen prueba (G5 EXAMPLES_MATRIX):
// corre el ejemplo sin estímulos y propone como esperado las primeras líneas
// distintas de la consola (números como \d+). El borrador se revisa a mano
// (estímulos y expectativas propias del ejemplo) antes de versionarlo.
//
// Uso: node scripts/gen-example-tests.mjs [--filter texto] [--until ms] [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { packageExamples, testFileFor } from "../cli/lib/matrix.mjs";
import { parseTimeline, runExe } from "../cli/lib/runner.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";

const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const filter = opt("--filter");
const until = Number(opt("--until") ?? 8000);
const force = argv.includes("--force");

const pkg = resolvePackageRoot();
const expect = JSON.parse(readFileSync(join(ROOT, "tests", "matrix-expectations.json"), "utf8"));
const dumpDir = join(ROOT, "build", "examples-gen");

// Línea de consola → expresión regular: texto literal, hexadecimales y
// números genéricos.
function lineRegex(text) {
  const parts = text.trimEnd().split(/(0x[0-9A-Fa-f]+|-?\d+(?:\.\d+)?)/);
  return (
    "^" +
    parts
      .map((p, i) => (i % 2 ? (p.startsWith("0x") ? "0x[0-9A-Fa-f]+" : "-?\\d+(?:\\.\\d+)?") : p.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")))
      .join("")
  );
}

for (const ex of packageExamples(pkg).filter((e) => !filter || e.rel.includes(filter))) {
  const file = testFileFor(ex);
  if (expect.obsolete[ex.rel] ?? expect.packageIssue?.[ex.rel] ?? expect.externalLibrary?.[ex.rel]) continue;
  if (existsSync(file) && !force) continue;
  let exe;
  try {
    ({ exe } = await buildSketch(ex.dir, { outDir: join(ROOT, "build", "examples", "native", ex.rel.replaceAll("/", "__")), package: pkg, log: () => {} }));
  } catch (err) {
    console.log(`NO COMPILA ${ex.lib}/${ex.name}: ${err.message.split("\n")[0]}`);
    continue;
  }
  const r = runExe(exe, ["--until", String(until)], { timeoutMs: 300000 });
  const lines = parseTimeline(r.stdout).filter((e) => e.kind === "UART" && e.text.trim());
  mkdirSync(join(dumpDir, ex.lib), { recursive: true });
  writeFileSync(join(dumpDir, ex.lib, `${ex.name.replaceAll("/", "__")}.txt`), `exit=${r.status}\n${r.stderr}\n${r.stdout}`);
  const seen = new Set();
  const console_ = [];
  for (const l of lines) {
    const re = lineRegex(l.text);
    if (seen.has(re) || l.port !== 0) continue;
    seen.add(re);
    console_.push(re);
    if (console_.length >= 3) break;
  }
  const test = {
    $schema: "../../../schema/jwsim-test-1.json",
    sketch: `package:libraries/${ex.lib}/examples/${ex.name}`,
    until_ms: until,
    expect: { ...(console_.length ? { console: console_ } : {}) },
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(test, null, 2) + "\n");
  console.log(`${r.status === 0 ? "OK  " : `EXIT ${r.status}`} ${ex.lib}/${ex.name}: ${lines.length} líneas de consola`);
}
