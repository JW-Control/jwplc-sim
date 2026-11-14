// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Auditoría de la grilla (20 px): cada tipo de dispositivo, con cada valor de
// sus parámetros de lista, debe tener ancho y alto múltiplos de 20 y todos
// sus bornes sobre la grilla (x múltiplo de 20; el cable entra por el borde
// de arriba o de abajo). Además, los equipos de las escenas incluidas
// (ejemplos y ejercicios) deben estar colocados sobre la grilla.
// Informe en build/gates/JWSIM_GRILLA.json; sale con 1 si algo no cumple.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-ws-")) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`], env });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
await win.waitForFunction(() => window.JwsimSymbols && window.JwsimSymbols.templates.size > 0, null, { timeout: 30000 });

// Símbolos: en la app, con las plantillas .svg ya cargadas.
const symbols = await win.evaluate(async () => {
  const G = window.JwsimSymbols.GRID;
  const defs = await window.jwsim.sceneDevices();
  const out = [];
  for (const def of defs) {
    const base = Object.fromEntries((def.parameters ?? []).map((p) => [p.id, p.default]));
    const variants = [{ label: "por defecto", params: base }];
    for (const p of def.parameters ?? []) {
      for (const o of p.type === "enum" ? (p.options ?? []) : []) if (o !== p.default) variants.push({ label: `${p.id}=${o}`, params: { ...base, [p.id]: o } });
    }
    const seen = new Set();
    for (const v of variants) {
      const L = window.JwsimSymbols.layout(def.type, def, v.params);
      const key = JSON.stringify([L.w, L.h, L.terms]);
      if (seen.has(key)) continue;
      seen.add(key);
      const issues = [];
      if (L.w % G || L.h % G) issues.push(`tamaño ${L.w} × ${L.h} no es múltiplo de ${G}`);
      for (const [id, t] of Object.entries(L.terms ?? {})) {
        if (t.x % G) issues.push(`borne ${id}: x = ${t.x} fuera de la grilla`);
        const edge = t.side === "t" ? 0 : t.side === "b" ? L.h : t.y;
        if (edge % G) issues.push(`borne ${id}: el cable entra en y = ${edge}, fuera de la grilla`);
      }
      const declared = (def.terminals ?? []).map((t) => t.id);
      const drawn = Object.keys(L.terms ?? {});
      const missing = declared.filter((id) => !drawn.includes(id));
      out.push({ type: def.type, variant: v.label, template: L.template ?? null, w: L.w, h: L.h, terminals: drawn.length, missing, issues });
    }
  }
  return out;
});
await app.close();

// Escenas incluidas: posición de cada equipo.
const scenes = [];
for (const base of ["exercises", "index/src", "tests/projects", "tests/plant"]) {
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory() && !/^(node_modules|build|solucion)$/.test(f.name)) walk(p);
      else if (f.name.endsWith(".jwsim")) {
        const s = JSON.parse(readFileSync(p, "utf8")).scene ?? {};
        const bad = (s.devices ?? []).filter((d) => (d.x ?? 0) % 20 || (d.y ?? 0) % 20).map((d) => `${d.id} en (${d.x}, ${d.y})`);
        scenes.push({ file: p.slice(ROOT.length + 1).replace(/\\/g, "/"), devices: (s.devices ?? []).length, issues: bad });
      }
    }
  };
  walk(join(ROOT, base));
}

const badSymbols = symbols.filter((s) => s.issues.length);
const badScenes = scenes.filter((s) => s.issues.length);
for (const s of badSymbols) console.log(`SÍMBOLO ${s.type} (${s.variant}): ${s.issues.join("; ")}`);
for (const s of badScenes) console.log(`ESCENA ${s.file}: ${s.issues.join(", ")}`);
const ok = !badSymbols.length && !badScenes.length;
console.log(`${symbols.length} símbolos/variantes (${new Set(symbols.map((s) => s.type)).size} tipos), ${scenes.length} escenas`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_GRILLA.json"), JSON.stringify({ ok, symbols, scenes }, null, 2) + "\n");
console.log(`JWSIM_GRILLA=${ok ? "PASS" : "FAIL"}`);
process.exitCode = ok ? 0 : 1;
