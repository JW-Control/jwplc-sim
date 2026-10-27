#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera los PNG y el .ico de JWPLC Sim desde app/icon/icon.svg:
//
//   node scripts/gen-icon.mjs
//
// Dibuja el SVG con Chromium (Playwright) en cada tamaño, con fondo
// transparente, y arma el .ico con las imágenes PNG (formato admitido desde
// Windows Vista). Salida en app/icon/: icon.png (512), icon-<N>.png y
// icon.ico (16 a 256). Los archivos generados se versionan: el instalador no
// necesita Playwright.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "..", "app", "icon");
const ICO = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const PNG = [16, 32, 48, 64, 128, 256, 512];

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("[icono] falta Playwright (npm.cmd install -g playwright y npx.cmd playwright install chromium)");
  process.exit(2);
}

const svg = readFileSync(join(DIR, "icon.svg"), "utf8").replace(/^<\?xml[^>]*>\s*/, "");
const browser = await chromium.launch();
const page = await browser.newPage();
/** @type {Map<number, Buffer>} */
const shots = new Map();
for (const n of [...new Set([...ICO, ...PNG])].sort((a, b) => a - b)) {
  await page.setViewportSize({ width: n, height: n });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="256" height="256"/, `width="${n}" height="${n}"`)}</body></html>`);
  shots.set(n, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } }));
}
await browser.close();

for (const n of PNG) writeFileSync(join(DIR, n === 512 ? "icon.png" : `icon-${n}.png`), shots.get(n));

// .ico: cabecera, una entrada de 16 bytes por tamaño y los PNG a continuación.
const head = Buffer.alloc(6 + 16 * ICO.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(ICO.length, 4);
let offset = head.length;
ICO.forEach((n, i) => {
  const png = shots.get(n);
  const e = 6 + 16 * i;
  head.writeUInt8(n >= 256 ? 0 : n, e);
  head.writeUInt8(n >= 256 ? 0 : n, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(png.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
writeFileSync(join(DIR, "icon.ico"), Buffer.concat([head, ...ICO.map((n) => shots.get(n))]));
console.log(`[icono] ${DIR}: icon.ico (${ICO.join(", ")}), icon.png (512) y ${PNG.filter((n) => n !== 512).map((n) => `icon-${n}.png`).join(", ")}`);
