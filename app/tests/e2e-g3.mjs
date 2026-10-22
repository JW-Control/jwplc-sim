// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G3 sobre Electron (Playwright), con el sketch
// tests/sketches/g3_debug:
//   BREAKPOINTS_STEP  breakpoint en el margen del editor, línea actual
//                     resaltada, paso por encima, entrar a doble() con sus
//                     argumentos en el panel de variables y salir
//   FREEZE_TIME       detenido en el breakpoint el reloj de la interfaz no
//                     avanza; al continuar, sí
//   WATCH_FORCE_IO    tabla de observación con una variable del sketch
//                     leída en vivo; forzar una salida y una entrada con
//                     marca visual en la placa
//   RECORD_REPLAY     la sesión (entradas y forzados) se guarda como .stim y
//                     su reproducción en la app da el mismo hash de traza
//   BUS_ANALYZER      durante la reproducción, la pestaña Buses decodifica el
//                     TCA6424A por registro y la pantalla por CS (filtro SPI)
// Informe en build/gates/JWSIM_G3_E2E.json y capturas en build/gates/g3/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g3.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g3");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const stimDir = mkdtempSync(join(tmpdir(), "jwsim-stim-"));
const criteria = {};
const shot = (win, name) => win.screenshot({ path: join(OUT, name) });
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

const sketchSrc = join(ROOT, "tests", "sketches", "g3_debug");
const marks = Object.fromEntries(
  readFileSync(join(sketchSrc, "g3_debug.ino"), "utf8")
    .split(/\r?\n/)
    .flatMap((l, i) => [...l.matchAll(/MARCA:(\w+)/g)].map((m) => [m[1], i + 1])),
);

createRequire(import.meta.url)("electron");
const args = [APP];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_E2E_STIM_DIR: stimDir } });
const win = await app.firstWindow();
win.on("console", (m) => m.type() === "error" && log(`consola: ${m.text()}`));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active", { timeout: 30000 });

const t = (fn, ...a) => win.evaluate(fn, ...a);
const status = () => t(() => window.jwsimTest.status());
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(50);
  }
  return null;
};
const waitStatus = (s, timeout = 15000) => until(async () => (await status()) === s, timeout);
const line = () => t(() => window.jwsimTest.currentLine());
const frame = () => t(() => window.jwsimTest.frameName());
const isOn = (sig) => win.$eval(`.io[data-signal='${sig}']`, (e) => e.classList.contains("on"));
const isForced = (sig) => win.$eval(`.io[data-signal='${sig}']`, (e) => e.classList.contains("forced"));

await t((dir) => window.jwsimTest.openSketchDir(dir), sketchSrc);
await win.waitForSelector(".tab.active:has-text('g3_debug.ino')", { timeout: 10000 });

// ---- BREAKPOINTS_STEP
log(`breakpoint en la línea ${marks.loop}; compilando g3_debug`);
await t(([n, l]) => window.jwsimTest.toggleBreakpoint(n, l), ["g3_debug.ino", marks.loop]);
// La marca en el margen (y que el breakpoint quede registrado en el editor).
const glyph =
  (await win.waitForSelector(".bp-glyph", { timeout: 10000 }).then(() => true, () => false)) &&
  (await t((n) => window.jwsimTest.breakpoints(n), "g3_debug.ino")).includes(marks.loop);
await win.click("#btn-run");
const hit = await waitStatus("break", 600000);
const l1 = await line();
const f1 = await frame();
await shot(win, "01-breakpoint.png");
await t(() => window.jwsimTest.dbg("next"));
await waitStatus("break");
const l2 = await until(async () => (await line())?.line === marks.llamada && line());
await t(() => window.jwsimTest.dbg("stepIn"));
const f3 = await until(async () => /doble/.test((await frame()) ?? "") && frame());
const l3 = await line();
const vars3 = await t(() => window.jwsimTest.variables());
await shot(win, "02-entrar.png");
await t(() => window.jwsimTest.dbg("stepOut"));
const f4 = await until(async () => /loop/.test((await frame()) ?? "") && (await status()) === "break" && frame());
const l4 = await line();
criteria.BREAKPOINTS_STEP = {
  pass:
    glyph &&
    !!hit &&
    l1?.line === marks.loop &&
    /loop/.test(f1 ?? "") &&
    l2?.line === marks.llamada &&
    /doble/.test(f3 ?? "") &&
    l3?.line === marks.doble &&
    vars3.some((v) => /^\s*x = 1\b/.test(v.replace(/[▸▾]/g, ""))) &&
    !vars3.some((v) => /^\s*A13 = /.test(v)) &&
    /loop/.test(f4 ?? "") &&
    l4?.line === marks.llamada,
  glyph,
  hit: l1,
  frame: f1,
  after_next: l2,
  step_in: { frame: f3, line: l3, vars: vars3 },
  step_out: { frame: f4, line: l4 },
};

