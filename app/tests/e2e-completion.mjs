// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del autocompletado del editor (Electron + Playwright): se
// escribe en Monaco, se abre la lista de sugerencias y se leen sus filas.
//   DIGITAL_READ   digitalRead( ofrece I0_0…I0_7 y el alias MARCHA, nada más
//   DIGITAL_WRITE  digitalWrite( ofrece Q0_x y el alias; tras la coma, HIGH/LOW
//   BOTONERA       JWPLC_Buttons.pressed( ofrece los BTN_*
//   MIEMBROS       JWPLC_Buzzer. ofrece beep y no los métodos del runtime (begin)
//   SIN_RUIDO      fuera de una llamada no aparecen palabras sueltas del archivo
//   FIRMA          al abrir el paréntesis se muestra la firma de digitalWrite
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-completion.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "completion");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace } });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active:has-text('sketch_')", { timeout: 30000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Escribe el texto con el cursor al final y devuelve las filas de la lista.
async function suggest(code) {
  await win.evaluate((text) => {
    const ed = window.monaco.editor.getEditors()[0];
    ed.setValue(text);
    const m = ed.getModel();
    const last = m.getLineCount();
    ed.setPosition({ lineNumber: last, column: m.getLineMaxColumn(last) });
    ed.focus();
    ed.trigger("prueba", "editor.action.triggerSuggest", {});
  }, code);
  await sleep(700);
  return win.$$eval(".suggest-widget .monaco-list-row .label-name", (els) => els.map((e) => e.textContent.trim()));
}

const BASE = `#define MARCHA I0_0
#define BOMBA Q0_3
// zanahoria: palabra suelta en un comentario
void setup() {
}
void loop() {
  `;

try {
  const rd = await suggest(`${BASE}digitalRead(`);
  const inputs = ["I0_0", "I0_1", "I0_2", "I0_3", "I0_4", "I0_5", "I0_6", "I0_7"];
  criteria.DIGITAL_READ = { pass: rd.includes("MARCHA") && inputs.every((p) => rd.includes(p)) && rd.every((l) => l === "MARCHA" || inputs.includes(l)), filas: rd };
  await win.screenshot({ path: join(OUT, "digitalRead.png") });

  const wr = await suggest(`${BASE}digitalWrite(`);
  const wr2 = await suggest(`${BASE}digitalWrite(BOMBA, `);
  criteria.DIGITAL_WRITE = {
    pass: wr.includes("BOMBA") && wr.includes("Q0_0") && !wr.some((l) => /^I0_/.test(l)) && wr2.join() === "HIGH,LOW",
    pin: wr,
    valor: wr2,
  };

  const bt = await suggest(`${BASE}if (JWPLC_Buttons.pressed(`);
  criteria.BOTONERA = { pass: ["BTN_OK", "BTN_ESC", "BTN_UP"].every((b) => bt.includes(b)) && bt.every((l) => /^BTN_/.test(l)), filas: bt };

  const bz = await suggest(`${BASE}JWPLC_Buzzer.`);
  criteria.MIEMBROS = { pass: bz.includes("beep") && !bz.includes("begin"), filas: bz };

  const gen = await suggest(`${BASE}dig`);
  criteria.SIN_RUIDO = { pass: gen.includes("digitalRead") && gen.includes("digitalWrite") && !gen.includes("zanahoria"), filas: gen.slice(0, 12) };

  await win.evaluate(() => {
    const ed = window.monaco.editor.getEditors()[0];
    ed.trigger("prueba", "hideSuggestWidget", {});
  });
  await win.evaluate((text) => {
    const ed = window.monaco.editor.getEditors()[0];
    ed.setValue(text);
    const m = ed.getModel();
    ed.setPosition({ lineNumber: m.getLineCount(), column: m.getLineMaxColumn(m.getLineCount()) });
    ed.focus();
    ed.trigger("prueba", "editor.action.triggerParameterHints", {});
  }, `${BASE}digitalWrite(Q0_0, `);
  await sleep(700);
  const hint = await win.$eval(".parameter-hints-widget", (e) => e.textContent).catch(() => "");
  criteria.FIRMA = { pass: /digitalWrite\(uint8_t pin, uint8_t valor\)/.test(hint), texto: hint.slice(0, 160) };
  await win.screenshot({ path: join(OUT, "firma.png") });
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
writeFileSync(join(ROOT, "build", "gates", "JWSIM_COMPLETION_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", criteria }, null, 2) + "\n");
console.log(`AUTOCOMPLETADO=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
