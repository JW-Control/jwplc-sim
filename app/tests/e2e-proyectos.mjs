// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de la pantalla «Proyectos» y del asistente de nuevo proyecto,
// con un OpenPLC Editor simulado (tests/fixtures/openplc-editor-falso.mjs):
//   START_SCREEN    al abrir la app aparece «Proyectos»
//   NAME_CHECK      un nombre inválido no deja seguir y dice por qué
//   OPENPLC_WIZARD  OpenPLC → nombre → Ladder: lo crea la CLI del editor, el
//                   Sim lo abre con la placa JWPLC Basic y le pide al editor
//                   que lo abra (--open-project)
//   ARDUINO_WIZARD  Arduino → nombre: sketch nuevo en la carpeta elegida
//   RECENTS         los dos aparecen en recientes y se vuelven a abrir
//   OPEN_IN_EDITOR  el botón «Abrir en OpenPLC Editor» lo pide otra vez
// Informe en build/gates/JWSIM_PROYECTOS_E2E.json.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "proyectos");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const editorLog = join(workspace, "editor.log");
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

createRequire(import.meta.url)("electron");
const env = {
  ...process.env,
  JWSIM_WORKSPACE: workspace,
  JWSIM_START_SCREEN: "1",
  JWSIM_OPENPLC_EDITOR: join(APP, "tests", "fixtures", "openplc-editor-falso.mjs"),
  JWSIM_FAKE_EDITOR_LOG: editorLog,
};
delete env.ELECTRON_RUN_AS_NODE;
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const app = await electron.launch({ args: [APP, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });

const visible = (sel) => win.$eval(sel, (e) => !e.hidden && e.getBoundingClientRect().height > 0).catch(() => false);
const editorCalls = () => (existsSync(editorLog) ? readFileSync(editorLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const sketchDir = () => win.evaluate(() => window.jwsimTest.sketchDir());
const tabs = () => win.$$eval("#tabs .tab", (t) => t.map((x) => x.dataset.file));

// ---- START_SCREEN
const shown = await win.waitForSelector("#start:not([hidden]) .start-big", { timeout: 10000 }).then(() => true, () => false);
const homeText = await win.$eval("#start", (e) => e.textContent).catch(() => "");
await win.screenshot({ path: join(OUT, "01-proyectos.png") });
criteria.START_SCREEN = { pass: shown && /Nuevo proyecto/.test(homeText) && /Recientes/.test(homeText), shown };

// ---- NAME_CHECK + OPENPLC_WIZARD
await win.click("#start [data-act='new']");
await win.click("#start [data-act='kind'][data-v='openplc']");
await win.waitForSelector("#start .start-editor .ok", { timeout: 10000 });
const editorFound = await win.$eval("#start .start-editor", (e) => e.textContent);
await win.click("#start [data-act='next']");
await win.fill("#start-name", "1 malo");
const nextDisabled = await win.$eval("#start [data-act='next']", (b) => b.disabled);
const nameMsg = await win.$eval("#start .start-step", (e) => e.textContent);
criteria.NAME_CHECK = { pass: nextDisabled && /letras, números y _/.test(nameMsg), next_disabled: nextDisabled };
await win.fill("#start-name", "marcha_ld");
await win.click("#start [data-act='next']");
const langs = await win.$$eval("#start [data-act='lang']", (b) => b.map((x) => x.dataset.v));
await win.click("#start [data-act='lang'][data-v='ld']");
await win.screenshot({ path: join(OUT, "02-lenguaje.png") });
await win.click("#start [data-act='next']");
await win.waitForSelector("#start", { state: "hidden", timeout: 15000 });
const plcDir = await sketchDir();
const plcTabs = await tabs();
const board = existsSync(join(plcDir, "devices", "configuration.json")) ? JSON.parse(readFileSync(join(plcDir, "devices", "configuration.json"), "utf8")).deviceBoard : null;
await win.waitForTimeout(500);
const calls1 = editorCalls();
const btnEditor = await visible("#btn-open-editor");
await win.screenshot({ path: join(OUT, "03-openplc.png") });
criteria.OPENPLC_WIZARD = {
  pass:
    /OpenPLC Editor/.test(editorFound) && langs.join() === "ld,st,fbd,il,sfc" && plcDir?.endsWith("marcha_ld") && plcTabs.some((t) => /main\.ld$/.test(t)) &&
    board === "JWPLC BASIC [2.0.0]" && calls1.some((c) => c.cmd === "create" && c.name === "marcha_ld" && c.lang === "ld" && c.time === "T#20ms") &&
    calls1.some((c) => c.cmd === "open" && c.dir === plcDir) && btnEditor,
  dir: plcDir,
  tabs: plcTabs,
  board,
  editor_calls: calls1,
  open_in_editor_button: btnEditor,
};

// ---- ARDUINO_WIZARD
await win.click("#btn-projects");
await win.click("#start [data-act='new']");
await win.click("#start [data-act='kind'][data-v='arduino']");
await win.click("#start [data-act='next']");
await win.fill("#start-name", "semaforo");
const steps = await win.$$eval("#start .start-steps li", (l) => l.length);
await win.click("#start [data-act='next']");
await win.waitForSelector("#start", { state: "hidden", timeout: 10000 });
const inoDir = await sketchDir();
const inoTabs = await tabs();
criteria.ARDUINO_WIZARD = {
  pass: steps === 2 && inoDir === join(workspace, "semaforo") && inoTabs.includes("semaforo.ino") && !(await visible("#btn-open-editor")),
  dir: inoDir,
  steps,
  tabs: inoTabs,
};

// ---- RECENTS
await win.click("#btn-projects");
const rec = await win.$$eval("#start [data-act='recent'] b", (b) => b.map((x) => x.textContent));
await win.click("#start [data-act='recent'][data-i='1']");
await win.waitForSelector("#start", { state: "hidden", timeout: 10000 });
const reopened = await sketchDir();
criteria.RECENTS = { pass: rec[0] === "semaforo" && rec[1] === "marcha_ld" && reopened === plcDir, recents: rec, reopened };

// ---- OPEN_IN_EDITOR
const before = editorCalls().filter((c) => c.cmd === "open").length;
await win.click("#btn-open-editor");
await win.waitForTimeout(800);
const after = editorCalls().filter((c) => c.cmd === "open").length;
criteria.OPEN_IN_EDITOR = { pass: after === before + 1, opens: after };

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [name, v] of Object.entries(criteria)) console.log(`${name}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_PROYECTOS_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_PROYECTOS_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
