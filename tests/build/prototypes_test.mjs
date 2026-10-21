// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests de los prototipos automáticos (cli/lib/prototypes.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";

import { addPrototypes, findFunctions } from "../../cli/lib/prototypes.mjs";

const wrap = (body) => `#include <Arduino.h>\n#line 1 "/s/a.ino"\n${body}`;

test("prototipo antes de la primera función, con #line", () => {
  const out = addPrototypes(wrap("int g = 0;\n\nvoid setup() {\n  blink(3);\n}\n\nvoid loop() {}\n\nstatic void blink(int n)\n{\n  g += n;\n}\n"));
  const lines = out.split("\n");
  const i = lines.indexOf("static void blink(int n);");
  assert.ok(i > 0, out);
  assert.equal(lines[i - 1], '#line 9 "/s/a.ino"');
  assert.ok(out.indexOf("static void blink(int n);") < out.indexOf("void setup() {"));
  // Resincronización: la línea siguiente al bloque vuelve a ser la 3 del .ino.
  const resync = lines.findIndex((l, k) => k > i && l.startsWith("#line"));
  assert.equal(lines[resync], '#line 3 "/s/a.ino"');
  assert.equal(lines[resync + 1], "void setup() {");
});

test("omite declaradas, métodos, plantillas, agregados y argumentos por defecto", () => {
  const src = wrap(
    [
      "void declared(int);",
      "struct S { void m() {} };",
      "void S2::m() {}",
      "template <typename T> T twice(T x) { return x * 2; }",
      "int withDefault(int a = 3) { return a; }",
      "void declared(int x) {}",
      'const char *msg = "{ no es código }";',
      "// void comentada() {}",
      "auto lam = []() { return 1; };",
      "int arr[] = {1, 2};",
      "namespace ns { void inner() {} }",
      "unsigned long IRAM_ATTR isr_counter(void) { return 0; }",
      "",
    ].join("\n"),
  );
  const { functions, declared } = findFunctions(src);
  const names = functions.filter((f) => !f.skip).map((f) => f.name);
  assert.deepEqual(names, ["declared", "isr_counter"]);
  assert.ok(declared.has("declared"));
  const out = addPrototypes(src);
  assert.ok(out.includes("unsigned long IRAM_ATTR isr_counter(void);"));
  assert.ok(!out.includes("void declared(int x);"));
  assert.ok(!out.includes("withDefault(int a = 3);"));
});

test("varias pestañas: cada prototipo apunta a su archivo", () => {
  const src = `#include <Arduino.h>\n#line 1 "/s/a.ino"\nvoid setup() { b(); }\nvoid loop() {}\n#line 1 "/s/b.ino"\nvoid b() {}\n`;
  const out = addPrototypes(src);
  assert.match(out, /#line 1 "\/s\/b\.ino"\nvoid b\(\);/);
});

test("sin funciones: texto sin cambios", () => {
  const src = wrap("int x = 1;\n");
  assert.equal(addPrototypes(src), src);
});
