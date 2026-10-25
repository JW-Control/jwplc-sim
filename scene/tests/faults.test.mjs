// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G9_FAULT_INJECTION (parte de escena): fallas inyectadas en
// dispositivos y cables. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { faultKey } from "../scene.mjs";
import { ms, scene } from "./helpers.mjs";

// Sensor inductivo PNP NA que enciende una lámpara.
const sensorLamp = () =>
  scene(
    ["PS:power-24vdc", "B:sensor-inductive", "H:lamp"],
    ["PS.+V1 - B.BN", "B.BU - PS.-V1", "B.BK - H.X1", "H.X2 - PS.-V1"],
  );

test("sensor pegado detectando: la salida queda activa sin pieza; al quitar la falla vuelve", () => {
  const s = sensorLamp();
  s.advanceTo(ms(5));
  assert.equal(s.output("H", "lit"), false);
  const key = s.inject({ kind: "stuck", device: "B", value: true }, ms(10));
  assert.equal(key, "stuck:B");
  s.advanceTo(ms(12));
  assert.equal(s.output("H", "lit"), true, "pegado: detecta sin pieza");
  s.act("B", "distance", 20, ms(20));
  s.advanceTo(ms(22));
  assert.equal(s.output("H", "lit"), true, "mover la pieza no cambia nada");
  s.clearFault(key, ms(30));
  s.advanceTo(ms(32));
  assert.equal(s.output("H", "lit"), false);
  assert.deepEqual(
    s.events.filter((e) => e.kind === "inject" || e.kind === "clear").map((e) => `${e.kind}:${e.key}`),
    ["inject:stuck:B", "clear:stuck:B"],
  );
});

test("sensor pegado sin detectar: la pieza al frente o el enlace no lo activan", () => {
  const s = sensorLamp();
  s.inject({ kind: "stuck", device: "B", value: false }, ms(1));
  s.act("B", "distance", 2, ms(5));
  s.act("B", "target", true, ms(6));
  s.advanceTo(ms(10));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("B", "detecting"), false);
});

test("final de carrera pegado accionado: 13-14 cerrado y 21-22 abierto sin la leva", () => {
  const s = scene(
    ["PS:power-24vdc", "B:limit-switch", "H1:lamp", "H2:lamp"],
    ["PS.+V1 - B.13", "PS.+V1 - B.21", "B.14 - H1.X1", "B.22 - H2.X1", "H1.X2 - PS.-V1", "H2.X2 - PS.-V1"],
  );
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [false, true]);
  s.inject({ kind: "stuck", device: "B" }, ms(1));
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [true, false]);
});

test("relé soldado: se pega en el primer cierre y ya no abre al caer la bobina", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "K:relay", "H1:lamp", "H2:lamp"],
    ["PS.+V1 - S.13", "S.14 - K.A1", "K.A2 - PS.-V1", "PS.+V1 - K.11", "K.14 - H1.X1", "K.12 - H2.X1", "H1.X2 - PS.-V1", "H2.X2 - PS.-V1"],
  );
  s.inject({ kind: "welded", device: "K" }, ms(1));
  s.advanceTo(ms(5));
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [false, true], "sin cerrar todavía, nada cambia");
  s.act("S", "press", true, ms(10));
  s.advanceTo(ms(20));
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [true, false]);
  s.act("S", "press", false, ms(30));
  s.advanceTo(ms(60));
  assert.equal(s.output("K", "energized"), false, "la bobina cayó");
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [true, false], "los contactos siguen soldados");
});

test("contactor soldado: el motor sigue en marcha tras la parada", () => {
  const s = scene(
    ["PS:power-24vdc", "L:power-230vac", "S:pushbutton-no", "KM:contactor", "M:motor"],
    ["PS.+V1 - S.13", "S.14 - KM.A1", "KM.A2 - PS.-V1", "L.L - KM.1", "KM.2 - M.U1", "M.U2 - L.N"],
  );
  s.inject({ kind: "welded", device: "KM" }, ms(1));
  s.act("S", "press", true, ms(10));
  s.advanceTo(ms(100));
  assert.equal(s.contact("KM", "1-2"), true);
  s.act("S", "press", false, ms(200));
  s.advanceTo(ms(300));
  assert.equal(s.output("KM", "energized"), false);
  assert.equal(s.contact("KM", "1-2"), true);
});

test("cable cortado: la lámpara se apaga; el análisis estático no cambia", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "H:lamp"],
    ["PS.+V1 - S.13", "S.14 - H.X1", "H.X2 - PS.-V1"],
  );
  s.act("S", "press", true, ms(1));
  assert.equal(s.output("H", "lit"), true);
  const key = s.inject({ kind: "open", wire: "H.X1 S.14" }, ms(5));
  assert.equal(key, "open:H.X1 S.14");
  assert.equal(key, faultKey({ kind: "open", wire: "S.14 H.X1" }), "el orden de los extremos no importa");
  assert.equal(s.output("H", "lit"), false);
  assert.deepEqual(s.findings, [], "el cableado sigue completo en el análisis");
  assert.equal(s.snapshot().poles["H.X1"].length, 0, "sin tensión en el extremo cortado");
  s.clearFault(key, ms(10));
  assert.equal(s.output("H", "lit"), true);
});

test("carga quemada: bobina abierta, el contactor no atraca", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "KM:contactor", "H:lamp"],
    ["PS.+V1 - S.13", "S.14 - KM.A1", "KM.A2 - PS.-V1", "PS.+V1 - KM.13", "KM.14 - H.X1", "H.X2 - PS.-V1"],
  );
  s.inject({ kind: "burnt", device: "KM" }, ms(1));
  s.act("S", "press", true, ms(5));
  s.advanceTo(ms(100));
  assert.equal(s.output("KM", "energized"), false);
  assert.equal(s.output("H", "lit"), false);
  assert.deepEqual(s.snapshot().devices.find((d) => d.id === "KM").injected, ["burnt"]);
});

test("fallas inválidas: dispositivo, cable o tipo que no corresponde", () => {
  const s = sensorLamp();
  assert.throws(() => s.inject({ kind: "welded", device: "B" }, 0n), /no tiene contactos que se puedan soldar/);
  assert.throws(() => s.inject({ kind: "stuck", device: "H" }, 0n), /no tiene accionamiento/);
  assert.throws(() => s.inject({ kind: "burnt", device: "X" }, 0n), /inexistente/);
  assert.throws(() => s.inject({ kind: "open", wire: "B.BN H.X1" }, 0n), /no hay un cable/);
  assert.throws(() => s.inject(/** @type {any} */ ({ kind: "melted", device: "H" }), 0n), /falla desconocida/);
});
