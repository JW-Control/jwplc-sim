// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G8 (JWSIM_G8_3D_SCENES) sobre Electron (Playwright): la vista
// 3D con el proyecto tests/projects/planta-3d (cinta, tanque, puerta y
// cilindro manejados por el firmware).
//   VIEW_3D     la pestaña 3D arma los cuatro equipos de planta con sus
//               sensores enlazados (balizas)
//   COSIM_3D    en marcha: S1 arranca la cinta, la pieza llega al final y
//               sale el cilindro, la bomba llena el tanque y la persona abre
//               la puerta; la vista sigue a la simulación (capturas)
//   FPS         ≥ 30 cuadros por segundo con la simulación en marcha
// Informe en build/gates/JWSIM_G8_3D_SCENES.json y capturas en build/gates/g8/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g8-3d.mjs
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g8");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const log = (m) => console.log(`[e2e] ${m}`);
const criteria = {};

const projDir = join(workspace, "planta-3d");
cpSync(join(ROOT, "tests", "projects", "planta-3d"), projDir, { recursive: true });

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};
const out = async (id, k) => t(([i, key]) => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === i)?.outputs?.[key], [id, k]);
const shot = (name) => win.locator(".board-card").screenshot({ path: join(OUT, name) });

try {
  await t((f) => window.jwsimTest.openProjectFile(f), join(projDir, "planta-3d.jwsim"));
  await t(() => window.jwsimTest.scene.view("3d"));
  await sleep(1500);
  const objs = await t(() => window.jwsimTest.scene.view3d());
  const byId = Object.fromEntries(objs.map((o) => [o.id, o]));
  criteria.VIEW_3D = {
    pass: objs.length === 4 && byId.C1?.beacons === 1 && byId.T1?.beacons === 2 && byId.P1?.beacons === 3 && !!byId.Y1,
    objetos: objs,
  };
  await shot("3d-reposo.png");

  log("compilando y ejecutando el proyecto");
  await win.click("#btn-run");
  await until(async () => (await t(() => window.jwsimTest.status())) === "running", 90000);
  await t(() => window.jwsimTest.scene.view("3d"));
  // La escena co-simulada ya corre (primera instantánea con «planta lista»).
  await until(async () => (await t(() => window.jwsimTest.scene.snapshot()?.t_ms ?? 0)) > 300, 20000);
  let km1 = false;
  for (let i = 0; i < 3 && !km1; i++) {
    await t(() => window.jwsimTest.scene.act("S1", "press", true));
    await sleep(400);
    await t(() => window.jwsimTest.scene.act("S1", "press", false));
    km1 = await until(async () => (await out("KM1", "closed")) === true, 2000);
  }
  criteria.MARCHA = { pass: km1, km1 };
  await t(() => window.jwsimTest.scene.act("P1", "persona", true));
  const pieza = await until(async () => (await out("Y1", "position")) > 0.5, 15000);
  await shot("3d-cilindro.png");
  const abierta = await until(async () => (await out("P1", "posicionPct")) > 60, 15000);
  const piezas = await out("C1", "piezas");
  const nivel = await out("T1", "nivelPct");
  await shot("3d-marcha.png");
  // Cuadros por segundo en marcha (promedio de tres lecturas).
  const fps = [];
  for (let i = 0; i < 3; i++) {
    await sleep(1100);
    fps.push(await t(() => window.jwsimTest.scene.fps3d()));
  }
  const avg = fps.reduce((a, b) => a + b, 0) / fps.length;
  criteria.COSIM_3D = { pass: pieza && abierta && Array.isArray(piezas) && nivel > 20, cilindro_salio: pieza, puerta_abrio: abierta, piezas, nivel };
  criteria.FPS = { pass: avg >= 30, fps, promedio: Math.round(avg) };
  await t(() => window.jwsimTest.scene.act("P1", "persona", false));
  await win.click("#btn-stop");
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
writeFileSync(join(ROOT, "build", "gates", "JWSIM_G8_3D_SCENES.json"), JSON.stringify({ gate: "JWSIM_G8_3D_SCENES", result: pass ? "PASS" : "FAIL", criteria }, null, 2) + "\n");
console.log(`JWSIM_G8_3D_SCENES=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
