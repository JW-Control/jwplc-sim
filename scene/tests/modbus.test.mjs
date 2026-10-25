// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Emulación de planta (G9): esclavos Modbus RTU de la escena y fermentador.
// node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { crc16, ModbusLink, withCrc } from "../modbus.mjs";
import { ms, scene } from "./helpers.mjs";

// PLC alimentado + transmisor PT100 (dir. 1) y de pH (dir. 2) en el bus.
const bus = (extra = [], wiring = []) =>
  scene(
    [
      "plc:jwplc-basic",
      "PS:power-24vdc",
      { id: "TT1", type: "jwsim/pt100-rs485", params: { temp: 27.5 } },
      { id: "AT1", type: "jwsim/ph-rs485", params: { ph: 4.26, temp: 26.8 } },
      ...extra,
    ],
    [
      "PS.+V1 - plc.24VDC", "PS.-V1 - plc.M0",
      "PS.+V1 - TT1.+", "TT1.- - PS.-V1", "PS.+V1 - AT1.+", "AT1.- - PS.-V1",
      "plc.RS485_A - TT1.A", "plc.RS485_B - TT1.B", "TT1.A - AT1.A", "TT1.B - AT1.B",
      ...wiring,
    ],
  );
const read = (addr, fn, start, count) => withCrc([addr, fn, start >> 8, start & 255, count >> 8, count & 255]);
const at = { t: ms(10), baud: 9600 };
const words = (r) => {
  const n = r.bytes[2] / 2;
  return Array.from({ length: n }, (_, k) => ((r.bytes[3 + 2 * k] << 8) | r.bytes[4 + 2 * k]) << 16 >> 16);
};

test("CRC-16 Modbus: trama conocida 01 03 00 00 00 01 → 84 0A", () => {
  assert.deepEqual(withCrc([1, 3, 0, 0, 0, 1]).slice(-2), [0x84, 0x0a]);
  assert.equal(crc16([1, 3, 0, 0, 0, 1]), 0x0a84);
});

test("transmisores: PT100 (temp × 10) y pH (pH × 100, temp × 10) por 03 y 04", () => {
  const s = bus();
  const t = s.modbusRequest(read(1, 3, 0, 1), at);
  assert.deepEqual(words(t), [275]);
  assert.equal(crc16(t.bytes.slice(0, -2)), t.bytes.at(-2) | (t.bytes.at(-1) << 8), "respuesta con CRC válido");
  assert.deepEqual(words(s.modbusRequest(read(2, 4, 0, 2), at)), [426, 268]);
  assert.equal(s.modbusRequest(read(1, 3, 0, 1), at).delayNs, ms(5));
});

test("excepciones: dirección de registro inexistente (02) y función no admitida (01)", () => {
  const s = bus();
  assert.deepEqual(s.modbusRequest(read(1, 3, 5, 1), at).bytes.slice(0, 3), [1, 0x83, 2]);
  assert.deepEqual(s.modbusRequest(withCrc([1, 6, 0, 0, 0, 9]), at).bytes.slice(0, 3), [1, 0x86, 1]);
});

test("no responde: CRC malo, otra dirección, otra velocidad, sin alimentación, A/B invertidos, cable cortado o quemado", () => {
  const s = bus();
  const bad = read(1, 3, 0, 1);
  bad[7] ^= 1;
  assert.equal(s.modbusRequest(bad, at), null, "CRC");
  assert.equal(s.modbusRequest(read(9, 3, 0, 1), at), null, "dirección");
  assert.equal(s.modbusRequest(read(1, 3, 0, 1), { t: ms(10), baud: 19200 }), null, "velocidad");
  s.inject({ kind: "open", wire: "PS.+V1 TT1.+" }, ms(20));
  assert.equal(s.modbusRequest(read(1, 3, 0, 1), { t: ms(21), baud: 9600 }), null, "sin alimentación");
  assert.ok(s.modbusRequest(read(2, 3, 0, 1), { t: ms(21), baud: 9600 }), "el otro sigue");
  s.inject({ kind: "open", wire: "TT1.B AT1.B" }, ms(30));
  assert.equal(s.modbusRequest(read(2, 3, 0, 1), { t: ms(31), baud: 9600 }), null, "cable del bus cortado");
  s.inject({ kind: "burnt", device: "AT1" }, ms(40));
  s.clearFault("open:AT1.B TT1.B", ms(41));
  assert.equal(s.modbusRequest(read(2, 3, 0, 1), { t: ms(42), baud: 9600 }), null, "transmisor quemado");
  const sw = scene(
    ["plc:jwplc-basic", "PS:power-24vdc", "TT1:pt100-rs485"],
    ["PS.+V1 - TT1.+", "TT1.- - PS.-V1", "plc.RS485_A - TT1.B", "plc.RS485_B - TT1.A"],
  );
  assert.equal(sw.modbusRequest(read(1, 3, 0, 1), at), null, "A y B invertidos");
});

test("sonda abierta o en corto: 7FFFh / 8000h", () => {
  const s = bus();
  s.act("TT1", "probe", 1, ms(5));
  assert.deepEqual(words(s.modbusRequest(read(1, 3, 0, 1), at)), [32767]);
  s.act("AT1", "probe", 2, ms(6));
  assert.deepEqual(words(s.modbusRequest(read(2, 3, 0, 1), at)), [-32768]);
});

