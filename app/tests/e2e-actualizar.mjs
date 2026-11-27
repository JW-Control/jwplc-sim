// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Actualización desde el programa (app/lib/updater.mjs, Electron + Playwright).
// Un servidor local hace de Release (JWSIM_UPDATE_FEED, proveedor «generic»)
// con una versión 9.9.0 inventada:
//   ENCUENTRA_LA_NUEVA   la app busca, encuentra 9.9.0 y empieza a bajarla
//   LISTA_PARA_INSTALAR  al terminar la descarga la barra de estado ofrece
//                        «Actualizar a 9.9.0»
//   AL_DIA               con el servidor en la versión actual, no ofrece nada
// En Linux electron-updater usa el actualizador de AppImage: la prueba le da
// un APPIMAGE de mentira (solo para que acepte bajar el archivo). No instala.
//   cd app && xvfb-run -a node tests/e2e-actualizar.mjs
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "actualizar");
mkdirSync(OUT, { recursive: true });
const current = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).version;
const feedDir = mkdtempSync(join(tmpdir(), "jwsim-feed-"));
const fakeAppImage = join(feedDir, "viejo.AppImage");
writeFileSync(fakeAppImage, "viejo");

const criteria = {};
const errors = [];
let served = "9.9.0";
const file = () => `JWPLC-Sim-${served}.AppImage`;
const payload = Buffer.alloc(256 * 1024, 7);
const sha512 = createHash("sha512").update(payload).digest("base64");
const yml = () => `version: ${served}\nfiles:\n  - url: ${file()}\n    sha512: ${sha512}\n    size: ${payload.length}\npath: ${file()}\nsha512: ${sha512}\nreleaseDate: '2026-11-26T00:00:00.000Z'\n`;
const server = createServer((req, res) => {
  if (/latest.*\.yml/.test(req.url)) {
    res.writeHead(200, { "content-type": "text/yaml" });
    res.end(yml());
  } else if (req.url.endsWith(".AppImage")) {
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": payload.length });
    res.end(payload);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const feed = `http://127.0.0.1:${server.address().port}/`;

async function launch() {
  const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
  createRequire(import.meta.url)("electron");
  const args = [APP, `--user-data-dir=${userData}`];
  if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
  const env = { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-ws-")), JWSIM_HOME: join(ROOT, ".jwsim"), JWSIM_UPDATE_FEED: feed, APPIMAGE: fakeAppImage };
  const app = await electron.launch({ args, env });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  return { app, win };
}

{
  const { app, win } = await launch();
  const seen = await win.evaluate(
    () =>
      new Promise((done) => {
        const states = [];
        window.jwsim.onUpdateState((u) => {
          states.push(u.state);
          if (u.state === "ready" || u.state === "error") done({ states, last: u });
        });
        window.jwsim.updateCheck();
        setTimeout(() => done({ states, last: null }), 30000);
      }),
  );
  criteria.ENCUENTRA_LA_NUEVA = { pass: seen.states.includes("available"), states: seen.states };
  const btn = await win.evaluate(() => {
    const b = document.getElementById("sb-update");
    return { hidden: b.hidden, text: b.textContent, disabled: b.disabled };
  });
  criteria.LISTA_PARA_INSTALAR = { pass: seen.last?.state === "ready" && !btn.hidden && !btn.disabled && /9\.9\.0/.test(btn.text), btn, last: seen.last };
  await win.screenshot({ path: join(OUT, "lista-para-instalar.png") });
  await app.close();
}

{
  served = current;
  const { app, win } = await launch();
  const last = await win.evaluate(
    () =>
      new Promise((done) => {
        window.jwsim.onUpdateState((u) => {
          if (u.state === "none" || u.state === "error" || u.state === "available") done(u);
        });
        window.jwsim.updateStatus().then(() => window.jwsim.updateCheck());
        setTimeout(() => done(null), 30000);
      }),
  );
  // updateCheck manual con la app al día abre un aviso nativo; se cierra la app.
  const hidden = await win.evaluate(() => document.getElementById("sb-update").hidden);
  criteria.AL_DIA = { pass: last?.state === "none" && hidden, last };
  await app.close().catch(() => {});
}
server.close();

criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
let ok = true;
for (const [k, v] of Object.entries(criteria)) {
  ok &&= v.pass;
  console.log(`${v.pass ? "OK  " : "FALLA"}  ${k} ${JSON.stringify(v)}`);
}
console.log(`JWSIM_ACTUALIZAR_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
