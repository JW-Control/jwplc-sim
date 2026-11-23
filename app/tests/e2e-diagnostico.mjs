// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del modo Diagnóstico (app/renderer/diagnostico.js) en el
// montacargas:
//   IO_DESC     la tabla de E/S dice qué equipo hay en cada entrada y salida
//   ORDENES     el proyecto trae sus órdenes de trabajo
//   OCULTA      con la orden abierta la falla no se marca en el dibujo
//   MEDIR_V     clic en dos bornes: 24 V en la fuente y en la bobina quemada
//   OHM_VIVO    medir Ω con tensión avisa y descuenta
//   BLOQUEO     bloquear y etiquetar deja todo en 0 V (ausencia de tensión)
//   OHM         sin tensión: bobina quemada OL, lámpara con su resistencia
//   PINZA       la pinza en un cable de la cadena de puertas lee la entrada del PLC
//   REPARAR     una pieza sana descuenta; la correcta quita la falla
//   PUNTAJE     cerrar con el bloqueo puesto no vale; después, 75/100
//   ENTRADA     falla de entrada (cable cortado de SQ1): oculta y reparable
//   SIN_ERRORES ningún error en la consola
// Capturas en build/gates/diagnostico/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-diagnostico.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "diagnostico");
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
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(200);
  }
  return false;
};
const st = () => t(() => window.JwsimDiag.state());
const shot = (n) => win.locator("#scene-view").screenshot({ path: join(OUT, n) });

