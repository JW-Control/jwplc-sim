// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Multímetro del modo Diagnóstico (Scene.measure, Scene.clamp, Scene.lockout).
// node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

// +24 V → pulsador NA → lámpara → 0 V.
const lamp = () => scene(["PS:power-24vdc", "SB:pushbutton-no", "H:lamp"], ["PS.+V1 - SB.13", "SB.14 - H.X1", "H.X2 - PS.-V1"]);
const V = (s, a, b, m = "VDC") => s.measure(a, b, m).value;

test("tensión: fuente, contacto abierto en serie con la carga y polaridad", () => {
  const s = lamp();
  assert.equal(V(s, "PS.+V1", "PS.-V1"), 24);
  assert.equal(V(s, "PS.-V1", "PS.+V1"), -24, "puntas invertidas");
  // Pulsador sin pulsar: entre sus bornes están los 24 V (la lámpara apagada lleva el 0 V).
  assert.equal(V(s, "SB.13", "SB.14"), 24);
  assert.equal(V(s, "H.X1", "H.X2"), 0, "la lámpara no tiene tensión");
  assert.equal(V(s, "PS.+V1", "PS.-V1", "VAC"), 0, "continua en el rango de alterna");
  s.act("SB", "press", true, ms(10));
  assert.equal(V(s, "SB.13", "SB.14"), 0, "contacto cerrado: sin caída");
  assert.equal(V(s, "H.X1", "H.X2"), 24);
});

test("tensión: cable cortado y carga quemada se delatan con 24 V entre sus extremos", () => {
  let s = lamp();
  s.act("SB", "press", true, ms(10));
  s.inject({ kind: "open", wire: "SB.14 H.X1" }, ms(20));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(V(s, "SB.14", "H.X1"), 24, "entre las puntas del cable cortado");
  assert.equal(V(s, "H.X1", "H.X2"), 0);
  s = lamp();
  s.act("SB", "press", true, ms(10));
  s.inject({ kind: "burnt", device: "H" }, ms(20));
  assert.equal(V(s, "H.X1", "H.X2"), 24, "llega tensión pero la lámpara no prende");
});

test("resistencia: con bloqueo, continuidad de cables, contactos y cargas; OL si está cortado", () => {
  const s = lamp();
  assert.equal(s.measure("H.X1", "H.X2", "OHM").live, true, "sin bloqueo hay tensión");
  s.lockout(true, ms(10));
  assert.equal(s.snapshot().lockedOut, true);
  assert.equal(V(s, "PS.+V1", "PS.-V1"), 0, "bloqueado: sin tensión");
  const r = s.measure("H.X1", "H.X2", "OHM");
  assert.equal(r.live, false);
  assert.ok(r.value > 100 && r.value < 5000, `lámpara: ${r.value} Ω`);
  assert.equal(s.measure("SB.13", "SB.14", "OHM").value, Infinity, "pulsador abierto: OL");
  assert.equal(s.measure("SB.14", "H.X1", "OHM").value, 0, "cable sano");
  s.inject({ kind: "open", wire: "SB.14 H.X1" }, ms(20));
  assert.equal(s.measure("SB.14", "H.X1", "OHM").value, Infinity, "cable cortado: OL");
  s.inject({ kind: "burnt", device: "H" }, ms(30));
  assert.equal(s.measure("H.X1", "H.X2", "OHM").value, Infinity, "lámpara quemada: OL");
  s.lockout(false, ms(40));
  assert.equal(V(s, "PS.+V1", "PS.-V1"), 24);
});

test("pinza: corriente de la carga por su cable; 0 si no circula", () => {
  const s = lamp();
  assert.equal(s.clamp("SB.14", "H.X1"), 0);
  s.act("SB", "press", true, ms(10));
  const a = s.clamp("SB.14", "H.X1");
  assert.ok(a > 0.005 && a < 0.2, `lámpara: ${a} A`);
  assert.equal(s.clamp("H.X2", "PS.-V1"), a, "la misma corriente vuelve por el retorno");
  assert.throws(() => s.clamp("SB.13", "H.X2"), /no hay un cable/);
});
