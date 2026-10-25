// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Calificación de un ejercicio (G9) fuera del hilo principal: compila el
// sketch del proyecto y corre cada caso de la rúbrica co-simulado con la
// escena (cli/lib/grade.mjs).
import { parentPort } from "node:worker_threads";

import { gradeSketch, loadExercise } from "../../cli/lib/grade.mjs";

parentPort.on("message", async ({ id, project, sketchDir, buildRoot }) => {
  try {
    const ex = loadExercise(project);
    const g = await gradeSketch(ex, sketchDir ?? ex.sketch, { buildRoot, log: (line) => parentPort.postMessage({ id, log: line }) });
    parentPort.postMessage({ id, done: g });
  } catch (err) {
    parentPort.postMessage({ id, done: { ok: false, stage: "error", error: err.message, cases: [] } });
  }
});
