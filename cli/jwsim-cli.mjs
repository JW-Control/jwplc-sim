#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// jwsim-cli — interfaz de línea de comandos del simulador (modo headless, G5).
//
//   jwsim-cli build  <sketch_dir|proyecto_openplc> [opciones de build]
//   jwsim-cli run    <sketch_dir> [opciones de build] -- [opciones del runner]
//   jwsim-cli test   <archivo.jwtest.json|carpeta>... [opciones de build] [--record] [--report <archivo>]
//   jwsim-cli parity [<ref>] [--package <dir>] [--update] [--report <archivo>]
//   jwsim-cli matrix [--filter <texto>] [opciones de build] [--report <archivo>]
//   jwsim-cli grade  <ejercicio> [<sketch_dir>] [--solution] [--runs N] (G9: nota por rúbrica)
//   jwsim-cli device build|test|pack <carpeta>     (SDK de dispositivos, G7)
//   jwsim-cli device install <tipo>[@versión] [--index <url|archivo>]
//   jwsim-cli device list [--index <url|archivo>]
//   jwsim-cli scene  describe|new|normalize|validate|preview|build  (Escenas JSON)
//
// Opciones de build: --target native|windows, --out <dir> (build y run),
// --cc gcc|clang, --board <id>, --package <dir> (checkout de platform-jwplc
// en lugar del fijado en package.lock), --json (un objeto JSON en stdout; los
// mensajes van a stderr).
// Opciones del runner (ver sim/runner/main.cpp): --until <ms>, --stim <archivo>,
// --set I0_0=1@100, --quiet, --state <dir>...
//
// Códigos de salida (docs/CLI.md): 0 bien; 1 prueba, paridad o matriz con
// fallas; 2 uso incorrecto; 3 el sketch no compila; 4 la simulación terminó
// mal (FATAL, vigilante, caída); 5 entorno (toolchain o package).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSketch, ROOT } from "./lib/build.mjs";
import { runSceneCommand } from "./lib/scene-cli.mjs";
import { buildOpenPlcProject, isOpenPlcProject } from "./lib/openplc.mjs";
import { BEHAVIORS, writeDevice } from "./lib/device-gen.mjs";
import { readComponent, writeComponent } from "./lib/component-files.mjs";
import { ComponentBench } from "../app/lib/component-bench.mjs";
import { buildNativeDevice, checkDeviceDir, installedDevices, linkDevice, loadSceneDevice, localDevices, packDevice, readManifest, unlinkDevice } from "./lib/device.mjs";
import { IndexError, installPackage, loadIndex } from "./lib/index.mjs";
import { runMatrix } from "./lib/matrix.mjs";
import { checkParity } from "./lib/parity.mjs";
import { parseResult, parseTimeline, runExe } from "./lib/runner.mjs";
import { formatGrade, gradeSketch, loadExercise } from "./lib/grade.mjs";
import { findTests, loadTest, runTest } from "./lib/test.mjs";
import { toolchain } from "./lib/toolchain.mjs";
import { fetchPackageRef, packageFromDir, resolvePackageRoot } from "../scripts/fetch-package.mjs";

export const EXIT = { OK: 0, FAIL: 1, USAGE: 2, BUILD: 3, SIM: 4, ENV: 5 };

const USAGE = `uso:
  jwsim-cli build  <sketch_dir> [--target native|windows] [--out dir] [--package dir] [--library dir]... [--json]
  jwsim-cli run    <sketch_dir> [opciones de build] [--json] -- [opciones del runner]
  jwsim-cli test   <archivo.jwtest.json|carpeta>... [opciones de build] [--record] [--json] [--report archivo]
  jwsim-cli parity [<ref>] [--package dir] [--update] [--json] [--report archivo]
  jwsim-cli matrix [--filter texto] [opciones de build] [--json] [--report archivo]
  jwsim-cli grade  <ejercicio.jwsim|carpeta> [<sketch_dir>] [--solution] [--runs N] [--json] [--report archivo]
  jwsim-cli device build|test|pack <carpeta> [--json]
  jwsim-cli device install <tipo>[@versión] [--index url|archivo] [--json]
  jwsim-cli device list [--index url|archivo] [--json]
  jwsim-cli scene describe [<tipo>] [--json]
  jwsim-cli scene new <salida.jwsim> [--sketch ruta] [--template base] [--json]
  jwsim-cli scene normalize <entrada.json> [-o salida.jwsim] [--json]
  jwsim-cli scene validate <archivo.jwsim> [--fast] [--strict] [--json]
  jwsim-cli scene preview <archivo.jwsim> [--out dir] [--view 2d|3d|both] [--smoke-ms ms] [--json]
  jwsim-cli scene build <entrada.json> --out <dir> [--create-ino] [--strict] [--json]`;

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.exitCode = code;
  }
}

