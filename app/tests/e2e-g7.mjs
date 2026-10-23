// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G7 sobre Electron (Playwright): la escena en la app.
//   SCENE_LOAD    el proyecto de ejemplo del índice (index/src/marcha-cilindro)
//                 abre la vista Escena con la placa SVG y sus 10 dispositivos
//                 y 26 cables; sin simular, el análisis no da avisos
//   SCENE_COSIM   con la simulación en marcha, un clic en S1 (marcha) arranca
//                 KM1 por Q0_0, el auxiliar confirma por I0_2 y el cilindro
//                 cicla; los cables con tensión se colorean; S0 (parada) corta
//   SCENE_EDIT    detenida: agregar una lámpara desde la paleta, cablearla con
//                 clics en los bornes (se enciende en el análisis), arrastrar un
//                 dispositivo, quitar un cable (aviso de carga sin alimentación)
//                 y guardar el proyecto con la escena
//   SCENE_TFT     la pantalla de la placa en la escena muestra la TFT simulada
// Informe en build/gates/JWSIM_G7_E2E.json y capturas en build/gates/g7/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g7.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g7");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

// El proyecto de ejemplo se copia (la app guarda estado junto al proyecto).
const projDir = join(workspace, "marcha-cilindro");
cpSync(join(ROOT, "index", "src", "marcha-cilindro"), projDir, { recursive: true });
const projFile = join(projDir, "marcha-cilindro.jwsim");

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active", { timeout: 30000 });

