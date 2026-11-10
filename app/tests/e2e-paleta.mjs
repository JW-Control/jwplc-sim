// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de la paleta del esquema eléctrico (como el bin de Fritzing) y
// de los atajos de edición (Electron + Playwright):
//   THUMBNAILS      miniaturas por categoría, cada una con su símbolo; sin
//                   ids repetidos (las plantillas traen degradados)
//   HOVER_INFO      pasar el puntero muestra la ficha; al salir queda la del
//                   último clic
//   ARM_MODEL       doble clic elige el equipo y deja escoger el modelo
//                   (Fuente 24 VDC: MDR-60, HDR-60, NDR-120)
//   PLACE_CLICK     clic en el esquema lo pone ahí, centrado, con el modelo
//                   escogido; el panel sigue en «Agregar»
//   SHIFT_PLACE     con Mayús queda elegido para poner otro; Esc lo suelta
//   DRAG_DROP       arrastrar una miniatura al esquema la pone donde se suelta
//   NO_REMOVE_BUTTON  el inspector ya no tiene «Quitar» (equipo ni cable)
//   KEYS            Supr, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+Z y Ctrl+Y
// Informe en build/gates/JWSIM_PALETA_E2E.json y capturas en build/gates/paleta/.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "paleta");
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
const app = await electron.launch({ args, env });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.click(".mtab[data-tab=schematic]");
await win.waitForTimeout(500);
if ((await win.$eval(".scene-main", (e) => e.dataset.pane)) !== "add") await win.click("#scene-tab-add");
await win.waitForSelector("#scene-add .palette-item svg", { timeout: 10000 });

const sc = (fn, arg) => win.evaluate(fn, arg);
const spec = () => sc(() => window.jwsimTest.scene.spec());
const pal = () => sc(() => window.jwsimTest.scene.palette());
const infoTitle = () => win.$eval("#scene-part-info .insp-title", (e) => e.textContent).catch(() => null);
const pane = () => win.$eval(".scene-main", (e) => e.dataset.pane);
const tile = (type) => `#scene-add .palette-item[data-add='${type}']`;
const svgBox = async () => (await win.$("#scene-svg")).boundingBox();
const devices = async (type) => (await spec()).devices.filter((d) => d.type === type);
const blur = () => sc(() => document.activeElement?.blur());
// Captura del panel lateral; si no se puede, se anota y la prueba sigue.
const shotSide = (name) =>
  win
    .locator("#scene-side")
    .screenshot({ path: join(OUT, name), timeout: 5000 })
    .catch(async (e) => log(`captura ${name}: ${e.message.split("\n")[0]} (panel: ${await pane()})`));

// ---- THUMBNAILS
const thumbs = await win.$$eval("#scene-add .palette-item", (bs) => bs.map((b) => ({ type: b.dataset.add, size: b.querySelector("svg")?.innerHTML.length ?? 0 })));
const cats = await win.$$eval("#scene-add .palette-cat", (cs) => cs.map((c) => c.textContent));
// Un id de una miniatura no debe repetirse fuera de esa misma miniatura (dos
// plantillas ya traen algún id repetido dentro de sí: eso no cruza copias).
const dupIds = await win.$$eval("#scene-add [id]", (els) =>
  [...new Set(els.filter((e) => [...document.querySelectorAll(`[id="${CSS.escape(e.id)}"]`)].some((o) => o.closest("svg") !== e.closest("svg"))).map((e) => e.id))],
);
criteria.THUMBNAILS = {
  pass: thumbs.length > 20 && thumbs.every((t) => t.size > 40) && cats.length > 4 && dupIds.length === 0,
  items: thumbs.length,
  empty: thumbs.filter((t) => t.size <= 40).map((t) => t.type),
  categories: cats,
  duplicate_ids: dupIds.slice(0, 10),
};
await shotSide("01-paleta.png");

// ---- HOVER_INFO
await win.hover(tile("jwsim/lamp"));
const hoverLamp = await infoTitle();
await win.click(tile("jwsim/pushbutton-no"));
const pinned = await infoTitle();
await win.hover(tile("jwsim/power-24vdc"));
const hoverPs = await infoTitle();
const sb = await svgBox();
await win.mouse.move(sb.x + sb.width / 2, sb.y + 40);
const afterLeave = await infoTitle();
criteria.HOVER_INFO = {
  pass: hoverLamp === "Lámpara piloto" && pinned === "Pulsador NA" && hoverPs === "Fuente 24 VDC" && afterLeave === "Pulsador NA",
  hover_lamp: hoverLamp,
  clicked: pinned,
  hover_power: hoverPs,
  after_leave: afterLeave,
};

