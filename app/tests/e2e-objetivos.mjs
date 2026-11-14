// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de los objetivos en vivo (rubrica.json "goals") con el
// ejercicio 01 y su solución:
//   GOALS_SHOWN     al abrir el ejercicio aparece el panel con 4 objetivos
//   GOALS_LIVE      al pulsar S1 el objetivo «arranca» se llena y se cumple
//   GOALS_ORDER     «para» espera a «arranca» y se cumple al pulsar S0
//   GOALS_COMPLETE  con los obligatorios cumplidos aparece «Reto completado»
//   GOALS_RESET     una corrida nueva los vuelve a poner en cero
// Informe en build/gates/JWSIM_OBJETIVOS_E2E.json.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "objetivos");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const app = await electron.launch({ args: [APP, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await win.waitForTimeout(100);
  }
  return null;
};
const goal = (id) => win.$eval(`#ex-goals [data-goal="${id}"]`, (e) => ({ cls: e.className, hold: e.querySelector(".goal-hold small")?.textContent ?? "" }));
const state = async (id) => (await goal(id)).cls.split(" ").find((c) => ["done", "active", "pending", "blocked"].includes(c));
const press = (id) => t((d) => window.jwsimTest.scene.act(d, "press", true), id);
const release = (id) => t((d) => window.jwsimTest.scene.act(d, "press", false), id);
const run = async () => {
  await win.click("#btn-run");
  return until(() => t(() => window.jwsimTest.status() === "running"), 240000);
};

try {
  await until(() => win.$$eval("#sel-exercise option", (o) => o.filter((x) => x.value).length), 10000);
  await t(() => window.jwsimTest.pickExercise("01-marcha-parada"));
  await until(() => win.$eval("#ex-goals", (e) => !e.hidden), 10000);
  const ids = await win.$$eval("#ex-goals .goal", (l) => l.map((x) => x.dataset.goal));
  const merit = await win.$eval('#ex-goals [data-goal="rearranca"] .goal-extra', (e) => e.textContent).catch(() => "");
  criteria.GOALS_SHOWN = { ok: ids.join() === "arranca,piloto,para,rearranca" && merit === "Mérito", ids, merit };
  log(`GOALS_SHOWN ${JSON.stringify(criteria.GOALS_SHOWN)}`);

  const sol = readFileSync(join(ROOT, "exercises", "01-marcha-parada", "solucion", "marcha_parada", "marcha_parada.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol);
  const running = await run();
  await win.waitForTimeout(800);
  const before = await state("arranca");
  const paraBlocked = await state("para");
  await press("S1");
  await win.waitForTimeout(300);
  await release("S1");
  const filling = await until(async () => ((await state("arranca")) === "active" ? await goal("arranca") : null), 3000);
  await win.screenshot({ path: join(OUT, "01-llenando.png") });
  const done = await until(async () => (await state("arranca")) === "done", 8000);
  criteria.GOALS_LIVE = { ok: !!running && before === "pending" && !!filling && !!done && (await state("piloto")) === "done", before, filling: filling?.hold, done: !!done };
  log(`GOALS_LIVE ${JSON.stringify(criteria.GOALS_LIVE)}`);

  const paraWaiting = await state("para");
  await press("S0");
  await win.waitForTimeout(300);
  await release("S0");
  const paraDone = await until(async () => (await state("para")) === "done", 8000);
  criteria.GOALS_ORDER = { ok: paraBlocked === "blocked" && paraWaiting === "pending" && !!paraDone, para_before_start: paraBlocked, para_after_start: paraWaiting };
  log(`GOALS_ORDER ${JSON.stringify(criteria.GOALS_ORDER)}`);

  const banner = await until(() => win.$eval("#ex-goals .goals-done", (e) => !e.hidden && e.textContent), 3000);
  const count = await win.$eval("#ex-goals .goals-count", (e) => e.textContent);
  await win.waitForTimeout(1000);
  await win.$eval("#ex-goals", (e) => e.scrollIntoView());
  await (await win.$("#exercise")).screenshot({ path: join(OUT, "02-completado.png") });
  criteria.GOALS_COMPLETE = { ok: /Reto completado/.test(banner ?? "") && count === "3/3" && (await state("rearranca")) !== "done", count };
  log(`GOALS_COMPLETE ${JSON.stringify(criteria.GOALS_COMPLETE)}`);

  await win.click("#btn-stop");
  await until(() => t(() => window.jwsimTest.status() !== "running"), 10000);
  await run();
  const reset = await until(async () => (await state("arranca")) === "pending" && (await win.$eval("#ex-goals .goals-done", (e) => e.hidden)), 8000);
  criteria.GOALS_RESET = { ok: !!reset };
  log(`GOALS_RESET ${JSON.stringify(criteria.GOALS_RESET)}`);
} finally {
  const ok = Object.values(criteria).length === 5 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_OBJETIVOS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_OBJETIVOS_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
