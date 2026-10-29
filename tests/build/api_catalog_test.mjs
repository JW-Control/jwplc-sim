// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Catálogo de la API del Basic (autocompletado) contra el package fijado.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { buildApiCatalog } from "../../cli/lib/api-catalog.mjs";
import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";

const { root, lock } = resolvePackageRoot({ fetch: false });
const cat = buildApiCatalog(join(root, lock.JWPLC_PACKAGE_TREE));
const g = (n) => cat.globals.find((x) => x.name === n);

test("pines, teclas y funciones de E/S en bloque salen del package", () => {
  assert.deepEqual(cat.pins.inputs, ["I0_0", "I0_1", "I0_2", "I0_3", "I0_4", "I0_5", "I0_6", "I0_7"]);
  assert.deepEqual(cat.pins.outputs, ["Q0_0", "Q0_1", "Q0_2", "Q0_3", "Q0_4", "Q0_5", "Q0_6", "Q0_7"]);
  assert.deepEqual(cat.buttons, ["BTN_LEFT", "BTN_UP", "BTN_RIGHT", "BTN_ESC", "BTN_OK", "BTN_DOWN"]);
  for (const f of ["JWPLC_readInputs", "JWPLC_readOutputs", "JWPLC_writeOutputs"]) assert.ok(cat.functions.some((x) => x.name === f), f);
  assert.ok(cat.functions.every((f) => !/Class$/.test(f.name)), "sin constructores ni tipos");
});

test("objetos globales con sus métodos públicos, sin lo que maneja el runtime", () => {
  assert.deepEqual(g("JWPLC_Buttons").members.find((m) => m.name === "pressed").params, [{ type: "uint8_t", name: "id" }]);
  assert.equal(g("JWPLC_Buzzer").members.find((m) => m.name === "beep").signature, "bool beep(uint16_t durMs = 60, uint16_t freq = 2000)");
  assert.ok(g("JWPLC_IO").members.some((m) => m.name === "input"));
  for (const obj of cat.globals) {
    for (const m of obj.members) assert.doesNotMatch(m.name, /^(begin\w*|update|stopTask|setScanDelays)$/, `${obj.name}.${m.name}`);
  }
  assert.ok(!cat.globals.some((x) => /LogicRuntime/.test(x.name)), "JWPLC_LogicRuntime está fuera de alcance");
});
