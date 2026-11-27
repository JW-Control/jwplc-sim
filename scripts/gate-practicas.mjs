#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_PRACTICAS: prácticas evaluadas del curso
// (JWPLC_Aprende/extras/practicas/curso-NN). Informe en
// build/gates/practicas.json.
//
//   P1 la solución de referencia en C++ saca 20/20
//   P2 el punto de partida (el ejemplo de la lección, tal cual) no aprueba:
//      la práctica pide algo que el ejemplo no hace
//      (ruta IEC: el programa de partida en cada lenguaje, iniciar/ST|LD|FBD)
//   P3 cada solución IEC 61131-3 (carpeta de solucion/ con project.json del
//      OpenPLC Editor) saca 20/20 con la misma rúbrica
//
// Uso: node scripts/gate-practicas.mjs [curso-03 …]
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRACTICAS } from "../cli/lib/aprende.mjs";
import { ROOT } from "../cli/lib/build.mjs";
import { gradeSketch, loadExercise } from "../cli/lib/grade.mjs";
import { isOpenPlcProject } from "../cli/lib/openplc.mjs";

const only = process.argv.slice(2);
const buildRoot = join(ROOT, "build", "grade");
const ids = readdirSync(PRACTICAS).filter((d) => existsSync(join(PRACTICAS, d, `${d}.jwsim`)) && (!only.length || only.includes(d))).sort();
const report = { host: `${process.platform}-${process.arch}`, practicas: [] };
let ok = true;
const fails = (g) => g.cases?.flatMap((c) => c.checks.filter((k) => !k.ok).map((k) => `${k.description}: ${k.detail ?? ""}`)) ?? [g.error];

for (const id of ids) {
  const ex = loadExercise(join(PRACTICAS, id));
  const row = { id, checks: [] };
  const add = (k, pass, detail) => {
    row.checks.push({ k, ok: pass, detail });
    ok &&= pass;
    console.log(`  ${id} ${k} ${pass ? "OK" : "FALLA"} ${detail}`);
  };
  const iec = isOpenPlcProject(ex.solution);
  const sol = await gradeSketch(ex, ex.solution, { buildRoot });
  add("P1", sol.ok && sol.grade === 20, `solución ${iec ? `IEC ${ex.solution.split(/[\\/]/).pop()}` : "C++"}: ${sol.grade}/20 ${sol.grade === 20 ? "" : fails(sol).join(" | ")}`);
  const iniDir = join(ex.dir, "iniciar");
  const starts = existsSync(iniDir) ? readdirSync(iniDir).filter((x) => isOpenPlcProject(join(iniDir, x))).map((x) => join(iniDir, x)) : [ex.sketch];
  for (const s of starts) {
    const start = await gradeSketch(ex, s, { buildRoot });
    add("P2", start.ok && start.grade < 20, `punto de partida${existsSync(iniDir) ? ` ${s.split(/[\\/]/).pop()}` : ""}: ${start.ok ? `${start.grade}/20` : `no compila: ${start.error ?? ""}`}`);
  }
  const solDir = join(ex.dir, "solucion");
  for (const d of readdirSync(solDir).filter((x) => isOpenPlcProject(join(solDir, x)) && join(solDir, x) !== ex.solution)) {
    const g = await gradeSketch(ex, join(solDir, d), { buildRoot });
    add("P3", g.ok && g.grade === 20, `solución IEC ${d}: ${g.grade}/20 ${g.grade === 20 ? "" : fails(g).join(" | ")}`);
  }
  report.practicas.push(row);
}
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "practicas.json"), JSON.stringify({ ...report, ok }, null, 2) + "\n");
console.log(`JWSIM_PRACTICAS ${ok ? "PASS" : "FAIL"} (${ids.length} prácticas)`);
process.exit(ok ? 0 : 1);
