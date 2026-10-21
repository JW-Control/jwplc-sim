#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G0_POC_IO_BASIC: el sketch 02_io_basic del package, sin
// modificar, compila contra el HAL nativo y se comporta como en el PLC.
//
// Criterios (docs/GATES.md):
//   C1 compila y enlaza para x86_64 sin tocar el package
//   C2 cada cambio de I0_0 sostenido >= 100 ms aparece en Q0_0 en <= 100 ms
//   C3 ninguna otra salida cambia
//   C4 N corridas con los mismos estímulos producen el mismo hash de traza
//   C5 (opcional) el .exe de Windows produce el mismo hash (requiere MinGW-w64 GCC y wine)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { runExe, WINE } from "./lib/gate-util.mjs";

const RUNS = Number(process.env.JWSIM_GATE_RUNS ?? 10);
const STIM = join(ROOT, "tests", "poc", "02_io_basic.stim");
const UNTIL_MS = 4000;

function parseRun(stdout) {
  const events = [];
  let result = null;
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\[\s*([\d.]+) ms\] (DI|DO)\s+(\S+) = ([01])/);
    if (m) events.push({ t: Number(m[1]), kind: m[2], name: m[3], v: Number(m[4]) });
    const r = line.match(/^JWSIM_RESULT .*trace_hash=(0x[0-9a-f]+)/);
    if (r) result = { line, hash: r[1] };
  }
  return { events, result };
}

function run(exe, args) {
  const r = runExe(exe, args);
  if (r.status !== 0) throw new Error(`${exe} terminó con ${r.status}: ${r.stderr}`);
  return r.stdout;
}

// Estado de una salida en el instante t según la línea de tiempo.
function stateAt(events, name, t) {
  let v = 0;
  for (const e of events) {
    if (e.kind === "DO" && e.name === name && e.t <= t) v = e.v;
  }
  return v;
}

function check(events) {
  const failures = [];
  const di = events.filter((e) => e.kind === "DI" && e.name === "I0_0");
  const dout = events.filter((e) => e.kind === "DO");
  const latencies = [];
  for (let i = 0; i < di.length; i++) {
    const held = (i + 1 < di.length ? di[i + 1].t : UNTIL_MS) - di[i].t;
    if (held < 100) {
      latencies.push(null);   // pulso más corto que la ventana: puede filtrarse
      continue;
    }
    if (stateAt(events, "Q0_0", di[i].t + 100) !== di[i].v) {
      failures.push(`I0_0=${di[i].v} @${di[i].t} ms: Q0_0 != ${di[i].v} a los 100 ms`);
    }
    const hit = dout.find((e) => e.name === "Q0_0" && e.v === di[i].v && e.t >= di[i].t && e.t - di[i].t <= 100);
    latencies.push(hit ? +(hit.t - di[i].t).toFixed(3) : 0);
  }
  const others = dout.filter((e) => e.name !== "Q0_0");
  if (others.length) failures.push(`salidas inesperadas: ${others.map((e) => `${e.name}=${e.v}@${e.t}`).join(", ")}`);
  return { failures, latencies };
}

async function main() {
  const { root, lock } = resolvePackageRoot();
  const sketch = join(root, "tools", "build-speed-benchmark", "sketches", "02_io_basic");
  const report = { gate: "JWSIM_G0_POC_IO_BASIC", package: lock.JWPLC_PACKAGE_REF, criteria: {} };

  const { exe, libraries } = await buildSketch(sketch, { log: () => {} });
  report.criteria.C1_build_native = { pass: true, libraries };

  const args = ["--until", String(UNTIL_MS), "--stim", STIM];
  const first = parseRun(run(exe, args));
  const { failures, latencies } = check(first.events);
  report.criteria.C2_C3_behavior = { pass: failures.length === 0, failures, latencies_ms: latencies };

  const hashes = new Set([first.result.hash]);
  for (let i = 1; i < RUNS; i++) hashes.add(parseRun(run(exe, [...args, "--quiet"])).result.hash);
  report.criteria.C4_determinism = { pass: hashes.size === 1, runs: RUNS, hashes: [...hashes] };

  const wine = WINE;
  if (toolchain("windows").available) {
    const win = await buildSketch(sketch, { target: "windows", log: () => {} });
    const c5 = { built: true, exe: win.exe };
    if (wine) {
      const h = parseRun(run(win.exe, [...args, "--quiet"])).result.hash;
      c5.hash = h;
      c5.pass = h === first.result.hash;
    } else {
      c5.pass = true;
      c5.note = "compilado; no se ejecutó (wine no disponible)";
    }
    report.criteria.C5_windows = c5;
  } else {
    report.criteria.C5_windows = { pass: null, note: "omitido: falta MinGW-w64 GCC (x86_64-w64-mingw32-g++) para compilar el destino Windows" };
  }

  const pass = Object.values(report.criteria).every((c) => c.pass !== false);
  report.result = pass ? "PASS" : "FAIL";
  report.trace_hash = first.result.hash;
  report.timeline = first.events;
  const outDir = join(ROOT, "build", "gates");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "JWSIM_G0_POC_IO_BASIC.json"), JSON.stringify(report, null, 2) + "\n");
  for (const [k, v] of Object.entries(report.criteria)) {
    console.log(`${k}: ${v.pass === null ? "OMITIDO" : v.pass ? "OK" : "FALLA"}${v.failures?.length ? " " + v.failures.join("; ") : ""}`);
  }
  console.log(`latencias I0_0->Q0_0 (ms; '-' = pulso < 100 ms, 0 = ya estaba en ese estado): ${latencies.map((l) => (l === null ? "-" : l)).join(", ")}`);
  console.log(`JWSIM_G0_POC_IO_BASIC=${report.result}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(`[gate] ERROR: ${err.message}`);
  console.log("JWSIM_G0_POC_IO_BASIC=FAIL");
  process.exit(1);
});
