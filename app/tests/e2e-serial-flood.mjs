// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E de un sketch que imprime sin pausa (Serial.println(millis())
// en loop, sin delay):
//   SERIAL_FLOOD  tras unos segundos en ×1 la consola va al día con el
//                 reloj de la simulación (menos de 1 s de atraso) y la
//                 interfaz sigue respondiendo (cuadros de menos de 100 ms)
// Informe en build/gates/JWSIM_SERIAL_FLOOD.json.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-serial-flood.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
const log = (m) => console.log(`[e2e] ${m}`);
const SECONDS = Number(process.env.JWSIM_FLOOD_SECONDS ?? 12);

const sketch = join(mkdtempSync(join(tmpdir(), "jwsim-flood-")), "flood");
mkdirSync(sketch);
writeFileSync(join(sketch, "flood.ino"), process.env.JWSIM_FLOOD_IDLE ? "void setup() {}\n\nvoid loop() {\n  delay(1000);\n}\n" : "void setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  Serial.println(millis());\n}\n");

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-ws-")) } });
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

await t((dir) => window.jwsimTest.openSketchDir(dir), sketch);
await win.waitForSelector(".tab.active:has-text('flood.ino')", { timeout: 10000 });
await win.click("#tab-console").catch(() => {});
if (process.env.JWSIM_FLOOD_SPEED) await win.click(`[data-speed="${process.env.JWSIM_FLOOD_SPEED}"]`);
await win.click("#btn-run");
await until(async () => (await t(() => window.jwsimTest.status())) === "running", 600000);
log(`imprimiendo ${SECONDS} s…`);

// Duración de los cuadros mientras corre (la interfaz no debe trabarse).
await t(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = (now) => {
    window.__frames.push(now - last);
    last = now;
    if (window.__frames.length < 100000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await win.waitForTimeout(SECONDS * 1000);

const sample = await t(() => {
  const clock = document.querySelector("#clock").textContent.trim();
  const lines = document.querySelector("#console").textContent.trim().split("\n");
  const f = window.__frames.slice(5).sort((a, b) => a - b);
  return {
    clock,
    last: Number(lines.at(-1)) || Number(lines.at(-2)),
    chars: document.querySelector("#console").textContent.length,
    frames: f.length, ser: window.__ser, serB: window.__serB, speed: document.querySelector("[data-speed][aria-checked=true]")?.textContent,
    frame_p50_ms: Math.round(f[Math.floor(f.length * 0.5)] ?? 0),
    frame_p95_ms: Math.round(f[Math.floor(f.length * 0.95)] ?? 0),
    frame_max_ms: Math.round(f.at(-1) ?? 0),
  };
});
await win.click("#btn-stop");
await app.close();

// Reloj "00:00:12.345" → ms.
const [h, m, s] = sample.clock.split(":").map(Number);
const clockMs = Math.round(((h * 60 + m) * 60 + s) * 1000);
const lagMs = clockMs - sample.last;
const factor = sample.speed === "Máx" ? 0 : Number(String(sample.speed ?? "×1").slice(1)) || 1;
// Atraso permitido: 1 s de simulación por cada ×1 (en Máx no se mide).
const crit = { pass: lagMs >= 0 && (factor === 0 || lagMs < 1000 * factor) && sample.frame_p95_ms <= 100 && sample.chars <= 200000, clock_ms: clockMs, lag_ms: lagMs, ...sample };
console.log(`SERIAL_FLOOD: ${crit.pass ? "OK" : "FALLA"} ${JSON.stringify(crit)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_SERIAL_FLOOD.json"), JSON.stringify({ result: crit.pass ? "PASS" : "FAIL", platform: process.platform, criteria: { SERIAL_FLOOD: crit } }, null, 2) + "\n");
console.log(`JWSIM_SERIAL_FLOOD=${crit.pass ? "PASS" : "FAIL"}`);
process.exit(crit.pass ? 0 : 1);
