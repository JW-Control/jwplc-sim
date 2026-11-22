// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del esquema normalizado (IEC 60617) generado de la escena:
// botón «Normalizado (IEC)», hojas, referencias cruzadas, «Ordenar como
// tablero» (y deshacer) y regeneración al editar en «A colores».
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "iec");
mkdirSync(OUT, { recursive: true });
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-iec-ws-")) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-iec-ud-"))}`], env });
const win = await app.firstWindow();
const errors = [];
win.on("pageerror", (e) => errors.push(String(e.message)));
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => win.waitForTimeout(ms);

try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await t(async () => {
    await window.jwsimTest.loadArchs?.();
    const a = window.jwsimTest.archs().find((x) => String(x.id ?? x).includes("montacargas"));
    await window.jwsimTest.pickArch(a.id ?? a);
  });
  await sleep(2500);
  await t(() => window.JwsimTabs.select("schematic"));
  await sleep(500);
  const enabled = await t(() => !document.getElementById("schem-iec").disabled);
  errors.length = 0;
  await win.click("#schem-iec");
  await win.waitForFunction(() => (window.JwsimIec.debug().sheets ?? []).length > 0, null, { timeout: 15000 });
  await sleep(300);
  const d = await t(() => window.JwsimIec.debug());
  const ui = await t(() => ({
    view: !document.getElementById("iec-view").hidden,
    tabs: [...document.querySelectorAll("#iec-sheets [data-sheet]")].map((b) => b.textContent),
    canvasHidden: getComputedStyle(document.getElementById("scene-pan")).visibility === "hidden",
    motor: !!document.querySelector('#iec-root .iec-block[data-dev="M1"]'),
  }));
  await win.screenshot({ path: join(OUT, "potencia.png") });
  criteria.SHEETS = {
    ok: enabled && ui.view && ui.canvasHidden && ui.motor && d.sheets.map((s) => s.title).join("|") === "Potencia 220 VAC 3~|Alimentación 24 VDC|Entradas del PLC|Mando y salidas del PLC" && d.on > 0,
    enabled,
    ...ui,
    sheets: d.sheets,
    on: d.on,
  };
  log(`SHEETS ${JSON.stringify(criteria.SHEETS)}`);

  // Referencia cruzada: «/4.1» bajo -KM1 en Potencia lleva a la hoja 4 (bobina).
  await win.click('#iec-sheets [data-sheet="3"]');
  await sleep(300);
  await win.screenshot({ path: join(OUT, "salidas.png") });
  const coil = await t(() => !!document.querySelector('#iec-root .iec-el[data-dev="KM1"][data-cid="coil"]'));
  await win.click('#iec-sheets [data-sheet="0"]');
  await sleep(300);
  await t(() => document.querySelector('#iec-root .iec-block[data-dev="KM1"] [data-goto]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await sleep(300);
  const after = await t(() => ({ sheet: window.JwsimIec.debug().sheet, flash: !!document.querySelector("#iec-root .iec-colflash") }));
  criteria.CROSS_REF = { ok: coil && after.sheet === 3 && after.flash, coil, ...after };
  log(`CROSS_REF ${JSON.stringify(criteria.CROSS_REF)}`);

  // «Ordenar como tablero»: entradas arriba del PLC, salidas abajo; se deshace.
  await win.click("#schem-color");
  await sleep(300);
  const pos = () => t(() => Object.fromEntries(window.jwsimTest.scene.spec().devices.map((d) => [d.id, [d.x, d.y]])));
  const before = await pos();
  await win.click("#scene-arrange");
  await sleep(1500);
  const arranged = await pos();
  const refs = await t(() => window.jwsimTest.scene.spec().wiring.filter((w) => w.ref).length);
  await win.screenshot({ path: join(OUT, "ordenado.png") });
  await win.click("#scene-undo");
  await sleep(600);
  const undone = await pos();
  criteria.ARRANGE = {
    ok: arranged.SQ0[1] < arranged.plc[1] && arranged.KM1[1] > arranged.plc[1] && arranged.KM1[0] < arranged.KM2[0] && refs > 0 && JSON.stringify(undone) === JSON.stringify(before),
    plc: arranged.plc,
    SQ0: arranged.SQ0,
    KM1: arranged.KM1,
    KM2: arranged.KM2,
    refs,
    undone: JSON.stringify(undone) === JSON.stringify(before),
  };
  log(`ARRANGE ${JSON.stringify(criteria.ARRANGE)}`);

  // Editar en «A colores»: un piloto nuevo en 24 V aparece en el esquema.
  await t(() => {
    window.jwsimTest.scene.add("jwsim/lamp", 200, 200, "H9");
    window.jwsimTest.scene.wire("PS1.+V2", "H9.X1");
    window.jwsimTest.scene.wire("H9.X2", "PS1.-V2");
  });
  await sleep(800);
  await win.click("#schem-iec");
  await win.waitForFunction(() => window.JwsimIec.debug().sheets.some((s) => s.title === "Mando y salidas del PLC" && s.elems === 14), null, { timeout: 15000 }).catch(() => {});
  const d2 = await t(() => window.JwsimIec.debug());
  criteria.REGENERATES = { ok: d2.sheets.find((s) => s.title === "Mando y salidas del PLC")?.elems === 14, sheets: d2.sheets };
  log(`REGENERATES ${JSON.stringify(criteria.REGENERATES)}`);
  criteria.NO_ERRORS = { ok: errors.length === 0, errors };
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}

const ok = ["SHEETS", "CROSS_REF", "ARRANGE", "REGENERATES", "NO_ERRORS"].every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_IEC_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_IEC_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
