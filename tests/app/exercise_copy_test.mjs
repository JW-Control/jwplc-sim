// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Copia de ejercicios: se ponen al día los archivos que el alumno no tocó.
// node --test tests/app/exercise_copy_test.mjs
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { MARK, syncExercise } from "../../app/lib/exercise-copy.mjs";

const SRC = resolve(import.meta.dirname, "../../exercises/01-marcha-parada");
const INO = "sketch/marcha_parada/marcha_parada.ino";
const OLD_IO = "    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);\n    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);\n";
const NEW_IO = "    // Las entradas y salidas del JWPLC ya vienen configuradas: no hace falta pinMode.\n";

test("primera copia: sin solución y con marca", () => {
  const dst = join(mkdtempSync(join(tmpdir(), "ex-")), "01");
  assert.deepEqual(syncExercise(SRC, dst), []);
  assert.ok(existsSync(join(dst, INO)) && existsSync(join(dst, MARK)) && !existsSync(join(dst, "solucion")));
});

test("copia vieja sin marca: la plantilla con pinMode se actualiza", () => {
  const dst = join(mkdtempSync(join(tmpdir(), "ex-")), "01");
  cpSync(SRC, dst, { recursive: true });
  writeFileSync(join(dst, INO), readFileSync(join(SRC, INO), "utf8").replace(NEW_IO, OLD_IO));
  writeFileSync(join(dst, "ENUNCIADO.md"), "viejo");
  const up = syncExercise(SRC, dst);
  assert.ok(up.includes(INO) && up.includes("ENUNCIADO.md"));
  assert.equal(readFileSync(join(dst, INO), "utf8"), readFileSync(join(SRC, INO), "utf8"));
});

test("copia vieja con el programa del alumno: no se toca, ni ahora ni después", () => {
  const dst = join(mkdtempSync(join(tmpdir(), "ex-")), "01");
  cpSync(SRC, dst, { recursive: true });
  const mine = readFileSync(join(SRC, INO), "utf8").replace(NEW_IO, OLD_IO).replace("void loop()\n{", "void loop()\n{\n    digitalWrite(Q0_0, digitalRead(I0_0));");
  writeFileSync(join(dst, INO), mine);
  assert.ok(!syncExercise(SRC, dst).includes(INO));
  assert.ok(!syncExercise(SRC, dst).includes(INO));
  assert.equal(readFileSync(join(dst, INO), "utf8"), mine);
});

test("con marca: solo se actualiza lo que no se editó", () => {
  const base = mkdtempSync(join(tmpdir(), "ex-"));
  const src = join(base, "src");
  cpSync(SRC, src, { recursive: true });
  const dst = join(base, "dst");
  syncExercise(src, dst);
  writeFileSync(join(dst, INO), "// mío\n");
  writeFileSync(join(src, INO), "// plantilla nueva\n");
  writeFileSync(join(src, "rubrica.json"), "{}\n");
  const up = syncExercise(src, dst);
  assert.deepEqual(up, ["rubrica.json"]);
  assert.equal(readFileSync(join(dst, INO), "utf8"), "// mío\n");
});
