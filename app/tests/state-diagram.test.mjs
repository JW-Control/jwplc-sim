// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

const core = await import("../lib/state-diagram-core.cjs").then((m) => m.default ?? m);

const sampleSpec = {
  devices: [
    { id: "CP1", type: "jwsim/compressor", params: { pOff: 8 } },
    { id: "FR1", type: "jwsim/service-unit", params: { source: "CP1", setpoint: 6 } },
    { id: "Y1", type: "jwsim/solenoid-valve", params: { air: "FR1" } },
    { id: "A0", type: "jwsim/limit-switch", params: { source: "Y1.position", min: 0, max: 0 } },
    { id: "A1", type: "jwsim/limit-switch", params: { source: "Y1.position", min: 1, max: 1 } },
    { id: "Y2", type: "jwsim/solenoid-valve-2", params: { air: "FR1" } },
    { id: "B0", type: "jwsim/sensor-cylinder", params: { cylinder: "Y2", end: "retraído" } },
    { id: "B1", type: "jwsim/sensor-cylinder", params: { cylinder: "Y2", end: "extendido" } },
  ],
};

test("extractChannels agrupa cilindros, bobinas, sensores y presión de la escena", () => {
  const res = core.extractChannels(sampleSpec);
  assert.equal(res.hasPneumatics, true);
  assert.equal(res.groups.length, 3); // Cilindro A, Cilindro B, Aire comprimido

  const gA = res.groups[0];
  assert.equal(gA.label, "Cilindro A");
  assert.deepEqual(
    gA.channels.map((c) => [c.kind, c.shortLabel, c.deviceId, c.key]),
    [
      ["cyl", "A", "Y1", "position"],
      ["coil", "Y1", "Y1", "energized"],
      ["sensor", "A0", "A0", "actuated"],
      ["sensor", "A1", "A1", "actuated"],
    ],
  );

  const gB = res.groups[1];
  assert.equal(gB.label, "Cilindro B");
  assert.deepEqual(
    gB.channels.map((c) => [c.kind, c.shortLabel, c.deviceId, c.key]),
    [
      ["cyl", "B", "Y2", "position"],
      ["coil", "Y2+", "Y2", "coilPlus"],
      ["coil", "Y2−", "Y2", "coilMinus"],
      ["sensor", "B0", "B0", "detecting"],
      ["sensor", "B1", "B1", "detecting"],
    ],
  );

  const gAir = res.groups[2];
  assert.equal(gAir.label, "Aire comprimido");
  assert.equal(gAir.channels.length, 2);
  assert.equal(gAir.channels[0].threshold, 1.5);
  assert.ok(gAir.channels[1].max >= 8);
});

test("extractChannels informa hasPneumatics=false cuando no hay electroválvulas", () => {
  const res = core.extractChannels({ devices: [{ id: "plc", type: "jwsim/jwplc-basic" }] });
  assert.equal(res.hasPneumatics, false);
  assert.deepEqual(res.channels, []);
});

test("createRecorder conserva el historial al detener (running=false con t_ms=0) y reinicia al volver a correr", () => {
  const rec = core.createRecorder(100);
  const snapAt = (t_ms, pos, on) => ({
    t_ms,
    devices: [
      { id: "Y1", outputs: { position: pos, energized: on } },
      { id: "A0", outputs: { actuated: pos <= 0.01 } },
    ],
  });

  rec.push(snapAt(0, 0, false), true);
  rec.push(snapAt(500, 0.5, true), true);
  rec.push(snapAt(1000, 1, true), true);
  assert.equal(rec.samples().length, 3);
  assert.equal(rec.lastTimeMs(), 1000);

  // Al detener, analyze() manda running=false con t_ms=0: NO debe borrar la corrida.
  rec.push(snapAt(0, 0, false), false);
  assert.equal(rec.samples().length, 3);
  assert.equal(rec.lastTimeMs(), 1000);

  // Al volver a presionar Ejecutar (false -> true), sí inicia una corrida nueva.
  rec.push(snapAt(0, 0, false), true);
  assert.equal(rec.samples().length, 1);
  assert.equal(rec.lastTimeMs(), 0);
});

test("createRecorder comprime tramos constantes preservando flancos y valueAt interpola linealmente los cilindros", () => {
  const rec = core.createRecorder(100);
  const snapAt = (t_ms, pos, on) => ({
    t_ms,
    devices: [{ id: "Y1", outputs: { position: pos, energized: on } }],
  });

  rec.push(snapAt(0, 0, false), true);
  rec.push(snapAt(200, 0, false), true);
  rec.push(snapAt(400, 0, false), true);
  // Al cambiar en t=500 debe conservar el punto previo t=400 para que el escalón no sea diagonal desde t=0.
  rec.push(snapAt(500, 0.2, true), true);
  rec.push(snapAt(900, 1, true), true);

  const times = rec.samples().map((s) => s.t);
  assert.deepEqual(times, [0, 400, 500, 900]);

  const cylCh = { id: "Y1.position", kind: "cyl", deviceId: "Y1", key: "position" };
  const coilCh = { id: "Y1.energized", kind: "coil", deviceId: "Y1", key: "energized" };

  assert.equal(core.valueAt(rec.samples(), cylCh, 200), 0);
  assert.ok(Math.abs(core.valueAt(rec.samples(), cylCh, 700) - 0.6) < 1e-6);
  assert.equal(core.valueAt(rec.samples(), coilCh, 450), 0);
  assert.equal(core.valueAt(rec.samples(), coilCh, 500), 1);
});

test("windowBounds calcula el rango temporal en modo en vivo, todo y congelado", () => {
  assert.deepEqual(core.windowBounds(12500, 10000, null, false), { t0: 2500, t1: 12500 });
  assert.deepEqual(core.windowBounds(4000, 10000, null, false), { t0: 0, t1: 10000 });
  assert.deepEqual(core.windowBounds(12500, 0, null, false), { t0: 0, t1: 12500 });
  assert.deepEqual(core.windowBounds(12500, 5000, 8000, true), { t0: 3000, t1: 8000 });
  // Congelado en modo "Todo" (windowMs=0) y tras congelar temprano (3s) y hacer zoom (2s):
  assert.deepEqual(core.windowBounds(12500, 0, 5000, true), { t0: 0, t1: 5000 });
  assert.deepEqual(core.windowBounds(8000, 2000, 3000, true), { t0: 1000, t1: 3000 });
});
