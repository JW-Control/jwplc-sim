// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Compilación fuera del hilo principal de Electron: buildSketch tiene tramos
// síncronos (nm, objcopy, lectura de dependencias) que en una compilación en
// frío en Windows pueden durar decenas de segundos y congelarían la ventana.
import { parentPort } from "node:worker_threads";

import { buildSketch } from "../../cli/lib/build.mjs";

parentPort.on("message", async ({ id, dir, outDir }) => {
  try {
    const { exe, libraries } = await buildSketch(dir, { outDir, log: (line) => parentPort.postMessage({ id, log: line }) });
    parentPort.postMessage({ id, done: { ok: true, exe, libraries } });
  } catch (err) {
    parentPort.postMessage({ id, done: { ok: false, message: err.message, diagnostics: err.diagnostics ?? [], output: err.output ?? "" } });
  }
});
