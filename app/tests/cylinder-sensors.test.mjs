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

test("buildSensorDevice coloca rodillos mas cerca del embolo largo y magneticos sobre la camisa", () => {
  const valve = { id: "Y1", type: "jwsim/solenoid-valve", x: 760, y: 440 };
  const s0 = cs.buildSensorDevice(valve, { id: "A0", kind: "compacto", pos: 0 }, [valve]);
  assert.equal(s0.type, "jwsim/limit-switch");
  assert.deepEqual(s0.params, { model: "compacto", orientacion: "abajo", source: "Y1.position", min: 0, max: 0 });
  assert.equal(s0.x, 1040);
  assert.equal(s0.y, 280);

  const s1 = cs.buildSensorDevice(valve, { id: "A1", kind: "compacto", pos: 1 }, [valve, s0]);
  assert.equal(s1.x, 1180);
  assert.equal(s1.y, 280);

  // Marca intermedia 0.5 se apila arriba para no chocar con A0/A1 de 120 px de ancho.
  const sMid = cs.buildSensorDevice(valve, { id: "A2", kind: "XCKJ", pos: 0.5 }, [valve, s0, s1]);
  assert.equal(sMid.type, "jwsim/limit-switch");
  assert.deepEqual(sMid.params, { model: "XCKJ", orientacion: "abajo", source: "Y1.position", min: 0.47, max: 0.53 });
  assert.equal(sMid.x, 1120);
  assert.equal(sMid.y, 20);

  // Sensor magnético siempre sobre la camisa del cilindro (x <= bx + 160), nunca encima del émbolo.
  const sMag0 = cs.buildSensorDevice(valve, { id: "A3", kind: "magnetic", pos: 0 }, [valve, s0]);
  assert.equal(sMag0.x, 780);
  assert.equal(sMag0.y, 320);
  const sMag1 = cs.buildSensorDevice(valve, { id: "A4", kind: "magnetic", pos: 1 }, [valve, s0]);
  assert.equal(sMag1.type, "jwsim/sensor-cylinder");
  assert.deepEqual(sMag1.params, { cylinder: "Y1", end: "extendido" });
  assert.equal(sMag1.x, 920);
  assert.equal(sMag1.y, 320);
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
  assert.equal(s0.x, 1120);

  // Cambiar tipo de rodillo (13/14) a magnético (BN/BU/BK) cambia tipo, reubica y limpia cable incompatible.
  const r3 = cs.updateSensorConfig(spec, "Y1", "S0", { kind: "magnetic" });
  assert.equal(r3.ok, true);
  assert.equal(s0.type, "jwsim/sensor-cylinder");
  assert.deepEqual(s0.params, { cylinder: "Y1", end: "extendido" });
  assert.equal(spec.wiring.length, 0);
});

test("groupedSensorsForValve y linkedValveOf gestionan agrupacion elastica y desacople", () => {
  assert.equal(cs.GROUP_SNAP_RADIUS, 100);
  const valve = { id: "Y1", type: "jwsim/solenoid-valve", x: 760, y: 440, params: {} };
  const s0 = cs.buildSensorDevice(valve, { id: "A0", kind: "compacto", pos: 0 }, [valve]);
  const s1 = cs.buildSensorDevice(valve, { id: "A1", kind: "compacto", pos: 1 }, [valve, s0]);
  const detached = cs.buildSensorDevice(valve, { id: "A2", kind: "magnetic", pos: 0 }, [valve, s0, s1]);
  detached.x += 180;
  const unrelated = { id: "K1", type: "jwsim/relay", x: 200, y: 200, params: {} };
  const devices = [valve, s0, s1, detached, unrelated];

  assert.equal(cs.linkedValveOf(devices, s0)?.id, "Y1");
  assert.equal(cs.linkedValveOf(devices, detached)?.id, "Y1");
  assert.equal(cs.linkedValveOf(devices, valve), null);
  assert.equal(cs.linkedValveOf(devices, unrelated), null);

  assert.deepEqual(
    cs.groupedSensorsForValve(devices, "Y1").map((d) => d.id),
    ["A0", "A1"],
  );
});

test("applyKindToValve convierte todos los sensores ya colocados al nuevo tipo sin borrarlos", () => {
  const spec = {
    devices: [{ id: "Y1", type: "jwsim/solenoid-valve", x: 600, y: 440, params: {} }],
    wiring: [],
  };
  cs.addStandardPair(spec, "Y1", "compacto");
  assert.deepEqual(
    cs.sensorsForValve(spec.devices, "Y1").map((s) => s.kind),
    ["compacto", "compacto"],
  );

  // Cambiar todo el cilindro a XCKJ conserva IDs/posiciones y reubica a altura XCKJ.
  const rXckj = cs.applyKindToValve(spec, "Y1", "XCKJ");
  assert.equal(rXckj.ok, true);
  assert.deepEqual(
    cs.sensorsForValve(spec.devices, "Y1").map((s) => [s.id, s.kind, s.pos]),
    [["A0", "XCKJ", 0], ["A1", "XCKJ", 1]],
  );
  assert.equal(spec.devices.find((d) => d.id === "A0").y, 240);

  // Cambiar a magnético convierte ambos a sensor-cylinder sobre la camisa.
  const rMag = cs.applyKindToValve(spec, "Y1", "magnetic");
  assert.equal(rMag.ok, true);
  assert.deepEqual(
    cs.sensorsForValve(spec.devices, "Y1").map((s) => [s.id, s.kind, s.pos]),
    [["A0", "magnetic", 0], ["A1", "magnetic", 1]],
  );
  assert.equal(spec.devices.find((d) => d.id === "A0").x, 620);
  assert.equal(spec.devices.find((d) => d.id === "A1").x, 760);
});
