// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Avance de la descarga de las herramientas del ESP32 (cli/lib/esp32.mjs):
// las barras de arduino-cli se resumen en una línea que empieza con «\r».
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { prepareEsp32, progressLine } from "../../cli/lib/esp32.mjs";

test("barra de arduino-cli → línea de avance", () => {
  assert.equal(progressLine("jwplc:esp-x32@2601 199.26 MiB / 318.78 MiB   62.51% 00m01s"), "\r  esp-x32@2601: 199 / 319 MB (63 %)");
  assert.equal(progressLine("jwplc:mkspiffs@0.2.3 0 B / 49.46 KiB    0.00%"), "\r  mkspiffs@0.2.3: 0.0 / 0.0 MB (0 %)");
  assert.equal(progressLine("jwplc:esp-x32@2601 downloaded"), null);
  assert.equal(progressLine("Installing jwplc:esp-x32@2601..."), null);
});

test("índice de librerías vacío: arduino-cli no baja el de Arduino", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-ard-"));
  // Necesita el package fijado (node scripts/fetch-package.mjs).
  prepareEsp32({ dataDir: dir });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "library_index.json"), "utf8")), { libraries: [] });
});
