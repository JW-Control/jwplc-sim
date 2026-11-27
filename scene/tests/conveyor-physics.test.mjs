// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Física de cajas sobre la cinta (scene/physics/cargo-line.mjs) contra las
// fórmulas cerradas que valida Open Industry Project
// (src/sim/physicsFidelity.test.ts): alcance a μ·g, arrastre sin deslizar,
// acumulación contra un tope. Y el caso medido con OIP el 18/11/2026: con
// frenado de 0,5 s a 2 m/s, una caja detenida en la fotocelda queda pasada.
// node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { CargoLine, G } from "../physics/cargo-line.mjs";

const run = (line, seconds) => {
  for (let i = 0; i < Math.round(seconds * line.hz); i++) line.step();
};
const near = (got, want, rel, msg) => assert.ok(Math.abs(got - want) <= Math.abs(want) * rel, `${msg}: ${got} (esperado ${want} ±${rel * 100} %)`);

test("alcance: la caja quieta acelera a μ·g hasta la velocidad de la cinta", () => {
  const mu = 0.5;
  const v = 2;
  const line = new CargoLine({ length: 20, vNominal: v });
  line.add({ x: 0.5, mu });
  line.command(1);
  const tCatch = v / (mu * G); // 0,408 s
  // A mitad de camino: v = μ·g·t (error < 1 %).
  run(line, 0.2);
  near(line.boxes[0].v, mu * G * 0.2, 0.01, "velocidad a 0,2 s");
  // Paso a paso hasta que la alcanza: en t = v / (μ g), con un paso de margen.
  let steps = Math.round(0.2 * line.hz);
  while (line.boxes[0].v < v) {
    line.step();
    steps++;
  }
  assert.ok(Math.abs(steps / line.hz - tCatch) <= 1 / line.hz, `alcanza a ${steps / line.hz} s (esperado ${tCatch})`);
  // Recorrido: v² / (2 μ g), más lo que avanza a v en la fracción del último paso.
  const extra = v * (steps / line.hz - tCatch);
  near(line.boxes[0].x - 0.5, (v * v) / (2 * mu * G) + extra, 0.01, "recorrido hasta alcanzarla");
});

test("arrastre: con la velocidad de la cinta viaja pegada, sin deslizar", () => {
  const line = new CargoLine({ length: 50, vNominal: 1.5 });
  line.add({ x: 1, v: 1.5 });
  line.command(1);
  run(line, 10);
  near(line.boxes[0].x, 1 + 15, 1e-9, "posición a 10 s");
  assert.equal(line.boxes[0].v, 1.5);
});

test("frenado de la cinta más rápido que μ·g: la caja resbala y frena a μ·g", () => {
  const mu = 0.3;
  const line = new CargoLine({ length: 50, vNominal: 2 });
  line.add({ x: 1, v: 2, mu });
  line.command(1);
  run(line, 0.1);
  line.command(0); // la cinta para en seco
  const x0 = line.boxes[0].x;
  run(line, 2);
  assert.equal(line.boxes[0].v, 0);
  near(line.boxes[0].x - x0, (2 * 2) / (2 * mu * G), 0.02, "deslizamiento v²/(2μg)");
});

test("rampa de frenado: la caja pegada recorre v·t/2 mientras la cinta frena (lo medido con OIP)", () => {
  // Cinta de OIP: 2 m/s, frenado 0,5 s. μ·g (4,9 m/s²) > 4 m/s² de la rampa:
  // la caja no resbala, frena con la cinta y recorre 2 · 0,5 / 2 = 0,5 m.
  const line = new CargoLine({ length: 50, vNominal: 2, accelTime: 0.5, decelTime: 0.5 });
  line.add({ x: 1, v: 2 });
  line.vBelt = 2;
  line.command(1);
  line.command(0);
  const x0 = line.boxes[0].x;
  run(line, 1);
  assert.equal(line.vBelt, 0);
  assert.equal(line.boxes[0].v, 0);
  near(line.boxes[0].x - x0, 0.5, 0.02, "recorrido durante la rampa");
});

test("acumulación: una fila de cajas queda en línea contra el tope, sin encimarse", () => {
  const line = new CargoLine({ length: 6, vNominal: 0.5, stop: 4 });
  for (const x of [0.2, 0.7, 1.2, 1.7]) assert.ok(line.add({ x, len: 0.3 }));
  line.command(1);
  run(line, 20);
  const xs = line.boxes.map((b) => Math.round(b.x * 1000) / 1000);
  assert.deepEqual(xs, [2.95, 3.25, 3.55, 3.85]);
  assert.ok(line.boxes.every((b) => b.v === 0));
  assert.equal(line.dischargedEnd, 0);
});

