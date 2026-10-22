#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gates JWSIM_G3_BREAKPOINTS_STEP y JWSIM_G3_FREEZE_TIME con el sketch
// tests/sketches/g3_debug: el runner corre por el protocolo stdio (como en la
// app) y gdb -i=dap se le adjunta (app/lib/debug-session.mjs).
//
// BREAKPOINTS_STEP: breakpoint en loop(), next, stepIn a doble(), argumentos
//   y variables locales, stepOut de vuelta a loop() y valores de globales.
// FREEZE_TIME: detenido en un breakpoint, millis() y el tiempo virtual son
//   idénticos antes y después de 10 s de reloj de pared, el runner no envía
//   nada mientras tanto y, al continuar, el tiempo virtual no "recupera" los
//   10 s perdidos.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DebugSession } from "../app/lib/debug-session.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const FREEZE_MS = Number(process.env.JWSIM_FREEZE_MS ?? 10000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sketchDir = join(ROOT, "tests", "sketches", "g3_debug");
const ino = join(sketchDir, "g3_debug.ino");
const marks = Object.fromEntries(
  readFileSync(ino, "utf8")
    .split(/\r?\n/)
    .flatMap((l, i) => [...l.matchAll(/MARCA:(\w+)/g)].map((m) => [m[1], i + 1])),
);

const tc = toolchain(target);
const step = (m) => console.log(`[g3-debug] ${m}`);
step(`compilando g3_debug (${target}); gdb: ${tc.gdb}`);
const { exe } = await buildSketch(sketchDir, { target, log: () => {} });
step("compilado; lanzando el runner y adjuntando gdb");

const runner = new RunnerProcess();
let lastStatus = null;
let messagesWhileFrozen = null;
let stderr = "";
let stoppedMsg = null;
runner.on("message", (m) => {
  if (m.type === "stopped") stoppedMsg = m;
  if (m.t_ns !== undefined) lastStatus = { t_ns: m.t_ns, wall: performance.now() };
  if (messagesWhileFrozen) messagesWhileFrozen.push(m.type);
});
runner.on("stderr", (t) => (stderr += t));
const exited = new Promise((r) => runner.on("exit", r));
runner.start(exe, [], { env: { JWSIM_DEBUG: "1", JWSIM_WATCHDOG_MS: "0" } });

// El gate lee jwsim_now() (función pura del motor) con el programa detenido.
const dbg = new DebugSession({ gdb: tc.gdb, exe, pid: runner.pid, allowCalls: true });
let gdbOut = "";
dbg.on("output", (t) => {
  gdbOut += t;
  // En CI se ve en vivo lo que dice gdb (diagnóstico de cuelgues).
  if (process.env.CI) process.stdout.write(`[gdb] ${t}${t.endsWith("\n") ? "" : "\n"}`);
});
const stops = [];
let stopWaiter = null;
dbg.on("stopped", (s) => {
  if (stopWaiter) {
    const w = stopWaiter;
    stopWaiter = null;
    w(s);
  } else stops.push(s);
});
const nextStop = (ms = 15000) =>
  stops.length
    ? Promise.resolve(stops.shift())
    : new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`gdb no se detuvo en ${ms} ms`)), ms);
        stopWaiter = (s) => {
          clearTimeout(t);
          resolve(s);
        };
      });
const where = (s) => ({ name: s.frame?.name, file: s.frame?.path?.split(/[\\/]/).pop(), line: s.frame?.line });
const num = (v) => Number(String(v).match(/-?\d+/)?.[0]);

