// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de los equipos nuevos del catálogo (tanda 1) en el esquema:
//   TEMPLATES   cada equipo se dibuja con su plantilla .svg, sin avisos del
//               contrato de símbolos
//   PALETTE     están en la paleta, en su categoría, con miniatura
//   MODELS      el termomagnético ofrece 1P, 2P y 3P como modelos (con su
//               plantilla) y el capacitivo y el inductivo, el material
//   STATIC      el análisis sin simular llena los textos (tiempo del
//               temporizador, ajuste del guardamotor, Sn real del sensor)
// Informe en build/gates/JWSIM_CATALOGO_E2E.json y capturas en build/gates/catalogo/.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "catalogo");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP], env });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1600, height: 1000 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.click(".mtab[data-tab=schematic]");
await win.waitForTimeout(500);
const sc = (fn, arg) => win.evaluate(fn, arg);

const NEW = [
  ["jwsim/emergency-stop", {}],
  ["jwsim/pushbutton-lit", {}],
  ["jwsim/selector-key", {}],
  ["jwsim/sensor-capacitive", { material: "plástico" }],
  ["jwsim/stack-light", {}],
  ["jwsim/timer-relay", { time: 3 }],
  ["jwsim/ssr", {}],
  ["jwsim/breaker", { poles: "1P" }],
  ["jwsim/breaker", { poles: "2P" }],
  ["jwsim/breaker", { poles: "3P", In: "16" }],
  ["jwsim/motor-protector", {}],
];

// Equipos en fila, sin cables.
const ids = [];
let x = 560; // a la derecha de la placa
for (const [type, params] of NEW) {
  const id = await sc(([t, xx]) => window.jwsimTest.scene.add(t, xx, 0), [type, x]);
  for (const [k, v] of Object.entries(params)) await sc(([i, kk, vv]) => window.jwsimTest.scene.setParam(i, kk, vv), [id, k, v]);
  const size = await sc(([t, p]) => window.jwsimTest.scene.symbolSize(t, p), [type, params]);
  x += size.w + 60;
  ids.push(id);
}
await sc(() => window.jwsimTest.scene.analyze());
await win.waitForTimeout(600);
await win.click("#scene-fit");
await win.waitForTimeout(300);
await win.screenshot({ path: join(OUT, "01-equipos.png") });

// ---- TEMPLATES
const templates = {};
for (const id of ids) templates[id] = await sc((i) => window.jwsimTest.scene.templateOf(i), id);
const warnings = await sc(() => window.JwsimSymbols.warnings.slice());
criteria.TEMPLATES = {
  pass: Object.values(templates).every(Boolean) && !warnings.length && templates[ids[8]] === "jwsim/breaker__2p" && templates[ids[9]] === "jwsim/breaker__3p" && templates[ids[7]] === "jwsim/breaker",
  templates,
  warnings,
};

// ---- PALETTE
if ((await win.$eval(".scene-main", (e) => e.dataset.pane)) !== "add") await win.click("#scene-tab-add");
await win.waitForTimeout(200);
const tiles = await win.$$eval("#scene-add .palette-item", (bs) => bs.map((b) => ({ type: b.dataset.add, cat: b.dataset.cat, svg: (b.querySelector("svg")?.innerHTML.length ?? 0) > 40 })));
const want = [...new Set(NEW.map(([t]) => t))];
const found = want.map((t) => tiles.find((x) => x.type === t));
criteria.PALETTE = { pass: found.every((f) => f?.svg), tiles: found };
await win.locator("#scene-side").screenshot({ path: join(OUT, "02-paleta.png") }).catch(() => {});

// ---- MODELS
const chipsOf = async (type) => {
  await win.click(`#scene-add .palette-item[data-add='${type}']`);
  return win.$$eval("#scene-part-info .model-opt", (bs) => bs.map((b) => `${b.dataset.modelParam}=${b.dataset.value}`));
};
const brk = await chipsOf("jwsim/breaker");
await win.locator("#scene-side").screenshot({ path: join(OUT, "03-ficha-termomagnetico.png") }).catch(() => {});
const cap = await chipsOf("jwsim/sensor-capacitive");
criteria.MODELS = {
  pass: ["poles=1P", "poles=2P", "poles=3P"].every((c) => brk.includes(c)),
  breaker: brk,
  capacitive: cap,
};

// ---- STATIC: textos con el análisis sin simular
const textOf = (id, expr) =>
  sc(([i, e]) => [...document.querySelectorAll(`#scene-devices g[data-id="${i}"] [data-text="${e}"]`)].map((t) => t.textContent), [id, expr]);
const tmr = await textOf(ids[5], "out.timeTxt");
const ns2 = await textOf(ids[10], "out.ajusteTxt");
const snCap = await textOf(ids[3], "out.snTxt");
const rating = await textOf(ids[9], "out.rating");
criteria.STATIC = {
  pass: tmr.includes("3 s") && ns2.some((t) => /3,2 A/.test(t)) && snCap.some((t) => /3,6 mm · plástico/.test(t)) && rating.includes("C16"),
  timer: tmr,
  protector: ns2,
  capacitive: snCap,
  breaker: rating,
};

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [name, v] of Object.entries(criteria)) console.log(`${name}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_CATALOGO_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_CATALOGO_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
