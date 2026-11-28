// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba de humo de la app EMPAQUETADA (la que va en el instalador), no la de
// desarrollo. Regla de JW Control: ninguna versión sale sin abrir la app armada
// y recorrer todas sus pestañas. En 0.3.0 y en 0.6.0 la Planta 3D salió en
// blanco solo en el instalador (faltaban complementos de three.js), mientras en
// desarrollo todo andaba.
//
//   INICIO       la pantalla de Inicio se dibuja con su ruta y accesos
//   SIN_ERRORES  ningún error de carga de módulos ni excepción en la ventana
//   PROGRAMA     editor Monaco cargado
//   ESQUEMA      escena de una arquitectura dibujada (equipos en pantalla)
//   PLANTA_3D    scene3d.js cargado, objetos en la escena 3D y la imagen del
//                lienzo NO es de un solo color (no está en blanco)
//   PLACA        la placa del JWPLC se ve
//   IEC          la vista «Normalizado (IEC)» del esquema se dibuja
//
//   node scripts/dist.mjs --dir          (o el instalador ya armado en Windows)
//   cd app && xvfb-run -a node tests/e2e-empaquetado.mjs
//   node tests/e2e-empaquetado.mjs --dev   misma prueba con la app de desarrollo
//
// Capturas e informe en build/gates/empaquetado/. Sale con 1 si algo falla: el
// workflow dist-windows no publica la Release en ese caso.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "empaquetado");
mkdirSync(OUT, { recursive: true });
const dev = process.argv.includes("--dev");
const win32 = process.platform === "win32";
const UNPACKED = process.env.JWSIM_UNPACKED ?? join(ROOT, "build", "dist", win32 ? "win-unpacked" : "linux-unpacked");
const exe = join(UNPACKED, win32 ? "JWPLC Sim.exe" : "jwplc-sim");
if (!dev && !existsSync(exe)) {
  console.error(`falta la app armada en ${UNPACKED} (node scripts/dist.mjs --dir)`);
  process.exit(2);
}

const workspace = mkdtempSync(join(tmpdir(), "jwsim-pk-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-pk-ud-"));
const args = [`--user-data-dir=${userData}`];
if (dev) {
  createRequire(import.meta.url)("electron");
  args.unshift(APP);
}
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim"), JWSIM_START_SCREEN: "1" };

