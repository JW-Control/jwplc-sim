// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del modo Diagnóstico en la Planta 3D (scene3d.js + diagnostico.js)
// con el montacargas:
//   TARJETA     con el panel de diagnóstico abierto, la planta trae su tarjeta flotante
//   BORNES      el tablero 3D tiene un punto por borne (riel, puerta y bornera de salida)
//   MEDIR_3D    clic real en dos bornes del tablero 3D: 24 V en la fuente, puntas dibujadas
//               hacia abajo (borne arriba en la vista) y solo el borne bajo el mouse resaltado
//   PINZA_3D    con la pinza, clic en un borne abraza el cable que sale de él
//   CANDADO     bloquear la energía pone candado y tarjeta en el interruptor general
//   FOLIO       clic en el bolsillo de la puerta abre los planos IEC; ✕ los guarda
//   IEC_PUNTAS  las puntas se apoyan en los bornes del plano IEC y miden igual
//   SIN_ERRORES ningún error en la consola
// Capturas en build/gates/diagnostico/ (con el prefijo 3d-).
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-diagnostico-3d.mjs
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
const shot = (n) => win.locator("#view3d").screenshot({ path: join(OUT, n) });

async function clickAt(p) {
  if (!p) throw new Error("punto no visible");
  await win.mouse.click(p[0], p[1]);
  await sleep(500);
}
const term = async (end) => clickAt(await t((e) => window.Jwsim3D.termScreen(e), end));

