// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Calificación automática de ejercicios (gate JWSIM_G9_AUTOGRADING).
//
// Un ejercicio es un proyecto .jwsim con su escena y un campo "exercise"
// que apunta al enunciado y a la rúbrica (schema/jwsim-rubric-1.json). Cada
// caso de la rúbrica es una co-simulación del sketch con la escena, con
// acciones y fallas en instantes dados; cada verificación es una tabla de
// verdad temporizada sobre la traza:
//
//   at_ms + expect          valores en ese instante
//   from_ms/to_ms + always  se cumple en todo el intervalo
//   from_ms/to_ms + never   nunca se cumplen todas a la vez (enclavamientos)
//   from_ms/to_ms + eventually   se cumple en algún instante del intervalo
//                           (con for_ms: y se sostiene al menos ese tiempo)
//   console (+ from/to)     una línea de la consola que coincide
//   no_faults (+ from/to)   sin fallas eléctricas de la escena (cortocircuito…)
//
// Una verificación con "prerequisite": true es un requisito del caso: si
// falla, las demás del caso no suman (no hacer nada no aprueba "nunca
// arranca con los dos pulsados" si tampoco arranca cuando debe).
//
// Las claves de expect/always/never/eventually son señales de la placa
// (Q0_k, I0_k) o salidas de equipos de la escena ("KM1.closed", "H1.lit").
// La traza es determinista: la misma nota en cualquier corrida.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { buildSketch, ROOT } from "./build.mjs";
import { cosim } from "./cosim.mjs";
import { loadProject } from "./project.mjs";
import { expandFaults } from "./test.mjs";

/** Carga un ejercicio desde su .jwsim o su carpeta. */
export function loadExercise(path) {
  let file = resolve(path);
  if (!file.endsWith(".jwsim")) {
    const name = file.split(sep).pop();
    file = join(file, `${name}.jwsim`);
  }
  if (!existsSync(file)) throw new Error(`no existe el ejercicio ${file}`);
  const { project, links } = loadProject(file);
  const ex = project.exercise;
  if (!ex?.rubric) throw new Error(`${file}: no es un ejercicio (falta exercise.rubric)`);
  const base = dirname(file);
  const rubric = JSON.parse(readFileSync(resolve(base, ex.rubric), "utf8"));
  checkRubric(rubric, file);
  return {
    file,
    dir: base,
    id: rubric.id ?? project.name,
    title: project.name,
    level: ex.level,
    statement: ex.statement ? resolve(base, ex.statement) : null,
    solution: ex.solution ? resolve(base, ex.solution) : null,
    sketch: links.sketch ? dirname(links.sketch) : null,
    scene: project.scene,
    rubric,
  };
}

const CHECK_KINDS = ["expect", "always", "never", "eventually", "console", "no_faults"];

function checkRubric(r, file) {
  const bad = (m) => new Error(`${file}: rúbrica: ${m}`);
  if (!Array.isArray(r.cases) || !r.cases.length) throw bad("'cases' debe ser una lista no vacía");
  r.cases.forEach((c, i) => {
    if (!(Number(c.until_ms) > 0)) throw bad(`cases[${i}]: 'until_ms' debe ser > 0`);
    if (!Array.isArray(c.checks) || !c.checks.length) throw bad(`cases[${i}]: sin verificaciones`);
    c.checks.forEach((k, j) => {
      const kinds = CHECK_KINDS.filter((x) => x in k);
      if (kinds.length !== 1) throw bad(`cases[${i}].checks[${j}]: una sola de ${CHECK_KINDS.join(", ")}`);
      if (kinds[0] === "expect" && !(k.at_ms >= 0)) throw bad(`cases[${i}].checks[${j}]: 'expect' requiere 'at_ms'`);
      if (["always", "never", "eventually"].includes(kinds[0]) && !(k.to_ms > (k.from_ms ?? 0))) throw bad(`cases[${i}].checks[${j}]: requiere from_ms < to_ms`);
    });
    expandFaults(c.faults, true);
  });
}

// ---------------------------------------------------------------- traza
const ns = (ms) => BigInt(Math.round(ms * 1e6));
const fmtMs = (t) => `${(Number(t) / 1e6).toFixed(1).replace(".", ",")} ms`;

