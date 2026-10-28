// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Pruebas headless de sketches (jwsim-cli test, G5): un archivo
// *.jwtest.json describe el sketch, los estímulos y lo que se espera de una
// o varias corridas (esquema: schema/jwsim-test-1.json).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { decodePng, encodePng, readScreenDump } from "../../scripts/lib/png.mjs";
import { buildSketch, ROOT } from "./build.mjs";
import { buildOpenPlcProject, isOpenPlcProject } from "./openplc.mjs";
import { cosim } from "./cosim.mjs";
import { buildNativeDevice, installedDevices } from "./device.mjs";
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

const RUN_KEYS = new Set(["until_ms", "stim", "args", "expect", "timeout_s", "actions", "devices", "faults"]);
const TEST_KEYS = new Set(["$schema", "$comment", "name", "sketch", "runs", "state", "scene", ...RUN_KEYS]);
const EXPECT_KEYS = new Set(["exit", "console", "console_absent", "signals", "stderr", "stderr_absent", "result", "screen", "scene"]);

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
    if ((r.actions || r.expect?.scene) && !t.scene) throw bad(`runs[${i}]: 'actions' y 'expect.scene' requieren 'scene'`);
    try {
      expandFaults(r.faults, !!t.scene);
    } catch (err) {
      throw bad(`runs[${i}].faults: ${err.message}`);
    }
    if (t.scene && r.expect?.screen) throw bad(`runs[${i}]: 'expect.screen' no está disponible con 'scene'`);
  });
  const rel = relative(process.cwd(), file);
  const name = t.name ?? (rel.startsWith("..") ? file : rel).split(sep).join("/").replace(TEST_SUFFIX, "");
  // Estado no volátil compartido entre corridas (FRAM, NVS, SD, RTC) si hay
  // varias o se pide; si no, cada corrida arranca con la placa de fábrica.
  const shared = t.state === "shared" || runs.length > 1;
  return { file, name, sketch: t.sketch, runs, shared, scene: t.scene === undefined ? undefined : loadScene(t.scene, file) };
}

// Fallas inyectadas (gate JWSIM_G9_FAULT_INJECTION). Las de la placa se
// vuelven estímulos u opciones del runner; las de la escena, inyecciones en
// el motor de escena. `until_ms` quita la falla en ese instante.
//   sd-absent              tarjeta microSD retirada (SD_CARD=0)
//   rtc-battery            RTC sin batería: al arrancar no conservó nada
//   rs485-noise            ruido en la línea RS-485 (rate: 0..1, seed)
//   stuck / welded / burnt sensor o mando pegado (value), relé soldado,
//                          carga quemada (device)
//   open                   cable cortado (wire: "A.x B.y")
const SCENE_FAULTS = new Set(["stuck", "welded", "burnt", "open"]);
export function expandFaults(faults = [], hasScene = false) {
  const out = { stim: /** @type {string[]} */ ([]), args: /** @type {string[]} */ ([]), actions: /** @type {any[]} */ ([]) };
  if (!Array.isArray(faults)) throw new Error("debe ser una lista");
  for (const [k, f] of faults.entries()) {
    const at = Number(f.at_ms ?? 0);
    const until = f.until_ms === undefined ? undefined : Number(f.until_ms);
    if (!(at >= 0) || (until !== undefined && !(until > at))) throw new Error(`[${k}]: at_ms >= 0 y until_ms > at_ms`);
    if (f.kind === "sd-absent") {
      out.stim.push(`${at} SD_CARD=0`);
      if (until !== undefined) out.stim.push(`${until} SD_CARD=1`);
    } else if (f.kind === "rtc-battery") {
      if (at !== 0 || until !== undefined) throw new Error(`[${k}]: rtc-battery vale para el arranque (sin at_ms ni until_ms)`);
      out.args.push("--rtc", "sin-bateria");
    } else if (f.kind === "rs485-noise") {
      const rate = Number(f.rate);
      if (!(rate > 0 && rate <= 1)) throw new Error(`[${k}]: rs485-noise necesita rate entre 0 y 1`);
      const seed = f.seed === undefined ? 1 : Number(f.seed);
      out.stim.push(`${at} noise uart2 ${rate} ${seed}`);
      if (until !== undefined) out.stim.push(`${until} noise uart2 0 ${seed}`);
    } else if (SCENE_FAULTS.has(f.kind)) {
      if (!hasScene) throw new Error(`[${k}]: '${f.kind}' requiere 'scene'`);
      const inj = f.kind === "open" ? { kind: "open", wire: f.wire } : { kind: f.kind, device: f.device, ...(f.value === undefined ? {} : { value: !!f.value }) };
      out.actions.push({ at_ms: at, inject: inj });
      if (until !== undefined) out.actions.push({ at_ms: until, clear: inj });
    } else {
      throw new Error(`[${k}]: falla desconocida '${f.kind}' (sd-absent, rtc-battery, rs485-noise, stuck, welded, burnt, open)`);
    }
  }
  return out;
}

