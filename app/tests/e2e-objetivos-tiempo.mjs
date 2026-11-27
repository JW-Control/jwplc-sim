// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Ver en el tiempo» en los objetivos en vivo (Electron + Playwright):
//   GRAFICO_DEL_OBJETIVO  con la simulación en marcha, un objetivo sin cumplir
//                         muestra el diagrama de tiempos de sus señales
//   EXPLICA_POR_QUE       y una frase que dice qué faltó (señal que nunca llegó
//                         o cuánto se sostuvo frente a lo pedido)
// Captura en build/gates/objetivos-tiempo/.
//   cd app && xvfb-run -a node tests/e2e-objetivos-tiempo.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "objetivos-tiempo");
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
    await win.waitForTimeout(200);
  }
  return null;
};
try {
  await t(() => window.openLessonById("iec-03", "ST"));
  await until(() => t(() => document.querySelectorAll("#ex-goals [data-goal]").length > 0), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  await win.waitForTimeout(3000);
  // El primer objetivo con «Ver en el tiempo» visible.
  const id = await until(() => t(() => document.querySelector("#ex-goals .goal-time:not([hidden])")?.closest("[data-goal]")?.dataset.goal), 10000);
  await t((g) => (document.querySelector(`#ex-goals [data-goal="${g}"] .goal-time`).open = true), id);
  const chart = await until(() => t((g) => {
    const d = document.querySelector(`#ex-goals [data-goal="${g}"] .goal-time`);
    const lines = d.querySelectorAll("svg .gc-line").length;
    const text = d.querySelector(".goal-explain").textContent;
    return lines && text ? { lines, text } : null;
  }, id), 5000);
  criteria.GRAFICO_DEL_OBJETIVO = { pass: !!chart?.lines, goal: id, lines: chart?.lines };
  criteria.EXPLICA_POR_QUE = { pass: !!chart && /nunca|como máximo|a la vez/.test(chart.text), text: chart?.text };
  await t((g) => document.querySelector(`#ex-goals [data-goal="${g}"]`).scrollIntoView({ block: "center" }), id);
  await win.screenshot({ path: join(OUT, "objetivo-en-el-tiempo.png") });
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
