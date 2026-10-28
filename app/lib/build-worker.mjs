// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Compilación fuera del hilo principal de Electron: buildSketch tiene tramos
// síncronos (nm, objcopy, lectura de dependencias) que en una compilación en
// frío en Windows pueden durar decenas de segundos y congelarían la ventana.
import { parentPort } from "node:worker_threads";

import { buildSketch } from "../../cli/lib/build.mjs";
import { buildOpenPlcProject, isOpenPlcProject } from "../../cli/lib/openplc.mjs";

parentPort.on("message", async ({ id, dir, outDir }) => {
  try {
    const log = (line) => parentPort.postMessage({ id, log: line });
    // Proyecto del OpenPLC Editor: cadena del editor y luego el sketch (G6).
    const { exe, libraries, openplc } = isOpenPlcProject(dir) ? await buildOpenPlcProject(dir, { outDir, log }) : await buildSketch(dir, { outDir, log });
    parentPort.postMessage({ id, done: { ok: true, exe, libraries, openplc } });
  } catch (err) {
    parentPort.postMessage({ id, done: { ok: false, message: err.message, diagnostics: err.diagnostics ?? [], output: err.output ?? "" } });
  }
});
