// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ladder en vivo flotante en Esquema eléctrico y Planta 3D (Electron +
// Playwright), lección IEC 03 en LD:
//   BOTON_SOLO_FUERA_DE_PROGRAMA  «▤ Ladder en vivo» aparece en Esquema y
//                                 Planta 3D, no en Programa
//   VENTANA_CON_PELDANOS          abre la ventana con los peldaños del main.ld
//   EN_VIVO_ESQUEMA               al ejecutar y forzar I0.0 desde la ventana,
//                                 la bobina de Q0.0 se pinta en 1
//   SIGUE_EN_PLANTA_3D            al pasar a Planta 3D sigue abierta y en vivo
//   MOVER_Y_MINIMIZAR             se arrastra por la cabecera y se minimiza
//   CTRL_L                        Ctrl+L la cierra y la vuelve a abrir
// Capturas en build/gates/ladder-flotante/.
//   cd app && xvfb-run -a node tests/e2e-ladder-flotante.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "ladder-flotante");
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
const btnShown = () => t(() => !document.getElementById("ld-float-btn").hidden);
const float = () =>
  t(() => {
    const el = document.getElementById("ld-float");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      shown: !el.hidden,
      min: el.classList.contains("min"),
      live: el.classList.contains("live"),
      rungs: el.querySelectorAll(".ld-rung").length,
      q0: !!el.querySelector('[data-sig="Q0_0"].on'),
      i0forced: !!el.querySelector('[data-sig="I0_0"].forced'),
      x: Math.round(r.left),
      y: Math.round(r.top),
      h: Math.round(r.height),
    };
  });
const sigAt = (sig) =>
  t((s) => {
    const r = document.querySelector(`#ld-float [data-sig="${s}"]`)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, sig);

try {
  await t(() => window.openLessonById("iec-03", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.waitForTimeout(800);

  const enPrograma = await btnShown();
  await tab("schematic");
  const enEsquema = await until(btnShown, 3000);
  criteria.BOTON_SOLO_FUERA_DE_PROGRAMA = { pass: !enPrograma && !!enEsquema, enPrograma, enEsquema };

  await win.click("#ld-float-btn");
  const f1 = await until(async () => {
    const f = await float();
    return f?.shown && f.rungs > 0 ? f : null;
  }, 3000);
  criteria.VENTANA_CON_PELDANOS = { pass: !!f1, ...f1 };

  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  await win.waitForTimeout(800);
  const p = await sigAt("I0_0");
  await win.mouse.click(p.x, p.y, { button: "right" });
  await win.click('#plc-force-menu button[data-v="1"]');
  const f2 = await until(async () => {
    const f = await float();
    return f?.q0 && f.live ? f : null;
  }, 4000);
  criteria.EN_VIVO_ESQUEMA = { pass: !!f2 && f2.i0forced, ...(f2 ?? (await float())) };
  await win.screenshot({ path: join(OUT, "01-esquema.png") });

  await tab("plant");
  await win.waitForTimeout(1500);
  const f3 = await float();
  criteria.SIGUE_EN_PLANTA_3D = { pass: !!f3?.shown && f3.q0 && f3.live && (await btnShown()), ...f3 };
  await win.screenshot({ path: join(OUT, "02-planta-3d.png") });

  const h = await t(() => {
    const r = document.querySelector("#ld-float .ld-float-h b").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await win.mouse.move(h.x, h.y);
  await win.mouse.down();
  await win.mouse.move(h.x - 300, h.y - 200, { steps: 8 });
  await win.mouse.up();
  const moved = await float();
  await win.click('#ld-float [data-f="min"]');
  const mini = await float();
  await win.screenshot({ path: join(OUT, "03-minimizada.png") });
  await win.click('#ld-float [data-f="min"]');
  const back = await float();
  criteria.MOVER_Y_MINIMIZAR = {
    pass: Math.abs(moved.x - f3.x + 300) < 6 && Math.abs(moved.y - f3.y + 200) < 6 && mini.min && mini.h < 50 && !back.min && back.h > 100,
    antes: [f3.x, f3.y],
    despues: [moved.x, moved.y],
    altoMin: mini.h,
  };

  await win.keyboard.press("Control+l");
  const closed = await float();
  await win.keyboard.press("Control+l");
  const reopened = await float();
  criteria.CTRL_L = { pass: !closed.shown && reopened.shown && reopened.rungs > 0 };

  await tab("program");
  criteria.OCULTA_EN_PROGRAMA = { pass: !(await float()).shown && !(await btnShown()) };
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