// ---- ARM_MODEL
await win.dblclick(tile("jwsim/power-24vdc"));
const models = await win.$$eval("#scene-part-info .model-opt", (bs) => bs.map((b) => b.dataset.value));
await win.click("#scene-part-info .model-opt[data-value='HDR-60']");
const armed = await pal();
await shotSide("02-modelo.png");
criteria.ARM_MODEL = {
  pass: armed.armed?.type === "jwsim/power-24vdc" && armed.armed.params.model === "HDR-60" && models.join() === "MDR-60,HDR-60,NDR-120",
  models,
  armed: armed.armed,
};

// ---- PLACE_CLICK
const target = { x: sb.x + sb.width * 0.45, y: sb.y + sb.height * 0.5 };
await win.mouse.move(target.x - 30, target.y - 30);
await win.mouse.move(target.x, target.y, { steps: 3 });
const ghostVisible = await win.$eval("#scene-ghost", (g) => g.getAttribute("visibility") === "visible");
await win.mouse.click(target.x, target.y);
const ps = (await devices("jwsim/power-24vdc"))[0];
const size = await sc(([t, p]) => window.jwsimTest.scene.symbolSize(t, p), ["jwsim/power-24vdc", { model: "HDR-60" }]);
const center = ps && (await sc(([x, y]) => window.jwsimTest.scene.toScreen(x, y), [ps.x + size.w / 2, ps.y + size.h / 2]));
const zoom = await sc(() => {
  const m = document.getElementById("scene-root").getAttribute("transform").match(/scale\(([\d.]+)\)/);
  return Number(m?.[1] ?? 1);
});
const off = center ? Math.max(Math.abs(center.x - target.x), Math.abs(center.y - target.y)) : null;
const tpl = ps && (await sc((id) => window.jwsimTest.scene.templateOf(id), ps.id));
const afterPlace = await pal();
criteria.PLACE_CLICK = {
  pass: !!ps && ps.params?.model === "HDR-60" && tpl === "jwsim/power-24vdc__hdr60" && off <= 20 * zoom + 2 && !afterPlace.armed && (await pane()) === "add" && ghostVisible,
  device: ps?.id,
  template: tpl,
  center_offset_px: off,
  ghost_visible: ghostVisible,
  disarmed: !afterPlace.armed,
  pane: await pane(),
};
await win.screenshot({ path: join(OUT, "03-colocado.png") });

// ---- SHIFT_PLACE
await win.dblclick(tile("jwsim/lamp"));
await win.keyboard.down("Shift");
await win.mouse.click(sb.x + sb.width * 0.25, sb.y + sb.height * 0.25);
await win.mouse.click(sb.x + sb.width * 0.25, sb.y + sb.height * 0.75);
await win.keyboard.up("Shift");
const lamps = await devices("jwsim/lamp");
const stillArmed = (await pal()).armed?.type;
await blur();
await win.keyboard.press("Escape");
const escCleared = !(await pal()).armed;
criteria.SHIFT_PLACE = { pass: lamps.length === 2 && stillArmed === "jwsim/lamp" && escCleared, lamps: lamps.map((d) => d.id), armed_after_shift: stillArmed, esc_cleared: escCleared };

// ---- DRAG_DROP
await win.dragAndDrop(tile("jwsim/pushbutton-nc"), "#scene-svg", { targetPosition: { x: sb.width * 0.7, y: sb.height * 0.3 } });
const dropped = await devices("jwsim/pushbutton-nc");
criteria.DRAG_DROP = { pass: dropped.length === 1, dropped: dropped.map((d) => ({ id: d.id, x: d.x, y: d.y })) };

// ---- NO_REMOVE_BUTTON
const lampId = lamps[0]?.id;
await sc((id) => window.jwsimTest.scene.select(id), lampId);
// Al seleccionar se abre «Propiedades» solo (un clic en su pestaña la plegaría).
if ((await pane()) !== "props") await win.click("#scene-tab-props");
await win.waitForTimeout(200);
const devButtons = await win.$$eval("#scene-inspector button", (bs) => bs.map((b) => b.textContent));
await sc(([a, b]) => window.jwsimTest.scene.wire(a, b), [`${ps.id}.+V1`, `${lampId}.X1`]);
const wireIdx = (await spec()).wiring.length - 1;
await sc((i) => window.jwsimTest.scene.select(i), wireIdx);
const wireButtons = await win.$$eval("#scene-inspector button", (bs) => bs.map((b) => b.textContent));
await shotSide("04-inspector.png");
criteria.NO_REMOVE_BUTTON = {
  pass: !devButtons.some((t) => /Quitar/.test(t)) && !wireButtons.some((t) => /Quitar/.test(t)) && !(await win.$("#scene-del")),
  device_buttons: devButtons.filter((t) => t.length < 30),
  wire_buttons: wireButtons.filter((t) => t.length < 30),
};

