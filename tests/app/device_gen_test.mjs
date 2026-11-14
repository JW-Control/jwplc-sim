// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Asistente «Nuevo dispositivo» (cli/lib/device-gen.mjs, etapa B de
// PROPUESTA_MODELOS_PROPIOS.md): cada bloque genera un dispositivo que
// cumple el contrato, con el símbolo en la grilla, y se comporta como dice.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import { checkDeviceDir } from "../../cli/lib/device.mjs";
import { BEHAVIORS, generateDevice, normalizeSpec, writeDevice } from "../../cli/lib/device-gen.mjs";
import { checkSymbolSvg } from "../../cli/lib/symbol-check.mjs";
import { ms, sceneWith } from "../../sdk/testing.mjs";

const parent = mkdtempSync(join(tmpdir(), "jwsim-gen-"));
const make = async (spec) => {
  const { dir } = writeDevice(parent, { author: "utec", ...spec });
  const mod = await import(pathToFileURL(join(dir, "device.mjs")).href);
  return { dir, def: mod.default };
};

test("la especificación se valida con mensajes claros", () => {
  assert.throws(() => normalizeSpec({ behavior: "x", author: "a", name: "b" }), /comportamiento desconocido/);
  assert.throws(() => normalizeSpec({ behavior: "rele", author: "Mi Autor", name: "b" }), /autor/);
  assert.throws(() => normalizeSpec({ behavior: "rele", author: "jwsim", name: "b" }), /biblioteca incluida/);
  assert.throws(() => normalizeSpec({ behavior: "rele", author: "a", name: "b", no: 0, nc: 0 }), /al menos un contacto/);
  assert.equal(normalizeSpec({ behavior: "rele", author: "a", name: "b" }).type, "a/b");
});

test("todos los bloques, con 1 a 4 contactos, dejan los bornes en la grilla", () => {
  for (const b of BEHAVIORS) {
    for (const [no, nc] of [[1, 0], [0, 1], [2, 1], [4, 4]]) {
      const g = generateDevice({ behavior: b.id, author: "a", name: `x-${b.id}`, no, nc });
      const terms = [...new Set([...g.files["device.mjs"].matchAll(/\{"id":"([^"]+)"\}/g)].map((m) => m[1]))].map((id) => ({ id }));
      const r = checkSymbolSvg(g.files["symbol.svg"], { terminals: terms });
      assert.deepEqual(r.errors, [], `${b.id} ${no}NA ${nc}NC`);
      assert.equal(r.terms.length, terms.length, `${b.id}: todos los bornes dibujados`);
    }
  }
});

test("cada carpeta generada pasa la validación del dispositivo y del símbolo", async () => {
  for (const b of BEHAVIORS) {
    const { dir } = writeDevice(parent, { behavior: b.id, author: "chk", name: `ok-${b.id}` });
    const r = await checkDeviceDir(dir);
    assert.deepEqual(r.errors, [], b.id);
    assert.equal(JSON.parse(readFileSync(join(dir, "jwsim-device.json"), "utf8")).type, `chk/ok-${b.id}`);
  }
});

test("relé: con la bobina conmuta NA y NC", async () => {
  const { def } = await make({ behavior: "rele", name: "rele-2na-1nc", no: 2, nc: 1 });
  const s = sceneWith(def, ["PS:power-24vdc", "S1:pushbutton-no", "K1:utec/rele-2na-1nc"], ["PS.+V1 - S1.13", "S1.14 - K1.A1", "K1.A2 - PS.-V1"]);
  s.advanceTo(ms(10));
  assert.equal(s.output("K1", "energized"), false);
  s.act("S1", "press", true, ms(20));
  s.advanceTo(ms(30));
  assert.equal(s.output("K1", "energized"), true);
  assert.deepEqual(Object.keys(def.electrical({ rating: "24VDC" }).contacts), ["13-14", "23-24", "31-32"]);
});

test("temporizador: 15-18 cierra al vencer el tiempo, en el instante exacto", async () => {
  const { def } = await make({ behavior: "temporizador", name: "temp-2s", delayMs: 2000 });
  const s = sceneWith(def, ["PS:power-24vdc", "KT:utec/temp-2s"], ["PS.+V1 - KT.A1", "KT.A2 - PS.-V1"]);
  s.advanceTo(ms(1999));
  assert.equal(s.output("KT", "closed"), false);
  s.advanceTo(ms(2001));
  assert.equal(s.output("KT", "closed"), true);
});

test("sensor: lee otra salida y conmuta con umbral e histéresis; planta: integra su entrada", async () => {
  const sensor = (await make({ behavior: "sensor", name: "umbral", threshold: 30, hysteresis: 10 })).def;
  const plant = (await make({ behavior: "planta", name: "llenado", upPerS: 10, downPerS: 10 })).def;
  // Parámetros como en Propiedades: P1 lee el selector, B1 lee el nivel de P1.
  assert.ok(sensor.reads({ source: "P1.valuePct" }).length === 1 && sensor.reads({ source: "" }).length === 0);
  const s2 = sceneWith(
    [sensor, plant],
    [
      { id: "S1", type: "jwsim/selector-2" },
      { id: "P1", type: "utec/llenado", params: { source: "S1.position" } },
      { id: "B1", type: "utec/umbral", params: { source: "P1.valuePct", threshold: 30, hysteresis: 10 } },
    ],
    [],
  );
  s2.act("S1", "position", 1, 0n);
  s2.advanceTo(ms(2000));
  assert.ok(Math.abs(Number(s2.output("P1", "valuePct")) - 20) < 0.01, "sube 10 %/s");
  assert.equal(s2.output("B1", "active"), false);
  s2.advanceTo(ms(3500));
  assert.equal(s2.output("B1", "active"), true, "pasa el umbral de 30 %");
  s2.act("S1", "position", 0, ms(3500));
  s2.advanceTo(ms(4500));
  assert.equal(s2.output("B1", "active"), true, "a 25 % sigue activo (histéresis hasta 20 %)");
  s2.advanceTo(ms(5600));
  assert.equal(s2.output("B1", "active"), false, "bajo 20 % se desactiva");
});

test("pulsador: momentary cierra mientras se pulsa; selector (toggle) queda", async () => {
  const { def } = await make({ behavior: "pulsador", name: "pulsa", mode: "momentary", no: 1, nc: 1 });
  const s = sceneWith(def, ["S9:utec/pulsa"], []);
  s.act("S9", "press", true, ms(10));
  s.advanceTo(ms(20));
  assert.equal(s.output("S9", "pressed"), true);
  s.act("S9", "press", false, ms(30));
  s.advanceTo(ms(40));
  assert.equal(s.output("S9", "pressed"), false);
});
