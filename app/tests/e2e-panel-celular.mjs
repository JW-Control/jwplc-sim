// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Botón «Celular» de la barra (alpha.19): se ve sin abrir menús, se prende y
// se apaga con un clic, queda guardado y coincide con Herramientas. Viene
// prendido: el panel se abre desde la PC y desde el celular sin tocar nada.
//   VISIBLE    el botón está en la barra superior y arranca prendido
//   APAGA      un clic lo apaga; la casilla de Herramientas queda igual
//   GUARDA     la preferencia se guarda (panelCelular = false)
//   PRENDE     otro clic lo vuelve a prender; el globo da la URL con la IP de la PC
// Capturas en build/gates/panel-celular/.
//   xvfb-run -a node app/tests/e2e-panel-celular.mjs
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const OUT = join(APP, "..", "build", "gates", "panel-celular");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-pc-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-pc-ud-"));
createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim"), JWSIM_WARMUP: "0" } });
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "OK   " : "FALLA"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed++;
};
const menuChecked = () =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label === "Herramientas").submenu.items.find((i) => /celular/.test(i.label))?.checked);
const prefs = () => {
  for (const f of readdirSync(userData)) if (/prefer/i.test(f)) try { return JSON.parse(readFileSync(join(userData, f), "utf8")); } catch {}
  return {};
};
try {
  const win = await app.firstWindow();
  await win.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
  await win.waitForSelector("#btn-celular", { timeout: 60000 });
  const btn = () => win.$eval("#btn-celular", (b) => ({ on: b.classList.contains("on"), text: b.textContent.trim(), title: b.title, visible: b.offsetWidth > 0 && b.offsetHeight > 0 }));
  let b = await btn();
  check("VISIBLE", b.visible && b.on && b.text === "Celular" && (await menuChecked()) === true, b.text);
  await win.screenshot({ path: join(OUT, "1-prendido.png"), clip: { x: 700, y: 0, width: 800, height: 60 } });
  await win.click("#btn-celular");
  await win.waitForTimeout(400);
  b = await btn();
  check("APAGA", !b.on && (await menuChecked()) === false, b.text);
  check("GUARDA", prefs().panelCelular === false, JSON.stringify(prefs()));
  await win.screenshot({ path: join(OUT, "2-apagado.png"), clip: { x: 700, y: 0, width: 800, height: 60 } });
  await win.click("#btn-celular");
  await win.waitForTimeout(400);
  b = await btn();
  check("PRENDE", b.on && (await menuChecked()) === true && prefs().panelCelular === true && /http:\/\/\d+\.\d+\.\d+\.\d+:1080\/|no tiene una red/.test(b.title), b.title);
} catch (err) {
  console.log("FALLA", err.message);
  failed++;
} finally {
  await app.close().catch(() => {});
}
console.log(failed ? `PANEL_CELULAR=FAIL (${failed})` : "PANEL_CELULAR=PASS");
process.exit(failed ? 1 : 0);