function parse(argv) {
  const opts = { _: [], runner: [] };
  const dash = argv.indexOf("--");
  const main = dash >= 0 ? argv.slice(0, dash) : argv;
  if (dash >= 0) opts.runner = argv.slice(dash + 1);
  const value = (i, name) => {
    if (i >= main.length) throw new CliError(EXIT.USAGE, `falta el valor de ${name}`);
    return main[i];
  };
  for (let i = 0; i < main.length; i++) {
    const a = main[i];
    if (a === "--target") opts.target = value(++i, a);
    else if (a === "--out") opts.outDir = value(++i, a);
    else if (a === "--cc") opts.cc = value(++i, a);
    else if (a === "--board") opts.board = value(++i, a);
    else if (a === "--package") opts.packageDir = value(++i, a);
    else if (a === "--library") (opts.libraries ??= []).push(value(++i, a));
    else if (a === "--report") opts.report = value(++i, a);
    else if (a === "--filter") opts.filter = value(++i, a);
    else if (a === "--index") opts.index = value(++i, a);
    else if (a === "--json") opts.json = true;
    else if (a === "--update") opts.update = true;
    else if (a === "--record") opts.record = true;
    else if (a === "--solution") opts.solution = true;
    else if (a === "--runs") opts.runs = Number(value(++i, a));
    else if (a === "--set") (opts.set ??= []).push(value(++i, a));
    else if (a === "--link") opts.link = true;
    else if (a === "--try") opts.try = value(++i, a);
    else if (a === "-o" || a === "--output") opts.outFile = value(++i, a);
    else if (a === "--sketch") opts.sketch = value(++i, a);
    else if (a === "--template") opts.template = value(++i, a);
    else if (a === "--view") opts.view = value(++i, a);
    else if (a === "--strict") opts.strict = true;
    else if (a === "--fast") opts.fast = true;
    else if (a === "--create-ino") opts.createIno = true;
    else if (a === "--smoke-ms") opts.smokeMs = Number(value(++i, a));
    else if (a.startsWith("--")) throw new CliError(EXIT.USAGE, `opción desconocida ${a}`);
    else opts._.push(a);
  }
  if (opts.target && !["native", "windows"].includes(opts.target)) throw new CliError(EXIT.USAGE, `--target ${opts.target}: use native o windows`);
  return opts;
}

// Package fijado (package.lock) o el checkout indicado con --package.
function resolvePkg(opts) {
  try {
    return opts.packageDir ? packageFromDir(opts.packageDir) : resolvePackageRoot();
  } catch (err) {
    throw new CliError(EXIT.ENV, `package: ${err.message}`);
  }
}

function checkToolchain(opts) {
  const tc = toolchain(opts.target ?? "native", opts.cc);
  if (!tc.available) throw new CliError(EXIT.ENV, `no se encontró el compilador ${tc.cxx[0]} (node scripts/fetch-toolchain.mjs)`);
}

const pkgInfo = (pkg) => ({ ref: pkg.lock.JWPLC_PACKAGE_REF, commit: pkg.lock.JWPLC_PACKAGE_COMMIT, root: pkg.root });

async function build(opts) {
  if (!opts._[0]) throw new CliError(EXIT.USAGE, "falta <sketch_dir>");
  const pkg = resolvePkg(opts);
  checkToolchain(opts);
  const t0 = Date.now();
  const sketch = resolve(opts._[0]);
  const base = { sketch, target: opts.target ?? "native", package: pkgInfo(pkg) };
  try {
    const bopts = { ...opts, package: pkg, log: opts.json ? (m) => process.stderr.write(m + "\n") : undefined };
    // Un proyecto del OpenPLC Editor pasa antes por la cadena del editor (G6).
    const r = isOpenPlcProject(sketch) ? await buildOpenPlcProject(sketch, bopts) : await buildSketch(sketch, bopts);
    return { ...base, ok: true, executable: r.exe, libraries: r.libraries, ...(r.openplc ? { openplc: r.openplc } : {}), wall_ms: Date.now() - t0 };
  } catch (err) {
    const out = { ...base, ok: false, error: err.message, diagnostics: err.diagnostics ?? [], wall_ms: Date.now() - t0 };
    out.exitCode = EXIT.BUILD;
    return out;
  }
}

