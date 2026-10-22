#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Descarga el toolchain GCC fijado en third_party/toolchain.json a
// .jwsim/toolchain/<nombre>-<versión>/ y verifica su SHA-256. Con el
// toolchain ahí, jwsim-cli y la app compilan sin red y sin GCC en el PATH
// (cli/lib/toolchain.mjs lo detecta).
//
// Uso:
//   node scripts/fetch-toolchain.mjs          # descarga y verifica
//   node scripts/fetch-toolchain.mjs --lock   # fija el SHA-256 (solo al subir versión)
//   node scripts/fetch-toolchain.mjs --print  # imprime la carpeta bin/ si está instalado
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "third_party", "toolchain.json");

export function toolchainSpec(os = process.platform === "win32" ? "windows" : process.platform) {
  return JSON.parse(readFileSync(SPEC, "utf8"))[os] ?? null;
}

// Carpeta bin/ del toolchain incluido, o null si no está instalado.
export function bundledToolchainBin(os) {
  const spec = toolchainSpec(os);
  if (!spec) return null;
  const bin = join(ROOT, ".jwsim", "toolchain", `${spec.name}-${spec.version}`, spec.bin);
  return existsSync(join(bin, process.platform === "win32" ? "g++.exe" : "g++")) ? bin : null;
}

async function main() {
  const lock = process.argv.includes("--lock");
  const spec = toolchainSpec();
  if (process.argv.includes("--print")) {
    console.log(bundledToolchainBin() ?? "");
    return;
  }
  if (!spec) throw new Error(`no hay toolchain fijado para ${process.platform} en third_party/toolchain.json`);
  if (!lock && !spec.sha256) throw new Error("toolchain sin SHA-256 fijado: ejecute una vez con --lock y versione third_party/toolchain.json");
  const dest = join(ROOT, ".jwsim", "toolchain", `${spec.name}-${spec.version}`);
  if (!lock && bundledToolchainBin()) {
    console.error(`[fetch-toolchain] ${spec.name} ${spec.version} ya instalado en ${dest}`);
    return;
  }
  console.error(`[fetch-toolchain] descargando ${spec.url}`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${spec.url}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(data).digest("hex");
  if (lock) {
    const all = JSON.parse(readFileSync(SPEC, "utf8"));
    all[process.platform === "win32" ? "windows" : process.platform].sha256 = got;
    writeFileSync(SPEC, JSON.stringify(all, null, 2) + "\n");
    console.error(`[fetch-toolchain] SHA-256 fijado: ${got}`);
  } else if (got !== spec.sha256) {
    throw new Error(`SHA-256 ${got} no coincide con el fijado ${spec.sha256}`);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const zip = join(dest, "toolchain.zip");
  writeFileSync(zip, data);
  // tar (bsdtar) viene con Windows 10+ y extrae .zip.
  execFileSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
  rmSync(zip);
  if (!bundledToolchainBin()) throw new Error(`no se encontró ${spec.bin}/g++ tras extraer ${spec.url}`);
  console.error(`[fetch-toolchain] listo: ${bundledToolchainBin()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // exitCode en vez de process.exit(): en Windows, Node 24 aborta con
  // "Assertion failed ... UV_HANDLE_CLOSING" si se sale con fetch abierto.
  main().catch((err) => {
    console.error(`[fetch-toolchain] ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
