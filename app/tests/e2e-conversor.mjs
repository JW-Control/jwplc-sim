// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del conversor USB a RS-485 y del cable USB a PC de la escena
// (Linux, con pares de pty en lugar de com0com). El JWPLC corre
// JW_ModbusRTU/Slave_Holding (esclavo 2, 115200 8N1) y la prueba hace de
// JW Modbus Tool: manda «leer HR1» (02 03 0001 0001) por el COM del conversor.
//   SIN_ECO        la PC recibe solo la respuesta (02 03 02 0064 + CRC)
//   CON_ECO        la PC recibe primero su propia petición y luego la respuesta
//   AB_INVERTIDOS  basura en el bus: el esclavo no responde
//   CRUZADOS       A y B cruzados en la escena: tampoco responde
//   SIN_CABLEAR    sin los cables A/B no pasa nada, ni con eco… salvo el eco
//   CABLE_USB      el cable USB a PC lleva el Monitor serie a su COM
//   PLACA_FORZADAS en la vista Placa, varias entradas forzadas siguen sobre
//                  su borne
// Informe en build/gates/JWSIM_CONVERSOR_E2E.json.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-conversor.mjs
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { _electron as electron } from "playwright";

import { withCrc } from "../../scene/modbus.mjs";
import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

// Par de pty: el Sim abre el esclavo; la prueba lee/escribe el maestro.
function ptyPair() {
  const proc = spawn("python3", [join(APP, "tests", "helpers", "pty-pair.py")], { stdio: ["pipe", "pipe", "inherit"] });
  const p = { proc, path: null, rx: Buffer.alloc(0) };
  createInterface({ input: proc.stdout }).on("line", (l) => {
    if (l.startsWith("PTY ")) p.path = l.slice(4);
    else if (l.startsWith("R ")) p.rx = Buffer.concat([p.rx, Buffer.from(l.slice(2), "hex")]);
  });
  p.write = (buf) => proc.stdin.write(`W ${Buffer.from(buf).toString("hex")}\n`);
  return p;
}
const rs = ptyPair();
const usb = ptyPair();

const { root, lock } = resolvePackageRoot();
const examples = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-ws-")) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args, env });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(50);
  }
  return null;
};
const status = () => t(() => window.jwsimTest.status());
const consoleText = () => win.$eval("#console", (e) => e.textContent);
await until(() => rs.path && usb.path, 5000);

await t((dir) => window.jwsimTest.openSketchDir(dir), join(examples, "JW_ModbusRTU", "examples", "Slave_Holding"));
await win.waitForSelector(".tab.active:has-text('Slave_Holding.ino')", { timeout: 10000 });

// Escena: el conversor en el RS-485 y el cable USB en el puerto USB-C.
await win.click(".mtab[data-tab=schematic]");
await win.waitForTimeout(300);
await t(([rsPath, usbPath]) => {
  const sc = window.jwsimTest.scene;
  sc.add("jwsim/usb-rs485", 560, 640, "U1");
  sc.setParam("U1", "com", rsPath);
  sc.add("jwsim/usb-pc", 400, 660, "PC");
  sc.setParam("PC", "com", usbPath);
  sc.wire("PC.USB", "plc.USB");
}, [rs.path, usb.path]);
// Captura de la escena con el conversor cableado (para revisar los símbolos).
mkdirSync(join(ROOT, "build", "gates", "conversor"), { recursive: true });
await t(() => {
  for (const [a, b] of [["U1.A", "plc.RS485_A"], ["U1.B", "plc.RS485_B"], ["U1.GND", "plc.RS485_GND"]]) window.jwsimTest.scene.wire(a, b);
  window.jwsimTest.scene.setParam("U1", "eco", true);
});
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await win.waitForTimeout(300);
await win.click("#scene-fit");
await win.waitForTimeout(800);
await win.screenshot({ path: join(ROOT, "build", "gates", "conversor", "escena.png") });
await t(() => window.jwsimTest.scene.setParam("U1", "eco", false));
const wire = (pairs) =>
  t((ps) => {
    const sc = window.jwsimTest.scene;
    const spec = sc.spec();
    // Quita los cables del conversor y pone los pedidos.
    for (let i = spec.wiring.length - 1; i >= 0; i--) {
      const w = spec.wiring[i];
      if (w.from.startsWith("U1.") || w.to.startsWith("U1.")) {
        sc.select(i);
        window.jwsimTest.scene.removeSelected?.();
      }
    }
    for (const [a, b] of ps) sc.wire(a, b);
    return window.jwsimTest.scene.spec().wiring.filter((w) => w.from.startsWith("U1.") || w.to.startsWith("U1."));
  }, pairs);
