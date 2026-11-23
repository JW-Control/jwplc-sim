// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Verificaciones de ritmo (period) y de respuesta (responds) del calificador
// (cli/lib/grade.mjs), sobre trazas armadas a mano.
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkPeriod, checkResponds, evalCheck, timeline } from "../../cli/lib/grade.mjs";

const ms = (x) => BigInt(Math.round(x * 1e6));

/** Traza con cambios de señales: [[t_ms, clave, valor], …]. */
function trace(changes, until = 10_000) {
  const res = {
    t_ns: ms(until),
    inputs: [],
    scene: { events: changes.map(([t, key, value]) => ({ kind: "signal", key, t: ms(t), value })) },
  };
  return { res, tl: timeline(res) };
}

/** Parpadeo de Q0_0: encendido `on`, apagado `off`, desde `start`, n ciclos. */
function blink(on, off, n, start = 1000) {
  const out = [];
  let t = start;
  for (let i = 0; i < n; i++) {
    out.push([t, "Q0_0", 1], [t + on, "Q0_0", 0]);
    t += on + off;
  }
  return out;
}

const run = (k, changes, lines = []) => {
  const { res, tl } = trace(changes);
  return evalCheck(k, tl, res, lines.map(([t, l]) => [ms(t), l]));
};

test("period: ciclo, tramo encendido y apagado de una señal", () => {
  const k = { period: "Q0_0", on_ms: [1900, 2100], off_ms: [450, 550], cycles: 2, from_ms: 0, to_ms: 10_000 };
  assert.ok(run(k, blink(2000, 500, 4)).ok);
  const r = run(k, blink(1000, 1000, 4));
  assert.equal(r.ok, false);
  assert.match(r.detail, /se pide 1900–2100 ms/);
});

test("period: hacen falta los ciclos pedidos", () => {
  const k = { period: "Q0_0", cycle_ms: [900, 1100], cycles: 3, from_ms: 0, to_ms: 10_000 };
  assert.ok(run(k, blink(500, 500, 5)).ok);
  const r = run(k, blink(500, 500, 2));
  assert.equal(r.ok, false);
  assert.match(r.detail, /hacen falta 3/);
  // Una salida que nunca cambia no tiene ritmo.
  assert.equal(run(k, []).ok, false);
});

test("period: el arranque distinto no cuenta, solo los últimos ciclos", () => {
  const k = { period: "Q0_0", cycle_ms: [950, 1050], cycles: 2, from_ms: 0, to_ms: 10_000 };
  const changes = [[500, "Q0_0", 1], [600, "Q0_0", 0], ...blink(500, 500, 4, 2000)];
  assert.ok(run(k, changes).ok);
});

test("period: ritmo de una línea de la consola", () => {
  const k = { period: { console: "^\\d+$" }, cycle_ms: [480, 520], cycles: 3 };
  const every = (step) => Array.from({ length: 6 }, (_, i) => [1000 + i * step, String(i)]);
  assert.ok(run(k, [], every(500)).ok);
  assert.equal(run(k, [], every(1000)).ok, false);
});

test("responds: la salida sigue a la entrada dentro del plazo", () => {
  const k = { responds: { when: { I0_0: 1 }, expect: { Q0_1: 1 } }, within_ms: 50, from_ms: 0, to_ms: 10_000 };
  const ok = [[1000, "I0_0", 1], [1010, "Q0_1", 1], [1500, "I0_0", 0], [1510, "Q0_1", 0], [3000, "I0_0", 1], [3020, "Q0_1", 1]];
  const r = run(k, ok);
  assert.ok(r.ok, r.detail);
  // Un delay(1000) en el loop: la segunda vez tarda 600 ms.
  const slow = [[1000, "I0_0", 1], [1010, "Q0_1", 1], [1500, "I0_0", 0], [1510, "Q0_1", 0], [3000, "I0_0", 1], [3600, "Q0_1", 1]];
  const bad = run(k, slow);
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /a los 3000,0 ms no responde en 50 ms/);
});

test("responds: si la condición nunca ocurre, no aprueba", () => {
  const k = { responds: { when: { I0_0: 1 }, expect: { Q0_1: 1 } }, within_ms: 50 };
  const r = run(k, [[1000, "Q0_1", 1]]);
  assert.equal(r.ok, false);
  assert.match(r.detail, /no ocurrió/);
});

test("validación de period y responds", () => {
  const bad = (m) => new Error(m);
  assert.throws(() => checkPeriod({ period: "Q0_0" }, bad), /cycle_ms, on_ms u off_ms/);
  assert.throws(() => checkPeriod({ period: "Q0_0", cycle_ms: [5, 1] }, bad), /\[min, max\]/);
  assert.throws(() => checkPeriod({ period: { console: "x" }, on_ms: [1, 2] }, bad), /solo valen para una señal/);
  assert.throws(() => checkPeriod({ period: "Q0_0", cycle_ms: [1, 2], cycles: 0 }, bad), /entero/);
  checkPeriod({ period: { console: "x" }, cycle_ms: [1, 2] }, bad);
  assert.throws(() => checkResponds({ responds: { when: { I0_0: 1 } }, within_ms: 5 }, bad), /expect/);
  assert.throws(() => checkResponds({ responds: { when: { I0_0: 1 }, expect: { Q0_0: 1 } } }, bad), /within_ms/);
  checkResponds({ responds: { when: { I0_0: 1 }, expect: { Q0_0: 1 } }, within_ms: 5 }, bad);
});