// ---- KEYS
const key = async (k) => {
  await blur();
  await win.keyboard.press(k);
  await win.waitForTimeout(80);
};
const has = async (id) => (await spec()).devices.some((d) => d.id === id);
const wires = async () => (await spec()).wiring.length;
const k = {};
// Supr sobre el cable: se quita; Ctrl+Z lo devuelve.
const w0 = await wires();
await key("Delete");
k.delete_wire = (await wires()) === w0 - 1;
await key("Control+z");
k.undo_wire = (await wires()) === w0;
// Ctrl+X sobre el pulsador: se quita (y sus cables); Ctrl+V lo vuelve a poner.
const btn = dropped[0]?.id;
await sc((id) => window.jwsimTest.scene.select(id), btn);
await key("Control+x");
k.cut = !(await has(btn));
await key("Control+v");
k.paste_after_cut = (await devices("jwsim/pushbutton-nc")).length === 1;
// Ctrl+Z dos veces: deshace el pegado y el corte (vuelve con su id); Ctrl+Y rehace.
await key("Control+z");
k.undo_paste = (await devices("jwsim/pushbutton-nc")).length === 0;
await key("Control+z");
k.undo_cut = await has(btn);
await key("Control+y");
k.redo = !(await has(btn));
await key("Control+z");
// Ctrl+C / Ctrl+V: copia la lámpara con sus parámetros.
await sc((id) => window.jwsimTest.scene.select(id), lampId);
await key("Control+c");
await key("Control+v");
k.copy_paste = (await devices("jwsim/lamp")).length === 3;
// Supr sobre un equipo; la placa no se quita ni se corta.
await key("Delete");
k.delete_device = (await devices("jwsim/lamp")).length === 2;
criteria.KEYS = { pass: Object.values(k).every(Boolean), ...k };

// ---- MODEL_WITHOUT_DBLCLICK: con el equipo solo con clic (sin elegir), los
// modelos de la ficha se pueden escoger; escoger uno lo deja elegido, se
// recuerda y la miniatura lo muestra.
if ((await pane()) !== "add") await win.click("#scene-tab-add");
await win.waitForTimeout(200);
const tileBefore = await win.$eval(tile("jwsim/lamp"), (b) => b.innerHTML.length);
await win.click(tile("jwsim/lamp"));
const chips = await win.$$eval("#scene-part-info .model-opt", (bs) => bs.map((b) => `${b.dataset.modelParam}=${b.dataset.value}`));
await win.click("#scene-part-info .model-opt[data-value='AD16']");
const armedAd16 = (await pal()).armed;
const tileAfter = await win.$eval(tile("jwsim/lamp"), (b) => b.innerHTML.length);
await shotSide("06-modelo-sin-doble-clic.png");
await win.mouse.click(sb.x + sb.width * 0.8, sb.y + sb.height * 0.7);
const newLamp = (await devices("jwsim/lamp")).find((d) => d.params?.model === "AD16");
const lampTpl = newLamp && (await sc((id) => window.jwsimTest.scene.templateOf(id), newLamp.id));
// Doble clic otra vez: vuelve con el último modelo escogido.
await win.dblclick(tile("jwsim/lamp"));
const remembered = (await pal()).armed?.params?.model;
await blur();
await win.keyboard.press("Escape");
// ---- WIRE_PAN: con un cable en curso, mover la vista (clic derecho, rueda o
// clic izquierdo arrastrando en un lugar vacío) y el zoom lo conservan; un
// clic sin arrastrar lo suelta; el clic derecho sobre un equipo no lo mueve.
const termAt = (end) => sc((e) => window.jwsimTest.scene.termScreen(e), end);
const rubber = () => win.$eval("#scene-rubber", (p) => p.getAttribute("d") ?? "");
const panXY = () => sc(() => document.getElementById("scene-root").getAttribute("transform"));
// Un punto vacío del lienzo (debajo solo está el fondo).
const emptyPoint = () =>
  sc(() => {
    const r = document.getElementById("scene-svg").getBoundingClientRect();
    for (let y = r.top + 60; y < r.bottom - 20; y += 30)
      for (let x = r.left + 60; x < r.right - 20; x += 30) if (document.elementFromPoint(x, y)?.id === "scene-bg") return { x, y };
    return null;
  });
