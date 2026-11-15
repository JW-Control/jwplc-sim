// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tanque con modelo de balance de volumen discretizado: formas, descarga
// por gravedad (Torricelli) y paso de discretización, contra las soluciones
// analíticas. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

const tank = (params, extra = [], wiring = []) => {
  // Un caudal de llenado se da como «consumo» negativo: bomba S siempre en marcha.
  const fill = Number(params.consumo) < 0 ? -Number(params.consumo) : 0;
  const s = scene(
    [{ id: "T1", type: "jwsim/tank", params: { ...params, consumo: 0, ...(fill ? { bomba: "S.position", caudal: fill } : {}) } }, ...(fill ? ["S:selector-2"] : []), ...extra],
    wiring,
  );
  if (fill) s.act("S", "position", 1, ms(0));
  return s;
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} ≈ ${b} (±${tol})`);
const level = (s) => s.output("T1", "nivel");

test("cilindro vertical con descarga por gravedad: sigue a Torricelli, h(t) = (√h0 − k·t)²", () => {
  // 200 L en 1,2 m: A = 0,1667 m²; orificio de 10 mm, Cd 0,61.
  const A = 0.2 / 1.2;
  const a = (Math.PI * 0.01 ** 2) / 4;
  const k = (0.61 * a * Math.sqrt(2 * 9.81)) / (2 * A);
  const h0 = 1.2;
  for (const pasoMs of [10, 100, 1000]) {
    const s = tank({ volumen: 200, alto: 1.2, nivel0: 100, salidaMm: 10, pasoMs });
    for (const tS of [60, 300, 600]) {
      s.advanceTo(ms(tS * 1000));
      const h = (Math.sqrt(h0) - k * tS) ** 2;
      near(s.output("T1", "alturaM"), h, 0.002, `paso ${pasoMs} ms, t = ${tS} s:`);
    }
  }
});

test("cono (tolva): llenando a caudal constante, la altura es (V/Vmax)^(1/3)", () => {
  // Vacío, 40 L/min en 200 L: a 25 L (1/8 del volumen) la altura es la mitad.
  const s = tank({ forma: "cono (tolva)", volumen: 200, nivel0: 0, consumo: -40 });
  s.advanceTo(ms(37_500));
  near(level(s), 0.5, 0.005, "a 25 L:");
  near(s.output("T1", "volumenL"), 25, 0.1);
  // y a 102,4 L (0,512 Vmax), el 80 %.
  s.advanceTo(ms(153_600));
  near(level(s), 0.8, 0.005, "a 102,4 L:");
});

test("cilindro horizontal y esfera: a medio volumen, media altura; cerca del fondo sube más rápido", () => {
  for (const forma of ["cilindro horizontal", "esfera"]) {
    const s = tank({ forma, volumen: 200, nivel0: 0, consumo: -60 });
    s.advanceTo(ms(100_000));
    near(level(s), 0.5, 0.005, `${forma} a 100 L:`);
  }
  // Con el mismo caudal, el prisma en V sube más rápido abajo que el rectangular.
  const v = tank({ forma: "prisma en V", volumen: 200, nivel0: 0, consumo: -60 });
  const r = tank({ forma: "rectangular", volumen: 200, nivel0: 0, consumo: -60 });
  v.advanceTo(ms(20_000));
  r.advanceTo(ms(20_000));
  assert.ok(level(v) > 2 * level(r), `V ${level(v)} vs rectangular ${level(r)}`);
});

test("cuarto de círculo: el volumen y la altura son coherentes en todo el recorrido", () => {
  const s = tank({ forma: "cuarto de círculo", volumen: 200, nivel0: 0, consumo: -60 });
  let prev = 0;
  for (const tS of [10, 50, 100, 150, 199]) {
    s.advanceTo(ms(tS * 1000));
    const x = level(s);
    assert.ok(x > prev, "la altura crece");
    prev = x;
  }
  s.advanceTo(ms(210_000));
  assert.equal(level(s), 1);
  assert.equal(s.output("T1", "rebalse"), true);
});

test("válvula de descarga: solo vacía con la electroválvula abierta", () => {
  const s = scene(
    [
      "PS:power-24vdc", "S:selector-2", { id: "Y1", type: "jwsim/water-valve", params: {} },
      { id: "T1", type: "jwsim/tank", params: { consumo: 0, nivel0: 80, salidaMm: 15, valvula: "Y1.open" } },
    ],
    ["PS.+V1 - S.13", "S.14 - Y1.A1", "Y1.A2 - PS.-V1"],
  );
  s.advanceTo(ms(30_000));
  near(level(s), 0.8, 1e-9, "válvula cerrada:");
  assert.equal(s.output("T1", "caudalSalida"), 0);
  s.act("S", "position", 1, ms(30_000));
  s.advanceTo(ms(60_000));
  assert.ok(level(s) < 0.75, `abierta vacía: ${level(s)}`);
  assert.ok(s.output("T1", "caudalSalida") > 10);
});

test("un flotador ve el cruce exacto también con la forma no lineal (tramos por paso)", () => {
  // Cono, 40 L/min desde vacío: 80 % de la altura a los 153,6 s.
  const s = tank({ forma: "cono (tolva)", volumen: 200, nivel0: 0, consumo: -40, pasoMs: 500 }, [
    { id: "BL", type: "jwsim/float-switch", params: { source: "T1.nivel", alto: 80, bajo: 20 } },
  ]);
  s.advanceTo(ms(152_500));
  assert.equal(s.output("BL", "up"), false);
  s.advanceTo(ms(154_500));
  assert.equal(s.output("BL", "up"), true);
});
