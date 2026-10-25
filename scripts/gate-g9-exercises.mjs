#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gates JWSIM_G9_EXERCISES y JWSIM_G9_AUTOGRADING (docs/GATES.md). Informe en
// build/gates/g9-exercises.json.
//
// EXERCISES
//   E1 los ocho ejercicios objetivo de la propuesta están en exercises/
//   E2 cada uno es un proyecto .jwsim válido con enunciado, rúbrica válida y
//      una escena sin avisos de cableado
//   E3 la plantilla compila y saca una nota baja (≤ 2); la solución de
//      referencia saca 20/20
// AUTOGRADING
//   A1 misma nota y mismo hash de traza por caso en 100 corridas (una
//      variante con nota parcial: recorre aciertos, fallas y requisitos)
//   A2 los errores típicos de tests/grading sacan nota parcial (0 < nota < 20)
//   A3 app: JWSIM_G9_E2E.json (xvfb-run -a node app/tests/e2e-g9.mjs)
//
// Uso: node scripts/gate-g9-exercises.mjs [--runs N]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { gradeSketch, loadExercise } from "../cli/lib/grade.mjs";
import { registryWithInstalled } from "../cli/lib/device.mjs";
import { Scene } from "../scene/scene.mjs";

const argv = process.argv.slice(2);
const RUNS = argv.includes("--runs") ? Number(argv[argv.indexOf("--runs") + 1]) : 100;
const buildRoot = join(ROOT, "build", "grade");
const TOPICS = {
  "marcha-parada": "Start/Stop",
  "inversion-giro": "inversión de giro",
  semaforo: "semáforo",
  "bomba-niveles": "bomba por niveles",
  puerta: "puerta",
  "estrella-triangulo": "estrella-triángulo",
  "cinta-contador": "cinta",
  alarma: "alarmas",
};
const report = { host: `${process.platform}-${process.arch}`, gates: {} };
const say = (k, c) => console.log(`  ${k} ${c.ok ? "OK" : "FALLA"} ${c.detail ?? ""}`);

// ---------------------------------------------------------------- EXERCISES
console.log("JWSIM_G9_EXERCISES");
const dirs = readdirSync(join(ROOT, "exercises")).filter((d) => existsSync(join(ROOT, "exercises", d, `${d}.jwsim`))).sort();
const ex = {};
{
  const missing = Object.keys(TOPICS).filter((t) => !dirs.some((d) => d.slice(3) === t));
  report.gates.E1_TOPICS = { ok: !missing.length, detail: missing.length ? `faltan: ${missing.join(", ")}` : `${dirs.length} ejercicios`, exercises: dirs };
  say("E1 ejercicios objetivo:", report.gates.E1_TOPICS);
}
{
  const registry = await registryWithInstalled();
  const bad = [];
  for (const d of dirs) {
    try {
      const e = loadExercise(join(ROOT, "exercises", d));
      if (!e.statement || !readFileSync(e.statement, "utf8").trim()) throw new Error("sin enunciado");
      if (!e.solution || !e.sketch) throw new Error("sin plantilla o solución");
      const sc = new Scene(e.scene, { registry });
      if (sc.findings.length) throw new Error(`escena con avisos: ${sc.findings.map((f) => f.message).join("; ")}`);
      ex[d] = e;
    } catch (err) {
      bad.push(`${d}: ${err.message}`);
    }
  }
  report.gates.E2_PROJECTS = { ok: !bad.length, detail: bad.length ? bad.join(" | ") : "proyecto, enunciado, rúbrica y escena válidos", errors: bad };
  say("E2 proyectos:", report.gates.E2_PROJECTS);
}
{
  const rows = [];
  for (const [d, e] of Object.entries(ex)) {
    const tpl = await gradeSketch(e, e.sketch, { buildRoot });
    const sol = await gradeSketch(e, e.solution, { buildRoot });
    rows.push({ exercise: d, template: tpl.ok ? tpl.grade : `no compila: ${tpl.error}`, solution: sol.ok ? sol.grade : `no compila: ${sol.error}`, points: sol.max });
    console.log(`    ${d}: plantilla ${rows.at(-1).template}, solución ${rows.at(-1).solution} (${sol.max} puntos)`);
  }
  const ok = rows.length === dirs.length && rows.every((r) => typeof r.template === "number" && r.template <= 2 && r.solution === 20);
  report.gates.E3_TEMPLATE_SOLUTION = { ok, detail: `${rows.filter((r) => r.solution === 20).length}/${rows.length} soluciones con 20`, rows };
  say("E3 plantilla y solución:", report.gates.E3_TEMPLATE_SOLUTION);
}
const exOk = ["E1_TOPICS", "E2_PROJECTS", "E3_TEMPLATE_SOLUTION"].every((k) => report.gates[k].ok);
console.log(`JWSIM_G9_EXERCISES=${exOk ? "PASS" : "FAIL"}`);

