#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G2_UNSUPPORTED_LIB_MSG: un sketch por familia no soportada
// (tests/sketches/g2_unsupported). Cada uno debe fallar, al compilar o al
// primer uso, con un mensaje en español que nombre la librería o API y el
// gate que la soportará (JWSIM_Gn_…) o que diga que no está en el plan.
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const DIR = join(ROOT, "tests", "sketches", "g2_unsupported");
// Nombre que el mensaje debe contener, por sketch.
const EXPECT = {
  unsup_wifi: "WiFi",
  unsup_webserver: "WebServer",
  unsup_preferences: "Preferences",
  unsup_littlefs: "LittleFS",
  unsup_adc: "analogRead",
  unsup_dac: "dacWrite",
  unsup_i2c_slave: "i2cSlave",
  unsup_freertos_timer: "xTimerCreate",
  unsup_esp_timer: "esp_timer_create",
  unsup_restart: "esp_restart",
};
const PLAN = /JWSIM_G\d+_[A-Z0-9_]+|No está en el plan de gates G0–G10/;

const criteria = {};
for (const name of readdirSync(DIR).sort()) {
  let message = null;
  let stage = "compilación";
  try {
    const { exe } = await buildSketch(join(DIR, name), { target, log: () => {} });
    stage = "ejecución";
    const r = runExe(exe, ["--until", "2000", "--quiet"]);
    message = (r.stdout + r.stderr).split(/\r?\n/).find((l) => /no (está|están) soportad/.test(l)) ?? null;
    if (r.status === 0) message = null;
  } catch (err) {
    message = err.message;
  }
  const ok = !!message && message.includes(EXPECT[name]) && PLAN.test(message) && /soportad/.test(message);
  criteria[name] = { pass: ok, stage, message };
}
const pass = printCriteria("JWSIM_G2_UNSUPPORTED_LIB_MSG", criteria);
writeReport(`JWSIM_G2_UNSUPPORTED_LIB_MSG-${target}`, { gate: "JWSIM_G2_UNSUPPORTED_LIB_MSG", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
