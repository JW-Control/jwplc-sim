// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G9 sobre Electron (Playwright): ejercicios en la app.
//   EX_LIST      la lista «Ejercicios…» trae los 8 ejercicios
//   EX_OPEN      abrir el 01 copia el proyecto a la carpeta de trabajo sin la
//                solución, carga la escena y muestra la pestaña Ejercicio con
//                el enunciado
//   EX_GRADE     «Calificar» con la plantilla vacía da una nota baja; con la
//                solución de referencia en el editor, 20/20 con el detalle
// Informe en build/gates/JWSIM_G9_E2E.json y capturas en build/gates/g9/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g9.mjs
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g9");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(100);
  }
  return null;
};
const grade = async () => {
  await t(() => window.jwsimTest.grade());
  return win.$eval("#grade-result", (e) => e.querySelector(".grade-num")?.firstChild?.textContent ?? null);
};

try {
  // ---- EX_LIST
  const opts = await until(() => win.$$eval("#sel-exercise option", (o) => o.filter((x) => x.value).map((x) => x.value)), 10000);
  criteria.EX_LIST = { ok: opts?.length === 8, exercises: opts };
  log(`EX_LIST ${JSON.stringify(criteria.EX_LIST)}`);

  // ---- EX_OPEN
  await t(() => window.jwsimTest.pickExercise("01-marcha-parada"));
  const tab = await until(() => win.$eval("#tab-exercise", (e) => !e.hidden && e.classList.contains("active")), 10000);
  const title = await win.$eval("#ex-statement", (e) => e.querySelector("h3")?.textContent ?? "");
  const table = await win.$$eval("#ex-statement table tr", (r) => r.length);
  const dir = await t(() => window.jwsimTest.sketchDir());
  const copied = join(workspace, "Ejercicios", "01-marcha-parada");
  const noSolution = existsSync(copied) && !existsSync(join(copied, "solucion"));
  const devs = await until(() => win.$$eval("#scene-root .dev", (g) => g.length), 5000);
  await win.screenshot({ path: join(OUT, "ejercicio-abierto.png") });
  criteria.EX_OPEN = {
    ok: !!tab && /Marcha y parada/.test(title) && table >= 5 && dir?.startsWith(copied) && noSolution && devs === 8,
    tab: !!tab, title, table_rows: table, copied: dir, no_solution: noSolution, scene_devices: devs,
  };
  log(`EX_OPEN ${JSON.stringify(criteria.EX_OPEN)}`);

  // ---- EX_GRADE
  const empty = await grade();
  const sol = readFileSync(join(ROOT, "exercises", "01-marcha-parada", "solucion", "marcha_parada", "marcha_parada.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol);
  const full = await grade();
  const checks = await win.$$eval("#grade-result li", (l) => l.length);
  await win.screenshot({ path: join(OUT, "ejercicio-calificado.png") });
  criteria.EX_GRADE = { ok: Number(String(empty).replace(",", ".")) <= 2 && full === "20" && checks > 5, template_grade: empty, solution_grade: full, checks };
  log(`EX_GRADE ${JSON.stringify(criteria.EX_GRADE)}`);
} finally {
  const ok = Object.values(criteria).length === 3 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_G9_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_G9_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