const criteria = {};
const freeze = {};
try {
  runner.send({ type: "debug", attached: 1 });
  const verified = await dbg.start(new Map([[ino, [marks.loop]]]));
  runner.send({ type: "run", speed: 1 });

  // --- BREAKPOINTS_STEP
  step("gdb adjunto; esperando el breakpoint");
  const s1 = await nextStop();
  step(`detenido: ${JSON.stringify(where(s1))}`);
  const top1 = await dbg.topFrame();
  const v1 = num((await dbg.evaluate("vueltas", top1.id)).value);
  await dbg.next();
  const s2 = await nextStop();
  await dbg.stepIn();
  const s3 = await nextStop();
  const stack3 = await dbg.stack();
  const scopes3 = await dbg.scopes(stack3[0].id);
  const vars3 = Object.fromEntries((await Promise.all(scopes3.map((s) => dbg.variables(s.ref)))).flat().map((v) => [v.name, v.value]));
  await dbg.next();
  const s3b = await nextStop();
  const r3 = num((await dbg.evaluate("r", (await dbg.topFrame()).id)).value);
  await dbg.stepOut();
  const s4 = await nextStop();
  await dbg.next();
  const s5 = await nextStop();
  const top5 = await dbg.topFrame();
  const ultimo = num((await dbg.evaluate("ultimo", top5.id)).value);
  const vueltas = num((await dbg.evaluate("vueltas", top5.id)).value);

  criteria.breakpoint_hit = {
    pass: s1.reason === "breakpoint" && where(s1).file === "g3_debug.ino" && where(s1).line === marks.loop && verified.get(ino)?.includes(marks.loop),
    reason: s1.reason,
    at: where(s1),
    verified: verified.get(ino),
  };
  criteria.step_over = { pass: where(s2).line === marks.llamada && /loop/.test(where(s2).name), at: where(s2) };
  criteria.step_in = {
    pass: /doble/.test(where(s3).name) && where(s3).line === marks.doble && /loop/.test(stack3[1]?.name ?? ""),
    at: where(s3),
    caller: stack3[1]?.name,
  };
  criteria.variables = {
    pass: num(vars3.x) === v1 + 1 && r3 === 2 * (v1 + 1) && where(s3b).line === marks.doble + 1,
    vueltas_antes: v1,
    args: vars3,
    r: r3,
  };
  criteria.step_out = {
    pass: /loop/.test(where(s4).name) && where(s4).line === marks.llamada && where(s5).line === marks.llamada + 1 && ultimo === 2 * vueltas && vueltas === v1 + 1,
    at: where(s4),
    then: where(s5),
    vueltas,
    ultimo,
  };

  // --- FREEZE_TIME (detenido en la línea siguiente a la llamada)
  // Lecturas sin efectos: llamar millis() desde el depurador ejecutaría la
  // función en el firmware y le cobraría su costo de CPU (avanza el tiempo
  // virtual), así que se usa la misma cuenta que hace millis().
  const read = async () => {
    const id = (await dbg.topFrame()).id;
    return {
      millis: num((await dbg.evaluate("(unsigned long)(jwsim_now() / 1000000)", id)).value),
      now_ns: num((await dbg.evaluate("jwsim_now()", id)).value),
      vueltas: num((await dbg.evaluate("vueltas", id)).value),
    };
  };
  step(`pasos OK; congelado ${FREEZE_MS} ms`);
  const before = await read();
  messagesWhileFrozen = [];
  const w0 = performance.now();
  await sleep(FREEZE_MS);
  const wallFrozen = performance.now() - w0;
  const after = await read();
  const frozenMsgs = messagesWhileFrozen;
  messagesWhileFrozen = null;
  freeze.frozen = {
    pass: before.millis === after.millis && before.now_ns === after.now_ns && before.vueltas === after.vueltas && frozenMsgs.length === 0 && wallFrozen >= FREEZE_MS,
    wall_ms: Math.round(wallFrozen),
    before,
    after,
    runner_messages: frozenMsgs.length,
  };

  // Sin breakpoints, continuar: el tiempo virtual avanza al ritmo del reloj
  // (×1) desde donde quedó, sin saltar los 10 s.
  await dbg.setBreakpoints(ino, []);
  lastStatus = null;
  const c0 = performance.now();
  await dbg.continue();
  await sleep(1500);
  const virtAdvanceMs = (lastStatus.t_ns - after.now_ns) / 1e6;
  const wallAdvanceMs = lastStatus.wall - c0;
  freeze.no_catch_up = {
    pass: virtAdvanceMs > 0 && virtAdvanceMs <= wallAdvanceMs + 300,
    virtual_advance_ms: Math.round(virtAdvanceMs),
    wall_advance_ms: Math.round(wallAdvanceMs),
  };

  step("continuar sin breakpoints; observación en vivo");
  // Observación en vivo: muestrear variables con el firmware corriendo.
  const m1 = await dbg.sample(["vueltas", "ultimo"]);
  await sleep(300);
  const m2 = await dbg.sample(["vueltas", "ultimo"]);
  criteria.live_watch = {
    pass: !!m1 && !!m2 && num(m2.vueltas) > num(m1.vueltas) && num(m2.ultimo) === 2 * num(m2.vueltas),
    first: m1,
    second: m2,
  };
} catch (err) {
  step(`error: ${err.message}`);
  criteria.error = { pass: false, message: err.message, gdb: gdbOut.slice(-2000), runner: stderr.slice(-2000) };
} finally {
  await dbg.stop();
  runner.send({ type: "quit" });
  await Promise.race([exited, sleep(3000)]);
  runner.stop();
}

// Depurar no altera la simulación: la misma corrida sin depurador, hasta el
// mismo instante virtual, da el mismo hash de traza (no hubo entradas).
if (stoppedMsg) {
  const until = (stoppedMsg.t_ns / 1e6).toFixed(6);
  const replay = parseResult(runExe(exe, ["--until", until, "--quiet"]).stdout);
  freeze.no_perturbation = {
    pass: replay?.trace_hash === stoppedMsg.trace_hash,
    t_end_ms: Number(until),
    debug_hash: stoppedMsg.trace_hash,
    plain_hash: replay?.trace_hash,
  };
} else {
  freeze.no_perturbation = { pass: false, message: "el runner no informó 'stopped'" };
}

const passA = printCriteria("JWSIM_G3_BREAKPOINTS_STEP", criteria, ` (${target})`);
// Sin haber llegado al breakpoint no hay nada que medir del tiempo congelado.
if (criteria.error || !freeze.frozen) freeze.error = { pass: false, message: criteria.error?.message ?? "no se llegó al breakpoint" };
const passB = printCriteria("JWSIM_G3_FREEZE_TIME", freeze, ` (${target})`);
writeReport(`JWSIM_G3_BREAKPOINTS_STEP-${target}`, { gate: "JWSIM_G3_BREAKPOINTS_STEP", target, result: passA ? "PASS" : "FAIL", criteria });
writeReport(`JWSIM_G3_FREEZE_TIME-${target}`, { gate: "JWSIM_G3_FREEZE_TIME", target, result: passB ? "PASS" : "FAIL", criteria: freeze });
process.exit(passA && passB ? 0 : 1);
