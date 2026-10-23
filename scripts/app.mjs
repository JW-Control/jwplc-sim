#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prepara y abre la app de escritorio con un solo comando, sin depender de
// cómo la terminal resuelve "npm":
//
//   node scripts/app.mjs            package, toolchain (Windows), dependencias y app
//   node scripts/app.mjs --setup    solo prepara (no abre la app)
//
// En Windows, si la variable PATHEXT tiene una entrada vacía (un ";" de más,
// que dejan algunos instaladores), PowerShell toma el archivo "npm" sin
// extensión de la carpeta de Node (un script de bash) en vez de npm.cmd, y
// Windows pregunta con qué programa abrirlo. Aquí npm se corre con el mismo
// node.exe (npm-cli.js) y Electron se lanza directo, así eso no pasa.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "app");
const setupOnly = process.argv.includes("--setup");
const extra = process.argv.slice(2).filter((a) => a !== "--setup");
const log = (m) => console.log(`[app] ${m}`);

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`[app] falló: node ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

// Avisa (sin tocar nada) si PATHEXT tiene una entrada vacía.
if (process.platform === "win32") {
  if ((process.env.PATHEXT ?? "").split(";").some((p) => p.trim() === "")) {
    log("aviso: PATHEXT tiene una entrada vacía (un ';' de más). Por eso 'npm' en PowerShell abre la ventana");
    log("       de '¿con qué programa?'. Este script no lo necesita; para arreglarlo, ver README (Windows).");
  }
}

// 1. Package fijado (package.lock).
const lock = Object.fromEntries(
  readFileSync(join(ROOT, "package.lock"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => l.split("=")),
);
if (!existsSync(join(ROOT, ".jwsim", "package", lock.JWPLC_PACKAGE_REF ?? "", "JWPLC"))) {
  log("descargando el package fijado…");
  run([join(ROOT, "scripts", "fetch-package.mjs")]);
}

// 2. Toolchain incluido (Windows).
if (process.platform === "win32" && !existsSync(join(ROOT, ".jwsim", "toolchain"))) {
  log("descargando el toolchain (WinLibs GCC, ~245 MB)…");
  run([join(ROOT, "scripts", "fetch-toolchain.mjs")]);
}

// 3. Dependencias de la app con el npm que trae este mismo node.
const npmCli = [
  join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), // Windows
  join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"), // Linux, macOS
].find(existsSync);
const stamp = join(APP, "node_modules", ".package-lock.json");
const stale = !existsSync(stamp) || statSync(join(APP, "package-lock.json")).mtimeMs > statSync(stamp).mtimeMs;
if (stale || !existsSync(join(APP, "node_modules", "electron"))) {
  log("instalando las dependencias de la app (npm ci)…");
  if (npmCli) run([npmCli, "ci"], { cwd: APP });
  else {
    // Sin npm-cli.js junto a node: npm.cmd explícito en Windows.
    const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci"], { cwd: APP, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

if (setupOnly) {
  log("listo. Para abrir la app: node scripts/app.mjs");
  process.exit(0);
}

// 4. Electron directo (sin "npm start").
const electron = createRequire(join(APP, "package.json"))("electron");
const args = [APP, ...extra];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
log("abriendo JWPLC Sim…");
const child = spawn(electron, args, { stdio: "inherit", cwd: APP });
child.on("exit", (code) => process.exit(code ?? 0));
