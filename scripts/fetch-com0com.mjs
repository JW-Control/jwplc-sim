#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Descarga com0com (third_party/com0com.json) a .jwsim/com0com/, verifica su
// SHA-256 y deja junto al instalador de com0com el script que el instalador
// de JWPLC Sim ejecuta como administrador: instala el driver en silencio y
// crea el par COM20 (JWPLC Sim) ↔ COM21 (JW Serial u otro programa).
//
// Uso: node scripts/fetch-com0com.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(join(ROOT, "third_party", "com0com.json"), "utf8"));
const DEST = join(ROOT, ".jwsim", "com0com");

// Se ejecuta elevado desde el instalador (32 bits): %ProgramW6432% es la
// carpeta de programas de 64 bits también desde un cmd de 32 bits.
const installCmd = (sim, user) => `@echo off
rem Puerto COM virtual de JWPLC Sim: com0com ${spec.version} y el par ${sim} <-> ${user}.
setlocal
set "SRC=%~dp0"
set "DST=%ProgramW6432%\\com0com"
if "%ProgramW6432%"=="" set "DST=%ProgramFiles%\\com0com"
if not exist "%DST%\\setupc.exe" "%SRC%setup.exe" /S /D=%DST%
if not exist "%DST%\\setupc.exe" exit /b 1
cd /d "%DST%"
setupc.exe list | find /i "PortName=${sim}" >nul && exit /b 0
setupc.exe --silent install PortName=${sim} PortName=${user}
exit /b %errorlevel%
`;

export function bundledCom0com() {
  return existsSync(join(DEST, "setup.exe")) && existsSync(join(DEST, "instalar-puerto-com.cmd")) ? DEST : null;
}

async function main() {
  if (bundledCom0com()) {
    console.error(`[fetch-com0com] ya está en ${DEST}`);
    return;
  }
  console.error(`[fetch-com0com] descargando ${spec.url}`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${spec.url}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(data).digest("hex");
  if (got !== spec.sha256) throw new Error(`SHA-256 ${got} no coincide con el fijado ${spec.sha256}`);
  const tmp = join(ROOT, ".jwsim", "com0com.tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, "com0com.zip");
  writeFileSync(zip, data);
  // tar (bsdtar) viene con Windows 10+ y extrae .zip; en Linux, unzip.
  if (process.platform === "win32") execFileSync("tar", ["-xf", zip, "-C", tmp], { stdio: "inherit" });
  else execFileSync("unzip", ["-q", zip, "-d", tmp], { stdio: "inherit" });
  const inner = readdirSync(tmp).map((d) => join(tmp, d)).find((d) => existsSync(join(d, "setup.exe")));
  if (!inner) throw new Error("el zip de com0com no trae setup.exe");
  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });
  for (const f of ["setup.exe", "ReadMe.txt", "ReadMe1st.txt"]) cpSync(join(inner, f), join(DEST, f));
  writeFileSync(join(DEST, "instalar-puerto-com.cmd"), installCmd(spec.simPort, spec.userPort).replaceAll("\n", "\r\n"));
  rmSync(tmp, { recursive: true, force: true });
  console.error(`[fetch-com0com] listo: ${DEST}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[fetch-com0com] ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
