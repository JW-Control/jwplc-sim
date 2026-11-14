// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del centro de aprendizaje y la ficha del reto (etapa 2 de
// docs/integration/PROPUESTA_EVALUACIONES.md):
//   LEARN_CARD    la pantalla Proyectos muestra el progreso (0 de 9) y el siguiente
//   LEARN_LEVELS  3 niveles: el 1 abierto con «A continuación», el resto con candado
//   BRIEF         al abrir un reto aparece su ficha; Empezar la pliega y se vuelve a ver
//   COMPLETE      con los objetivos cumplidos: «Qué enseña» y «Siguiente reto →»
//   PROGRESS      el reto queda hecho (1 de 9) y el siguiente pasa a «A continuación»
//   NEXT          «Siguiente reto →» abre el 02 con su ficha
//   UNLOCK        el docente desbloquea todos los niveles
// Informe en build/gates/JWSIM_APRENDER_E2E.json.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "aprender");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim"), JWSIM_START_SCREEN: "1" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.JWSIM_UNLOCK_ALL;
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
const items = () => win.$$eval("#start .learn-item", (l) => l.map((b) => `${b.dataset.id}:${[...b.classList].find((c) => ["done", "next", "open", "locked"].includes(c))}${b.disabled ? "!" : ""}`));
const press = async (id) => {
  await t((d) => window.jwsimTest.scene.act(d, "press", true), id);
  await win.waitForTimeout(300);
  await t((d) => window.jwsimTest.scene.act(d, "press", false), id);
};

try {
  // ---- LEARN_CARD
  const card = await until(() => win.$eval("#start .learn-card", (e) => e.textContent), 10000);
  await win.screenshot({ path: join(OUT, "01-inicio.png") });
  criteria.LEARN_CARD = { ok: /0 de 9 retos/.test(card ?? "") && /A continuación: Marcha y parada/.test(card ?? ""), card };
  log(`LEARN_CARD ${JSON.stringify(criteria.LEARN_CARD)}`);

  // ---- LEARN_LEVELS
  await win.click("#start .learn-card");
  await win.waitForSelector("#start .learn-level");
  const lv = await win.$$eval("#start .learn-level", (l) => l.map((x) => `${x.querySelector("b").textContent}${x.classList.contains("locked") ? " 🔒" : ""}`));
  const it = await items();
  await win.screenshot({ path: join(OUT, "02-niveles.png") });
  criteria.LEARN_LEVELS = {
    ok: lv.length === 3 && !lv[0].includes("🔒") && lv[1].includes("🔒") && it[0] === "01-marcha-parada:next" && it.filter((x) => x.endsWith("locked!")).length === 6,
    levels: lv,
    items: it,
  };
  log(`LEARN_LEVELS ${JSON.stringify(criteria.LEARN_LEVELS)}`);

  // ---- BRIEF
  await win.click('#start .learn-item[data-id="01-marcha-parada"]');
  const brief = await until(() => win.$eval("#ex-brief", (e) => !e.hidden && !e.classList.contains("collapsed") && e.textContent), 10000);
  const uses = await win.$$eval("#ex-brief .brief-uses li", (l) => l.length);
  await win.screenshot({ path: join(OUT, "03-ficha.png") });
  await win.click('#ex-brief [data-brief="start"]');
  const collapsed = await win.$eval("#ex-brief", (e) => e.classList.contains("collapsed"));
  await win.click('#ex-brief [data-brief="show"]');
  const again = await win.$eval("#ex-brief", (e) => !e.classList.contains("collapsed"));
  await win.click('#ex-brief [data-brief="start"]');
  criteria.BRIEF = { ok: /El objetivo/i.test(brief || "") && /Pasos/i.test(brief || "") && uses === 4 && collapsed && again, uses, collapsed, again };
  log(`BRIEF ${JSON.stringify(criteria.BRIEF)}`);

  // ---- COMPLETE
  const sol = readFileSync(join(ROOT, "exercises", "01-marcha-parada", "solucion", "marcha_parada", "marcha_parada.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await win.waitForTimeout(800);
  await press("S1");
  await until(() => win.$eval('#ex-goals [data-goal="arranca"]', (e) => e.classList.contains("done")), 8000);
  await press("S0");
  const after = await until(() => win.$eval("#ex-goals .goals-done", (e) => !e.hidden && e.querySelector("[data-next]") && e.textContent), 10000);
  const next = await win.$eval("#ex-goals [data-next]", (b) => b.dataset.next).catch(() => null);
  await win.$eval("#ex-goals", (e) => e.scrollIntoView());
  await win.waitForTimeout(500);
  await (await win.$("#scene-side")).screenshot({ path: join(OUT, "04-completado.png") });
  criteria.COMPLETE = { ok: /Qué enseña: Autorretención/.test(after || "") && next === "02-inversion-giro", next };
  log(`COMPLETE ${JSON.stringify(criteria.COMPLETE)}`);

  // ---- PROGRESS
  await win.click("#btn-stop");
  await until(() => t(() => window.jwsimTest.status() !== "running"), 10000);
  await win.click("#btn-projects");
  const card2 = await until(() => win.$eval("#start .learn-card", (e) => /1 de 9/.test(e.textContent) && e.textContent), 5000);
  await win.click("#start .learn-card");
  await win.waitForSelector("#start .learn-level");
  const it2 = await items();
  criteria.PROGRESS = { ok: /Inversión de giro/.test(card2 || "") && it2[0] === "01-marcha-parada:done" && it2[1] === "02-inversion-giro:next", card: card2, items: it2.slice(0, 3) };
  log(`PROGRESS ${JSON.stringify(criteria.PROGRESS)}`);

  // ---- UNLOCK
  await win.click("#learn-unlock");
  await win.waitForTimeout(300);
  const it3 = await items();
  await win.screenshot({ path: join(OUT, "05-desbloqueado.png") });
  criteria.UNLOCK = { ok: it3.length === 9 && !it3.some((x) => x.endsWith("!")), items: it3 };
  log(`UNLOCK ${JSON.stringify(criteria.UNLOCK)}`);
  await win.click("#learn-unlock");
  await win.click('#start [data-act="close"]');

  // ---- NEXT
  await win.click('#ex-goals [data-next="02-inversion-giro"]').catch(() => {});
  const brief2 = await until(() => win.$eval("#ex-brief", (e) => !e.hidden && !e.classList.contains("collapsed") && e.textContent), 10000);
  const dir2 = await t(() => window.jwsimTest.sketchDir());
  criteria.NEXT = { ok: /KM1 y KM2/.test(brief2 || "") && /02-inversion-giro/.test(dir2 ?? ""), dir: dir2 };
  log(`NEXT ${JSON.stringify(criteria.NEXT)}`);
} finally {
  const ok = Object.values(criteria).length === 7 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_APRENDER_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_APRENDER_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