// Escena de una prueba: objeto en línea, archivo de escena (.json) o
// proyecto .jwsim (su campo "scene"), relativos al archivo de prueba.
export function loadScene(spec, testFile) {
  if (typeof spec !== "string") return spec;
  const p = resolve(dirname(testFile), spec);
  const j = JSON.parse(readFileSync(p, "utf8"));
  const sc = p.endsWith(".jwsim") ? j.scene : j;
  if (!sc?.devices) throw new Error(`${p}: no tiene una escena (devices/wiring)`);
  return sc;
}

// Corrida co-simulada con la escena (cli/lib/cosim.mjs): se arma una salida
// con el mismo formato que la del runner (consola, DI/DO y JWSIM_RESULT)
// para evaluar las mismas expectativas, más las de la escena.
async function runWithScene(exe, args, test, r) {
  const t0 = Date.now();
  const lines = [];
  const partial = ["", "", ""];
  let stderr = "";
  const fmt = (ns) => `[${(Number(ns) / 1e6).toFixed(3).padStart(10)} ms]`;
  const probes = (r.expect?.scene?.state ?? []).map((s) => BigInt(Math.round(s.at_ms * 1e6)));
  const res = await cosim({
    exe,
    args,
    launcher: exe.endsWith(".exe") && process.platform !== "win32" ? "wine" : undefined,
    scene: test.scene,
    untilNs: BigInt(Math.round(r.until_ms * 1e6)),
    actions: [...(r.actions ?? []), ...expandFaults(r.faults, true).actions].map((a) => ({ ...a, at_ns: BigInt(Math.round(a.at_ms * 1e6)) })),
    // Consola fechada con precisión de 5 ms (la escena despierta al runner al menos así).
    maxStepNs: 5_000_000n,
    probes,
    onSerial: (port, text, t) => {
      const parts = (partial[port] + text).split(/\r?\n/);
      partial[port] = parts.pop();
      for (const l of parts) lines.push([BigInt(t), `UART${port} ${l}`]);
    },
    onStderr: (d) => (stderr += d),
  });
  for (const e of res.scene.events) if (e.kind === "signal") lines.push([e.t, `DO ${e.key} = ${e.value}`]);
  for (const e of res.inputs) lines.push([e.t, `DI ${e.name} = ${e.v}`]);
  lines.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let stdout = lines.map(([t, l]) => `${fmt(t)} ${l}`).join("\n") + "\n";
  if (!res.exit) stdout += `JWSIM_RESULT mode=scene t_ms=${Number(res.t_ns) / 1e6} trace_hash=${res.hash} horizons=${res.stats.horizons}\n`;
  return {
    run: { stdout, stderr, status: res.exit ? res.exit.code : 0, signal: res.exit?.signal ?? null, timedOut: false, wallMs: Date.now() - t0 },
    res,
  };
}

const near = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : a === b);

