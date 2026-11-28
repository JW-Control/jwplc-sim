// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Unidad 8 del curso (Ethernet y Modbus TCP) en la app, lección 47:
//   ABRE      la lección 47 trae la PC con JW Modbus Tool en el Esquema
//   EN_LINEA  al ejecutar, la PC se conecta al JWPLC (servidor Modbus TCP)
//   BOBINA    un clic en la bobina 00001 de la PC arranca la banda (KM1)
//   CAJAS     el sensor B1 cuenta cajas y la PC las ve en el 40001
//   HOLDING   arrastrar el valor del 40003 lo escribe en el JWPLC
// Capturas en build/gates/curso-red/.
//   xvfb-run -a node app/tests/e2e-curso-red.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "curso-red");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-cred-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-cred-ud-"));
const criteria = {};
const errors = [];
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
const dev = (id) => t((i) => window.jwsimTest.scene.snapshot()?.devices?.find((d) => d.id === i)?.outputs ?? null, id);
try {
  await t(() => window.openLessonById("curso-47"));
  await until(() => t(() => window.jwsimTest.scene.snapshot()?.devices?.some((d) => d.id === "PC1")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.click('.mtab[data-tab="schematic"]');
  await win.waitForTimeout(500);
  const pc = win.locator('#scene-root .dev[data-id="PC1"]').first();
  check("ABRE", (await pc.count()) > 0);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  const on = await until(() => dev("PC1").then((o) => (o?.connected ? o : null)), 30000);
  check("EN_LINEA", !!on, { estado: (await dev("PC1"))?.estado });
  await pc.locator('[data-action="c0"]').click();
  const km = await until(() => dev("KM1").then((o) => (o?.closed ? o : null)), 5000);
  check("BOBINA", !!km, { c0: (await dev("PC1"))?.c0 });
  for (let i = 0; i < 2; i++) {
    await t(() => window.jwsimTest.scene.act("B1", "target", true));
    await win.waitForTimeout(400);
    await t(() => window.jwsimTest.scene.act("B1", "target", false));
    await win.waitForTimeout(400);
  }
  const cajas = await until(() => dev("PC1").then((o) => (o?.h0 === 2 ? o : null)), 5000);
  check("CAJAS", !!cajas, { h0: (await dev("PC1"))?.h0 });
  const h2 = pc.locator('[data-action="h2"]');
  const b = await h2.boundingBox();
  await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await win.mouse.down();
  await win.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 8 });
  await win.mouse.up();
  const w = await until(() => dev("PC1").then((o) => (o?.h2 > 0 ? o : null)), 5000);
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(OUT, "1-leccion-47.png") });
  check("HOLDING", !!w, { h2: (await dev("PC1"))?.h2 });
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
if (errors.length) check("SIN_ERRORES", false, { errors: errors.slice(0, 3) });
writeFileSync(join(OUT, "JWSIM_CURSO_RED.json"), JSON.stringify({ criteria, errors }, null, 2));
console.log(failed ? `${failed} fallas` : "todo OK");
process.exit(failed ? 1 : 0);
