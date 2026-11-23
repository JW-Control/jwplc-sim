// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de la Planta 3D armable (modo «Armar», scene3d-armar.js):
//   PANEL      el botón «Armar» abre el panel de piezas: categorías, buscador
//              y contador
//   ALINEADO   en el acomodo automático la huella de cada equipo y del
//              tablero ya cae en la rejilla de 0,5 m (y en las juntas de la losa)
//   MOVER      arrastrar un equipo lo mueve sobre la rejilla y queda en su p3
//   GIRAR      R gira 90° lo seleccionado; Ctrl+Z lo deshace
//   PIEZA      una pieza de ambiente (baranda) se pone con clic en el panel y
//              clic en el piso; sus medidas se editan; Supr la quita
//   EQUIPO     un equipo con E/S puesto desde el panel aparece también en el
//              esquema (sin cablear)
//   REJILLA    la rejilla de 0,25 m queda en la escena y se ve al armar
//   GUARDAR    lo armado viaja en specForSave y vuelve igual al cargar
//   SIN_ERRORES ningún error en la consola
// Capturas en build/gates/3d-armar/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-3d-armar.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "3d-armar");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const log = (m) => console.log(`[e2e] ${m}`);
const criteria = {};
const errors = [];
let stage = "inicio";

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
win.on("console", (m) => m.type() === "error" && errors.push(`[${stage}] ${m.text()}`));
win.on("pageerror", (e) => errors.push(`[${stage}] ${e.stack ?? e}`));
await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
await win.waitForFunction(() => window.jwsimTest.archs().length > 0, null, { timeout: 20000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => win.locator("#view3d").screenshot({ path: join(OUT, n) });
const spec = () => t(() => JSON.parse(JSON.stringify(window.JwsimScene.specForSave())));
// La posición se ajusta a la rejilla (0,5 m por defecto).
const onGrid = (v, g = 0.5) => Math.abs(v / g - Math.round(v / g)) < 0.01;

try {
  await t(() => window.jwsimTest.pickArch("02-montacargas"));
  await sleep(2000);
  await t(() => window.jwsimTest.scene.view("3d"));
  await sleep(2500);

  stage = "PANEL";
  // PANEL
  await win.click("#view3d-armar");
  await sleep(300);
  const ui = await t(() => ({
    open: !document.getElementById("view3d-build").hidden,
    cats: [...document.querySelectorAll("#vb-cat option")].map((o) => o.textContent),
    items: document.querySelectorAll("#vb-list .vb-item").length,
    count: document.getElementById("vb-count").textContent,
  }));
  await win.fill("#vb-search", "baranda");
  await sleep(150);
  const found = await t(() => [...document.querySelectorAll("#vb-list .vb-item")].map((i) => i.textContent));
  await win.fill("#vb-search", "");
  await shot("panel.png");
  criteria.PANEL = { ok: ui.open && ui.cats.includes("Estructura") && ui.items > 15 && found.length === 1 && /Baranda/.test(found[0]), ...ui, found };
  log(`PANEL ${JSON.stringify(criteria.PANEL)}`);

  stage = "MOVER";
  stage = "ALINEADO";
  // Huellas de todo lo movible (tablero y equipos) en el montacargas y en el
  // tratamiento de agua, que tiene más equipos en fila.
  const huellas = () => t(() => window.Jwsim3D.armar().ids.map((k) => ({ k, ...window.Jwsim3D.armAt(k) })));
  const fpsLift = await huellas();
  await t(() => window.jwsimTest.pickArch("03-tratamiento-agua"));
  await sleep(2000);
  await t(() => window.jwsimTest.scene.view("3d"));
  await sleep(2000);
  const fpsAgua = await huellas();
  await t(() => window.jwsimTest.pickArch("02-montacargas"));
  await sleep(2000);
  await t(() => window.jwsimTest.scene.view("3d"));
  await sleep(2000);
  await t(() => window.Jwsim3D.armar(true));
  await sleep(300);
  await t(() => window.Jwsim3D.camera([1.5, 7, 7], [2.5, 0, 0]));
  await sleep(600);
  await shot("rejilla.png");
  const fps = [...fpsLift, ...fpsAgua];
  const off = fps.filter((f) => !onGrid(f.fx) || !onGrid(f.fz));
  criteria.ALINEADO = { ok: fpsLift.length >= 2 && fpsAgua.length >= 2 && off.length === 0, lift: fpsLift.map((f) => f.k), agua: fpsAgua.map((f) => f.k), off };
  log(`ALINEADO ${JSON.stringify(criteria.ALINEADO)}`);

  // MOVER: el montacargas, desde un punto de su foso, 1 m a la derecha.
  const o = await t(() => window.Jwsim3D.armAt("dev:CAB1"));
  const a = await t(([x, z]) => window.Jwsim3D.groundScreen(x, z), [o.x + 0.55, 0.3]);
  const b = await t(([x, z]) => window.Jwsim3D.groundScreen(x, z), [o.x + 1.55, 0.3]);
  await win.mouse.move(a[0], a[1]);
  await win.mouse.down();
  for (let i = 1; i <= 8; i++) await win.mouse.move(a[0] + ((b[0] - a[0]) * i) / 8, a[1] + ((b[1] - a[1]) * i) / 8);
  await win.mouse.up();
  await sleep(1200);
  const moved = await t(() => window.Jwsim3D.armAt("dev:CAB1"));
  const p3 = (await spec()).devices.find((d) => d.id === "CAB1").p3;
  const sel = (await t(() => window.Jwsim3D.armar())).sel;
  criteria.MOVER = { ok: Math.abs(moved.fx - o.fx - 1) < 0.01 && onGrid(moved.fx) && Math.abs(p3?.x - moved.x) < 0.01 && sel?.id === "CAB1", from: o, to: moved, p3, sel };
  log(`MOVER ${JSON.stringify(criteria.MOVER)}`);
  await shot("movido.png");

  stage = "GIRAR";
  // GIRAR y deshacer
  await win.keyboard.press("r");
  await sleep(1000);
  const rot = (await spec()).devices.find((d) => d.id === "CAB1").p3;
  const rotAt = await t(() => window.Jwsim3D.armAt("dev:CAB1"));
  await t(() => window.JwsimScene.undo());
  await sleep(1000);
  const back = (await spec()).devices.find((d) => d.id === "CAB1").p3;
  criteria.GIRAR = { ok: rot?.r === 90 && onGrid(rotAt.fx) && onGrid(rotAt.fz) && !back?.r && Math.abs(back?.x - moved.x) < 0.01, rot, rotAt, back };
  log(`GIRAR ${JSON.stringify(criteria.GIRAR)}`);

  stage = "PIEZA";
  // PIEZA: baranda delante del montacargas; medida 3 m; luego Supr.
  await win.click('#vb-list .vb-item[data-key="piece:baranda"]');
  const c = await t(([x, z]) => window.Jwsim3D.groundScreen(x, z), [o.x + 1.5, 2.0]);
  await win.mouse.click(c[0], c[1]);
  await sleep(1200);
  const pc = (await spec()).plant3d?.pieces ?? [];
  await win.fill('#vb-props input[data-dim="largo"]', "3");
  await win.press('#vb-props input[data-dim="largo"]', "Tab");
  await sleep(1000);
  const pc2 = (await spec()).plant3d?.pieces ?? [];
  await shot("baranda.png");
  await t(() => document.activeElement?.blur());
  await win.keyboard.press("Delete");
  await sleep(1000);
  const pc3 = (await spec()).plant3d?.pieces ?? [];
  criteria.PIEZA = { ok: pc.length === 1 && pc[0].kind === "baranda" && pc2[0]?.params?.largo === 3 && pc3.length === 0, pc, pc2, pc3 };
  log(`PIEZA ${JSON.stringify(criteria.PIEZA)}`);

  stage = "EQUIPO";
  // EQUIPO: un motor desde el panel aparece en el esquema con su p3.
  const before = (await spec()).devices.map((d) => d.id);
  await win.click('#vb-list .vb-item[data-key="type:jwsim/motor-3ph"]');
  const m = await t(([x, z]) => window.Jwsim3D.groundScreen(x, z), [o.x - 2, 2.0]);
  await win.mouse.click(m[0], m[1]);
  await sleep(1500);
  const after = (await spec()).devices;
  const nuevo = after.find((d) => !before.includes(d.id));
  const in3d = nuevo ? await t((id) => !!window.Jwsim3D.armAt(`dev:${id}`), nuevo.id) : false;
  criteria.EQUIPO = { ok: !!nuevo && nuevo.type === "jwsim/motor-3ph" && !!nuevo.p3 && in3d, nuevo, in3d };
  log(`EQUIPO ${JSON.stringify(criteria.EQUIPO)}`);
  await shot("motor.png");

  stage = "REJILLA";
  // REJILLA
  await win.selectOption("#vb-grid", "0.25");
  await sleep(800);
  const g = (await spec()).plant3d?.grid;
  const st = await t(() => window.Jwsim3D.armar());
  criteria.REJILLA = { ok: g === 0.25 && st.gridShown === 0.25, grid: g, shown: st.gridShown };
  log(`REJILLA ${JSON.stringify(criteria.REJILLA)}`);

  stage = "GUARDAR";
  // GUARDAR: una pieza más, specForSave → load → la planta vuelve igual.
  await win.click('#vb-list .vb-item[data-key="piece:plataforma"]');
  const d = await t(([x, z]) => window.Jwsim3D.groundScreen(x, z), [o.x + 4, -1]);
  await win.mouse.click(d[0], d[1]);
  await sleep(1200);
  const saved = await spec();
  await t((sc) => window.JwsimScene.load(sc, { preserveView: true }), saved);
  await sleep(2000);
  const again = await spec();
  const pieceBack = await t(() => window.Jwsim3D.armAt("piece:A1"));
  criteria.GUARDAR = { ok: JSON.stringify(again.plant3d) === JSON.stringify(saved.plant3d) && JSON.stringify(again.devices.map((x) => x.p3 ?? null)) === JSON.stringify(saved.devices.map((x) => x.p3 ?? null)) && !!pieceBack, plant3d: again.plant3d, pieceBack };
  log(`GUARDAR ${JSON.stringify(criteria.GUARDAR)}`);
  await t(() => window.Jwsim3D.armar(false));
  await sleep(300);
  await t(() => window.Jwsim3D.camera([3, 6, 12], [3, 1, 0]));
  await sleep(500);
  await shot("armado.png");
} catch (e) {
  errors.push(`excepción: ${e.stack ?? e}`);
} finally {
  criteria.SIN_ERRORES = { ok: errors.length === 0, errors: errors.slice(0, 8) };
  log(`SIN_ERRORES ${JSON.stringify(criteria.SIN_ERRORES)}`);
  await app.close().catch(() => {});
}
const ok = ["PANEL", "ALINEADO", "MOVER", "GIRAR", "PIEZA", "EQUIPO", "REJILLA", "GUARDAR", "SIN_ERRORES"].every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_3D_ARMAR_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_3D_ARMAR_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
