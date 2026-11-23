// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del banco de trabajo 3D de las prácticas del curso (Electron + Playwright):
//   BANCO_EN_PRACTICAS  las 11 prácticas (curso-01…11) se ven en 3D como banco
//                       de trabajo (tablero abierto sobre una mesa), con bornes
//                       para el multímetro y sin errores de página
//   SEMAFORO            con piloto rojo, amarillo y verde va el semáforo junto
//                       al banco (práctica 04)
//   MANDO_PILOTO_3D     práctica 03 con su solución en marcha: H1 encendido en
//                       3D; al mantener S1 apretado con el ratón, H1 se apaga
// Capturas en build/gates/banco-3d/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-banco-3d.mjs
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "banco-3d");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const log = (m) => console.log(`[e2e] ${m}`);
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
await win.waitForFunction(() => window.jwsimTest.archs().length > 0, null, { timeout: 20000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

try {
  const fails = [];
  let semaforo = null;
  for (let n = 1; n <= 11; n++) {
    const id = `curso-${String(n).padStart(2, "0")}`;
    await t((i) => window.openLessonById(i), id);
    await sleep(2000);
    await t(() => window.jwsimTest.scene.view("3d"));
    await sleep(2000);
    const st = await t(() => ({ bench: window.Jwsim3D.bench(), panel: !!window.Jwsim3D.panelAt(), terms: window.Jwsim3D.diagTerms().length, field: window.Jwsim3D.fieldIds() }));
    if (!st.bench || !st.panel || st.terms < 4) fails.push(`${id} ${JSON.stringify(st)}`);
    if (id === "curso-04") semaforo = st.field;
    await win.locator("#view3d").screenshot({ path: join(OUT, `${id}.png`) });
  }
  criteria.BANCO_EN_PRACTICAS = { pass: !fails.length && !errors.length, detail: fails.length ? fails.join("; ") : errors.length ? errors[0] : "11 de 11 con banco" };
  criteria.SEMAFORO = { pass: !!semaforo?.includes("semaforo"), detail: JSON.stringify(semaforo) };

  await t((i) => window.openLessonById(i), "curso-03");
  await sleep(1500);
  const sol = readFileSync(join(ROOT, "JWPLC_Aprende", "extras", "practicas", "curso-03", "solucion", "Leer_una_entrada", "Leer_una_entrada.ino"), "utf8");
  await t((x) => window.jwsimTest.setSource(x), sol);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await t(() => window.jwsimTest.scene.view("3d"));
  const on = await until(async () => (await t(() => window.Jwsim3D.lampsLit())).includes("H1"), 15000);
  await win.locator("#view3d").screenshot({ path: join(OUT, "marcha-h1.png") });
  const pt = await t(() => window.Jwsim3D.screenOf("S1"));
  let off = false;
  if (pt) {
    await win.mouse.move(pt[0], pt[1]);
    await win.mouse.down();
    off = await until(async () => !(await t(() => window.Jwsim3D.lampsLit())).includes("H1"), 5000);
    await win.locator("#view3d").screenshot({ path: join(OUT, "s1-apretado.png") });
    await win.mouse.up();
  }
  const back = await until(async () => (await t(() => window.Jwsim3D.lampsLit())).includes("H1"), 5000);
  await win.click("#btn-stop").catch(() => {});
  criteria.MANDO_PILOTO_3D = { pass: on && !!pt && off && back, detail: `H1 encendido ${on}, S1 en pantalla ${!!pt}, H1 apagado al apretar ${off}, vuelve ${back}` };
} catch (e) {
  criteria.ERROR = { pass: false, detail: String(e?.stack ?? e) };
} finally {
  await app.close();
}
const ok = Object.values(criteria).every((c) => c.pass);
for (const [k, c] of Object.entries(criteria)) log(`${c.pass ? "OK  " : "FAIL"} ${k}: ${c.detail}`);
console.log(`JWSIM_BANCO_3D_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
