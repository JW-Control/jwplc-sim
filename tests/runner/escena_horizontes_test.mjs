// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Horizontes de la escena en el modo interactivo (sim/runner/port.cpp y
// app/lib/scene-session.mjs): "yield" corta un horizonte largo y los
// horizontes de la app se alargan con la velocidad.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { RunnerProcess } from "../../app/lib/sim-port.mjs";
import { SceneSession } from "../../app/lib/scene-session.mjs";
import { buildSketch, ROOT } from "../../cli/lib/build.mjs";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const { exe } = await buildSketch(join(ROOT, "tests", "sketches", "g7_cosim"), { log: () => {} });

function next(r, type) {
  return new Promise((res) => {
    const on = (m) => {
      if (m.type !== type) return;
      r.off("message", on);
      res(m);
    };
    r.on("message", on);
  });
}

test("yield corta el horizonte en curso en el instante actual", async () => {
  const r = new RunnerProcess();
  const hello = next(r, "hello");
  r.start(exe, ["--no-eth"]);
  await hello;
  r.send({ type: "scene", on: 1, watch: "Q0_7" });
  r.send({ type: "run", speed: 1 });
  r.send({ type: "horizon", until_ns: String(60e9) });
  await sleep(300);
  const h = next(r, "horizon");
  r.send({ type: "yield" });
  const m = await h;
  r.send({ type: "quit" });
  assert.equal(m.reason, "until");
  assert.ok(BigInt(m.t_ns) < 5_000_000_000n, `cortó en ${m.t_ns} ns`);
});

test("el horizonte de la app crece con la velocidad", () => {
  const fake = { on() {}, off() {}, send() {} };
  const s = new SceneSession(fake, { hasModbus: () => false, devices: new Map(), wires: [] }, { stepNs: 10_000_000n });
  s.setSpeed(1);
  assert.equal(s.spanNs(), 10_000_000n);
  s.setSpeed(0.5);
  assert.equal(s.spanNs(), 10_000_000n);
  s.setSpeed(10);
  assert.equal(s.spanNs(), 100_000_000n);
  s.setSpeed(0);
  assert.equal(s.spanNs(), 1_000_000_000n);
});
