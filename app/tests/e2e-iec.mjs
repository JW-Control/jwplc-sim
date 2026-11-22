// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del esquema normalizado (IEC 60617) generado de la escena:
// botón «Normalizado (IEC)», hojas, referencias cruzadas, «Ordenar como
// tablero» (y deshacer) y regeneración al editar en «A colores».
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const PDF_DIR = mkdtempSync(join(tmpdir(), "jwsim-iec-pdf-"));
const env = { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-iec-ws-")), JWSIM_E2E_PDF_DIR: PDF_DIR };
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
    ok: enabled && ui.view && ui.canvasHidden && ui.motor && d.sheets.map((s) => s.title).join("|") === "Potencia 220 VAC 3~|PLC y alimentación 24 VDC|Entradas del PLC|Mando y salidas del PLC|Lista de E/S y bornes" && d.on > 0,
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

  // PDF: una página por hoja (5), en A4 apaisada (valor por defecto).
  const a4 = await t(() => document.getElementById("iec-size").value);
  const pdf = await t(() => window.JwsimIec.exportPdf());
  const bytes = pdf?.file ? readFileSync(pdf.file) : Buffer.alloc(0);
  const pdfPages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pdf?.file) copyFileSync(pdf.file, join(OUT, "esquema.pdf"));
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(bytes.toString("latin1"));
  const mm = box ? [Math.round((Number(box[1]) * 25.4) / 72), Math.round((Number(box[2]) * 25.4) / 72)] : null;
  criteria.PDF = { ok: bytes.subarray(0, 5).toString() === "%PDF-" && pdfPages === 5 && pdf.pages === 5 && a4 === "A4" && mm?.join("x") === "297x210", file: pdf?.file, size: bytes.length, pdfPages, sel: a4, mm };
  log(`PDF ${JSON.stringify(criteria.PDF)}`);

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
  // Editar desde el plano: contacto en serie, en paralelo, quitarlo y columna nueva.
  const outSheet = () => t(() => window.JwsimIec.debug().sheets.findIndex((s) => s.title === "Mando y salidas del PLC"));
  const waitIec = (pred) => win.waitForFunction(pred, null, { timeout: 15000 }).catch(() => {});
  await t((i) => window.JwsimIec.sheet(i), await outSheet());
  await sleep(400);
  const hb = await t(() => {
    const r = document.querySelector('#iec-root .iec-el[data-key="H1.lamp"] .iec-hitbox').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await win.mouse.click(hb.x, hb.y);
  await sleep(300);
  const menu = await t(() => ({ shown: !document.getElementById("iec-edit").hidden, items: document.querySelectorAll("#iec-edit [data-act]").length }));
  await win.screenshot({ path: join(OUT, "menu-edicion.png") });
  await win.keyboard.press("Escape");
  const nDev = () => t(() => window.jwsimTest.scene.spec().devices.length);
  const n0 = await nDev();
  const r1 = await t(() => window.JwsimIec.edit({ key: "H1.lamp" }, "series", 1)); // pulsador NC antes de H1
  await waitIec(() => window.JwsimIec.elems().some((e) => e.dev.startsWith("S") && e.kind === "contact"));
  const afterSeries = await t(() => window.JwsimIec.elems());
  const sId = r1?.added?.[0];
  const sCol = afterSeries.find((e) => e.dev === sId)?.col;
  const hCol = afterSeries.find((e) => e.dev === "H1")?.col;
  const r2 = await t(() => window.JwsimIec.edit({ key: "plc.Q0_2" }, "parallel", 0)); // pulsador NA en paralelo con Q0.2
  const pId = r2?.added?.[0];
  await waitIec((id) => window.JwsimIec.elems().some((e) => e.dev === id), pId);
  const afterPar = await t(() => window.JwsimIec.elems());
  const q2 = afterPar.find((e) => e.key === "plc.Q0_2");
  const par = afterPar.find((e) => e.dev === pId);
  await t((id) => window.JwsimIec.edit({ key: `${id}.11-12` }, "bridge"), sId);
  await waitIec((id) => !window.JwsimIec.elems().some((e) => e.dev === id), sId);
  const bridged = await t(() => window.JwsimIec.elems());
  const stillLamp = bridged.some((e) => e.dev === "H1") && !(await t((id) => window.jwsimTest.scene.spec().devices.some((d) => d.id === id), sId));
  await t(() => window.JwsimIec.edit({ rail: "top" }, "rung", 2)); // piloto nuevo
  await sleep(1500);
  const n4 = await nDev();
  await win.screenshot({ path: join(OUT, "editado.png") });
  criteria.EDIT = {
    ok: menu.shown && menu.items >= 9 && !!sId && sCol === hCol && !!pId && par?.col !== q2?.col && Math.abs((par?.col ?? 0) - (q2?.col ?? 0)) === 1 && stillLamp && n4 === n0 + 2,
    menu, sId, sCol, hCol, pId, parCol: par?.col, q2Col: q2?.col, stillLamp, n0, n4,
  };
  log(`EDIT ${JSON.stringify(criteria.EDIT)}`);
  criteria.NO_ERRORS = { ok: errors.length === 0, errors };
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}

const ok = ["SHEETS", "CROSS_REF", "PDF", "ARRANGE", "REGENERATES", "EDIT", "NO_ERRORS"].every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_IEC_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_IEC_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
