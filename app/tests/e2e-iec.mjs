// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de la ruta IEC 61131-3 en la app (Electron + Playwright):
//   IEC_RUTA     la ruta muestra las unidades IEC y la ficha de una lección
//                trae un botón por lenguaje (ST, Ladder, FBD)
//   IEC_LADDER   «Ladder» abre la práctica con el programa .ld (de solo
//                lectura en el Sim, dibujado como diagrama), compila con la
//                cadena del OpenPLC Editor y MARCHA arranca KM1 con el enclavamiento
//   IEC_ST       «ST» abre la misma práctica con main.st editable: lo que se
//                escribe en el Sim se guarda en el proyecto y se compila
// Capturas en build/gates/iec/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-iec.mjs
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "iec");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
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
const press = (id, on) => t(([d, v]) => window.jwsimTest.scene.act(d, "press", v), [id, on]);
const stopRun = () => win.click("#btn-stop").catch(() => {});

try {
  // ---- IEC_RUTA
  await t(() => window.JwsimStart.open("route"));
  await win.click('#start [data-act="tier"][data-k="i1"]');
  await win.click('#start .learn-item[data-id="iec-03"]');
  const langs = await win.$$eval('#ini-brief [data-act="lesson"][data-lang]', (l) => l.map((b) => b.dataset.lang));
  const tiers = await win.$$eval('#start [data-act="tier"]', (l) => l.map((b) => b.dataset.k));
  await win.locator("#start").screenshot({ path: join(OUT, "ruta-iec.png") });
  criteria.IEC_RUTA = { ok: langs.join() === "ST,LD,FBD" && tiers.includes("i1") && tiers.includes("i2"), langs, tiers };
  log(`IEC_RUTA ${JSON.stringify(criteria.IEC_RUTA)}`);

  // ---- IEC_LADDER
  await win.click('#ini-brief [data-lang="LD"]');
  const ld = await until(() => t(() => (window.jwsimTest.fileNames().includes("pous/programs/main.ld") ? window.jwsimTest.sketchDir() : null)), 20000);
  const roLd = await t(() => window.jwsimTest.readOnly());
  // El .ld se ve como diagrama (contactos y bobinas), no como el JSON del editor.
  const diag = await t(() => !document.getElementById("plc-diagram").hidden && document.querySelectorAll("#plc-diagram-body svg text").length > 5);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.click("#btn-run");
  const runLd = await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  await win.waitForTimeout(1500);
  await press("S1", true);
  await win.waitForTimeout(400);
  await press("S1", false);
  const km1 = await until(() => t(() => window.jwsimTest.level("Q0_0")), 3000);
  await win.waitForTimeout(800);
  const held = await t(() => window.jwsimTest.level("Q0_0"));
  await win.screenshot({ path: join(OUT, "ladder.png") });
  await stopRun();
  criteria.IEC_LADDER = { ok: !!ld && /iniciar[\\/]LD$/.test(ld) && roLd === true && diag && !!runLd && !!km1 && !!held, dir: ld, readOnly: roLd, diagram: diag, running: !!runLd, km1: !!km1, held: !!held };
  log(`IEC_LADDER ${JSON.stringify(criteria.IEC_LADDER)}`);

  // ---- IEC_ST
  await t(() => window.openLessonById("iec-03", "ST"));
  const st = await until(() => t(() => (window.jwsimTest.fileNames().includes("pous/programs/main.st") ? window.jwsimTest.sketchDir() : null)), 20000);
  await t(() => window.jwsimTest.showFile("pous/programs/main.st"));
  const roSt = await t(() => window.jwsimTest.readOnly());
  const sol = readFileSync(join(ROOT, "JWPLC_Aprende", "extras", "practicas", "iec-03", "solucion", "ST", "pous", "programs", "main.st"), "utf8");
  await t(([x]) => window.jwsimTest.setFile("pous/programs/main.st", x), [sol]);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.click("#btn-run");
  const runSt = await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  const saved = st ? readFileSync(join(st, "pous", "programs", "main.st"), "utf8") : "";
  await win.waitForTimeout(1500);
  await press("S1", true);
  await win.waitForTimeout(400);
  await press("S1", false);
  const h2 = await until(() => t(() => window.jwsimTest.level("Q0_2")), 3000);
  await win.screenshot({ path: join(OUT, "st.png") });
  await stopRun();
  criteria.IEC_ST = { ok: !!st && roSt === false && saved.replace(/\r\n/g, "\n") === sol.replace(/\r\n/g, "\n") && !!runSt && !!h2, readOnly: roSt, saved: saved === sol, running: !!runSt, h2: !!h2 };
  log(`IEC_ST ${JSON.stringify(criteria.IEC_ST)}`);
} catch (e) {
  criteria.ERROR = { ok: false, detail: String(e?.stack ?? e) };
} finally {
  await app.close();
}
if (errors.length) criteria.PAGE_ERRORS = { ok: false, detail: errors.slice(0, 3) };
const ok = Object.values(criteria).every((c) => c.ok);
for (const [k, c] of Object.entries(criteria)) log(`${c.ok ? "OK  " : "FAIL"} ${k}`);
console.log(`JWSIM_IEC_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
