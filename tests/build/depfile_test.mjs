// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del lector de archivos .d de GCC (recompilación incremental).
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDepFile } from "../../cli/lib/build.mjs";

test("Linux: objetivo y dependencias con continuación de línea", () => {
  const d = "/b/x.o: /s/x.cpp /s/a.h \\\n /s/con\\ espacio/b.h\n";
  assert.deepEqual(parseDepFile(d), ["/s/x.cpp", "/s/a.h", "/s/con espacio/b.h"]);
});

test("Windows: el ':' de la unidad no corta el objetivo", () => {
  const d =
    "C:\\Users\\jw\\build\\x.o: C:\\Users\\jw\\src\\x.cpp \\\r\n" +
    " C:\\Users\\jw\\src\\a.h C:/Users/jw/AppData/Roaming/JWPLC\\ Sim/b.h\r\n";
  assert.deepEqual(parseDepFile(d), [
    "C:\\Users\\jw\\src\\x.cpp",
    "C:\\Users\\jw\\src\\a.h",
    "C:/Users/jw/AppData/Roaming/JWPLC Sim/b.h",
  ]);
});

test("sin dependencias", () => {
  assert.deepEqual(parseDepFile("x.o:\n"), []);
});
