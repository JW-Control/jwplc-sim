// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Subir al JWPLC» (Electron + Playwright):
//   PANEL_SIN_HERRAMIENTAS  con un directorio de datos vacío y sin Arduino15,
//                           el panel ofrece descargar las herramientas del ESP32
//   PANEL_LISTO             con las herramientas, explica el package y pide puerto
//   COMPILA_PARA_ESP32      compila el sketch abierto con arduino-cli y el package
//                           fijado (bin para el JWPLC real, tamaño de flash)
//   CARGA_SIN_EQUIPO        sin JWPLC en el puerto, falla en la etapa de carga
//                           con un mensaje para el usuario
// Necesita las herramientas del ESP32 en JWSIM_ARDUINO_DATA (ver
// docs/SUBIR_JWPLC.md); sin ellas solo corre PANEL_SIN_HERRAMIENTAS.
//   cd app && xvfb-run -a node tests/e2e-subir-jwplc.mjs
import { existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const emptyData = mkdtempSync(join(tmpdir(), "jwsim-arduino-"));
const toolsData = process.env.JWSIM_ARDUINO_DATA;
const hasTools = !!toolsData && existsSync(join(toolsData, "packages", "jwplc", "tools", "esp-x32"));
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
// HOME vacío: que no aparezca un Arduino15 del sistema.
const app = await electron.launch({ args, env: { ...process.env, HOME: userData, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim"), JWSIM_ARDUINO_DATA: emptyData } });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
const sketch = join(ROOT, "JWPLC_Aprende", "extras", "retos", "01-marcha-parada", "solucion", "marcha_parada");
await win.evaluate((d) => window.jwsimTest.openSketchDir(d), sketch);
await win.evaluate(() => document.querySelector("#lesson-card button")?.click());

await win.click("#btn-upload");
await win.waitForFunction(() => !document.getElementById("up-panel").hidden && document.getElementById("up-note").textContent.length > 0, null, { timeout: 20000 });
const s1 = await win.evaluate(() => ({ tools: !document.getElementById("up-tools").hidden, go: document.getElementById("up-go").disabled, note: document.getElementById("up-note").textContent }));
criteria.PANEL_SIN_HERRAMIENTAS = { pass: s1.tools && s1.go && /Falta/.test(s1.note), ...s1 };
await win.keyboard.press("Escape");

if (hasTools) {
  await app.evaluate((_e, d) => (process.env.JWSIM_ARDUINO_DATA = d), toolsData);
  await win.click("#btn-upload");
  await win.waitForFunction(() => /package/.test(document.getElementById("up-note").textContent) || /puerto/.test(document.getElementById("up-note").textContent), null, { timeout: 20000 });
  const s2 = await win.evaluate(() => ({ tools: !document.getElementById("up-tools").hidden, note: document.getElementById("up-note").textContent }));
  criteria.PANEL_LISTO = { pass: !s2.tools, ...s2 };
  await win.keyboard.press("Escape");
  const logs = [];
  await win.exposeFunction("__upLog", (l) => logs.push(l));
  await win.evaluate(() => window.jwsim.onBuildLog((l) => window.__upLog(l)));
  const t0 = Date.now();
  const r = await win.evaluate((dir) => window.jwsim.jwplcUpload({ dir, port: "/dev/null" }), sketch);
  const size = logs.find((l) => /Sketch uses|El sketch usa/.test(l));
  criteria.COMPILA_PARA_ESP32 = { pass: r.stage === "upload" && !!size, size, segundos: Math.round((Date.now() - t0) / 1000) };
  criteria.CARGA_SIN_EQUIPO = { pass: !r.ok && r.stage === "upload" && !!r.message, message: r.message, ultimo: logs.at(-1) };
}
criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
await app.close();
let failed = 0;
for (const [k, v] of Object.entries(criteria)) {
  console.log(`${v.pass ? "OK   " : "FALLA"} ${k} ${JSON.stringify(v)}`);
  if (!v.pass) failed++;
}
if (!hasTools) console.log("(sin herramientas del ESP32 en JWSIM_ARDUINO_DATA: se omiten PANEL_LISTO, COMPILA_PARA_ESP32 y CARGA_SIN_EQUIPO)");
process.exit(failed ? 1 : 0);
