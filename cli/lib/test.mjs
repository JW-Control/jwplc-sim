// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Pruebas headless de sketches (jwsim-cli test, G5): un archivo
// *.jwtest.json describe el sketch, los estímulos y lo que se espera de una
// o varias corridas (esquema: schema/jwsim-test-1.json).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { buildSketch, ROOT } from "./build.mjs";
import { parseResult, parseTimeline, runExeAsync } from "./runner.mjs";

export const TEST_SUFFIX = ".jwtest.json";

// Archivos de prueba en las rutas dadas (archivos o carpetas, recursivo).
export function findTests(paths) {
  const out = [];
  const walk = (p) => {
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) throw new Error(`no existe ${p}`);
    if (st.isDirectory()) {
      for (const e of readdirSync(p).sort()) walk(join(p, e));
    } else if (p.endsWith(TEST_SUFFIX)) out.push(resolve(p));
  };
  paths.forEach(walk);
  return out;
}

// "package:<ruta>" es relativo al árbol del package (JWPLC/2.1.0);
// "package-repo:<ruta>", a la raíz del repositorio del package; el resto,
// al archivo de prueba.
export function resolveSketch(spec, testFile, pkg) {
  if (spec.startsWith("package:")) return join(pkg.root, pkg.lock.JWPLC_PACKAGE_TREE, spec.slice(8));
  if (spec.startsWith("package-repo:")) return join(pkg.root, spec.slice(13));
  return resolve(dirname(testFile), spec);
}

const RUN_KEYS = new Set(["until_ms", "stim", "args", "expect", "timeout_s"]);
const TEST_KEYS = new Set(["$schema", "$comment", "name", "sketch", "runs", "state", ...RUN_KEYS]);
const EXPECT_KEYS = new Set(["exit", "console", "console_absent", "signals", "stderr", "stderr_absent", "result"]);

