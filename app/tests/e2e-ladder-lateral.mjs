// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ladder en vivo en la barra lateral izquierda de Esquema eléctrico y Planta 3D
// (Electron + Playwright), lección IEC 03 en LD:
//   PESTANA_EN_ESQUEMA    la pestaña Ladder aparece junto a Teoría y abre el
//                         programa en el panel izquierdo
//   EN_VIVO_ESQUEMA       al ejecutar y forzar I0.0 desde el panel, la bobina
//                         de Q0.0 se pinta en 1
//   PESTANA_EN_PLANTA_3D  Planta 3D tiene su barra izquierda con la misma
//                         pestaña; el panel empuja el 3D (no lo tapa)
//   ANCHO_AJUSTABLE       el borde del panel se arrastra
//   CTRL_L                Ctrl+L lo cierra y lo vuelve a abrir
//   OCULTA_EN_PROGRAMA    en Programa no aparece
// Capturas en build/gates/ladder-lateral/.
//   cd app && xvfb-run -a node tests/e2e-ladder-lateral.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "ladder-lateral");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args, env });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await win.waitForTimeout(150);
  }
  return null;
};
const tab = (name) => win.click(`.mtab[data-tab="${name}"]`);
const side = () =>
  t(() => {
    const el = document.getElementById("ld-side");
    const st = window.jwsimTest.ldSide();
    return {
      ...st,
      live: !!el?.classList.contains("live"),
      rungs: el?.querySelectorAll(".ld-rung").length ?? 0,
      q0: !!el?.querySelector('[data-sig="Q0_0"].on'),
      i0forced: !!el?.querySelector('[data-sig="I0_0"].forced'),
    };
  });
const sigAt = (sig) =>
  t((s) => {
    const r = document.querySelector(`#ld-side [data-sig="${s}"]`)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, sig);

try {
  await t(() => window.openLessonById("iec-03", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.waitForTimeout(800);

  // Esquema: la pestaña Ladder en la barra izquierda, junto a Teoría.
  await tab("schematic");
  const tabEsq = await until(() => t(() => !document.getElementById("scene-tab-ladder").hidden), 3000);
  await win.click("#scene-tab-ladder");
  const s1 = await until(async () => {
    const s = await side();
    return s.shown && s.rungs > 0 && s.host === "ld-side-pane" ? s : null;
  }, 3000);
  criteria.PESTANA_EN_ESQUEMA = { pass: !!tabEsq && !!s1, ...s1 };

  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  await win.waitForTimeout(800);
  const p = await sigAt("I0_0");
  await win.mouse.click(p.x, p.y, { button: "right" });
  await win.click('#plc-force-menu button[data-v="1"]');
  const s2 = await until(async () => {
    const s = await side();
    return s.q0 && s.live ? s : null;
  }, 4000);
  criteria.EN_VIVO_ESQUEMA = { pass: !!s2 && s2.i0forced, ...(s2 ?? (await side())) };
  await win.screenshot({ path: join(OUT, "01-esquema.png") });

  // Planta 3D: su propia barra izquierda; el panel recuerda si quedó abierto.
  await tab("plant");
  await win.waitForTimeout(600);
  const tabPla = await t(() => !document.getElementById("plant-tab-ladder").hidden);
  await win.click("#plant-tab-ladder");
  const s3 = await until(async () => {
    const s = await side();
    return s.shown && s.host === "plant-left" && s.q0 ? s : null;
  }, 3000);
  const canvasLeft = await t(() => Math.round(document.getElementById("view3d-canvas").getBoundingClientRect().left));
  const panelRight = await t(() => Math.round(document.getElementById("plant-left").getBoundingClientRect().right));
  await win.waitForTimeout(800);
  criteria.PESTANA_EN_PLANTA_3D = { pass: tabPla && !!s3 && s3.live && Math.abs(canvasLeft - panelRight) <= 2, host: s3?.host, canvasLeft, panelRight };
  await win.screenshot({ path: join(OUT, "02-planta-3d.png") });

  // Ancho: se arrastra el borde del panel.
  const w0 = await t(() => document.getElementById("plant-left").getBoundingClientRect().width);
  const g = await t(() => {
    const r = document.getElementById("plant-left-grip").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 200 };
  });
  await win.mouse.move(g.x, g.y);
  await win.mouse.down();
  await win.mouse.move(g.x + 120, g.y, { steps: 6 });
  await win.mouse.up();
  const w1 = await t(() => document.getElementById("plant-left").getBoundingClientRect().width);
  criteria.ANCHO_AJUSTABLE = { pass: Math.abs(w1 - w0 - 120) < 6, w0, w1 };

  await win.keyboard.press("Control+l");
  const closed = await side();
  await win.keyboard.press("Control+l");
  const reopened = await side();
  criteria.CTRL_L = { pass: !closed.shown && reopened.shown && reopened.rungs > 0 };

  await tab("program");
  criteria.OCULTA_EN_PROGRAMA = { pass: !(await side()).shown && (await t(() => getComputedStyle(document.querySelector(".plant-rail")).display)) === "none" };
} finally {
  criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
  await app.close();
}
let failed = 0;
for (const [k, v] of Object.entries(criteria)) {
  console.log(`${v.pass ? "OK   " : "FALLA"} ${k} ${JSON.stringify(v)}`);
  if (!v.pass) failed++;
}
process.exit(failed ? 1 : 0);