const criteria = {};
let failed = 0;
const check = (name, ok, extra = "") => {
  criteria[name] = { pass: !!ok, extra };
  console.log(`${ok ? "OK   " : "FALLA"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({ ...(dev ? {} : { executablePath: exe }), args, env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Módulos y archivos que no cargan: lo que dejó la Planta 3D en blanco.
    if (/Failed to (load|resolve|fetch)|ERR_FILE_NOT_FOUND|net::ERR|Uncaught|TypeError|ReferenceError|SyntaxError/.test(t)) errors.push(`console: ${t}`);
  });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  await page.setViewportSize?.({ width: 1600, height: 950 }).catch(() => {});
  await page.waitForSelector(".monaco-editor .view-lines", { timeout: 90000 });
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

  // Inicio
  await page.waitForFunction(() => document.querySelectorAll(".ini-ribbon, .ini-node").length > 0, null, { timeout: 20000 }).catch(() => {});
  const ini = await page.evaluate(() => ({ ribbon: !!document.querySelector(".ini-ribbon"), nodes: document.querySelectorAll(".ini-node").length }));
  await shot("0-inicio");
  check("INICIO", ini.ribbon, `ruta: ${ini.nodes} pasos`);

  // Arquitectura 01 (tiene esquema, planta 3D y tablero): cierra el Inicio.
  await page.waitForFunction(() => window.jwsimTest?.archs().length > 0, null, { timeout: 30000 });
  const arch = await page.evaluate(() => window.jwsimTest.archs()[0].id);
  await page.evaluate((id) => window.jwsimTest.pickArch(id), arch);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => window.JwsimStart?.close?.());
  await sleep(1500);

  const tab = async (name) => {
    await page.click(`.mtab[data-tab="${name}"]`);
    await page.waitForFunction((n) => document.body.dataset.tab === n, name, { timeout: 10000 }).catch(() => {});
    await sleep(1200);
  };

  await tab("program");
  const monaco = await page.evaluate(() => !!document.querySelector(".monaco-editor .view-lines") && (window.jwsimTest?.activeText?.() ?? "").length > 0);
  await shot("1-programa");
  check("PROGRAMA", monaco, `arquitectura ${arch}`);

  await tab("schematic");
  const devs = await page.evaluate(() => document.querySelectorAll("#scene svg *").length || document.querySelectorAll("svg [data-id]").length);
  await shot("2-esquema");
  check("ESQUEMA", devs > 20, `${devs} elementos dibujados`);

  // Planta 3D: el módulo tiene que haber cargado y el lienzo tener imagen.
  await tab("plant");
  await page.waitForFunction(() => (window.Jwsim3D?.objects?.() ?? []).length > 0, null, { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  const v3 = await page.evaluate(() => {
    const objs = window.Jwsim3D?.objects?.() ?? [];
    const c = [...document.querySelectorAll("canvas")].filter((e) => e.offsetParent !== null).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const r = c?.getBoundingClientRect();
    return { loaded: !!window.Jwsim3D, objs: objs.length, rect: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  });
  await shot("3-planta-3d");
  let colors = 0;
  if (v3.rect?.w > 50 && v3.rect?.h > 50) {
    const buf = await page.screenshot({ clip: { x: v3.rect.x, y: v3.rect.y, width: v3.rect.w, height: v3.rect.h } });
    // Colores distintos del lienzo (muestreo) con nativeImage en el proceso principal.
    colors = await app.evaluate(({ nativeImage }, b64) => {
      const img = nativeImage.createFromBuffer(Buffer.from(b64, "base64"));
      const { width, height } = img.getSize();
      const bmp = img.toBitmap();
      const seen = new Set();
      for (let y = 0; y < height; y += 7) for (let x = 0; x < width; x += 7) {
        const i = (y * width + x) * 4;
        seen.add((bmp[i] >> 3) << 10 | (bmp[i + 1] >> 3) << 5 | (bmp[i + 2] >> 3));
      }
      return seen.size;
    }, buf.toString("base64"));
  }
  check("PLANTA_3D", v3.loaded && v3.objs > 0 && colors > 40, `módulo ${v3.loaded ? "cargado" : "NO cargado"}, ${v3.objs} objetos, ${colors} colores en el lienzo`);

  await tab("board");
  const board = await page.evaluate(() => {
    const t = document.getElementById("tft");
    return !!t && t.getBoundingClientRect().width > 50;
  });
  await shot("4-placa");
  check("PLACA", board);

  // Esquema normalizado IEC (sub-vista del esquema).
  await tab("schematic");
  const iecBtn = await page.$('#mtab-sub-schematic [data-sym="iec"], #mtab-sub-schematic button:has-text("IEC")');
  if (iecBtn) {
    await iecBtn.click();
    await sleep(1500);
    await shot("5-esquema-iec");
    const iec = await page.evaluate(() => document.querySelectorAll("svg *").length);
    check("IEC", iec > 50, `${iec} elementos`);
  } else check("IEC", false, "no se encontró el botón de la vista IEC");

  check("SIN_ERRORES", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}
writeFileSync(join(OUT, "JWSIM_EMPAQUETADO.json"), JSON.stringify({ app: dev ? "desarrollo" : UNPACKED, criteria, errors }, null, 2));
console.log(failed ? `${failed} fallas: NO publicar` : "todo OK: la app empaquetada abre todas sus pestañas");
process.exit(failed ? 1 : 0);
