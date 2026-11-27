// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ladder con el aspecto del OpenPLC Editor (Electron + Playwright), lección
// IEC 03 en LD:
//   TARJETAS_POR_PELDANO   un peldaño = una tarjeta con su número y comentario
//   SIMBOLOS_OPENPLC       contactos de dos barras, bobinas entre paréntesis,
//                          barras de alimentación y uniones redondeadas
//   EN_VIVO                al ejecutar: contactos de E/S en verde (1) o azul
//                          (0) y la corriente en verde hasta la bobina
//   FORZADO_COLOR          Force True en I0.0: contacto en verde oliva (#80C000)
//   SIN_EN_VIVO_DETENIDO   al detener vuelve al dibujo en tinta
// Capturas (claro y oscuro) en build/gates/ladder-openplc/.
//   cd app && xvfb-run -a node tests/e2e-ladder-openplc.mjs
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "ladder-openplc");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
await win.setViewportSize?.({ width: 1680, height: 1000 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
const t = (fn, a) => win.evaluate(fn, a);
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(200);
  }
  return null;
};
const els = () =>
  t(() =>
    [...document.querySelectorAll("#plc-diagram-body .ld-el")].map((e) => ({
      sig: e.dataset.sig ?? null,
      v: e.dataset.var ?? null,
      cls: [...e.classList].filter((c) => /^(on|off|forced-[01])$/.test(c)).join(" "),
      color: getComputedStyle(e.querySelector(".ld-stroke, .ld-fill")).getPropertyValue(e.querySelector(".ld-stroke") ? "stroke" : "fill"),
    })),
  );
const shot = async (name) => {
  const box = await win.$("#plc-diagram");
  await (box ?? win).screenshot({ path: join(OUT, name) });
  await win.screenshot({ path: join(OUT, `pantalla-${name}`) });
};

try {
  await t(() => window.openLessonById("iec-03", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await until(() => t(() => !!document.querySelector("#plc-diagram-body .ld-rung")), 10000);
  // Más lugar para el diagrama: sin la teoría a la izquierda.
  await t(() => document.querySelector("#theory-collapse, .theory-collapse, [data-collapse='theory']")?.click());

  const s = await t(() => ({
    rungs: document.querySelectorAll("#plc-diagram-body .ld-rung").length,
    heads: [...document.querySelectorAll("#plc-diagram-body .ld-rung-h")].map((h) => h.textContent.trim()),
    contacts: document.querySelectorAll("#plc-diagram-body .ld-contact").length,
    coils: document.querySelectorAll("#plc-diagram-body .ld-coil .ld-fill").length,
    rails: document.querySelectorAll("#plc-diagram-body .ld-rail").length,
    rounded: [...document.querySelectorAll("#plc-diagram-body .ld-edge")].some((p) => /Q/.test(p.getAttribute("d"))),
  }));
  criteria.TARJETAS_POR_PELDANO = { pass: s.rungs >= 1 && s.heads.every((h) => /^\d+/.test(h)), rungs: s.rungs, heads: s.heads };
  criteria.SIMBOLOS_OPENPLC = { pass: s.contacts >= 2 && s.coils >= 1 && s.rails >= 2, ...s };
  await shot("detenido-claro.png");

  await win.click("#btn-run");
  await until(() => t(() => window.jwsimTest.status() === "running"), 300000);
  await win.waitForTimeout(1200);
  const live = await els();
  const io = live.filter((e) => e.sig);
  criteria.EN_VIVO = { pass: io.length > 0 && io.every((e) => /^(on|off)$/.test(e.cls)), io };
  await shot("en-vivo-reposo.png");

  // Force True en I0.0 (marcha) desde el menú del contacto.
  const r = await t(() => {
    const el = document.querySelector('#plc-diagram-body .ld-el[data-sig="I0_0"]');
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y, { button: "right" });
  await win.click('#plc-force-menu button[data-v="1"]');
  await until(() => t(() => window.jwsimTest.level("Q0_0")), 3000);
  await win.waitForTimeout(400);
  const forced = (await els()).find((e) => e.sig === "I0_0");
  const flowing = await t(() => document.querySelectorAll("#plc-diagram-body .ld-edge.on").length);
  criteria.FORZADO_COLOR = { pass: forced?.cls === "forced-1" && /128, 192, 0/.test(forced.color) && flowing > 0, forced, flowing };
  await shot("en-vivo-marcha.png");

  // Oscuro.
  await t(() => document.querySelector("#btn-theme, .theme-toggle")?.click());
  await win.waitForTimeout(400);
  await shot("en-vivo-marcha-oscuro.png");
  await t(() => document.querySelector("#btn-theme, .theme-toggle")?.click());

  await win.click("#btn-stop");
  await until(() => t(() => window.jwsimTest.status() !== "running"), 5000);
  await win.waitForTimeout(400);
  const after = await els();
  criteria.SIN_EN_VIVO_DETENIDO = { pass: after.every((e) => e.cls === ""), after: after.filter((e) => e.cls) };
} catch (err) {
  errors.push(String(err.stack ?? err));
}
criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
await app.close();
let ok = true;
for (const [k, v] of Object.entries(criteria)) {
  ok &&= v.pass;
  console.log(`${v.pass ? "OK  " : "FALLA"}  ${k} ${JSON.stringify(v)}`);
}
console.log(`JWSIM_LADDER_OPENPLC_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
