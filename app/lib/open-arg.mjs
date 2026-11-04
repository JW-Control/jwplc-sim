// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Abrir un proyecto desde el OpenPLC Editor (G6 SIMULATE_BUTTON): el botón
// «Simular» lanza la app con --jwsim-open=<carpeta del proyecto o project.json>.
import { basename, dirname, resolve } from "node:path";

import { isOpenPlcProject } from "../../cli/lib/openplc.mjs";

const SWITCH = "--jwsim-open=";

/** Ruta pedida en la línea de comandos, o null si no se pidió ninguna. */
export function openArg(argv) {
  const arg = argv.find((a) => a.startsWith(SWITCH));
  return arg ? arg.slice(SWITCH.length) || null : null;
}

/** Carpeta del proyecto OpenPLC de esa ruta; error si no es un proyecto. */
export function openPlcDir(target) {
  const path = resolve(target);
  const dir = basename(path).toLowerCase() === "project.json" ? dirname(path) : path;
  if (!isOpenPlcProject(dir)) throw new Error(`no es un proyecto del OpenPLC Editor: ${dir}`);
  return dir;
}
