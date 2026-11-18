// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Montacargas: la cabina sigue al motor y acciona los finales de piso y de sobrerrecorrido.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

test("montacargas: sube a 0,3 m/s, acciona el final del piso 1 y el de sobrerrecorrido arriba", () => {
  const s = scene(
    [
      "R:power-3ph",
      { id: "M1", type: "jwsim/motor-3ph", params: { accelMs: 1, stopMs: 1 } },
      { id: "CAB1", type: "jwsim/lift", params: { motor: "M1.speed", entrePisos: 3, velocidad: 0.3 } },
      { id: "SQ1", type: "jwsim/limit-switch", params: { source: "CAB1.altura", min: 2.98, max: 3.02 } },
      { id: "SQS", type: "jwsim/limit-switch", params: { source: "CAB1.altura", min: 6.15, max: 99 } },
    ],
    ["R.L1 - M1.U1", "R.L2 - M1.V1", "R.L3 - M1.W1"],
  );
  s.advanceTo(ms(10000));
  assert.ok(Math.abs(s.output("CAB1", "altura") - 3) < 0.01, `altura ${s.output("CAB1", "altura")}`);
  assert.equal(s.output("SQ1", "actuated"), true);
  assert.equal(s.output("CAB1", "enPiso"), 1);
  s.advanceTo(ms(21000));
  assert.equal(s.output("SQS", "actuated"), true, "pasó el último piso");
  s.advanceTo(ms(30000));
  assert.equal(s.output("CAB1", "tope"), true, "contra el tope");
  s.act("CAB1", "puerta1", true, ms(30000));
  assert.equal(s.output("CAB1", "puertasCerradas"), false);
});
