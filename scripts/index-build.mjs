#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Arma el índice comunitario (G7): empaqueta cada paquete de
// index/sources.json en index/packages/<tipo>-<versión>.tar.gz y escribe
// index/jwsim_index.json con URL relativa, SHA-256 y tamaño. Las versiones ya
// publicadas (otro archivo en index/packages) se conservan en el índice.
// Después hay que firmarlo: node scripts/index-sign.mjs --key <privada.pem>.
//
// Uso: node scripts/index-build.mjs [--dir index]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { packDevice } from "../cli/lib/device.mjs";
import { INDEX_FORMAT } from "../cli/lib/index.mjs";
import { compareVersions } from "../scene/devices/index.mjs";

const argv = process.argv.slice(2);
const dir = resolve(argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : join(ROOT, "index"));
const src = JSON.parse(readFileSync(join(dir, "sources.json"), "utf8"));
const indexFile = join(dir, "jwsim_index.json");
const old = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : { packages: [] };
mkdirSync(join(dir, "packages"), { recursive: true });

const byType = new Map(old.packages.map((p) => [p.type, p]));
for (const rel of src.packages) {
  const p = packDevice(resolve(dir, rel));
  const m = p.manifest;
  const file = join(dir, "packages", p.fileName);
  const prev = byType.get(m.type)?.versions.find((v) => v.version === m.version);
  if (prev && prev.checksum !== p.checksum) {
    // Una versión publicada no cambia: hay que subir la versión del manifiesto.
    console.error(`[index] ${m.type}@${m.version} ya está publicado con otro contenido: suba la versión en jwsim-device.json`);
    process.exit(1);
  }
  writeFileSync(file, p.archive);
  const versions = (byType.get(m.type)?.versions ?? []).filter((v) => v.version !== m.version);
  versions.push({ version: m.version, url: `packages/${p.fileName}`, checksum: p.checksum, size: p.size, sdk: m.sdk ?? 1 });
  versions.sort((a, b) => compareVersions(b.version, a.version));
  const entry = { type: m.type, kind: m.kind, name: m.name, description: m.description ?? "", author: m.author ?? "", license: m.license, versions };
  byType.set(m.type, entry);
  console.log(`[index] ${m.type}@${m.version} (${m.kind}) → packages/${p.fileName} ${p.size} B ${p.checksum}`);
}
const index = {
  jwsim_index: INDEX_FORMAT,
  name: src.name,
  packages: [...byType.values()].sort((a, b) => (a.type < b.type ? -1 : 1)),
};
writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");
console.log(`[index] ${indexFile}: ${index.packages.length} paquetes (falta firmarlo: scripts/index-sign.mjs)`);
