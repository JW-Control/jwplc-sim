#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_OBJETIVOS: la solución de referencia de cada práctica y cada
// reto cumple todos sus objetivos en vivo (rubrica.json "goals") en las
// corridas de la rúbrica: sus casos y sus corridas de demostración
// ("goal_runs", cada una con los objetivos en cero). Así se sabe que los
// objetivos se pueden lograr y que la lección o el reto se puede marcar hecho.
// Informe en build/gates/objetivos.json.
//
// Uso: node scripts/gate-objetivos.mjs [01-marcha-parada curso-03 …]
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRACTICAS, RETOS } from "../cli/lib/aprende.mjs";
import { ROOT } from "../cli/lib/build.mjs";
import { gradeSketch, loadExercise } from "../cli/lib/grade.mjs";

const only = process.argv.slice(2);
const buildRoot = join(ROOT, "build", "grade");
const dirs = [RETOS, PRACTICAS].flatMap((base) =>
  readdirSync(base)
    .filter((d) => existsSync(join(base, d, `${d}.jwsim`)) && (!only.length || only.includes(d)))
    .sort()
    .map((d) => join(base, d)),
);
const report = { rows: [] };
let ok = true;
for (const dir of dirs) {
  const ex = loadExercise(dir);
  const need = (ex.rubric.goals ?? []).filter((g) => !g.extra).length;
  if (!need) {
    report.rows.push({ id: ex.id, ok: false, detail: "sin objetivos en vivo" });
    ok = false;
    console.log(`  ${ex.id} FALLA sin objetivos en vivo`);
    continue;
  }
  const g = await gradeSketch(ex, ex.solution, { buildRoot, goals: true });
  const pass = g.ok && g.goals.missing.length === 0;
  ok &&= pass;
  const detail = g.ok ? `${g.goals.done.length} cumplidos${g.goals.missing.length ? `; faltan: ${g.goals.missing.join(", ")}` : ""}${g.goals.extra.length ? ` (extra sin cumplir: ${g.goals.extra.join(", ")})` : ""}` : `${g.stage}: ${g.error}`;
  report.rows.push({ id: ex.id, ok: pass, detail });
  console.log(`  ${ex.id} ${pass ? "OK" : "FALLA"} ${detail}`);
}
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "objetivos.json"), JSON.stringify({ ...report, ok }, null, 2) + "\n");
console.log(`JWSIM_OBJETIVOS ${ok ? "PASS" : "FAIL"} (${dirs.length} ejercicios)`);
process.exit(ok ? 0 : 1);
