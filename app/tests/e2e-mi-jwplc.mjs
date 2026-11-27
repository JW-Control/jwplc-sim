// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Mi JWPLC (Electron + Playwright):
//   VENTANA_CON_BORNES   Ver ▸ Mi JWPLC abre la ventana con el dibujo de bornes
//   ABRE_LA_PRUEBA       «Abrir la prueba de recepción» carga prueba_recepcion
//   LLEVA_A_SUBIR        «Subir al JWPLC» cierra la ventana y abre el panel de carga
//   PRUEBA_EN_EL_SIM     la prueba corre en el Sim: el barrido enciende las salidas
// Capturas en build/gates/mi-jwplc/.
//   cd app && xvfb-run -a node tests/e2e-mi-jwplc.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "mi-jwplc");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await win.setViewportSize?.({ width: 1440, height: 900 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
await win.evaluate(() => document.querySelector("#lesson-card button")?.click());

await win.evaluate(() => window.jwsimTest.miJwplc(true));
await win.waitForFunction(() => document.querySelector("#mi-jwplc img")?.naturalWidth > 0, null, { timeout: 10000 });
criteria.VENTANA_CON_BORNES = { pass: await win.evaluate(() => !document.getElementById("mi-jwplc").hidden) };
await win.screenshot({ path: join(OUT, "mi-jwplc.png") });

await win.click("#mi-open-test");
await win.waitForFunction(() => /prueba_recepcion/.test(document.getElementById("sb-sketch").textContent), null, { timeout: 20000 });
criteria.ABRE_LA_PRUEBA = { pass: true, sketch: await win.evaluate(() => document.getElementById("sb-sketch").textContent) };

await win.click("#mi-upload");
await win.waitForFunction(() => !document.getElementById("up-panel").hidden && document.getElementById("up-note").textContent.length > 0, null, { timeout: 20000 });
criteria.LLEVA_A_SUBIR = { pass: await win.evaluate(() => document.getElementById("mi-jwplc").hidden), nota: await win.evaluate(() => document.getElementById("up-note").textContent) };
await win.screenshot({ path: join(OUT, "subir-panel.png") });
await win.keyboard.press("Escape");

await win.click("#btn-run");
let lit = false;
for (let i = 0; i < 120 && !lit; i++) {
  await new Promise((r) => setTimeout(r, 500));
  lit = await win.evaluate(() => !!document.querySelector('.io[data-signal^="Q0_"].on'));
}
criteria.PRUEBA_EN_EL_SIM = { pass: lit };
await win.screenshot({ path: join(OUT, "prueba-en-el-sim.png") });
criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
await app.close();
let failed = 0;
for (const [k, v] of Object.entries(criteria)) {
  console.log(`${v.pass ? "OK   " : "FALLA"} ${k} ${JSON.stringify(v)}`);
  if (!v.pass) failed++;
}
process.exit(failed ? 1 : 0);
