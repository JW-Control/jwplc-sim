// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de las prácticas evaluadas del curso (lección 01, con su
// solución):
//   LESSON_OPEN     al abrir la práctica: teoría a la izquierda (título de la
//                   lección) y objetivos a la derecha (saludo, medio)
//   LESSON_CONSOLE  el objetivo de consola se cumple con el saludo nuevo
//   LESSON_PERIOD   el objetivo de ritmo cuenta ciclos y se cumple
//   LESSON_CARD     al abrir la lección sale su ficha al centro y se cierra
//   LESSON_GUIDE    en Programa, la clase (GUIA.md, de la wiki) a la
//                   izquierda del código: sin «Para practicar» (son los
//                   objetivos), se pliega y se vuelve a mostrar, y el sketch
//                   empieza sin la guía
//   LESSON_FOCUS    pulsar un trozo de código de la clase, o su título,
//                   resalta esas líneas en el editor
//   LESSON_DONE     con todo cumplido la lección queda hecha y ofrece la
//                   siguiente; abrirla sin cumplir no la marca
//   LESSON_PLAIN    una lección sin práctica también trae su guía, con
//                   «Para practicar», y un sketch cualquiera la quita
//   LESSON_PROGRAM  la lección se abre en Programa: botón Teoría a la
//                   izquierda y panel Reto (objetivos) a la derecha de la placa
//   LESSON_SIM      la clase está adaptada al simulador: sin «Lo que
//                   necesitas» ni «Súbelo y pruébalo», con «Pruébalo aquí»
//   LESSON_SIZE     A+ / A− cambian el tamaño de letra de la clase
//   LESSON_MANDOS   en la lección 08, los mandos del reto accionan el banco
//                   (S1 Marcha cierra Q0.0) sin salir de Programa
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
  const card = await until(() => win.$eval("#lesson-card", (e) => ({ title: e.querySelector("h2")?.textContent, secs: [...e.querySelectorAll(".lc-k")].map((x) => x.textContent) })), 5000);
  await win.screenshot({ path: join(OUT, "0-ficha.png") });
  await win.click("#lesson-card .lc-foot button");
  const cardGone = await t(() => !document.getElementById("lesson-card"));
  criteria.LESSON_CARD = { ok: card?.title === "Hola, JWPLC" && card.secs.includes("Qué vas a aprender") && card.secs.includes("La práctica") && cardGone, card, cardGone };
  log(`LESSON_CARD ${JSON.stringify(criteria.LESSON_CARD)}`);
  const prog = await until(() =>
    t(() => {
      const side = document.getElementById("prog-side");
      const r = side.getBoundingClientRect();
      return document.body.dataset.tab === "program" && !side.hidden && r.width > 200 && !!side.querySelector("#ex-goals .goal") && !document.getElementById("prog-rail-left").hidden
        ? { tab: document.body.dataset.tab, w: Math.round(r.width), teoria: document.getElementById("guide-open").getAttribute("aria-pressed") }
        : null;
    }),
  );
  await win.screenshot({ path: join(OUT, "0-programa-reto.png") });
  criteria.LESSON_PROGRAM = { ok: !!prog && prog.teoria === "true", prog };
  log(`LESSON_PROGRAM ${JSON.stringify(criteria.LESSON_PROGRAM)}`);
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
      open: document.getElementById("guide-open").getAttribute("aria-pressed") === "true",
      zoom: Number(getComputedStyle(e.querySelector(".th-body") ?? e).zoom),
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
      guide.visible && guide.title === "Hola, JWPLC" && guide.heads.includes("Cómo funciona el programa") && !guide.heads.includes("Para practicar") &&
      guide.open && !folded.visible && !folded.open && unfolded.visible && unfolded.open && /^\/\/ Curso JWPLC Basic · Lección 01/.test(firstLine),
    guide,
    folded,
    unfolded,
    firstLine,
  };
  log(`LESSON_GUIDE ${JSON.stringify(criteria.LESSON_GUIDE)}`);
  criteria.LESSON_SIM = {
    ok: guide.heads.includes("Pruébalo aquí") && !guide.heads.includes("Súbelo y pruébalo") && !guide.heads.includes("Lo que necesitas") && !guide.heads.includes("Si algo no funciona"),
    heads: guide.heads,
  };
  log(`LESSON_SIM ${JSON.stringify(criteria.LESSON_SIM)}`);
  await win.click('#guide-pane [data-read-size="1"]');
  const bigger = await guideOf();
  await win.click('#guide-pane [data-read-size="-1"]');
  await win.click('#guide-pane [data-read-size="-1"]');
  const smaller = await guideOf();
  await win.click('#guide-pane [data-read-size="1"]');
  criteria.LESSON_SIZE = { ok: bigger.zoom > guide.zoom && smaller.zoom < guide.zoom, before: guide.zoom, bigger: bigger.zoom, smaller: smaller.zoom };
  log(`LESSON_SIZE ${JSON.stringify(criteria.LESSON_SIZE)}`);

  // Clase interactiva: el trozo «uint32_t segundos = 0;» y la parte «Preparar todo, una sola vez».
  const src = (await t(() => window.jwsimTest.getSource())).split("\n");
  const lineOf = (x) => src.findIndex((l) => l.trim() === x) + 1;
  await win.click('#guide-body pre.th-snippet:has-text("uint32_t segundos = 0;")');
  const one = await t(() => window.jwsimTest.guideHighlight());
  await win.screenshot({ path: join(OUT, "0-clase-resaltado.png") });
  await win.click('#guide-body h5.th-part:has-text("Preparar todo")');
  const part = await t(() => window.jwsimTest.guideHighlight());
  await win.click('#guide-body h5.th-part:has-text("Preparar todo")');
  const off = await t(() => window.jwsimTest.guideHighlight());
  const begin = lineOf("Serial.begin(115200);");
  criteria.LESSON_FOCUS = {
    ok: one.length === 1 && one[0][0] === lineOf("uint32_t segundos = 0;") && part.length === 2 && part[0][0] === begin && off.length === 0,
    one,
    part,
    off,
    expect: { segundos: lineOf("uint32_t segundos = 0;"), begin },
  };
  log(`LESSON_FOCUS ${JSON.stringify(criteria.LESSON_FOCUS)}`);
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
  await t(() => window.jwsimLessonCard.close());
  await t(() => window.JwsimTabs.select("program"));
  const plain = await guideOf();
  await win.screenshot({ path: join(OUT, "4-leccion-06.png") });
  await t((x) => window.loadSketch({ dir: "/tmp/x", name: "x", files: [{ name: "x.ino", path: "/tmp/x/x.ino", content: "void setup() {}\nvoid loop() {}\n" }] }));
  const cleared = await guideOf();
  criteria.LESSON_PLAIN = { ok: plain.visible && plain.title === l06.title && plain.heads.includes("Para practicar") && !cleared.visible && !cleared.open, plain, cleared };
  log(`LESSON_PLAIN ${JSON.stringify(criteria.LESSON_PLAIN)}`);

  // Lección 08: el reto en Programa, con los mandos del banco.
  await t(() => window.openLessonById("curso-08"));
  await until(() => t(() => !!document.getElementById("lesson-card")), 5000);
  await t(() => window.jwsimLessonCard.close());
  const sol08 = readFileSync(join(ROOT, "JWPLC_Aprende", "extras", "practicas", "curso-08", "solucion", "Marcha_y_parada", "Marcha_y_parada.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol08);
  const mandos = await until(() => win.$$eval("#prog-side #ex-mandos .mando", (l) => l.map((b) => b.dataset.dev)), 5000);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await until(() => t(() => !document.querySelector('#ex-mandos .mando[data-dev="S1"]').disabled), 10000);
  // La parada y el térmico (NC) ya llegan a la placa: el banco está en reposo.
  await until(() => t(() => document.querySelector('.io[data-signal="I0_1"]').classList.contains("on") && document.querySelector('.io[data-signal="I0_2"]').classList.contains("on")), 10000);
  await win.waitForTimeout(500);
  const q0 = () => t(() => document.querySelector('#outputs .io[data-signal="Q0_0"]').classList.contains("on"));
  const s1 = await win.$('#ex-mandos .mando[data-dev="S1"]');
  await s1.scrollIntoViewIfNeeded();
  const box = await s1.boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.waitForTimeout(400);
  await win.mouse.up();
  const marcha = await until(q0, 5000);
  await win.screenshot({ path: join(OUT, "5-leccion-08-mandos.png") });
  const s2 = await win.$('#ex-mandos .mando[data-dev="S2"]');
  await s2.scrollIntoViewIfNeeded();
  const b2 = await s2.boundingBox();
  await win.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await win.mouse.down();
  await win.waitForTimeout(400);
  await win.mouse.up();
  const parada = await until(async () => !(await q0()), 5000);
  await win.click("#btn-stop").catch(() => {});
  const tab = await t(() => document.body.dataset.tab);
  criteria.LESSON_MANDOS = { ok: !!mandos && ["S1", "S2", "F1"].every((x) => mandos.includes(x)) && !!marcha && !!parada && tab === "program", mandos, marcha, parada, tab };
  log(`LESSON_MANDOS ${JSON.stringify(criteria.LESSON_MANDOS)}`);
} catch (err) {
  criteria.ERROR = { ok: false, error: String(err?.stack ?? err) };
  log(String(err?.stack ?? err));
} finally {
  await app.close().catch(() => {});
}
const ok = Object.values(criteria).length >= 12 && Object.values(criteria).every((c) => c.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_PRACTICAS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
console.log(`JWSIM_PRACTICAS_E2E ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
