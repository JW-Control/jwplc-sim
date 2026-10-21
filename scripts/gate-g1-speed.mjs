#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G1_SPEED_X10 (docs/GATES.md):
//   C1 sin factor: >= 20x tiempo real (02_io_basic y start_stop_8io, 60 s virtuales)
//   C2 --realtime 10 durante 60 s virtuales: atraso acumulado <= 1 %
//   C3 pausar congela millis(): sin saltos entre líneas consecutivas
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, parseTimeline, printCriteria, runExe, writeReport } from "./lib/gate-util.mjs";

const VIRTUAL_MS = Number(process.env.JWSIM_SPEED_MS ?? 60000);
const { root } = resolvePackageRoot();
const io = await buildSketch(join(root, "tools", "build-speed-benchmark", "sketches", "02_io_basic"), { log: () => {} });
const ss = await buildSketch(join(ROOT, "tests", "sketches", "start_stop_8io"), { log: () => {} });
const mp = await buildSketch(join(ROOT, "tests", "sketches", "millis_pause"), { log: () => {} });
const ssStim = ["--stim", join(ROOT, "tests", "poc", "start_stop_8io.stim")];

const criteria = {};

const free = [
  ["02_io_basic", io.exe, []],
  ["start_stop_8io", ss.exe, ssStim],
].map(([name, exe, extra]) => {
  const r = parseResult(runExe(exe, ["--until", String(VIRTUAL_MS), "--quiet", ...extra]).stdout);
  return { name, factor: +(VIRTUAL_MS / Number(r.wall_ms)).toFixed(1) };
});
criteria.C1_free_run = { pass: free.every((f) => f.factor >= 20), results: free };

const rt = [
  ["02_io_basic", io.exe, []],
  ["start_stop_8io", ss.exe, ssStim],
].map(([name, exe, extra]) => {
  const r = parseResult(runExe(exe, ["--until", String(VIRTUAL_MS), "--realtime", "10", "--quiet", ...extra]).stdout);
  const expected = VIRTUAL_MS / 10;
  const wall = Number(r.wall_ms);
  return { name, wall_ms: wall, expected_ms: expected, drift_pct: +((Math.abs(wall - expected) / expected) * 100).toFixed(3), max_lag_ms: Number(r.rt_max_lag_ms) };
});
criteria.C2_realtime_x10 = { pass: rt.every((r) => r.drift_pct <= 1), results: rt };

const p = runExe(mp.exe, ["--until", "4000", "--pause", "2000:5000"]);
const lines = parseTimeline(p.stdout).filter((e) => e.kind === "UART" && e.text.startsWith("millis="));
const values = lines.map((l) => Number(l.text.slice(7)));
const deltas = values.slice(1).map((v, i) => v - values[i]);
criteria.C3_pause_freezes_time = {
  pass: values.length >= 25 && deltas.every((d) => d === 100) && p.wallMs >= 5000,
  lines: values.length,
  deltas: [...new Set(deltas)],
  wall_ms: p.wallMs,
};

const pass = printCriteria("JWSIM_G1_SPEED_X10", criteria);
writeReport("JWSIM_G1_SPEED_X10", { gate: "JWSIM_G1_SPEED_X10", result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
