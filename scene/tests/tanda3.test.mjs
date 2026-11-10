// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Catálogo, tanda 3: módulo de E/S remotas (funciones de bits 01, 02, 05 y
// 15), medidor de energía PZEM-016 y controlador de temperatura RS-485.
// node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { crc16, withCrc } from "../modbus.mjs";
import { ms, scene } from "./helpers.mjs";

const req = (addr, fn, a, b) => withCrc([addr, fn, a >> 8, a & 255, b >> 8, b & 255]);
const words = (r) => Array.from({ length: r.bytes[2] / 2 }, (_, k) => (r.bytes[3 + 2 * k] << 8) | r.bytes[4 + 2 * k]);
const at = (msT) => ({ t: ms(msT), baud: 9600 });
const PLC = ["plc:jwplc-basic", "PS:power-24vdc"];
const PLC_W = ["PS.+V1 - plc.24VDC", "PS.-V1 - plc.M0"];

// Módulo de E/S (dir. 3): DI3 con un selector, DO1 enciende una lámpara.
const ioScene = () =>
  scene(
    [...PLC, "IO:remote-io", "S:selector-2", "H:lamp"],
    [
      ...PLC_W,
      "PS.+V1 - IO.+", "IO.- - PS.-V1", "plc.RS485_A - IO.A", "plc.RS485_B - IO.B",
      "IO.DC - PS.-V1", "PS.+V1 - S.13", "S.14 - IO.DI3",
      "PS.+V2 - IO.C1", "IO.DO1 - H.X1", "H.X2 - PS.-V2",
    ],
  );

test("E/S remotas: 05 escribe una bobina (relé DO1) y 01 la lee", () => {
  const s = ioScene();
  const r = s.modbusRequest(req(3, 5, 0, 0xff00), at(10));
  assert.deepEqual(r.bytes.slice(0, 6), [3, 5, 0, 0, 0xff, 0], "eco de la escritura");
  assert.equal(crc16(r.bytes.slice(0, -2)), r.bytes.at(-2) | (r.bytes.at(-1) << 8));
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.output("IO", "do1"), true);
  assert.deepEqual(s.modbusRequest(req(3, 1, 0, 8), at(20)).bytes.slice(0, 4), [3, 1, 1, 0b00000001]);
  s.modbusRequest(req(3, 5, 0, 0), at(30));
  assert.equal(s.output("H", "lit"), false);
});

test("E/S remotas: 15 escribe varias bobinas, 02 lee las entradas y los registros dan las máscaras", () => {
  const s = ioScene();
  // DO1, DO3 y DO8: 1000 0101 = 0x85.
  const r = s.modbusRequest(withCrc([3, 15, 0, 0, 0, 8, 1, 0x85]), at(10));
  assert.deepEqual(r.bytes.slice(0, 6), [3, 15, 0, 0, 0, 8]);
  assert.equal(s.output("IO", "salidas"), 0x85);
  assert.deepEqual(words(s.modbusRequest(req(3, 3, 0, 1), at(20))), [0x85]);
  // DI3 con el selector en I.
  assert.deepEqual(s.modbusRequest(req(3, 2, 0, 8), at(30)).bytes.slice(0, 4), [3, 2, 1, 0]);
  s.act("S", "position", 1, ms(40));
  assert.deepEqual(s.modbusRequest(req(3, 2, 0, 8), at(50)).bytes.slice(0, 4), [3, 2, 1, 0b100]);
  assert.deepEqual(words(s.modbusRequest(req(3, 4, 0, 1), at(60))), [0b100]);
  // 06 en el registro de salidas.
  s.modbusRequest(req(3, 6, 0, 0b10), at(70));
  assert.equal(s.output("IO", "do2"), true);
  assert.equal(s.output("H", "lit"), false);
});

test("E/S remotas: excepciones (bobina inexistente 02, valor de 05 inválido 03) y sin alimentación no responde", () => {
  const s = ioScene();
  assert.deepEqual(s.modbusRequest(req(3, 1, 4, 8), at(10)).bytes.slice(0, 3), [3, 0x81, 2]);
  assert.deepEqual(s.modbusRequest(req(3, 5, 0, 0x1234), at(20)).bytes.slice(0, 3), [3, 0x85, 3]);
  const off = scene([...PLC, "IO:remote-io"], [...PLC_W, "plc.RS485_A - IO.A", "plc.RS485_B - IO.B"]);
  assert.equal(off.modbusRequest(req(3, 1, 0, 8), at(10)), null);
});

test("transmisor PT100: las funciones de bits no admitidas dan la excepción 01", () => {
  const s = scene(
    [...PLC, { id: "TT", type: "jwsim/pt100-rs485", params: { sonda: "simulada" } }],
    [...PLC_W, "PS.+V1 - TT.+", "TT.- - PS.-V1", "plc.RS485_A - TT.A", "plc.RS485_B - TT.B"],
  );
  assert.deepEqual(s.modbusRequest(req(1, 1, 0, 1), at(10)).bytes.slice(0, 3), [1, 0x81, 1]);
});

// Medidor (dir. 1): red de 230 VAC, la fase pasa por su TC hacia un motor monofásico.
const meterScene = (params = {}) =>
  scene(
    [...PLC, "R:power-230vac", { id: "PM", type: "jwsim/energy-meter", params }, { id: "M", type: "jwsim/motor-1ph", params: { In: 5, carga: 100 } }],
    [...PLC_W, "R.L - PM.L", "R.N - PM.N", "plc.RS485_A - PM.A", "plc.RS485_B - PM.B", "R.L - PM.CT1", "PM.CT2 - M.U1", "M.U2 - R.N"],
  );

