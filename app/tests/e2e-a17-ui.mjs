// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de las mejoras de interfaz de la línea alpha.17:
//   EXAMPLES_JWPLC   la lista de Ejemplos solo tiene librerías JWPLC_*/JW_*
//                    (sin benchmarks del package ni ejemplos del core ESP32)
//   AUTOFORMAT       Herramientas > Autoformato (Ctrl+T) formatea con el estilo
//                    JWPLC y se deshace con un solo Ctrl+Z
//   SPLITTER         arrastrar el divisor cambia el ancho del editor y se recuerda
//   SCENE_SIDE       el panel del dispositivo de la escena (pestaña Esquema
//                    eléctrico) se pliega y se despliega
//   BOARD_FRONT      la vista Placa muestra solo el frente (pantalla y botonera)
//                    y las salidas en la tira inferior
//   NO_PACKAGE_TEXT  sin el texto «JWPLC Basic · package …» arriba ni abajo
//   DOCK             panel inferior a lo ancho con las pestañas Problemas ·
//                    Compilación · Serie · Tráfico · E/S y variables ·
//                    Depuración; su alto se arrastra y se recuerda; se oculta
//                    por completo y vuelve desde la barra de estado;
//                    COM y velocidad en la barra superior (sin Proyecto ahí)
// Informe en build/gates/JWSIM_A17_UI.json y capturas en build/gates/a17-ui/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-a17-ui.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "a17-ui");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1600, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForTimeout(1000);

// ---- EXAMPLES_JWPLC
const groups = await win.$$eval("#sel-example optgroup", (gs) => gs.map((g) => g.label));
const opts = await win.$$eval("#sel-example option", (os) => os.map((o) => o.textContent));
criteria.EXAMPLES_JWPLC = {
  pass: groups.length > 0 && groups.every((g) => /^(JWPLC|JW)_/.test(g)) && groups[0] === "JWPLC_GlobalPeripherals" && !opts.includes("01_empty"),
  groups,
  examples: opts.length - 1,
};

// ---- NO_PACKAGE_TEXT
const bodyText = await win.$eval(".board-card .panel-head", (e) => e.textContent);
const footText = await win.$eval(".statusbar", (e) => e.textContent);
criteria.NO_PACKAGE_TEXT = { pass: !/package/i.test(bodyText) && !/platform-jwplc/.test(footText), head: bodyText.replace(/\s+/g, " ").trim(), foot: footText };

// ---- AUTOFORMAT
await win.evaluate(() => window.jwsimTest.openExampleNamed("01.DigitalIO_Basic"));
await win.waitForSelector(".tab.active:has-text('01.DigitalIO_Basic.ino')", { timeout: 30000 });
const messy = "void setup(){pinMode(Q0_0,OUTPUT);}\nvoid loop(){if(digitalRead(I0_0)){digitalWrite(Q0_0,HIGH);}else{digitalWrite(Q0_0,LOW);}}\n";
await win.evaluate((t) => window.jwsimTest.setActiveText(t), messy);
await win.click(".monaco-editor .view-lines");
await win.keyboard.press("Control+t");
await win.waitForTimeout(800);
const formatted = await win.evaluate(() => window.jwsimTest.activeText());
await win.screenshot({ path: join(OUT, "01-autoformato.png") });
await win.keyboard.press("Control+z");
await win.waitForTimeout(300);
const undone = await win.evaluate(() => window.jwsimTest.activeText());
const expected = "void setup()\n{\n    pinMode(Q0_0, OUTPUT);\n}\nvoid loop()\n{\n    if (digitalRead(I0_0))\n    {\n        digitalWrite(Q0_0, HIGH);\n    }\n    else\n    {\n        digitalWrite(Q0_0, LOW);\n    }\n}\n";
criteria.AUTOFORMAT = { pass: formatted === expected && undone === messy, formatted, undo_ok: undone === messy };

// ---- BOARD_FRONT
const stage = await win.$eval("#plc-stage", (e) => ({ w: e.clientWidth, h: e.clientHeight }));
const vb = await win.$eval("#plc-art svg", (s) => s.getAttribute("viewBox"));
const outStrip = await win.$$eval(".out-strip .io.output", (os) => os.map((o) => o.textContent));
await (await win.$(".board-card")).screenshot({ path: join(OUT, "02-placa-frente.png") });
criteria.BOARD_FRONT = { pass: vb.startsWith("451 520") && outStrip.length === 8 && stage.w > 0, viewBox: vb, stage, outputs: outStrip };

