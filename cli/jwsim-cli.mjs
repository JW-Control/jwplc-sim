#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// jwsim-cli — interfaz de línea de comandos del simulador (modo headless, G5).
//
//   jwsim-cli build  <sketch_dir> [opciones de build]
//   jwsim-cli run    <sketch_dir> [opciones de build] -- [opciones del runner]
//   jwsim-cli test   <archivo.jwtest.json|carpeta>... [opciones de build] [--report <archivo>]
//   jwsim-cli parity [<ref>] [--package <dir>] [--update] [--report <archivo>]
//   jwsim-cli matrix [--filter <texto>] [opciones de build] [--report <archivo>]
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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { buildSketch, ROOT } from "./lib/build.mjs";
import { runMatrix } from "./lib/matrix.mjs";
import { checkParity } from "./lib/parity.mjs";
import { parseResult, parseTimeline, runExe } from "./lib/runner.mjs";
import { findTests, loadTest, runTest } from "./lib/test.mjs";
import { toolchain } from "./lib/toolchain.mjs";
import { fetchPackageRef, packageFromDir, resolvePackageRoot } from "../scripts/fetch-package.mjs";

export const EXIT = { OK: 0, FAIL: 1, USAGE: 2, BUILD: 3, SIM: 4, ENV: 5 };

const USAGE = `uso:
  jwsim-cli build  <sketch_dir> [--target native|windows] [--out dir] [--package dir] [--json]
  jwsim-cli run    <sketch_dir> [opciones de build] [--json] -- [opciones del runner]
  jwsim-cli test   <archivo.jwtest.json|carpeta>... [opciones de build] [--json] [--report archivo]
  jwsim-cli parity [<ref>] [--package dir] [--update] [--json] [--report archivo]
  jwsim-cli matrix [--filter texto] [opciones de build] [--json] [--report archivo]`;

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
    else if (a === "--report") opts.report = value(++i, a);
    else if (a === "--filter") opts.filter = value(++i, a);
    else if (a === "--json") opts.json = true;
    else if (a === "--update") opts.update = true;
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
    const r = await buildSketch(sketch, { ...opts, package: pkg, log: opts.json ? (m) => process.stderr.write(m + "\n") : undefined });
    return { ...base, ok: true, executable: r.exe, libraries: r.libraries, wall_ms: Date.now() - t0 };
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
  const emit = (obj) => {
    report = { command: cmd, ...obj, exit_code: code };
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
      const r = await runTest(t, { pkg, target: opts.target ?? "native", buildRoot: resolve(opts.outDir ?? join(ROOT, "build", "tests")) });
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
