// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G2 sobre Electron (Playwright). Un criterio por gate:
//   SPLIT_UI            arranque en frío < 5 s; editor, Placa, Consola y Buses
//                       lado a lado; Buses muestra el TCA6424A en vivo
//   RUN_IO              02_io_basic: I0.0 → Q0.0 y ninguna otra salida
//   LOCAL_COMPILE       recompilar tras cambiar loop() < 3 s (dentro de la app)
//   ERROR_MAPPING       5 errores sembrados en 2 pestañas → archivo:línea y
//                       marcas en el editor; prototipos entre pestañas
//   PROJECT_LINKING     abre un .jwsim v0 (migración), muestra vínculos,
//                       aplica la escena y guarda como v1 conservando campos
//   EXTERNAL_EDIT_RELOAD  escribir el .ino desde fuera recompila y recarga
//                       en < 2 s sin perder la escena (entradas activas)
// Informe en build/gates/JWSIM_G2_E2E.json y capturas en build/gates/g2/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g2.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g2");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const shot = (win, name) => win.screenshot({ path: join(OUT, name) });

const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

// Electron descarga su binario la primera vez que se pide su ruta: se hace
// antes de medir el arranque en frío.
createRequire(import.meta.url)("electron");
log(`iniciando Electron (carpeta de trabajo temporal: ${workspace})`);
const t0 = Date.now();
const args = [APP];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
// JWSIM_BUILD_TIMING: el log de compilación de la app incluye tiempos por fase.
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_BUILD_TIMING: "1" } });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active:has-text('02_io_basic.ino')", { timeout: 30000 });
const coldMs = Date.now() - t0;
await shot(win, "01-inicio.png");

const waitStatus = (cls, timeout = 600000) => win.waitForSelector(`#status.${cls}`, { timeout });
const isOn = (sig) => win.$eval(`.io[data-signal='${sig}']`, (e) => e.classList.contains("on"));
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return true;
    await win.waitForTimeout(50);
  }
  return false;
};
// Tiempos por fase y avisos del último build, desde el panel de compilación.
const buildPhases = () =>
  win.$eval("#build-log", (e) => e.textContent.split("\n").filter((l) => /\[tiempo\]|aviso/.test(l)).map((l) => l.replace(/^\[\w+\] /, "")));
const setModel = (suffix, text) =>
  win.evaluate(([sfx, t]) => window.monaco.editor.getModels().find((m) => m.uri.path.endsWith(sfx)).setValue(t), [suffix, text]);

log(`ventana lista en ${coldMs} ms; compilando 02_io_basic (la primera vez tarda ~15 s)`);
// ---- RUN_IO + SPLIT_UI (Buses)
await win.click("#btn-run");
await waitStatus("running");
await win.waitForTimeout(500);
await win.click(".io.input[data-signal='I0_0']");
const q0 = await until(() => isOn("Q0_0"), 3000);
const others = await win.$$eval(".io.output.on", (els) => els.map((e) => e.dataset.signal).filter((s) => s !== "Q0_0"));
await win.click("#tab-buses");
const busOk = await until(async () => (await win.$$eval("#bus-rows tr", (r) => r.map((x) => x.textContent))).some((t) => /TCA6424A.*Leer Entrada/.test(t)), 3000);
const busSample = await win.$$eval("#bus-rows tr", (r) => r.slice(-3).map((x) => x.textContent));
await shot(win, "02-buses.png");
await win.click("#tab-console");
await win.click(".io.input[data-signal='I0_0']");
const q0off = await until(async () => !(await isOn("Q0_0")), 3000);
const panes = await win.evaluate(() => ["#editor", ".board-card", "#tab-console", "#tab-buses"].every((s) => !!document.querySelector(s)));
criteria.SPLIT_UI = { pass: coldMs < 5000 && panes && busOk, cold_start_ms: coldMs, panes, bus_tca_rows: busOk, bus_sample: busSample };
criteria.RUN_IO = { pass: q0 && q0off && others.length === 0, q0_on: q0, q0_off: q0off, other_outputs_on: others };

log("RUN_IO y Buses listos; LOCAL_COMPILE");
// ---- LOCAL_COMPILE: cambio en loop() y recompilación dentro de la app
await setModel("02_io_basic.ino", "void setup()\n{\n  pinMode(I0_0, INPUT);\n  pinMode(Q0_0, OUTPUT);\n}\n\nvoid loop()\n{\n  digitalWrite(Q0_0, digitalRead(I0_0));\n  delay(1);\n}\n");
const tb = Date.now();
await win.click("#btn-run");
await waitStatus("running");
const rebuildMs = Date.now() - tb;
const reported = await win.$eval("#sb-build", (e) => e.textContent);
criteria.LOCAL_COMPILE = { pass: rebuildMs < 3000, rebuild_and_start_ms: rebuildMs, status: reported, fases: await buildPhases() };