// ---- SPLITTER
const codeW = () => win.$eval(".code-pane", (e) => Math.round(e.getBoundingClientRect().width));
const w0 = await codeW();
const sb = await win.$eval("#splitter", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await win.mouse.move(sb.x, sb.y);
await win.mouse.down();
await win.mouse.move(sb.x - 250, sb.y, { steps: 8 });
await win.mouse.up();
await win.waitForTimeout(300);
const w1 = await codeW();
// Con el ancho fijado, la simulación sigue llegando al borde derecho.
const simRight = await win.$eval(".sim-pane", (e) => Math.round(e.getBoundingClientRect().right));
const vw = await win.evaluate(() => window.innerWidth);
const stored = await win.evaluate(() => localStorage.getItem("jwsim.codeWidth"));
await win.screenshot({ path: join(OUT, "03-divisor.png") });
await win.dblclick("#splitter");
await win.waitForTimeout(300);
const w2 = await codeW();
criteria.SPLITTER = { pass: simRight === vw && Math.abs(w0 - 250 - w1) <= 4 && Number(stored) === w1 && Math.abs(w2 - w0) <= 2, before: w0, after_drag: w1, stored, after_reset: w2, sim_right: simRight, window: vw };

// ---- SCENE_SIDE
await win.click(".mtab[data-tab=schematic]"); // la escena se abre en su pestaña
await win.waitForTimeout(500);
const sideW = () => win.$eval("#scene-side", (e) => e.getBoundingClientRect().width);
const pane = () => win.$eval(".scene-main", (e) => e.dataset.pane);
const open0 = await sideW();
const pane0 = await pane();
await win.click("#scene-tab-add");
await win.waitForTimeout(300);
const paneAdd = await pane();
const items = await win.$$eval("#scene-add .palette-item", (b) => b.length);
await win.fill("#scene-add-filter", "lámpara");
const filtered = await win.$$eval("#scene-add .palette-item:not([hidden])", (b) => b.map((x) => x.dataset.add));
await (await win.$(".board-card")).screenshot({ path: join(OUT, "04-escena-agregar.png") });
await win.fill("#scene-add-filter", "");
await win.click("#scene-tab-add");
await win.waitForTimeout(300);
const closed = await sideW();
const svgW = await win.$eval("#scene-svg", (e) => e.getBoundingClientRect().width);
const boardRight = await win.$eval(".board-card", (e) => Math.round(e.getBoundingClientRect().right));
const winW = await win.evaluate(() => window.innerWidth);
await win.click("#scene-tab-props");
await win.waitForTimeout(300);
const open1 = await sideW();
const general = await win.$eval("#scene-inspector", (e) => e.textContent);
await (await win.$(".board-card")).screenshot({ path: join(OUT, "05-escena-propiedades.png") });
criteria.SCENE_SIDE = {
  pass: open0 > 200 && pane0 === "props" && paneAdd === "add" && items > 10 && filtered.includes("jwsim/lamp") && filtered.length < items &&
    closed === 0 && open1 > 200 && /Dispositivos/.test(general) && boardRight === winW,
  open: open0, pane0, paneAdd, items, filtered, closed, scene_width_closed: svgW, board_right: boardRight, window: winW,
};

// ---- DOCK
await win.click(".mtab[data-tab=program]");
// Cambiar de vista (Placa/Escena/3D) no toca el modo de las entradas.
const modeKept = await win.$eval(".mode .seg[data-mode='toggle']", (e) => e.classList.contains("active"));
const tabs = await win.$$eval("#dock .ptab:not([hidden])", (b) => b.map((x) => x.textContent.trim()));
const dockBox = () => win.$eval("#dock", (e) => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
const d0 = await dockBox();
const ds = await win.$eval("#dock-splitter", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await win.mouse.move(ds.x, ds.y);
await win.mouse.down();
await win.mouse.move(ds.x, ds.y - 120, { steps: 8 });
await win.mouse.up();
await win.waitForTimeout(300);
const d1 = await dockBox();
const dockStored = await win.evaluate(() => localStorage.getItem("jwsim.dockHeight"));
await win.screenshot({ path: join(OUT, "06-panel-inferior.png") });
const workH = () => win.$eval(".workspace", (e) => Math.round(e.getBoundingClientRect().height));
const wOpen = await workH();
await win.click("#btn-dock-toggle");
await win.waitForTimeout(300);
const dFold = await dockBox();
const wFold = await workH();
const sbFold = await win.$eval(".statusbar", (e) => Math.round(e.getBoundingClientRect().height));
await win.screenshot({ path: join(OUT, "07-panel-oculto.png") });
await win.click("#sb-dock");
await win.waitForTimeout(300);
await win.click("#tab-buses");
const dOpen = await dockBox();
const viewport = await win.evaluate(() => window.innerWidth);
const toolbar = await win.$eval(".toolbar", (e) => ({ speed: !!e.querySelector("select#sel-speed"), com: !!e.querySelector("#btn-com"), project: !!e.querySelector("#btn-project-open, #btn-project-save") }));
criteria.DOCK = {
  pass:
    tabs.join("|") === "Problemas|Compilación|Serie|Tráfico|E/S y variables|Depuración" &&
    d0.w === viewport && Math.abs(d1.h - d0.h - 120) <= 4 && Number(dockStored) === d1.h &&
    dFold.h === 0 && wFold - wOpen >= d1.h && sbFold >= 18 && Math.abs(dOpen.h - d1.h) <= 2 && toolbar.speed && toolbar.com && !toolbar.project && modeKept,
  tabs, input_mode_kept: modeKept, before: d0, after_drag: d1, stored: dockStored, folded: dFold.h, workspace_grew: wFold - wOpen, statusbar_folded: sbFold, reopened: dOpen.h, toolbar,
};

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
const report = { gate: "JWSIM_A17_UI", pass, criteria };
writeFileSync(join(ROOT, "build", "gates", "JWSIM_A17_UI.json"), JSON.stringify(report, null, 2));
for (const [k, v] of Object.entries(criteria)) log(`${v.pass ? "PASS" : "FAIL"} ${k}`);
if (!pass) {
  console.log(JSON.stringify(criteria, null, 1));
  process.exitCode = 1;
}
