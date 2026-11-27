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
// sim/, sdk/, schema/, scripts/, JWPLC_Aprende/), el package JWPLC fijado en
// package.lock, las dependencias de terceros y el toolchain GCC: GCC lee esos
// archivos, así que van sin empaquetar (asar: false) en resources/, con la
// misma disposición que en el repositorio (resources/app es app/). Todo queda
// incluido: la app compila sin red.
//
// El instalador es por usuario (en %LOCALAPPDATA%\Programs, sin pedir
// administrador). Trae ya compilados el package y el motor del simulador
// (resources/cache-seed, scripts/cache-seed.mjs); la caché que la app escribe
// va a sus datos. El portable es la misma carpeta en un .zip; al no tener el
// desinstalador al lado, la app guarda sus datos en "datos\" dentro de la
// carpeta (app/main.mjs).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

import { editorDir as editorDirOf } from "./fetch-editor.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { bundledToolchainBin, ensurePchFriendlyCompiler } from "./fetch-toolchain.mjs";

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
const { root: pkgRoot, lock } = resolvePackageRoot({ fijado: true });
const pkgDir = relative(ROOT, pkgRoot).replaceAll("\\", "/");
const mark = join(pkgRoot, ".jwsim-commit");
if (!existsSync(mark) || readFileSync(mark, "utf8").trim() !== lock.JWPLC_PACKAGE_COMMIT) {
  throw new Error(`no se pudo marcar el package en ${pkgDir} con ${lock.JWPLC_PACKAGE_COMMIT}`);
}
// Cadena del OpenPLC Editor (G6), si se descargó: sin ella la app compila
// sketches igual y pide node scripts/fetch-editor.mjs para proyectos OpenPLC.
// Solo la versión de editor.lock: una cadena vieja en la caché no se empaqueta.
const editorRel = relative(ROOT, editorDirOf()).split("\\").join("/");
const editorDir = existsSync(join(ROOT, editorRel, "ready.json")) ? editorRel : null;
if (!editorDir) console.error(`[dist] aviso: sin ${editorRel}; los proyectos OpenPLC no compilarán en la app instalada (node scripts/fetch-editor.mjs)`);
if (win && !existsSync(join(ROOT, ".jwsim", "toolchain"))) throw new Error("falta el toolchain (node scripts/fetch-toolchain.mjs)");
// arduino-cli y ctags para «Subir al JWPLC» (scripts/fetch-arduino-cli.mjs).
node([join("scripts", "fetch-arduino-cli.mjs")]);
// Puerto COM virtual (com0com): componente opcional del instalador de Windows.
if (win) node([join("scripts", "fetch-com0com.mjs")]);
// cc1/cc1plus sin ASLR ya en el instalador: instalada en Program Files la app
// no puede corregirlos al compilar.
if (win && !ensurePchFriendlyCompiler(bundledToolchainBin())) throw new Error("no se pudo preparar cc1/cc1plus del toolchain para el PCH");

// Caché de compilación del package y del motor (scripts/cache-seed.mjs), con
// el mismo toolchain que lleva el instalador: la app instalada solo compila el
// sketch en su primera compilación. JWSIM_DIST_SIN_CACHE=1 la omite.
const seedDir = join(ROOT, "build", "cache-seed");
if (process.env.JWSIM_DIST_SIN_CACHE !== "1") {
  log("caché de compilación para el instalador…");
  node([join("scripts", "cache-seed.mjs"), "--out", seedDir]);
}
const withSeed = existsSync(join(seedDir, "seed.json")) && process.env.JWSIM_DIST_SIN_CACHE !== "1";

// 2. electron-builder (dependencia de desarrollo de app/).
const { build, Platform } = createRequire(join(APP, "package.json"))("electron-builder");
const version = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).version;
const electronVersion = JSON.parse(readFileSync(join(APP, "node_modules", "electron", "package.json"), "utf8")).version;
const ICON = join(APP, "icon");
const res = (from, to = from) => ({ from: join(ROOT, from), to, filter: ["**/*", "!**/node_modules/**", "!**/*.estado/**"] });