test("ModbusLink: arma la trama tras 3,5 caracteres de silencio y fecha la respuesta", () => {
  const s = bus();
  const link = new ModbusLink(s);
  const ch = 1_041_667n;  // 9600 8N1: 10 bits
  const frame = read(1, 3, 0, 1);
  const t0 = ms(100);
  link.onTx(frame.map((b, k) => [t0 + BigInt(k) * ch, t0 + BigInt(k + 1) * ch, b]));
  const end = t0 + 8n * ch;
  assert.equal(link.nextEvent(), end + (ch * 35n) / 10n);
  assert.deepEqual(link.poll(end), [], "todavía no terminó");
  const out = link.poll(link.nextEvent());
  assert.equal(out.length, 7);
  assert.equal(out[0][0], end + (ch * 35n) / 10n + ms(5) + ch, "llega tras la demora del esclavo");
  assert.deepEqual(out.map(([, b]) => b).slice(0, 5), [1, 3, 2, 1, 19]);
});

test("transmisor que sigue la temperatura del fermentador", () => {
  const s = scene(
    ["plc:jwplc-basic", "PS:power-24vdc", { id: "FER1", type: "jwsim/fermentador", params: { tInicial: 23.4, valvula: "", bombaRetorno: "", bombaMosto: "" } },
      { id: "TT1", type: "jwsim/pt100-rs485", params: { source: "FER1.tMasa" } }],
    ["PS.+V1 - TT1.+", "TT1.- - PS.-V1", "plc.RS485_A - TT1.A", "plc.RS485_B - TT1.B"],
  );
  assert.deepEqual(words(s.modbusRequest(read(1, 3, 0, 1), at)), [234]);
});

// Fermentador con su válvula (electroválvula Y1) y bombas (motores M1, M2)
// manejados a mano por pulsadores, para probar el modelo.
const fermenter = (params = {}) =>
  scene(
    ["PS:power-24vdc", "SV:pushbutton-no", "SR:pushbutton-no", "SM:pushbutton-no", "Y1:water-valve",
      { id: "M1", type: "jwsim/motor", params: { rating: "24VDC", accelMs: 100, stopMs: 100 } },
      { id: "M2", type: "jwsim/motor", params: { rating: "24VDC", accelMs: 100, stopMs: 100 } },
      { id: "FER1", type: "jwsim/fermentador", params: { terma: "fija", tTerma: 80, ...params } }],
    ["PS.+V1 - SV.13", "SV.14 - Y1.A1", "Y1.A2 - PS.-V1", "PS.+V1 - SR.13", "SR.14 - M1.U1", "M1.U2 - PS.-V1",
      "PS.+V1 - SM.13", "SM.14 - M2.U1", "M2.U2 - PS.-V1"],
  );
const min = (m) => ms(m * 60_000);

test("fermentador: la masa se calienta con flujo y se enfría sin él; flujostato con válvula y bomba", () => {
  const s = fermenter({ tInicial: 20, tAmbiente: 20 });
  s.advanceTo(min(10));
  assert.equal(s.output("FER1", "tMasa"), 20, "sin calefacción queda a la temperatura ambiente");
  s.act("SV", "press", true, min(10));
  s.act("SR", "press", true, min(10));
  s.advanceTo(min(10) + ms(2000));
  assert.equal(s.output("FER1", "flujo"), true);
  assert.equal(s.contact("FER1", "FS"), true);
  s.advanceTo(min(50));
  const hot = s.output("FER1", "tMasa");
  assert.ok(hot > 24 && hot < 30, `40 min de agua a 80 °C: ${hot} °C`);
  s.act("SV", "press", false, min(50));
  s.advanceTo(min(50) + ms(5000));
  assert.equal(s.output("FER1", "flujo"), false);
  assert.ok(s.output("FER1", "serpentin") < 1 && s.output("FER1", "serpentin") > 0, "se está vaciando");
  s.advanceTo(min(51));
  assert.equal(s.output("FER1", "serpentin"), 0, "vacío a los 20 s");
  assert.equal(s.output("FER1", "bombaEnSeco"), true, "la bomba siguió 40 s con el serpentín vacío");
  s.act("SR", "press", false, min(51));
  s.advanceTo(min(120));
  assert.ok(s.output("FER1", "tMasa") < hot, "sin calefacción se enfría");
});

test("fermentador: el pH baja con la fermentación, más rápido a 27 °C que a 20 °C", () => {
  const warm = fermenter({ tInicial: 27, tAmbiente: 27, horasFermentacion: 2 });
  const cold = fermenter({ tInicial: 20, tAmbiente: 20, horasFermentacion: 2 });
  warm.advanceTo(min(60));
  cold.advanceTo(min(60));
  const pw = warm.output("FER1", "ph");
  const pc = cold.output("FER1", "ph");
  assert.ok(pw < 4.3 && pw > 3.5, `a 27 °C en 1 h (de 2 h): pH ${pw}`);
  assert.ok(pc > pw + 0.2, `a 20 °C fermenta más lento: pH ${pc}`);
  warm.advanceTo(min(150));
  assert.ok(warm.output("FER1", "ph") <= 3.46, "cerca del mínimo al final");
});

test("fermentador: terma solar sin sol se enfría y deja de calentar", () => {
  const s = fermenter({ terma: "solar", tTerma: 40, horaInicio: 22, tInicial: 20, tAmbiente: 20 });
  s.act("SV", "press", true, 0n);
  s.act("SR", "press", true, 0n);
  s.advanceTo(min(240));
  assert.ok(s.output("FER1", "tTerma") < 35, `de noche la terma no recupera: ${s.output("FER1", "tTerma")} °C`);
  assert.ok(s.output("FER1", "tMasa") < 25, "con agua tibia la masa casi no sube");
});