// ---------------------------------------------------------------- AUTOGRADING
console.log("JWSIM_G9_AUTOGRADING");
const variants = JSON.parse(readFileSync(join(ROOT, "tests", "grading", "variantes.json"), "utf8")).variants;
{
  const v = variants[0];
  const e = ex[v.exercise];
  const seen = new Map();
  const t0 = Date.now();
  for (let k = 0; k < RUNS; k++) {
    const g = await gradeSketch(e, join(ROOT, "tests", "grading", v.sketch), { buildRoot });
    const key = `${g.grade}|${g.cases.map((c) => `${c.score}:${c.trace_hash}`).join(",")}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const [first] = seen.keys();
  report.gates.A1_DETERMINISM = {
    ok: seen.size === 1 && Number(first.split("|")[0]) > 0 && Number(first.split("|")[0]) < 20,
    detail: `${v.sketch}: ${RUNS} corridas, ${seen.size} resultado${seen.size === 1 ? "" : "s"} distinto${seen.size === 1 ? "" : "s"} (nota ${first.split("|")[0]}), ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    results: Object.fromEntries(seen),
  };
  say("A1 determinismo:", report.gates.A1_DETERMINISM);
}
{
  const rows = [];
  for (const v of variants) {
    const g = await gradeSketch(ex[v.exercise], join(ROOT, "tests", "grading", v.sketch), { buildRoot });
    rows.push({ ...v, grade: g.ok ? g.grade : null, failed: g.cases.flatMap((c) => c.checks.filter((k) => !k.ok).map((k) => k.description)) });
    console.log(`    ${v.sketch}: ${g.ok ? g.grade : "no compila"}`);
  }
  report.gates.A2_DISCRIMINATES = { ok: rows.every((r) => r.grade > 0 && r.grade < 20), detail: rows.map((r) => `${r.sketch} ${r.grade}`).join(", "), rows };
  say("A2 errores típicos con nota parcial:", report.gates.A2_DISCRIMINATES);
}
{
  const f = join(ROOT, "build", "gates", "JWSIM_G9_E2E.json");
  const j = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  report.gates.A3_APP = { ok: !!j?.ok, detail: j ? Object.entries(j.criteria).map(([k, c]) => `${k} ${c.ok ? "ok" : "falla"}`).join(", ") : "falta correr app/tests/e2e-g9.mjs" };
  say("A3 app (E2E):", report.gates.A3_APP);
}
const agOk = ["A1_DETERMINISM", "A2_DISCRIMINATES", "A3_APP"].every((k) => report.gates[k].ok);
console.log(`JWSIM_G9_AUTOGRADING=${agOk ? "PASS" : "FAIL"}`);

report.JWSIM_G9_EXERCISES = exOk ? "PASS" : "FAIL";
report.JWSIM_G9_AUTOGRADING = agOk ? "PASS" : "FAIL";
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "g9-exercises.json"), JSON.stringify(report, null, 2) + "\n");
process.exitCode = exOk && agOk ? 0 : 1;
