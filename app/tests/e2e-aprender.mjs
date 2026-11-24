// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de la pantalla Inicio, la ruta de aprendizaje y la ficha del
// reto (etapa 2 de docs/integration/PROPUESTA_EVALUACIONES.md):
//   LEARN_CARD    Inicio muestra «Empieza aquí», el progreso (0 / N: las lecciones
//                 del curso y los retos de catalogo.json) y la vitrina con las 3 arquitecturas
//   LEARN_LEVELS  la ruta: las unidades del curso y 3 niveles de retos; el nivel 1
//                 abierto con «A continuación», el 2 y el 3 con candado (7 retos)
//   LESSON        una lección con práctica evaluada abre su banco (teoría y
//                 objetivos) y NO queda hecha solo por abrirla (sigue 0 / N)
//   BRIEF         «Empezar reto» abre el reto con su ficha; Empezar la pliega y se vuelve a ver
//   COMPLETE      con los objetivos cumplidos: «Qué enseña» y «Siguiente reto →»
//   PROGRESS      el reto queda hecho y el siguiente pasa a «A continuación»
//   UNLOCK        el docente desbloquea todos los niveles
//   NEXT          «Siguiente reto →» abre el 02 con su ficha
//   ARCH          la vitrina abre una arquitectura
//   EXAMPLES      la vista Ejemplos lista las librerías y abre un ejemplo
// Informe en build/gates/JWSIM_APRENDER_E2E.json.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
// Pasos de la ruta: lecciones del curso más retos, según el catálogo de la librería.
const CAT = JSON.parse(readFileSync(join(ROOT, "JWPLC_Aprende", "catalogo.json"), "utf8"));
// La ruta IEC 61131-3 suma sus unidades después de las del curso C++.
const UNITS = CAT.curso.length + (CAT.curso_iec?.length ?? 0);
const STEPS = [...CAT.curso, ...(CAT.curso_iec ?? [])].reduce((n, u) => n + u.lecciones.length, 0) + CAT.retos.length;
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
const items = () => win.$$eval("#start .learn-item.reto", (l) => l.map((b) => `${b.dataset.id}:${[...b.classList].find((c) => ["done", "next", "open", "locked"].includes(c))}${b.getAttribute("aria-disabled") === "true" ? "!" : ""}`));
const allRetos = async () => {
  const out = [];
  for (const k of ["n1", "n2", "n3"]) {
    await win.click(`#start [data-act="tier"][data-k="${k}"]`);
    out.push(...(await items()));
  }
  return out;
};
const press = async (id) => {
  await t((d) => window.jwsimTest.scene.act(d, "press", true), id);
  await win.waitForTimeout(300);
  await t((d) => window.jwsimTest.scene.act(d, "press", false), id);
};
const progress = () => win.$eval("#start .ini-progress .ini-num", (e) => e.textContent.replace(/\s/g, "")).catch(() => null);

