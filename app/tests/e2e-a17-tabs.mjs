// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de las pestañas de la ventana (alpha.17, fase 1):
//   TABS        Programa · Esquema eléctrico · Planta 3D · Placa, arriba a lo ancho
//   PROGRAM     Programa: editor y placa lado a lado, sin Placa/Escena/3D en el
//               panel; una escena pedida desde Programa se abre en Esquema
//   FULL_WIDTH  Esquema (Ctrl+2), Planta 3D y Placa ocupan todo el ancho, sin
//               editor ni el selector Placa/Escena/3D del panel
//   PLANT_ADD   Planta 3D sin equipos de planta: botones para agregarlos; «+ Cinta»
//               la agrega a la escena y aparece en 3D
//   MINI_PLC    en Planta 3D, la mini placa copia la pantalla; un clic lleva a Placa
//   REMEMBER    la pestaña se recuerda al volver a abrir la ventana
// Informe en build/gates/JWSIM_A17_TABS.json y capturas en build/gates/a17-tabs/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-a17-tabs.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "a17-tabs");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const launch = async () => {
  const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") } });
  const win = await app.firstWindow();
  await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  return { app, win };
};
const visible = (win, sel) => win.$eval(sel, (e) => !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0).catch(() => false);
const width = (win, sel) => win.$eval(sel, (e) => Math.round(e.getBoundingClientRect().width)).catch(() => 0);

let { app, win } = await launch();
try {
  const t = (fn, a) => win.evaluate(fn, a);
  const vw = await t(() => window.innerWidth);
  const tabs = await win.$$eval(".mtab", (bs) => bs.map((b) => b.textContent.trim()));
  criteria.TABS = { pass: tabs.join("|") === "Programa|Esquema eléctrico|Planta 3D|Placa", tabs };

  const prog = { code: await visible(win, ".code-pane"), board: await visible(win, ".plc"), selector: await visible(win, "#board-view"), active: await t(() => window.JwsimTabs.current()) };
  await win.screenshot({ path: join(OUT, "01_programa.png") });
  // Una vista de escena pedida desde Programa (abrir un proyecto con escena) se va a su pestaña.
  await t(() => window.jwsimTest.scene.view("scene"));
  await sleep(800);
  prog.sceneGoesTo = await t(() => window.JwsimTabs.current());
  await t(() => window.JwsimTabs.select("program"));
  await sleep(500);
  prog.back = { tab: await t(() => window.JwsimTabs.current()), board: await visible(win, ".plc"), code: await visible(win, ".code-pane") };
  criteria.PROGRAM = { pass: prog.code && prog.board && !prog.selector && prog.active === "program" && prog.sceneGoesTo === "schematic" && prog.back.board && prog.back.code, ...prog };

  await win.keyboard.press("Control+2");
  await sleep(1200);
  const sch = { tab: await t(() => window.JwsimTabs.current()), code: await visible(win, ".code-pane"), scene: await visible(win, "#scene-view"), selector: await visible(win, "#board-view"), w: await width(win, ".sim-pane") };
  await win.screenshot({ path: join(OUT, "02_esquema.png") });
  await t(() => window.JwsimTabs.select("board"));
  await sleep(500);
  const brd = { code: await visible(win, ".code-pane"), board: await visible(win, ".plc"), w: await width(win, ".sim-pane") };
  await win.screenshot({ path: join(OUT, "03_placa.png") });
  await t(() => window.JwsimTabs.select("plant"));
  await sleep(1500);
  const pl = { code: await visible(win, ".code-pane"), view3d: await visible(win, "#view3d"), w: await width(win, ".sim-pane") };
  criteria.FULL_WIDTH = {
    pass: sch.tab === "schematic" && !sch.code && sch.scene && !sch.selector && sch.w >= vw - 4 && !brd.code && brd.board && brd.w >= vw - 4 && !pl.code && pl.view3d && pl.w >= vw - 4,
    viewport: vw, schematic: sch, board: brd, plant: pl,
  };

  const before = { add: await visible(win, "#view3d-add"), objs: await t(() => window.jwsimTest.scene.view3d()) };
  await win.screenshot({ path: join(OUT, "04_planta_vacia.png") });
  await win.click('#view3d-add [data-plant="jwsim/conveyor"]');
  await sleep(1500);
  const after = { add: await visible(win, "#view3d-add"), objs: await t(() => window.jwsimTest.scene.view3d()), spec: await t(() => window.jwsimTest.scene.spec().devices.map((d) => d.type)) };
  await win.screenshot({ path: join(OUT, "05_planta_con_cinta.png") });
  criteria.PLANT_ADD = { pass: before.add && before.objs.length === 0 && !after.add && after.objs.some((o) => o.type === "jwsim/conveyor") && after.spec.includes("jwsim/conveyor"), before, after };

  // La mini placa copia la TFT: se pinta la TFT y se mira un píxel de la copia.
  await t(() => {
    const c = document.getElementById("tft").getContext("2d");
    c.fillStyle = "#ff0000";
    c.fillRect(0, 0, 320, 170);
  });
  await sleep(300);
  const mini = { shown: await visible(win, "#mini-plc"), px: await t(() => [...document.getElementById("mini-tft").getContext("2d").getImageData(160, 85, 1, 1).data]) };
  await win.click("#mini-plc");
  await sleep(500);
  mini.after = await t(() => window.JwsimTabs.current());
  criteria.MINI_PLC = { pass: mini.shown && mini.px[0] > 200 && mini.px[1] < 50 && mini.after === "board", ...mini };
} finally {
  await app.close();
}

({ app, win } = await launch());
try {
  await sleep(1000);
  const tab = await win.evaluate(() => window.JwsimTabs.current());
  criteria.REMEMBER = { pass: tab === "board", tab };
} finally {
  await app.close();
}

const pass = Object.values(criteria).every((c) => c.pass);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_A17_TABS.json"), JSON.stringify({ gate: "JWSIM_A17_TABS", pass, criteria }, null, 2));
for (const [k, v] of Object.entries(criteria)) log(`${v.pass ? "PASS" : "FAIL"} ${k}`);
if (!pass) {
  console.log(JSON.stringify(criteria, null, 1));
  process.exitCode = 1;
}
