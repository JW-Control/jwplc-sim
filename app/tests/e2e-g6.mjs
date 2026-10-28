// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G6 sobre Electron (Playwright), con el proyecto OpenPLC
// tests/openplc/blink (ST: Q0_0 parpadea, Q0_1 = I0_0):
//   OPEN_OPENPLC         la carpeta del proyecto del editor se abre en la app:
//                        sus POU en pestañas de solo lectura
//   RUN_OPENPLC          Ejecutar compila con la cadena del editor y corre:
//                        I0_0 → Q0_1 y Q0_0 parpadea
//   RELOAD_FROM_EDITOR   el editor guarda (POU y project.json): la app
//                        recompila y recarga sola, conserva la escena
//                        (I0_0 activa) y corre el programa nuevo (Q0_1 = NOT I0_0)
// Requiere la cadena del editor: node scripts/fetch-editor.mjs
// Informe en build/gates/JWSIM_G6_E2E.json y capturas en build/gates/g6/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g6.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g6");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const log = (m) => console.log(`[e2e] ${m}`);
const criteria = {};

const projDir = join(workspace, "blink");
cpSync(join(ROOT, "tests", "openplc", "blink"), projDir, { recursive: true, filter: (p) => !/[\\/]build([\\/]|$)/.test(p) });

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace } });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};
const isOn = (sig) => win.$eval(`.io[data-signal='${sig}']`, (e) => e.classList.contains("on"));
const shot = (name) => win.screenshot({ path: join(OUT, name) });

try {
  // ---- OPEN_OPENPLC
  await win.evaluate((d) => window.jwsimTest.openSketchDir(d), projDir);
  await win.waitForSelector(".tab.active:has-text('main.st')", { timeout: 30000 });
  const readOnly = await win.evaluate(() => window.monaco.editor.getEditors()[0].getOption(window.monaco.editor.EditorOption.readOnly));
  const shown = await win.evaluate(() => window.monaco.editor.getModels().some((m) => m.getValue().includes("Q0_1_OUT := I0_0_IN;")));
  criteria.OPEN_OPENPLC = { pass: readOnly && shown, read_only: readOnly, pou_shown: shown };
  await shot("01-abierto.png");

  // ---- RUN_OPENPLC
  log("compilando con la cadena del editor");
  const t0 = Date.now();
  await win.click("#btn-run");
  const running = await until(async () => (await win.evaluate(() => window.jwsimTest.status())) === "running", 600000);
  const buildMs = Date.now() - t0;
  const blinks = await until(() => isOn("Q0_0"), 5000);
  await win.click(".io.input[data-signal='I0_0']");
  const follows = await until(() => isOn("Q0_1"), 3000);
  criteria.RUN_OPENPLC = { pass: running && blinks && follows, build_ms: buildMs, q0_0_parpadea: blinks, q0_1_sigue_a_i0_0: follows };
  await shot("02-corriendo.png");

  // ---- RELOAD_FROM_EDITOR: el editor guarda el POU (lógica invertida) y project.json
  log("RELOAD_FROM_EDITOR");
  await win.evaluate(() => delete document.getElementById("sb-build").dataset.reloadMs);
  const pou = join(projDir, "pous", "programs", "main.st");
  writeFileSync(pou, readFileSync(pou, "utf8").replace("Q0_1_OUT := I0_0_IN;", "Q0_1_OUT := NOT I0_0_IN;"));
  const pj = join(projDir, "project.json");
  writeFileSync(pj, readFileSync(pj, "utf8"));
  const reloaded = await until(() => win.$eval("#sb-build", (e) => !!e.dataset.reloadMs), 120000);
  const reloadMs = reloaded ? Number(await win.$eval("#sb-build", (e) => e.dataset.reloadMs)) : null;
  const tabUpdated = await win.evaluate(() => window.monaco.editor.getModels().some((m) => m.getValue().includes("Q0_1_OUT := NOT I0_0_IN;")));
  const sceneKept = await isOn("I0_0");
  const newBehavior = await until(async () => !(await isOn("Q0_1")), 3000);
  // Soltar I0_0: con la lógica nueva, Q0_1 se enciende.
  await win.click(".io.input[data-signal='I0_0']");
  const inverted = await until(() => isOn("Q0_1"), 3000);
  criteria.RELOAD_FROM_EDITOR = {
    pass: reloaded && tabUpdated && sceneKept && newBehavior && inverted,
    reload_ms: reloadMs,
    pestana_actualizada: tabUpdated,
    escena_conservada_I0_0: sceneKept,
    q0_1_apagada_con_i0_0: newBehavior,
    q0_1_encendida_sin_i0_0: inverted,
  };
  await shot("03-recargado.png");
  await win.click("#btn-stop");
} catch (err) {
  criteria.ERROR = { pass: false, error: String(err?.stack ?? err) };
} finally {
  await app.close().catch(() => {});
}

let pass = true;
for (const [k, v] of Object.entries(criteria)) {
  const { pass: p, ...rest } = v;
  pass &&= p;
  console.log(`${k}: ${p ? "OK" : "FALLA"} ${JSON.stringify(rest)}`);
}
writeFileSync(join(ROOT, "build", "gates", "JWSIM_G6_E2E.json"), JSON.stringify({ gate: "JWSIM_G6_RELOAD_FROM_EDITOR", result: pass ? "PASS" : "FAIL", criteria }, null, 2) + "\n");
console.log(`JWSIM_G6_RELOAD_FROM_EDITOR=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
