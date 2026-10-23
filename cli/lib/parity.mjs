// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Paridad del simulador con un árbol del package (jwsim-cli parity, G5
// RELEASE_TREE_PARITY). Para un tag nuevo de platform-jwplc informa, como
// lista de diferencias:
//   - fuentes de cores/jwcontrol sin clasificar en sim/core-manifest.json (y
//     clasificadas que ya no existen);
//   - headers que no se encuentran (ESP-IDF u otros) al preprocesar el core y
//     las librerías del package con los flags reales;
//   - cambios en las librerías que arrastra el autoload (sketch vacío) y en la
//     lista de librerías del package, contra lo registrado en
//     sim/package-parity.json.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { buildSketch, ROOT } from "./build.mjs";

const REGISTRY = join(ROOT, "sim", "package-parity.json");
const SRC_EXT = /\.(c|cpp|cc|S)$/;

function coreSources(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!["examples", "extras", "test", "tests"].includes(e.name)) out.push(...coreSources(p, base));
    } else if (SRC_EXT.test(e.name)) out.push(relative(base, p).split(sep).join("/"));
  }
  return out.sort();
}

export function readRegistry() {
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}

const diff = (want, got) => ({ added: got.filter((x) => !want.includes(x)), removed: want.filter((x) => !got.includes(x)) });

export async function checkParity(pkg, { target = "native", log = () => {}, update = false } = {}) {
  const tree = join(pkg.root, pkg.lock.JWPLC_PACKAGE_TREE);
  const manifest = JSON.parse(readFileSync(join(ROOT, "sim", "core-manifest.json"), "utf8"));
  const registry = readRegistry();
  const differences = [];

  // 1) Fuentes del core.
  const files = coreSources(join(tree, "cores", "jwcontrol"));
  const classified = [...manifest.compile, ...Object.keys(manifest.replaced), ...Object.keys(manifest.excluded)];
  const unclassified = files.filter((f) => !classified.includes(f));
  const vanished = classified.filter((f) => !files.includes(f));
  unclassified.forEach((f) => differences.push(`core: fuente sin clasificar en sim/core-manifest.json: ${f}`));
  vanished.forEach((f) => differences.push(`core: clasificada en sim/core-manifest.json pero ya no existe: ${f}`));

  // 2) Autoload: librerías que arrastra un sketch vacío.
  const work = join(ROOT, "build", "parity", pkg.lock.JWPLC_PACKAGE_REF.replace(/[^\w.-]/g, "_"));
  const empty = join(work, "jwsim_parity_empty");
  mkdirSync(empty, { recursive: true });
  writeFileSync(join(empty, "jwsim_parity_empty.ino"), "void setup() {}\nvoid loop() {}\n");
  log(`[parity] ${pkg.lock.JWPLC_PACKAGE_REF}: autoload y sondeo de headers`);
  const probe = await buildSketch(empty, { target, outDir: join(work, "build"), package: pkg, headerProbe: true, log: () => {} });
  const autoload = JSON.parse(readFileSync(join(work, "build", "discovery.json"), "utf8")).libraries;
  const auto = diff(registry.autoload, autoload);
  auto.added.forEach((l) => differences.push(`autoload: librería nueva respecto del registro: ${l}`));
  auto.removed.forEach((l) => differences.push(`autoload: librería que ya no arrastra: ${l}`));
  const libs = diff(registry.libraries, probe.libraries);
  libs.added.forEach((l) => differences.push(`librerías: nueva en el package: ${l}`));
  libs.removed.forEach((l) => differences.push(`librerías: ya no está en el package: ${l}`));

  // 3) Headers faltantes.
  const known = registry.knownMissingHeaders ?? {};
  const missing = new Map();
  const errors = [];
  for (const r of probe.probe) {
    if (r.error) errors.push(`${relative(pkg.root, r.file)}: ${r.error}`);
    for (const h of r.missing ?? []) {
      const key = h.split("\\").join("/");
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(r.owner);
    }
  }
  const missingList = [...missing.keys()].sort();
  for (const h of missingList) {
    if (!known[h]) differences.push(`header faltante: <${h}> (desde ${[...missing.get(h)].sort().join(", ")})`);
  }
  errors.forEach((e) => differences.push(`preprocesado: ${e}`));

  if (update) {
    const next = { ...registry, autoload: [...autoload].sort(), libraries: [...probe.libraries].sort() };
    writeFileSync(REGISTRY, JSON.stringify(next, null, 2) + "\n");
    log(`[parity] registro actualizado: ${relative(ROOT, REGISTRY)}`);
  }
  return {
    ok: differences.length === 0,
    differences,
    core: { sources: files.length, unclassified, vanished },
    autoload: { libraries: autoload, ...auto },
    libraries: { count: probe.libraries.length, ...libs },
    headers: {
      probed: probe.probe.length,
      missing: missingList.map((h) => ({ header: h, from: [...missing.get(h)].sort(), known: known[h] ?? null })),
    },
  };
}
