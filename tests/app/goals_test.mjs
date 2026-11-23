// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Objetivos en vivo (app/lib/goals.mjs): lectura de señales, permanencia,
// orden con "after", extras y reinicio con una corrida nueva.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { checkGoals, GoalTracker, matches, readSignal } from "../../app/lib/goals.mjs";

const ms = (x) => BigInt(x) * 1_000_000n;
const snap = (t, { km = false, i0 = 0, q0 = false, level = 0 } = {}) => ({
  t: ms(t),
  inputs: { I0_0: i0 },
  devices: [
    { id: "PLC", type: "jwsim/jwplc-basic", outputs: {}, contacts: { Q0_0: q0 } },
    { id: "KM1", type: "jwsim/contactor", outputs: { closed: km }, contacts: { "13-14": km } },
    { id: "T1", type: "jwsim/tank", outputs: { level } },
  ],
});

test("lee entradas, relés de salida y salidas o contactos de equipos", () => {
  const s = snap(0, { km: true, i0: 1, q0: true, level: 70 });
  assert.equal(readSignal(s, "I0_0"), 1);
  assert.equal(readSignal(s, "Q0_0"), true);
  assert.equal(readSignal(s, "KM1.closed"), true);
  assert.equal(readSignal(s, "KM1.13-14"), true);
  assert.equal(readSignal(s, "T1.level"), 70);
  assert.equal(readSignal(s, "X9.closed"), undefined);
});

test("igualdad con booleanos y rangos cerrados", () => {
  assert.ok(matches(true, 1) && matches(0, false) && matches(70, [60, 80]) && matches(80, [60, 80]));
  assert.ok(!matches(81, [60, 80]) && !matches(undefined, 0));
});

test("la barra se llena con la permanencia y se vacía si se corta", () => {
  const tr = new GoalTracker([{ id: "a", description: "KM1 cerrado 2 s", when: { "KM1.closed": true }, hold_ms: 2000 }]);
  assert.equal(tr.update(snap(0)).goals[0].state, "pending");
  assert.equal(tr.update(snap(100, { km: true })).goals[0].state, "active");
  assert.equal(tr.update(snap(1100, { km: true })).goals[0].fraction, 0.5);
  assert.equal(tr.update(snap(1200)).goals[0].fraction, 0);
  tr.update(snap(1300, { km: true }));
  const p = tr.update(snap(3300, { km: true }));
  assert.equal(p.goals[0].state, "done");
  assert.ok(p.complete);
  // Cumplido queda cumplido aunque luego se abra.
  assert.equal(tr.update(snap(3400)).goals[0].state, "done");
});

test("after: no cuenta hasta que se cumple el anterior; los extras no bloquean", () => {
  const tr = new GoalTracker([
    { id: "arranca", description: "arranca", when: { "KM1.closed": true }, hold_ms: 0 },
    { id: "para", description: "para", when: { "KM1.closed": false }, after: "arranca", hold_ms: 1000 },
    { id: "nivel", description: "nivel", when: { "T1.level": [60, 80] }, extra: "merit" },
  ]);
  let p = tr.update(snap(0));
  assert.deepEqual(p.goals.map((g) => g.state), ["pending", "blocked", "pending"]);
  p = tr.update(snap(10, { km: true }));
  assert.deepEqual(p.goals.map((g) => g.state), ["done", "pending", "pending"]);
  tr.update(snap(20));
  p = tr.update(snap(1020));
  assert.equal(p.goals[1].state, "done");
  assert.ok(p.complete, "el mérito pendiente no impide completar");
});

test("una corrida nueva (el tiempo vuelve a cero) reinicia los objetivos", () => {
  const tr = new GoalTracker([{ id: "a", description: "a", when: { "KM1.closed": true } }]);
  assert.equal(tr.update(snap(500, { km: true })).goals[0].state, "done");
  assert.equal(tr.update(snap(0)).goals[0].state, "pending");
});

test("checkGoals rechaza lo mal formado y acepta los ejercicios del repositorio", () => {
  assert.throws(() => checkGoals([{ id: "a", description: "x", when: {} }]), /al menos una señal/);
  assert.throws(() => checkGoals([{ id: "a", description: "x", when: { "T1.level": [5, 1] } }]), /\[min, max\]/);
  assert.throws(() => checkGoals([{ id: "b", description: "x", when: { I0_0: 1 }, after: "a" }]), /objetivo anterior/);
  assert.throws(() => checkGoals([{ id: "a", description: "x", when: { I0_0: 1 }, extra: "oro" }]), /merit o distinction/);
  for (const ex of ["01-marcha-parada", "09-tolva-nivel"]) {
    const r = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "JWPLC_Aprende", "extras", "retos", ex, "rubrica.json"), "utf8"));
    assert.ok(Array.isArray(r.goals) && r.goals.length, `${ex} trae objetivos en vivo`);
    checkGoals(r.goals, ex);
  }
});