// ---- FREEZE_TIME (en la interfaz)
log("FREEZE_TIME");
const c0 = await t(() => window.jwsimTest.clock());
await win.waitForTimeout(3000);
const c1 = await t(() => window.jwsimTest.clock());
await t(([n, l]) => window.jwsimTest.toggleBreakpoint(n, l), ["g3_debug.ino", marks.loop]);
await t(() => window.jwsimTest.dbg("continue"));
const resumed = await waitStatus("running");
await win.waitForTimeout(1000);
const c2 = await t(() => window.jwsimTest.clock());
criteria.FREEZE_TIME = { pass: c0 === c1 && !!resumed && c2 !== c1, stopped_clock: [c0, c1], after_continue: c2 };

// ---- WATCH_FORCE_IO
log("WATCH_FORCE_IO");
await win.click("#tab-watch");
await t(() => window.jwsimTest.addWatch("vueltas"));
const num = async () => Number((await t(() => window.jwsimTest.watchValue("expr:vueltas"))) ?? NaN);
const w1 = await until(async () => (Number.isFinite(await num()) ? num() : null), 10000);
await win.waitForTimeout(1200);
const w2 = await num();
await t(() => window.jwsimTest.setForce("Q0_7", 1));
await t(() => window.jwsimTest.setForce("I0_3", 1));
const q7 = await until(() => isOn("Q0_7"), 3000);
const i3 = await until(() => isOn("I0_3"), 3000);
const marked = (await isForced("Q0_7")) && (await isForced("I0_3"));
const rowMarked = await win.$eval("#watch-rows tr[data-signal='Q0_7']", (e) => e.classList.contains("forced"));
await shot(win, "03-observacion.png");
await t(() => window.jwsimTest.setForce("Q0_7", null));
const q7off = await until(async () => !(await isOn("Q0_7")), 3000);
criteria.WATCH_FORCE_IO = {
  pass: w1 !== null && w2 > w1 && !!q7 && !!i3 && marked && rowMarked && !!q7off,
  vueltas: [w1, w2],
  q0_7_forced_on: !!q7,
  i0_3_forced_on: !!i3,
  board_marked: marked,
  table_marked: rowMarked,
  q0_7_released: !!q7off,
};

// ---- RECORD_REPLAY
log("RECORD_REPLAY");
await win.click(".io.input[data-signal='I0_0']");
await win.waitForTimeout(300);
await t(() => window.jwsimTest.setForce("I0_3", null));
await win.waitForTimeout(200);
await win.click(".io.input[data-signal='I0_0']");
await win.waitForTimeout(300);
const rec = await t(() => window.jwsimTest.saveRecording());
const text = rec ? readFileSync(rec.file, "utf8") : "";
const events = text.split("\n").filter((l) => /^\d/.test(l));
await win.click("#tab-buses");
if (rec) await t(([f, x]) => window.jwsimTest.replay(f, x), [rec.file, text]);
const rp = await until(() => t(() => window.jwsimTest.lastReplay()), 60000);
await shot(win, "04-reproduccion.png");
criteria.RECORD_REPLAY = {
  pass: !!rec && events.some((l) => /force Q0_7=1/.test(l)) && events.some((l) => /unforce I0_3/.test(l)) && rp?.match === true && rp?.t_ns === rec.t_ns,
  recording: rec,
  events: events.length,
  replay: rp,
};

// ---- BUS_ANALYZER (interfaz)
log("BUS_ANALYZER");
const visibleRows = () => win.$$eval("#bus-rows tr:not([hidden])", (r) => r.map((x) => x.textContent));
const i2cRows = (await visibleRows()).filter((x) => /TCA6424A.*(Leer|Escribir) (Entrada|Salida|Config)/.test(x));
await win.selectOption("#bus-filter", "SPI");
const spiRows = await visibleRows();
await shot(win, "05-buses-spi.png");
await win.selectOption("#bus-filter", "");
criteria.BUS_ANALYZER_UI = {
  pass: i2cRows.length > 0 && spiRows.length > 0 && spiRows.every((x) => /VSPI/.test(x)) && spiRows.some((x) => /TFT.*(CASET|RAMWR|SLPOUT|MADCTL)/.test(x)),
  i2c_example: i2cRows[0],
  spi_rows: spiRows.length,
  spi_example: spiRows.find((x) => /RAMWR/.test(x)) ?? spiRows[0],
};

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_G3_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_G3_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
