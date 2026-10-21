#!/usr/bin/env node
// jwsim-cli — interfaz de línea de comandos del simulador (modo headless).
//
//   jwsim-cli build <sketch_dir> [--target native|windows] [--out <dir>] [--cc gcc|clang]
//   jwsim-cli run   <sketch_dir> [opciones de build] -- [opciones del runner]
//
// Opciones del runner (ver sim/runner/main.cpp): --until <ms>, --stim <archivo>,
// --set I0_0=1@100ms, --quiet, --hash.
import { spawnSync } from "node:child_process";

import { buildSketch } from "./lib/build.mjs";

function parse(argv) {
  const opts = { _: [], runner: [] };
  const dash = argv.indexOf("--");
  const main = dash >= 0 ? argv.slice(0, dash) : argv;
  if (dash >= 0) opts.runner = argv.slice(dash + 1);
  for (let i = 0; i < main.length; i++) {
    const a = main[i];
    if (a === "--target") opts.target = main[++i];
    else if (a === "--out") opts.outDir = main[++i];
    else if (a === "--cc") opts.cc = main[++i];
    else if (a === "--board") opts.board = main[++i];
    else opts._.push(a);
  }
  return opts;
}

const USAGE = "uso: jwsim-cli <build|run> <sketch_dir> [--target native|windows] [--out dir] [-- opciones del runner]";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parse(rest);
  if (!cmd || !opts._[0] || !["build", "run"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }
  const { exe } = await buildSketch(opts._[0], opts);
  if (cmd === "run") {
    if (opts.target === "windows" && process.platform !== "win32") {
      console.error("[jwsim-cli] binario Windows generado; no se puede ejecutar en este SO");
      process.exit(0);
    }
    const r = spawnSync(exe, opts.runner, { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
}

main().catch((err) => {
  console.error(`[jwsim-cli] ERROR: ${err.message}`);
  process.exit(1);
});
