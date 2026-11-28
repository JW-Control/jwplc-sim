// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Red Ethernet de la escena en el calificador (cli/lib/cosim.mjs): la PC con
// JW Modbus Tool pregunta al JWPLC (servidor) con la red virtual, sin la PC
// (DHCP incluido). Sketch: tests/fixtures/red-modbus-tcp.
//   cd app && node --test tests/red-escena.test.mjs
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { buildSketch } from "../../cli/lib/build.mjs";
import { cosim } from "../../cli/lib/cosim.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("PC con JW Modbus Tool en el calificador: lee y escribe holding y bobinas", { timeout: 600000 }, async () => {
  const { exe } = await buildSketch(join(ROOT, "app", "tests", "fixtures", "red-modbus-tcp"), { log: () => {} });
  const scene = {
    devices: [
      { id: "plc", type: "jwsim/jwplc-basic" },
      { id: "PS1", type: "jwsim/power-24vdc" },
      { id: "PC1", type: "jwsim/pc-modbus-tcp" },
    ],
    wiring: [
      { from: "PS1.+V1", to: "plc.24VDC" },
      { from: "PS1.-V1", to: "plc.M0" },
    ],
  };
  const r = await cosim({
    exe,
    scene,
    untilNs: 14_000_000_000n,
    actions: [
      { at_ns: 10_000_000_000n, device: "PC1", action: "h4", value: 123 },
      { at_ns: 11_000_000_000n, device: "PC1", action: "c4", value: true },
    ],
    probes: [13_900_000_000n],
  });
  const o = r.snapshots.get(13_900_000_000n).devices.find((d) => d.id === "PC1").outputs;
  assert.equal(o.connected, true);
  assert.ok(o.h0 >= 12 && o.h0 <= 14, `holding 1 = ${o.h0}`);
  assert.equal(o.h1, 123);
  assert.equal(o.c0, true);
  assert.equal(o.errores, 0);
});