test("choque inelástico: conserva el momento y no hay rebote", () => {
  const line = new CargoLine({ length: 20, vNominal: 1 });
  line.add({ x: 1, v: 2, mass: 1, mu: 0 });
  line.add({ x: 1.5, v: 0, mass: 3, mu: 0 });
  run(line, 1);
  const [a, b] = line.boxes;
  assert.equal(a.v, b.v);
  near(a.v, 0.5, 1e-9, "velocidad común (1·2 + 3·0) / 4");
  assert.ok(b.x - a.x >= 0.2 - 1e-9);
});

test("cae al pasar el extremo con su centro de masa", () => {
  const line = new CargoLine({ length: 2, vNominal: 1 });
  line.add({ x: 1.85, v: 1 });
  line.command(1);
  run(line, 0.1);
  assert.equal(line.boxes.length, 1); // centro en 1,95
  run(line, 0.1);
  assert.equal(line.boxes.length, 0);
  assert.equal(line.dischargedEnd, 1);
});

test("fotocelda por haz: tapa mientras la caja cruza el punto", () => {
  const line = new CargoLine({ length: 5, vNominal: 1 });
  line.add({ x: 1, v: 1, len: 0.4 });
  assert.equal(line.covers(1.3), false);
  line.command(1);
  run(line, 0.1); // borde delantero en 1,3
  assert.equal(line.covers(1.3), true);
  run(line, 0.5);
  assert.equal(line.covers(1.3), false);
});

test("determinista: dos corridas iguales dan las mismas posiciones", () => {
  const go = () => {
    const line = new CargoLine({ length: 6, vNominal: 1.2, accelTime: 0.4, decelTime: 0.7, stop: 5 });
    for (const x of [0.2, 0.9, 1.4]) line.add({ x, len: 0.35, mu: 0.45, mass: 2 });
    for (let k = 0; k < 600; k++) {
      line.command(k % 200 < 140 ? 1 : 0);
      line.step();
    }
    return line.boxes.map((b) => [b.x, b.v]);
  };
  assert.deepEqual(go(), go());
});

// ---- El dispositivo en una escena: motor, cinta con física y sensores enlazados.
import { faults, ms, scene } from "./helpers.mjs";

const plant = (params, motor = {}) =>
  scene(
    ["N:power-230vac", "S:pushbutton-no", { id: "M1", type: "jwsim/motor", params: { accelMs: 500, stopMs: 500, ...motor } },
      { id: "C1", type: "jwsim/conveyor-physics", params: { motor: "M1.speed", ...params } },
      { id: "BA", type: "jwsim/limit-switch", params: { source: "C1.sensorA" } }],
    ["N.L - S.13", "S.14 - M1.U1", "N.N - M1.U2"],
  );

test("cinta con física: la caja arranca con el motor, tapa la fotocelda y sale contada", () => {
  const s = plant({ largo: 3, velocidad: 1, pieza: 0.3, sensorA: 2 });
  assert.deepEqual(s.output("C1", "piezas"), [0.15]);
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(1000));
  // Motor a pleno a los 0,5 s: la caja va a 1 m/s.
  assert.equal(s.output("C1", "avance"), 1);
  assert.equal(s.output("C1", "velPiezas")[0], 1);
  // Borde delantero en 2 m: centro en 1,85 m. 0,25 m en la rampa + 1,45 m a 1 m/s → ~1,95 s.
  s.advanceTo(ms(1900));
  assert.equal(s.contact("BA", "13-14"), false);
  s.advanceTo(ms(2050));
  assert.equal(s.contact("BA", "13-14"), true);
  s.advanceTo(ms(4000));
  assert.equal(s.output("C1", "salidas"), 1);
  assert.equal(s.output("C1", "enCinta"), 0);
  assert.deepEqual(faults(s), []);
});

test("cinta con física: al soltar el motor, la caja sigue con la rampa de parada (0,5 s → 0,25 m a 1 m/s)", () => {
  const s = plant({ largo: 5, velocidad: 1, pieza: 0.3 });
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(1500));
  const x0 = s.output("C1", "piezas")[0];
  s.act("S", "press", false, ms(1500));
  s.advanceTo(ms(3000));
  const x1 = s.output("C1", "piezas")[0];
  assert.equal(s.output("C1", "avance"), 0);
  assert.ok(Math.abs(x1 - x0 - 0.25) < 0.02, `avanzó ${x1 - x0} m`);
});

test("cinta con física: tope y cajas automáticas se acumulan en fila", () => {
  const s = plant({ largo: 3, velocidad: 0.5, pieza: 0.3, tope: 2.5, iniciales: 0, cada: 1 });
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(15000));
  const xs = s.output("C1", "piezas");
  assert.equal(xs.at(-1), 2.35);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 0.3 - 1e-3, `encimadas: ${xs}`);
  assert.equal(s.output("C1", "salidas"), 0);
});

test("cinta con física: quieta no pide eventos (no consume CPU)", () => {
  const s = plant({});
  s.advanceTo(ms(60_000));
  assert.deepEqual(s.output("C1", "piezas"), [0.15]);
  assert.equal(s.output("C1", "avance"), 0);
});
