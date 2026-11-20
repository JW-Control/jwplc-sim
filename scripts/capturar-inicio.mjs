// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Regenera las miniaturas de la pantalla Inicio (JWPLC_Aprende/extras/imagenes):
// abre cada reto y cada arquitectura en la app, pasa a «Planta 3D» y guarda
// la vista como JPEG. Uso: node scripts/capturar-inicio.mjs (en Linux, con
// xvfb-run -a).
import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "app");
const OUT = join(ROOT, "JWPLC_Aprende", "extras", "imagenes");
mkdirSync(OUT, { recursive: true });
const req = createRequire(join(APP, "package.json"));
req("electron");
const { _electron: electron } = req("playwright");

const ws = mkdtempSync(join(tmpdir(), "jwsim-inicio-"));
const env = { ...process.env, JWSIM_WORKSPACE: ws, JWSIM_HOME: join(ROOT, ".jwsim"), JWSIM_START_SCREEN: "0" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1180, 760));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
await win.waitForFunction(() => window.JwsimSymbols?.templates?.size > 0, null, { timeout: 30000 });
// Tema oscuro (las tarjetas se ven en los dos temas) y sin la mini placa.
await win.evaluate(() => {
  localStorage.setItem("jwsim-theme", "dark");
  document.querySelector('meta[name="color-scheme"]').content = "dark";
  window.dispatchEvent(new CustomEvent("jwsim:themechange", { detail: { dark: true } }));
  const st = document.createElement("style");
  st.textContent = "#mini-plc{display:none!important}";
  document.head.appendChild(st);
});

const shot = async (name, open) => {
  await win.evaluate(() => window.JwsimTabs?.select("program"));
  await win.evaluate(open);
  await win.waitForTimeout(1500);
  await win.evaluate(() => window.JwsimTabs?.select("plant"));
  await win.waitForTimeout(2500);
  await win.evaluate(() => window.dispatchEvent(new CustomEvent("jwsim:themechange", { detail: { dark: true } })));
  await win.waitForTimeout(300);
  await (await win.$("#view3d-canvas")).screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 80, scale: "css" });
  console.log(`[inicio] ${name}.jpg`);
};

const exercises = readdirSync(join(ROOT, "JWPLC_Aprende", "extras", "retos")).filter((d) => /^\d\d-/.test(d)).sort();
const archs = readdirSync(join(ROOT, "JWPLC_Aprende", "extras", "arquitecturas")).filter((d) => /^\d\d-/.test(d)).sort();
try {
  for (const id of exercises) await shot(`reto-${id}`, `window.jwsimTest.pickExercise(${JSON.stringify(id)})`);
  for (const id of archs) await shot(`arq-${id}`, `window.jwsimTest.pickArch(${JSON.stringify(id)})`);
} finally {
  await app.close();
}
