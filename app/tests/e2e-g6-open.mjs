// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G6 SIMULATE_BUTTON sobre Electron (Playwright), lo que hace el
// botón «Simular» del OpenPLC Editor:
//   OPEN_FROM_ARG      la app arranca con --jwsim-open y abre el proyecto
//   OPEN_IN_RUNNING    con la app abierta, otro lanzamiento abre el proyecto en
//                      ella y termina
//   SAME_PROJECT_KEPT  repetir con el mismo proyecto no lo recarga
//   MANUAL_INSTANCE    un lanzamiento sin la opción sigue abriendo otra app
// Informe en build/gates/JWSIM_G6_OPEN_E2E.json.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g6-open.mjs
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const electronBin = createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
const sandbox = process.platform === "linux" && process.getuid?.() === 0 ? ["--no-sandbox"] : [];
const criteria = {};

const copy = (name) => {
  const dir = join(workspace, name);
  cpSync(join(ROOT, "tests", "openplc", "blink"), dir, { recursive: true, filter: (p) => !/[\/]build([\/]|$)/.test(p) });
  return dir;
};
const uno = copy("proyecto uno");
const dos = copy("proyecto dos");
const base = [...sandbox, APP, `--user-data-dir=${userData}`];

// Un segundo lanzamiento como el del editor: sin Playwright, y debe terminar solo.
const relaunch = (args) =>
  new Promise((done) => {
    const child = spawn(electronBin, [...base, ...args], { env, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, 20000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      done(code);
    });
  });

const app = await electron.launch({ args: [...base, `--jwsim-open=${uno}`], env });
const win = await app.firstWindow();
const sketchDir = () => win.$eval("#sb-sketch", (e) => e.textContent);
const until = async (want) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if ((await sketchDir()) === want) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

try {
  criteria.OPEN_FROM_ARG = { pass: await until(uno), shown: await sketchDir() };

  const code = await relaunch([`--jwsim-open=${dos}`]);
  criteria.OPEN_IN_RUNNING = { pass: code === 0 && (await until(dos)), exit_code: code, shown: await sketchDir() };

  await win.evaluate(() => {
    document.title = "sin recargar";
  });
  const again = await relaunch([`--jwsim-open=${dos}`]);
  await new Promise((r) => setTimeout(r, 1500));
  const title = await win.title();
  criteria.SAME_PROJECT_KEPT = { pass: again === 0 && title === "sin recargar", exit_code: again, title };

  const manual = await relaunch([]);
  criteria.MANUAL_INSTANCE = { pass: manual === null, still_running_after_20s: manual === null };
} finally {
  await app.close();
}

const pass = Object.values(criteria).every((c) => c.pass);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "JWSIM_G6_OPEN_E2E.json"), `${JSON.stringify({ pass, criteria }, null, 2)}\n`);
console.log(JSON.stringify({ pass, criteria }, null, 2));
process.exit(pass ? 0 : 1);
