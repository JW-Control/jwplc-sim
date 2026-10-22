#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnóstico del depurador: adjunta gdb al runner de g3_debug de dos formas
// (gdb -batch y gdb -i=dap con registro del adaptador) e imprime tiempos y
// salidas. Sirve para investigar fallas de attach en Windows.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { DapClient } from "../app/lib/dap-client.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";

const tc = toolchain();
const out = join(ROOT, "build", "gates", "g3");
mkdirSync(out, { recursive: true });
const { exe } = await buildSketch(join(ROOT, "tests", "sketches", "g3_debug"), { log: () => {} });
console.log(`gdb: ${tc.gdb}\nexe: ${exe}`);

function startRunner() {
  const r = new RunnerProcess();
  r.start(exe, [], { env: { JWSIM_DEBUG: "1", JWSIM_WATCHDOG_MS: "0" } });
  return r;
}

// 1) gdb -batch
{
  const r = startRunner();
  await new Promise((res) => setTimeout(res, 500));
  const t0 = Date.now();
  const g = spawnSync(tc.gdb, ["-nx", "-batch", "-ex", `attach ${r.pid}`, "-ex", "info threads", "-ex", "bt 5", "-ex", "detach"], {
    encoding: "utf8",
    timeout: 120000,
  });
  console.log(`\n== gdb -batch attach: ${Date.now() - t0} ms, estado ${g.status} ${g.error ? g.error.message : ""}`);
  console.log(g.stdout.slice(-3000));
  console.log(g.stderr.slice(-2000));
  r.stop();
  await new Promise((res) => setTimeout(res, 800));
}

// 2) gdb -i=dap con registro
{
  const r = startRunner();
  await new Promise((res) => setTimeout(res, 500));
  const log = join(out, "dap.log");
  const dap = new DapClient(tc.gdb, { extraArgs: ["-iex", `set debug dap-log-file ${log.replaceAll("\\", "/")}`] });
  let err = "";
  dap.on("stderr", (t) => (err += t));
  dap.on("output", (b) => (err += b.output ?? ""));
  const t0 = Date.now();
  try {
    const initialized = dap.waitEvent("initialized", 120000);
    await dap.request("initialize", { adapterID: "gdb", linesStartAt1: true, columnsStartAt1: true, pathFormat: "path" }, 120000);
    console.log(`\n== DAP initialize: ${Date.now() - t0} ms`);
    await dap.request("attach", { pid: r.pid, program: exe }, 120000);
    console.log(`== DAP attach: ${Date.now() - t0} ms`);
    await initialized;
    const th = await dap.request("threads", {}, 60000);
    console.log(`== DAP threads: ${JSON.stringify(th.threads)}`);
  } catch (e) {
    console.log(`== DAP error tras ${Date.now() - t0} ms: ${e.message}`);
  }
  console.log(err.slice(-3000));
  dap.kill();
  r.stop();
  if (existsSync(log)) console.log(`\n== dap.log (final)\n${readFileSync(log, "utf8").slice(-6000)}`);
}
process.exit(0);
