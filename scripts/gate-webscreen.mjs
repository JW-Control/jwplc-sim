#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_WEBSCREEN: JWPLC_WebScreen (pantalla del equipo en el navegador)
// a través del W5500 simulado y app/lib/net-bridge.mjs. El ejemplo
// 02.Runtime_En_Vivo (Runtime de panel, IP fija) se publica en 127.0.0.1:1080.
//   pagina      "/" entrega la página HTML
//   teclas      OK y ► desde la página ("/k") llevan el MENU a RED
//   cuadro      la pantalla que arma la página con "/f" (filas que cambian,
//               paleta incremental) es idéntica, píxel a píxel, a la TFT
//               simulada en el mismo instante
//   trafico     con la pantalla quieta cada pedido pesa menos de 1 KB
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";
import { readScreenDump } from "./lib/png.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const sketch = join(root, lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_WebScreen", "examples", "02.Runtime_En_Vivo");
const { exe } = await buildSketch(sketch, { target, log: () => {} });
const wine = exe.endsWith(".exe") && process.platform !== "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "http://127.0.0.1:1080";
const SHOT_MS = 16000;
const fb = join(tmpdir(), `jwsim-webscreen-${process.pid}.fb`);

const bridge = new NetBridge({ listenPort: (p) => p + 1000 });
const proc = new RunnerProcess();
proc.start(exe, ["--eth", "--screen-at", `${SHOT_MS}:${fb}`, "--rtc", "fijo:2026-11-03T09:00:00"], { env: { WINEDEBUG: "-all" }, launcher: wine ? WINE : undefined });
bridge.attach(proc);
proc.send({ type: "run", speed: 1 });
const t0 = Date.now();

// Cliente igual al de la página: versión + paleta conocida, solo filas nuevas.
const view = { W: 0, H: 0, pal: [], idx: null, ver: 0, reqs: 0, bytes: [] };
async function poll() {
  const r = await fetch(`${URL}/f?v=${view.ver}&p=${view.pal.length}`);
  const b = Buffer.from(await r.arrayBuffer());
  view.reqs++;
  view.bytes.push(b.length);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.toString("latin1", 0, 4) !== "JWS1") throw new Error("cuadro sin cabecera JWS1");
  let o = 4;
  const nv = dv.getUint32(o, true);
  const w = dv.getUint16(o + 4, true);
  const h = dv.getUint16(o + 6, true);
  o += 8;
  if (w !== view.W || h !== view.H) {
    Object.assign(view, { W: w, H: h, idx: new Uint8Array(w * h), ver: 0 });
    return;
  }
  const from = dv.getUint16(o, true);
  const n = dv.getUint16(o + 2, true);
  o += 4;
  for (let i = 0; i < n; i++, o += 2) view.pal[from + i] = dv.getUint16(o, true);
  for (;;) {
    const y = dv.getUint16(o, true);
    o += 2;
    if (y === 0xffff) break;
    for (let x = 0; x < w; ) {
      const len = dv.getUint8(o) + 1;
      view.idx.fill(dv.getUint8(o + 1), y * w + x, y * w + x + len);
      x += len;
      o += 2;
    }
  }
  view.ver = nv;
}
async function key(b) {
  await fetch(`${URL}/k?b=${b}&d=1`);
  await sleep(150);
  await fetch(`${URL}/k?b=${b}&d=0`);
}

const criteria = {};
try {
  let page = null;
  while (page === null && Date.now() - t0 < 30000) {
    try {
      page = await (await fetch(`${URL}/`)).text();
    } catch {
      await sleep(200);
    }
  }
  criteria.pagina = { pass: !!page && page.includes("JWPLC Basic") && page.includes("/f?v="), bytes: page?.length ?? 0, listo_ms: Date.now() - t0 };

  // Desde la página: OK abre el MENU (PROGRAMA), ▼ baja a CONFIG. y ► pasa a RED.
  const keys = [{ t: 11000, b: 4 }, { t: 12500, b: 5 }, { t: 13500, b: 2 }];
  let quietFrom = 0;
  while (Date.now() - t0 < SHOT_MS + 500) {
    const el = Date.now() - t0;
    for (const k of keys) if (!k.done && el >= k.t) {
      k.done = true;
      await key(k.b);
    }
    if (!quietFrom && el >= 14500) quietFrom = view.bytes.length;
    await poll();
    await sleep(60);
  }
  const quiet = view.bytes.slice(quietFrom);
  criteria.trafico = { pass: quiet.length > 3 && Math.max(...quiet) < 1024, pedidos: view.reqs, maximo_quieto: Math.max(...quiet), colores: view.pal.length };
} catch (e) {
  criteria.error = { pass: false, error: e.message };
}
proc.send({ type: "quit" });
await sleep(800);
proc.stop();
bridge.close();

try {
  const s = readScreenDump(readFileSync(fb));
  let diff = 0;
  for (let i = 0; i < s.width * s.height; i++) {
    const v = view.pal[view.idx[i]] ?? 0;
    const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
    const px = [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
    if (px.some((c, k) => Math.abs(c - s.rgb[i * 3 + k]) > 8)) diff++;
  }
  criteria.cuadro = { pass: s.width === view.W && s.height === view.H && diff === 0, ancho: view.W, alto: view.H, pixeles_distintos: diff };
  // RED seleccionada = el MENU respondió a las teclas de la página (verde en la baldosa central inferior).
  const at = (x, y) => [s.rgb[(y * s.width + x) * 3], s.rgb[(y * s.width + x) * 3 + 1], s.rgb[(y * s.width + x) * 3 + 2]];
  const red = at(160, 120);
  criteria.teclas = { pass: red[1] > 40 && red[0] < 40, color_baldosa_red: red };
} catch (e) {
  criteria.cuadro = { pass: false, error: e.message };
}

const pass = printCriteria("JWSIM_WEBSCREEN", criteria, ` (${target})`);
writeReport(`JWSIM_WEBSCREEN-${target}`, { gate: "JWSIM_WEBSCREEN", target, package: lock.JWPLC_PACKAGE_REF, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
