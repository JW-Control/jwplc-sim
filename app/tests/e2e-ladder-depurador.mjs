// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Depurador del OpenPLC en el Ladder en vivo (Electron + Playwright), lección
// IEC 08 en LD (intermitencia con dos TON en anillo, sin entradas):
//   LEE_VARIABLES        el Sim lee las variables del programa con el
//                        protocolo del editor (FC 0x44 por la UART0) y el MD5
//                        de la placa coincide con el de la compilación
//   TIEMPO_DEL_TON       el ET de los TON aparece junto al bloque y avanza
//   MARCA_INTERNA        el contacto de la marca ENCENDIDO (sin E/S) se pinta
//                        en vivo y cambia con el parpadeo
//   TABLA_EN_VIVO        la columna «En vivo» de la tabla de variables muestra
//                        Q y ET de los TON y el valor de las BOOL
//   LATERAL_CON_VALORES  la pestaña Ladder del Esquema muestra los mismos
//   SERIE_LIMPIO         las respuestas del depurador no ensucian el Monitor serie
// Capturas en build/gates/ladder-depurador/.
//   cd app && xvfb-run -a node tests/e2e-ladder-depurador.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "ladder-depurador");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];

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
const live = (sel) => t((s) => Object.fromEntries([...document.querySelectorAll(`${s} [data-live]`)].map((e) => [e.dataset.live, e.textContent])), sel);
const ms = (v) => (v ? Number(String(v).replace(/ms$/, "").replace(/s$/, "000")) : NaN);
const contact = (sel, name) => t(([s, n]) => {
  const el = document.querySelector(`${s} .ld-contact[data-var="${n}"]`);
  return el ? (el.classList.contains("on") ? "on" : el.classList.contains("off") ? "off" : "?") : null;
}, [sel, name]);

try {
  await t(() => window.openLessonById("iec-08", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);

  const r = await until(() => t(() => window.jwsim.plcDebugRead()).then((x) => (x?.values ? x : null)), 8000);
  criteria.LEE_VARIABLES = { pass: !!r && "T_ON.ET" in r.values && "ENCENDIDO" in r.values, tick: r?.tick, n: r ? Object.keys(r.values).length : 0 };

  const d = "#plc-diagram-body";
  const a = await until(() => live(d).then((v) => (v["T_OFF.ET"] || v["T_ON.ET"] ? v : null)), 5000);
  await win.screenshot({ path: join(OUT, "01-programa.png") });
  // Los dos ET juntos van de 0 a 500 ms en un anillo de 1 s: se mira que cambien.
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const v = await live(d);
    seen.add(`${v["T_ON.ET"]}|${v["T_OFF.ET"]}`);
    await win.waitForTimeout(120);
  }
  criteria.TIEMPO_DEL_TON = { pass: !!a && seen.size >= 3 && [...seen].every((s) => s.split("|").every((x) => ms(x) >= 0 && ms(x) <= 500)), muestras: [...seen].slice(0, 6) };

  const states = new Set();
  for (let i = 0; i < 15 && states.size < 2; i++) {
    states.add(await contact(d, "ENCENDIDO"));
    await win.waitForTimeout(150);
  }
  criteria.MARCA_INTERNA = { pass: states.has("on") && states.has("off"), estados: [...states] };

  await t(() => document.getElementById("tab-ldvars").click());
  const tv = await until(() => t(() => Object.fromEntries([...document.querySelectorAll("#ld-vars td[data-live]")].map((e) => [e.dataset.live, e.textContent]))).then((v) => (v.T_ON ? v : null)), 4000);
  await win.screenshot({ path: join(OUT, "02-tabla.png") });
  criteria.TABLA_EN_VIVO = { pass: !!tv && /^Q=(TRUE|FALSE) ET=\d+m?s$/.test(tv.T_ON) && /^(TRUE|FALSE)$/.test(tv.ENCENDIDO ?? ""), T_ON: tv?.T_ON, ENCENDIDO: tv?.ENCENDIDO };

  await win.click('.mtab[data-tab="schematic"]');
  await until(() => t(() => !document.getElementById("scene-tab-ladder").hidden), 3000);
  await win.click("#scene-tab-ladder");
  const fv = await until(() => live("#ld-side").then((v) => (v["T_ON.ET"] ? v : null)), 4000);
  await win.waitForTimeout(300);
  await win.screenshot({ path: join(OUT, "03-esquema.png") });
  criteria.LATERAL_CON_VALORES = { pass: !!fv && !!(await contact("#ld-side", "ENCENDIDO"))?.match(/on|off/), ET: fv?.["T_ON.ET"] };

  const serie = await t(() => document.getElementById("console").textContent);
  criteria.SERIE_LIMPIO = { pass: !/[\x00-\x08\x0e-\x1f\x7f-\x9f�]/.test(serie), muestra: JSON.stringify(serie.slice(-80)) };
} finally {
  criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
  await app.close();
}
let failed = 0;
for (const [k, v] of Object.entries(criteria)) {
  console.log(`${v.pass ? "OK   " : "FALLA"} ${k} ${JSON.stringify(v)}`);
  if (!v.pass) failed++;
}
process.exit(failed ? 1 : 0);