test("acepta el snapshot de la sesión, con t_ms", () => {
  const tr = new GoalTracker([{ id: "a", description: "a", when: { "KM1.closed": true }, hold_ms: 1000 }]);
  const s = (t, km) => ({ ...snap(0, { km }), t: undefined, t_ms: t });
  tr.update(s(0, true));
  assert.equal(tr.update(s(500, true)).goals[0].fraction, 0.5);
  assert.equal(tr.update(s(1000, true)).goals[0].state, "done");
});

test("console: se cumple con una línea del Monitor Serie, aunque llegue en trozos", () => {
  const tr = new GoalTracker([{ id: "hola", description: "saluda", console: "^Hola, .+", why: "Serial.println envía una línea" }]);
  tr.update(snap(0));
  tr.serial("Ho", 100);
  assert.equal(tr.update(snap(150)).goals[0].state, "pending");
  tr.serial("la, taller\r\n", 200);
  const g = tr.update(snap(250)).goals[0];
  assert.equal(g.state, "done");
  assert.equal(g.reading.consola, "Hola, taller");
  assert.equal(g.why, "Serial.println envía una línea");
});

test("console con after: no cuenta las líneas de antes", () => {
  const tr = new GoalTracker([
    { id: "a", description: "a", when: { "KM1.closed": true } },
    { id: "b", description: "b", console: "listo", after: "a" },
  ]);
  tr.serial("listo\n", 10);
  assert.equal(tr.update(snap(20)).goals[1].state, "blocked");
  tr.update(snap(30, { km: true }));
  tr.serial("listo\n", 40);
  assert.equal(tr.update(snap(50, { km: true })).goals[1].state, "done");
});

test("period: la barra cuenta los ciclos buenos de una señal", () => {
  const tr = new GoalTracker([{ id: "p", description: "parpadea", period: "Q0_0", on_ms: [1900, 2100], off_ms: [400, 600], cycles: 2 }]);
  let t = 0;
  let p;
  const step = (q0, dt) => {
    p = tr.update(snap(t, { q0 }));
    t += dt;
  };
  step(false, 1000);
  for (let i = 0; i < 3; i++) {
    step(true, 2000);
    step(false, 500);
  }
  step(true, 0);
  const g = p.goals[0];
  assert.equal(g.state, "done", JSON.stringify(g));
  assert.equal(g.period, "Q0_0: encendido 1900–2100 ms, apagado 400–600 ms, 2 ciclos");
});

test("period: un ritmo equivocado no llena la barra", () => {
  const tr = new GoalTracker([{ id: "p", description: "cada 500 ms", period: "Q0_0", cycle_ms: [450, 550], cycles: 3 }]);
  let p;
  for (let i = 0; i < 10; i++) p = tr.update(snap(i * 500, { q0: i % 2 === 1 }));
  assert.notEqual(p.goals[0].state, "done");
  assert.equal(p.goals[0].fraction, 0);
  assert.equal(p.goals[0].reading.ritmo, "1000 ms");
});

test("period de consola: un número cada medio segundo", () => {
  const tr = new GoalTracker([{ id: "p", description: "cuenta", period: { console: "^\\d+$" }, cycle_ms: [450, 550], cycles: 3 }]);
  let p;
  for (let i = 0; i < 5; i++) {
    tr.serial(`${i}\n`, 1000 + i * 500);
    p = tr.update(snap(1000 + i * 500));
  }
  assert.equal(p.goals[0].state, "done");
});

test("checkGoals: console y period", () => {
  checkGoals([{ id: "a", description: "x", console: "hola" }, { id: "b", description: "y", period: "Q0_0", cycle_ms: [1, 2] }]);
  assert.throws(() => checkGoals([{ id: "a", description: "x" }]), /falta 'when', 'console' o 'period'/);
  assert.throws(() => checkGoals([{ id: "a", description: "x", console: "(" }]), /expresión regular válida/);
  assert.throws(() => checkGoals([{ id: "a", description: "x", period: "Q0_0" }]), /cycle_ms, on_ms u off_ms/);
  assert.throws(() => checkGoals([{ id: "a", description: "x", when: { I0_0: 1 }, hint: 3 }]), /'hint' es texto/);
});
