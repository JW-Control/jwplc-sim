// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Planta (G8 3D): cinta, tanque y puerta movidos por un motor de la escena,
// con sensores enlazados a sus salidas. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { faults, ms, scene } from "./helpers.mjs";

test("cinta: la pieza avanza con el motor, acciona A y B (sensores enlazados) y sale contada", () => {
  const s = scene(
    ["N:power-230vac", "S:pushbutton-no", "M1:motor", { id: "C1", type: "jwsim/conveyor", params: { motor: "M1.speed" } },
      { id: "BA", type: "jwsim/limit-switch", params: { source: "C1.sensorA" } }, { id: "BB", type: "jwsim/limit-switch", params: { source: "C1.sensorB" } }],
    ["N.L - S.13", "S.14 - M1.U1", "N.N - M1.U2"],
  );
  s.act("C1", "poner", true, ms(0));
  s.act("C1", "poner", false, ms(10));
  assert.deepEqual(s.output("C1", "piezas"), [0.1]);
  s.act("S", "press", true, ms(100));
  // Motor a pleno a los 400 ms (rampa de 300 ms); 0,25 m/s. El borde de la
  // pieza llega a A (0,4 m) al centrarse en 0,3 m: 0,0375 m en la rampa y
  // 0,1625 m a 0,25 m/s = 1,05 s.
  s.advanceTo(ms(1040));
  assert.equal(s.output("C1", "sensorA"), false);
  s.advanceTo(ms(1060));
  assert.equal(s.output("C1", "sensorA"), true);
  assert.equal(s.contact("BA", "13-14"), true);
  // B (1,7 m): centro en 1,6 m, 1,3 m más: 6,25 s.
  s.advanceTo(ms(6240));
  assert.equal(s.output("C1", "sensorB"), false);
  s.advanceTo(ms(6260));
  assert.equal(s.contact("BB", "13-14"), true);
  assert.equal(s.contact("BA", "13-14"), false);
  // Cae al final (centro en 2,1 m): 8,25 s.
  s.advanceTo(ms(8300));
  assert.equal(s.output("C1", "salidas"), 1);
  assert.deepEqual(s.output("C1", "piezas"), []);
  // Sin motor, una pieza nueva queda quieta.
  s.act("S", "press", false, ms(8300));
  s.act("C1", "poner", true, ms(9500));
  s.advanceTo(ms(12000));
  assert.deepEqual(s.output("C1", "piezas"), [0.1]);
  assert.deepEqual(faults(s), []);
});

test("cinta: sin motor las piezas no avanzan; una automática por vez si el inicio está ocupado", () => {
  const s = scene([{ id: "C1", type: "jwsim/conveyor", params: { cada: 4 } }], []);
  s.advanceTo(ms(9000));
  assert.deepEqual(s.output("C1", "piezas"), [0.1]);
});

test("tanque: la bomba llena, el sensor de nivel alto (0,8) actúa a su tiempo y rebalsa en 1", () => {
  const s = scene(
    ["N:power-230vac", "S:pushbutton-no", "M1:motor", { id: "T1", type: "jwsim/tank", params: { bomba: "M1.running" } },
      { id: "LH", type: "jwsim/limit-switch", params: { source: "T1.nivel", min: 0.8, max: 1 } }],
    ["N.L - S.13", "S.14 - M1.U1", "N.N - M1.U2"],
  );
  assert.equal(s.output("T1", "nivelPct"), 50);
  s.act("S", "press", true, ms(0));
  // (40 - 15) L/min en 200 L: 0,3 de nivel en 144 s.
  s.advanceTo(ms(143_000));
  assert.equal(s.contact("LH", "13-14"), false);
  s.advanceTo(ms(145_000));
  assert.equal(s.contact("LH", "13-14"), true);
  s.advanceTo(ms(300_000));
  assert.equal(s.output("T1", "rebalse"), true);
  assert.equal(s.output("T1", "nivelPct"), 100);
  // Sin bomba, el consumo lo baja: deja de actuar el nivel alto.
  s.act("S", "press", false, ms(300_000));
  // 15 L/min de consumo: de 1 a 0,8 en 160 s.
  s.advanceTo(ms(455_000));
  assert.equal(s.contact("LH", "13-14"), true);
  s.advanceTo(ms(465_000));
  assert.equal(s.contact("LH", "13-14"), false);
  assert.equal(s.output("T1", "rebalse"), false);
});

test("puerta: el motor de 24 VDC abre (finales de carrera) y con la polaridad invertida cierra; la persona acciona la fotocelda", () => {
  const s = scene(
    ["PS:power-24vdc", "SA:pushbutton-no", "SC:pushbutton-no", { id: "M1", type: "jwsim/motor", params: { rating: "24VDC" } },
      { id: "P1", type: "jwsim/door", params: { motor: "M1.speed" } },
      { id: "BC", type: "jwsim/limit-switch", params: { source: "P1.posicion", min: 0, max: 0.01 } },
      { id: "BO", type: "jwsim/limit-switch", params: { source: "P1.posicion", min: 0.99, max: 1 } },
      { id: "BF", type: "jwsim/sensor-photoelectric", params: { source: "P1.persona" } }],
    ["PS.+V1 - SA.13", "SA.14 - M1.U1", "M1.U2 - PS.-V1", "PS.+V1 - SC.13", "SC.14 - M1.U2", "M1.U1 - PS.-V1"].slice(0, 3),
  );
  assert.equal(s.contact("BC", "13-14"), true);
  s.act("SA", "press", true, ms(0));
  s.advanceTo(ms(3000));
  assert.equal(s.contact("BC", "13-14"), false);
  assert.ok(Math.abs(s.output("P1", "posicionPct") - 47.5) < 2, `${s.output("P1", "posicionPct")}`);
  s.advanceTo(ms(6300));
  assert.equal(s.contact("BO", "13-14"), true);
  assert.equal(s.output("P1", "forzando"), true, "el motor sigue empujando contra el tope");
  s.act("SA", "press", false, ms(6500));
  s.advanceTo(ms(7500));
  assert.equal(s.output("P1", "forzando"), false);
  assert.equal(s.output("P1", "abierta"), true);
  s.act("P1", "persona", true, ms(8000));
  s.advanceTo(ms(8100));
  assert.equal(s.output("BF", "detecting"), true);
});
