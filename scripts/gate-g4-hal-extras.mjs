#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_HAL_EXTRAS: APIs del HAL que antes fallaban con mensaje
// explícito y que el package o sketches comunes usan.
//   esp_timer      tests/sketches/g4_hal_extras/g4_esp_timer (y Ticker)
//   rtos_timers    tests/sketches/g4_hal_extras/g4_rtos_timers
//   hw_timer       tests/sketches/g4_hal_extras/g4_hw_timer y el ejemplo
//                  ESP32/Timer/RepeatTimer del core (esp32-hal-timer.c sin
//                  cambios sobre el driver GPTimer simulado)
//   esp_restart    g4_restart con tests/hal_extras/reinicio.stim: 4 arranques
//                  (desde una tarea y desde una ISR) conservando FRAM, NVS y
//                  entradas; Preferences/StartCounter del core cuenta 1..4
//                  en 35 s; sin --state no deja el directorio temporal
//   determinismo   las corridas con reinicios repiten el hash, y el modo
//                  interactivo (protocolo, la app relanza el runner) llega
//                  al mismo hash que la CLI
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const SK = join(ROOT, "tests", "sketches", "g4_hal_extras");
const work = join(ROOT, "build", "gates", "g4", `hal-extras-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const lines = (stdout) => stdout.split(/\r?\n/).map((l) => l.match(/UART0 (.*)$/)?.[1]).filter((l) => l !== undefined);
const summary = (stdout, tag) => {
  const m = stdout.match(new RegExp(`${tag}: (\\d+) PASS, (\\d+) FAIL`));
  return { pass: m ? Number(m[1]) : 0, fail: m ? Number(m[2]) : null, fallas: lines(stdout).filter((l) => l.startsWith("[FAIL]")) };
};
const criteria = {};

for (const [key, dir, tag, until] of [
  ["esp_timer", "g4_esp_timer", "ESP_TIMER", 2000],
  ["rtos_timers", "g4_rtos_timers", "RTOS_TIMERS", 3000],
  ["hw_timer", "g4_hw_timer", "HW_TIMER", 2000],
]) {
  const exe = await build(join(SK, dir));
  const r = runExe(exe, ["--until", String(until)]);
  const s = summary(r.stdout, tag);
  criteria[key] = { pass: r.status === 0 && s.fail === 0 && s.pass >= 15, ...s };
}

// RepeatTimer del core: una interrupción por segundo desde timerBegin.
{
  const exe = await build(join(libs, "ESP32", "examples", "Timer", "RepeatTimer"));
  const r = runExe(exe, ["--until", "5000"]);
  const got = lines(r.stdout).filter((l) => /^onTimer no\./.test(l));
  const want = [1, 2, 3, 4].map((k) => `onTimer no. ${k} at ${588 + 1000 * k} ms`);
  criteria.hw_timer.repeat_timer = got;
  criteria.hw_timer.pass &&= got.join("|") === want.join("|");
}

// ---- esp_restart
{
  const exe = await build(join(SK, "g4_restart"));
  const stim = join(ROOT, "tests", "hal_extras", "reinicio.stim");
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const state = join(work, `reinicio-${i}`);
    const r = runExe(exe, ["--until", "6000", "--stim", stim, "--state", state]);
    const boots = [...r.stdout.matchAll(/\[\s*([\d.]+) ms\] UART0 arranque (\d+) razon=(\d+) millis=(\d+)/g)].map((m) => ({
      t: Number(m[1]),
      n: Number(m[2]),
      razon: Number(m[3]),
      millis: Number(m[4]),
    }));
    const sums = [1, 2, 3, 4].map((n) => summary(r.stdout, `REINICIO arranque ${n}`));
    runs.push({ status: r.status, boots, sums, hash: parseResult(r.stdout)?.trace_hash });
  }
  const [a, b] = runs;
  criteria.esp_restart = {
    pass:
      a.status === 0 &&
      a.boots.map((x) => x.n).join() === "1,2,3,4" &&
      a.boots.map((x) => x.razon).join() === "1,3,3,3" &&
      a.boots.every((x) => x.millis === a.boots[0].millis) &&
      a.sums.every((s) => s.fail === 0 && s.pass >= 4),
    arranques: a.boots,
    resumen: a.sums.map(({ pass, fail }) => ({ pass, fail })),
  };
  criteria.determinismo = { pass: !!a.hash && a.hash === b.hash, hash_cli: a.hash };

  // Modo interactivo: la reproducción por protocolo (la app relanza el
  // runner en cada reinicio) llega al mismo hash.
  if (target === "native" || process.platform === "win32") {
    const reached = await new Promise((resolve) => {
      const p = new RunnerProcess();
      const timer = setTimeout(() => resolve({ error: "sin respuesta en 120 s" }), 120000);
      let restarts = 0;
      p.on("restarted", () => restarts++);
      p.on("message", (m) => {
        if (m.type === "hello" && restarts === 0) p.send({ type: "run", speed: 0, until_ns: 6000 * 1e6 });
        if (m.type === "reached") {
          clearTimeout(timer);
          p.stop();
          resolve({ hash: m.trace_hash, t_ns: m.t_ns, restarts });
        }
      });
      p.on("exit", ({ code }) => resolve({ error: `el runner terminó (código ${code})` }));
      p.start(exe, ["--stim", stim, "--state", join(work, "reinicio-port")]);
    });
    criteria.determinismo.hash_protocolo = reached.hash ?? reached.error;
    criteria.determinismo.reinicios_protocolo = reached.restarts;
    criteria.determinismo.pass &&= reached.hash === a.hash && reached.restarts === 3;
  } else {
    criteria.determinismo.protocolo = "omitido bajo wine (corre en Windows nativo)";
  }

  // Sin --state: directorio temporal propio, borrado al terminar.
  const tmp = join(work, "tmp");
  mkdirSync(tmp, { recursive: true });
  // Bajo wine la carpeta temporal se pasa como ruta de Windows (unidad Z:).
  const winTmp = exe.endsWith(".exe") && process.platform !== "win32" ? `Z:${tmp.replaceAll("/", "\\")}` : tmp;
  const env = { TMPDIR: tmp, TMP: winTmp, TEMP: winTmp };
  const old = { ...process.env };
  Object.assign(process.env, env);
  const r = runExe(exe, ["--until", "6000", "--stim", stim]);
  for (const k of Object.keys(env)) {
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  }
  const left = readdirSync(tmp).filter((f) => f.startsWith("jwsim-reinicio"));
  criteria.esp_restart.sin_estado = { arranques: (r.stdout.match(/UART0 arranque \d/g) ?? []).length, temporales_restantes: left };
  criteria.esp_restart.pass &&= criteria.esp_restart.sin_estado.arranques === 4 && left.length === 0;
}

// StartCounter (Preferences del core): reinicia cada 10 s.
{
  const exe = await build(join(libs, "Preferences", "examples", "StartCounter"));
  const runs = [0, 1].map((i) => {
    const r = runExe(exe, ["--until", "35000", "--state", join(work, `startcounter-${i}`)]);
    return { counts: [...r.stdout.matchAll(/Current counter value: (\d+)/g)].map((m) => Number(m[1])), hash: parseResult(r.stdout)?.trace_hash };
  });
  criteria.esp_restart.start_counter = runs[0].counts;
  criteria.esp_restart.pass &&= runs[0].counts.join() === "1,2,3,4";
  criteria.determinismo.pass &&= runs[0].hash === runs[1].hash;
  criteria.determinismo.hash_start_counter = runs[0].hash;
}

const pass = printCriteria("JWSIM_G4_HAL_EXTRAS", criteria, ` (${target})`);
writeReport(`JWSIM_G4_HAL_EXTRAS-${target}`, { gate: "JWSIM_G4_HAL_EXTRAS", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
