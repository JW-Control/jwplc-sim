// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// La app armada (node scripts/dist.mjs --dir) trae la caché de compilación
// del package (resources/cache-seed): al abrirla con datos vacíos, el
// precalentado solo arma el header precompilado y la primera compilación de
// una lección usa los objetos del instalador.
//
//   node scripts/dist.mjs --dir
//   cd app && xvfb-run -a node tests/e2e-cache-instalador.mjs
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const UNPACKED = join(ROOT, "build", "dist", process.platform === "win32" ? "win-unpacked" : "linux-unpacked");
const exe = join(UNPACKED, process.platform === "win32" ? "JWPLC Sim.exe" : "jwplc-sim");
if (!existsSync(join(UNPACKED, "resources", "cache-seed", "seed.json"))) {
  console.error(`falta la app armada con caché en ${UNPACKED} (node scripts/dist.mjs --dir)`);
  process.exit(2);
}
const userData = mkdtempSync(join(tmpdir(), "jwsim-seed-"));
const args = [`--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ executablePath: exe, args, env: { ...process.env, JWSIM_START_SCREEN: "0" } });
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed++;
};
try {
  const page = await app.firstWindow();
  const t0 = Date.now();
  await page.waitForFunction(() => /Compilador listo/.test(document.getElementById("sb-build")?.textContent ?? ""), null, { timeout: 120000 });
  const warm = Date.now() - t0;
  check("PRECALENTADO_CORTO", warm < 30000, `${(warm / 1000).toFixed(1)} s`);
  const sketch = join(UNPACKED, "resources", "JWPLC_Aprende", "extras", "retos", "01-marcha-parada", "solucion", "marcha_parada");
  const logs = [];
  await page.exposeFunction("__log", (l) => logs.push(l));
  await page.evaluate(() => window.jwsim.onBuildLog((l) => window.__log(l)));
  const r = await page.evaluate((dir) => window.jwsim.build(dir), sketch);
  check("COMPILA", r.ok, r.message ?? "");
  check("PRIMERA_COMPILACION_RAPIDA", r.ms < 15000, `${(r.ms / 1000).toFixed(1)} s`);
  const hit = logs.find((l) => /objetos de la caché del instalador/.test(l));
  check("USA_LA_CACHE_DEL_INSTALADOR", !!hit, hit ?? "sin aviso en el registro");
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}
console.log(failed ? `${failed} fallas` : "todo OK");
process.exit(failed ? 1 : 0);
