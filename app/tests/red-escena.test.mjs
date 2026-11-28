// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Red Ethernet de la escena en el calificador (cli/lib/cosim.mjs): el HMI
// Modbus TCP pregunta al JWPLC (servidor) con la red virtual, sin la PC
// (DHCP incluido). Sketch: tests/fixtures/red-hmi.
//   cd app && node --test tests/red-escena.test.mjs
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { buildSketch } from "../../cli/lib/build.mjs";
import { cosim } from "../../cli/lib/cosim.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("HMI Modbus TCP en el calificador: lee, escribe y enciende pilotos", { timeout: 600000 }, async () => {
  const { exe } = await buildSketch(join(ROOT, "app", "tests", "fixtures", "red-hmi"), { log: () => {} });
  const scene = {
    devices: [
      { id: "plc", type: "jwsim/jwplc-basic" },
      { id: "PS1", type: "jwsim/power-24vdc" },
      { id: "HMI1", type: "jwsim/hmi-modbus-tcp" },
    ],
    wiring: [
      { from: "PS1.+V1", to: "plc.24VDC" },
      { from: "PS1.-V1", to: "plc.M0" },
      { from: "PS1.+V2", to: "HMI1.+" },
      { from: "PS1.-V2", to: "HMI1.-" },
    ],
  };
  const r = await cosim({
    exe,
    scene,
    untilNs: 14_000_000_000n,
    actions: [
      { at_ns: 10_000_000_000n, device: "HMI1", action: "consigna", value: 123 },
      { at_ns: 11_000_000_000n, device: "HMI1", action: "b1", value: 1 },
    ],
    probes: [13_900_000_000n],
  });
  const o = r.snapshots.get(13_900_000_000n).devices.find((d) => d.id === "HMI1").outputs;
  assert.equal(o.connected, true);
  assert.ok(o.v1 >= 12 && o.v1 <= 14, `V1 = ${o.v1}`);
  assert.equal(o.v2, 123);
  assert.equal(o.l1, true);
  assert.equal(o.errores, 0);
});
