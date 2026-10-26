// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Arranque de motores: relé térmico, motor de dos velocidades y variador
// Delta MS300 (bornes y Modbus RTU). node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { withCrc } from "../modbus.mjs";
import { faults, ms, scene } from "./helpers.mjs";

test("relé térmico: falta de fase sostenida dispara 95-96 (NC) y cierra 97-98; RESET con las tres fases", () => {
  const dev = { id: "F", type: "jwsim/overload-relay", params: { tripMs: 3000 } };
  const s = scene(
    ["R:power-3ph", "S:pushbutton-nc", dev, "M:motor-3ph", "H:lamp"],
    ["R.L1 - S.11", "S.12 - F.1", "R.L2 - F.3", "R.L3 - F.5", "F.2 - M.U1", "F.4 - M.V1", "F.6 - M.W1"],
  );
  assert.equal(s.output("F", "tripped"), false);
  assert.equal(s.output("M", "connection"), "triangulo");
  // Se corta L1 (el pulsador NC hace de fusible fundido).
  s.act("S", "press", true, ms(1000));
  assert.equal(s.output("F", "faltaFase"), true);
  s.advanceTo(ms(3900));
  assert.equal(s.output("F", "tripped"), false);
  s.advanceTo(ms(4000));
  assert.equal(s.output("F", "tripped"), true);
  assert.equal(s.contact("F", "95-96"), false);
  assert.equal(s.contact("F", "97-98"), true);
  // RESET con la falta presente: no rearma; con las tres fases, sí.
  s.act("F", "reset", true, ms(4100));
  s.act("F", "reset", false, ms(4200));
  assert.equal(s.output("F", "tripped"), true);
  s.act("S", "press", false, ms(4300));
  s.act("F", "reset", true, ms(4400));
  s.act("F", "reset", false, ms(4500));
  assert.equal(s.output("F", "tripped"), false);
  // TEST dispara al instante.
  s.act("F", "test", true, ms(5000));
  assert.equal(s.output("F", "tripped"), true);
});

test("motor de dos velocidades: baja por 1U-1V-1W, alta por 2U-2V-2W y conflicto con las dos", () => {
  const s = scene(
    ["R:power-3ph", "KL:pushbutton-no", "KH:pushbutton-no", "M:motor-2v"],
    ["R.L1 - KL.13", "KL.14 - M.1U", "R.L2 - M.1V", "R.L3 - M.1W", "R.L1 - KH.13", "KH.14 - M.2U", "R.L2 - M.2V", "R.L3 - M.2W"],
  );
  assert.equal(s.output("M", "energized"), false);
  s.act("KL", "press", true, ms(0));
  s.advanceTo(ms(3000));
  assert.equal(s.output("M", "velocidad"), "baja");
  assert.equal(s.output("M", "rpm"), 470);
  s.act("KL", "press", false, ms(3000));
  s.act("KH", "press", true, ms(3000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("M", "velocidad"), "alta");
  assert.equal(s.output("M", "rpm"), 2800);
  s.act("KL", "press", true, ms(6000));
  assert.equal(s.output("M", "conflicto"), true);
  s.advanceTo(ms(12000));
  assert.equal(s.output("M", "speed"), 0);
});

// Variador: entrada 230 VAC por R-S, motor en triángulo en U-V-W y pulsadores entre MI y DCM.
const VFD = (params = {}) => ({ id: "VF", type: "jwsim/vfd-ms300", params: { accelS: 2, decelS: 2, ...params } });
const vfdScene = (params, extra = [], extraWires = []) =>
  scene(
    ["N:power-230vac", VFD(params), "M:motor-3ph", "S1:pushbutton-no", "S2:pushbutton-no", "S3:pushbutton-no", "S6:pushbutton-no", "S7:pushbutton-no", { id: "H", type: "jwsim/lamp", params: { rating: "230VAC" } }, ...extra],
    [
      "N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1",
      ...["1", "2", "3", "6", "7"].map((k) => `VF.DCM - S${k}.13`), "S1.14 - VF.MI1", "S2.14 - VF.MI2", "S3.14 - VF.MI3", "S6.14 - VF.MI6", "S7.14 - VF.MI7",
      ...extraWires,
    ],
  );

test("variador por bornes: MI1 marcha con rampa, MI2 invierte pasando por 0, MI3 cambia de velocidad", () => {
  const s = vfdScene();
  assert.equal(s.output("VF", "powered"), true);
  assert.equal(s.output("VF", "display"), "F 60.00");
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(1000));
  assert.ok(Math.abs(s.output("VF", "hz") - 30) < 1e-6, `${s.output("VF", "hz")}`);
  assert.ok(Math.abs(s.output("M", "speed") - 0.5) < 1e-6, "el motor sigue a la frecuencia");
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 60);
  assert.equal(s.output("M", "speed"), 1);
  // Multivelocidad 1 (10 Hz) con MI3.
  s.act("S3", "press", true, ms(2000));
  s.advanceTo(ms(4000));
  assert.equal(s.output("VF", "hz"), 10);
  // Atrás: suelta MI1 y pulsa MI2; baja a 0 y sube a -10 Hz.
  s.act("S1", "press", false, ms(4000));
  s.act("S2", "press", true, ms(4000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("VF", "hz"), -10);
  assert.ok(Math.abs(s.output("M", "speed") + 10 / 60) < 1e-6);
  assert.equal(s.output("M", "direction"), -1);
  assert.deepEqual(faults(s), []);
});

