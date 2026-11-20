// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del tema claro / oscuro en Electron (Playwright):
//   TOGGLE_LIGHT   alterna a tema claro: fondo, texto, Monaco, grilla 2D y botón
//   TOGGLE_DARK    alterna a tema oscuro: vuelve a fondo oscuro y Monaco oscuro
//   PERSISTENCE    la preferencia se guarda en userData y se restaura al reabrir
//   VIEWS_LIGHT    Esquema eléctrico y Planta 3D en claro sin errores de consola
// Informe en build/gates/JWSIM_THEME_E2E.json y capturas en build/gates/theme/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-theme.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "theme");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");

const launch = async () => {
  const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args, env });
  const win = await app.firstWindow();
  await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
  await win.waitForSelector(".mtab.active", { timeout: 60000 });
  await win.click('.mtab[data-tab="program"]');
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await win.waitForTimeout(300);
  return { app, win };
};

const errors = [];
let { app, win } = await launch();
win.on("pageerror", (e) => errors.push(e.message));
const probe = () =>
  win.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const grid = getComputedStyle(document.getElementById("scene-grid"));
    const mon = getComputedStyle(document.querySelector(".monaco-editor"));
    const mtab = getComputedStyle(document.querySelector(".mtab.active"));
    const selBg = getComputedStyle(document.getElementById("sel-example")).backgroundColor;
    const opt = document.querySelector("#sel-example option");
    const optCs = opt ? getComputedStyle(opt) : null;
    const btnNew = getComputedStyle(document.getElementById("btn-new"));
    const statusBox = document.getElementById("status").getBoundingClientRect();
    return {
      meta: document.querySelector('meta[name="color-scheme"]')?.content,
      bg: cs.backgroundColor,
      fg: cs.color,
      monacoBg: mon.backgroundColor,
      mtabColor: mtab.color,
      selBg,
      optBg: optCs?.backgroundColor,
      optColor: optCs?.color,
      btnNewBg: btnNew.backgroundColor,
      btnNewBorder: btnNew.borderTopColor,
      statusWidth: statusBox.width,
      btnRunText: document.getElementById("btn-run").textContent,
      gridFilter: grid.filter,
      state: window.jwsimTest.getTheme(),
    };
  });

try {
  // 1. Modo claro
  await win.evaluate(() => window.jwsimTest.setTheme("light"));
  await win.waitForTimeout(150);
  const light = await probe();
  await win.screenshot({ path: join(OUT, "01-programa-claro.png") });
  criteria.TOGGLE_LIGHT = {
    ok: light.meta === "light" && light.state.dark === false && light.bg === "rgb(245, 247, 250)" && light.monacoBg === "rgb(245, 247, 250)" && light.selBg !== "rgba(0, 0, 0, 0)" && light.optBg === "rgb(255, 255, 255)" && light.gridFilter === "invert(1)" && light.mtabColor !== "rgb(255, 255, 255)",
    light,
  };
  log(`TOGGLE_LIGHT ${JSON.stringify(criteria.TOGGLE_LIGHT)}`);

  // 2. Esquema eléctrico y Planta 3D en modo claro con proyecto 3D
  await win.waitForSelector(".palette-item", { state: "attached", timeout: 15000 });
  await win.evaluate((f) => window.jwsimTest.openProjectFile(f), join(ROOT, "tests", "projects", "planta-3d", "planta-3d.jwsim"));
  await win.waitForSelector("#scene-root .dev", { timeout: 15000 });
  await win.click('.mtab[data-tab="schematic"]');
  await win.waitForTimeout(250);
  const sceneBg = await win.$eval(".scene-main", (e) => getComputedStyle(e).backgroundColor);
  const plcLabelFill = await win.$eval("#scene-board .dev svg text", (e) => getComputedStyle(e).fill);
  const headHidden = await win.$eval(".board-card .panel-head", (e) => getComputedStyle(e).display === "none");
  const faultsInTabs = await win.$eval("#faults-menu", (e) => e.parentElement?.id === "main-tabs");
  const themeBtnVisible = await win.$eval("#btn-theme", (e) => e.closest(".toolbar") !== null && e.getBoundingClientRect().width > 0);
  await win.screenshot({ path: join(OUT, "02-esquema-claro.png") });
  await win.click('.mtab[data-tab="plant"]');
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(OUT, "03-planta-3d-claro.png") });
  criteria.VIEWS_LIGHT = {
    ok: sceneBg === "rgb(233, 238, 244)" && plcLabelFill !== "rgb(31, 35, 40)" && headHidden && faultsInTabs && themeBtnVisible && errors.length === 0,
    sceneBg,
    plcLabelFill,
    headHidden,
    faultsInTabs,
    themeBtnVisible,
    errors,
  };
  log(`VIEWS_LIGHT ${JSON.stringify(criteria.VIEWS_LIGHT)}`);

  // 3. Volver a modo oscuro con el botón de la barra superior y probar ancho 50% (960 px)
  await win.click("#btn-theme");
  await win.waitForTimeout(150);
  const dark = await probe();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 900));
  await win.setViewportSize?.({ width: 960, height: 900 }).catch(() => {});
  await win.waitForTimeout(200);
  const halfScreen = await win.evaluate(() => {
    const tb = document.querySelector(".toolbar");
    const themeRect = document.getElementById("btn-theme").getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      toolbarClientW: tb.clientWidth,
      toolbarScrollW: tb.scrollWidth,
      themeRight: Math.round(themeRect.right),
    };
  });
  await win.screenshot({ path: join(OUT, "04-media-pantalla-960px.png") });
  criteria.TOGGLE_DARK = {
    ok:
      dark.state.dark === true &&
      dark.bg === "rgb(20, 23, 27)" &&
      dark.monacoBg === "rgb(20, 23, 27)" &&
      dark.selBg === "rgb(27, 31, 36)" &&
      dark.optBg === "rgb(27, 31, 36)" &&
      dark.btnNewBg !== "rgba(0, 0, 0, 0)" &&
      dark.statusWidth <= 1 &&
      halfScreen.themeRight <= halfScreen.innerWidth,
    dark,
    halfScreen,
  };
  log(`TOGGLE_DARK ${JSON.stringify(criteria.TOGGLE_DARK)}`);

  // 4. Dejarlo en claro, reabrir y comprobar persistencia
  await win.evaluate(() => window.jwsimTest.setTheme("light"));
  await win.waitForTimeout(150);
  await app.close();

  ({ app, win } = await launch());
  const reopened = await probe();
  const saved = JSON.parse(readFileSync(join(userData, "preferencias.json"), "utf8"));
  criteria.PERSISTENCE = {
    ok: saved.theme === "light" && reopened.meta === "light" && reopened.state.dark === false && reopened.bg === "rgb(245, 247, 250)",
    saved,
    reopened,
  };
  log(`PERSISTENCE ${JSON.stringify(criteria.PERSISTENCE)}`);
} finally {
  const ok = Object.values(criteria).length === 4 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_THEME_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_THEME_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close().catch(() => {});
  if (!ok) process.exitCode = 1;
}