/** Cambios de cada clave en el tiempo: Q0_k, I0_k y salidas de equipos. */
function timeline(res) {
  /** @type {Map<string, [bigint, unknown][]>} */
  const tl = new Map();
  const add = (k, t, v) => {
    if (!tl.has(k)) tl.set(k, []);
    tl.get(k).push([t, v]);
  };
  for (const e of res.scene.events) {
    if (e.kind === "signal") add(e.key, e.t, e.value);
    else if (e.kind === "output") add(`${e.device}.${e.key}`, e.t, e.value);
  }
  for (const i of res.inputs) add(i.name, i.t, i.v);
  for (const list of tl.values()) list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return tl;
}

function valueAt(tl, key, t) {
  let v = 0;
  for (const [tt, x] of tl.get(key) ?? []) {
    if (tt > t) break;
    v = x;
  }
  return v;
}

const num = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : Number(v ?? 0));
const same = (got, want) => Math.abs(num(got) - num(want)) < 1e-6;

// Instantes donde puede cambiar el estado de las claves dentro de [a, b].
function instants(tl, keys, a, b) {
  const set = new Set([a]);
  for (const k of keys) for (const [t] of tl.get(k) ?? []) if (t > a && t <= b) set.add(t);
  return [...set].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

const describe = (tl, cond, t) => Object.keys(cond).map((k) => `${k} = ${num(valueAt(tl, k, t))}`).join(", ");

function evalCheck(k, tl, res, consoleLines) {
  const from = ns(k.from_ms ?? 0);
  const to = ns(k.to_ms ?? Number(res.t_ns) / 1e6);
  const holds = (cond, t) => Object.entries(cond).every(([key, want]) => same(valueAt(tl, key, t), want));
  if ("expect" in k) {
    const t = ns(k.at_ms);
    return holds(k.expect, t) ? { ok: true } : { ok: false, detail: `a los ${fmtMs(t)}: ${describe(tl, k.expect, t)}` };
  }
  if ("always" in k) {
    for (const t of instants(tl, Object.keys(k.always), from, to)) if (!holds(k.always, t)) return { ok: false, detail: `a los ${fmtMs(t)}: ${describe(tl, k.always, t)}` };
    return { ok: true };
  }
  if ("never" in k) {
    for (const t of instants(tl, Object.keys(k.never), from, to)) if (holds(k.never, t)) return { ok: false, detail: `a los ${fmtMs(t)}: ${describe(tl, k.never, t)}` };
    return { ok: true };
  }
  if ("eventually" in k) {
    // Con for_ms, la condición tiene que sostenerse al menos ese tiempo.
    const keys = Object.keys(k.eventually);
    const dur = ns(k.for_ms ?? 0);
    for (const t of instants(tl, keys, from, to)) {
      if (!holds(k.eventually, t)) continue;
      if (dur > 0n && !instants(tl, keys, t, t + dur).every((u) => holds(k.eventually, u))) continue;
      return { ok: true, detail: `a los ${fmtMs(t)}` };
    }
    return { ok: false, detail: `no ocurre entre ${fmtMs(from)} y ${fmtMs(to)}${dur > 0n ? ` durante ${fmtMs(dur)}` : ""}` };
  }
  if ("console" in k) {
    const re = new RegExp(k.console);
    const hit = consoleLines.find(([t, l]) => t >= from && t <= to && re.test(l));
    return hit ? { ok: true, detail: `a los ${fmtMs(hit[0])}` } : { ok: false, detail: `ninguna línea de la consola coincide con /${k.console}/` };
  }
  // no_faults
  const f = res.scene.events.find((e) => e.kind === "fault" && e.t >= from && e.t <= to);
  return f ? { ok: false, detail: `a los ${fmtMs(f.t)}: ${f.message}` } : { ok: true };
}

// ---------------------------------------------------------------- calificación
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * Califica un sketch con la rúbrica del ejercicio. Nunca lanza por fallas
 * del sketch: si no compila, la nota es 0 con los errores.
 */
export async function gradeSketch(ex, sketchDir, { pkg, target = "native", buildRoot = join(ROOT, "build", "grade"), log = () => {} }) {
  const t0 = Date.now();
  const max = ex.rubric.cases.reduce((s, c) => s + c.checks.reduce((x, k) => x + (k.points ?? 1), 0), 0);
  const out = { exercise: ex.id, title: ex.title, sketch: sketchDir, ok: false, score: 0, max, grade: 0, cases: [] };
  let exe;
  try {
    const rel = relative(ROOT, sketchDir).startsWith("..") ? sketchDir.replace(/^[\\/]+/, "") : relative(ROOT, sketchDir);
    const outDir = join(buildRoot, target, rel.split(/[\\/]/).join("__").replace(/[^\w.-]/g, "_"));
    ({ exe } = await buildSketch(sketchDir, { target, outDir, package: pkg, log }));
  } catch (err) {
    return { ...out, stage: "build", error: err.message, diagnostics: err.diagnostics?.filter((d) => d.severity === "error").slice(0, 10), wall_ms: Date.now() - t0 };
  }
  const work = join(buildRoot, "work", ex.id.replace(/[^\w.-]/g, "_"));
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  for (const [i, c] of ex.rubric.cases.entries()) {
    const fx = expandFaults(c.faults, true);
    const args = [...fx.args];
    if (fx.stim.length) {
      const stim = join(work, `case${i}.stim`);
      writeFileSync(stim, fx.stim.join("\n") + "\n");
      args.push("--stim", stim);
    }
    /** @type {[bigint, string][]} */
    const consoleLines = [];
    const partial = ["", "", ""];
    let res;
    try {
      res = await cosim({
        exe,
        args,
        launcher: exe.endsWith(".exe") && process.platform !== "win32" ? "wine" : undefined,
        scene: ex.scene,
        untilNs: ns(c.until_ms),
        actions: [...(c.actions ?? []), ...fx.actions].map((a) => ({ ...a, at_ns: ns(a.at_ms) })),
        maxStepNs: 5_000_000n,
        onSerial: (port, text, t) => {
          const parts = (partial[port] + text).split(/\r?\n/);
          partial[port] = parts.pop();
          for (const l of parts) consoleLines.push([BigInt(t), l]);
        },
      });
    } catch (err) {
      out.cases.push({ name: c.name, score: 0, max: c.checks.reduce((x, k) => x + (k.points ?? 1), 0), error: err.message, checks: [] });
      continue;
    }
    const tl = timeline(res);
    const checks = c.checks.map((k) => {
      const r = res.exit && res.exit.code !== 0 ? { ok: false, detail: `el firmware terminó (código ${res.exit.code})` } : evalCheck(k, tl, res, consoleLines);
      return { description: k.description ?? "", points: k.points ?? 1, ok: r.ok, ...(r.detail ? { detail: r.detail } : {}) };
    });
    if (c.checks.some((k, j) => k.prerequisite && !checks[j].ok)) {
      for (const [j, k] of checks.entries()) {
        if (!c.checks[j].prerequisite && k.ok) Object.assign(k, { ok: false, detail: "no se evalúa: falla un requisito del caso" });
      }
    }
    const score = checks.reduce((s, k) => s + (k.ok ? k.points : 0), 0);
    out.cases.push({ name: c.name, score, max: checks.reduce((s, k) => s + k.points, 0), trace_hash: res.hash, checks });
  }
  out.score = out.cases.reduce((s, c) => s + c.score, 0);
  out.grade = round1((20 * out.score) / max);
  out.ok = true;
  out.stage = "graded";
  rmSync(work, { recursive: true, force: true });
  return { ...out, wall_ms: Date.now() - t0 };
}

/** Informe legible de una calificación. */
export function formatGrade(g) {
  const lines = [`${g.title} — ${g.sketch}`];
  if (g.stage === "build") {
    lines.push(`  no compila: ${g.error}`);
    for (const d of g.diagnostics ?? []) lines.push(`    ${d.file}:${d.line}: ${d.message}`);
  }
  for (const c of g.cases) {
    lines.push(`  ${c.name}: ${c.score}/${c.max}${c.error ? ` (${c.error})` : ""}`);
    for (const k of c.checks) lines.push(`    ${k.ok ? "✓" : "✗"} ${k.description} (${k.ok ? k.points : 0}/${k.points})${!k.ok && k.detail ? ` — ${k.detail}` : ""}`);
  }
  lines.push(`  NOTA: ${String(g.grade).replace(".", ",")}/20 (${g.score} de ${g.max} puntos)`);
  return lines.join("\n");
}
