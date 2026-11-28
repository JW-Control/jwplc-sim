// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Ejecutar en vivo» de punta a punta (alpha.19), con un JWPLC de prueba
// (tests/helpers/fake-jwplc.mjs: el mismo firmware en el runner y su UART0
// en un pty, como el COM del USB):
//   BOTON       el panel «Subir al JWPLC» ofrece «◉ Ejecutar en vivo» en un proyecto IEC
//   CONECTA     compila, conecta y el botón Ejecutar pasa a «◉ En vivo · <puerto>»
//   ENTRADA     una entrada apretada en la placa se enciende en el Sim
//   SALIDA      la salida que pone el programa de la placa (Q0.0) se enciende en el Sim
//   LADDER      el Ladder del Programa muestra los contactos en vivo
//   FUERZA      el pulsador S2 del esquema fuerza S2 en la placa; soltarlo la libera
//   ESQUEMA     el piloto H1 del esquema sigue a la salida Q0.0 de la placa
//   DETENER     Detener sale de en vivo, libera el forzado y suelta el puerto
// Capturas en build/gates/en-vivo/. Solo Linux.
//   xvfb-run -a node app/tests/e2e-en-vivo.mjs
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

import { fakeJwplc } from "./helpers/fake-jwplc.mjs";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "en-vivo");
mkdirSync(OUT, { recursive: true });
const LESSON = join(ROOT, "JWPLC_Aprende", "extras", "Curso_IEC_61131", "1.Contactos_y_logica", "01.Contactos_y_bobinas", "LD");
const workspace = mkdtempSync(join(tmpdir(), "jwsim-vivo-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-vivo-ud-"));
const criteria = {};
const errors = [];
let failed = 0;
const check = (name, ok, extra = {}) => {
  criteria[name] = { pass: !!ok, ...extra };
  console.log(`${ok ? "OK   " : "FALLA"} ${name} ${JSON.stringify(extra)}`);
  if (!ok) failed++;
};

// La «placa»: la misma lección compilada aparte y corriendo con su UART0 en un pty.
const boardDir = join(workspace, "placa");
cpSync(LESSON, boardDir, { recursive: true });
const b = spawnSync(process.execPath, [join(ROOT, "cli", "jwsim-cli.mjs"), "build", boardDir, "--json"], { encoding: "utf8", maxBuffer: 64 << 20 });
const built = JSON.parse(b.stdout.trim().split("\n").pop());
if (!built.ok) throw new Error(`no compiló la placa de prueba: ${built.error}`);
const board = await fakeJwplc(built.executable);

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args, env });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await win.waitForTimeout(100);
  }
  return null;
};
const level = (s) => t((n) => window.jwsimTest.level(n), s);
const contact = (name) => t((n) => {
  const el = document.querySelector(`#plc-diagram-body .ld-contact[data-var="${n}"]`);
  return el ? (el.classList.contains("on") ? "on" : el.classList.contains("off") ? "off" : "?") : null;
}, name);

