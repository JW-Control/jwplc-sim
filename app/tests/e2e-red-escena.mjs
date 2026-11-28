// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Red Ethernet de la escena en la app (alpha.19): un HMI Modbus TCP pregunta
// al JWPLC simulado (servidor Modbus TCP) sin salir a la PC.
//   CONECTA   el HMI queda «en línea» tras el arranque del Ethernet
//   VALORES   V1 muestra el holding 0 del PLC (segundos desde el arranque)
//   ESCRIBE   la consigna del HMI llega al PLC (vuelve en V2) y B1 enciende L1
// Sketch de prueba: app/tests/fixtures/red-hmi (servidor del package con eco).
// Capturas en build/gates/red-escena/.
//   xvfb-run -a node app/tests/e2e-red-escena.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "red-escena");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-red-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-red-ud-"));
const criteria = {};
let failed = 0;
const check = (name, ok, extra = {}) => {
  criteria[name] = { pass: !!ok, ...extra };
  console.log(`${ok ? "OK   " : "FALLA"} ${name} ${JSON.stringify(extra)}`);
  if (!ok) failed++;
};
createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args, env });
const win = await app.firstWindow();
const errors = [];
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
const hmi = () => t(() => window.jwsimTest.scene.snapshot()?.devices?.find((d) => d.id === "HMI1")?.outputs ?? null);
try {
  await t((d) => window.jwsimTest.openSketchDir(d), join(APP, "tests", "fixtures", "red-hmi"));
  await win.click('.mtab[data-tab="schematic"]');
  await t(() => {
    const s = window.jwsimTest.scene;
    s.add("jwsim/power-24vdc", 0, 0, "PS1");
    s.add("jwsim/hmi-modbus-tcp", 640, 0, "HMI1");
    s.wire("PS1.+V1", "plc.24VDC");
    s.wire("PS1.-V1", "plc.M0");
    s.wire("PS1.+V2", "HMI1.+");
    s.wire("PS1.-V2", "HMI1.-");
  });
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  const on = await until(() => hmi().then((o) => (o?.connected ? o : null)), 30000);
  check("CONECTA", !!on, { estado: (await hmi())?.estado });
  const v = await until(() => hmi().then((o) => (o?.v1 >= 2 ? o : null)), 10000);
  check("VALORES", !!v, { v1: (await hmi())?.v1 });
  await t(() => window.jwsimTest.scene.act("HMI1", "consigna", 321));
  await t(() => window.jwsimTest.scene.act("HMI1", "b1", true));
  const w = await until(() => hmi().then((o) => (o?.v2 === 321 && o?.l1 ? o : null)), 8000);
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(OUT, "1-hmi-en-linea.png") });
  check("ESCRIBE", !!w, { v2: (await hmi())?.v2, l1: (await hmi())?.l1 });
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
if (errors.length) check("SIN_ERRORES", false, { errors: errors.slice(0, 3) });
writeFileSync(join(OUT, "JWSIM_RED_ESCENA.json"), JSON.stringify({ criteria, errors }, null, 2));
console.log(failed ? `${failed} fallas` : "todo OK");
process.exit(failed ? 1 : 0);
