// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del configurador de finales de carrera y sensores desde el
// cilindro (estilo FluidSIM en Propiedades).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "cylinder-sensors");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-cs-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE;
const userData = mkdtempSync(join(tmpdir(), "jwsim-cs-ud-"));
const app = await electron.launch({ args: [APP, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => win.waitForTimeout(ms);

try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await t(() => window.JwsimTabs.select("schematic"));
  await sleep(500);

  // 1. Agregar una electroválvula Y1 y seleccionar en Propiedades.
  await t(() => {
    window.jwsimTest.scene.add("jwsim/solenoid-valve", 600, 440, "Y1");
    window.jwsimTest.scene.select("Y1");
  });
  await sleep(300);

  const hasSection = await t(() => !!document.querySelector('[data-cyl-pair="Y1"]'));
  await win.click('[data-cyl-pair="Y1"]');
  await sleep(300);

  const afterPair = await t(() => {
    const sp = window.jwsimTest.scene.spec();
    const y1 = sp.devices.find((d) => d.id === "Y1");
    const a0 = sp.devices.find((d) => d.id === "A0");
    const a1 = sp.devices.find((d) => d.id === "A1");
    const rows = document.querySelectorAll(".cyl-fc-table tbody tr").length;
    return { y1, a0, a1, rows };
  });
  criteria.PAIR_CREATED_ABOVE_PISTON = {
    ok: hasSection &&
      afterPair.rows === 2 &&
      afterPair.a0?.type === "jwsim/limit-switch" &&
      afterPair.a0.params?.source === "Y1.position" &&
      afterPair.a0.params?.min === 0 &&
      afterPair.a0.y < afterPair.y1.y &&
      afterPair.a1?.params?.min === 1 &&
      afterPair.a1.y < afterPair.y1.y &&
      afterPair.a1.x > afterPair.a0.x,
    afterPair,
  };
  log(`PAIR_CREATED_ABOVE_PISTON ${JSON.stringify(criteria.PAIR_CREATED_ABOVE_PISTON)}`);

  // 2. Cablear A0 al PLC, volver a seleccionar Y1, renombrar A0 -> S0 y agregar marca intermedia A2 (0.5).
  await t(() => {
    window.jwsimTest.scene.wire("A0.14", "plc.I0_0");
    window.jwsimTest.scene.select("Y1");
  });
  await sleep(200);
  await win.fill('[data-cyl-rename="A0"]', "S0");
  await win.dispatchEvent('[data-cyl-rename="A0"]', "change");
  await sleep(250);
  await win.click('[data-cyl-add="Y1"]');
  await sleep(250);

  const afterMidAndRename = await t(() => {
    const sp = window.jwsimTest.scene.spec();
    const s0 = sp.devices.find((d) => d.id === "S0");
    const s2 = sp.devices.find((d) => d.id === "S2");
    const wire = sp.wiring.find((w) => w.to === "plc.I0_0");
    return { s0, s2, wire };
  });
  criteria.RENAME_AND_INTERMEDIATE_MARK = {
    ok: !!afterMidAndRename.s0 &&
      afterMidAndRename.wire?.from === "S0.14" &&
      afterMidAndRename.s2?.params?.min === 0.47 &&
      afterMidAndRename.s2?.params?.max === 0.53,
    afterMidAndRename,
  };
  log(`RENAME_AND_INTERMEDIATE_MARK ${JSON.stringify(criteria.RENAME_AND_INTERMEDIATE_MARK)}`);

  await win.screenshot({ path: join(OUT, "colores-marcas.png") });

  // 3. Ver en Neumático que S0, S2 y A1 aparecen sobre el vástago en sus posiciones.
  await win.click("#schem-pneu");
  await sleep(400);
  const inPneu = await t(() => {
    const items = [...document.querySelectorAll("#pn-root .pn-ls")].map((g) => ({
      label: g.querySelector("text")?.textContent,
      x: Number(g.querySelector("circle")?.getAttribute("cx")),
    }));
    return items.sort((a, b) => a.x - b.x);
  });
  criteria.SHOWN_IN_PNEUMATIC = {
    ok: inPneu.map((i) => i.label).join(",") === "S0,S2,A1" &&
      inPneu[0].x < inPneu[1].x && inPneu[1].x < inPneu[2].x,
    inPneu,
  };
  log(`SHOWN_IN_PNEUMATIC ${JSON.stringify(criteria.SHOWN_IN_PNEUMATIC)}`);
  await win.screenshot({ path: join(OUT, "neumatico-marcas.png") });

  // 4. Cambiar A1 a magnético y probar Ctrl+Z (deshacer).
  await win.click("#schem-color");
  await sleep(250);
  await win.selectOption('[data-cyl-kind="A1"]', "magnetic");
  await sleep(250);
  const mag = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "A1"));
  await win.click("#scene-undo");
  await sleep(250);
  const undone = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "A1"));
  criteria.CONVERT_AND_UNDO = {
    ok: mag?.type === "jwsim/sensor-cylinder" && mag.params?.end === "extendido" &&
      undone?.type === "jwsim/limit-switch",
    mag, undone,
  };
  log(`CONVERT_AND_UNDO ${JSON.stringify(criteria.CONVERT_AND_UNDO)}`);
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}

const ok = ["PAIR_CREATED_ABOVE_PISTON", "RENAME_AND_INTERMEDIATE_MARK", "SHOWN_IN_PNEUMATIC", "CONVERT_AND_UNDO"]
  .every((k) => criteria[k]?.ok);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "JWSIM_CYLINDER_SENSORS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_CYLINDER_SENSORS_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
