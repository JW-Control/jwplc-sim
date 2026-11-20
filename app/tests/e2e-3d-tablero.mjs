// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de la planta 3D con su tablero (Electron + Playwright):
//   TABLERO_EN_TODOS  cada arquitectura y cada ejercicio con PLC muestra el
//                     tablero en 3D y la vista no queda vacía
//   CAMPO             los equipos de campo de cada ejercicio (motores,
//                     finales de carrera, sensores, sirena, válvulas…) están
//                     dibujados en 3D
//   MANDO_3D          en marcha, un clic sobre el selector de la puerta del
//                     tablero lo gira igual que en el esquema
//   DIBUJO_BOMBEO     el bombeo (la planta más cargada: edificio, bombas y
//                     tablero cableado) se dibuja en menos de 300 llamadas por
//                     cuadro (las piezas fijas se juntan por material). Los
//                     FPS se informan; en un contenedor sin GPU no son
//                     representativos.
// Capturas en build/gates/3d-tablero/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-3d-tablero.mjs
import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "3d-tablero");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const log = (m) => console.log(`[e2e] ${m}`);
const criteria = {};

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1500, height: 950 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
await win.waitForFunction(() => document.querySelectorAll("#sel-arch option").length > 1, null, { timeout: 20000 });
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

// Lo que cada ejercicio debe tener en el campo (lo que no dibuja una planta).
const EXPECT = {
  "01-marcha-parada": ["M1"],
  "02-inversion-giro": ["M1"],
  "03-semaforo": ["semaforo"],
  "04-bomba-niveles": ["B1", "B2", "M1"],
  "05-puerta": ["B1", "B2", "B3", "M1"],
  "06-estrella-triangulo": ["M1"],
  "07-cinta-contador": ["B1", "M1"],
  "08-alarma": ["B1", "HA1"],
  "09-tolva-nivel": ["Y1"],
  "10-secuencia-neumatica": [],
};
try {
  const items = [
    ...["01-bombeo-edificio", "02-montacargas", "03-tratamiento-agua"].map((id) => ["arch", id]),
    ...readdirSync(join(ROOT, "exercises")).map((id) => ["ex", id]),
  ];
  const fails = [];
  const fieldFails = [];
  for (const [kind, id] of items) {
    await t(([k, i]) => (k === "arch" ? window.jwsimTest.pickArch(i) : window.jwsimTest.pickExercise(i)), [kind, id]);
    await sleep(2000);
    await t(() => window.jwsimTest.scene.view("3d"));
    await until(() => t(() => !!window.Jwsim3D?.panelAt?.()), 8000);
    const st = await t(() => ({ panel: !!window.Jwsim3D.panelAt(), empty: !document.getElementById("view3d-empty")?.hidden, field: window.Jwsim3D.fieldIds() }));
    if (!st.panel || st.empty) fails.push(id);
    const miss = (EXPECT[id] ?? []).filter((f) => !st.field.includes(f));
    if (miss.length) fieldFails.push(`${id}: falta ${miss.join(", ")}`);
    await win.locator("#view3d-canvas").screenshot({ path: join(OUT, `${kind}-${id}.png`) });
    log(`${id}: tablero ${st.panel} · campo ${st.field.join(" ") || "—"}`);
  }
  criteria.TABLERO_EN_TODOS = { pass: fails.length === 0, detail: fails.length ? `sin tablero: ${fails.join(", ")}` : `${items.length} proyectos` };
  criteria.CAMPO = { pass: fieldFails.length === 0, detail: fieldFails.join("; ") || "completo" };

  // Mando en 3D: el selector S1 del bombeo, mirando la cara de afuera de la puerta.
  await t(() => window.jwsimTest.pickArch("01-bombeo-edificio"));
  await sleep(2000);
  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 240000);
  await t(() => window.jwsimTest.scene.view("3d"));
  await sleep(2500);
  const [x, y, z, W, , b] = await t(() => window.Jwsim3D.panelAt());
  // Bisagra a la izquierda y puerta abierta ~97°: su cara de afuera mira a −x.
  const hx = x - W / 2;
  await t(([p, q]) => window.Jwsim3D.camera(p, q), [[hx - 0.9, y + b + 0.85, z + 0.35], [hx, y + b + 0.85, z + 0.25]]);
  await sleep(800);
  const before = await t(() => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "S1")?.actions?.position ?? 0);
  const pt = await t(() => window.Jwsim3D.screenOf("S1"));
  if (pt) await win.mouse.click(pt[0], pt[1]);
  const turned = await until(async () => Number(await t(() => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "S1")?.actions?.position ?? 0)) !== Number(before), 4000);
  await win.locator("#view3d-canvas").screenshot({ path: join(OUT, "mando-s1.png") });
  const fps = [];
  for (let i = 0; i < 3; i++) {
    await sleep(1000);
    fps.push(await t(() => window.jwsimTest.scene.fps3d()));
  }
  const avg = fps.reduce((a, b) => a + b, 0) / fps.length;
  const st = await t(() => window.Jwsim3D.stats());
  criteria.DIBUJO_BOMBEO = { pass: st.calls < 300, detail: `${st.calls} llamadas, ${st.tris} triángulos; FPS ${fps.join(", ")} (promedio ${Math.round(avg)})` };
  criteria.MANDO_3D = { pass: !!pt && turned, detail: `S1 ${before} → ${turned ? "cambió" : "sin cambio"}` };
} catch (e) {
  criteria.ERROR = { pass: false, detail: String(e?.stack ?? e) };
} finally {
  await app.close();
}
const ok = Object.values(criteria).every((c) => c.pass);
for (const [k, c] of Object.entries(criteria)) log(`${c.pass ? "OK  " : "FAIL"} ${k}: ${c.detail}`);
console.log(`JWSIM_3D_TABLERO_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
