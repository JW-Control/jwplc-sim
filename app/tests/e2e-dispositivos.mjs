// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del gestor de dispositivos propios (modo desarrollador, etapa A
// de docs/integration/PROPUESTA_MODELOS_PROPIOS.md), con una copia de
// sdk/template/scene-device y un symbol.svg:
//   DEVMGR_OPEN   «Propios…» en la paleta abre el gestor, sin dispositivos
//   LINK          agregar la carpeta: «Listo» y el equipo en la paleta con «dev»
//   PLACE         se coloca en la escena con su símbolo y los bornes en la grilla
//   RELOAD        cambiar el código y el símbolo y Recargar: se ve sin reiniciar
//   BROKEN        un borne fuera de la grilla: «Con errores» y el porqué
//   UNLINK        Quitar: sale de la paleta
// Informe en build/gates/JWSIM_DISPOSITIVOS_E2E.json.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "dispositivos");
mkdirSync(OUT, { recursive: true });
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);
const TYPE = "autor/mi-dispositivo";

// Dispositivo en desarrollo: la plantilla del SDK con un símbolo propio.
const dev = mkdtempSync(join(tmpdir(), "jwsim-dev-"));
cpSync(join(ROOT, "sdk", "template", "scene-device"), dev, { recursive: true });
const symbol = (h, x2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 ${h}"><rect x="1" y="1" width="78" height="${h - 2}" rx="6" fill="#e4e7eb" stroke="#1b1e22"/>` +
  `<circle cx="20" cy="12" r="7" fill="#f4f5f7" stroke="#1b1e22"/><circle class="jw-term" data-term="X1" cx="20" cy="12" r="8"/>` +
  `<circle cx="${x2}" cy="${h - 12}" r="7" fill="#f4f5f7" stroke="#1b1e22"/><circle class="jw-term" data-term="X2" cx="${x2}" cy="${h - 12}" r="8"/>` +
  `<circle cx="40" cy="${h / 2}" r="16" fill="#555" data-show="!out.lit"/><circle cx="40" cy="${h / 2}" r="16" fill="#ffcc00" data-show="out.lit"/></svg>`;
writeFileSync(join(dev, "symbol.svg"), symbol(100, 60));

createRequire(import.meta.url)("electron");
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(workspace, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 950));
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await win.waitForTimeout(100);
  }
  return null;
};
const status = () => win.$eval("#devmgr .dev-item .dev-st", (e) => e.textContent).catch(() => null);
const inPalette = () => win.$(`#scene-add [data-add="${TYPE}"]`).then((e) => !!e);

try {
  // ---- DEVMGR_OPEN
  await t(() => window.jwsimTest.scene.view("scene"));
  await win.click("#scene-tab-add");
  await win.click("#scene-devmgr");
  const empty = await until(() => win.$eval("#devmgr", (e) => !e.hidden && /Ninguno todavía/.test(e.textContent) && e.textContent));
  criteria.DEVMGR_OPEN = { ok: !!empty };
  log(`DEVMGR_OPEN ${JSON.stringify(criteria.DEVMGR_OPEN)}`);

  // ---- LINK (el diálogo de carpeta se reemplaza por la ruta)
  await t((d) => window.JwsimDevices.link(d), dev);
  const st1 = await until(status);
  const badge = await win.$eval(`#scene-add [data-add="${TYPE}"] .palette-badge`, (e) => e.textContent).catch(() => null);
  await win.screenshot({ path: join(OUT, "01-enlazado.png") });
  criteria.LINK = { ok: /Listo/.test(st1 ?? "") && badge === "dev", status: st1, badge };
  log(`LINK ${JSON.stringify(criteria.LINK)}`);

  // ---- PLACE
  await win.click('#devmgr [data-act="close"]');
  await t((type) => window.jwsimTest.scene.add(type, 400, 200, "H9"), TYPE);
  await win.waitForTimeout(300);
  const tpl = await t(() => window.jwsimTest.scene.templateOf("H9"));
  const size = await t((type) => window.jwsimTest.scene.symbolSize(type), TYPE);
  const spec = await t(() => window.jwsimTest.scene.spec());
  const placed = spec.devices.find((d) => d.id === "H9");
  const terms = await win.$$eval('.term[data-term^="H9."]', (l) => l.length);
  await win.screenshot({ path: join(OUT, "02-en-escena.png") });
  criteria.PLACE = { ok: tpl === TYPE && size.w === 80 && size.h === 100 && placed.x % 20 === 0 && placed.y % 20 === 0 && terms === 2, template: tpl, size, at: [placed.x, placed.y], terms };
  log(`PLACE ${JSON.stringify(criteria.PLACE)}`);

  // ---- RELOAD: nombre nuevo en el código y símbolo más alto
  const src = join(dev, "device.mjs");
  writeFileSync(src, readFileSync(src, "utf8").replace('name: "Mi dispositivo"', 'name: "Baliza v2"'));
  writeFileSync(join(dev, "symbol.svg"), symbol(120, 60));
  await t(() => window.JwsimDevices.open());
  await win.click('#devmgr [data-act="reload"]');
  await until(() => win.$eval("#devmgr .devmgr-bar .muted", (e) => /Recargado/.test(e.textContent)));
  const title = await win.$eval(`#scene-add [data-add="${TYPE}"]`, (e) => e.title);
  const size2 = await t((type) => window.jwsimTest.scene.symbolSize(type), TYPE);
  criteria.RELOAD = { ok: title === "Baliza v2" && size2.h === 120, title, size: size2 };
  log(`RELOAD ${JSON.stringify(criteria.RELOAD)}`);

  // ---- BROKEN
  writeFileSync(join(dev, "symbol.svg"), symbol(120, 50));
  await win.click('#devmgr [data-act="reload"]');
  const st2 = await until(async () => {
    const s = await status();
    return /Con errores|No carga/.test(s ?? "") ? s : null;
  });
  const why = await win.$eval("#devmgr .dev-msgs", (e) => e.textContent).catch(() => "");
  await win.screenshot({ path: join(OUT, "03-roto.png") });
  criteria.BROKEN = { ok: !!st2 && /X2 debe tener cx múltiplo de 20 \(tiene 50\)/.test(why), why };
  log(`BROKEN ${JSON.stringify(criteria.BROKEN)}`);

  // ---- UNLINK
  await win.click('#devmgr [data-act="unlink"]');
  await until(() => win.$eval("#devmgr", (e) => /Ninguno todavía/.test(e.textContent)));
  const gone = !(await inPalette());
  criteria.UNLINK = { ok: gone };
  log(`UNLINK ${JSON.stringify(criteria.UNLINK)}`);
} finally {
  const ok = Object.values(criteria).length === 6 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_DISPOSITIVOS_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_DISPOSITIVOS_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