log("EXTERNAL_EDIT_RELOAD");
// ---- EXTERNAL_EDIT_RELOAD: con I0_0 activa, otro editor invierte la lógica
await win.click(".io.input[data-signal='I0_0']");
await until(() => isOn("Q0_0"), 3000);
const inoPath = join(workspace, "02_io_basic", "02_io_basic.ino");
const external = readFileSync(inoPath, "utf8").replace("digitalWrite(Q0_0, digitalRead(I0_0));", "digitalWrite(Q0_0, !digitalRead(I0_0));");
await win.evaluate(() => delete document.getElementById("sb-build").dataset.reloadMs);
writeFileSync(inoPath, external);
const reloaded = await until(() => win.$eval("#sb-build", (e) => !!e.dataset.reloadMs), 15000);
const reloadMs = reloaded ? Number(await win.$eval("#sb-build", (e) => e.dataset.reloadMs)) : null;
const editorHas = await win.evaluate(() => window.monaco.editor.getModels().some((m) => m.getValue().includes("!digitalRead(I0_0)")));
const sceneKept = await isOn("I0_0");
const newBehavior = await until(async () => !(await isOn("Q0_0")), 3000);
await shot(win, "03-recarga.png");
criteria.EXTERNAL_EDIT_RELOAD = {
  pass: reloaded && reloadMs < 2000 && editorHas && sceneKept && newBehavior,
  reload_ms: reloadMs,
  editor_updated: editorHas,
  scene_kept_I0_0: sceneKept,
  new_behavior_Q0_0_off: newBehavior,
  fases: await buildPhases(),
};

log("ERROR_MAPPING");
// ---- ERROR_MAPPING: 5 errores en 2 pestañas
await win.click("#btn-stop");
await win.evaluate((dir) => window.jwsimTest.openSketchDir(dir), join(ROOT, "tests", "sketches", "g2_errores"));
await win.waitForSelector(".tab:has-text('extra.ino')");
await win.click("#btn-run");
await waitStatus("error");
const problems = await win.$$eval("#problems li.error", (els) => els.map((e) => e.textContent.split("  ")[0]));
const markers = await win.evaluate(() =>
  window.monaco.editor.getModelMarkers({}).map((m) => `${m.resource.path.split("/").pop()}:${m.startLineNumber}`),
);
const expected = ["g2_errores.ino:5", "g2_errores.ino:11", "g2_errores.ino:16", "extra.ino:4", "extra.ino:8"];
const listed = expected.every((e) => problems.some((p) => p.startsWith(`${e}:`)));
const marked = expected.every((e) => markers.includes(e));
// ayudante() está en extra.ino y se llama desde la pestaña principal: sin
// prototipos automáticos habría un sexto error.
const noPrototypeError = !problems.some((p) => /ayudante/.test(p));
await win.click(".tab:has-text('extra.ino')");
await shot(win, "04-errores.png");
criteria.ERROR_MAPPING = { pass: listed && marked && problems.length === 5 && noPrototypeError, problems, markers };

log("PROJECT_LINKING");
// ---- PROJECT_LINKING: .jwsim v0 → v1
const projDir = join(workspace, "proyecto");
cpSync(join(ROOT, "tests", "projects", "demo"), projDir, { recursive: true });
const v0 = join(projDir, "demo-v0.jwsim");
const raw = JSON.parse(readFileSync(v0, "utf8"));
raw.scene = { inputMode: "push", inputs: { I0_1: 1 } };
raw["x-campo-propio"] = 42;
writeFileSync(v0, JSON.stringify(raw, null, 2));
await win.evaluate((f) => window.jwsimTest.openProjectFile(f), v0);
await win.waitForSelector(".tab.active:has-text('marcha.ino')");
const sb = await win.$eval("#sb-project", (e) => e.textContent);
const migratedMsg = await win.$eval("#console", (e) => /migrado de la versión 0/.test(e.textContent));
const pushMode = await win.$eval(".mode .seg[data-mode='push']", (e) => e.classList.contains("active"));
const speed10 = await win.$eval(".speed .seg[data-speed='10']", (e) => e.classList.contains("active"));
await win.evaluate(() => window.jwsimTest.saveProject());
await win.waitForTimeout(300);
const saved = JSON.parse(readFileSync(v0, "utf8"));
await shot(win, "05-proyecto.png");
criteria.PROJECT_LINKING = {
  pass:
    /Proyecto: Marcha y parada/.test(sb) &&
    /OpenPLC: plc\.xml/.test(sb) &&
    /HMI: panel\.hmi/.test(sb) &&
    migratedMsg &&
    pushMode &&
    speed10 &&
    saved.format === "jwsim" &&
    saved.version === 1 &&
    saved.links?.openplc === "./ladder/plc.xml" &&
    saved["x-campo-propio"] === 42,
  statusbar: sb,
  migrated_message: migratedMsg,
  scene_input_mode_push: pushMode,
  speed_x10: speed10,
  saved: { version: saved.version, program: saved.program, links: saved.links, unknown_kept: saved["x-campo-propio"] === 42 },
};

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_G2_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_G2_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
