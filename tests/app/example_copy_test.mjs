// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Copia de ejemplos del package: se ponen al día con el package fijado.
// node --test tests/app/example_copy_test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { MARK, syncExample } from "../../app/lib/exercise-copy.mjs";

function ejemplo(texto) {
  const root = mkdtempSync(join(tmpdir(), "exm-"));
  const src = join(root, "pkg", "01.DigitalIO_Basic");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "01.DigitalIO_Basic.ino"), texto);
  return { src, dst: join(root, "work", "01.DigitalIO_Basic") };
}
const INO = "01.DigitalIO_Basic.ino";

test("primera copia: con marca", () => {
  const { src, dst } = ejemplo("v1");
  syncExample(src, dst);
  assert.equal(readFileSync(join(dst, INO), "utf8"), "v1");
  assert.ok(existsSync(join(dst, MARK)));
});

test("sin tocar: se actualiza con el package nuevo", () => {
  const { src, dst } = ejemplo("v1");
  syncExample(src, dst);
  writeFileSync(join(src, INO), "v2");
  assert.deepEqual(syncExample(src, dst), [INO]);
  assert.equal(readFileSync(join(dst, INO), "utf8"), "v2");
});

test("editado por el usuario: se conserva", () => {
  const { src, dst } = ejemplo("v1");
  syncExample(src, dst);
  writeFileSync(join(dst, INO), "mio");
  writeFileSync(join(src, INO), "v2");
  assert.deepEqual(syncExample(src, dst), []);
  assert.equal(readFileSync(join(dst, INO), "utf8"), "mio");
});

test("copia vieja sin marca y distinta: se guarda como (anterior) y se copia de nuevo", () => {
  const { src, dst } = ejemplo("v2");
  mkdirSync(dst, { recursive: true });
  writeFileSync(join(dst, INO), "v1 viejo");
  syncExample(src, dst);
  assert.equal(readFileSync(join(dst, INO), "utf8"), "v2");
  assert.equal(readFileSync(join(`${dst} (anterior)`, INO), "utf8"), "v1 viejo");
  assert.ok(existsSync(join(dst, MARK)));
});

test("copia vieja sin marca e igual: se queda y recibe la marca", () => {
  const { src, dst } = ejemplo("v2");
  mkdirSync(dst, { recursive: true });
  writeFileSync(join(dst, INO), "v2");
  syncExample(src, dst);
  assert.ok(!existsSync(`${dst} (anterior)`) && existsSync(join(dst, MARK)));
});
