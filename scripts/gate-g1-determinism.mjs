#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G1_DETERMINISM: N corridas (100 por defecto) de cada sketch de
// referencia con su .stim producen un único hash; con MinGW-w64 GCC y wine, el
// .exe de Windows produce el mismo hash que el binario nativo.
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, printCriteria, runExe, WINE, writeReport } from "./lib/gate-util.mjs";

const RUNS = Number(process.env.JWSIM_GATE_RUNS ?? 100);
const WIN_RUNS = Number(process.env.JWSIM_GATE_WIN_RUNS ?? 10);
const { root } = resolvePackageRoot();
const bench = (n) => join(root, "tools", "build-speed-benchmark", "sketches", n);
const STIM_IO = join(ROOT, "tests", "poc", "02_io_basic.stim");

const CASES = [
  { name: "01_empty", dir: bench("01_empty"), args: ["--until", "3000", "--stim", STIM_IO] },
  { name: "02_io_basic", dir: bench("02_io_basic"), args: ["--until", "4000", "--stim", STIM_IO] },
  { name: "03_autoload_contract", dir: bench("03_autoload_contract"), args: ["--until", "3000", "--stim", STIM_IO] },
  {
    name: "start_stop_8io",
    dir: join(ROOT, "tests", "sketches", "start_stop_8io"),
    args: ["--until", "10000", "--stim", join(ROOT, "tests", "poc", "start_stop_8io.stim")],
  },
  { name: "isr_gpio", dir: join(ROOT, "tests", "sketches", "isr_gpio"), args: ["--until", "2000"] },
];

const criteria = {};
const hasWindows = toolchain("windows").available;
for (const c of CASES) {
  const { exe } = await buildSketch(c.dir, { log: () => {} });
  const hashes = new Map();
  for (let i = 0; i < RUNS; i++) {
    const r = runExe(exe, [...c.args, "--quiet"]);
    const h = parseResult(r.stdout)?.trace_hash ?? `exit:${r.status}`;
    hashes.set(h, (hashes.get(h) ?? 0) + 1);
  }
  const entry = { pass: hashes.size === 1, runs: RUNS, hashes: Object.fromEntries(hashes) };
  if (hasWindows && WINE) {
    const win = await buildSketch(c.dir, { target: "windows", log: () => {} });
    const winHashes = new Set();
    for (let i = 0; i < WIN_RUNS; i++) winHashes.add(parseResult(runExe(win.exe, [...c.args, "--quiet"]).stdout)?.trace_hash);
    entry.windows = { runs: WIN_RUNS, hashes: [...winHashes] };
    entry.pass = entry.pass && winHashes.size === 1 && hashes.has([...winHashes][0]);
  } else {
    entry.windows = "omitido (se necesitan MinGW-w64 GCC y wine para comparar Windows)";
  }
  criteria[c.name] = entry;
}
const pass = printCriteria("JWSIM_G1_DETERMINISM", criteria);
writeReport("JWSIM_G1_DETERMINISM", { gate: "JWSIM_G1_DETERMINISM", result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
