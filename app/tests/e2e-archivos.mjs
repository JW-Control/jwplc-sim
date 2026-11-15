// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de los archivos adicionales del sketch (Electron + Playwright):
//   ADD_FROM_TAB_BAR   el «+» de las pestañas crea motor.h en la carpeta,
//                      con resaltado C++ y #pragma once
//   ADD_DEFAULTS       sin extensión crea una pestaña .ino; README.md se abre
//                      como Markdown y notas.txt como texto
//   REJECT_INVALID     espacios, carpetas, tipos no admitidos y un nombre ya
//                      usado (sin distinguir mayúsculas) no crean nada
//   BUILD_WITH_EXTRA   el .ino incluye motor.h y llama a una función de
//                      motor.cpp: compila, corre y escribe por Serial; las
//                      notas .md/.txt no estorban
//   EXTERNAL_ADD_DELETE  un archivo creado o borrado fuera de la app aparece
//                      o desaparece de las pestañas
//   DELETE_FILE        × lo manda a la papelera y quita la pestaña; el .ino
//                      principal no tiene × y no se puede eliminar
// Informe en build/gates/JWSIM_ARCHIVOS_E2E.json y capturas en build/gates/archivos/.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "archivos");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

createRequire(import.meta.url)("electron");
log(`iniciando Electron (carpeta de trabajo temporal: ${workspace})`);
const args = [APP];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE; // desde la terminal de VS Code, Electron arrancaría como Node
// Perfil propio (localStorage, cachés): la prueba no toca las preferencias
// de la app del usuario (alto de la ficha, panel lateral…).
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const app = await electron.launch({ args: [...args, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
// Tamaño fijo: con un perfil nuevo la ventana abre más chica.
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active:has-text('sketch_')", { timeout: 30000 });
const dir = await win.evaluate(() => window.jwsimTest.sketchDir());
const main = `${dir.split(/[\\/]/).pop()}.ino`;
log(`sketch nuevo: ${dir}`);

const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return true;
    await win.waitForTimeout(50);
  }
  return false;
};
const names = () => win.evaluate(() => window.jwsimTest.fileNames());
const tabNames = () => win.$$eval("#tabs .tab", (ts) => ts.map((t) => t.dataset.file));
const language = () => win.evaluate(() => window.jwsimTest.language());
const typeName = async (name) => {
  await win.click("#tab-add");
  await win.fill("#tab-new-name", name);
  await win.press("#tab-new-name", "Enter");
};

// ---- ADD_FROM_TAB_BAR
await typeName("motor.h");
await win.waitForSelector(".tab.active[data-file='motor.h']", { timeout: 5000 });
const motorH = join(dir, "motor.h");
criteria.ADD_FROM_TAB_BAR = {
  pass: existsSync(motorH) && /#pragma once/.test(readFileSync(motorH, "utf8")) && (await language()) === "cpp" && (await tabNames()).includes("motor.h"),
  on_disk: existsSync(motorH),
  language: await language(),
  tabs: await tabNames(),
};
await win.screenshot({ path: join(OUT, "01-motor-h.png") });

// ---- ADD_DEFAULTS
await typeName("util");
await win.waitForSelector(".tab.active[data-file='util.ino']", { timeout: 5000 });
await typeName("README.md");
await win.waitForSelector(".tab.active[data-file='README.md']", { timeout: 5000 });
const mdLang = await language();
await win.evaluate(() => window.jwsimTest.addFile("notas.txt"));
const txtLang = await language();
criteria.ADD_DEFAULTS = {
  pass: existsSync(join(dir, "util.ino")) && existsSync(join(dir, "README.md")) && mdLang === "markdown" && txtLang === "plaintext",
  util_ino: existsSync(join(dir, "util.ino")),
  readme_language: mdLang,
  txt_language: txtLang,
};

// ---- REJECT_INVALID
const before = await names();
const rejected = {};
for (const bad of ["mi motor.h", "sub/x.h", "app.exe", "MOTOR.H", ".h"]) {
  rejected[bad] = await win.evaluate((n) => window.jwsimTest.addFile(n).then(() => "creado", (e) => String(e.message ?? e)), bad);
}
await typeName("con espacio.h");
const inputInvalid = await win.$eval("#tab-new-name", (e) => e.classList.contains("invalid")).catch(() => false);
await win.press("#tab-new-name", "Escape");
const after = await names();
criteria.REJECT_INVALID = {
  pass: Object.values(rejected).every((r) => r !== "creado") && inputInvalid && JSON.stringify(before) === JSON.stringify(after) && !existsSync(join(dir, "app.exe")),
  rejected,
  input_marked_invalid: inputInvalid,
  files: after,
};

// ---- BUILD_WITH_EXTRA
await win.evaluate(() => window.jwsimTest.addFile("motor.cpp"));
const setModel = (name, text) => win.evaluate(([n, t]) => window.monaco.editor.getModels().find((m) => m.uri.path.endsWith(`/${n}`)).setValue(t), [name, text]);
await setModel("motor.h", "#pragma once\n\n#include <Arduino.h>\n\nint doble(int x);\n");
await setModel("motor.cpp", '#include "motor.h"\n\nint doble(int x) { return 2 * x; }\n');
await setModel("util.ino", "int triple(int x) { return 3 * x; }\n");
await setModel(main, '#include "motor.h"\n\nvoid setup() { Serial.begin(115200); }\n\nvoid loop() {\n  Serial.printf("ARCHIVOS %d %d\\n", doble(21), triple(5));\n  delay(200);\n}\n');
await setModel("README.md", "# Notas\n\nEsto no es C++: no debe compilarse.\n");
await win.click("#btn-run");
const running = await win.waitForSelector("#status.running", { timeout: 600000 }).then(() => true, () => false);
const printed = running && (await until(() => win.$eval("#console", (e) => /ARCHIVOS 42 15/.test(e.textContent)), 8000));
criteria.BUILD_WITH_EXTRA = {
  pass: running && printed,
  running,
  serial_ok: printed,
  build_log_tail: (await win.$eval("#build-log", (e) => e.textContent)).split("\n").slice(-4),
};
await win.screenshot({ path: join(OUT, "02-compilado.png") });
await win.click("#btn-stop");

// ---- EXTERNAL_ADD_DELETE
const ext = join(dir, "externo.h");
writeFileSync(ext, "#pragma once\n");
const appeared = await until(async () => (await tabNames()).includes("externo.h"), 3000);
rmSync(ext);
const gone = await until(async () => !(await tabNames()).includes("externo.h"), 3000);
criteria.EXTERNAL_ADD_DELETE = { pass: appeared && gone, appeared, gone };

// ---- DELETE_FILE
await win.evaluate(() => window.jwsimTest.showFile("notas.txt"));
const mainHasX = await win.$$eval(`#tabs .tab[data-file='${main}'] .tab-close`, (x) => x.length > 0);
const notasHasX = await win.$$eval("#tabs .tab[data-file='notas.txt'] .tab-close", (x) => x.length > 0);
const deleted = await win.evaluate(() => window.jwsimTest.deleteFile("notas.txt"));
const tabGone = !(await tabNames()).includes("notas.txt");
const mainDelete = await win.evaluate((n) => window.jwsimTest.deleteFile(n), main);
criteria.DELETE_FILE = {
  pass: deleted && tabGone && !existsSync(join(dir, "notas.txt")) && !mainHasX && notasHasX && !mainDelete && existsSync(join(dir, main)),
  deleted,
  tab_gone: tabGone,
  main_has_close: mainHasX,
  main_deleted: mainDelete,
};
await win.screenshot({ path: join(OUT, "03-final.png") });

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_ARCHIVOS_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_ARCHIVOS_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
