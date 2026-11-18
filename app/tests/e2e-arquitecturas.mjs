// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del menú «Arquitecturas» con la 01 (bombeo de edificio):
//   ARCH_LIST     el menú lista las arquitecturas de arquitecturas/
//   ARCH_OPEN     abre la copia con su escena (13 equipos y la placa) y la ficha en la consola
//   ARCH_RUN      compila y corre: con S1 en Auto la red sube a ~4 bar con el PI
//   ARCH_3D       la Planta 3D muestra la cisterna y la sala de bombas con el edificio
// Informe en build/gates/JWSIM_ARQUITECTURAS_E2E.json y capturas en build/gates/arquitecturas/.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "arquitecturas");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
const t = (fn, ...a) => win.evaluate(fn, ...a);
try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await win.waitForFunction(() => document.querySelectorAll("#sel-arch option").length > 1, null, { timeout: 20000 });
  const ids = await win.$$eval("#sel-arch option", (o) => o.map((x) => x.value).filter(Boolean));
  criteria.ARCH_LIST = { ok: ids.includes("01-bombeo-edificio"), ids };
  log(`ARCH_LIST ${JSON.stringify(criteria.ARCH_LIST)}`);

  await t(() => window.jwsimTest.pickArch("01-bombeo-edificio"));
  await win.waitForTimeout(2500);
  await t(() => window.JwsimTabs.select("schematic"));
  await win.waitForTimeout(1000);
  const opened = await t(() => ({ devices: document.querySelectorAll("#scene-root .dev").length, card: /Arquitectura 01/.test(document.body.innerText) }));
  criteria.ARCH_OPEN = { ok: opened.devices >= 13 && opened.card, ...opened };
  log(`ARCH_OPEN ${JSON.stringify(criteria.ARCH_OPEN)}`);

  await win.click("#btn-run");
  await win.waitForFunction(() => window.jwsimTest.status() === "running", null, { timeout: 240000 });
  await win.waitForTimeout(1500);
  await t(() => window.jwsimTest.scene.act("S1", "position", 1));
  let run = null;
  for (let i = 0; i < 40 && !run?.ok; i++) {
    await win.waitForTimeout(500);
    run = await t(() => {
      const o = (id) => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === id)?.outputs ?? {};
      const p = Number(o("RED1").presion ?? 0);
      return { ok: p > 3.8 && p < 4.6 && !!o("VF1").running, presion: p, vf1: o("VF1").hz, pt1: o("PT1").presion };
    });
  }
  criteria.ARCH_RUN = run;
  log(`ARCH_RUN ${JSON.stringify(criteria.ARCH_RUN)}`);
  await win.screenshot({ path: join(OUT, "01-esquema.png") });

  await t(() => window.jwsimTest.scene.view("3d"));
  await win.waitForTimeout(1500);
  const objs = await t(() => window.jwsimTest.scene.view3d());
  const types = objs.map((o) => o.type);
  criteria.ARCH_3D = { ok: types.includes("jwsim/tank") && types.includes("jwsim/building-water"), objetos: objs.map((o) => o.id) };
  log(`ARCH_3D ${JSON.stringify(criteria.ARCH_3D)}`);
  await win.screenshot({ path: join(OUT, "01-planta-3d.png") });
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}
const ok = ["ARCH_LIST", "ARCH_OPEN", "ARCH_RUN", "ARCH_3D"].every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_ARQUITECTURAS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
console.log(`JWSIM_ARQUITECTURAS_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