const setParams = (p) => t((ps) => Object.entries(ps).forEach(([k, v]) => window.jwsimTest.scene.setParam("U1", k, v)), p);

const REQ = Buffer.from(withCrc([0x02, 0x03, 0x00, 0x01, 0x00, 0x01]));
const RESP = Buffer.from(withCrc([0x02, 0x03, 0x02, 0x00, 0x64]));

async function round(name, { params, wiring, expect }) {
  log(name);
  await setParams(params);
  const w = await wire(wiring);
  rs.rx = Buffer.alloc(0);
  usb.rx = Buffer.alloc(0);
  await win.click("#btn-run");
  await until(async () => (await status()) === "running", 600000);
  await until(async () => /Modbus RTU Slave/.test(await consoleText()), 15000);
  await win.waitForTimeout(300);
  rs.rx = Buffer.alloc(0);
  rs.write(REQ);
  const want = Buffer.concat(expect);
  await until(() => rs.rx.length >= want.length && want.length > 0, 3000);
  await win.waitForTimeout(500);
  const got = rs.rx;
  const text = await consoleText();
  await win.click("#btn-stop");
  await until(async () => (await status()) !== "running", 5000);
  await win.waitForTimeout(300);
  const link = text.split("\n").filter((l) => l.includes("[jwsim] U1:")).pop() ?? "";
  criteria[name] = { pass: got.equals(want), esperado: want.toString("hex"), recibido: got.toString("hex"), cables: w.length, consola: link, usb: usb.rx.toString("latin1").slice(0, 60) };
  return { got, text };
}

const OK = [["U1.A", "plc.RS485_A"], ["U1.B", "plc.RS485_B"], ["U1.GND", "plc.RS485_GND"]];
await round("SIN_ECO", { params: { eco: false, abInvertidos: false }, wiring: OK, expect: [RESP] });
// El cable USB llevó el saludo del sketch a su COM en la misma corrida.
criteria.CABLE_USB = { pass: /JW_ModbusRTU - Modbus RTU Slave/.test(criteria.SIN_ECO.usb), recibido: criteria.SIN_ECO.usb };
await round("CON_ECO", { params: { eco: true }, wiring: OK, expect: [REQ, RESP] });
await round("AB_INVERTIDOS", { params: { eco: false, abInvertidos: true }, wiring: OK, expect: [] });
await round("CRUZADOS", { params: { abInvertidos: false }, wiring: [["U1.A", "plc.RS485_B"], ["U1.B", "plc.RS485_A"]], expect: [] });
await round("CRUZADOS_E_INVERTIDOS", { params: { abInvertidos: true }, wiring: [["U1.A", "plc.RS485_B"], ["U1.B", "plc.RS485_A"]], expect: [RESP] });
await round("SIN_CABLEAR_CON_ECO", { params: { eco: true, abInvertidos: false }, wiring: [], expect: [REQ] });

// Placa: varias entradas forzadas siguen sobre su borne (antes, .io.forced
// tenía position: relative y la segunda en adelante se corría a la derecha).
log("PLACA_FORZADAS");
await win.click(".mtab[data-tab=board]");
await win.click("#btn-run");
await until(async () => (await status()) === "running", 600000);
for (const s of ["I0_0", "I0_3", "I0_5"]) await t((x) => window.jwsimTest.setForce(x, 1), s);
await win.waitForTimeout(300);
const off = await t(() =>
  [...document.querySelectorAll(".io.input")].map((b) => {
    const r = b.getBoundingClientRect();
    const a = document.querySelector(`#plc-art .led-ancla[data-senal="${b.dataset.signal}"]`).getBoundingClientRect();
    return [b.dataset.signal, Math.round(r.left + r.width / 2 - (a.left + a.width / 2)), b.classList.contains("forced")];
  }),
);
await win.click("#btn-stop");
criteria.PLACA_FORZADAS = { pass: off.every(([, d]) => Math.abs(d) <= 2) && off.filter(([, , f]) => f).length === 3, desvio_px: off };

await app.close();
rs.proc.kill();
usb.proc.kill();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_CONVERSOR_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_CONVERSOR_E2E=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
