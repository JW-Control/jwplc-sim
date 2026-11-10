// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del cableado del esquema eléctrico (Electron + Playwright):
//   VFD_SCREW       un clic en el tornillo verde de la bornera de control del
//                   VFD-EL conecta ese borne (su cable interno se dibuja)
//   DRAG_CONNECT    arrastrar de un borne a otro crea el cable
//   GROUP           en el inspector de un cable: agrupar los hilos marcados
//                   entre los mismos dos equipos en un cable multipolar
//                   (tronco con su nombre y abanicos)
//   CABLE_EDIT      nombre del cable, Ctrl+Mayús+G desagrupa y Ctrl+G agrupa
//   SAVE_LOAD       se guarda en la escena (cables, hilo.cable) y se vuelve a
//                   cargar igual; el análisis sin simular no da error
//   CABLE_REF       cable como referencia: sin tronco, un rótulo en cada salida
//                   que lleva al otro lado
//   WIRE_REF        cable suelto como referencia: «→ destino» en cada borne
//   DELETE_CABLE    Supr quita el cable con sus hilos; Ctrl+Z lo devuelve
// Informe en build/gates/JWSIM_CABLES_E2E.json y capturas en build/gates/cables/.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "cables");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

createRequire(import.meta.url)("electron");
log(`iniciando Electron (carpeta de trabajo temporal: ${workspace})`);
const args = [APP];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE;
// Perfil propio (localStorage, cachés): la prueba no toca las preferencias
// de la app del usuario (alto de la ficha, panel lateral…).
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const app = await electron.launch({ args: [...args, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
// Tamaño fijo: con un perfil nuevo la ventana abre más chica.
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.click(".mtab[data-tab=schematic]");
await win.waitForTimeout(500);

const sc = (fn, arg) => win.evaluate(fn, arg);
const spec = () => sc(() => window.jwsimTest.scene.spec());
const cables = () => sc(() => window.jwsimTest.scene.cables());
const select = (id) => sc((x) => window.jwsimTest.scene.select(x), id);
const termAt = (end) => sc((e) => window.jwsimTest.scene.termScreen(e), end);
const pane = () => win.$eval(".scene-main", (e) => e.dataset.pane);
const blur = () => sc(() => document.activeElement?.blur());
const key = async (k) => {
  await blur();
  await win.keyboard.press(k);
  await win.waitForTimeout(100);
};
const panOf = () => sc(() => document.getElementById("scene-root").getAttribute("transform"));
const altAt = async (end) => {
  const b = await (await win.$(`#scene-terms .term.alt[data-term='${end}'] circle`)).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const wireBetween = async (a, b) => (await spec()).wiring.findIndex((w) => [w.from, w.to].sort().join() === [a, b].sort().join());
const openProps = async () => {
  if ((await pane()) !== "props") await win.click("#scene-tab-props");
  await win.waitForTimeout(150);
};

// Escena: la placa, un VFD-EL a la derecha y una fuente.
await sc(() => window.JwsimScene.addPlant("jwsim/vfd-el"));
await sc(() => window.jwsimTest.scene.add("jwsim/power-24vdc", -300, 0));
await win.click("#scene-fit");
await win.waitForTimeout(300);
const vf = (await spec()).devices.find((d) => d.type === "jwsim/vfd-el").id;
const ps = (await spec()).devices.find((d) => d.type === "jwsim/power-24vdc").id;
log(`escena: plc, ${vf}, ${ps}`);

// ---- VFD_SCREW
const alts = await win.$$eval(`#scene-terms g[data-id='${vf}'] .term.alt`, (g) => g.map((x) => x.dataset.term));
const m1 = await altAt(`${vf}.MI1`);
await win.mouse.click(m1.x, m1.y);
const q0 = await termAt("plc.Q0_0.2");
await win.mouse.click(q0.x, q0.y);
const w1 = await wireBetween(`${vf}.MI1`, "plc.Q0_0.2");
const internal = await win.$eval(`#scene-devices g[data-id='${vf}'] [data-show="wired.MI1"]`, (g) => g.getAttribute("display") !== "none").catch(() => false);
criteria.VFD_SCREW = { pass: alts.length === 14 && w1 >= 0 && internal, alt_targets: alts.length, wire: w1, internal_cable_drawn: internal };

// ---- DRAG_CONNECT
const m2 = await altAt(`${vf}.MI2`);
const q1 = await termAt("plc.Q0_1.2");
await win.mouse.move(m2.x, m2.y);
await win.mouse.down();
await win.mouse.move((m2.x + q1.x) / 2, (m2.y + q1.y) / 2, { steps: 6 });
await win.mouse.move(q1.x, q1.y, { steps: 6 });
await win.mouse.up();
const w2 = await wireBetween(`${vf}.MI2`, "plc.Q0_1.2");
const rubberAfter = await win.$eval("#scene-rubber", (p) => p.getAttribute("d") ?? "");
criteria.DRAG_CONNECT = { pass: w2 >= 0 && rubberAfter === "", wire: w2, rubber_cleared: rubberAfter === "" };

// Dos hilos más entre plc y el variador y uno de la fuente al plc.
await sc(([a, b]) => window.jwsimTest.scene.wire(a, b), [`${vf}.MI3`, "plc.Q0_2.2"]);
await sc(([a, b]) => window.jwsimTest.scene.wire(a, b), [`${vf}.DCM`, "plc.M0"]);
await sc(([a, b]) => window.jwsimTest.scene.wire(a, b), [`${ps}.+V1`, "plc.24VDC"]);

// ---- GROUP
await select(w1);
await openProps();
const picks = await win.$$eval("#scene-inspector [data-group-wire]", (b) => b.length);
// Se desmarca el DCM: queda fuera del cable.
const dcm = await wireBetween(`${vf}.DCM`, "plc.M0");
await win.click(`#scene-inspector [data-group-wire='${dcm}']`);
await win.click("#scene-cable-group");
await win.waitForTimeout(200);
const cs = await cables();
const sp = await spec();
const members = sp.wiring.filter((w) => w.cable === cs[0]?.id).length;
const trunk = await win.$$eval(".cable .cable-sheath", (p) => p.length);
const fans = await win.$$eval(".wire.fan", (g) => g.length);
const label = await win.$eval(".cable-label text", (t) => t.textContent).catch(() => null);
const title = await win.$eval("#scene-inspector .insp-title", (t) => t.textContent).catch(() => null);
await win.screenshot({ path: join(OUT, "01-cable.png") });
criteria.GROUP = {
  pass: picks === 4 && cs.length === 1 && members === 3 && trunk === 1 && fans === 3 && /W1 · 3 hilos/.test(label ?? "") && /Cable W1/.test(title ?? "") && !sp.wiring[dcm].cable,
  candidates: picks,
  cables: cs,
  members,
  trunk,
  fans,
  label,
  inspector: title,
};

// ---- CABLE_EDIT
await win.fill("#scene-inspector [data-cable-field='label']", "3×1 mm² mando");
await win.press("#scene-inspector [data-cable-field='label']", "Enter");
await blur();
await win.waitForTimeout(150);
const named = (await cables())[0]?.label;
const label2 = await win.$eval(".cable-label text", (t) => t.textContent).catch(() => null);
await select("cable:W1");
await key("Control+Shift+g");
const ungrouped = (await cables()).length === 0 && !(await spec()).wiring.some((w) => w.cable);
await select(w1);
await key("Control+g");
const regrouped = await cables();
const allFour = (await spec()).wiring.filter((w) => w.cable === regrouped[0]?.id).length;
criteria.CABLE_EDIT = {
  pass: named === "3×1 mm² mando" && /3×1 mm² mando/.test(label2 ?? "") && ungrouped && regrouped.length === 1 && allFour === 4,
  label: named,
  drawn_label: label2,
  ungrouped,
  regrouped_members: allFour,
};

// ---- SAVE_LOAD
const saved = await sc(() => window.JwsimScene.specForSave());
await sc((s) => window.JwsimScene.load(s), saved);
await win.waitForTimeout(300);
const reloaded = await sc(() => window.JwsimScene.specForSave());
await sc(() => window.jwsimTest.scene.analyze());
await win.waitForTimeout(500);
const analyzed = await sc(() => window.jwsimTest.scene.snapshot());
const sceneError = await win.$eval("#scene-diag", (e) => e.textContent);
criteria.SAVE_LOAD = {
  pass:
    saved.cables?.length === 1 &&
    saved.wiring.filter((w) => w.cable === saved.cables[0].id).length === 4 &&
    JSON.stringify(reloaded) === JSON.stringify(saved) &&
    !!analyzed &&
    !/inválid|error/i.test(sceneError),
  saved_cables: saved.cables,
  same_after_load: JSON.stringify(reloaded) === JSON.stringify(saved),
  analyzed: !!analyzed,
  diag: sceneError.slice(0, 200),
};

// ---- CABLE_REF
await select("cable:W1");
await openProps();
await win.click("#scene-cable-ref");
await win.waitForTimeout(200);
const refOn = (await cables())[0]?.ref === true;
const refLabels = await win.$$eval(".cable.ref .ref-label", (t) => t.map((x) => x.textContent));
const longTrunk = await win.$$eval(".cable.ref .cable-sheath", (p) => p.map((x) => x.getTotalLength()));
await win.screenshot({ path: join(OUT, "02-cable-referencia.png") });
await select(null);
// Un rótulo visible dentro del lienzo (la vista se ajusta antes).
await win.click("#scene-fit");
await win.waitForTimeout(200);
const svgC = await (await win.$("#scene-svg")).boundingBox();
const cLabs = [];
for (const el of await win.$$(".cable.ref .ref-label")) cLabs.push(await el.boundingBox());
const lab = cLabs.find((b) => b.y > svgC.y + 4 && b.y + b.height < svgC.y + svgC.height - 4 && b.x > svgC.x && b.x + b.width < svgC.x + svgC.width) ?? cLabs[0];
const p0 = await panOf();
await win.mouse.click(lab.x + lab.width / 2, lab.y + lab.height / 2);
await win.waitForTimeout(150);
const jumped = (await panOf()) !== p0;
const selAfterJump = await win.$eval("#scene-inspector .insp-title", (t) => t.textContent).catch(() => null);
criteria.CABLE_REF = {
  pass: refOn && refLabels.length === 2 && refLabels.some((t) => t === `W1 → ${vf}`) && refLabels.some((t) => t === "W1 → plc") && longTrunk.every((l) => l < 60) && jumped && /Cable W1/.test(selAfterJump ?? ""),
  ref: refOn,
  labels: refLabels,
  stub_lengths: longTrunk.map(Math.round),
  jumped,
  selected: selAfterJump,
};

// ---- WIRE_REF
const pw = await wireBetween(`${ps}.+V1`, "plc.24VDC");
await select(pw);
await openProps();
await win.click("#scene-wire-ref");
await win.waitForTimeout(200);
const wref = (await spec()).wiring[pw]?.ref === true;
const wLabels = await win.$$eval(`.wire.ref[data-wire='${pw}'] .ref-label`, (t) => t.map((x) => x.textContent));
await win.screenshot({ path: join(OUT, "03-referencia.png") });
// Un rótulo visible dentro del lienzo (la vista se ajusta antes).
await win.click("#scene-fit");
await win.waitForTimeout(200);
const svgB = await (await win.$("#scene-svg")).boundingBox();
const boxes = [];
for (const el of await win.$$(`.wire.ref[data-wire='${pw}'] .ref-label`)) boxes.push(await el.boundingBox());
const wl = boxes.find((b) => b.y > svgB.y + 4 && b.y + b.height < svgB.y + svgB.height - 4 && b.x > svgB.x && b.x + b.width < svgB.x + svgB.width);
const p1 = await panOf();
if (wl) await win.mouse.click(wl.x + wl.width / 2, wl.y + wl.height / 2);
await win.waitForTimeout(150);
criteria.WIRE_REF = {
  pass: wref && wLabels.length === 2 && wLabels.includes("→ plc.24VDC") && wLabels.includes(`→ ${ps}.+V1`) && (await panOf()) !== p1,
  ref: wref,
  labels: wLabels,
};

// ---- DELETE_CABLE
await select("cable:W1");
const nBefore = (await spec()).wiring.length;
await key("Delete");
const afterDel = await spec();
await key("Control+z");
const afterUndo = await spec();
criteria.DELETE_CABLE = {
  pass: afterDel.wiring.length === nBefore - 4 && !afterDel.cables && afterUndo.wiring.length === nBefore && afterUndo.cables?.length === 1,
  before: nBefore,
  after_delete: afterDel.wiring.length,
  after_undo: afterUndo.wiring.length,
};
// ---- REF_KEPT: agrupar y desagrupar no hace perder las referencias.
// (W1 está como referencia desde CABLE_REF, con sus 4 hilos.)
const inW1 = () => spec().then((s) => s.wiring.flatMap((w, i) => (w.cable === "W1" ? [i] : [])));
const four = await inW1();
const refsOf = (s, idx) => idx.map((i) => !!s.wiring[i].ref);
await select("cable:W1");
await key("Control+Shift+g");
const r1 = refsOf(await spec(), four);
// Todos eran referencias: al agrupar por error, el cable nace como referencia.
await sc((idx) => window.jwsimTest.scene.group(idx), four);
const regroupRef = (await cables()).find((c) => c.id === "W1")?.ref === true;
await select("cable:W1");
await key("Control+Shift+g");
const r2 = refsOf(await spec(), four);
// Caso mixto: uno deja de ser referencia; agrupar y desagrupar conserva a cada uno como estaba.
await select(four[0]);
await openProps();
await win.click("#scene-wire-ref");
await win.waitForTimeout(100);
await sc((idx) => window.jwsimTest.scene.group(idx), four);
const mixedCableRef = (await cables()).find((c) => c.id === "W1")?.ref ?? false;
await select("cable:W1");
await key("Control+Shift+g");
const r3 = refsOf(await spec(), four);
criteria.REF_KEPT = {
  pass: r1.every(Boolean) && regroupRef && r2.every(Boolean) && mixedCableRef === false && r3.join() === "false,true,true,true",
  after_ungroup_ref_cable: r1,
  regrouped_cable_is_ref: regroupRef,
  after_second_ungroup: r2,
  mixed_cable_ref: mixedCableRef,
  mixed_after_ungroup: r3,
};
await win.screenshot({ path: join(OUT, "04-final.png") });

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [name, v] of Object.entries(criteria)) console.log(`${name}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_CABLES_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_CABLES_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