try {
  // ---- LEARN_CARD
  const hero = await until(() => win.$eval("#start .ini-hero", (e) => e.textContent), 10000);
  await until(() => win.$$eval("#start .ini-thumb", (l) => l.length === 3), 10000);
  const prog = await until(async () => ((await progress()) === `0/${STEPS}` ? `0/${STEPS}` : null), 10000);
  const thumbs = await win.$$eval("#start .ini-thumb", (l) => l.length);
  await win.screenshot({ path: join(OUT, "01-inicio.png") });
  criteria.LEARN_CARD = { ok: /Empieza aquí/i.test(hero ?? "") && /Hola, JWPLC/.test(hero ?? "") && prog === `0/${STEPS}` && thumbs === 3, prog, thumbs };
  log(`LEARN_CARD ${JSON.stringify(criteria.LEARN_CARD)}`);

  // ---- LEARN_LEVELS
  await win.click('#start [data-act="route"]');
  await win.waitForSelector("#start .ini-tiers .learn-level");
  const lv = await win.$$eval("#start .ini-tiers .learn-level", (l) => l.map((x) => `${x.querySelector("b").textContent}${x.classList.contains("locked") ? " 🔒" : ""}`));
  const it = await allRetos();
  await win.click('#start [data-act="tier"][data-k="n1"]');
  await win.screenshot({ path: join(OUT, "02-ruta.png") });
  criteria.LEARN_LEVELS = {
    ok: lv.length === UNITS + 3 && /^Unidad 1/.test(lv[0]) && /^Nivel 1/.test(lv[UNITS]) && !lv[UNITS].includes("🔒") && lv[UNITS + 1].includes("🔒") && it[0] === "01-marcha-parada:next" && it.length === 10 && it.filter((x) => x.endsWith("locked!")).length === 7,
    levels: lv,
    items: it,
  };
  log(`LEARN_LEVELS ${JSON.stringify(criteria.LEARN_LEVELS)}`);

  // ---- LESSON
  await win.click('#start [data-act="tier"][data-k="u1"]');
  await win.click('#start .learn-item[data-id="curso-02"]');
  const lessonBrief = await win.$eval("#ini-brief", (e) => e.textContent);
  await win.screenshot({ path: join(OUT, "03-leccion.png") });
  await win.click('#ini-brief [data-act="lesson"]');
  await win.waitForSelector("#start", { state: "hidden", timeout: 10000 });
  const lessonDir = await until(() => t(() => window.jwsimTest.sketchDir()).then((d) => (/Encender_un_rele/.test(d ?? "") ? d : null)), 10000);
  const theory = await until(() => win.$eval("#theory-pane h3", (e) => e.textContent), 5000);
  // La ficha de la lección sale al centro: se cierra con Empezar.
  const lessonCard = await until(() => win.$eval("#lesson-card h2", (e) => e.textContent), 5000);
  await win.click("#lesson-card .lc-foot button");
  await win.click("#btn-projects");
  await win.waitForTimeout(500);
  const prog2 = await progress();
  criteria.LESSON = {
    ok: /Qué vas a aprender/i.test(lessonBrief) && /Objetivos que se evalúan/i.test(lessonBrief) && /[\\/]Curso[\\/]curso-02[\\/]/.test(lessonDir ?? "") && theory === "Encender un relé" && lessonCard === "Encender un relé" && prog2 === `0/${STEPS}`,
    dir: lessonDir,
    lessonCard,
    theory,
    prog: prog2,
  };
  log(`LESSON ${JSON.stringify(criteria.LESSON)}`);

  // ---- BRIEF
  await win.click('#start [data-act="tier"][data-k="n1"]');
  await win.click('#start .learn-item[data-id="01-marcha-parada"]');
  const card = await win.$eval("#ini-brief", (e) => e.textContent);
  await win.screenshot({ path: join(OUT, "04-ficha-inicio.png") });
  await win.click('#ini-brief [data-act="ex"][data-id="01-marcha-parada"]');
  const brief = await until(() => win.$eval("#ex-brief", (e) => !e.hidden && !e.classList.contains("collapsed") && e.textContent), 10000);
  const uses = await win.$$eval("#ex-brief .brief-uses li", (l) => l.length);
  await win.click('#ex-brief [data-brief="start"]');
  const collapsed = await win.$eval("#ex-brief", (e) => e.classList.contains("collapsed"));
  await win.click('#ex-brief [data-brief="show"]');
  const again = await win.$eval("#ex-brief", (e) => !e.classList.contains("collapsed"));
  await win.click('#ex-brief [data-brief="start"]');
  criteria.BRIEF = {
    ok: /Objetivos en vivo/i.test(card) && /En la mesa/i.test(card) && /El objetivo/i.test(brief || "") && /Pasos/i.test(brief || "") && uses === 4 && collapsed && again,
    uses,
    collapsed,
    again,
  };
  log(`BRIEF ${JSON.stringify(criteria.BRIEF)}`);

  // ---- COMPLETE
  const sol = readFileSync(join(ROOT, "JWPLC_Aprende", "extras", "retos", "01-marcha-parada", "solucion", "marcha_parada", "marcha_parada.ino"), "utf8");
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
  await (await win.$("#prog-side")).screenshot({ path: join(OUT, "05-completado.png") });
  criteria.COMPLETE = { ok: /Qué enseña: Autorretención/.test(after || "") && next === "02-inversion-giro", next };
  log(`COMPLETE ${JSON.stringify(criteria.COMPLETE)}`);

  // ---- PROGRESS
  await win.click("#btn-stop");
  await until(() => t(() => window.jwsimTest.status() !== "running"), 10000);
  await win.click("#btn-projects");
  const prog3 = await until(async () => ((await progress()) === `1/${STEPS}` ? `1/${STEPS}` : null), 5000);
  await win.click('#start [data-act="route"]');
  await win.click('#start [data-act="tier"][data-k="n1"]');
  const it2 = await items();
  criteria.PROGRESS = { ok: prog3 === `1/${STEPS}` && it2[0] === "01-marcha-parada:done" && it2[1] === "02-inversion-giro:next", prog: prog3, items: it2 };
  log(`PROGRESS ${JSON.stringify(criteria.PROGRESS)}`);

  // ---- UNLOCK
  await win.click("#learn-unlock");
  await win.waitForTimeout(300);
  const it3 = await allRetos();
  await win.screenshot({ path: join(OUT, "06-desbloqueado.png") });
  criteria.UNLOCK = { ok: it3.length === 10 && !it3.some((x) => x.endsWith("!")), items: it3 };
  log(`UNLOCK ${JSON.stringify(criteria.UNLOCK)}`);
  await win.click("#learn-unlock");
  await win.click('#start [data-act="close"]');

  // ---- NEXT
  await win.click('#ex-goals [data-next="02-inversion-giro"]').catch(() => {});
  const brief2 = await until(() => win.$eval("#ex-brief", (e) => !e.hidden && !e.classList.contains("collapsed") && e.textContent), 10000);
  const dir2 = await t(() => window.jwsimTest.sketchDir());
  criteria.NEXT = { ok: /KM1 y KM2/.test(brief2 || "") && /02-inversion-giro/.test(dir2 ?? ""), dir: dir2 };
  log(`NEXT ${JSON.stringify(criteria.NEXT)}`);

  // ---- ARCH
  await win.click("#btn-projects");
  await win.click('#start [data-act="archSel"][data-i="1"]');
  const archTitle = await win.$eval("#start .ini-show-title", (e) => e.textContent);
  await win.click('#start [data-act="arch"]');
  await win.waitForSelector("#start", { state: "hidden", timeout: 10000 });
  const dir3 = await until(() => t(() => window.jwsimTest.sketchDir()).then((d) => (/02-montacargas/.test(d ?? "") ? d : null)), 10000);
  criteria.ARCH = { ok: /Montacargas/i.test(archTitle) && !!dir3, title: archTitle, dir: dir3 };
  log(`ARCH ${JSON.stringify(criteria.ARCH)}`);

  // ---- EXAMPLES
  await win.click("#btn-projects");
  await win.click('#start [data-act="examples"]');
  const libs = await until(() => win.$$eval("#start .ini-libs button", (l) => (l.length ? l.map((b) => b.dataset.g) : null)), 15000);
  await win.fill("#ini-exq", "buzzer");
  await win.waitForTimeout(200);
  const found = await win.$$eval('#start [data-act="example"]', (l) => l.map((b) => b.textContent));
  await win.screenshot({ path: join(OUT, "07-ejemplos.png") });
  await win.click('#start [data-act="example"]');
  await win.waitForSelector("#start", { state: "hidden", timeout: 10000 });
  const dir4 = await until(() => t(() => window.jwsimTest.sketchDir()).then((d) => (/Buzzer/i.test(d ?? "") ? d : null)), 10000);
  criteria.EXAMPLES = { ok: libs?.includes("JWPLC_GlobalPeripherals") && found.length > 0 && !!dir4, libs: libs?.length, found, dir: dir4 };
  log(`EXAMPLES ${JSON.stringify(criteria.EXAMPLES)}`);
} finally {
  const ok = Object.values(criteria).length === 10 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_APRENDER_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_APRENDER_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
