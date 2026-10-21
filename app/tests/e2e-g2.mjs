// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del MVP de G2 sobre Electron (Playwright):
//   C1 arranque en frío < 5 s hasta el editor con el sketch cargado
//   C2 Ejecutar compila y corre 02_io_basic; I0.0 → Q0.0 en la placa
//   C3 un error de compilación aparece en la línea correcta del .ino
// Capturas en build/gates/g2/. En Linux sin pantalla: xvfb-run -a node ...
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const OUT = resolve(APP, "..", "build", "gates", "g2");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};

const t0 = Date.now();
const args = [APP];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace } });
const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active:has-text('02_io_basic.ino')", { timeout: 30000 });
const coldMs = Date.now() - t0;
criteria.C1_cold_start = { pass: coldMs < 5000, ms: coldMs };
await win.screenshot({ path: join(OUT, "01-inicio.png") });

// C2: compilar y ejecutar; accionar I0.0.
await win.click("#btn-run");
await win.waitForSelector("#status.running", { timeout: 600000 });
await win.waitForFunction(() => document.getElementById("clock").textContent !== "00:00:00.000", null, { timeout: 10000 });
await win.waitForTimeout(800);
await win.click(".io.input[data-signal='I0_0']");
let q0 = false;
try {
  await win.waitForSelector(".io.output.on[data-signal='Q0_0']", { timeout: 3000 });
  q0 = true;
} catch {}
// 02_io_basic solo copia I0_0 en Q0_0: ninguna otra salida debe encenderse.
const others = await win.$$eval(".io.output.on", (els) => els.map((e) => e.dataset.signal).filter((s) => s !== "Q0_0"));
await win.waitForTimeout(400);
await win.screenshot({ path: join(OUT, "02-ejecutando.png") });
await win.click(".io.input[data-signal='I0_0']");
let q0off = false;
try {
  await win.waitForSelector(".io.output:not(.on)[data-signal='Q0_0']", { timeout: 3000 });
  q0off = true;
} catch {}
criteria.C2_run_io = { pass: q0 && q0off && others.length === 0, q0_on: q0, q0_off: q0off, other_outputs_on: others };

// C3: error sembrado en la línea 4 de un sketch nuevo.
await win.click("#btn-stop");
await win.click("#btn-new");
await win.waitForSelector(".tab.active:has-text('sketch_')");
await win.evaluate(() => {
  const m = window.monaco.editor.getModels().find((x) => x.uri.path.endsWith(".ino"));
  m.setValue("void setup()\n{\n  Serial.begin(115200);\n  int x = ;\n}\n\nvoid loop()\n{\n}\n");
});
await win.click("#btn-run");
await win.waitForSelector("#status.error", { timeout: 600000 });
const first = await win.$eval("#problems li.error", (e) => e.textContent);
const markers = await win.evaluate(() => window.monaco.editor.getModelMarkers({}).map((m) => m.startLineNumber));
criteria.C3_error_mapping = { pass: /\.ino:4:/.test(first) && markers.includes(4), first, markers };
await win.screenshot({ path: join(OUT, "03-error.png") });

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(OUT, "e2e.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", criteria }, null, 2) + "\n");
console.log(`G2 MVP E2E=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
