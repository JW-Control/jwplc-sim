// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Comunicación con la PC: conversor USB a RS-485 y cable USB (Scene.hostPorts).
// node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

const conv = (params = {}) => ({ id: "U1", type: "jwsim/usb-rs485", params });
const plc = "plc:jwplc-basic";

test("conversor cableado A con A y B con B: enlace con el RS-485 en COM20, sin fallas", () => {
  const s = scene([plc, conv()], ["U1.A - plc.RS485_A", "U1.B - plc.RS485_B", "U1.GND - plc.RS485_GND"]);
  assert.deepEqual(s.hostPorts(), [{ device: "U1", type: "jwsim/usb-rs485", uart: 2, com: "COM20", echo: false, inverted: false, errorRate: 0, wiring: "ok" }]);
});

test("conversor: eco, A/B invertidos y sin terminación salen de sus parámetros", () => {
  const s = scene([plc, conv({ com: " COM7 ", eco: true, abInvertidos: true, sinTerminacion: true, tasaErrores: 5 })], ["U1.A - plc.RS485_A", "U1.B - plc.RS485_B"]);
  const [p] = s.hostPorts();
  assert.equal(p.com, "COM7");
  assert.equal(p.echo, true);
  assert.equal(p.inverted, true);
  assert.equal(p.errorRate, 0.05);
  // La tasa solo cuenta con la falla activa.
  assert.equal(scene([plc, conv({ tasaErrores: 5 })], []).hostPorts()[0].errorRate, 0);
});

test("conversor con A y B cruzados: crossed; sin un cable o con uno cortado: open", () => {
  assert.equal(scene([plc, conv()], ["U1.A - plc.RS485_B", "U1.B - plc.RS485_A"]).hostPorts()[0].wiring, "crossed");
  assert.equal(scene([plc, conv()], ["U1.A - plc.RS485_A"]).hostPorts()[0].wiring, "open");
  assert.equal(scene([plc, conv()], []).hostPorts()[0].wiring, "open");
  const s = scene([plc, conv()], ["U1.A - plc.RS485_A", "U1.B - plc.RS485_B"]);
  s.inject({ kind: "open", wire: "U1.B plc.RS485_B" }, ms(10));
  assert.equal(s.hostPorts()[0].wiring, "open");
  s.clearFault("open:U1.B plc.RS485_B", ms(20));
  assert.equal(s.hostPorts()[0].wiring, "ok");
});

test("conversor en el bus junto a un esclavo de la escena (A y B pasan por el transmisor)", () => {
  const s = scene(
    [plc, "PS:power-24vdc", "TT:pt100-rs485", conv()],
    ["plc.RS485_A - TT.A", "plc.RS485_B - TT.B", "TT.A - U1.A", "TT.B - U1.B", "PS.+V1 - TT.+", "TT.- - PS.-V1"],
  );
  assert.equal(s.hostPorts()[0].wiring, "ok");
});

test("cable USB a PC: UART0 en su COM solo si va al borne USB de la placa", () => {
  const usb = { id: "PC", type: "jwsim/usb-pc", params: { com: "COM20" } };
  assert.deepEqual(scene([plc, usb], ["PC.USB - plc.USB"]).hostPorts(), [{ device: "PC", type: "jwsim/usb-pc", uart: 0, com: "COM20", echo: false, inverted: false, errorRate: 0, wiring: "ok" }]);
  assert.equal(scene([plc, usb], []).hostPorts()[0].wiring, "open");
});

test("escena sin conversor ni cable: ningún enlace", () => {
  assert.deepEqual(scene([plc], []).hostPorts(), []);
});
