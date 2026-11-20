// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de recarga externa en caliente de archivos .jwsim (Task 5).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";
import { normalizeProject } from "../../cli/lib/scene-normalize.mjs";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
createRequire(import.meta.url)("electron");

const dir = mkdtempSync(join(tmpdir(), "jwsim-watch-"));
const sketchDir = join(dir, "s");
mkdirSync(sketchDir, { recursive: true });
writeFileSync(join(sketchDir, "s.ino"), "void setup(){}\nvoid loop(){}\n", "utf8");
const projFile = join(dir, "demo.jwsim");

const writeProj = (extraIds = []) => {
  const devices = [
    { id: "PS1", type: "power-24vdc" },
    { id: "H1", type: "lamp" },
    ...extraIds.map((id) => ({ id, type: "lamp" })),
  ];
  const p = normalizeProject({ name: "WatchDemo", program: { kind: "arduino", sketch: "./s/s.ino" }, scene: { devices, wiring: [] } });
  writeFileSync(projFile, JSON.stringify(p, null, 2) + "\n", "utf8");
};
writeProj([]);

const env = { ...process.env, JWSIM_WORKSPACE: dir, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`], env });
const win = await app.firstWindow();

const until = async (fn, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await win.waitForTimeout(80);
  }
  return false;
};

try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
  await win.evaluate((f) => window.jwsimTest.openProjectFile(f), projFile);
  await until(() => win.evaluate(() => window.jwsimTest.scene.spec().devices.length === 2));

  // 1. Limpio: edición externa en disco se recarga automáticamente
  writeProj(["H2"]);
  const autoReloaded = await until(() =>
    win.evaluate(() => window.jwsimTest.scene.spec().devices.some((d) => d.id === "H2")),
  );
  assert.equal(autoReloaded, true, "debió recargar H2 automáticamente desde disco");

  // 2. Sucio: edición local en la escena impide sobrescritura y muestra aviso no bloqueante
  await win.evaluate(() => window.jwsimTest.scene.add("jwsim/lamp", 600, 0, "H_LOCAL"));
  await win.waitForTimeout(100);
  writeProj(["H2", "H4"]);
  const btnShown = await until(() => win.locator("#sb-project-reload").isVisible().catch(() => false));
  assert.equal(btnShown, true, "debió mostrar el botón no bloqueante #sb-project-reload");
  const stillHasLocal = await win.evaluate(() => window.jwsimTest.scene.spec().devices.some((d) => d.id === "H_LOCAL"));
  assert.equal(stillHasLocal, true, "no debe descartar H_LOCAL automáticamente");

  // 3. Clic en Recargar aplica la versión en disco
  await win.click("#sb-project-reload");
  const reloadedManual = await until(() =>
    win.evaluate(() => window.jwsimTest.scene.spec().devices.some((d) => d.id === "H4")),
  );
  assert.equal(reloadedManual, true, "debió cargar H4 tras hacer clic en Recargar");

  // 4. Guardar desde la app no dispara falsa alerta de cambio externo
  await win.evaluate(() => window.jwsimTest.saveProject());
  await win.waitForTimeout(300);
  const falseBanner = await win.locator("#sb-project-reload").isVisible().catch(() => false);
  assert.equal(falseBanner, false, "guardar desde la app no debe disparar #sb-project-reload");
  assert.ok(readFileSync(projFile, "utf8").includes("H4"));
  console.log("JWSIM_PROJECT_WATCH_E2E=PASS");
} finally {
  await app.close();
}
