// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de las prácticas evaluadas del curso (lección 01, con su
// solución):
//   LESSON_OPEN     al abrir la práctica: teoría a la izquierda (título de la
//                   lección) y objetivos a la derecha (saludo, medio)
//   LESSON_CONSOLE  el objetivo de consola se cumple con el saludo nuevo
//   LESSON_PERIOD   el objetivo de ritmo cuenta ciclos y se cumple
//   LESSON_GUIDE    en Programa, la guía (README.md) a la izquierda del código:
//                   sin «Para practicar» (son los objetivos), se pliega y se
//                   vuelve a mostrar, y el sketch empieza sin la guía
//   LESSON_DONE     con todo cumplido la lección queda hecha y ofrece la
//                   siguiente; abrirla sin cumplir no la marca
//   LESSON_PLAIN    una lección sin práctica también trae su guía, con
//                   «Para practicar», y un sketch cualquiera la quita
// Informe en build/gates/JWSIM_PRACTICAS_E2E.json.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "practicas");
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
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 950));
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
const goal = (id) => win.$eval(`#ex-goals [data-goal="${id}"]`, (e) => ({ cls: e.className, hold: e.querySelector(".goal-hold small")?.textContent ?? "", read: e.querySelector(".goal-read")?.textContent ?? "" }));
const state = async (id) => (await goal(id)).cls.split(" ").find((c) => ["done", "active", "pending", "blocked"].includes(c));

try {
  await t(() => window.openLessonById("curso-01"));
  await until(() => win.$eval("#ex-goals", (e) => !e.hidden), 15000);
  await t(() => window.JwsimScene?.setView("scene"));
  const ids = await win.$$eval("#ex-goals .goal", (l) => l.map((x) => x.dataset.goal));
  const theory = await win.$eval("#theory-pane", (e) => ({ hidden: e.hidden, title: e.querySelector("h3")?.textContent ?? "" }));
  const leftOpen = await t(() => !document.querySelector(".scene-main").classList.contains("left-collapsed"));
  criteria.LESSON_OPEN = { ok: ids.join() === "saludo,medio" && !theory.hidden && theory.title === "Hola, JWPLC" && leftOpen, ids, theory, leftOpen };
  log(`LESSON_OPEN ${JSON.stringify(criteria.LESSON_OPEN)}`);
  await win.screenshot({ path: join(OUT, "1-abierta.png") });

  await t(() => window.JwsimTabs.select("program"));
  const guideOf = () =>
    win.$eval("#guide-pane", (e) => ({
      visible: !e.hidden && e.getBoundingClientRect().width > 100,
      title: e.querySelector("h3")?.textContent ?? "",
      heads: [...e.querySelectorAll("h4")].map((h) => h.textContent),
      open: !document.getElementById("guide-open").hidden,
    }));
  const guide = await guideOf();
  const firstLine = await t(() => window.jwsimTest.getSource().split("\n")[0]);
  await win.screenshot({ path: join(OUT, "0-guia-programa.png") });
  await win.click("#guide-fold");
  const folded = await guideOf();
  await win.click("#guide-open");
  const unfolded = await guideOf();
  criteria.LESSON_GUIDE = {
    ok:
      guide.visible && guide.title === "Hola, JWPLC" && guide.heads.includes("Cómo probarlo") && !guide.heads.includes("Para practicar") &&
      !folded.visible && folded.open && unfolded.visible && !unfolded.open && /^\/\/ Curso JWPLC Basic · Lección 01/.test(firstLine),
    guide,
    folded,
    unfolded,
    firstLine,
  };
  log(`LESSON_GUIDE ${JSON.stringify(criteria.LESSON_GUIDE)}`);
  await t(() => window.JwsimScene?.setView("scene"));

  // Sin cambios: el ejemplo tal cual no cumple los objetivos.
  const lessonsBefore = await t(() => window.jwsimApi?.learnLessons?.() ?? null);

  const sol = readFileSync(join(ROOT, "JWPLC_Aprende", "extras", "practicas", "curso-01", "solucion", "Hola_JWPLC", "Hola_JWPLC.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  const saludo = await until(async () => ((await state("saludo")) === "done" ? await goal("saludo") : null), 15000);
  criteria.LESSON_CONSOLE = { ok: !!saludo, saludo };
  log(`LESSON_CONSOLE ${JSON.stringify(criteria.LESSON_CONSOLE)}`);
  const partial = await until(async () => {
    const g = await goal("medio");
    return /^[12] \/ 3 ciclos$/.test(g.hold) ? g : null;
  }, 15000);
  await win.screenshot({ path: join(OUT, "2-contando.png") });
  const medio = await until(async () => ((await state("medio")) === "done" ? await goal("medio") : null), 15000);
  criteria.LESSON_PERIOD = { ok: !!partial && !!medio, partial, medio };
  log(`LESSON_PERIOD ${JSON.stringify(criteria.LESSON_PERIOD)}`);

  const complete = await until(() => win.$eval("#ex-goals .goals-done", (e) => !e.hidden), 5000);
  const next = await until(() => win.$eval("#ex-goals [data-next-lesson]", (e) => e.dataset.nextLesson), 5000);
  await win.screenshot({ path: join(OUT, "3-lograda.png") });
  await win.click("#btn-stop").catch(() => {});
  criteria.LESSON_DONE = { ok: !!complete && next === "curso-02", complete: !!complete, next, lessonsBefore };
  log(`LESSON_DONE ${JSON.stringify(criteria.LESSON_DONE)}`);

  // Lección 06 (sin práctica evaluada): se abre el ejemplo con su guía.
  const l06 = await t(async () => (await window.jwsim.courseList()).flatMap((u) => u.lessons).find((l) => l.id === "curso-06"));
  await t(async (dir) => window.loadSketch(await window.jwsim.openExample(dir)), l06.dir);
  await t((l) => window.showLessonGuide(l), l06);
  await t(() => window.JwsimTabs.select("program"));
  const plain = await guideOf();
  await win.screenshot({ path: join(OUT, "4-leccion-06.png") });
  await t((x) => window.loadSketch({ dir: "/tmp/x", name: "x", files: [{ name: "x.ino", path: "/tmp/x/x.ino", content: "void setup() {}\nvoid loop() {}\n" }] }));
  const cleared = await guideOf();
  criteria.LESSON_PLAIN = { ok: plain.visible && plain.title === l06.title && plain.heads.includes("Para practicar") && !cleared.visible && !cleared.open, plain, cleared };
  log(`LESSON_PLAIN ${JSON.stringify(criteria.LESSON_PLAIN)}`);
} catch (err) {
  criteria.ERROR = { ok: false, error: String(err?.stack ?? err) };
  log(String(err?.stack ?? err));
} finally {
  await app.close().catch(() => {});
}
const ok = Object.values(criteria).length >= 6 && Object.values(criteria).every((c) => c.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_PRACTICAS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
console.log(`JWSIM_PRACTICAS_E2E ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