// Expectativas de la escena: estado de salidas en instantes, fallas y
// avisos del análisis estático.
export function evaluateScene(res, want = {}) {
  const failures = [];
  for (const st of want.state ?? []) {
    const snap = res.snapshots.get(BigInt(Math.round(st.at_ms * 1e6)));
    for (const [k, v] of Object.entries(st)) {
      if (k === "at_ms") continue;
      const [dev, key] = [k.slice(0, k.indexOf(".")), k.slice(k.indexOf(".") + 1)];
      const d = snap?.devices.find((x) => x.id === dev);
      const got = d ? (key in d.outputs ? d.outputs[key] : d.contacts[key]) : undefined;
      if (!near(got, v)) failures.push(`escena ${k} en ${st.at_ms} ms = ${JSON.stringify(got)}, se esperaba ${JSON.stringify(v)}`);
    }
  }
  const faults = res.scene.events.filter((e) => e.kind === "fault").map((e) => `${e.type}:${e.device ?? ""}`);
  if (want.faults && JSON.stringify(faults) !== JSON.stringify(want.faults)) {
    failures.push(`fallas de la escena ${JSON.stringify(faults)}, se esperaban ${JSON.stringify(want.faults)}`);
  }
  if (want.findings) {
    const got = res.scene.findings.map((f) => f.load).sort();
    if (JSON.stringify(got) !== JSON.stringify([...want.findings].sort())) {
      failures.push(`avisos del cableado ${JSON.stringify(got)}, se esperaban ${JSON.stringify(want.findings)}`);
    }
  }
  return failures;
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

// Pantalla (ST7789) en un instante contra un PNG de referencia, píxel a
// píxel (expect.screen: [{ at_ms, ref, max_diff }]). Con record, una
// referencia que falta se graba con la captura.
function compareScreens(shots, testFile, { record, work, prefix }) {
  const failures = [];
  shots.forEach((sc, k) => {
    if (!existsSync(sc.dump)) {
      failures.push(`pantalla en ${sc.at_ms} ms: el runner no la volcó`);
      return;
    }
    const img = readScreenDump(readFileSync(sc.dump));
    const ref = resolve(dirname(testFile), sc.ref);
    if (!existsSync(ref)) {
      if (record) {
        mkdirSync(dirname(ref), { recursive: true });
        writeFileSync(ref, encodePng(img));
      } else failures.push(`pantalla en ${sc.at_ms} ms: falta la referencia ${sc.ref} (jwsim-cli test --record la graba)`);
      return;
    }
    const want = decodePng(readFileSync(ref));
    let diff = 0;
    if (want.width !== img.width || want.height !== img.height) diff = Infinity;
    else for (let p = 0; p < want.rgb.length; p += 3) if (want.rgb[p] !== img.rgb[p] || want.rgb[p + 1] !== img.rgb[p + 1] || want.rgb[p + 2] !== img.rgb[p + 2]) diff++;
    if (diff > (sc.max_diff ?? 0)) {
      const got = join(work, `${prefix}_screen${k}.png`);
      writeFileSync(got, encodePng(img));
      failures.push(`pantalla en ${sc.at_ms} ms: ${diff === Infinity ? "otro tamaño" : `${diff} píxeles distintos`} de ${sc.ref} (captura: ${got})`);
    }
  });
  return failures;
}

// Ejecuta una prueba: compila (o reutiliza la caché) y corre cada corrida.
// Nunca lanza por fallas del sketch: el resultado dice en qué etapa falló.
export async function runTest(test, { pkg, target = "native", buildRoot, record = false, log = () => {} }) {
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
    ({ exe } = isOpenPlcProject(sketchDir)
      ? await buildOpenPlcProject(sketchDir, { target, outDir, package: pkg, log })
      : await buildSketch(sketchDir, { target, outDir, package: pkg, log }));
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
    const fx = expandFaults(r.faults, !!test.scene);
    const args = ["--until", String(r.until_ms), ...(r.args ?? []), ...fx.args];
    if (r.stim !== undefined || fx.stim.length) {
      let stim = r.stim ?? [];
      if (typeof stim === "string" && fx.stim.length) stim = readFileSync(resolve(dirname(test.file), stim), "utf8").split(/\r?\n/);
      if (Array.isArray(stim)) {
        const lines = [...stim, ...fx.stim];
        stim = join(work, `run${i}.stim`);
        writeFileSync(stim, lines.join("\n") + "\n");
      } else stim = resolve(dirname(test.file), stim);
      args.push("--stim", hostPath(exe, stim));
    }
    if (test.shared) args.push("--state", hostPath(exe, stateDir));
    // Dispositivos nativos del SDK: desde sus fuentes o instalados del índice.
    try {
      for (const d of r.devices ?? []) {
        let lib;
        if (d.source) lib = buildNativeDevice(resolve(dirname(test.file), d.source), { target, outDir: join(buildRoot, target, "devices", d.source.replace(/[^\w.-]/g, "_")) }).lib;
        else {
          lib = installedDevices().filter((x) => x.type === d.type && x.kind === "native").pop()?.lib;
          if (!lib) throw new Error(`dispositivo nativo ${d.type} no instalado (jwsim-cli device install ${d.type})`);
        }
        args.push("--device", hostPath(exe, lib), "--device-params", JSON.stringify(d.params ?? {}));
      }
    } catch (err) {
      return { ...out, stage: "build", error: err.message, wall_ms: Date.now() - t0 };
    }
    const shots = (r.expect?.screen ?? []).map((sc, k) => ({ ...sc, dump: join(work, `run${i}_screen${k}.fb`) }));
    for (const sc of shots) args.push("--screen-at", `${sc.at_ms}:${hostPath(exe, sc.dump)}`);
    let run;
    let sceneRes;
    if (test.scene) {
      // En modo puerto el runner corre hasta que lo detiene la escena.
      const portArgs = args.filter((a, k) => a !== "--until" && args[k - 1] !== "--until");
      ({ run, res: sceneRes } = await runWithScene(exe, portArgs, test, r));
    } else {
      run = await runExeAsync(exe, args, { timeoutMs: (r.timeout_s ?? 300) * 1000 });
    }
    const ev = evaluate(run, r.expect);
    ev.failures.push(...compareScreens(shots, test.file, { record, work, prefix: `run${i}` }));
    if (sceneRes) ev.failures.push(...evaluateScene(sceneRes, r.expect?.scene));
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
