#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Kit de símbolos (docs/SIMBOLOS.md): todo lo que hace falta para rehacer
// los símbolos de la escena fuera del código.
//
//   CONTRATO.md            el contrato .svg
//   dispositivos.json      por tipo: tamaño, bornes (x, lado), parámetros,
//                          acciones y salidas
//   actuales/<tipo>-reposo.svg|png, -activo, -disparada   dibujos actuales
//   placa/jwplc-basic.svg  la placa (pinout y grilla de 64 unidades)
//   plantillas/            ejemplo que cumple el contrato
//   referencias/           imágenes de referencia (--ref <carpeta>)
//
// Uso: node scripts/export-symbols.mjs [--out <carpeta>] [--ref <carpeta con imágenes>]
// Deja también <carpeta>.zip.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, relative, resolve } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

import { builtinDevices } from "../scene/devices/index.mjs";
import { Scene } from "../scene/scene.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = resolve(opt("--out", join(ROOT, "build", "simbolos-kit")));
const REF = opt("--ref", null);

rmSync(OUT, { recursive: true, force: true });
for (const d of ["actuales", "placa", "plantillas", "referencias"]) mkdirSync(join(OUT, d), { recursive: true });

// Estado "activo" de cada tipo para el dibujo de referencia.
const ACTIVE = {
  "pushbutton-no": { pressed: true },
  "pushbutton-nc": { pressed: true },
  "selector-2": { position: 1 },
  "selector-3": { position: 1 },
  "limit-switch": { actuated: true },
  "sensor-inductive": { detecting: true, output: true, powered: true },
  "sensor-photoelectric": { detecting: true, output: true, powered: true },
  lamp: { lit: true },
  buzzer: { sounding: true },
  relay: { energized: true, closed: true },
  contactor: { energized: true, closed: true },
  "solenoid-valve": { energized: true, position: 0.6 },
  motor: { energized: true, running: true, speed: 0.7 },
  "power-24vdc": { on: true },
  "power-230vac": { on: true },
};

// Datos de cada dispositivo: definición y salidas (de una escena con él solo).
const devices = builtinDevices.filter((d) => d.type !== "jwsim/jwplc-basic");
const info = {};
for (const d of devices) {
  const sc = new Scene({ devices: [{ id: "D", type: d.type }], wiring: [] });
  info[d.type] = {
    nombre: d.name,
    categoria: d.category,
    descripcion: d.description,
    bornes: d.terminals.map((t) => ({ id: t.id, rotulo: t.label ?? t.id })),
    parametros: d.parameters ?? [],
    acciones: d.actions ?? [],
    salidas: Object.keys(sc.snapshot().devices[0].outputs),
  };
}