try {
  stage = "TARJETA";
  await t(() => window.jwsimTest.pickArch("02-montacargas"));
  await sleep(2000);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await t(() => window.jwsimTest.scene.view("scene"));
  await sleep(1200);
  await win.click("#scene-tab-diag");
  await sleep(300);
  await t(() => window.jwsimTest.scene.view("3d"));
  await until(() => t(() => !!window.Jwsim3D?.panelAt?.()), 8000);
  await sleep(800);
  const card = await t(() => ({ in3d: window.JwsimDiag.in3d(), inCard: document.getElementById("diag-root").parentElement.id, hidden: document.getElementById("view3d-diag").hidden }));
  criteria.TARJETA = { ok: card.in3d && card.inCard === "view3d-diag" && !card.hidden, ...card };
  log(`TARJETA ${JSON.stringify(criteria.TARJETA)}`);

  stage = "BORNES";
  const ends = await t(() => window.Jwsim3D.diagTerms());
  const want = ["PS1.+V1", "PS1.-V1", "KM1.A1", "KM1.A2", "SQ1.14"];
  criteria.BORNES = { ok: want.every((e) => ends.includes(e)) && ends.length > 20, n: ends.length, missing: want.filter((e) => !ends.includes(e)) };
  log(`BORNES ${JSON.stringify(criteria.BORNES)}`);

  stage = "MEDIR_3D";
  await t(() => window.JwsimDiag.open("km1-bobina"));
  await sleep(800);
  const [x, y, z, , H, b] = await t(() => window.Jwsim3D.panelAt());
  // De frente al tablero, corrida a la izquierda para que la tarjeta no lo tape.
  await t(([p, q]) => window.Jwsim3D.camera(p, q), [[x - 0.35, y + b + H * 0.62, z + 1.25], [x - 0.35, y + b + H * 0.62, z]]);
  await sleep(800);
  await term("PS1.+V1");
  await term("PS1.-V1");
  await sleep(600);
  const m1 = await st();
  const probes = await t(() => window.Jwsim3D.probesAt());
  await shot("3d-medir-fuente.png");
  // De costado: las puntas salen hacia el frente sin atravesar los equipos.
  await t(([p, q]) => window.Jwsim3D.camera(p, q), [[x + 0.55, y + b + H * 0.75, z + 0.75], [x - 0.15, y + b + H * 0.68, z]]);
  await sleep(700);
  await shot("3d-puntas-costado.png");
  await t(([p, q]) => window.Jwsim3D.camera(p, q), [[x - 0.35, y + b + H * 0.62, z + 1.25], [x - 0.35, y + b + H * 0.62, z]]);
  await sleep(500);
  criteria.MEDIR_3D = { ok: m1.red === "PS1.+V1" && m1.black === "PS1.-V1" && m1.reading === "24.0 V" && probes.red && probes.black && probes.redDown && probes.uncrossed && probes.lit <= 1, red: m1.red, black: m1.black, reading: m1.reading, probes };
  log(`MEDIR_3D ${JSON.stringify(criteria.MEDIR_3D)}`);

  stage = "PINZA_3D";
  await win.click('#diag-root button[data-mode="A"]');
  await sleep(300);
  await term("PS1.+V1");
  await sleep(700);
  const m2 = await st();
  const pr2 = await t(() => window.Jwsim3D.probesAt());
  const wire = await t((i) => window.jwsimTest.scene.spec().wiring[i], m2.wire);
  criteria.PINZA_3D = { ok: m2.wire != null && (wire.from === "PS1.+V1" || wire.to === "PS1.+V1") && /A$/.test(m2.reading) && pr2.clamp && !pr2.red, wire, reading: m2.reading, probes: pr2 };
  log(`PINZA_3D ${JSON.stringify(criteria.PINZA_3D)}`);

  stage = "CANDADO";
  await win.click('#diag-root button[data-mode="VDC"]');
  await win.click("#diag-lock");
  await until(() => t(() => window.Jwsim3D.lockShown()), 4000);
  const locked = await t(() => ({ lock: window.Jwsim3D.lockShown(), locked: window.JwsimDiag.state().locked }));
  await t(([p, q]) => window.Jwsim3D.camera(p, q), [[x - 0.2, y + b + H * 0.7, z + 0.75], [x - 0.35, y + b + H * 0.7, z]]);
  await sleep(700);
  await shot("3d-candado.png");
  const note = await t(() => document.querySelector(".diag-log li:last-child")?.textContent ?? "");
  criteria.CANDADO = { ok: locked.lock && locked.locked && /candado/.test(note), ...locked, note };
  log(`CANDADO ${JSON.stringify(criteria.CANDADO)}`);

  stage = "FOLIO";
  await win.click("#diag-lock");
  await until(() => t(() => !window.Jwsim3D.lockShown()), 4000);
  // La puerta abierta queda a la izquierda del tablero: se mira su cara interior.
  await t(([p, q]) => window.Jwsim3D.camera(p, q), [[x - 0.2, y + b + 0.5, z + 1.6], [x - 0.75, y + b + 0.35, z + 0.6]]);
  await sleep(700);
  await shot("3d-puerta-folio.png");
  await clickAt(await t(() => window.Jwsim3D.folioScreen()));
  await sleep(1200);
  const f1 = await t(() => ({ open: window.Jwsim3D.folio(), inFolio: document.getElementById("iec-view").parentElement.id, iecShown: !document.getElementById("iec-view").hidden, sheets: window.JwsimIec.debug().sheets.length }));

  stage = "IEC_PUNTAS";
  // Puntas sobre el plano: la hoja que tiene los dos bornes de la fuente de 24 V.
  const sheet = await t(async () => {
    const n = document.querySelectorAll("#iec-sheets [data-sheet]").length;
    for (let i = 0; i < n; i++) {
      const b = document.querySelector(`#iec-sheets [data-sheet="${i}"]`);
      b.click();
      await new Promise((r) => setTimeout(r, 150));
      if (document.querySelector('[data-probe="PS1.+V1"]') && document.querySelector('[data-probe="PS1.-V1"]')) return b.dataset.sheet;
    }
    return null;
  });
  const dot = (end) => t((e) => {
    const r = document.querySelector(`[data-probe="${CSS.escape(e)}"]`)?.getBoundingClientRect();
    return r ? [r.x + r.width / 2, r.y + r.height / 2] : null;
  }, end);
  await clickAt(await dot("PS1.+V1"));
  await clickAt(await dot("PS1.-V1"));
  await sleep(800);
  const m3 = await st();
  const tips = await t(() => document.querySelectorAll("#iec-root .diag-tip").length);
  await shot("3d-folio-planos.png");
  criteria.IEC_PUNTAS = { ok: sheet != null && m3.red === "PS1.+V1" && m3.black === "PS1.-V1" && m3.reading === "24.0 V" && tips === 2, sheet, red: m3.red, black: m3.black, reading: m3.reading, tips };
  log(`IEC_PUNTAS ${JSON.stringify(criteria.IEC_PUNTAS)}`);
  await win.click("#view3d-folio-close");
  await sleep(400);
  const f2 = await t(() => ({ open: window.Jwsim3D.folio(), back: document.getElementById("iec-view").parentElement.id !== "view3d-folio", iecShown: !document.getElementById("iec-view").hidden }));
  criteria.FOLIO = { ok: f1.open && f1.inFolio === "view3d-folio" && f1.iecShown && f1.sheets > 0 && !f2.open && f2.back && !f2.iecShown, f1, f2 };
  log(`FOLIO ${JSON.stringify(criteria.FOLIO)}`);
} catch (e) {
  errors.push(`excepción: ${e.stack ?? e}`);
} finally {
  criteria.SIN_ERRORES = { ok: errors.length === 0, errors: errors.slice(0, 8) };
  log(`SIN_ERRORES ${JSON.stringify(criteria.SIN_ERRORES)}`);
  await app.close().catch(() => {});
}
const keys = ["TARJETA", "BORNES", "MEDIR_3D", "PINZA_3D", "CANDADO", "FOLIO", "IEC_PUNTAS", "SIN_ERRORES"];
const ok = keys.every((k) => criteria[k]?.ok);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_DIAGNOSTICO_3D_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_DIAGNOSTICO_3D_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