// Código de salida del runner → código de la CLI.
function simExit(r) {
  if (r.status === 0 && !r.signal) return EXIT.OK;
  if (r.status === 2) return EXIT.USAGE;
  return EXIT.SIM;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.error(USAGE);
    return cmd ? EXIT.OK : EXIT.USAGE;
  }
  const opts = parse(rest);
  let report;
  let code = EXIT.OK;
  const emit = (obj, exitCode = code) => {
    report = { command: cmd, ...obj, exit_code: exitCode };
    if (opts.report) {
      mkdirSync(dirname(resolve(opts.report)), { recursive: true });
      writeFileSync(resolve(opts.report), JSON.stringify(report, null, 2) + "\n");
    }
    if (opts.json) process.stdout.write(JSON.stringify(report) + "\n");
  };

  if (cmd === "build") {
    const b = await build(opts);
    code = b.exitCode ?? EXIT.OK;
    delete b.exitCode;
    if (!opts.json) console.error(b.ok ? `[jwsim-cli] OK ${b.executable}` : `[jwsim-cli] ERROR: ${b.error}`);
    emit(b);
    return code;
  }

  if (cmd === "run") {
    const b = await build(opts);
    if (!b.ok) {
      code = b.exitCode;
      delete b.exitCode;
      if (!opts.json) console.error(`[jwsim-cli] ERROR: ${b.error}`);
      emit({ build: b });
      return code;
    }
    if (b.executable.endsWith(".exe") && process.platform !== "win32" && !process.env.JWSIM_ALLOW_WINE) {
      // Sin Windows: el binario queda generado (con JWSIM_ALLOW_WINE=1 se corre bajo wine).
      console.error("[jwsim-cli] binario Windows generado; no se puede ejecutar en este SO");
      emit({ build: b, run: null });
      return EXIT.OK;
    }
    if (!opts.json) {
      const r = spawnSync(b.executable, opts.runner, { stdio: "inherit" });
      return r.signal ? EXIT.SIM : r.status === 0 ? EXIT.OK : r.status === 2 ? EXIT.USAGE : EXIT.SIM;
    }
    const r = runExe(b.executable, opts.runner);
    code = simExit(r);
    process.stderr.write(r.stderr);
    emit({
      build: b,
      run: {
        args: opts.runner,
        exit: r.timedOut ? "timeout" : r.signal ? `signal:${r.signal}` : r.status,
        wall_ms: r.wallMs,
        result: parseResult(r.stdout),
        events: parseTimeline(r.stdout),
        fatal: r.stderr.split(/\r?\n/).filter((l) => l.includes("[jwsim] FATAL")),
      },
    });
    return code;
  }

  if (cmd === "test") {
    if (!opts._.length) throw new CliError(EXIT.USAGE, "falta al menos un archivo .jwtest.json o carpeta");
    const pkg = resolvePkg(opts);
    checkToolchain(opts);
    let files;
    let tests;
    try {
      files = findTests(opts._);
      tests = files.map(loadTest);
    } catch (err) {
      throw new CliError(EXIT.USAGE, err.message);
    }
    if (!tests.length) throw new CliError(EXIT.USAGE, "no se encontraron archivos .jwtest.json");
    const results = [];
    for (const t of tests) {
      const r = await runTest(t, { pkg, target: opts.target ?? "native", buildRoot: resolve(opts.outDir ?? join(ROOT, "build", "tests")), record: opts.record });
      results.push(r);
      if (!opts.json) {
        const why = r.ok ? "" : ` [${r.stage}] ${r.error ?? r.runs.flatMap((x) => x.failures).join("; ")}`;
        console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} (${(r.wall_ms / 1000).toFixed(1)} s)${why}`);
      }
    }
    const passed = results.filter((r) => r.ok).length;
    code = passed === results.length ? EXIT.OK : EXIT.FAIL;
    if (!opts.json) console.log(`RESULTADO: ${passed}/${results.length} pruebas pasan`);
    emit({ package: pkgInfo(pkg), target: opts.target ?? "native", passed, failed: results.length - passed, total: results.length, tests: results });
    return code;
  }

  // Calificación por rúbrica (G9): sin sketch, el del proyecto (la plantilla
  // o el trabajo del alumno); --solution, la solución de referencia. Con
  // --runs N se repite N veces y se exige la misma nota (determinismo).
  if (cmd === "grade") {
    if (!opts._.length) throw new CliError(EXIT.USAGE, "falta el ejercicio (.jwsim o carpeta)");
    let ex;
    try {
      ex = loadExercise(opts._[0]);
    } catch (err) {
      throw new CliError(EXIT.USAGE, err.message);
    }
    const sketch = opts._[1] ? resolve(opts._[1]) : opts.solution ? ex.solution : ex.sketch;
    if (!sketch) throw new CliError(EXIT.USAGE, opts.solution ? "el ejercicio no tiene solución de referencia" : "falta el sketch");
    const pkg = resolvePkg(opts);
    checkToolchain(opts);
    const runs = Math.max(1, opts.runs || 1);
    const grades = [];
    let g;
    for (let k = 0; k < runs; k++) {
      g = await gradeSketch(ex, sketch, { pkg, target: opts.target ?? "native", buildRoot: resolve(opts.outDir ?? join(ROOT, "build", "grade")) });
      grades.push(g.grade);
      if (!g.ok) break;
    }
    const stable = new Set(grades).size === 1;
    if (!opts.json) {
      console.log(formatGrade(g));
      if (runs > 1) console.log(`  ${runs} corridas: ${stable ? "misma nota en todas" : `notas distintas: ${[...new Set(grades)].join(", ")}`}`);
    }
    code = !g.ok ? EXIT.BUILD : stable ? EXIT.OK : EXIT.FAIL;
    emit({ package: pkgInfo(pkg), ...g, runs, stable, grades: runs > 1 ? grades : undefined });
    return code;
  }

  if (cmd === "parity") {
    if (opts._.length > 1) throw new CliError(EXIT.USAGE, "parity acepta una sola ref");
    let pkg;
    try {
      pkg = opts._[0] ? fetchPackageRef(opts._[0]) : resolvePkg(opts);
    } catch (err) {
      throw new CliError(err.exitCode ?? EXIT.ENV, `package: ${err.message}`);
    }
    checkToolchain(opts);
    const p = await checkParity(pkg, { target: opts.target ?? "native", update: opts.update, log: opts.json ? (m) => process.stderr.write(m + "\n") : (m) => console.error(m) });
    code = p.ok ? EXIT.OK : EXIT.FAIL;
    if (!opts.json) {
      for (const d of p.differences) console.log(`- ${d}`);
      console.log(`JWSIM_PARITY ${pkg.lock.JWPLC_PACKAGE_REF}=${p.ok ? "PASS" : "FAIL"} (${p.differences.length} diferencias)`);
    }
    emit({ package: pkgInfo(pkg), ...p });
    return code;
  }

  if (cmd === "matrix") {
    const pkg = resolvePkg(opts);
    checkToolchain(opts);
    const m = await runMatrix(pkg, { target: opts.target ?? "native", filter: opts.filter, log: opts.json ? (s) => process.stderr.write(s + "\n") : (s) => console.log(s) });
    code = m.ok ? EXIT.OK : EXIT.FAIL;
    emit({ package: pkgInfo(pkg), ...m });
    return code;
  }

  if (cmd === "device") {
    const [sub, arg] = opts._;
    const log = opts.json ? (m) => process.stderr.write(m + "\n") : (m) => console.error(m);
    try {
      if (sub === "build" || sub === "test" || sub === "pack") {
        if (!arg) throw new CliError(EXIT.USAGE, `falta la carpeta del dispositivo`);
        const dir = resolve(arg);
        const m = readManifest(dir);
        if (sub === "pack") {
          const p = packDevice(dir);
          const out = resolve(opts.outDir ?? join(ROOT, "build", "devices"), p.fileName);
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(out, p.archive);
          if (!opts.json) console.log(`${out}\n${p.size} B ${p.checksum}`);
          emit({ ok: true, type: m.type, version: m.version, kind: m.kind, archive: out, size: p.size, checksum: p.checksum });
          return code;
        }
        if (m.kind === "native") {
          const { lib } = buildNativeDevice(dir, { target: opts.target ?? "native", outDir: opts.outDir, log });
          if (!opts.json) console.log(`[jwsim-cli] OK ${lib}`);
          emit({ ok: true, type: m.type, version: m.version, kind: m.kind, library: lib });
          return code;
        }
        if (m.kind === "example") {
          emit({ ok: true, type: m.type, version: m.version, kind: m.kind });
          return code;
        }
        const { defs } = await loadSceneDevice(dir);
        // Símbolos: la misma regla de grilla que aplica la app (docs/SIMBOLOS.md).
        const chk = await checkDeviceDir(dir, { fresh: false });
        const symbolErrors = chk.errors.filter((e) => /^symbol/.test(e));
        if (!opts.json) {
          for (const e of symbolErrors) console.error(`[jwsim-cli] símbolo: ${e}`);
          for (const w of chk.warnings) console.error(`[jwsim-cli] aviso: ${w}`);
        }
        if (symbolErrors.length) code = EXIT.FAIL;
        let tests = { ran: 0, ok: true };
        if (sub === "test") {
          const files = readdirSync(dir).filter((f) => /\.test\.m?js$/.test(f)).map((f) => join(dir, f));
          if (files.length) {
            const r = spawnSync(process.execPath, ["--test", ...files], {
              stdio: opts.json ? ["ignore", 2, 2] : "inherit",
              env: { ...process.env, JWSIM_SDK: pathToFileURL(join(ROOT, "sdk", "testing.mjs")).href },
            });
            tests = { ran: files.length, ok: r.status === 0 };
          }
          if (!tests.ok) code = EXIT.FAIL;
        }
        if (!opts.json) console.log(`[jwsim-cli] ${m.type}@${m.version}: ${defs.length} definición(es) válidas${sub === "test" ? `, pruebas ${tests.ok ? "OK" : "con fallas"} (${tests.ran} archivos)` : ""}`);
        emit({ ok: code === EXIT.OK, type: m.type, version: m.version, kind: m.kind, definitions: defs.map((d) => `${d.type}@${d.version}`), tests, symbols: chk.symbols, warnings: chk.warnings });
        return code;
      }
      if (sub === "install") {
        if (!arg) throw new CliError(EXIT.USAGE, "falta <tipo>[@versión]");
        const r = await installPackage(arg, { index: opts.index, log });
        if (!opts.json) console.log(`[jwsim-cli] instalado ${r.type}@${r.version} (${r.kind}) en ${r.dir}`);
        emit({ ok: true, ...r });
        return code;
      }
      // Nuevo dispositivo a partir de un bloque de comportamiento (lo mismo que
      // el asistente de la app): device new <carpeta> <bloque> <autor/nombre>
      // [--set clave=valor]… [--link].
      if (sub === "new") {
        const [, parent, behavior, type] = opts._;
        if (!parent || !behavior || !type?.includes("/")) {
          throw new CliError(EXIT.USAGE, `uso: device new <carpeta> <${BEHAVIORS.map((b) => b.id).join("|")}> <autor/nombre> [--set clave=valor]… [--link]`);
        }
        const [author, name] = type.split("/");
        const extra = Object.fromEntries((opts.set ?? []).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
        const r = writeDevice(resolve(parent), { ...extra, behavior, author, name });
        if (opts.link) await linkDevice(r.dir);
        if (!opts.json) console.log(`[jwsim-cli] creado ${r.spec.type} en ${r.dir}${opts.link ? " (enlazado)" : ""}`);
        emit({ ok: true, type: r.spec.type, dir: r.dir, files: Object.keys(r.files), linked: !!opts.link });
        return code;
      }
      // Componente declarativo (docs/COMPONENTES.md): valida component.json,
      // regenera symbol.svg, el manifiesto y el README (como «Guardar» del
      // editor) y, con --try, lo corre en el banco con un escenario:
      //   device component <carpeta> [--link] [--try escenario.json]
      if (sub === "component") {
        if (!arg) throw new CliError(EXIT.USAGE, "uso: device component <carpeta> [--link] [--try escenario.json]");
        const dir = resolve(arg);
        const { spec, art } = readComponent(dir);
        let r;
        try {
          r = writeComponent(dir, spec, art);
        } catch (err) {
          const list = /** @type {any} */ (err).errors ?? [/** @type {any} */ (err).message];
          if (!opts.json) for (const e of list) console.error(`[jwsim-cli] error: ${e}`);
          emit({ ok: false, errors: list });
          return EXIT.FAIL;
        }
        if (opts.link) await linkDevice(dir);
        if (!opts.json) console.log(`[jwsim-cli] ${spec.type}@${spec.version}: válido; bornes ${r.def.terminals.map((t) => t.id).join(" ")}${opts.link ? " (enlazado)" : ""}`);
        /** @type {any[]} */
        const steps = [];
        if (opts.try) {
          // Escenario: [{ "ms": 60000, "digital": { "bomba": 1 }, "analog": { "temp": 7.5 }, "write": [{ "table": "holding", "reg": 0, "value": 2 }] }, …]
          const scen = JSON.parse(readFileSync(resolve(opts.try), "utf8"));
          const bench = new ComponentBench(r.spec);
          let held = {};
          for (const s of scen) {
            held = { ...held, ...s, digital: { ...held.digital, ...s.digital }, analog: { ...held.analog, ...s.analog } };
            for (const w of s.write ?? []) bench.write(w.table, w.reg, w.value);
            const st = bench.advance(Number(s.ms ?? 0), held);
            const outs = Object.entries(st.outputs).map(([k, v]) => `${k}=${typeof v === "number" ? +v.toFixed(3) : v}`).join(" ");
            const regs = st.regs.map((g) => `${g.table[0]}${g.reg}=${g.words === null ? "—" : g.words.join("/")}`).join(" ");
            if (!opts.json) console.log(`t=${(st.tMs / 1000).toFixed(1)} s  ${outs}${regs ? `  | ${regs}` : ""}`);
            steps.push(st);
          }
        }
        emit({ ok: true, type: spec.type, dir, terminals: r.def.terminals.map((t) => t.id), linked: !!opts.link, ...(opts.try ? { steps } : {}) });
        return code;
      }
      // Modo desarrollador: una carpeta de dispositivo de escena se usa en el
      // simulador sin pasar por el índice firmado (ejecuta su código).
      if (sub === "link") {
        if (!arg) throw new CliError(EXIT.USAGE, "falta la carpeta del dispositivo");
        const r = await linkDevice(arg);
        if (!opts.json) {
          console.log(`[jwsim-cli] enlazado ${r.type}@${r.version} desde ${r.dir} (en desarrollo: la app lo recarga con Dispositivos → Recargar)`);
          for (const w of r.warnings) console.error(`[jwsim-cli] aviso: ${w}`);
        }
        emit({ ok: true, ...r });
        return code;
      }
      if (sub === "unlink") {
        if (!arg) throw new CliError(EXIT.USAGE, "falta la carpeta o el tipo del dispositivo");
        const gone = unlinkDevice(arg);
        if (!opts.json) for (const d of gone) console.log(`[jwsim-cli] quitado el enlace a ${d}`);
        emit({ ok: true, removed: gone });
        return code;
      }
      if (sub === "list") {
        const installed = installedDevices().map(({ type, version, kind, dir, local }) => ({ type, version, kind, dir, ...(local ? { local: true } : {}) }));
        for (const d of localDevices().filter((x) => x.error)) installed.push({ dir: d.dir, local: true, error: d.error });
        let available;
        if (opts.index !== undefined || process.env.JWSIM_INDEX) {
          const { index } = await loadIndex(opts.index);
          available = index.packages.map((p) => ({ type: p.type, kind: p.kind, name: p.name, versions: p.versions.map((v) => v.version) }));
        }
        if (!opts.json) {
          for (const d of installed) console.log(d.error ? `enlazado   ${d.dir}: ${d.error}` : `${d.local ? "enlazado " : "instalado"}  ${d.type}@${d.version} (${d.kind})${d.local ? ` ${d.dir}` : ""}`);
          for (const p of available ?? []) console.log(`índice     ${p.type} ${p.versions.join(", ")} (${p.kind}) — ${p.name}`);
          if (!installed.length && !available) console.log("sin dispositivos instalados");
        }
        emit({ ok: true, installed, available });
        return code;
      }
      throw new CliError(EXIT.USAGE, `device: subcomando desconocido '${sub ?? ""}' (build, test, pack, install, list, link, unlink, new)`);
    } catch (err) {
      if (err instanceof CliError) throw err;
      code = EXIT.FAIL;
      if (!opts.json) console.error(`[jwsim-cli] ERROR: ${err.message}`);
      emit({ ok: false, error: err.message, security: err instanceof IndexError });
      return code;
    }
  }

  if (cmd === "scene") {
    return runSceneCommand({ opts, CliError, EXIT, emit });
  }

  throw new CliError(EXIT.USAGE, `comando desconocido '${cmd}'`);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const code = err.exitCode ?? EXIT.ENV;
    if (process.argv.includes("--json")) process.stdout.write(JSON.stringify({ command: process.argv[2], ok: false, error: err.message, exit_code: code }) + "\n");
    console.error(`[jwsim-cli] ERROR: ${err.message}`);
    if (code === EXIT.USAGE) console.error(USAGE);
    process.exit(code);
  });
