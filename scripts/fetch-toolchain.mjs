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
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, writeFileSync, writeSync } from "node:fs";
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

// ---------------------------------------------------------------- PCH en Windows
// GCC para MinGW carga el header precompilado en la dirección donde se
// generó. cc1/cc1plus de WinLibs vienen con ASLR (DYNAMIC_BASE y
// HIGH_ENTROPY_VA, por defecto en binutils >= 2.36): la disposición de memoria
// cambia en cada proceso y a veces esa dirección ya está ocupada
// ("mingw32_gt_pch_use_address ... PCH allocation failure"). Se quitan esos
// dos bits del encabezado PE de cc1/cc1plus (no se toca el código; GCC es
// GPL y admite modificación) para que el PCH siempre encuentre su dirección.
const DYNAMIC_BASE = 0x0040;
const HIGH_ENTROPY_VA = 0x0020;

function compilerProperExes(bin) {
  const root = join(bin, "..", "libexec", "gcc");
  const out = [];
  if (!existsSync(root)) return out;
  for (const triple of readdirSync(root)) {
    for (const ver of readdirSync(join(root, triple))) {
      for (const exe of ["cc1.exe", "cc1plus.exe"]) {
        const p = join(root, triple, ver, exe);
        if (existsSync(p)) out.push(p);
      }
    }
  }
  return out;
}

// Offset de DllCharacteristics en el encabezado PE, o -1 si no es un PE.
function dllCharacteristicsOffset(fd) {
  const head = Buffer.alloc(0x40);
  readSync(fd, head, 0, head.length, 0);
  if (head.readUInt16LE(0) !== 0x5a4d) return -1; // "MZ"
  const pe = head.readUInt32LE(0x3c);
  const sig = Buffer.alloc(4);
  readSync(fd, sig, 0, 4, pe);
  if (sig.readUInt32LE(0) !== 0x00004550) return -1; // "PE\0\0"
  return pe + 4 + 20 + 70; // firma + encabezado COFF + campo del encabezado opcional
}

// Devuelve true si cc1/cc1plus quedan sin ASLR (ya estaban o se corrigieron).
// Se lee primero en solo lectura: instalada en Program Files la app no puede
// escribir el toolchain (dist.mjs lo deja corregido antes de empaquetar) y,
// si aun así hiciera falta corregirlo y no se puede, se compila sin PCH fijo.
export function ensurePchFriendlyCompiler(bin) {
  const exes = compilerProperExes(bin);
  if (!exes.length) return false;
  for (const exe of exes) {
    let fd = openSync(exe, "r");
    try {
      const off = dllCharacteristicsOffset(fd);
      if (off < 0) return false;
      const buf = Buffer.alloc(2);
      readSync(fd, buf, 0, 2, off);
      const flags = buf.readUInt16LE(0);
      const fixed = flags & ~(DYNAMIC_BASE | HIGH_ENTROPY_VA);
      if (fixed === flags) continue;
      closeSync(fd);
      fd = null;
      try {
        fd = openSync(exe, "r+");
      } catch {
        return false;
      }
      buf.writeUInt16LE(fixed, 0);
      writeSync(fd, buf, 0, 2, off);
    } finally {
      if (fd !== null) closeSync(fd);
    }
  }
  return true;
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
  if (process.platform === "win32") ensurePchFriendlyCompiler(bundledToolchainBin());
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
