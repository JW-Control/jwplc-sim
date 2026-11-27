#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Caché de compilación que viaja en el instalador (scripts/dist.mjs).
//
//   node scripts/cache-seed.mjs [--out build/cache-seed] [--target native]
//
// Compila el sketch mínimo scripts/cache-seed/semilla con una caché vacía y
// copia los objetos del package, sus librerías y el motor del simulador (con
// su .cmd y su .deps, sin el header precompilado) a <out>/<destino>. La app
// instalada la lee desde resources/cache-seed (JWSIM_CACHE_SEED) y solo compila
// el sketch: la primera compilación deja de tardar minutos.
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolvePackageRoot } from "./fetch-package.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const out = resolve(arg("--out", join(ROOT, "build", "cache-seed")));
const target = arg("--target", "native");
const work = join(ROOT, "build", "cache-seed-work");

rmSync(work, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
process.env.JWSIM_CACHE_DIR = join(work, "cache");
delete process.env.JWSIM_CACHE_SEED;
const { buildSketch } = await import("../cli/lib/build.mjs");
const t0 = Date.now();
await buildSketch(join(ROOT, "scripts", "cache-seed", "semilla"), { target, outDir: join(work, "semilla"), seedDiscovery: true, log: () => {} });
const src = join(work, "cache", target);
const dst = join(out, target);
mkdirSync(dst, { recursive: true });
let bytes = 0;
let count = 0;
for (const f of readdirSync(src)) {
  if (!/\.o(\.cmd|\.deps)?$/.test(f) && f !== "discovery-base.json") continue;
  copyFileSync(join(src, f), join(dst, f));
  bytes += statSync(join(dst, f)).size;
  if (f.endsWith(".o")) count++;
}
const { lock } = resolvePackageRoot();
writeFileSync(join(out, "seed.json"), JSON.stringify({ commit: lock.JWPLC_PACKAGE_COMMIT, target, objects: count, platform: process.platform }, null, 2) + "\n");
rmSync(work, { recursive: true, force: true });
console.log(`[cache-seed] ${count} objetos, ${(bytes / 1e6).toFixed(1)} MB en ${out} (${Math.round((Date.now() - t0) / 1000)} s)`);