const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(50);
  }
  return null;
};
const snap = () => t(() => window.jwsimTest.scene.snapshot());
const devOut = async (id, key) => (await snap())?.devices.find((d) => d.id === id)?.outputs?.[key];
const consoleText = () => win.$eval("#console", (e) => e.textContent);
const status = () => t(() => window.jwsimTest.status());
const clickAt = async ({ x, y }, holdMs = 0) => {
  await win.mouse.move(x, y);
  await win.mouse.down();
  if (holdMs) await win.waitForTimeout(holdMs);
  await win.mouse.up();
};
const actCenter = async (id) => {
  const el = await win.$(`#scene-devices > g[data-id="${id}"] .act`);
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const term = (end) => t((e) => window.jwsimTest.scene.termScreen(e), end);

try {
  // ---- SCENE_LOAD
  await t((f) => window.jwsimTest.openProjectFile(f), projFile);
  await until(() => t(() => !document.getElementById("scene-view").hidden));
  await until(() => win.$$eval("#scene-root .dev", (g) => g.length >= 11));
  await win.click("#scene-fit");
  const nDev = await win.$$eval("#scene-root .dev", (g) => g.length);
  const nWire = await win.$$eval("#scene-wires > g", (g) => g.length);
  const board = await win.$("#scene-board > g[data-id='plc'] svg");
  const a0 = await until(() => snap(), 5000);
  await win.screenshot({ path: join(OUT, "escena-cargada.png") });
  criteria.SCENE_LOAD = {
    ok: nDev === 11 && nWire === 26 && !!board && a0 && a0.findings.length === 0 && a0.faults.length === 0,
    devices: nDev,
    wires: nWire,
    findings: a0?.findings.length,
  };
  log(`SCENE_LOAD ${JSON.stringify(criteria.SCENE_LOAD)}`);

  // ---- SCENE_COSIM
  await win.click("#btn-run");
  await until(async () => (await status()) === "running", 120000);
  await until(async () => (await snap())?.t_ms > 900, 20000);
  await clickAt(await actCenter("S1"), 250);
  const km = await until(() => devOut("KM1", "closed"), 8000);
  const ciclo = await until(async () => /cilindro afuera, ciclo 1/.test(await consoleText()), 8000);
  const hot = await t(() => {
    const spec = window.jwsimTest.scene.spec();
    const i = spec.wiring.findIndex((w) => w.from === "PS1.L+");
    return window.jwsimTest.scene.wireColor(i);
  });
  const motor = await until(() => devOut("M1", "running"), 3000);
  await win.screenshot({ path: join(OUT, "escena-marcha.png") });
  await clickAt(await actCenter("S0"), 250);
  const parado = await until(async () => (await devOut("KM1", "closed")) === false, 8000);
  const parada = /ms parada/.test(await consoleText());
  criteria.SCENE_COSIM = { ok: !!km && !!ciclo && hot === "#ff5d5d" && !!motor && !!parado && parada, km1: !!km, ciclo: !!ciclo, cable_L_plus: hot, motor: !!motor, parada };
  log(`SCENE_COSIM ${JSON.stringify(criteria.SCENE_COSIM)}`);

  // ---- SCENE_TFT
  const tftLit = await t(() => {
    const c = document.getElementById("scene-tft");
    const d = c.getContext("2d").getImageData(0, 0, 320, 170).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n;
  });
  criteria.SCENE_TFT = { ok: tftLit > 200, lit_pixels: tftLit };
  log(`SCENE_TFT ${JSON.stringify(criteria.SCENE_TFT)}`);

  // ---- SCENE_EDIT
  await win.click("#btn-stop");
  await until(async () => (await status()) === "idle", 10000);
  await win.selectOption("#scene-add", "jwsim/lamp");
  const h = await until(() => t(() => window.jwsimTest.scene.spec().devices.find((d) => d.type === "jwsim/lamp" && d.id !== "H1")?.id));
  await t((id) => window.jwsimTest.scene.move(id, -200, 100), h);
  await win.click("#scene-fit");
  await clickAt(await term(`${h}.X1`));
  await clickAt(await term("PS1.L+"));
  await clickAt(await term(`${h}.X2`));
  await clickAt(await term("PS1.M"));
  const wired = await t(() => window.jwsimTest.scene.spec().wiring.length);
  log(`cables: ${wired}; nuevos: ${JSON.stringify(await t(() => window.jwsimTest.scene.spec().wiring.slice(26)))}`);
  await win.screenshot({ path: join(OUT, "escena-cableado.png") });
  const lit = await until(() => devOut(h, "lit"), 3000);
  // Arrastrar KM1 60 px a la derecha.
  const before = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "KM1").x);
  const kb = await (await win.$("#scene-root .dev[data-id='KM1'] .dev-box")).boundingBox();
  await win.mouse.move(kb.x + 8, kb.y + kb.height / 2);
  await win.mouse.down();
  await win.mouse.move(kb.x + 40, kb.y + kb.height / 2, { steps: 5 });
  await win.mouse.move(kb.x + 68, kb.y + kb.height / 2, { steps: 5 });
  await win.mouse.up();
  const after = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "KM1").x);
  // Quitar el cable de retorno de la lámpara nueva: aviso en el análisis.
  const idx = await t((id) => window.jwsimTest.scene.spec().wiring.findIndex((w) => w.from === `${id}.X2`), h);
  await clickAt(await t((i) => window.jwsimTest.scene.wirePoint(i), idx));
  await win.keyboard.press("Delete");
  const warned = await until(async () => (await snap())?.findings.some((f) => f.load === `${h}.lamp`), 3000);
  await win.screenshot({ path: join(OUT, "escena-edicion.png") });
  await t(() => window.jwsimTest.saveProject());
  await win.waitForTimeout(500);
  const saved = JSON.parse(readFileSync(projFile, "utf8")).scene;
  const savedOk = saved.devices.some((d) => d.id === h) && saved.wiring.some((w) => w.from === `${h}.X1` && w.to === "PS1.L+") && saved.devices.find((d) => d.id === "KM1").x === after;
  criteria.SCENE_EDIT = {
    ok: wired === 28 && !!lit && after - before >= 50 && !!warned && savedOk,
    lamp: h,
    wires_after_two_clicks_pairs: wired,
    lit: !!lit,
    dragged_px: after - before,
    unpowered_warning: !!warned,
    saved: savedOk,
  };
  log(`SCENE_EDIT ${JSON.stringify(criteria.SCENE_EDIT)}`);
} finally {
  const ok = Object.values(criteria).length === 4 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_G7_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_G7_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
