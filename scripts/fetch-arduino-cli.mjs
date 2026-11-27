#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// arduino-cli y ctags para «Subir al JWPLC» (cli/lib/esp32.mjs), en
// .jwsim/arduino-cli/. Versiones y SHA-256 fijados en
// third_party/arduino-cli.json. scripts/dist.mjs los lleva en el instalador.
//
//   node scripts/fetch-arduino-cli.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
export const ARDUINO_CLI_DIR = join(ROOT, ".jwsim", "arduino-cli");
const exe = process.platform === "win32" ? ".exe" : "";

export function bundledArduinoCli() {
  const p = join(ARDUINO_CLI_DIR, `arduino-cli${exe}`);
  return existsSync(p) ? p : null;
}
export function bundledCtagsDir() {
  const d = join(ARDUINO_CLI_DIR, "ctags");
  return existsSync(join(d, `ctags${exe}`)) ? d : null;
}

async function download(spec, dest) {
  console.error(`[fetch-arduino-cli] descargando ${spec.url}`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${spec.url}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(data).digest("hex");
  if (got !== spec.sha256) throw new Error(`SHA-256 ${got} no coincide con el fijado ${spec.sha256} (${spec.url})`);
  mkdirSync(dest, { recursive: true });
  const file = join(dest, basename(spec.url));
  writeFileSync(file, data);
  // tar (bsdtar en Windows 10+) extrae .zip, .tar.gz y .tar.bz2.
  execFileSync("tar", ["-xf", file, "-C", dest], { stdio: "inherit" });
  rmSync(file);
}

async function main() {
  const all = JSON.parse(readFileSync(join(ROOT, "third_party", "arduino-cli.json"), "utf8"));
  const spec = all[process.platform === "win32" ? "windows" : process.platform];
  if (!spec) throw new Error(`no hay arduino-cli fijado para ${process.platform}`);
  if (!bundledArduinoCli()) await download(spec.arduinoCli, ARDUINO_CLI_DIR);
  if (!bundledCtagsDir()) await download(spec.ctags, join(ARDUINO_CLI_DIR, "ctags"));
  if (!bundledArduinoCli() || !bundledCtagsDir()) throw new Error("no se encontró arduino-cli o ctags tras extraer");
  console.error(`[fetch-arduino-cli] listo: ${bundledArduinoCli()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[fetch-arduino-cli] ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