/** Clic real en el borne del esquema (el centro de su círculo). */
async function probe(term) {
  const box = await t((id) => {
    const c = document.querySelector(`.term[data-term="${CSS.escape(id)}"] circle`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, term);
  if (!box) throw new Error(`borne no visible: ${term}`);
  await win.mouse.click(box[0], box[1]);
  await sleep(500);
}
async function measure(red, black) {
  await probe(red);
  await probe(black);
  await sleep(400);
  return (await st()).reading;
}

try {
  stage = "IO_DESC";
  await t(() => window.jwsimTest.pickArch("02-montacargas"));
  await sleep(2000);
  const io = await t(() => window.JwsimScene.ioMap());
  criteria.IO_DESC = {
    ok: /SQ1/.test(io.I0_1?.text) && /SP0 · SP1 · SP2/.test(io.I0_6?.text) && /^KM1/.test(io.Q0_0?.text) && /SQS/.test(io.Q0_0?.text) && /^H1/.test(io.Q0_2?.text),
    I0_1: io.I0_1?.text, I0_6: io.I0_6?.text, Q0_0: io.Q0_0?.text, Q0_2: io.Q0_2?.text,
  };
  log(`IO_DESC ${JSON.stringify(criteria.IO_DESC)}`);

  stage = "ORDENES";
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await t(() => window.jwsimTest.scene.view("scene"));
  await sleep(1500);
  await win.click("#scene-tab-diag");
  await sleep(400);
  const orders = (await st()).orders;
  criteria.ORDENES = { ok: orders.length === 6 && orders.includes("km1-bobina") && orders.includes("sq1-cable"), orders };
  log(`ORDENES ${JSON.stringify(criteria.ORDENES)}`);

  stage = "OCULTA";
  await t(() => window.JwsimDiag.open("km1-bobina"));
  await sleep(1200);
  const snap = await t(() => window.jwsimTest.scene.snapshot() ?? null);
  const marks = await t(() => document.querySelectorAll("#scene-devices .dev-fault").length);
  criteria.OCULTA = { ok: (await st()).key === "burnt:KM1" && marks === 0 && !(snap?.injected ?? []).length, marks, injected: snap?.injected };
  log(`OCULTA ${JSON.stringify(criteria.OCULTA)}`);

  stage = "MEDIR_V";
  await t(() => window.JwsimScene.fit?.());
  await sleep(300);
  const vps = await measure("PS1.+V1", "PS1.-V1");
  // Llamada al piso 2: el PLC manda subir (Q0.0) y la bobina de KM1 recibe tensión.
  await t(() => window.JwsimScene.act("SB2", "press", true));
  await sleep(400);
  await t(() => window.JwsimScene.act("SB2", "press", false));
  await sleep(800);
  const vcoil = await measure("KM1.A1", "KM1.A2");
  // Captura: la vista centrada en KM1 con las dos puntas en su bobina.
  const km = await t(() => window.jwsimTest.scene.spec().devices.find((d) => d.id === "KM1"));
  await t(([x, y]) => window.jwsimTest.scene.camera(1.05, x - 250, y - 140), [km.x, km.y]);
  await sleep(800);
  await shot("medir-bobina.png");
  await t(() => window.JwsimScene.fit?.() ?? document.getElementById("scene-fit").click());
  await sleep(500);
  criteria.MEDIR_V = { ok: vps === "24.0 V" && vcoil === "24.0 V", vps, vcoil };
  log(`MEDIR_V ${JSON.stringify(criteria.MEDIR_V)}`);

  stage = "OHM_VIVO";
  await win.click('#diag-root button[data-mode="OHM"]');
  await sleep(300);
  const ohmLive = await measure("H1.X1", "H1.X2");
  criteria.OHM_VIVO = { ok: ohmLive === "¡Tensión!" && (await st()).pens.includes("ohmLive"), reading: ohmLive };
  log(`OHM_VIVO ${JSON.stringify(criteria.OHM_VIVO)}`);

  stage = "BLOQUEO";
  await win.click("#diag-lock");
  await sleep(1200);
  await win.click('#diag-root button[data-mode="VDC"]');
  await sleep(300);
  const v0 = await measure("PS1.+V1", "PS1.-V1");
  const s1 = await st();
  criteria.BLOQUEO = { ok: s1.locked && v0 === "0.0 V" && s1.zeroProved, reading: v0, locked: s1.locked, zeroProved: s1.zeroProved };
  log(`BLOQUEO ${JSON.stringify(criteria.BLOQUEO)}`);

  stage = "OHM";
  await win.click('#diag-root button[data-mode="OHM"]');
  await sleep(300);
  const rCoil = await measure("KM1.A1", "KM1.A2");
  const rLamp = await measure("H1.X1", "H1.X2");
  await shot("ohm-bobina.png");
  criteria.OHM = { ok: rCoil === "OL" && /Ω$/.test(rLamp) && rLamp !== "OL", rCoil, rLamp };
  log(`OHM ${JSON.stringify(criteria.OHM)}`);

  stage = "REPARAR";
  await t(() => window.JwsimDiag.repairWith("d:KM2"));
  await sleep(300);
  const wrong = (await st()).pens.includes("wrongPart");
  await t(() => window.JwsimDiag.repairWith("d:KM1"));
  await sleep(1000);
  const s2 = await st();
  criteria.REPARAR = { ok: wrong && s2.key === null, wrong, key: s2.key };
  log(`REPARAR ${JSON.stringify(criteria.REPARAR)}`);

  stage = "PUNTAJE";
  await t(() => window.JwsimDiag.close());
  const stillOpen = (await st()).order === "km1-bobina";
  await win.click("#diag-lock");
  await sleep(1200);
  await win.click("#diag-close");
  await sleep(500);
  const s3 = await st();
  await shot("orden-cerrada.png");
  criteria.PUNTAJE = { ok: stillOpen && s3.order === null && s3.done?.pts === 75, stillOpen, done: s3.done };
  log(`PUNTAJE ${JSON.stringify(criteria.PUNTAJE)}`);

  stage = "PINZA";
  await win.click('#diag-root button[data-mode="A"]');
  await sleep(300);
  const wi = await t(() => window.JwsimScene.specForView().wiring.findIndex((w) => w.from === "SP0.14" && w.to === "SP1.13"));
  // Un punto del cable que no tape otro dibujo (lo que recibe el clic es el cable).
  const wpt = await t((i) => {
    const g = document.querySelector(`.wire[data-wire="${i}"]`);
    const p = g?.querySelector(".wire-hit") ?? g?.querySelector("path");
    if (!p) {
      // Punta de un cable multiconductor: su puntera.
      const r = g?.getBoundingClientRect();
      if (!r) return "no existe";
      const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
      return document.elementFromPoint(x, y)?.closest(".wire")?.dataset.wire === String(i) ? [x, y] : "puntera tapada";
    }
    const L = p.getTotalLength();
    for (let k = 1; k < 20; k++) {
      const q = p.getPointAtLength((L * k) / 20);
      const s = new DOMPoint(q.x, q.y).matrixTransform(p.getScreenCTM());
      if (document.elementFromPoint(s.x, s.y)?.closest(".wire")?.dataset.wire === String(i)) return [s.x, s.y];
    }
    return null;
  }, wi);
  if (!Array.isArray(wpt)) throw new Error(`el cable SP0–SP1 no está a la vista: ${wpt}`);
  await win.mouse.click(wpt[0], wpt[1]);
  await sleep(800);
  const amps = (await st()).reading;
  await shot("pinza.png");
  criteria.PINZA = { ok: amps === "5 mA", amps, wire: wi };
  log(`PINZA ${JSON.stringify(criteria.PINZA)}`);

  stage = "ENTRADA";
  await t(() => window.JwsimDiag.open("sq1-cable"));
  await sleep(1200);
  const cut = await t(() => document.querySelectorAll("#scene-wires .wire.cut").length);
  const wIdx = await t(() => window.JwsimScene.specForView().wiring.findIndex((w) => w.from === "SQ1.14" && w.to === "plc.I0_1"));
  await t((i) => window.JwsimDiag.repairWith(`w:${i}`), wIdx);
  await sleep(1000);
  await win.click("#diag-close");
  await sleep(400);
  const s4 = await st();
  criteria.ENTRADA = { ok: cut === 0 && s4.done?.pts === 70 && s4.done.pens.includes("repairLive"), cut, done: s4.done };
  log(`ENTRADA ${JSON.stringify(criteria.ENTRADA)}`);
} catch (e) {
  errors.push(`excepción: ${e.stack ?? e}`);
} finally {
  criteria.SIN_ERRORES = { ok: errors.length === 0, errors: errors.slice(0, 8) };
  log(`SIN_ERRORES ${JSON.stringify(criteria.SIN_ERRORES)}`);
  await app.close().catch(() => {});
}
const keys = ["IO_DESC", "ORDENES", "OCULTA", "MEDIR_V", "OHM_VIVO", "BLOQUEO", "OHM", "REPARAR", "PUNTAJE", "PINZA", "ENTRADA", "SIN_ERRORES"];
const ok = keys.every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_DIAGNOSTICO_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_DIAGNOSTICO_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