// El instalador de electron-builder descomprime en %TEMP%\nsXXXX.tmp\7z-out\
// y copia a %LOCALAPPDATA%\Programs\jwplc-sim\ con CopyFiles, que no admite
// rutas de más de 259 caracteres: con una sola, la copia falla y el instalador
// muestra «No se puede cerrar JWPLC Sim» (Reintentar/Cancelar) aunque no haya
// nada abierto. Con un usuario de Windows de hasta ~20 letras, esas carpetas
// ocupan ~65 caracteres: las rutas dentro de la app no pueden pasar de 190.
const MAX_REL_PATH = 190;
function longPaths(appOutDir) {
  const long = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}\\${e.name}` : e.name;
      if (r.length > MAX_REL_PATH) long.push(r);
      if (e.isDirectory()) walk(join(dir, e.name), r);
    }
  };
  walk(appOutDir, "");
  if (!long.length) return;
  long.sort((a, b) => b.length - a.length);
  const list = long.slice(0, 10).map((r) => `  ${r.length}  ${r}`).join("\n");
  const msg = `${long.length} rutas de más de ${MAX_REL_PATH} caracteres en la app armada; el instalador no podría copiarlas:\n${list}`;
  if (process.env.JWSIM_DIST_RUTAS_LARGAS === "1") console.warn(`[dist] AVISO: ${msg}`);
  else throw new Error(`${msg}\n(JWSIM_DIST_RUTAS_LARGAS=1 arma igual)`);
}

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "pe.jwcontrol.jwplcsim",
  electronVersion,
  productName: "JWPLC Sim",
  copyright: "© 2026 JW Control",
  directories: { output: OUT },
  // Releases de GitHub: con esto electron-builder escribe latest.yml (y el
  // .blockmap) junto al instalador y app-update.yml dentro de la app, que
  // electron-updater lee (app/lib/updater.mjs). No publica nada: lo sube el
  // workflow dist-windows al crear la Release del tag.
  publish: [{ provider: "github", owner: "JW-Control", repo: "jwplc-sim" }],
  asar: false,
  npmRebuild: false,
  // La app sin sus pruebas ni las dependencias de desarrollo.
  files: ["**/*", "!tests/**", "!build-res/**", "!installer/**"],
  extraResources: [
    res("cli"), res("scene"), res("sim"), res("sdk"), res("schema"), res("scripts"), res("JWPLC_Aprende"), res("third_party"),
    res("package.lock"), res("editor.lock"), res("LICENSE"), res("LICENSES"),
    res(pkgDir),
    res(".jwsim/third_party"),
    // Del editor solo hace falta lo que usa la cadena (fetch-editor.mjs
    // editorPaths): pipeline.cjs, ladder-ops.cjs, resources/sources, el VPP y STruC++. Las
    // fuentes (editor/src, ya empaquetadas en pipeline.cjs) traen las rutas
    // más largas del instalador (ver longPaths).
    ...(editorDir ? [{ ...res(editorDir), filter: [...res(editorDir).filter, "!editor/src/**", "!editor/.github/**"] }] : []),
    // pipeline.cjs carga STruC++ de deps/node_modules, que `res` deja fuera.
    // esbuild solo hace falta para armar la cadena, no para compilar.
    ...(editorDir
      ? [{ from: join(ROOT, editorDir, "deps", "node_modules"), to: `${editorDir}/deps/node_modules`, filter: ["**/*", "!esbuild/**", "!@esbuild/**"] }]
      : []),
    // pb_ds (estructuras de datos de extensión de libstdc++) no lo usa ningún
    // sketch y trae las rutas más largas del toolchain (hasta 204 caracteres).
    ...(win ? [{ ...res(".jwsim/toolchain"), filter: [...res(".jwsim/toolchain").filter, "!**/include/c++/ext/pb_ds/**"] }, res(".jwsim/com0com")] : []),
    res(".jwsim/arduino-cli"),
    ...(withSeed ? [{ from: seedDir, to: "cache-seed", filter: ["**/*"] }] : []),
    // electron-builder deja fuera las carpetas «examples» de node_modules, y
    // ahí están los complementos de three.js que usa la vista 3D (OrbitControls,
    // importado como three/addons/ en renderer/index.html). Sin esto la vista
    // 3D del instalador queda vacía (0.3.0).
    { from: join(APP, "node_modules", "three", "examples", "jsm", "controls"), to: "app/node_modules/three/examples/jsm/controls", filter: ["**/*"] },
  ],
  // Lo que el renderer importa desde node_modules tiene que estar en la app
  // armada, antes de empaquetar el instalador y el portable.
  afterPack: async ({ appOutDir }) => {
    const need = ["three/build/three.module.js", "three/examples/jsm/controls/OrbitControls.js", "monaco-editor/min/vs/loader.js", "electron-updater/package.json"];
    const missing = need.filter((f) => !existsSync(join(appOutDir, "resources", "app", "node_modules", ...f.split("/"))));
    if (editorDir) {
      const strucpp = join(appOutDir, "resources", ...editorDir.split("/"), "deps", "node_modules", "strucpp");
      for (const f of ["package.json", "libs", "src/runtime/include"]) {
        if (!existsSync(join(strucpp, ...f.split("/")))) missing.push(`strucpp/${f}`);
      }
    }
    if (missing.length) throw new Error(`faltan en la app armada: ${missing.join(", ")}`);
    longPaths(appOutDir);
  },
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
const files = await build({ projectDir: APP, targets: (win ? Platform.WINDOWS : Platform.LINUX).createTarget(), config, publish: "never" });
for (const f of files) log(`listo: ${f}`);
if (dirOnly) log(`carpeta: ${join(OUT, win ? "win-unpacked" : "linux-unpacked")}`);
