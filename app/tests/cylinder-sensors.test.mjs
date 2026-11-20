// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

const cs = await import("../lib/cylinder-sensors.cjs").then((m) => m.default ?? m);

test("nextCylinderLetter asigna A, B, C evitando letras ya usadas", () => {
  const spec = {
    devices: [
      { id: "Y1", type: "jwsim/solenoid-valve", x: 760, y: 440, params: {} },
      { id: "A0", type: "jwsim/limit-switch", params: { source: "Y1.position", min: 0, max: 0 } },
      { id: "Y2", type: "jwsim/solenoid-valve-2", x: 1520, y: 440, params: {} },
    ],
  };
  assert.equal(cs.nextCylinderLetter(spec.devices, "Y1"), "A");
  assert.equal(cs.nextCylinderLetter(spec.devices, "Y2"), "B");
});

test("buildSensorDevice coloca rodillos e imanes encima del embolo con rangos validos", () => {
  const valve = { id: "Y1", type: "jwsim/solenoid-valve", x: 760, y: 440 };
  const s0 = cs.buildSensorDevice(valve, { id: "A0", kind: "compacto", pos: 0 }, [valve]);
  assert.equal(s0.type, "jwsim/limit-switch");
  assert.deepEqual(s0.params, { model: "compacto", source: "Y1.position", min: 0, max: 0 });
  assert.equal(s0.x, 960);
  assert.equal(s0.y, 220);

  const sMid = cs.buildSensorDevice(valve, { id: "A2", kind: "XCKJ", pos: 0.5 }, [valve, s0]);
  assert.equal(sMid.type, "jwsim/limit-switch");
  assert.deepEqual(sMid.params, { model: "XCKJ", source: "Y1.position", min: 0.47, max: 0.53 });
  assert.equal(sMid.x, 1080);
  assert.equal(sMid.y, 180);

  const sMag = cs.buildSensorDevice(valve, { id: "A1", kind: "magnetic", pos: 1 }, [valve, s0]);
  assert.equal(sMag.type, "jwsim/sensor-cylinder");
  assert.deepEqual(sMag.params, { cylinder: "Y1", end: "extendido" });
  assert.equal(sMag.x, 920);
  assert.equal(sMag.y, 320);
});

test("sensorsForValve lista ordenados los sensores de la valvula y addStandardPair agrega los extremos faltantes", () => {
  const spec = {
    devices: [
      { id: "Y1", type: "jwsim/solenoid-valve", x: 760, y: 440, params: {} },
    ],
    wiring: [],
  };
  const added1 = cs.addStandardPair(spec, "Y1", "compacto");
  assert.deepEqual(added1, ["A0", "A1"]);
  assert.deepEqual(
    cs.sensorsForValve(spec.devices, "Y1").map((s) => [s.id, s.pos, s.kind]),
    [["A0", 0, "compacto"], ["A1", 1, "compacto"]],
  );

  // Si se borra A1 y se vuelve a pedir par estándar, agrega solo el faltante sin duplicar A0.
  cs.removeSensor(spec, "A1");
  const added2 = cs.addStandardPair(spec, "Y1", "compacto");
  assert.deepEqual(added2, ["A1"]);
  assert.equal(cs.sensorsForValve(spec.devices, "Y1").length, 2);
});

test("updateSensorConfig renombra actualizando cables, cambia posicion y convierte tipo limpiando bornes incompatibles", () => {
  const spec = {
    devices: [
      { id: "plc", type: "jwsim/jwplc-basic", x: 0, y: 0 },
      { id: "Y1", type: "jwsim/solenoid-valve", x: 760, y: 440 },
      { id: "A0", type: "jwsim/limit-switch", params: { model: "compacto", source: "Y1.position", min: 0, max: 0 }, x: 960, y: 220 },
    ],
    wiring: [
      { from: "A0.14", to: "plc.I0_0" },
    ],
  };

  // Renombrar A0 -> S0 conserva el cableado actualizado.
  const r1 = cs.updateSensorConfig(spec, "Y1", "A0", { id: "S0" });
  assert.equal(r1.ok, true);
  assert.equal(r1.id, "S0");
  assert.equal(spec.wiring[0].from, "S0.14");

  // Cambiar a posición intermedia 0.5 actualiza banda y alinea x encima del émbolo.
  const r2 = cs.updateSensorConfig(spec, "Y1", "S0", { pos: 0.5 });
  assert.equal(r2.ok, true);
  const s0 = spec.devices.find((d) => d.id === "S0");
  assert.equal(s0.params.min, 0.47);
  assert.equal(s0.params.max, 0.53);
  assert.equal(s0.x, 1080);

  // Cambiar tipo de rodillo (13/14) a magnético (BN/BU/BK) cambia tipo, reubica y limpia cable incompatible.
  const r3 = cs.updateSensorConfig(spec, "Y1", "S0", { kind: "magnetic" });
  assert.equal(r3.ok, true);
  assert.equal(s0.type, "jwsim/sensor-cylinder");
  assert.deepEqual(s0.params, { cylinder: "Y1", end: "extendido" });
  assert.equal(spec.wiring.length, 0);
});
