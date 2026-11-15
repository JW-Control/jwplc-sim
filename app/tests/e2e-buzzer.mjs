// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del buzzer de la placa (GPIO26) sobre Electron (Playwright).
//   BUZZER_PWM     el runner manda los cambios del LEDC ({"type":"pwm"}) y la
//                  interfaz los entrega a JwsimSound.buzzer con frecuencia > 0
//   BUZZER_LED     el LED «BUZ» de la placa se enciende mientras suena
//   BUZZER_TIMING  en ×1 las notas conservan su separación en tiempo virtual
//   BUZZER_MUTE    con el sonido apagado no se agenda nada (el LED sigue)
//   TFT_RENDERING  la pantalla achicada se dibuja suavizada (sin perder filas)
//                  y la ampliada, pixelada
//   TFT_ZOOM       doble clic abre la pantalla a escala entera (k×320 px)
// Sketch: JWPLC_GlobalPeripherals/07.Buzzer_Basic (OK pitido, UP melodía).
// Informe en build/gates/JWSIM_BUZZER_E2E.json y capturas en build/gates/buzzer/.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-buzzer.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";
import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "buzzer");
mkdirSync(OUT, { recursive: true });
const sketch = process.argv[2] ??
  join(resolvePackageRoot().root, resolvePackageRoot().lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_GlobalPeripherals", "examples", "07.Buzzer_Basic");
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
process.on("unhandledRejection", (err) => {
  console.error(`[e2e] ERROR: ${err?.stack ?? err}`);
  process.exitCode = 1;
});

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args, env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.evaluate((d) => window.jwsimTest.openSketchDir(d), sketch);
const name = sketch.split(/[\\/]/).pop();
await win.waitForSelector(`.tab.active:has-text('${name}.ino')`, { timeout: 30000 });

// Espía: cada tanda que la interfaz entrega al sonido, con la hora de llegada.
await win.evaluate(() => {
  window.__bz = [];
  window.__led = false;
  const orig = window.JwsimSound.buzzer;
  window.JwsimSound.buzzer = (items, speed) => {
    window.__bz.push({ items, speed, enabled: window.JwsimSound.enabled });
    return orig(items, speed);
  };
  new MutationObserver(() => {
    if (document.getElementById("led-buz").classList.contains("on")) window.__led = true;
  }).observe(document.getElementById("led-buz"), { attributes: true });
  window.JwsimSound.enabled = true;
});

await win.click("#btn-run");
await win.waitForSelector("#status.running", { timeout: 600000 });
log("simulación en marcha");
await win.waitForTimeout(2500);
const press = async (btn, ms = 120) => {
  const k = await win.$(`#keypad .key[data-btn='${btn}']`);
  const box = await k.boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.waitForTimeout(ms);
  await win.mouse.up();
};
const sketchKeys = (process.argv[3] ?? "BTN_OK,BTN_UP").split(",");
for (const k of sketchKeys) {
  await press(k);
  await win.waitForTimeout(1500);
}
await win.screenshot({ path: join(OUT, "01-sonando.png") });
await win.waitForTimeout(3000);

const got = await win.evaluate(() => ({ bz: window.__bz, led: window.__led }));
const notes = got.bz.flatMap((b) => b.items).filter((i) => i[2] > 0);
criteria.BUZZER_PWM = { pass: notes.length > 0 && got.bz.every((b) => b.items.every((i) => i[1] === 26)), tandas: got.bz.length, notas: notes.length,
  frecuencias: [...new Set(notes.map((i) => i[2]))].slice(0, 12) };
criteria.BUZZER_LED = { pass: got.led };
// Separación entre notas distintas consecutivas (ms virtuales): debe ser > 0
// y no colapsar en una sola tanda.
const starts = [];
for (const i of got.bz.flatMap((b) => b.items)) if (i[2] > 0 && (!starts.length || starts.at(-1)[1] !== i[2])) starts.push([i[0], i[2]]);
const gaps = starts.slice(1).map((s, k) => (s[0] - starts[k][0]) / 1e6);
criteria.BUZZER_TIMING = { pass: starts.length >= 2 && gaps.every((g) => g > 0) && got.bz.every((b) => b.speed === 1), separaciones_ms: gaps.slice(0, 10).map((g) => Math.round(g)) };

// Silencio: con el sonido apagado la tanda llega pero no se agenda.
await win.click("#buz-sound");
const muted = await win.evaluate(() => !window.JwsimSound.enabled && document.getElementById("buz-sound").textContent === "🔇" &&
  document.getElementById("scene-sound").textContent === "🔇");
await win.click("#buz-sound");
criteria.BUZZER_MUTE = { pass: muted };

// Nitidez: la placa a 1500×950 deja la TFT por debajo de 320 px.
const small = await win.evaluate(() => window.jwsimTest.tftZoom());
await win.locator("#tft").screenshot({ path: join(OUT, "02-tft-placa.png") });
await win.dblclick("#tft");
await win.waitForTimeout(400);
const zoom = await win.evaluate(() => window.jwsimTest.tftZoom());
await win.screenshot({ path: join(OUT, "03-tft-ampliada.png") });
await win.locator("#tft-zoom-canvas").screenshot({ path: join(OUT, "04-tft-ampliada-recorte.png") });
await win.click("#tft-zoom-close");
const closed = await win.evaluate(() => window.jwsimTest.tftZoom().open);
criteria.TFT_RENDERING = { pass: small.tftPx < 320 ? small.rendering === "auto" : small.rendering === "pixelated", ...small };
criteria.TFT_ZOOM = { pass: zoom.open && zoom.px >= 640 && zoom.px % 320 === 0 && !closed, ...zoom };

await win.click("#btn-stop");
await app.close();
const pass = Object.values(criteria).every((c) => c.pass);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_BUZZER_E2E.json"), JSON.stringify({ sketch: name, pass, criteria }, null, 2));
for (const [k, c] of Object.entries(criteria)) log(`${c.pass ? "PASS" : "FAIL"} ${k} ${JSON.stringify(c)}`);
process.exitCode = pass ? 0 : 1;
