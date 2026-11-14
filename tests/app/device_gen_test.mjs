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

test("planta térmica: escalón FOPDT, PT100 al transmisor, consigna 0-10 V y termostato exacto", async () => {
  const { def } = await make({ behavior: "termica", name: "horno", tau: 100, gain: 100, theta: 10, ambient: 20, tmax: 60, stepMs: 500 });
  const Ta = 20;
  const K = 100;
  // Escalón con la resistencia a 24 VDC: a θ + τ = 110 s llega a Ta + 0,632·K (exacto con θ múltiplo de Ts).
  const s = sceneWith(
    def,
    [
      "PS:power-24vdc",
      { id: "H1", type: "utec/horno" },
      { id: "TT", type: "jwsim/pt100-rs485", params: { sonda: "cableada" } },
    ],
    ["PS.+V1 - H1.R1", "H1.R2 - PS.-V1", "PS.+V1 - TT.+", "TT.- - PS.-V1", "H1.PT1 - TT.R1", "H1.PT2 - TT.R2", "H1.PT3 - TT.R3"],
  );
  s.advanceTo(ms(10_000));
  assert.ok(Math.abs(Number(s.output("H1", "temp")) - Ta) < 1e-6, "durante θ no cambia");
  s.advanceTo(ms(110_000));
  const T110 = Number(s.output("H1", "temp"));
  assert.ok(Math.abs(T110 - (Ta + K * (1 - Math.exp(-1)))) < 0.05, `T(θ+τ) = ${T110}`);
  // La PT100 cableada llega al transmisor (redondeado a 0,1 °C).
  assert.ok(Math.abs(Number(s.output("TT", "temp")) - T110) <= 0.06, "el transmisor lee la sonda");
  // Termostato a 60 °C: Ta + K(1 − e^(−(t−θ)/τ)) = 60 → t = θ − τ·ln(0,6) ≈ 61,08 s; cierra en ese instante.
  const s2 = sceneWith(def, ["PS:power-24vdc", { id: "H1", type: "utec/horno" }], ["PS.+V1 - H1.R1", "H1.R2 - PS.-V1"]);
  const tCross = 10 - 100 * Math.log(0.6);
  s2.advanceTo(ms((tCross - 0.6) * 1000));
  assert.equal(s2.output("H1", "sobretemp"), false);
  s2.advanceTo(ms((tCross + 0.01) * 1000));
  assert.equal(s2.output("H1", "sobretemp"), true, "cierra al cruzar, sin esperar el paso");
  // Consigna 0-10 V al 50 %: régimen Ta + 0,5·K, aunque la resistencia no esté cableada.
  const s3 = sceneWith(
    def,
    [{ id: "U", type: "jwsim/signal-source", params: { modo: "0-10 V", valor: 50 } }, { id: "H1", type: "utec/horno" }],
    ["U.+ - H1.AI+", "U.- - H1.AI-"],
  );
  s3.advanceTo(ms(2_000_000));
  assert.ok(Math.abs(Number(s3.output("H1", "temp")) - (Ta + 0.5 * K)) < 0.01, "u = 5 V / 10 V");
});

test("planta térmica sin las E/S opcionales: solo R1-R2", () => {
  const g = generateDevice({ behavior: "termica", author: "a", name: "simple", analogIn: false, pt100: false, thermostat: false });
  assert.match(g.files["device.mjs"], /terminals: \[\{"id":"R1"\},\{"id":"R2"\}\]/);
  assert.doesNotMatch(g.files["device.mjs"], /probeInputs|probes:|TS1/);
});