// Dibujos actuales con el mismo código de la app (Chromium de Playwright).
createRequire(join(ROOT, "app", "package.json"));
const { chromium } = await import(join(ROOT, "app", "node_modules", "playwright", "index.mjs"));
const exe = ["/opt/pw-browsers/chromium"].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ deviceScaleFactor: 2 });
const css = readFileSync(join(ROOT, "app", "renderer", "style.css"), "utf8");
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="background:#101317"></body></html>`);
await page.addScriptTag({ path: join(ROOT, "app", "renderer", "scene-symbols.js") });
// Estilos de los rótulos, para que cada .svg se vea igual fuera de la app.
const symCss = [...css.matchAll(/\.dev text\.sym-[^{]+\{[^}]*\}/g)].map((m) => m[0].replaceAll(".dev ", "")).join("\n");

for (const d of devices) {
  const short = d.type.split("/")[1];
  const params = Object.fromEntries((d.parameters ?? []).map((p) => [p.id, p.default]));
  const lay = await page.evaluate(([t, def]) => window.JwsimSymbols.layout(t, def), [d.type, { terminals: d.terminals }]);
  info[d.type].tamano = { ancho: lay.w, alto: lay.h };
  info[d.type].bornes = info[d.type].bornes.map((b) => ({ ...b, x: lay.terms[b.id]?.x, lado: lay.terms[b.id]?.side === "b" ? "abajo" : "arriba" }));
  const states = [["reposo", {}], ["activo", ACTIVE[short] ?? {}]];
  if (short.startsWith("power")) states.push(["disparada", {}]);
  for (const [state, outputs] of states) {
    const st = { outputs, contacts: {}, damaged: [], tripped: state === "disparada" };
    const inner = await page.evaluate(([t, l, s, p]) => window.JwsimSymbols.draw(t, l, s, p, null), [d.type, lay, st, params]);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 ${lay.w + 20} ${lay.h + 20}" width="${(lay.w + 20) * 2}" height="${(lay.h + 20) * 2}">` +
      `<style>text{text-anchor:middle;font-family:sans-serif}\n${symCss}</style><g class="dev">${inner}</g></svg>`;
    writeFileSync(join(OUT, "actuales", `${short}-${state}.svg`), svg);
    await page.setContent(`<html><body style="margin:0;background:#101317">${svg}</body></html>`);
    await (await page.$("svg")).screenshot({ path: join(OUT, "actuales", `${short}-${state}.png`), omitBackground: false });
  }
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body></body></html>`);
  await page.addScriptTag({ path: join(ROOT, "app", "renderer", "scene-symbols.js") });
}
await browser.close();

writeFileSync(join(OUT, "dispositivos.json"), JSON.stringify(info, null, 2) + "\n");
copyFileSync(join(ROOT, "docs", "SIMBOLOS.md"), join(OUT, "CONTRATO.md"));
copyFileSync(join(ROOT, "app", "renderer", "assets", "jwplc-basic.svg"), join(OUT, "placa", "jwplc-basic.svg"));
copyFileSync(join(ROOT, "docs", "simbolos", "pushbutton-no.svg"), join(OUT, "plantillas", "pushbutton-no.svg"));
if (REF && existsSync(REF)) for (const f of readdirSync(REF)) copyFileSync(join(REF, f), join(OUT, "referencias", f));
writeFileSync(
  join(OUT, "LEEME.md"),
  `# Kit de símbolos de JWPLC Sim

Para rehacer los símbolos de los dispositivos de la escena (o crear nuevos).

1. Leer \`CONTRATO.md\`: tamaño en múltiplos de 20, bornes marcados con
   \`.jw-term\` y partes que cambian con el estado (\`data-show\`, \`data-fill\`,
   \`data-translate\`, \`data-rotate\`, \`data-action\`).
2. \`dispositivos.json\`: por tipo, el tamaño actual, sus bornes (con la
   \`x\` y el lado actuales), parámetros, acciones y salidas. Se puede cambiar
   el tamaño y la posición de los bornes (siempre \`x\` múltiplo de 20); los
   nombres de los bornes, acciones y salidas son los de la definición.
3. \`actuales/\`: cómo se ven hoy, en reposo y activos (punto de partida).
4. \`plantillas/pushbutton-no.svg\`: un símbolo completo que cumple el contrato.
5. \`placa/jwplc-basic.svg\`: la placa, para mantener el mismo estilo.
6. \`referencias/\`: el estilo buscado (equipos de tablero vistos de frente).

Entrega: un archivo por tipo con el nombre corto (\`contactor.svg\`,
\`pushbutton-nc.svg\`…). Van en \`app/renderer/assets/devices/\` del repositorio
jwplc-sim; la app los toma al abrir la escena.
`,
);

// .zip (deflate) sin dependencias.
function zip(dir, file) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const parts = [];
  const central = [];
  let off = 0;
  for (const p of files) {
    const name = Buffer.from(`${basename(dir)}/${relative(dir, p).split("\\").join("/")}`, "utf8");
    const data = readFileSync(p);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  writeFileSync(file, Buffer.concat([...parts, cd, end]));
  return files.length;
}
const n = zip(OUT, `${OUT}.zip`);
console.log(`[símbolos] ${OUT}.zip (${n} archivos)`);
