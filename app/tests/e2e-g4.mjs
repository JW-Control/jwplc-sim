// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de G4 sobre Electron (Playwright):
//   TFT_HMI   la pantalla de la placa muestra la TFT simulada en vivo; la
//             botonera de la interfaz (clic y teclado) navega el HMI de
//             03.Display_HMI_Pages: reposo → página 0 → página 1 → reposo
//   FRAM      04.FRAM_Basic: el contador de arranques persiste entre dos
//             ejecuciones en la app (estado por sketch)
// Informe en build/gates/JWSIM_G4_E2E.json y capturas en build/gates/g4/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-g4.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "g4");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

const { root, lock } = resolvePackageRoot();
const examples = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: workspace } });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForSelector(".tab.active", { timeout: 30000 });

const t = (fn, ...a) => win.evaluate(fn, ...a);
const status = () => t(() => window.jwsimTest.status());
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(50);
  }
  return null;
};
const px = (x, y) => t(([a, b]) => window.jwsimTest.tftPixel(a, b), [x, y]);
const isGreen = ([r, g, b]) => g > 150 && r < 120 && b < 120;
const isWhite = ([r, g, b]) => r > 200 && g > 200 && b > 200;
// Un pixel blanco en la fila de texto "Entradas"/"Hora" (y ≈ 50) indica la vista USER.
const userText = async () => {
  for (let x = 20; x < 80; x++) if (isWhite(await px(x, 50))) return true;
  return false;
};
const consoleText = () => win.$eval("#console", (e) => e.textContent);
const clickKey = async (btn) => {
  const k = await win.$(`.key[data-btn='${btn}']`);
  const box = await k.boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.waitForTimeout(150);
  await win.mouse.up();
};

// ---- TFT_HMI
log("TFT_HMI: compilando 03.Display_HMI_Pages");
await t((dir) => window.jwsimTest.openSketchDir(dir), join(examples, "JWPLC_Display", "examples", "03.Display_HMI_Pages"));
await win.waitForSelector(".tab.active:has-text('03.Display_HMI_Pages.ino')", { timeout: 10000 });
await win.click("#btn-run");
await until(async () => (await status()) === "running", 600000);
// Pantalla de reposo: recuadro verde de PWR.
const idle = await until(async () => {
  for (let x = 60; x < 100; x++) if (isGreen(await px(x, 25))) return true;
  return false;
}, 10000);
await win.screenshot({ path: join(OUT, "01-reposo.png") });
// Fuera de la ventana de arranque (hallazgo H12: carrera de la TFT al entrar
// al HMI durante el primer refresco del sistema).
await until(async () => (await t(() => window.jwsimTest.clock())) >= "00:00:01.500", 10000);
await clickKey("BTN_OK");
const user = await until(userText, 5000);
await win.screenshot({ path: join(OUT, "02-usuario.png") });
// Teclado con foco en la pantalla: → (RIGHT) cambia a la página 1.
await win.focus("#tft");
await win.keyboard.down("ArrowRight");
await win.waitForTimeout(150);
await win.keyboard.up("ArrowRight");
const page1 = await until(async () => /PAGE 1/.test(await consoleText()), 5000);
await win.waitForTimeout(400);
await win.screenshot({ path: join(OUT, "03-pagina1.png") });
await clickKey("BTN_ESC");
const back = await until(async () => {
  for (let x = 60; x < 100; x++) if (isGreen(await px(x, 25))) return true;
  return false;
}, 5000);
criteria.TFT_HMI = { pass: !!idle && !!user && !!page1 && !!back, reposo: !!idle, usuario: !!user, pagina1_por_teclado: !!page1, vuelta_a_reposo: !!back };
writeFileSync(join(OUT, "tft-app.png"), Buffer.from((await t(() => window.jwsimTest.tftDataUrl())).split(",")[1], "base64"));

// ---- FRAM: persistencia entre dos ejecuciones en la app
log("FRAM");
await t((dir) => window.jwsimTest.openSketchDir(dir), join(examples, "JWPLC_GlobalPeripherals", "examples", "04.FRAM_Basic"));
await win.waitForSelector(".tab.active:has-text('04.FRAM_Basic.ino')", { timeout: 10000 });
const bootCount = async () => {
  await win.click("#btn-run");
  await until(async () => (await status()) === "running", 600000);
  const m = await until(async () => (await consoleText()).match(/bootCount persistente = (\d+)/), 10000);
  await win.click("#btn-stop");
  await win.waitForTimeout(800);
  return m ? Number(m[1]) : null;
};
const b1 = await bootCount();
const b2 = await bootCount();
criteria.FRAM_PERSIST_APP = { pass: b1 !== null && b2 === b1 + 1, primera: b1, segunda: b2 };

await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_G4_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_G4_E2E=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
