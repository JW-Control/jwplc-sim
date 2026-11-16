// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del editor de componentes (docs/COMPONENTES.md, hito 1):
//   OPEN      Herramientas → Editor de componentes: pasos, lienzo y panel
//   BUILD     componente nuevo sin código: entrada digital, salida analógica
//             4-20 mA y una planta de 1.er orden; válido y con 4 bornes en la grilla
//   ART       importa un SVG propio: el símbolo lo incluye limpio (sin <script>)
//   DRAG      un borne arrastrado con el mouse cae en la grilla y del otro lado
//   DIAGRAM   el diagrama del modelo muestra entradas, bloques y salidas
//   BENCH     ejemplo hidropónico en «Probar»: con la bomba en marcha el nivel baja
//   SAVE      guarda la carpeta (component.json, art.svg, symbol.svg), la enlaza y
//             aparece en la paleta con la marca dev
//   SCENE     colocado en la escena y alimentado, entrega nivel y pH
// Informe en build/gates/JWSIM_COMPONENTES_E2E.json; capturas en build/gates/componentes/.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "componentes");
mkdirSync(OUT, { recursive: true });
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

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
const ce = () => t(() => window.JwsimComponentEditor.state());
const okNow = () => until(() => t(() => window.JwsimComponentEditor.state().check.ok));

