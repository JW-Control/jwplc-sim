// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del circuito neumático (pneumatic.js) con el ejercicio 10 y su
// solución:
//   PN_AVAILABLE  «Neumático» se puede elegir: la escena tiene electroválvulas
//   PN_DRAWN      dibuja 4 cilindros, sus válvulas, el compresor y la FR
//   PN_LIVE       con la secuencia en marcha una válvula conmuta (bobina
//                 encendida) y la línea al cilindro lleva presión
//   PN_SYMBOLS    en «A colores» el compresor y la FR usan sus plantillas
//   PN_3D         la Planta 3D muestra el compresor, la FR y los 4 cilindros
// Informe en build/gates/JWSIM_NEUMATICA_E2E.json y captura en build/gates/neumatica/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-neumatica.mjs
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "neumatica");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
const dir = join(workspace, "10-secuencia-neumatica");
cpSync(join(ROOT, "JWPLC_Aprende", "extras", "retos", "10-secuencia-neumatica"), dir, { recursive: true });
cpSync(join(dir, "solucion", "secuencia_neumatica"), join(dir, "sketch", "secuencia_neumatica"), { recursive: true });

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const app = await electron.launch({ args: [APP, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => win.waitForTimeout(ms);
try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await t((f) => window.jwsimTest.openProjectFile(f), join(dir, "10-secuencia-neumatica.jwsim"));
  await sleep(1500);
  await t(() => window.JwsimTabs.select("schematic"));
  await sleep(1500);

  criteria.PN_AVAILABLE = { ok: await win.$eval("#schem-pneu", (b) => !b.disabled) };
  log(`PN_AVAILABLE ${JSON.stringify(criteria.PN_AVAILABLE)}`);

  await win.click("#schem-pneu");
  await sleep(400);
  const drawn = await t(() => ({
    shown: !document.getElementById("pn-view").hidden,
    cylinders: document.querySelectorAll("#pn-root .pn-cyl").length,
    valves: document.querySelectorAll("#pn-root .pn-spool").length,
    text: document.getElementById("pn-root").textContent,
  }));
  criteria.PN_DRAWN = { ok: drawn.shown && drawn.cylinders === 4 && drawn.valves === 4 && /CP1/.test(drawn.text) && /FR1/.test(drawn.text), ...drawn, text: undefined };
  log(`PN_DRAWN ${JSON.stringify(criteria.PN_DRAWN)}`);

  await win.click("#btn-run");
  await win.waitForFunction(() => /Ejecutando/.test(document.body.innerText), null, { timeout: 120000 });
  await sleep(2500);
  await t(() => pressKey("BTN_OK", true));
  await sleep(300);
  await t(() => pressKey("BTN_OK", false));
  let live = null;
  for (let i = 0; i < 30 && !live?.ok; i++) {
    await sleep(100);
    live = await t(() => {
      const sol = document.querySelectorAll("#pn-root .pn-sol.on").length;
      const onLines = document.querySelectorAll("#pn-root .pn-line.on").length;
      const shifted = [...document.querySelectorAll("#pn-root .pn-spool")].filter((g) => /translate\(44/.test(g.getAttribute("transform") ?? "")).length;
      return { ok: sol > 0 && shifted > 0 && onLines > 0, sol, shifted, onLines };
    });
  }
  criteria.PN_LIVE = live;
  log(`PN_LIVE ${JSON.stringify(criteria.PN_LIVE)}`);
  await win.screenshot({ path: join(OUT, "neumatico.png") });

  await win.click("#schem-color");
  await sleep(500);
  const sym = await t(() =>
    ["CP1", "FR1"].map((id) => !!document.querySelector(`#scene-root .dev[data-id="${id}"] .tpl`)),
  );
  criteria.PN_SYMBOLS = { ok: sym.every(Boolean), templates: sym };
  log(`PN_SYMBOLS ${JSON.stringify(criteria.PN_SYMBOLS)}`);

  await t(() => window.jwsimTest.scene.view("3d"));
  await sleep(1500);
  const objs = await t(() => window.jwsimTest.scene.view3d());
  const types = objs.map((o) => o.type);
  criteria.PN_3D = {
    ok: types.includes("jwsim/compressor") && types.includes("jwsim/service-unit") && types.filter((x) => /solenoid/.test(x)).length === 4,
    objetos: objs.map((o) => o.id),
  };
  log(`PN_3D ${JSON.stringify(criteria.PN_3D)}`);
  await win.screenshot({ path: join(OUT, "planta-3d.png") });
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}
const ok = ["PN_AVAILABLE", "PN_DRAWN", "PN_LIVE", "PN_SYMBOLS", "PN_3D"].every((k) => criteria[k]?.ok);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "JWSIM_NEUMATICA_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_NEUMATICA_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
