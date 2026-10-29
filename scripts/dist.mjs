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
import { join, relative, resolve } from "node:path";

import { resolvePackageRoot } from "./fetch-package.mjs";

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

// Verifica el package fijado y le escribe la marca con su commit: la app
// instalada lo verifica con ella (en la PC del usuario git puede no estar en
// el PATH). Un package descargado antes de que existiera la marca la recibe
// aquí.
if (process.env.JWPLC_PACKAGE_DIR) throw new Error("el instalador lleva el package de .jwsim/package: quite JWPLC_PACKAGE_DIR");
const { root: pkgRoot, lock } = resolvePackageRoot();
const pkgDir = relative(ROOT, pkgRoot).replaceAll("\\", "/");
const mark = join(pkgRoot, ".jwsim-commit");
if (!existsSync(mark) || readFileSync(mark, "utf8").trim() !== lock.JWPLC_PACKAGE_COMMIT) {
  throw new Error(`no se pudo marcar el package en ${pkgDir} con ${lock.JWPLC_PACKAGE_COMMIT}`);
}
// Cadena del OpenPLC Editor (G6), si se descargó: sin ella la app compila
// sketches igual y pide node scripts/fetch-editor.mjs para proyectos OpenPLC.
const editorDir = existsSync(join(ROOT, ".jwsim", "editor")) ? ".jwsim/editor" : null;
if (!editorDir) console.error("[dist] aviso: sin .jwsim/editor; los proyectos OpenPLC no compilarán en la app instalada (node scripts/fetch-editor.mjs)");
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
  files: ["**/*", "!tests/**", "!build-res/**", "!installer/**"],
  extraResources: [
    res("cli"), res("scene"), res("sim"), res("sdk"), res("schema"), res("scripts"), res("exercises"), res("third_party"),
    res("package.lock"), res("editor.lock"), res("LICENSE"), res("LICENSES"),
    res(pkgDir),
    res(".jwsim/third_party"),
    ...(editorDir ? [res(editorDir)] : []),
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
    // Comprobación propia de procesos abiertos (ver el archivo).
    include: join(APP, "installer", "installer.nsh"),
  },
};

log(`armando JWPLC Sim ${version} (${dirOnly ? "carpeta" : "instalador y portable"})…`);
const files = await build({ projectDir: APP, targets: (win ? Platform.WINDOWS : Platform.LINUX).createTarget(), config });
for (const f of files) log(`listo: ${f}`);
if (dirOnly) log(`carpeta: ${join(OUT, win ? "win-unpacked" : "linux-unpacked")}`);
