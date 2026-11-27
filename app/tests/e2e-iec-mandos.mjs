// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de los mandos en marcha (Electron + Playwright), práctica 03
// con su solución (H1 = !S1, H2 = S2):
//   OBJETIVOS_AJENOS   un avance de otros objetivos (los de la práctica
//                      anterior, ya logrados) no marca «Práctica lograda»
//   IEC_PULSADOR       en el plano IEC, mantener apretado S1 apaga H1 y
//                      soltarlo lo vuelve a encender
//   IEC_FORCE_EQUIPO   clic derecho en S2 → Force True: H2 queda encendido
//                      sin tocarlo; Release lo apaga
//   IEC_FORCE_ENTRADA  clic derecho en la entrada I0.0 (▽) → Force True: H1
//                      se apaga (la entrada queda en 1); Release la libera
//   MANDOS_AL_INSTANTE el botón S1 de Mandos del banco se ve apretado al
//                      instante, sin esperar a la simulación
// Capturas en build/gates/iec-mandos/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-iec-mandos.mjs
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "iec-mandos");
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[e2e] ${m}`);
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-ws-")), JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await win.setViewportSize?.({ width: 1600, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
await win.waitForFunction(() => window.jwsimTest.archs().length > 0, null, { timeout: 20000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};
const q = (sig) => t((s) => document.querySelector(`#outputs .io[data-signal="${s}"]`).classList.contains("on"), sig);
// El plano se vuelve a dibujar con cada instantánea: se mide en la página.
const center = (sel) =>
  t((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r && r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null;
  }, sel);

try {
  await t(() => window.openLessonById("curso-03"));
  await sleep(2000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  // Avance de la práctica 02 (otros objetivos, ya logrados) que llega tarde.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("goals:progress", { t_ms: 4000, complete: true, goals: [{ id: "ritmo", state: "done" }, { id: "alterna", state: "done" }] });
  });
  await sleep(400);
  const banner = await t(() => !document.querySelector("#ex-goals .goals-done")?.hidden);
  criteria.OBJETIVOS_AJENOS = { pass: !banner, detail: banner ? "muestra «Práctica lograda» con objetivos ajenos" : "sin aviso falso" };

  const sol = readFileSync(join(ROOT, "JWPLC_Aprende", "extras", "practicas", "curso-03", "solucion", "Leer_una_entrada", "Leer_una_entrada.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await until(() => q("Q0_0"), 15000);

  // Mandos del banco: el botón se ve apretado al instante.
  await t(() => window.JwsimTabs.select("schematic"));
  await sleep(800);
  const m = await center('#ex-mandos .mando[data-dev="S1"]');
  let instant = false;
  if (m) {
    await win.mouse.move(m[0], m[1]);
    await win.mouse.down();
    instant = await t(() => document.querySelector('#ex-mandos .mando[data-dev="S1"]').classList.contains("on"));
    await win.mouse.up();
  }
  criteria.MANDOS_AL_INSTANTE = { pass: !!m && instant, detail: `botón ${m ? "encontrado" : "no encontrado"}, apretado al instante ${instant}` };

  await win.click("#schem-iec");
  await sleep(1500);
  // Hoja con las entradas (S1, S2).
  const sheet = await t(() => {
    const b = [...document.querySelectorAll("#iec-sheets [data-sheet]")].find((x) => /Entradas/.test(x.textContent));
    b?.click();
    return b?.textContent ?? null;
  });
  await sleep(800);
  const s1 = await center('#iec-svg .iec-el[data-dev="S1"] .iec-hitbox');
  let off = false;
  let back = false;
  if (s1) {
    await win.mouse.move(s1[0], s1[1]);
    await win.mouse.down();
    off = await until(async () => !(await q("Q0_0")), 3000);
    await win.screenshot({ path: join(OUT, "iec-s1-apretado.png") });
    await win.mouse.up();
    back = await until(() => q("Q0_0"), 3000);
  }
  criteria.IEC_PULSADOR = { pass: !!s1 && off && back, detail: `hoja ${sheet}; H1 se apaga ${off}, vuelve ${back}` };

  const s2 = await center('#iec-svg .iec-el[data-dev="S2"] .iec-hitbox');
  let on2 = false;
  let held = false;
  let rel2 = false;
  if (s2) {
    await win.mouse.click(s2[0], s2[1], { button: "right" });
    await sleep(200);
    await win.click('#iec-edit [data-act="force-1"]');
    on2 = await until(() => q("Q0_1"), 3000);
    await sleep(1000);
    held = await q("Q0_1");
    await win.screenshot({ path: join(OUT, "iec-s2-forzado.png") });
    await win.mouse.click(s2[0], s2[1], { button: "right" });
    await sleep(200);
    await win.click('#iec-edit [data-act="force-x"]');
    rel2 = await until(async () => !(await q("Q0_1")), 3000);
  }
  criteria.IEC_FORCE_EQUIPO = { pass: !!s2 && on2 && held && rel2, detail: `H2 encendido ${on2}, sigue ${held}, Release lo apaga ${rel2}` };

  const in0 = await center('#iec-svg .iec-el[data-cid="I0_0"] .iec-hitbox');
  let f1 = false;
  let r1 = false;
  if (in0) {
    await win.mouse.click(in0[0], in0[1], { button: "right" });
    await sleep(200);
    const head = await t(() => document.querySelector("#iec-edit .iec-edit-h")?.textContent ?? "");
    await win.click('#iec-edit [data-act="force-1"]');
    f1 = await until(async () => !(await q("Q0_0")), 3000);
    await win.screenshot({ path: join(OUT, "iec-i00-forzada.png") });
    await win.mouse.click(in0[0], in0[1], { button: "right" });
    await sleep(200);
    await win.click('#iec-edit [data-act="force-x"]');
    r1 = await until(() => q("Q0_0"), 3000);
    criteria.IEC_FORCE_ENTRADA = { pass: f1 && r1 && /I0\.0/.test(head), detail: `menú «${head}»; forzada apaga H1 ${f1}, Release ${r1}` };
  } else criteria.IEC_FORCE_ENTRADA = { pass: false, detail: "sin la entrada I0_0 en el plano" };
  await win.click("#btn-stop").catch(() => {});
  criteria.SIN_ERRORES = { pass: !errors.length, detail: errors[0] ?? "ninguno" };
} catch (e) {
  criteria.ERROR = { pass: false, detail: String(e?.stack ?? e) };
} finally {
  await app.close();
}
const ok = Object.values(criteria).every((c) => c.pass);
for (const [k, c] of Object.entries(criteria)) log(`${c.pass ? "OK  " : "FAIL"} ${k}: ${c.detail}`);
console.log(`JWSIM_IEC_MANDOS_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