try {
  await t(() => window.openLessonById("iec-01", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());

  // Panel «Subir al JWPLC»: el pty no aparece en la lista de puertos del
  // sistema, se agrega a mano como si fuera el COM del JWPLC.
  await win.click("#btn-upload");
  await until(() => t(() => !document.getElementById("up-panel").hidden), 3000);
  await win.waitForTimeout(500);
  await t((tty) => {
    const sel = document.getElementById("up-port");
    const o = document.createElement("option");
    o.value = tty;
    o.textContent = `${tty} (JWPLC de prueba)`;
    sel.appendChild(o);
    sel.value = tty;
    document.getElementById("up-live").disabled = false;
  }, board.tty);
  const btn = await t(() => ({ text: document.getElementById("up-live").textContent, note: document.getElementById("up-note").textContent }));
  await win.screenshot({ path: join(OUT, "1-panel.png") });
  check("BOTON", /Ejecutar en vivo/.test(btn.text), btn);

  await win.click("#up-live");
  const run = await until(() => t(() => (/En vivo/.test(document.getElementById("btn-run").textContent) ? document.getElementById("btn-run").textContent : null)), 300000);
  check("CONECTA", !!run, { boton: run, estado: await t(() => window.jwsimTest.status()) });

  // Entrada física en la placa → el Sim la muestra y el programa de la placa enciende H1.
  board.runner.send({ type: "set", signal: "I0_0", value: 1 });
  const inOn = await until(() => level("I0_0"), 3000);
  check("ENTRADA", inOn, { I0_0: await level("I0_0") });
  const outOn = await until(() => level("Q0_0"), 3000);
  await win.click('.mtab[data-tab="program"]').catch(() => {});
  const ld = await until(() => contact("S1").then((c) => (c === "on" ? c : null)), 3000);
  await win.screenshot({ path: join(OUT, "2-en-vivo-programa.png") });
  check("SALIDA", outOn, { Q0_0: await level("Q0_0") });
  check("LADDER", ld === "on", { S1: await contact("S1") });
  board.runner.send({ type: "set", signal: "I0_0", value: 0 });
  await until(() => level("I0_0").then((v) => !v), 3000);

  // Pulsador S2 del esquema apretado → S2 forzada en la placa; soltado → liberada.
  const s2 = () => t(() => window.jwsim.plcDebugRead()).then((r) => r?.values?.S2);
  const press = (on) => t((v) => window.jwsimTest.scene.act("S2", "press", v), on);
  await press(true);
  const forced = await until(() => s2().then((v) => v === true), 3000);
  await win.click('.mtab[data-tab="schematic"]').catch(() => {});
  await win.waitForTimeout(500);
  await win.screenshot({ path: join(OUT, "3-en-vivo-esquema-s2.png") });
  await press(false);
  const released = await until(() => s2().then((v) => v === false), 3000);
  check("FUERZA", !!forced && !!released, { apretado: forced, soltado_libera: released });
  // Pulsador S1 de la placa apretado: el piloto H1 del esquema se enciende.
  board.runner.send({ type: "set", signal: "I0_0", value: 1 });
  const lamp = await until(() => t(() => JSON.stringify(window.jwsimTest.scene.snapshot()?.devices?.find((d) => d.id === "H1")?.outputs ?? null)).then((j) => (/:(true|1)\b/.test(j) ? j : null)), 3000);
  await win.waitForTimeout(300);
  await win.screenshot({ path: join(OUT, "4-en-vivo-esquema-h1.png") });
  check("ESQUEMA", !!lamp, { H1: lamp ?? await t(() => JSON.stringify(window.jwsimTest.scene.snapshot()?.devices?.map((d) => [d.id, d.outputs]) ?? null)) });
  board.runner.send({ type: "set", signal: "I0_0", value: 0 });
  // Apretado otra vez y Detener sin soltar: Detener tiene que liberarlo.
  await press(true);
  await until(() => s2().then((v) => v === true), 3000);
  await win.click("#btn-stop");
  const stopped = await until(() => t(() => (window.jwsimTest.status() === "idle" && !document.body.dataset.live ? true : null)), 5000);
  await win.screenshot({ path: join(OUT, "5-detenido.png") });
  // La placa sigue con su programa y S2 vuelve a la entrada física (0).
  const { LiveSession } = await import("../lib/plc-live.mjs");
  const { editorPaths, resolveEditor } = await import("../../scripts/fetch-editor.mjs");
  const ops = createRequire(import.meta.url)(editorPaths((await resolveEditor({ fetch: false })).dir).ladderOps);
  const probe = new LiveSession({ ops, exe: built.executable, path: board.tty, periodMs: 100 });
  let after = {};
  probe.on("values", (v) => (after = v.values));
  await probe.start();
  await new Promise((r) => setTimeout(r, 400));
  await probe.stop();
  check("DETENER", stopped && after.S2 === false, { S2_en_la_placa: after.S2 });
} finally {
  await app.close().catch(() => {});
  board.close();
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
if (errors.length) check("SIN_ERRORES", false, { errors: errors.slice(0, 3) });
writeFileSync(join(OUT, "JWSIM_EN_VIVO.json"), JSON.stringify({ criteria, errors }, null, 2));
console.log(failed ? `${failed} fallas` : "todo OK");
process.exit(failed ? 1 : 0);
