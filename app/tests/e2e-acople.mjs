// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del acople térmico–contactor en el esquema (Electron + Playwright):
//   SNAP        arrastrar el térmico cerca de su lugar bajo el contactor lo
//               imanta: queda en (x, y + 340) con mount = contactor
//   FOLLOW      al mover el contactor, el térmico acoplado va con él
//   RUN         motor por contactor y térmico acoplado, sin cables entre
//               ellos: al pulsar, el motor arranca y el térmico mide
//   UNDO        Ctrl+Z tras separar devuelve el acople
//   DETACH      arrastrar el térmico lejos lo suelta (sin mount)
// Informe en build/gates/JWSIM_ACOPLE_E2E.json y capturas en build/gates/acople/.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "acople");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

createRequire(import.meta.url)("electron");
const args = [APP];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE;
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const app = await electron.launch({ args: [...args, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.click(".mtab[data-tab=schematic]");
await win.waitForTimeout(500);

const sc = (fn, arg) => win.evaluate(fn, arg);
const spec = () => sc(() => window.jwsimTest.scene.spec());
const dev = async (id) => (await spec()).devices.find((d) => d.id === id);
const screen = (x, y) => sc(([a, b]) => window.jwsimTest.scene.toScreen(a, b), [x, y]);
/** Arrastra el equipo tomándolo en (ox, oy) de su símbolo y lo suelta movido (dx, dy). */
async function drag(id, ox, oy, dx, dy) {
  const d = await dev(id);
  const a = await screen(d.x + ox, d.y + oy);
  const b = await screen(d.x + ox + dx, d.y + oy + dy);
  await win.mouse.move(a.x, a.y);
  await win.mouse.down();
  await win.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 8 });
  await win.mouse.move(b.x, b.y, { steps: 8 });
  await win.mouse.up();
  await win.waitForTimeout(300);
}

// Red trifásica, pulsador, contactor (bobina 230 VAC), térmico suelto y motor.
// A la derecha de la placa, en una zona libre.
const plc = (await spec()).devices.find((d) => d.type === "jwsim/jwplc-basic") ?? { x: 0, y: 0 };
const X0 = Math.round(((plc.x ?? 0) + 600) / 20) * 20;
const Y0 = Math.round((plc.y ?? 0) / 20) * 20;
await sc(([X0, Y0]) => {
  const s = window.jwsimTest.scene;
  s.add("jwsim/power-3ph", X0, Y0, "R");
  s.add("jwsim/pushbutton-no", X0 + 300, Y0, "S");
  s.add("jwsim/contactor", X0 + 520, Y0, "KM");
  s.setParam("KM", "coil", "230VAC");
  s.add("jwsim/overload-relay", X0 + 860, Y0, "F");
  s.setParam("F", "range", "2.5-4 A");
  s.setParam("F", "ajuste", 3.2);
  s.add("jwsim/motor-3ph", X0 + 860, Y0 + 460, "M");
  for (const [a, b] of [["R.L1", "S.13"], ["S.14", "KM.A1"], ["KM.A2", "R.L2"], ["R.L1", "KM.1"], ["R.L2", "KM.3"], ["R.L3", "KM.5"],
    ["F.2", "M.U1"], ["F.4", "M.V1"], ["F.6", "M.W1"]]) s.wire(a, b);
}, [X0, Y0]);
await win.click("#scene-fit");
await win.waitForTimeout(300);
await sc(() => window.jwsimTest.scene.select(null));
await win.waitForTimeout(400);
await win.screenshot({ path: join(OUT, "01-suelto.png") });

// SNAP: el térmico se suelta a 12 px de su lugar (100, 40): el imán lo acopla.
let f = await dev("F");
let km0 = await dev("KM");
await drag("F", 150, 42, km0.x - f.x + 12, km0.y + 340 - f.y - 8);
f = await dev("F");
criteria.SNAP = { pass: f.mount === "KM" && f.x === km0.x && f.y === km0.y + 340, F: f };
await win.screenshot({ path: join(OUT, "02-acoplado.png") });

// FOLLOW: el contactor se mueve 120 px a la izquierda y el térmico va con él.
await drag("KM", 100, 160, -120, 0);
const km = await dev("KM");
f = await dev("F");
criteria.FOLLOW = { pass: f.mount === "KM" && f.x === km.x && f.y === km.y + 340, KM: km, F: f };

// RUN: sin cables entre contactor y térmico, el motor arranca.
const err = await sc(async () => {
  await window.jwsimTest.scene.analyze();
  return document.querySelector("#scene-error")?.textContent?.trim() ?? "";
});
await win.click("#btn-run");
await win.waitForFunction(() => window.jwsimTest.status() === "running", null, { timeout: 240000 });
await win.waitForTimeout(1000);
await sc(() => window.jwsimTest.scene.act("S", "press", true));
let run = null;
for (let i = 0; i < 30 && !run?.ok; i++) {
  await win.waitForTimeout(300);
  run = await sc(() => {
    const o = (id) => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === id)?.outputs ?? {};
    return { ok: o("KM").closed === true && o("M").running === true, KM_closed: o("KM").closed, M_running: o("M").running, F_corriente: o("F").corriente };
  });
}
criteria.RUN = { pass: !!run?.ok, ...run, analyze: err };
await win.screenshot({ path: join(OUT, "03-en-marcha.png") });
await sc(() => window.jwsimTest.scene.act("S", "press", false));
await win.click("#btn-stop");
await win.waitForFunction(() => window.jwsimTest.status() !== "running", null, { timeout: 30000 });
await win.waitForTimeout(500);

// DETACH: el térmico se arrastra 200 px a la derecha y queda suelto.
await drag("F", 150, 42, 200, 0);
f = await dev("F");
const detached = !f.mount;
// UNDO: Ctrl+Z vuelve a acoplarlo.
await sc(() => window.jwsimTest.scene.undo());
await win.waitForTimeout(300);
const fu = await dev("F");
criteria.UNDO = { pass: fu.mount === "KM", F: fu };
// Rehacer deja el térmico suelto otra vez.
await sc(() => window.jwsimTest.scene.redo());
await win.waitForTimeout(300);
f = await dev("F");
criteria.DETACH = { pass: detached && !f.mount, F: f };
await win.screenshot({ path: join(OUT, "04-separado.png") });

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [name, v] of Object.entries(criteria)) console.log(`${name}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "JWSIM_ACOPLE_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_ACOPLE_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
