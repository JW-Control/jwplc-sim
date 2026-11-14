// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del asistente «Nuevo dispositivo» (etapa B de
// docs/integration/PROPUESTA_MODELOS_PROPIOS.md):
//   BLOCKS     el asistente ofrece los 7 bloques de comportamiento
//   NAME_CHECK un autor inválido se explica y no deja crear
//   PREVIEW    relé 2 NA + 1 NC: vista previa con los bornes en la grilla
//   CREATE     crea la carpeta (código, símbolo, prueba), la enlaza y aparece en la paleta
//   SIMULATES  colocado y cableado a 24 VDC, su bobina se energiza
//   THERMAL    planta térmica sin la entrada 0-10 V: bornes R1 R2 / PT1 PT2 PT3 TS1 TS2,
//              creada y en la escena con su temperatura
// Informe en build/gates/JWSIM_NUEVO_DISPOSITIVO_E2E.json.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "nuevo-dispositivo");
mkdirSync(OUT, { recursive: true });
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
const parent = mkdtempSync(join(tmpdir(), "jwsim-nuevos-"));
const TYPE = "utec/rele-prueba";

createRequire(import.meta.url)("electron");
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await win.waitForTimeout(100);
  }
  return null;
};
const previewText = () => win.$eval("#nb-preview", (e) => e.textContent);
const createDisabled = () => win.$eval('#devmgr [data-act="nb-create"]', (b) => b.disabled);

try {
  // ---- BLOCKS
  await t(() => window.jwsimTest.scene.view("scene"));
  await t(() => window.JwsimDevices.newDevice());
  const blocks = await until(() => win.$$eval('#devmgr [data-act="nb-block"]', (l) => (l.length ? l.map((b) => b.dataset.v) : null)));
  await win.screenshot({ path: join(OUT, "01-bloques.png") });
  criteria.BLOCKS = { ok: blocks?.join() === "rele,carga,pulsador,sensor,temporizador,planta,termica", blocks };
  log(`BLOCKS ${JSON.stringify(criteria.BLOCKS)}`);

  // ---- NAME_CHECK
  await win.click('#devmgr [data-act="nb-block"][data-v="rele"]');
  await win.fill('#devmgr [data-f="author"]', "Mi Autor");
  await win.fill('#devmgr [data-f="name"]', "rele-prueba");
  const bad = await until(async () => {
    const txt = await previewText();
    return /autor: minúsculas/.test(txt) ? txt : null;
  });
  criteria.NAME_CHECK = { ok: !!bad && (await createDisabled()), message: bad };
  log(`NAME_CHECK ${JSON.stringify(criteria.NAME_CHECK)}`);

  // ---- PREVIEW
  await win.fill('#devmgr [data-f="author"]', "utec");
  await win.fill('#devmgr [data-f="title"]', "Relé de prueba");
  await win.fill('#devmgr [data-f="no"]', "2");
  await win.fill('#devmgr [data-f="nc"]', "1");
  await win.fill('#devmgr [data-f="parent"]', parent);
  const prev = await until(async () => {
    const txt = await previewText();
    return /arriba: A1 13 23 31/.test(txt) ? txt : null;
  });
  const terms = await win.$$eval("#nb-preview .jw-term", (l) => l.map((c) => Number(c.getAttribute("cx"))));
  await win.screenshot({ path: join(OUT, "02-vista-previa.png") });
  criteria.PREVIEW = { ok: !!prev && /abajo: A2 14 24 32/.test(prev) && terms.length === 8 && terms.every((x) => x % 20 === 0) && !(await createDisabled()), terms };
  log(`PREVIEW ${JSON.stringify(criteria.PREVIEW)}`);

  // ---- CREATE
  await win.click('#devmgr [data-act="nb-create"]');
  const st = await until(() => win.$eval("#devmgr .dev-item .dev-st", (e) => e.textContent), 15000);
  const dir = join(parent, "rele-prueba");
  const files = ["jwsim-device.json", "device.mjs", "symbol.svg", "device.test.mjs", "README.md"].every((f) => existsSync(join(dir, f)));
  const badge = await win.$eval(`#scene-add [data-add="${TYPE}"] .palette-badge`, (e) => e.textContent).catch(() => null);
  await win.screenshot({ path: join(OUT, "03-creado.png") });
  criteria.CREATE = { ok: /Listo/.test(st ?? "") && files && badge === "dev", status: st, files, badge };
  log(`CREATE ${JSON.stringify(criteria.CREATE)}`);
  await win.click('#devmgr [data-act="close"]');

  // ---- SIMULATES (análisis de la escena, sin firmware: fuente → bobina)
  await t(() => window.jwsimTest.scene.add("jwsim/power-24vdc", 0, 400, "PS9"));
  await t((type) => window.jwsimTest.scene.add(type, 300, 400, "K9"), TYPE);
  await t(() => window.jwsimTest.scene.wire("PS9.+V1", "K9.A1"));
  await t(() => window.jwsimTest.scene.wire("K9.A2", "PS9.-V1"));
  await t(() => window.jwsimTest.scene.analyze());
  const energized = await until(() => t(() => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "K9")?.outputs?.energized === true));
  const contacts = await t(() => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "K9")?.contacts);
  await win.screenshot({ path: join(OUT, "04-en-escena.png") });
  criteria.SIMULATES = { ok: !!energized && contacts?.["13-14"] === true && contacts?.["31-32"] === false, contacts };
  log(`SIMULATES ${JSON.stringify(criteria.SIMULATES)}`);

  // ---- THERMAL
  await t(() => window.JwsimDevices.newDevice());
  await until(() => win.$('#devmgr [data-act="nb-block"][data-v="termica"]'));
  await win.click('#devmgr [data-act="nb-block"][data-v="termica"]');
  await win.fill('#devmgr [data-f="author"]', "utec");
  await win.fill('#devmgr [data-f="name"]', "horno");
  await win.fill('#devmgr [data-f="tau"]', "60");
  await win.fill('#devmgr [data-f="parent"]', parent);
  await win.click('#devmgr [data-f="analogIn"]');
  const tprev = await until(async () => {
    const txt = await previewText();
    return /arriba: R1 R2 ·/.test(txt) && /abajo: PT1 PT2 PT3 TS1 TS2/.test(txt) ? txt : null;
  });
  await win.screenshot({ path: join(OUT, "05-termica.png") });
  await win.click('#devmgr [data-act="nb-create"]');
  await until(() => win.$eval("#devmgr", (e) => /utec\/horno/.test(e.textContent)), 15000);
  await win.click('#devmgr [data-act="close"]');
  await t(() => window.jwsimTest.scene.add("utec/horno", 600, 400, "H9"));
  await t(() => window.jwsimTest.scene.analyze());
  const temp = await until(() => t(() => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "H9")?.outputs?.temp));
  criteria.THERMAL = { ok: !!tprev && Math.abs(Number(temp) - 25) < 1e-6, temp };
  log(`THERMAL ${JSON.stringify(criteria.THERMAL)}`);
} finally {
  const ok = Object.values(criteria).length === 6 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_NUEVO_DISPOSITIVO_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_NUEVO_DISPOSITIVO_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