export function loadTest(file) {
  let t;
  try {
    t = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file}: JSON inválido: ${err.message}`);
  }
  const bad = (msg) => new Error(`${file}: ${msg}`);
  if (typeof t.sketch !== "string") throw bad("falta 'sketch'");
  for (const k of Object.keys(t)) if (!TEST_KEYS.has(k)) throw bad(`campo desconocido '${k}'`);
  const runs = t.runs ?? [Object.fromEntries(Object.entries(t).filter(([k]) => RUN_KEYS.has(k)))];
  if (!Array.isArray(runs) || !runs.length) throw bad("'runs' debe ser una lista no vacía");
  runs.forEach((r, i) => {
    for (const k of Object.keys(r)) if (!RUN_KEYS.has(k)) throw bad(`runs[${i}]: campo desconocido '${k}'`);
    if (!(Number(r.until_ms) > 0)) throw bad(`runs[${i}]: 'until_ms' debe ser > 0`);
    for (const k of Object.keys(r.expect ?? {})) if (!EXPECT_KEYS.has(k)) throw bad(`runs[${i}].expect: campo desconocido '${k}'`);
  });
  const rel = relative(process.cwd(), file);
  const name = t.name ?? (rel.startsWith("..") ? file : rel).split(sep).join("/").replace(TEST_SUFFIX, "");
  // Estado no volátil compartido entre corridas (FRAM, NVS, SD, RTC) si hay
  // varias o se pide; si no, cada corrida arranca con la placa de fábrica.
  const shared = t.state === "shared" || runs.length > 1;
  return { file, name, sketch: t.sketch, runs, shared };
}

// Ruta como la ve el runner: bajo wine, unidad Z: con barras invertidas.
function hostPath(exe, p) {
  return exe.endsWith(".exe") && process.platform !== "win32" ? `Z:${p.replaceAll("/", "\\")}` : p;
}

function toRegex(p) {
  return new RegExp(p);
}

// Valor de una familia (DI/DO) o de una señal en el instante t.
function bitsAt(events, kind, t) {
  let v = 0;
  for (const e of events) {
    if (e.kind !== kind || e.t > t) continue;
    const k = Number(e.name.slice(3));
    v = e.v ? v | (1 << k) : v & ~(1 << k);
  }
  return v;
}

function signalAt(events, name, t) {
  let v = 0;
  for (const e of events) if ((e.kind === "DI" || e.kind === "DO") && e.name === name && e.t <= t) v = e.v;
  return v;
}

function parseBits(v) {
  if (typeof v === "number") return v;
  if (/^0b[01]+$/.test(v)) return parseInt(v.slice(2), 2);
  if (/^0x[0-9a-f]+$/i.test(v)) return parseInt(v.slice(2), 16);
  throw new Error(`valor inválido '${v}' (número, 0b… o 0x…)`);
}

const fmtBits = (v) => `0b${v.toString(2).padStart(8, "0")}`;

// Fallas de una corrida respecto de lo esperado (lista vacía = pasa).
export function evaluate(run, expect = {}) {
  const failures = [];
  const wantExit = expect.exit ?? 0;
  const gotExit = run.timedOut ? "timeout" : run.signal ? `signal:${run.signal}` : run.status;
  if (gotExit !== wantExit) failures.push(`código de salida ${gotExit}, se esperaba ${wantExit}`);
  const events = parseTimeline(run.stdout);
  const result = parseResult(run.stdout);
  if (wantExit === 0) {
    if (!result) failures.push("el runner no imprimió JWSIM_RESULT");
    const fatal = run.stderr.split(/\r?\n/).find((l) => l.includes("[jwsim] FATAL"));
    if (fatal) failures.push(fatal.trim());
  }
  const lines = events.filter((e) => e.kind === "UART");
  for (const item of expect.console ?? []) {
    const c = typeof item === "string" ? { match: item } : item;
    const re = toRegex(c.match);
    const n = lines.filter(
      (l) => (c.port === undefined || l.port === c.port) && (c.after_ms === undefined || l.t >= c.after_ms) && (c.before_ms === undefined || l.t <= c.before_ms) && re.test(l.text),
    ).length;
    const min = c.count ?? c.min ?? 1;
    const max = c.count ?? c.max ?? Infinity;
    if (n < min || n > max) {
      const want = c.count !== undefined ? `${c.count}` : max === Infinity ? `≥ ${min}` : `${min}–${max}`;
      failures.push(`consola /${c.match}/: ${n} líneas, se esperaban ${want}`);
    }
  }
  for (const p of expect.console_absent ?? []) {
    const hit = lines.find((l) => toRegex(p).test(l.text));
    if (hit) failures.push(`consola /${p}/ no debía aparecer: [${hit.t} ms] ${hit.text}`);
  }
  for (const s of expect.signals ?? []) {
    for (const [k, v] of Object.entries(s)) {
      if (k === "at_ms") continue;
      if (k === "DI" || k === "DO") {
        const got = bitsAt(events, k, s.at_ms);
        if (got !== parseBits(v)) failures.push(`${k} en ${s.at_ms} ms = ${fmtBits(got)}, se esperaba ${fmtBits(parseBits(v))}`);
      } else {
        const got = signalAt(events, k, s.at_ms);
        if (got !== Number(v)) failures.push(`${k} en ${s.at_ms} ms = ${got}, se esperaba ${v}`);
      }
    }
  }
  for (const p of expect.stderr ?? []) if (!toRegex(p).test(run.stderr)) failures.push(`stderr sin /${p}/`);
  for (const p of expect.stderr_absent ?? []) if (toRegex(p).test(run.stderr)) failures.push(`stderr con /${p}/`);
  for (const [k, v] of Object.entries(expect.result ?? {})) {
    if (!result || result[k] !== String(v)) failures.push(`JWSIM_RESULT ${k}=${result?.[k]}, se esperaba ${v}`);
  }
  return { failures, result, consoleLines: lines.length };
}

// Ejecuta una prueba: compila (o reutiliza la caché) y corre cada corrida.
// Nunca lanza por fallas del sketch: el resultado dice en qué etapa falló.
export async function runTest(test, { pkg, target = "native", buildRoot, log = () => {} }) {
  const t0 = Date.now();
  const out = { name: test.name, file: test.file, sketch: test.sketch, ok: false, stage: "build", runs: [] };
  let sketchDir;
  try {
    sketchDir = resolveSketch(test.sketch, test.file, pkg);
    if (!existsSync(sketchDir)) throw new Error(`no existe el sketch ${sketchDir}`);
  } catch (err) {
    return { ...out, error: err.message, wall_ms: Date.now() - t0 };
  }
  let exe;
  try {
    const rel = relative(pkg.root, sketchDir).startsWith("..") ? relative(ROOT, sketchDir) : relative(pkg.root, sketchDir);
    const outDir = join(buildRoot, target, rel.split(sep).join("__").replace(/[^\w.-]/g, "_"));
    ({ exe } = await buildSketch(sketchDir, { target, outDir, package: pkg, log }));
  } catch (err) {
    return { ...out, error: err.message, diagnostics: err.diagnostics?.filter((d) => d.severity === "error").slice(0, 10), wall_ms: Date.now() - t0 };
  }
  out.stage = "run";
  const work = join(buildRoot, "work", test.name.replace(/[^\w.-]/g, "_"));
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const stateDir = join(work, "state");
  if (test.shared) mkdirSync(stateDir, { recursive: true });
  let ok = true;
  for (const [i, r] of test.runs.entries()) {
    const args = ["--until", String(r.until_ms), ...(r.args ?? [])];
    if (r.stim !== undefined) {
      let stim = r.stim;
      if (Array.isArray(stim)) {
        stim = join(work, `run${i}.stim`);
        writeFileSync(stim, r.stim.join("\n") + "\n");
      } else stim = resolve(dirname(test.file), stim);
      args.push("--stim", hostPath(exe, stim));
    }
    if (test.shared) args.push("--state", hostPath(exe, stateDir));
    const run = await runExeAsync(exe, args, { timeoutMs: (r.timeout_s ?? 300) * 1000 });
    const ev = evaluate(run, r.expect);
    out.runs.push({
      args,
      exit: run.timedOut ? "timeout" : run.signal ? `signal:${run.signal}` : run.status,
      wall_ms: run.wallMs,
      result: ev.result,
      console_lines: ev.consoleLines,
      failures: ev.failures,
      ...(ev.failures.length ? { stderr_tail: run.stderr.split(/\r?\n/).filter(Boolean).slice(-5) } : {}),
    });
    if (ev.failures.length) {
      ok = false;
      writeFileSync(join(work, `run${i}.stdout.txt`), run.stdout);
      writeFileSync(join(work, `run${i}.stderr.txt`), run.stderr);
    }
  }
  if (ok) rmSync(work, { recursive: true, force: true });
  return { ...out, ok, stage: ok ? "pass" : "expect", exe, wall_ms: Date.now() - t0 };
}
