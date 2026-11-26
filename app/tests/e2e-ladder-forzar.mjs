// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Forzar desde el Ladder en vivo (Electron + Playwright), lección IEC 03 en LD:
//   MENU_EN_EL_CONTACTO  clic derecho en el contacto de I0.0 abre Force True /
//                        Force False / Release
//   FORCE_TRUE_ENTRADA   Force True en I0.0 arranca la marcha (Q0.0 en 1) y el
//                        contacto queda marcado como forzado
//   FORCE_FALSE_SALIDA   Force False en la bobina de Q0.0 la apaga aunque la
//                        lógica la tenga en 1
//   RELEASE              Release libera las dos señales
// Capturas en build/gates/ladder-forzar/.
//   cd app && xvfb-run -a node tests/e2e-ladder-forzar.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "ladder-forzar");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];

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
// Centro del recuadro de una señal en el diagrama.
const at = (sig) => t((s) => {
  const r = document.querySelector(`#plc-diagram-body [data-sig="${s}"]`)?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}, sig);
const menuAt = async (sig) => {
  const p = await at(sig);
  await win.mouse.click(p.x, p.y, { button: "right" });
  return t(() => {
    const m = document.getElementById("plc-force-menu");
    return m.hidden ? null : [...m.querySelectorAll("button")].map((b) => b.textContent);
  });
};
const pick = (v) => win.click(`#plc-force-menu button[data-v="${v}"]`);

try {
  await t(() => window.openLessonById("iec-03", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await until(() => at("I0_0"), 10000);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  await win.waitForTimeout(1000);

  const items = await menuAt("I0_0");
  criteria.MENU_EN_EL_CONTACTO = { pass: !!items && items.join("|") === "Force True|Force False|Release (liberar)", items };
  await pick("1");
  const q = await until(() => t(() => window.jwsimTest.level("Q0_0")), 3000);
  const mark = await t(() => document.querySelector('#plc-diagram-body [data-sig="I0_0"]').classList.contains("forced"));
  criteria.FORCE_TRUE_ENTRADA = { pass: !!q && mark && (await t(() => window.jwsimTest.forced("I0_0"))) === 1, q0: !!q, marcado: mark };
  await win.screenshot({ path: join(OUT, "forzado.png") });

  await menuAt("Q0_0");
  await pick("0");
  const off = await until(() => t(() => !window.jwsimTest.level("Q0_0")), 3000);
  criteria.FORCE_FALSE_SALIDA = { pass: !!off, q0: !off };

  await menuAt("Q0_0");
  await pick("x");
  await menuAt("I0_0");
  await pick("x");
  const freed = await t(() => window.jwsimTest.forced("I0_0") === undefined && window.jwsimTest.forced("Q0_0") === undefined && !document.querySelector("#plc-diagram-body [data-sig].forced"));
  criteria.RELEASE = { pass: freed };
} finally {
  criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
  await app.close();
}
let failed = 0;
for (const [k, v] of Object.entries(criteria)) {
  console.log(`${v.pass ? "OK   " : "FALLA"} ${k} ${JSON.stringify(v)}`);
  if (!v.pass) failed++;
}
process.exit(failed ? 1 : 0);
