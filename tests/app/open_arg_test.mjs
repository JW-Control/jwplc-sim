// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Apertura desde el OpenPLC Editor: ruta de --jwsim-open y carpeta del proyecto.
// node --test tests/app/open_arg_test.mjs
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { openArg, openPlcDir } from "../../app/lib/open-arg.mjs";

const BLINK = resolve(import.meta.dirname, "../openplc/blink");

test("openArg encuentra la ruta entre los argumentos de Electron", () => {
  const path = "C:\Mis proyectos\blink";
  assert.equal(openArg(["JWPLC Sim.exe", "--allow-file-access", `--jwsim-open=${path}`]), path);
});

test("openArg sin la opción, o vacía, no pide nada", () => {
  assert.equal(openArg(["JWPLC Sim.exe", "."]), null);
  assert.equal(openArg(["JWPLC Sim.exe", "--jwsim-open="]), null);
});

test("openPlcDir acepta la carpeta y su project.json", () => {
  assert.equal(openPlcDir(BLINK), BLINK);
  assert.equal(openPlcDir(join(BLINK, "project.json")), BLINK);
});

test("openPlcDir rechaza lo que no es un proyecto", () => {
  assert.throws(() => openPlcDir(import.meta.dirname), /no es un proyecto del OpenPLC Editor/);
});
