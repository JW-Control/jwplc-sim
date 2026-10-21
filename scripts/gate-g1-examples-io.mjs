#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G1_PACKAGE_EXAMPLES_IO: ejemplos de E/S del package, sin
// modificar, contra tablas de verdad (tests/poc/io_patterns.stim).
// La calibración de costos contra el profiler H3E.0B en un JWPLC Basic real
// queda PENDING hasta contar con la medición en placa.
import { join } from "node:path";

import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseTimeline, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";
import { ROOT } from "../cli/lib/build.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const ex = (n) => join(root, lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_GlobalPeripherals", "examples", n);
const STIM = join(ROOT, "tests", "poc", "io_patterns.stim");
const PATTERN_T0 = 2000;
const PATTERN_DT = 600;
const PATTERNS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0xff, 0xa5, 0x5a, 0x00];
const UNTIL = PATTERN_T0 + PATTERN_DT * PATTERNS.length + 400;

// Mapa de bits de una familia (DI o DO) en el instante t.
function bitsAt(events, kind, t) {
  let v = 0;
  for (const e of events) {
    if (e.kind !== kind || e.t > t) continue;
    const k = Number(e.name.slice(3));
    v = e.v ? v | (1 << k) : v & ~(1 << k);
  }
  return v;
}

const hex = (v) => `0x${v.toString(16).padStart(2, "0").toUpperCase()}`;

async function run(name, args = ["--stim", STIM]) {
  const { exe } = await buildSketch(ex(name), { target, log: () => {} });
  const r = runExe(exe, ["--until", String(UNTIL), ...args]);
  if (r.status !== 0) throw new Error(`${name} terminó con ${r.status}: ${r.stderr}`);
  return parseTimeline(r.stdout);
}

// Espejo: 150 ms después de cada patrón, DO == DI == patrón.
function checkMirror(events) {
  const bad = [];
  PATTERNS.forEach((p, i) => {
    const t = PATTERN_T0 + PATTERN_DT * i + 150;
    const di = bitsAt(events, "DI", t);
    const dout = bitsAt(events, "DO", t);
    if (di !== p || dout !== p) bad.push(`t=${t}: DI=${hex(di)} DO=${hex(dout)} esperado ${hex(p)}`);
  });
  return bad;
}

// Consola: la última línea antes del fin de cada ventana refleja el patrón.
function checkConsole(events, regex, parse) {
  const bad = [];
  PATTERNS.forEach((p, i) => {
    const end = PATTERN_T0 + PATTERN_DT * (i + 1);
    const lines = events.filter((e) => e.kind === "UART" && e.t > end - PATTERN_DT + 100 && e.t <= end && regex.test(e.text));
    if (!lines.length) return bad.push(`sin línea en la ventana de ${hex(p)}`);
    const v = parse(lines[lines.length - 1].text.match(regex));
    if (v !== p) bad.push(`ventana ${hex(p)}: consola ${hex(v)}`);
  });
  return bad;
}

const criteria = {};
for (const name of ["01.DigitalIO_Basic", "DigitalIO_BlockMirror", "JWPLC_IO_BlockMirror"]) {
  const bad = checkMirror(await run(name));
  criteria[name] = { pass: bad.length === 0, failures: bad };
}
{
  const ev = await run("DigitalIO_BlockRead");
  const bad = checkConsole(ev, /^IN: 0b([01]{8})$/, (m) => parseInt(m[1], 2));
  criteria["DigitalIO_BlockRead"] = { pass: bad.length === 0, failures: bad };
}
{
  // Imprime cada 1000 ms: cada línea debe coincidir con las entradas vigentes
  // (se descartan las que caen a menos de 100 ms de un cambio de patrón).
  const ev = await run("06.Runtime_Cache_Status");
  const re = /^IO ready=1 IN=0x([0-9A-F]{2}) /;
  const changes = PATTERNS.map((_, i) => PATTERN_T0 + PATTERN_DT * i);
  const lines = ev.filter((e) => e.kind === "UART" && re.test(e.text) && !changes.some((c) => e.t >= c && e.t - c < 100));
  const bad = lines
    .filter((e) => parseInt(e.text.match(re)[1], 16) !== bitsAt(ev, "DI", e.t))
    .map((e) => `t=${e.t}: consola ${e.text.match(re)[1]} DI=${hex(bitsAt(ev, "DI", e.t))}`);
  criteria["06.Runtime_Cache_Status"] = { pass: bad.length === 0 && lines.length >= 6, checked_lines: lines.length, failures: bad };
}
{
  // Secuencia 0x88 -> 0x11 -> 0x00 con periodo de 1000 ms tras setup().
  const ev = await run("DigitalIO_BlockWrite", []);
  const seq = [];
  let last = -1;
  for (const e of ev.filter((e) => e.kind === "DO")) {
    const v = bitsAt(ev, "DO", e.t);
    if (v !== last) {
      seq.push({ t: e.t, v });
      last = v;
    }
  }
  const values = seq.map((s) => s.v);
  const expected = [0x88, 0x11, 0x00];
  const okSeq = values.length >= 6 && values.every((v, i) => v === expected[i % 3]);
  const periods = seq.slice(1).map((s, i) => +(s.t - seq[i].t).toFixed(3));
  const okPeriod = periods.every((d) => Math.abs(d - 1000) <= 25);
  criteria["DigitalIO_BlockWrite"] = { pass: okSeq && okPeriod, sequence: values.map(hex), periods_ms: [...new Set(periods)] };
}
criteria.calibration_h3e0b = {
  pass: null,
  note: "PENDING: requiere medir el periodo de scan con el profiler H3E.0B en un JWPLC Basic real y ajustar jwsim_cost_model (error < 10 %).",
};

const truthTables = printCriteria("JWSIM_G1_PACKAGE_EXAMPLES_IO", criteria, ` (${target}; calibración pendiente)`);
writeReport(`JWSIM_G1_PACKAGE_EXAMPLES_IO-${target}`, {
  gate: "JWSIM_G1_PACKAGE_EXAMPLES_IO",
  target,
  truth_tables: truthTables ? "PASS" : "FAIL",
  calibration: "PENDING",
  criteria,
});
process.exit(truthTables ? 0 : 1);
