// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Red Ethernet de la escena en la app (alpha.19): una PC con JW Modbus Tool pregunta
// al JWPLC simulado (servidor Modbus TCP) sin salir a la PC.
//   CONECTA   la PC queda «en línea» tras el arranque del Ethernet
//   VALORES   el holding 1 (40001) muestra el registro 0 del PLC (segundos desde el arranque)
//   ESCRIBE   escribir el holding 5 vuelve en el 2 e invertir la bobina 5 enciende la 1
// Sketch de prueba: app/tests/fixtures/red-modbus-tcp (servidor del package con eco).
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
const pc = () => t(() => window.jwsimTest.scene.snapshot()?.devices?.find((d) => d.id === "PC1")?.outputs ?? null);
try {
  await t((d) => window.jwsimTest.openSketchDir(d), join(APP, "tests", "fixtures", "red-modbus-tcp"));
  await win.click('.mtab[data-tab="schematic"]');
  await t(() => {
    const s = window.jwsimTest.scene;
    s.add("jwsim/power-24vdc", 0, 0, "PS1");
    s.add("jwsim/pc-modbus-tcp", 640, 0, "PC1");
    s.wire("PS1.+V1", "plc.24VDC");
    s.wire("PS1.-V1", "plc.M0");
  });
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  const on = await until(() => pc().then((o) => (o?.connected ? o : null)), 30000);
  check("CONECTA", !!on, { estado: (await pc())?.estado });
  const v = await until(() => pc().then((o) => (o?.h0 >= 2 ? o : null)), 10000);
  check("VALORES", !!v, { h0: (await pc())?.h0 });
  await t(() => window.jwsimTest.scene.act("PC1", "h4", 321));
  await t(() => window.jwsimTest.scene.act("PC1", "c4", true));
  const w = await until(() => pc().then((o) => (o?.h1 === 321 && o?.c0 ? o : null)), 8000);
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(OUT, "1-pc-modbus-tool.png") });
  check("ESCRIBE", !!w, { h1: (await pc())?.h1, c0: (await pc())?.c0 });
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
if (errors.length) check("SIN_ERRORES", false, { errors: errors.slice(0, 3) });
writeFileSync(join(OUT, "JWSIM_RED_ESCENA.json"), JSON.stringify({ criteria, errors }, null, 2));
console.log(failed ? `${failed} fallas` : "todo OK");
process.exit(failed ? 1 : 0);
