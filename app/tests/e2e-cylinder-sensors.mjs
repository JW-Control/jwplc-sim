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
    const tA0 = window.JwsimScene.terminalOf("A0.14");
    return { y1, a0, a1, rows, tA0 };
  });
  criteria.PAIR_CREATED_ABOVE_PISTON = {
    ok: hasSection &&
      afterPair.rows === 2 &&
      afterPair.a0?.type === "jwsim/limit-switch" &&
      afterPair.a0.params?.orientacion === "abajo" &&
      afterPair.a0.params?.source === "Y1.position" &&
      afterPair.a0.params?.min === 0 &&
      afterPair.a0.x === afterPair.y1.x + 280 &&
      afterPair.a0.y === afterPair.y1.y - 160 &&
      afterPair.tA0?.side === "t" &&
      afterPair.a1?.params?.min === 1 &&
      afterPair.a1.x === afterPair.y1.x + 420 &&
      afterPair.a1.y === afterPair.y1.y - 160,
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

  // Agregar también Y2 biestable para verificar alineación de sus bornes A+ y A−.
  await t(() => {
    window.jwsimTest.scene.add("jwsim/solenoid-valve-2", 600, 720, "Y2");
    window.jwsimTest.scene.select("Y1");
  });
  await sleep(250);
  const y2Terms = await t(() => ({
    ap1: window.JwsimScene.terminalOf("Y2.A+1"),
    ap2: window.JwsimScene.terminalOf("Y2.A+2"),
    am1: window.JwsimScene.terminalOf("Y2.A-1"),
    am2: window.JwsimScene.terminalOf("Y2.A-2"),
  }));
  criteria.BISTABLE_TERMS_ALIGNED = {
    ok: y2Terms.ap1 && y2Terms.ap2 && y2Terms.am1 && y2Terms.am2 &&
      Math.abs(y2Terms.ap1.fx - 100 / 520) < 0.01 &&
      Math.abs(y2Terms.ap2.fx - 120 / 520) < 0.01 &&
      Math.abs(y2Terms.am1.fx - 260 / 520) < 0.01 &&
      Math.abs(y2Terms.am2.fx - 280 / 520) < 0.01,
    y2Terms,
  };
  log(`BISTABLE_TERMS_ALIGNED ${JSON.stringify(criteria.BISTABLE_TERMS_ALIGNED)}`);

  // Editar etiqueta personalizada en Y1 y verificar visibilidad sin scroll e insignia en ambos lienzos.
  await win.fill('#scene-inspector [data-param="label"]', "Prensa");
  await win.dispatchEvent('#scene-inspector [data-param="label"]', "change");
  await sleep(250);
  const labelAndFit = await t(() => {
    const insp = document.getElementById("scene-inspector");
    return {
      cylTag: document.querySelector('#scene-devices > g[data-id="Y1"] .dev-cyl-tag')?.textContent,
      noScroll: insp.scrollHeight <= insp.clientHeight,
      scrollH: insp.scrollHeight,
      clientH: insp.clientHeight,
    };
  });

  await win.click("#scene-fit");
  await sleep(250);
  await win.screenshot({ path: join(OUT, "colores-marcas.png") });

  // 3. Ver en Neumático que S0, S2 y A1 aparecen sobre el vástago y que el cilindro muestra su etiqueta.
  await win.click("#schem-pneu");
  await sleep(400);
  const inPneu = await t(() => {
    const items = [...document.querySelectorAll("#pn-root .pn-ls")].map((g) => ({
      label: g.querySelector("text")?.textContent,
      x: Number(g.querySelector("circle")?.getAttribute("cx")),
    }));
    const names = [...document.querySelectorAll("#pn-root .pn-name")].map((n) => n.textContent);
    return { items: items.sort((a, b) => a.x - b.x), names };
  });
  criteria.SHOWN_IN_PNEUMATIC = {
    ok: labelAndFit.noScroll &&
      labelAndFit.cylTag === "Prensa · Y1" &&
      inPneu.names[0] === "Prensa · Y1" &&
      inPneu.items.map((i) => i.label).join(",") === "S0,S2,A1" &&
      inPneu.items[0].x < inPneu.items[1].x && inPneu.items[1].x < inPneu.items[2].x,
    labelAndFit,
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
  const y1Now = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "Y1"));
  await win.click("#scene-undo");
  await sleep(250);
  const undone = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "A1"));
  criteria.CONVERT_AND_UNDO = {
    ok: mag?.type === "jwsim/sensor-cylinder" && mag.params?.end === "extendido" &&
      mag.x <= y1Now.x + 160 &&
      undone?.type === "jwsim/limit-switch",
    mag, undone,
  };
  log(`CONVERT_AND_UNDO ${JSON.stringify(criteria.CONVERT_AND_UNDO)}`);

  // 5. Verificar arrastre en grupo con el cilindro, retorno elastico (<=100px) y desacople (>100px).
  const dragWorld = async (id, wdx, wdy) => {
    const pt = await t((devId) => {
      const hit = document.querySelector(`#scene-devices > g[data-id="${devId}"] .dev-hit`);
      const r = hit.getBoundingClientRect();
      const ww = Number(hit.getAttribute("width"));
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: r.width / ww };
    }, id);
    await win.mouse.move(pt.x, pt.y);
    await win.mouse.down();
    await win.mouse.move(pt.x + wdx * pt.scale, pt.y + wdy * pt.scale, { steps: 6 });
    await win.mouse.up();
    await sleep(200);
  };
  const posOf = async (id) =>
    t((devId) => {
      const d = window.jwsimTest.scene.spec().devices.find((x) => x.id === devId);
      return d ? { x: d.x, y: d.y } : null;
    }, id);

  const before = { y1: await posOf("Y1"), s0: await posOf("S0"), a1: await posOf("A1") };
  await dragWorld("Y1", 80, 0);
  const afterCyl = { y1: await posOf("Y1"), s0: await posOf("S0"), a1: await posOf("A1") };
  const cylDelta = afterCyl.y1.x - before.y1.x;

  // Arrastre corto de S0 (+40 px): regresa a su sitio al soltar.
  await dragWorld("S0", 40, 0);
  const afterShort = await posOf("S0");

  // Arrastre largo de S0 (-200 px arriba): se suelta y ya no sigue a Y1.
  await dragWorld("S0", 0, -200);
  const afterDetach = await posOf("S0");
  await dragWorld("Y1", -60, 0);
  const afterCyl2 = { y1: await posOf("Y1"), s0: await posOf("S0"), a1: await posOf("A1") };

  criteria.GROUP_DRAG_SNAP_AND_DETACH = {
    ok: cylDelta >= 60 &&
      afterCyl.s0.x - before.s0.x === cylDelta &&
      afterCyl.a1.x - before.a1.x === cylDelta &&
      afterShort.x === afterCyl.s0.x &&
      afterShort.y === afterCyl.s0.y &&
      afterDetach.y < afterCyl.s0.y - 100 &&
      afterCyl2.a1.x - afterCyl.a1.x === afterCyl2.y1.x - afterCyl.y1.x &&
      afterCyl2.s0.x === afterDetach.x &&
      afterCyl2.s0.y === afterDetach.y,
    before, afterCyl, afterShort, afterDetach, afterCyl2,
  };
  log(`GROUP_DRAG_SNAP_AND_DETACH ${JSON.stringify(criteria.GROUP_DRAG_SNAP_AND_DETACH)}`);

  // 6. Cambiar tipo global (#cyl-fc-default-kind) convierte los sensores ya colocados sin borrarlos.
  await t(() => window.jwsimTest.scene.select("Y1"));
  await sleep(200);
  await win.selectOption("#cyl-fc-default-kind", "XCKJ");
  await sleep(250);
  const asXckj = await t(() => window.jwsimTest.scene.spec().devices.filter((d) => d.id === "S0" || d.id === "A1"));
  await win.selectOption("#cyl-fc-default-kind", "magnetic");
  await sleep(250);
  const asMag = await t(() => window.jwsimTest.scene.spec().devices.filter((d) => d.id === "S0" || d.id === "A1"));
  await win.screenshot({ path: join(OUT, "colores-magneticos.png") });
  criteria.GLOBAL_KIND_SWITCH = {
    ok: asXckj.length === 2 &&
      asXckj.every((d) => d.type === "jwsim/limit-switch" && d.params?.model === "XCKJ") &&
      asMag.length === 2 &&
      asMag.every((d) => d.type === "jwsim/sensor-cylinder") &&
      asMag.find((d) => d.id === "A1")?.x === afterCyl2.y1.x + 160,
    asXckj, asMag,
  };
  log(`GLOBAL_KIND_SWITCH ${JSON.stringify(criteria.GLOBAL_KIND_SWITCH)}`);
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}

const ok = [
  "PAIR_CREATED_ABOVE_PISTON",
  "RENAME_AND_INTERMEDIATE_MARK",
  "BISTABLE_TERMS_ALIGNED",
  "SHOWN_IN_PNEUMATIC",
  "CONVERT_AND_UNDO",
  "GROUP_DRAG_SNAP_AND_DETACH",
  "GLOBAL_KIND_SWITCH",
].every((k) => criteria[k]?.ok);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "JWSIM_CYLINDER_SENSORS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_CYLINDER_SENSORS_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
