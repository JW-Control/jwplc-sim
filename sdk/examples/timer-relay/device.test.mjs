// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: MIT
// Pruebas del relé temporizador: jwsim-cli device test sdk/examples/timer-relay
import assert from "node:assert/strict";
import { test } from "node:test";

import device from "./device.mjs";

const { sceneWith, ms } = await import(process.env.JWSIM_SDK);

const circuit = (params) =>
  sceneWith(
    device,
    ["PS:power-24vdc", "S:pushbutton-no", { id: "KT", type: "jwcontrol/timer-relay", params }, "H1:lamp", "H2:lamp"],
    ["PS.L+ - S.13", "S.14 - KT.A1", "KT.A2 - PS.M", "PS.L+ - KT.15", "KT.18 - H1.X1", "KT.16 - H2.X1", "H1.X2 - PS.M", "H2.X2 - PS.M"],
  );

test("a la conexión: conmuta timeMs después de energizar y cae al soltar", () => {
  const s = circuit({ mode: "on-delay", timeMs: 2000 });
  s.act("S", "press", true, ms(100));
  s.advanceTo(ms(2099));
  assert.equal(s.output("H1", "lit"), false);
  assert.equal(s.output("H2", "lit"), true);
  assert.equal(s.output("KT", "remainingMs"), 1);
  s.advanceTo(ms(2100));
  assert.equal(s.output("H1", "lit"), true);
  assert.equal(s.output("H2", "lit"), false);
  s.act("S", "press", false, ms(3000));
  assert.equal(s.output("H1", "lit"), false);
});

test("a la conexión: un pulso más corto que el tiempo no conmuta", () => {
  const s = circuit({ mode: "on-delay", timeMs: 2000 });
  s.act("S", "press", true, ms(0));
  s.act("S", "press", false, ms(1500));
  s.advanceTo(ms(5000));
  assert.equal(s.output("H1", "lit"), false);
});

test("a la desconexión: conmuta al energizar y cae timeMs después de soltar", () => {
  const s = circuit({ mode: "off-delay", timeMs: 500 });
  s.act("S", "press", true, ms(0));
  assert.equal(s.output("H1", "lit"), true);
  s.act("S", "press", false, ms(100));
  s.advanceTo(ms(599));
  assert.equal(s.output("H1", "lit"), true);
  s.advanceTo(ms(600));
  assert.equal(s.output("H1", "lit"), false);
});

test("bobina de 24 VDC en 230 VAC: se quema", () => {
  const s = sceneWith(device, ["L:power-230vac", "KT:jwcontrol/timer-relay"], ["L.L - KT.A1", "KT.A2 - L.N"]);
  assert.deepEqual(s.snapshot().faults.map((f) => f.type), ["overvoltage"]);
});
