// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Arranque de motores: relé térmico, motor de dos velocidades y variador
// Delta VFD-EL (teclado, bornes y Modbus RTU). node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { withCrc } from "../modbus.mjs";
import { vfdEl } from "../devices/vfd-el.mjs";
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

test("relé térmico NR2: STOP abre 95-96 sin disparar; en A se rearma solo al enfriarse", () => {
  const s = scene(
    ["R:power-3ph", "S:pushbutton-nc", { id: "F", type: "jwsim/overload-relay", params: { tripMs: 1000, rearme: "automático (A)", rearmeMs: 5000, range: "4-6 A", ajuste: 5 } }],
    ["R.L1 - S.11", "S.12 - F.1", "R.L2 - F.3", "R.L3 - F.5"],
  );
  assert.equal(s.output("F", "ajusteTxt"), "5 A (4-6)");
  assert.equal(s.output("F", "ajusteRel"), 0.5);
  s.act("F", "stop", true, ms(100));
  assert.equal(s.contact("F", "95-96"), false);
  assert.equal(s.output("F", "tripped"), false);
  s.act("F", "stop", false, ms(200));
  assert.equal(s.contact("F", "95-96"), true);
  // Falta de fase de 1 s: dispara; vuelve la fase a los 2 s y se rearma 5 s después.
  s.act("S", "press", true, ms(1000));
  s.advanceTo(ms(2000));
  assert.equal(s.output("F", "tripped"), true);
  s.act("S", "press", false, ms(2000));
  s.advanceTo(ms(6900));
  assert.equal(s.output("F", "tripped"), true);
  s.advanceTo(ms(7000));
  assert.equal(s.output("F", "tripped"), false);
  assert.equal(s.contact("F", "95-96"), true);
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

// Variador Delta VFD-EL: entrada 230 VAC por R-S, motor en triángulo en U-V-W
// y pulsadores entre MI y DCM (NPN).
const preset = (id) => vfdEl.presets.find((p) => p.id === id).params;
const VFD = (params = {}) => ({ id: "VF", type: "jwsim/vfd-el", params });
const vfdScene = (params, extra = [], extraWires = []) =>
  scene(
    ["N:power-230vac", VFD(params), "M:motor-3ph", "S1:pushbutton-no", "S2:pushbutton-no", "S3:pushbutton-no", "S6:pushbutton-no", { id: "H", type: "jwsim/lamp", params: { rating: "230VAC" } }, ...extra],
    [
      "N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1",
      ...["1", "2", "3", "6"].map((k) => `VF.DCM - S${k}.13`), "S1.14 - VF.MI1", "S2.14 - VF.MI2", "S3.14 - VF.MI3", "S6.14 - VF.MI6",
      ...extraWires,
    ],
  );
const tap = (s, key, t) => {
  s.act("VF", key, true, ms(t));
  s.act("VF", key, false, ms(t + 50));
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} != ${b}`);

test("VFD-EL plantilla multivelocidad: MI1 marcha con rampa, MI3 velocidad 1, MI2 invierte pasando por 0", () => {
  const s = vfdScene({ ...preset("multivelocidad"), "01-09": 2, "01-10": 2, pot: 50 });
  assert.equal(s.output("VF", "powered"), true);
  assert.equal(s.output("VF", "lcd"), "30.00", "F = perilla al 50 % de 60 Hz");
  assert.equal(s.output("VF", "modo"), "F");
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(500));
  near(s.output("VF", "hz"), 15, "rampa 0-60 Hz en 2 s");
  near(s.output("M", "speed"), 0.25, "el motor sigue a la frecuencia");
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 30);
  s.act("S3", "press", true, ms(2000));
  s.advanceTo(ms(4000));
  assert.equal(s.output("VF", "hz"), 10, "05-00 = 10 Hz");
  s.act("S1", "press", false, ms(4000));
  s.act("S2", "press", true, ms(4000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("VF", "hz"), -10);
  assert.equal(s.output("M", "direction"), -1);
  assert.equal(s.output("VF", "ledRev"), true);
  assert.deepEqual(faults(s), []);
});

test("VFD-EL de fábrica: AVI sin modelar da 0 Hz; se programa 02-00 = 4 con el teclado y queda en la escena", () => {
  const s = vfdScene({ pot: 100, "01-09": 1, "01-10": 1 });
  assert.match(s.output("VF", "aviso"), /AVI/);
  tap(s, "run", 0);
  s.advanceTo(ms(1000));
  assert.equal(s.output("VF", "hz"), 0);
  assert.equal(s.output("VF", "running"), true, "en marcha a 0 Hz");
  tap(s, "stop", 1000);
  // MODE: F → H → Frd → grupos ("00-"); ▲▲ → "02-"; ENTER → "02-00"; ENTER → valor.
  for (const [i, k] of ["mode", "mode", "mode"].entries()) tap(s, k, 1100 + i * 100);
  assert.equal(s.output("VF", "lcd"), "00-");
  tap(s, "up", 1400);
  tap(s, "up", 1500);
  assert.equal(s.output("VF", "lcd"), "02-");
  tap(s, "enter", 1600);
  assert.equal(s.output("VF", "lcd"), "02-00");
  tap(s, "enter", 1700);
  assert.equal(s.output("VF", "lcd"), "1");
  for (let i = 0; i < 3; i++) tap(s, "up", 1800 + i * 100);
  assert.equal(s.output("VF", "lcd"), "4");
  tap(s, "enter", 2200);
  assert.equal(s.output("VF", "lcd"), "End");
  s.advanceTo(ms(3300));
  assert.equal(s.output("VF", "lcd"), "02-00");
  const saved = s.snapshot().devices.find((d) => d.id === "VF").params;
  assert.equal(saved["02-00"], "4: perilla del teclado");
  assert.equal(saved["01-09"], 1);
  // MODE vuelve a los grupos y a F; RUN arranca a la frecuencia de la perilla.
  tap(s, "mode", 3400);
  tap(s, "mode", 3500);
  assert.equal(s.output("VF", "lcd"), "60.00");
  tap(s, "run", 3600);
  s.advanceTo(ms(5000));
  assert.equal(s.output("VF", "hz"), 60);
  assert.equal(s.output("VF", "aviso"), "");
});

test("VFD-EL: ▲ sostenido repite y acelera el cambio de un valor", () => {
  const s = vfdScene({});
  for (let i = 0; i < 3; i++) tap(s, "mode", i * 100);
  tap(s, "up", 300);                 // "01-"
  tap(s, "enter", 400);              // "01-00"
  for (let i = 0; i < 3; i++) tap(s, "up", 500 + i * 100);  // 01-09 (índice 3: 00, 01, 02, 09)
  assert.equal(s.output("VF", "lcd"), "01-09");
  tap(s, "enter", 800);
  assert.equal(s.output("VF", "lcd"), "10.0");
  s.act("VF", "up", true, ms(1000));
  assert.equal(s.output("VF", "lcd"), "10.1");
  s.advanceTo(ms(1400));
  assert.equal(s.output("VF", "lcd"), "10.1", "espera 0,5 s antes de repetir");
  s.advanceTo(ms(2400));
  // Repite cada 0,1 s desde 1,5 s: 10 pasos de 0,1 → 11,1; con más de 1,5 s
  // sostenida, de a 1,0 (2,5 s: 11,2; 2,6 s: 12,2; 2,7 s: 13,2).
  assert.equal(s.output("VF", "lcd"), "11.1");
  s.advanceTo(ms(2700));
  assert.equal(s.output("VF", "lcd"), "13.2");
  s.act("VF", "up", false, ms(2700));
  s.advanceTo(ms(3000));
  assert.equal(s.output("VF", "lcd"), "13.2");
  tap(s, "mode", 3000);              // sale sin guardar
  assert.equal(s.output("VF", "lcd"), "01-09");
  tap(s, "enter", 3100);
  assert.equal(s.output("VF", "lcd"), "10.0");
});

test("VFD-EL: falla externa EF (MI6 = 14) corta la salida, relé de falla, STOP/RESET rearma y pide nueva marcha", () => {
  const s = vfdScene({ ...preset("bornes"), "04-08": "14: falla externa (EF)", pot: 100, "01-09": 1, "01-10": 1 }, [], ["N.L - VF.RC", "VF.RA - H.X1", "H.X2 - N.N"]);
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 60);
  assert.equal(s.output("H", "lit"), false);
  s.act("S6", "press", true, ms(2000));
  assert.equal(s.output("VF", "fault"), "EF");
  assert.equal(s.output("VF", "lcd"), "EF");
  assert.equal(s.output("VF", "running"), false);
  assert.equal(s.output("H", "lit"), true, "RA-RC cierra con falla (03-00 = 8)");
  s.advanceTo(ms(5000));
  assert.ok(s.output("M", "speed") < 1, "el motor frena por inercia");
  // RESET con la causa presente: sigue en falla.
  tap(s, "stop", 5000);
  assert.equal(s.output("VF", "fault"), "EF");
  s.act("S6", "press", false, ms(5200));
  tap(s, "stop", 5300);
  assert.equal(s.output("VF", "fault"), "");
  s.advanceTo(ms(7000));
  assert.equal(s.output("VF", "hz"), 0, "con MI1 aún cerrado no rearranca solo");
  s.act("S1", "press", false, ms(7000));
  s.act("S1", "press", true, ms(7100));
  s.advanceTo(ms(9000));
  assert.equal(s.output("VF", "hz"), 60);
});

test("VFD-EL 3 hilos: MI1 marcha con un pulso, MI3 (NC) para", () => {
  const s = scene(
    ["N:power-230vac", VFD({ ...preset("tres-hilos"), pot: 50, "01-09": 1, "01-10": 1 }), "M:motor-3ph", "S1:pushbutton-no", "S0:pushbutton-nc"],
    ["N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1", "VF.DCM - S1.13", "S1.14 - VF.MI1", "VF.DCM - S0.11", "S0.12 - VF.MI3"],
  );
  tap(s, "run", 0);  // el teclado no manda con 02-01 = 1
  s.act("S1", "press", true, ms(100));
  s.act("S1", "press", false, ms(300));
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 30);
  s.act("S0", "press", true, ms(2000));
  s.act("S0", "press", false, ms(2200));
  s.advanceTo(ms(4000));
  assert.equal(s.output("VF", "hz"), 0);
  assert.equal(s.output("VF", "running"), false);
});

test("VFD-EL por Modbus RTU: parámetros 0GNNh, 2001h frecuencia, 2000h marcha y sentido, 2103h", () => {
  const s = scene(
    ["N:power-230vac", VFD({ ...preset("modbus"), "09-00": 3 }), "M:motor-3ph", "plc:jwplc-basic"],
    ["N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1", "plc.RS485_A - VF.SG+", "plc.RS485_B - VF.SG-"],
  );
  const req = (bytes, t) => s.modbusRequest(withCrc(bytes), { t: ms(t), baud: 9600 });
  // 01-09 = 2,0 s y 01-10 = 1,0 s (décimas); se lee 02-00 = 3.
  assert.ok(req([3, 6, 0x01, 0x09, 0x00, 20], 0));
  assert.ok(req([3, 6, 0x01, 0x0a, 0x00, 10], 5));
  assert.deepEqual(req([3, 3, 0x02, 0x00, 0x00, 0x01], 8).bytes.slice(0, 5), [3, 3, 2, 0, 3]);
  // 2001h = 45,00 Hz y 2000h = marcha + adelante (0x12).
  assert.ok(req([3, 6, 0x20, 0x01, 0x11, 0x94], 10));
  assert.ok(req([3, 6, 0x20, 0x00, 0x00, 0x12], 20));
  s.advanceTo(ms(3000));
  assert.equal(s.output("VF", "hz"), 45);
  assert.deepEqual(req([3, 3, 0x21, 0x03, 0x00, 0x01], 3000).bytes.slice(0, 5), [3, 3, 2, 0x11, 0x94], "2103h = 4500");
  const st = req([3, 3, 0x21, 0x01, 0x00, 0x01], 3000).bytes;
  assert.equal(((st[3] << 8) | st[4]) & 0b11, 0b11, "2101h: en marcha");
  req([3, 6, 0x20, 0x00, 0x00, 0x22], 3000);
  s.advanceTo(ms(7000));
  assert.equal(s.output("VF", "hz"), -45);
  req([3, 6, 0x20, 0x00, 0x00, 0x01], 7000);
  s.advanceTo(ms(9000));
  assert.equal(s.output("VF", "hz"), 0);
  assert.equal(s.snapshot().devices.find((d) => d.id === "VF").params["01-09"], 2, "lo escrito por Modbus queda en la escena");
  // Parámetro inexistente o fuera de rango: excepción.
  assert.equal(req([3, 6, 0x10, 0x00, 0x00, 0x01], 9000).bytes[1], 0x86);
  assert.equal(req([3, 6, 0x01, 0x09, 0x00, 0x00], 9000).bytes[1], 0x86, "01-09 = 0,0 s fuera de rango");
  // En ASCII (09-04 = 0) no contesta a tramas RTU.
  assert.ok(req([3, 6, 0x09, 0x04, 0x00, 0x00], 9100));
  assert.ok(!req([3, 3, 0x21, 0x00, 0x00, 0x01], 9200)?.bytes?.length);
});
