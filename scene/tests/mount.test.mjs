// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Acoples: relé térmico engrapado bajo el contactor, sin cables. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { canMount, mountLinks, mountPos } from "../mount.mjs";
import { faults, ms, scene } from "./helpers.mjs";

const KM = { id: "KM", type: "jwsim/contactor", params: { coil: "230VAC" }, x: 100, y: 40 };
const F = { id: "F", type: "jwsim/overload-relay", params: { range: "2.5-4 A", ajuste: 3.2 }, mount: "KM" };

test("acople: el térmico va bajo el contactor y sus puentes 1-3-5 entran en 2-4-6", () => {
  assert.equal(canMount(F, KM), true);
  assert.deepEqual(mountPos(F, KM), { x: 100, y: 320 });
  assert.deepEqual(mountLinks({ devices: [KM, F] }), [["F.1", "KM.2"], ["F.3", "KM.4"], ["F.5", "KM.6"]]);
  assert.equal(canMount(F, { id: "Q", type: "jwsim/breaker" }), false, "solo a un contactor");
  assert.equal(canMount(F, { ...KM, rotation: 90 }), false, "sin girar");
  assert.deepEqual(mountLinks({ devices: [{ ...F, mount: "X" }] }), [], "anfitrión inexistente: se ignora");
});

test("acople: motor por contactor y térmico acoplado, sin cables entre ellos", () => {
  const s = scene(
    ["R:power-3ph", "S:pushbutton-no", KM, F, { id: "M", type: "jwsim/motor-3ph", params: { In: 3.2, carga: 100 } }],
    ["R.L1 - S.13", "S.14 - KM.A1", "KM.A2 - R.L2", "R.L1 - KM.1", "R.L2 - KM.3", "R.L3 - KM.5",
      "F.2 - M.U1", "F.4 - M.V1", "F.6 - M.W1"],
  );
  assert.equal(s.output("M", "running"), false);
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(2000));
  assert.equal(s.output("KM", "closed"), true);
  assert.equal(s.output("M", "running"), true, "la corriente pasa por los puentes del térmico");
  assert.equal(s.output("F", "corriente"), 3.2, "el térmico mide la corriente del motor");
  assert.deepEqual(faults(s), []);
});

test("acople: sin el acople, el mismo tablero no arranca el motor", () => {
  const s = scene(
    ["R:power-3ph", "S:pushbutton-no", KM, { ...F, mount: undefined }, { id: "M", type: "jwsim/motor-3ph" }],
    ["R.L1 - S.13", "S.14 - KM.A1", "KM.A2 - R.L2", "R.L1 - KM.1", "R.L2 - KM.3", "R.L3 - KM.5",
      "F.2 - M.U1", "F.4 - M.V1", "F.6 - M.W1"],
  );
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(2000));
  assert.equal(s.output("M", "running"), false);
});