try {
  // ---- OPEN
  await t(() => window.jwsimTest.scene.view("scene"));
  await t(() => window.JwsimComponentEditor.open());
  const tabs = await until(() => win.$$eval("#comped .ce-tabs [data-cetab]", (l) => (l.length ? l.map((b) => b.dataset.cetab) : null)));
  criteria.OPEN = { ok: tabs?.join() === "dibujo,io,modelo,com,probar", tabs };
  log(`OPEN ${JSON.stringify(criteria.OPEN)}`);

  // ---- BUILD
  await win.fill('#comped [data-path="name"]', "Horno de prueba");
  await win.fill('#comped [data-meta="author"]', "utec");
  await win.click('#comped [data-cetab="io"]');
  await win.click('#comped [data-act="io-add"][data-v="digital-in"]');
  await win.click('#comped [data-act="io-add"][data-v="analog-out"]');
  await win.click('#comped [data-cetab="modelo"]');
  await win.click('#comped [data-act="b-add"][data-v="tf"]');
  await until(() => win.$('#comped [data-path="blocks.0.in"]'));
  await win.selectOption('#comped [data-path="blocks.0.in"]', "entrada");
  await win.fill('#comped [data-path="blocks.0.K"]', "100");
  await win.click('#comped [data-cetab="io"]');
  await until(() => win.$('#comped [data-path="io.1.var"]'));
  await win.waitForTimeout(400);
  await win.selectOption('#comped [data-path="io.1.var"]', "y");
  const valid = await okNow();
  const s1 = await ce();
  const cxs = await win.$$eval("#comped .ce-sym .jw-term", (l) => l.map((c) => Number(c.getAttribute("cx"))));
  await win.screenshot({ path: join(OUT, "01-nuevo.png") });
  criteria.BUILD = { ok: !!valid && s1.spec.type === "utec/horno-de-prueba" && cxs.length === 4 && cxs.every((x) => x % 20 === 0), type: s1.spec.type, cxs, errors: s1.check.errors };
  log(`BUILD ${JSON.stringify(criteria.BUILD)}`);

  // ---- ART
  await win.click('#comped [data-cetab="dibujo"]');
  const artFile = join(workspace, "dibujo.svg");
  writeFileSync(artFile, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><script>alert(1)</script><rect x="10" y="10" width="180" height="80" rx="12" fill="#c33" onclick="x()"/><circle cx="100" cy="50" r="20" fill="#fc0"/></svg>`);
  await win.setInputFiles('#comped [data-act-file="art"]', artFile);
  const art = await until(() => win.$eval("#comped .ce-sym", (e) => (e.innerHTML.includes("#fc0") ? e.innerHTML : null)));
  await win.screenshot({ path: join(OUT, "02-dibujo.png") });
  criteria.ART = { ok: !!art && !/<script|onclick/.test(art) };
  log(`ART ${JSON.stringify(criteria.ART)}`);

  // ---- DRAG: el primer borne de arriba, arrastrado hacia abajo a la derecha.
  const term = await win.$('#comped .ce-sym .jw-term[data-term="X1"]');
  const box = await term.boundingBox();
  const sym = await (await win.$("#comped .ce-sym svg")).boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.mouse.move(sym.x + sym.width * 0.62, sym.y + sym.height * 0.9, { steps: 8 });
  await win.mouse.up();
  const pin = await until(async () => {
    const p = (await ce()).spec.symbol.pins?.X1;
    return p?.side === "b" ? p : null;
  });
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(OUT, "03-borne-movido.png") });
  criteria.DRAG = { ok: !!pin && pin.x % 20 === 0 && pin.x > 40, pin };
  log(`DRAG ${JSON.stringify(criteria.DRAG)}`);

  // ---- DIAGRAM (ejemplo hidropónico)
  await t(() => window.JwsimComponentEditor.openExample("hidroponia-nft"));
  await okNow();
  await win.click('#comped [data-ceview="diagrama"]');
  const nodes = await until(() => win.$$eval("#comped .ce-diagram .ce-node", (l) => (l.length ? l.map((g) => g.getAttribute("class").split(" ")[1]) : null)));
  await win.screenshot({ path: join(OUT, "04-diagrama.png") });
  const count = (k) => nodes?.filter((x) => x === k).length ?? 0;
  criteria.DIAGRAM = { ok: count("ce-blk") === 8 && count("ce-in") >= 4 && count("ce-out") >= 6, blocks: count("ce-blk"), inputs: count("ce-in"), outputs: count("ce-out") };
  log(`DIAGRAM ${JSON.stringify(criteria.DIAGRAM)}`);
  await win.click('#comped [data-ceview="dibujo"]');

  // ---- BENCH
  await win.click('#comped [data-cetab="probar"]');
  await until(() => win.$('#comped [data-bench="digital.bomba"]'));
  await win.check('#comped [data-bench="digital.bomba"]');
  await win.selectOption("#comped [data-bench-speed]", "60");
  await win.click('#comped [data-act="bench-toggle"]');
  const lowered = await until(async () => {
    const s = await ce();
    return s.bench.state?.tMs > 60000 ? s.bench.state : null;
  }, 20000);
  await win.click('#comped [data-act="bench-toggle"]');
  await win.waitForTimeout(300);
  await win.screenshot({ path: join(OUT, "05-probar.png") });
  criteria.BENCH = { ok: !!lowered && lowered.outputs.nivel < 60 && lowered.outputs.nivel > 50 && lowered.regs.some((r) => r.table === "input" && r.reg === 3), nivel: lowered?.outputs.nivel, tMs: lowered?.tMs };
  log(`BENCH ${JSON.stringify(criteria.BENCH)}`);

  // ---- SAVE
  await win.click('#comped [data-act="save"]');
  const saved = await until(async () => {
    const s = await ce();
    return s.dir && /Guardado/.test(s.note) ? s.dir : null;
  }, 15000);
  const files = saved && ["jwsim-device.json", "component.json", "art.svg", "symbol.svg", "README.md"].every((f) => existsSync(join(saved, f)));
  await win.screenshot({ path: join(OUT, "06-guardado.png") });
  await win.click('#comped [data-act="close"]');
  const badge = await until(() => win.$eval('#scene-add [data-add="jwcontrol/hidroponia-nft"] .palette-badge', (e) => e.textContent));
  criteria.SAVE = { ok: !!files && badge === "dev" && JSON.parse(readFileSync(join(saved, "jwsim-device.json"), "utf8")).entry === "component.json", dir: saved, badge };
  log(`SAVE ${JSON.stringify(criteria.SAVE)}`);

  // ---- SCENE
  await t(() => window.jwsimTest.scene.add("jwsim/power-24vdc", 0, 400, "PS9"));
  await t(() => window.jwsimTest.scene.add("jwcontrol/hidroponia-nft", 300, 360, "HN1"));
  await t(() => window.jwsimTest.scene.wire("PS9.+V1", "HN1.V+"));
  await t(() => window.jwsimTest.scene.wire("HN1.V-", "PS9.-V1"));
  await t(() => window.jwsimTest.scene.analyze());
  const outs = await until(() => t(() => window.jwsimTest.scene.snapshot()?.devices.find((d) => d.id === "HN1")?.outputs));
  await win.waitForTimeout(500);
  await win.screenshot({ path: join(OUT, "07-en-escena.png") });
  const val = (x) => (x && typeof x === "object" ? x.value : x);
  criteria.SCENE = { ok: Math.abs(Number(val(outs?.nivel)) - 60) < 1e-6 && Math.abs(Number(val(outs?.ph)) - 6.4) < 1e-6 && outs?.powered === true, nivel: val(outs?.nivel), ph: val(outs?.ph) };
  log(`SCENE ${JSON.stringify(criteria.SCENE)}`);
} finally {
  const ok = Object.values(criteria).length === 8 && Object.values(criteria).every((c) => c.ok);
  writeFileSync(join(ROOT, "build", "gates", "JWSIM_COMPONENTES_E2E.json"), JSON.stringify({ ok, criteria }, null, 2) + "\n");
  console.log(`JWSIM_COMPONENTES_E2E=${ok ? "PASS" : "FAIL"}`);
  await app.close();
  if (!ok) process.exitCode = 1;
}
