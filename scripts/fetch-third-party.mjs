#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Descarga dependencias de terceros fijadas en third_party/sources.json a
// .jwsim/third_party/<nombre>-<versión>/, verificando el SHA-256 de cada archivo.
// "patches" reproduce en un archivo el cambio con el que el package compila su
// binario (p. ej. TFT_eSPI dentro de libJWPLC_TFT.a): expresión, reemplazo,
// cantidad exacta de coincidencias y SHA-256 del resultado.
// No se versionan en este repositorio (igual que el package JWPLC).
//
// Uso:
//   node scripts/fetch-third-party.mjs              # descarga y verifica
//   node scripts/fetch-third-party.mjs --print <n>  # imprime la ruta local de <n>
//   node scripts/fetch-third-party.mjs --lock       # recalcula hashes (solo al subir versión)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = join(ROOT, "third_party", "sources.json");

export function readSources() {
  return JSON.parse(readFileSync(SOURCES, "utf8"));
}

export function thirdPartyDir(entry) {
  return join(ROOT, ".jwsim", "third_party", `${entry.name}-${entry.version}`);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function applyPatch(name, rel, data, patch) {
  const re = new RegExp(patch.find, patch.flags ?? "g");
  const text = data.toString("utf8");
  const n = text.match(re)?.length ?? 0;
  if (n !== patch.count) throw new Error(`${name}/${rel}: el parche espera ${patch.count} coincidencias y hay ${n}`);
  const out = Buffer.from(text.replace(re, patch.replace), "utf8");
  const got = sha256(out);
  if (got !== patch.sha256) throw new Error(`${name}/${rel}: SHA-256 parcheado ${got} no coincide con el fijado ${patch.sha256}`);
  return out;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchAll({ relock = false } = {}) {
  const sources = readSources();
  let changed = false;
  for (const entry of sources.packages) {
    const dir = thirdPartyDir(entry);
    let downloaded = false;
    for (const [rel, expected] of Object.entries(entry.files)) {
      const dest = join(dir, entry.layout?.[rel] ?? rel);
      const patch = entry.patches?.[rel];
      const want = patch ? patch.sha256 : expected;
      if (!relock && expected && existsSync(dest) && sha256(readFileSync(dest)) === want) continue;
      let data = await download(`${entry.baseUrl}/${rel}`);
      const got = sha256(data);
      if (relock) {
        if (entry.files[rel] !== got) {
          entry.files[rel] = got;
          changed = true;
        }
      } else if (got !== expected) {
        throw new Error(`${entry.name}/${rel}: SHA-256 ${got} no coincide con el fijado ${expected}`);
      }
      if (patch && !relock) data = applyPatch(entry.name, rel, data, patch);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, data);
      downloaded = true;
    }
    if (downloaded) console.error(`[fetch-third-party] ${entry.name} ${entry.version} listo`);
  }
  if (changed) writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--print") {
      const entry = readSources().packages.find((p) => p.name === args[1]);
      if (!entry) throw new Error(`dependencia desconocida: ${args[1]}`);
      console.log(thirdPartyDir(entry));
    } else {
      await fetchAll({ relock: args.includes("--lock") });
    }
  } catch (err) {
    console.error(`[fetch-third-party] ERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