test("variador: falla externa EF por MI6 corta la salida, el relé indica falla y MI7 rearma", () => {
  const s = vfdScene({}, [], ["N.L - VF.RC", "VF.RA - H.X1", "H.X2 - N.N"]);
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(3000));
  assert.equal(s.output("H", "lit"), false);
  s.act("S6", "press", true, ms(3000));
  assert.equal(s.output("VF", "fault"), "EF");
  assert.equal(s.output("VF", "running"), false);
  assert.equal(s.output("VF", "display"), "EF");
  assert.equal(s.output("H", "lit"), true, "RA-RC cierra con falla");
  // Sin el motor alimentado, frena por inercia.
  s.advanceTo(ms(6000));
  assert.ok(s.output("M", "speed") < 1);
  // MI7 con la causa presente: sigue en falla; sin causa, rearma y vuelve a arrancar.
  s.act("S7", "press", true, ms(6000));
  s.act("S7", "press", false, ms(6100));
  assert.equal(s.output("VF", "fault"), "EF");
  s.act("S6", "press", false, ms(6200));
  s.act("S7", "press", true, ms(6300));
  s.act("S7", "press", false, ms(6400));
  assert.equal(s.output("VF", "fault"), "");
  s.advanceTo(ms(9000));
  assert.equal(s.output("VF", "hz"), 60);
});

test("variador por Modbus RTU: 2001h frecuencia, 2000h marcha y sentido, lectura de 2103h", () => {
  const s = scene(
    ["N:power-230vac", VFD({ control: "modbus", freqSource: "modbus", address: 3 }), "M:motor-3ph", "plc:jwplc-basic"],
    ["N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1", "plc.RS485_A - VF.SG+", "plc.RS485_B - VF.SG-"],
  );
  const req = (bytes, t) => s.modbusRequest(withCrc(bytes), { t: ms(t), baud: 9600 });
  // Escribir 2001h = 45,00 Hz y 2000h = marcha + adelante (0x12).
  assert.ok(req([3, 6, 0x20, 0x01, 0x11, 0x94], 0));
  assert.ok(req([3, 6, 0x20, 0x00, 0x00, 0x12], 10));
  s.advanceTo(ms(3000));
  assert.equal(s.output("VF", "hz"), 45);
  const r = req([3, 3, 0x21, 0x03, 0x00, 0x01], 3000);
  assert.deepEqual(r.bytes.slice(0, 5), [3, 3, 2, 0x11, 0x94], "2103h = 4500");
  // Atrás (0x22) y luego parada (0x01).
  req([3, 6, 0x20, 0x00, 0x00, 0x22], 3000);
  s.advanceTo(ms(7000));
  assert.equal(s.output("VF", "hz"), -45);
  req([3, 6, 0x20, 0x00, 0x00, 0x01], 7000);
  s.advanceTo(ms(10000));
  assert.equal(s.output("VF", "hz"), 0);
  assert.equal(s.output("VF", "running"), false);
  // Registro no escribible: excepción 02.
  assert.deepEqual(req([3, 6, 0x10, 0x00, 0x00, 0x01], 10000).bytes.slice(0, 3), [3, 0x86, 2]);
});
