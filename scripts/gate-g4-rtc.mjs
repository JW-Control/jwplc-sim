#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_RTC_DS3232M: tests del modelo y 03.RTC_Basic del package
// (sin modificar): RTC nuevo sin hora válida; hora fija que sigue al tiempo
// virtual (también a máxima velocidad); persistencia por batería entre
// corridas; hora del host.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const sketch = join(root, lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_GlobalPeripherals", "examples", "03.RTC_Basic");
const work = join(ROOT, "build", "gates", "g4", `rtc-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const models = spawnSync(process.execPath, [join(ROOT, "scripts", "test-models.mjs"), "--target", target], { encoding: "utf8" });
const modelLine = models.stdout.split("\n").find((l) => l.startsWith("DS3232M:")) ?? "";

const { exe } = await buildSketch(sketch, { target, log: () => {} });
// Líneas "RTC present=1 valid=1 lostPower=0 | 22/10/2026 23:59:58 | tempRTC=25.00 C".
const lines = (out) =>
  out
    .split(/\r?\n/)
    .filter((l) => l.includes("RTC present="))
    .map((l) => {
      const m = l.match(/present=(\d) valid=(\d) lostPower=(\d)(?: \| (\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+))?.*tempRTC=([\d.-]+)/);
      return m && {
        present: +m[1], valid: +m[2], lost: +m[3], temp: +m[10],
        epoch: m[4] ? Date.UTC(+m[6], +m[5] - 1, +m[4], +m[7], +m[8], +m[9]) / 1000 : null,
      };
    })
    .filter(Boolean);

const fresh = lines(runExe(exe, ["--until", "2500"]).stdout);
const fixed = lines(runExe(exe, ["--until", "4500", "--rtc", "fijo:2026-10-22T23:59:58"]).stdout);
const t0 = Date.UTC(2026, 9, 22, 23, 59, 58) / 1000;
const fast = lines(runExe(exe, ["--until", "61500", "--rtc", "fijo:2026-10-22T23:59:58"]).stdout);
const state = join(work, "estado");
const p1 = lines(runExe(exe, ["--until", "3500", "--rtc", "fijo:2026-12-31T23:59:50", "--state", state]).stdout);
const p2 = lines(runExe(exe, ["--until", "2500", "--state", state]).stdout);
const host = lines(runExe(exe, ["--until", "1500", "--rtc", "host"]).stdout);
const d = new Date();
const hostNow = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 1000;

const criteria = {
  modelo: { pass: models.status === 0 && /0 con fallas/.test(modelLine), resumen: modelLine.trim() },
  rtc_nuevo_sin_hora: { pass: fresh.length >= 2 && fresh.every((l) => l.present === 1 && l.valid === 0 && l.lost === 1 && l.temp === 25), lineas: fresh.length },
  hora_fija_sigue_al_tiempo_virtual: {
    // Una línea por segundo virtual (t = 1, 2, 3, 4 s) con la hora +0, +1, +2, +3 s (cruza la medianoche).
    pass: fixed.length === 4 && fixed.every((l, i) => l.valid === 1 && l.epoch === t0 + i),
    horas: fixed.map((l) => l.epoch - t0),
  },
  maxima_velocidad: {
    pass: fast.length === 61 && fast.at(-1).epoch - fast[0].epoch === 60,
    segundos_rtc: fast.length ? fast.at(-1).epoch - fast[0].epoch : null,
  },
  persistencia_bateria: {
    // Corrida 1: 23:59:50 + 3 s. Corrida 2 (sin --rtc) sigue desde la hora guardada (+3 s al terminar).
    // (JWPLC_Time es la vista cacheada del runtime: la primera línea de cada
    // corrida muestra la hora del arranque.)
    pass: p1.length === 3 && p2.length === 2 && p2[0].valid === 1 && p2[0].epoch === Date.UTC(2026, 11, 31, 23, 59, 50) / 1000 + 3,
    ultima_hora_corrida1: p1.at(-1)?.epoch,
    primera_hora_corrida2: p2[0]?.epoch,
  },
  hora_del_host: { pass: host.length === 1 && host[0].valid === 1 && Math.abs(host[0].epoch - hostNow) <= 5, diferencia_s: host[0] ? host[0].epoch - hostNow : null },
};
const pass = printCriteria("JWSIM_G4_RTC_DS3232M", criteria, ` (${target})`);
writeReport(`JWSIM_G4_RTC_DS3232M-${target}`, { gate: "JWSIM_G4_RTC_DS3232M", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
