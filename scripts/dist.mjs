#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera el instalador y el portable de JWPLC Sim para Windows:
//
//   node scripts/dist.mjs          instalador (NSIS) y portable (.zip) en build/dist/
//   node scripts/dist.mjs --dir    solo la carpeta sin empaquetar (prueba rápida;
//                                  en Linux arma la versión de Linux)
//
// La app usa en tiempo de ejecución el resto del repositorio (cli/, scene/,
// sim/, sdk/, schema/, scripts/, exercises/), el package JWPLC fijado en
// package.lock, las dependencias de terceros y el toolchain GCC: GCC lee esos
// archivos, así que van sin empaquetar (asar: false) en resources/, con la
// misma disposición que en el repositorio (resources/app es app/). Todo queda
// incluido: la app compila sin red.
//
// El instalador es por usuario (en %LOCALAPPDATA%\Programs, sin pedir
// administrador): la app escribe su caché de compilación junto a sus
// archivos. El portable es la misma carpeta en un .zip; al no tener el
// desinstalador al lado, la app guarda sus datos en "datos\" dentro de la
// carpeta (app/main.mjs).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "app");
const OUT = join(ROOT, "build", "dist");
const dirOnly = process.argv.includes("--dir");
const win = process.platform === "win32";
const log = (m) => console.log(`[dist] ${m}`);

function node(args) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    console.error(`[dist] falló: node ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

if (!win && !dirOnly) {
  console.error("[dist] el instalador y el portable de Windows se generan en Windows (o con el workflow dist-windows).");
  console.error("[dist] En este sistema: node scripts/dist.mjs --dir");
  process.exit(2);
}

// 1. Lo que la app necesita en tiempo de ejecución: package, terceros,
//    toolchain (Windows) y las dependencias de la app (npm ci).
node([join("scripts", "app.mjs"), "--setup"]);
log("dependencias de terceros…");
node([join("scripts", "fetch-third-party.mjs")]);

const lock = Object.fromEntries(
  readFileSync(join(ROOT, "package.lock"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => l.split("=")),
);
const pkgDir = `.jwsim/package/${lock.JWPLC_PACKAGE_REF.replaceAll("/", "_")}`;
if (!existsSync(join(ROOT, pkgDir))) throw new Error(`falta el package fijado en ${pkgDir}`);
if (win && !existsSync(join(ROOT, ".jwsim", "toolchain"))) throw new Error("falta el toolchain (node scripts/fetch-toolchain.mjs)");

// 2. electron-builder (dependencia de desarrollo de app/).
const { build, Platform } = createRequire(join(APP, "package.json"))("electron-builder");
const version = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).version;
const electronVersion = JSON.parse(readFileSync(join(APP, "node_modules", "electron", "package.json"), "utf8")).version;
const ICON = join(APP, "icon");
const res = (from, to = from) => ({ from: join(ROOT, from), to, filter: ["**/*", "!**/node_modules/**", "!**/*.estado/**"] });

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "pe.jwcontrol.jwplcsim",
  electronVersion,
  productName: "JWPLC Sim",
  copyright: "© 2026 JW Control",
  directories: { output: OUT },
  publish: null,
  asar: false,
  npmRebuild: false,
  // La app sin sus pruebas ni las dependencias de desarrollo.
  files: ["**/*", "!tests/**", "!build-res/**"],
  extraResources: [
    res("cli"), res("scene"), res("sim"), res("sdk"), res("schema"), res("scripts"), res("exercises"), res("third_party"),
    res("package.lock"), res("LICENSE"), res("LICENSES"),
    res(pkgDir),
    res(".jwsim/third_party"),
    ...(win ? [res(".jwsim/toolchain")] : []),
  ],
  win: {
    icon: join(ICON, "icon.ico"),
    // El .zip (portable) toma este nombre; el instalador, el de nsis.
    artifactName: "JWPLC-Sim-${version}-portable.${ext}",
    target: dirOnly ? [{ target: "dir", arch: ["x64"] }] : [{ target: "nsis", arch: ["x64"] }, { target: "zip", arch: ["x64"] }],
  },
  linux: { target: [{ target: "dir" }], category: "Development", icon: join(ICON, "icon.png") },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "JWPLC Sim",
    installerIcon: join(ICON, "icon.ico"),
    uninstallerIcon: join(ICON, "icon.ico"),
    installerHeaderIcon: join(ICON, "icon.ico"),
    artifactName: "JWPLC-Sim-${version}-instalador.${ext}",
  },
};

log(`armando JWPLC Sim ${version} (${dirOnly ? "carpeta" : "instalador y portable"})…`);
const files = await build({ projectDir: APP, targets: (win ? Platform.WINDOWS : Platform.LINUX).createTarget(), config });
for (const f of files) log(`listo: ${f}`);
if (dirOnly) log(`carpeta: ${join(OUT, win ? "win-unpacked" : "linux-unpacked")}`);
