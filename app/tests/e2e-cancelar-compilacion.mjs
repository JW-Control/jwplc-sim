// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Cancelar la compilación del Sim (alpha.19), como en Arduino IDE:
//   BOTON      mientras compila, Detener pasa a «✕ Cancelar» y está habilitado
//   CANCELA    un clic corta la compilación: estado «Compilación cancelada»,
//              sin errores en Problemas y el botón vuelve a «▶ Ejecutar»
//   RAPIDO     la cancelación se nota en menos de 5 s
//   RECOMPILA  el siguiente Ejecutar compila y corre normalmente
// Compilación en frío (datos vacíos, sin precalentado) para que dure lo
// suficiente. Capturas en build/gates/cancelar-compilacion/.
//   xvfb-run -a node app/tests/e2e-cancelar-compilacion.mjs
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const OUT = join(APP, "..", "build", "gates", "cancelar-compilacion");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-cc-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-cc-ud-"));
createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim"), JWSIM_WARMUP: "0" } });
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "OK   " : "FALLA"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const win = await app.firstWindow();
  await win.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  const btn = (id) => win.$eval(`#${id}`, (b) => ({ text: b.textContent.trim(), disabled: b.disabled }));

  await win.click("#btn-run");
  await win.waitForFunction(() => window.jwsimTest.status() === "building", null, { timeout: 10000 });
  await sleep(1500);
  const during = await btn("btn-stop");
  await win.screenshot({ path: join(OUT, "1-compilando.png") });
  check("BOTON", !during.disabled && /Cancelar/.test(during.text), JSON.stringify(during));

  const t0 = Date.now();
  await win.click("#btn-stop");
  await win.waitForFunction(() => window.jwsimTest.status() !== "building", null, { timeout: 20000 }).catch(() => {});
  const ms = Date.now() - t0;
  const after = await win.evaluate(() => ({
    status: window.jwsimTest.status(),
    sb: document.getElementById("sb-build").textContent,
    run: document.getElementById("btn-run").textContent.trim(),
    stop: document.getElementById("btn-stop").textContent.trim(),
    problems: document.getElementById("problems").childElementCount,
  }));
  await win.screenshot({ path: join(OUT, "2-cancelada.png") });
  check("CANCELA", after.status === "idle" && /cancelada/.test(after.sb) && /Ejecutar/.test(after.run) && /Detener/.test(after.stop) && after.problems === 0, JSON.stringify(after));
  check("RAPIDO", ms < 5000, `${(ms / 1000).toFixed(1)} s`);

  await win.click("#btn-run");
  await win.waitForFunction(() => ["running", "error"].includes(window.jwsimTest.status()), null, { timeout: 600000 });
  const again = await win.evaluate(() => ({ status: window.jwsimTest.status(), sb: document.getElementById("sb-build").textContent }));
  await win.screenshot({ path: join(OUT, "3-recompila.png") });
  check("RECOMPILA", again.status === "running", JSON.stringify(again));
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
console.log(failed ? `${failed} fallas` : "todo OK");
process.exit(failed ? 1 : 0);