test("medidor PZEM-016: tensión, corriente, potencia, frecuencia y fp en los registros input", () => {
  const s = meterScene({ fp: 0.8 });
  s.advanceTo(ms(5000));
  const I = s.output("M", "corriente");
  assert.ok(I > 0, "el motor informa corriente");
  const w = words(s.modbusRequest(req(1, 4, 0, 10), at(5000)));
  assert.equal(w[0], 2300);
  assert.equal(w[1] | (w[2] << 16), Math.round(I * 1000));
  assert.equal(w[3] | (w[4] << 16), Math.round(230 * I * 0.8 * 10));
  assert.equal(w[7], 600);
  assert.equal(w[8], 80);
  assert.equal(w[9], 0);
});

test("medidor PZEM-016: integra la energía en el tiempo; alarma por umbral; sin tensión no responde", () => {
  const s = meterScene({ fp: 1, kwh0: 1, alarmaW: 100 });
  s.advanceTo(ms(10_000));
  const P = 230 * s.output("M", "corriente");
  const w0 = words(s.modbusRequest(req(1, 4, 5, 2), at(10_000)));
  const e0 = w0[0] | (w0[1] << 16);
  const w1 = words(s.modbusRequest(req(1, 4, 5, 2), at(3_610_000)));
  const e1 = w1[0] | (w1[1] << 16);
  assert.ok(Math.abs(e1 - e0 - P) <= 1, `una hora a ${P} W: ${e1 - e0} Wh`);
  assert.ok(e0 >= 1000, "parte de la energía inicial (1 kWh)");
  assert.deepEqual(words(s.modbusRequest(req(1, 4, 9, 1), at(3_610_100))), [0xffff]);
  s.modbusRequest(req(1, 6, 1, 60000), at(3_610_200));
  assert.deepEqual(words(s.modbusRequest(req(1, 4, 9, 1), at(3_610_300))), [0]);
  const dead = scene([...PLC, "PM:energy-meter"], [...PLC_W, "plc.RS485_A - PM.A", "plc.RS485_B - PM.B"]);
  assert.equal(dead.modbusRequest(req(1, 4, 0, 1), at(10)), null);
});

// Controlador (dir. 4) alimentado a 24 VDC, salida 11-14 a una lámpara.
const tcScene = (params = {}) =>
  scene(
    [...PLC, { id: "TC", type: "jwsim/temp-controller", params: { coil: "24VDC", temp: 25, sv: 40, hist: 2, ...params } }, "H:lamp", { id: "HA", type: "jwsim/lamp", params: { color: "rojo" } }],
    [...PLC_W, "PS.+V1 - TC.L", "TC.N - PS.-V1", "plc.RS485_A - TC.A", "plc.RS485_B - TC.B", "PS.+V2 - TC.11", "TC.14 - H.X1", "H.X2 - PS.-V2", "PS.+V2 - TC.21", "TC.24 - HA.X1", "HA.X2 - PS.-V2"],
  );

test("controlador de temperatura: ON-OFF con histéresis al calentar; PV y estado por Modbus", () => {
  const s = tcScene();
  assert.equal(s.output("H", "lit"), true, "25 °C < 38 °C: calienta");
  s.act("TC", "temp", 40, ms(10));
  assert.equal(s.output("H", "lit"), false);
  s.act("TC", "temp", 38.5, ms(20));
  assert.equal(s.output("H", "lit"), false, "dentro de la histéresis");
  s.act("TC", "temp", 38, ms(30));
  assert.equal(s.output("H", "lit"), true);
  assert.deepEqual(words(s.modbusRequest(req(4, 4, 0, 2), at(40))), [380, 1]);
  assert.deepEqual(words(s.modbusRequest(req(4, 3, 0, 4), at(50))), [400, 20, 0, 100]);
  // Alarma: PV ≥ SV + 10.
  s.act("TC", "temp", 51, ms(60));
  assert.equal(s.output("HA", "lit"), true);
  assert.equal(s.output("TC", "pvTxt"), "51.0");
});

test("controlador de temperatura: SV y modo escritos por Modbus (06 y 16)", () => {
  const s = tcScene({ temp: 30 });
  s.modbusRequest(req(4, 6, 0, 250), at(10));
  assert.equal(s.output("TC", "sv"), 25);
  assert.equal(s.output("H", "lit"), false, "30 °C > 25 °C: no calienta");
  // Enfriar (modo 1) con histéresis de 1 °C: 30 ≥ 26 → enciende.
  s.modbusRequest(withCrc([4, 16, 0, 1, 0, 2, 4, 0, 10, 0, 1]), at(20));
  assert.equal(s.output("H", "lit"), true);
  assert.deepEqual(s.modbusRequest(req(4, 6, 2, 7), at(30)).bytes.slice(0, 3), [4, 0x86, 3]);
});

test("controlador de temperatura con la PT100 del fermentador cableada; sin sonda, «oPEn» y alarma", () => {
  const s = scene(
    [...PLC, { id: "TC", type: "jwsim/temp-controller", params: { coil: "24VDC", sonda: "cableada" } }, "F1:fermentador"],
    [...PLC_W, "PS.+V1 - TC.L", "TC.N - PS.-V1", "F1.TT_R1 - TC.R1", "F1.TT_R2 - TC.R2", "F1.TT_R3 - TC.R3"],
  );
  assert.equal(s.output("TC", "pv"), Math.round(s.output("F1", "tMasa") * 10) / 10);
  const open = scene([...PLC, { id: "TC", type: "jwsim/temp-controller", params: { coil: "24VDC", sonda: "cableada" } }], [...PLC_W, "PS.+V1 - TC.L", "TC.N - PS.-V1"]);
  assert.equal(open.output("TC", "pvTxt"), "oPEn");
  assert.equal(open.output("TC", "alarma"), true);
  assert.equal(open.output("TC", "salida"), false);
});
