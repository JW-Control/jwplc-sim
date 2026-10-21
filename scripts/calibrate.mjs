#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Compara la salida de tests/hardware/jwsim_calibration en un JWPLC Basic
// real (captura del monitor serie) con la del simulador y calcula el error
// del modelo de costos. Uso:
//   node scripts/calibrate.mjs <captura_placa.txt> [captura_sim.txt]
// Sin captura del simulador, la genera ejecutando el sketch 66 s virtuales.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { runExe } from "./lib/gate-util.mjs";

function parse(text) {
  const phases = {};
  let bench = null;
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("JWSIM_CAL ");
    if (i < 0) continue;
    const kv = Object.fromEntries(
      line
        .slice(i + 10)
        .trim()
        .split(/\s+/)
        .map((t) => t.split("="))
        .filter((p) => p.length === 2),
    );
    if (line.includes("JWSIM_CAL bench")) bench = kv;
    else if (kv.phase) (phases[kv.phase] ??= []).push(kv);
  }
  // Se descarta la primera ventana de cada fase (transitorio de arranque/cambio).
  const avg = (rows, k) => {
    const v = rows.slice(1).map((r) => Number(r[k])).filter((x) => !Number.isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  };
  const out = {};
  for (const [p, rows] of Object.entries(phases)) {
    out[p] = {
      loop_us: avg(rows, "loop_us"),
      scan_period_ms: avg(rows, "window_ms") / avg(rows, "system_io_calls"),
      system_io_avg_us: avg(rows, "system_io_avg_us"),
      task_yield_avg_us: avg(rows, "task_yield_avg_us"),
    };
  }
  return { phases: out, bench };
}

const [hwFile, simFile] = process.argv.slice(2);
if (!hwFile) {
  console.error("uso: node scripts/calibrate.mjs <captura_placa.txt> [captura_sim.txt]");
  process.exit(2);
}
let simText;
if (simFile) simText = readFileSync(simFile, "utf8");
else {
  const { exe } = await buildSketch(join(ROOT, "tests", "hardware", "jwsim_calibration"), { log: () => {} });
  simText = runExe(exe, ["--until", "66000"]).stdout;
}
const hw = parse(readFileSync(hwFile, "utf8"));
const sim = parse(simText);

const pct = (s, h) => (((s - h) / h) * 100).toFixed(1) + " %";
console.log("fase  métrica              placa        simulador    error");
let worstScan = 0;
for (const p of Object.keys(hw.phases)) {
  for (const k of ["loop_us", "scan_period_ms", "system_io_avg_us", "task_yield_avg_us"]) {
    const h = hw.phases[p][k];
    const s = sim.phases[p]?.[k];
    console.log(`${p.padEnd(5)} ${k.padEnd(20)} ${h.toFixed(3).padStart(10)}  ${(s ?? NaN).toFixed(3).padStart(10)}  ${pct(s, h).padStart(8)}`);
    if (k === "scan_period_ms") worstScan = Math.max(worstScan, Math.abs((s - h) / h));
  }
}
if (hw.bench && sim.bench) {
  for (const k of Object.keys(hw.bench)) {
    console.log(`bench ${k.padEnd(20)} ${Number(hw.bench[k]).toFixed(3).padStart(10)}  ${Number(sim.bench[k]).toFixed(3).padStart(10)}`);
  }
}
const ok = worstScan < 0.1;
console.log(`error máximo del periodo de scan: ${(worstScan * 100).toFixed(1)} % (criterio < 10 %) -> ${ok ? "OK" : "FALLA"}`);
process.exit(ok ? 0 : 1);