const dragWith = async (button, dx, dy, from) => {
  const p = from ?? (await emptyPoint());
  await win.mouse.move(p.x, p.y);
  await win.mouse.down({ button });
  await win.mouse.move(p.x + dx / 2, p.y + dy / 2, { steps: 4 });
  await win.mouse.move(p.x + dx, p.y + dy, { steps: 4 });
  await win.mouse.up({ button });
};
if ((await pal()).armed) await key("Escape");
const startTerm = await termAt(`${ps.id}.+V2`);
await win.mouse.click(startTerm.x, startTerm.y);
await win.mouse.move(startTerm.x + 40, startTerm.y + 30, { steps: 3 }); // la goma se dibuja al mover
const wp = {};
wp.started = (await rubber()).length > 0;
const t0 = await panXY();
await dragWith("right", 120, 60);
wp.right_drag_keeps = (await rubber()).length > 0 && (await panXY()) !== t0;
await dragWith("middle", -80, 40);
wp.middle_drag_keeps = (await rubber()).length > 0;
await dragWith("left", 60, -50);
wp.left_drag_empty_keeps = (await rubber()).length > 0;
const ep = await emptyPoint();
await win.mouse.move(ep.x, ep.y);
await win.mouse.wheel(0, -200);
await win.waitForTimeout(100);
wp.wheel_keeps = (await rubber()).length > 0;
const endTerm = await termAt(`${lampId}.X2`);
const nWires = await wires();
await win.mouse.click(endTerm.x, endTerm.y);
wp.connected_after_pan = (await wires()) === nWires + 1 && (await spec()).wiring.some((w) => [w.from, w.to].sort().join() === [`${ps.id}.+V2`, `${lampId}.X2`].sort().join());
// Un clic derecho sin arrastrar suelta el cable en curso.
const s2 = await termAt(`${ps.id}.-V2`);
await win.mouse.click(s2.x, s2.y);
const ep2 = await emptyPoint();
await win.mouse.click(ep2.x, ep2.y, { button: "right" });
wp.right_click_cancels = (await rubber()) === "" && (await wires()) === nWires + 1;
// Clic derecho arrastrando sobre un equipo: mueve la vista, no el equipo.
const lampBefore = (await spec()).devices.find((d) => d.id === lampId);
const lb = await (await win.$(`#scene-root .dev[data-id='${lampId}']`)).boundingBox();
await dragWith("right", 70, 0, { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 });
const lampAfter = (await spec()).devices.find((d) => d.id === lampId);
wp.right_drag_on_device_pans = lampAfter.x === lampBefore.x && lampAfter.y === lampBefore.y;
criteria.WIRE_PAN = { pass: Object.values(wp).every(Boolean), ...wp };
await win.screenshot({ path: join(OUT, "08-cable-y-vista.png") });

// ---- SPLITTER: paneles «Equipos» y «Ficha del equipo» con su barra de
// título; el divisor cambia el alto de la ficha, se recuerda y doble clic lo
// restablece.
if ((await pane()) !== "add") await win.click("#scene-tab-add");
await win.waitForTimeout(200);
const bars = await win.$$eval(".parts-pane .panel-bar", (b) => b.map((x) => x.textContent));
const infoH = () => win.$eval(".parts-inspector", (e) => Math.round(e.getBoundingClientRect().height));
const h0 = await infoH();
const spl = await (await win.$("#parts-splitter")).boundingBox();
await win.mouse.move(spl.x + spl.width / 2, spl.y + spl.height / 2);
await win.mouse.down();
await win.mouse.move(spl.x + spl.width / 2, spl.y - 50, { steps: 4 });
await win.mouse.move(spl.x + spl.width / 2, spl.y - 100, { steps: 4 });
await win.mouse.up();
const h1 = await infoH();
const storedH = await sc(() => localStorage.getItem("jwsim.partsInfoHeight"));
await win.click(tile("jwsim/lamp"));
await shotSide("07-ficha-alta.png");
await win.dblclick("#parts-splitter");
const h2 = await infoH();
criteria.SPLITTER = {
  pass: bars.join("|") === "Equipos|Ficha del equipo" && Math.abs(h1 - h0 - 100) <= 6 && Number(storedH) === h1 && Math.abs(h2 - h0) <= 2,
  bars,
  before: h0,
  after_drag: h1,
  stored: storedH,
  after_reset: h2,
};

criteria.MODEL_WITHOUT_DBLCLICK = {
  pass: chips.includes("model=AD16") && armedAd16?.type === "jwsim/lamp" && armedAd16.params.model === "AD16" && lampTpl === "jwsim/lamp__ad16" && remembered === "AD16" && tileAfter !== tileBefore,
  chips,
  armed: armedAd16,
  placed_template: lampTpl,
  remembered,
  tile_updated: tileAfter !== tileBefore,
};
await win.screenshot({ path: join(OUT, "05-final.png") });

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [name, v] of Object.entries(criteria)) console.log(`${name}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_PALETA_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_PALETA_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
