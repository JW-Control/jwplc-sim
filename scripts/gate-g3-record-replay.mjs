#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G3_RECORD_REPLAY: una sesión interactiva (entradas y forzados
// enviados por el protocolo en instantes de reloj de pared arbitrarios) se
// graba con los t_ns que informa el runner; reproducida desde el .stim
// grabado (--stim + --until) da el mismo hash de traza. Se prueba a máxima
// velocidad y a ×10 (tramos de 10 ms y de 1 ms virtuales).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = join(ROOT, "build", "gates", "g3");
mkdirSync(outDir, { recursive: true });

// Guion de la sesión: [espera en ms de pared, mensaje].
const SCRIPT = [
  [150, { type: "set", signal: "I0_0", value: 1 }],
  [120, { type: "set", signal: "I0_2", value: 1 }],
  [90, { type: "force", signal: "Q0_7", value: 1 }],
  [200, { type: "set", signal: "I0_0", value: 0 }],
  [60, { type: "force", signal: "I0_1", value: 1 }],
  [140, { type: "pause" }],
  [300, { type: "set", signal: "I0_3", value: 1 }], // en pausa: queda pendiente
  [10, { type: "resume" }],
  [110, { type: "unforce", signal: "Q0_7" }],
  [80, { type: "unforce", signal: "I0_1" }],
  [150, { type: "set", signal: "I0_2", value: 0 }],
  [200, null],
];

async function session(exe, speed) {
  const r = new RunnerProcess();
  const recorded = [];
  let stopped = null;
  let stderr = "";
  r.on("message", (m) => {
    if (m.type === "input") recorded.push(m);
    if (m.type === "stopped") stopped = m;
  });
  r.on("stderr", (t) => (stderr += t));
  const exited = new Promise((res) => r.on("exit", res));
  r.start(exe);
  r.send({ type: "run", speed });
  for (const [wait, msg] of SCRIPT) {
    await sleep(wait);
    if (!msg) continue;
    r.send(msg.type === "resume" ? { type: "run", speed } : msg);
  }
  r.send({ type: "quit" });
  await exited;
  if (!stopped) throw new Error(`el runner no informó 'stopped': ${stderr}`);
  return { recorded, stopped };
}

const { exe } = await buildSketch(join(ROOT, "tests", "sketches", "start_stop_8io"), { target, log: () => {} });
const criteria = {};
for (const [label, speed] of [["max", 0], ["x10", 10]]) {
  const { recorded, stopped } = await session(exe, speed);
  const stim = join(outDir, `sesion-${label}.stim`);
  const lines = [
    `# Sesión grabada por gate-g3-record-replay (velocidad ${label}); fin en t=${stopped.t_ns} ns`,
    ...recorded.map((m) => `${(m.t_ns / 1e6).toFixed(6)} ${m.stim}`),
  ];
  writeFileSync(stim, lines.join("\n") + "\n");
  const until = (stopped.t_ns / 1e6).toFixed(6);
  const replay = parseResult(runExe(exe, ["--stim", stim, "--until", until, "--quiet"]).stdout);
  criteria[`replay_${label}`] = {
    pass: recorded.length === SCRIPT.filter(([, m]) => m && /set|force/.test(m.type)).length && replay?.trace_hash === stopped.trace_hash,
    inputs_recorded: recorded.length,
    t_end_ms: Number(until),
    session_hash: stopped.trace_hash,
    replay_hash: replay?.trace_hash,
    stim,
  };
}

const pass = printCriteria("JWSIM_G3_RECORD_REPLAY", criteria, ` (${target})`);
writeReport(`JWSIM_G3_RECORD_REPLAY-${target}`, { gate: "JWSIM_G3_RECORD_REPLAY", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
