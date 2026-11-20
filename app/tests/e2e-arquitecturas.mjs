// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del menú «Arquitecturas» con la 01 (bombeo de edificio):
//   ARCH_LIST     el menú lista las arquitecturas de arquitecturas/
//   ARCH_OPEN     abre la copia con su escena (13 equipos y la placa) y la ficha en la consola
//   ARCH_RUN      compila y corre: con S1 en Auto la red sube a ~4 bar con el PI
//   ARCH_3D       la Planta 3D muestra la cisterna y la sala de bombas con el edificio
//   ARCH_LIFT     la 02 (montacargas): «Llamar P2» sube la cabina hasta el piso 2
//   ARCH_WATER    la 03 (tratamiento): filtra, dosifica cloro y «Colmatar» lleva al retrolavado
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
  const opened = await t(() => ({ devices: document.querySelectorAll("#scene-root .dev").length, card: /Arquitectura 01/.test(document.body.innerText + document.getElementById("console").textContent) }));
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

  await win.click("#btn-stop");
  await win.waitForFunction(() => window.jwsimTest.status() !== "running", null, { timeout: 20000 });
  await t(() => window.jwsimTest.pickArch("02-montacargas"));
  await win.waitForTimeout(2500);
  await win.click("#btn-run");
  await win.waitForFunction(() => window.jwsimTest.status() === "running", null, { timeout: 240000 });
  await win.waitForTimeout(1500);
  await t(() => window.jwsimTest.scene.view("3d"));
  await t(() => window.jwsimTest.scene.act("SB2", "press", true));
  await win.waitForTimeout(300);
  await t(() => window.jwsimTest.scene.act("SB2", "press", false));
  let lift = null;
  for (let i = 0; i < 60 && !lift?.ok; i++) {
    await win.waitForTimeout(500);
    lift = await t(() => {
      const o = window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "CAB1")?.outputs ?? {};
      return { ok: o.enPiso === 2 && !o.movimiento, altura: o.altura, piso: o.pisoTxt, movimiento: o.movimiento };
    });
    if (i === 12) await win.screenshot({ path: join(OUT, "02-planta-3d.png") });
  }
  const objs2 = await t(() => window.jwsimTest.scene.view3d());
  criteria.ARCH_LIFT = { ...lift, ok: !!lift?.ok && objs2.some((o) => o.type === "jwsim/lift") };
  log(`ARCH_LIFT ${JSON.stringify(criteria.ARCH_LIFT)}`);
  await t(() => window.JwsimTabs.select("schematic"));
  await win.waitForTimeout(800);
  await win.screenshot({ path: join(OUT, "02-esquema.png") });

  await win.click("#btn-stop");
  await win.waitForFunction(() => window.jwsimTest.status() !== "running", null, { timeout: 20000 });
  await t(() => window.jwsimTest.pickArch("03-tratamiento-agua"));
  await win.waitForTimeout(2500);
  await win.click("#btn-run");
  await win.waitForFunction(() => window.jwsimTest.status() === "running", null, { timeout: 240000 });
  await win.waitForTimeout(1500);
  await t(() => window.jwsimTest.scene.act("S1", "position", 1));
  await win.waitForTimeout(8000);
  await t(() => window.jwsimTest.scene.act("F1", "colmatar", true));
  await win.waitForTimeout(300);
  await t(() => window.jwsimTest.scene.act("F1", "colmatar", false));
  let water = null;
  for (let i = 0; i < 30 && !water?.ok; i++) {
    await win.waitForTimeout(500);
    water = await t(() => {
      const o = (id) => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === id)?.outputs ?? {};
      return { ok: !!o("F1").lavando && !!o("Y2").open && !o("Y1").open, dp: o("F1").dp, cloro: o("AT1").cloro };
    });
  }
  await win.screenshot({ path: join(OUT, "03-esquema.png") });
  await t(() => window.jwsimTest.scene.view("3d"));
  await win.waitForTimeout(1500);
  const objs3 = await t(() => window.jwsimTest.scene.view3d());
  await win.screenshot({ path: join(OUT, "03-planta-3d.png") });
  criteria.ARCH_WATER = { ...water, ok: !!water?.ok && objs3.some((o) => o.type === "jwsim/sand-filter") };
  log(`ARCH_WATER ${JSON.stringify(criteria.ARCH_WATER)}`);
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}
const ok = ["ARCH_LIST", "ARCH_OPEN", "ARCH_RUN", "ARCH_3D", "ARCH_LIFT", "ARCH_WATER"].every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_ARQUITECTURAS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
console.log(`JWSIM_ARQUITECTURAS_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
