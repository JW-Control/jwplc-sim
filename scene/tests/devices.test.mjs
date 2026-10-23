// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G7_DEVICE_LIBRARY: comportamiento de cada dispositivo de la
// propuesta v0.1. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { builtinDevices, Registry } from "../devices/index.mjs";
import { faults, ms, scene } from "./helpers.mjs";

// Circuito de prueba: L+ → contacto → lámpara → M.
const lampVia = (dev, a, b) =>
  scene(["PS:power-24vdc", dev, "H:lamp"], [`PS.L+ - ${a}`, `${b} - H.X1`, "H.X2 - PS.M"]);

test("registro: los 16 dispositivos con tipo, versión, bornes y parámetros válidos", () => {
  const r = new Registry();
  assert.equal(r.list().length, builtinDevices.length);
  for (const d of builtinDevices) {
    assert.match(d.type, /^jwsim\//);
    assert.ok(d.terminals.length > 0, d.type);
    for (const p of d.parameters ?? []) if (p.type === "enum") assert.ok(p.options.includes(p.default), `${d.type}.${p.id}`);
  }
  for (const t of ["pushbutton-no", "pushbutton-nc", "selector-2", "selector-3", "limit-switch", "sensor-inductive",
    "sensor-photoelectric", "lamp", "buzzer", "relay", "contactor", "solenoid-valve", "motor"]) {
    assert.ok(r.get(`jwsim/${t}`), t);
  }
  assert.throws(() => r.get("jwsim/contactor", "2.0.0"), /no está instalado/);
  assert.equal(r.get("jwsim/contactor", "1.0.0").version, "1.0.0");
});

test("pulsador NA: cierra 13-14 mientras se pulsa", () => {
  const s = lampVia("S:pushbutton-no", "S.13", "S.14");
  assert.equal(s.output("H", "lit"), false);
  s.act("S", "press", true, ms(10));
  assert.equal(s.output("H", "lit"), true);
  s.act("S", "press", false, ms(20));
  assert.equal(s.output("H", "lit"), false);
});

test("pulsador NC: abre 11-12 mientras se pulsa", () => {
  const s = lampVia("S:pushbutton-nc", "S.11", "S.12");
  assert.equal(s.output("H", "lit"), true);
  s.act("S", "press", true, ms(10));
  assert.equal(s.output("H", "lit"), false);
});

test("selector de 2 posiciones: 13-14 en I, 21-22 en 0", () => {
  const s = lampVia("S:selector-2", "S.13", "S.14");
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.contact("S", "21-22"), true);
  s.act("S", "position", 1, ms(5));
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.contact("S", "21-22"), false);
});

test("selector de 3 posiciones: I cierra 13-14, II cierra 23-24, 0 ninguno", () => {
  const s = scene(
    ["PS:power-24vdc", "S:selector-3", "H1:lamp", "H2:lamp"],
    ["PS.L+ - S.13", "PS.L+ - S.23", "S.14 - H1.X1", "S.24 - H2.X1", "H1.X2 - PS.M", "H2.X2 - PS.M"],
  );
  const lit = () => [s.output("H1", "lit"), s.output("H2", "lit")];
  assert.deepEqual(lit(), [false, false]);
  s.act("S", "position", -1, ms(1));
  assert.deepEqual(lit(), [true, false]);
  s.act("S", "position", 1, ms(2));
  assert.deepEqual(lit(), [false, true]);
  s.act("S", "position", 0, ms(3));
  assert.deepEqual(lit(), [false, false]);
});

test("fin de carrera: a mano y por la posición del cilindro", () => {
  const s = scene(
    [
      "PS:power-24vdc", "S:pushbutton-no", "Y1:solenoid-valve", "H:lamp",
      { id: "B1", type: "jwsim/limit-switch", params: { source: "Y1.position", min: 1, max: 1 } },
    ],
    ["PS.L+ - S.13", "S.14 - Y1.A1", "Y1.A2 - PS.M", "PS.L+ - B1.13", "B1.14 - H.X1", "H.X2 - PS.M"],
  );
  s.act("B1", "actuate", true, ms(1));
  assert.equal(s.output("H", "lit"), true);
  s.act("B1", "actuate", false, ms(2));
  assert.equal(s.output("H", "lit"), false);
  s.act("S", "press", true, ms(10));
  s.advanceTo(ms(509.9));
  assert.equal(s.output("H", "lit"), false, "a mitad de carrera no acciona");
  s.advanceTo(ms(510));
  assert.equal(s.output("Y1", "extended"), true);
  assert.equal(s.output("H", "lit"), true, "acciona exactamente al final de la carrera (500 ms)");
  s.act("S", "press", false, ms(600));
  assert.equal(s.output("H", "lit"), false, "se libera al empezar el retorno");
});

for (const kind of ["inductive", "photoelectric"]) {
  test(`sensor ${kind} PNP NA: salida al + con alimentación y tras el tiempo de respuesta`, () => {
    const s = scene(
      ["PS:power-24vdc", `B:sensor-${kind}`, "H:lamp"],
      ["PS.L+ - B.BN", "B.BU - PS.M", "B.BK - H.X1", "H.X2 - PS.M"],
    );
    s.act("B", "target", true, ms(10));
    const resp = kind === "inductive" ? 1 : 0.5;
    s.advanceTo(ms(10 + resp / 2));
    assert.equal(s.output("H", "lit"), false);
    s.advanceTo(ms(10 + resp));
    assert.equal(s.output("H", "lit"), true);
    s.act("B", "target", false, ms(20));
    s.advanceTo(ms(25));
    assert.equal(s.output("H", "lit"), false);
  });
}

test("sensor sin alimentación o con polaridad invertida: no conmuta", () => {
  const s = scene(
    ["PS:power-24vdc", "B:sensor-inductive", "H:lamp"],
    ["PS.M - B.BN", "B.BU - PS.L+", "B.BK - H.X1", "H.X2 - PS.M"],
  );
  s.act("B", "target", true, ms(1));
  s.advanceTo(ms(5));
  assert.equal(s.output("B", "powered"), false);
  assert.ok(s.warnings.some((w) => w.type === "polarity" && w.load === "B.supply"));
});

test("sensor NPN: la salida conmuta a 0 V (carga desde L+)", () => {
  const s = scene(
    ["PS:power-24vdc", { id: "B", type: "jwsim/sensor-inductive", params: { output: "npn" } }, "H:lamp"],
    ["PS.L+ - B.BN", "B.BU - PS.M", "PS.L+ - H.X1", "H.X2 - B.BK"],
  );
  s.act("B", "target", true, ms(1));
  s.advanceTo(ms(3));
  assert.equal(s.output("H", "lit"), true);
});

test("sensor fotoeléctrico NC (modo oscuridad) por la posición del cilindro", () => {
  const s = scene(
    [
      "PS:power-24vdc", "Y1:solenoid-valve", "H:lamp", "S:pushbutton-no",
      { id: "B", type: "jwsim/sensor-photoelectric", params: { contact: "nc", source: "Y1.position", min: 0.4, max: 1 } },
    ],
    ["PS.L+ - B.BN", "B.BU - PS.M", "B.BK - H.X1", "H.X2 - PS.M", "PS.L+ - S.13", "S.14 - Y1.A1", "Y1.A2 - PS.M"],
  );
  s.advanceTo(ms(1));
  assert.equal(s.output("H", "lit"), true, "sin objeto: salida activa (NC)");
  s.act("S", "press", true, ms(100));
  s.advanceTo(ms(299));
  assert.equal(s.output("H", "lit"), true);
  s.advanceTo(ms(301));
  assert.equal(s.output("H", "lit"), false, "el vástago entra en el haz al 40 % de la carrera (200 ms)");
});

test("lámpara: tensión nominal, insuficiente y sobretensión (se quema)", () => {
  const ok = lampVia("S:pushbutton-no", "S.13", "S.14");
  ok.act("S", "press", true, ms(1));
  assert.equal(ok.output("H", "lit"), true);

  const low = scene(
    ["PS:power-24vdc", { id: "H", type: "jwsim/lamp", params: { rating: "230VAC" } }],
    ["PS.L+ - H.X1", "H.X2 - PS.M"],
  );
  assert.equal(low.output("H", "lit"), false);
  assert.ok(low.warnings.some((w) => w.type === "undervoltage"));

  const high = scene(["L:power-230vac", "S:pushbutton-no", "H:lamp"], ["L.L - S.13", "S.14 - H.X1", "H.X2 - L.N"]);
  high.act("S", "press", true, ms(1));
  assert.equal(high.output("H", "lit"), false);
  assert.deepEqual(faults(high), ["overvoltage:H"]);
  high.act("S", "press", false, ms(2));
  high.act("S", "press", true, ms(3));
  assert.equal(high.output("H", "lit"), false, "quemada: no vuelve a encender");
  assert.deepEqual(high.snapshot().devices.find((d) => d.id === "H").damaged, ["lamp"]);
});

test("zumbador: suena con la polaridad correcta", () => {
  const s = scene(["PS:power-24vdc", "B:buzzer"], ["PS.L+ - B.+", "B.- - PS.M"]);
  assert.equal(s.output("B", "sounding"), true);
  const r = scene(["PS:power-24vdc", "B:buzzer"], ["PS.L+ - B.-", "B.+ - PS.M"]);
  assert.equal(r.output("B", "sounding"), false);
});

test("relé: contactos conmutados con atraque 8 ms y caída 4 ms", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "K:relay", "H1:lamp", "H2:lamp"],
    ["PS.L+ - S.13", "S.14 - K.A1", "K.A2 - PS.M", "PS.L+ - K.11", "K.14 - H1.X1", "K.12 - H2.X1", "H1.X2 - PS.M", "H2.X2 - PS.M"],
  );
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [false, true]);
  s.act("S", "press", true, ms(10));
  s.advanceTo(ms(17.9));
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [false, true]);
  s.advanceTo(ms(18));
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [true, false]);
  s.act("S", "press", false, ms(50));
  s.advanceTo(ms(54));
  assert.deepEqual([s.output("H1", "lit"), s.output("H2", "lit")], [false, true]);
});

test("contactor: polos principales y auxiliares con atraque 20 ms y caída 10 ms", () => {
  const s = scene(
    ["PS:power-24vdc", "L:power-230vac", "S:pushbutton-no", "KM:contactor", "M:motor", "H:lamp"],
    ["PS.L+ - S.13", "S.14 - KM.A1", "KM.A2 - PS.M", "L.L - KM.1", "KM.2 - M.U1", "M.U2 - L.N",
      "PS.L+ - KM.21", "KM.22 - H.X1", "H.X2 - PS.M"],
  );
  assert.equal(s.output("H", "lit"), true, "auxiliar NC cerrado en reposo");
  s.act("S", "press", true, ms(0.5));
  s.advanceTo(ms(20.4));
  assert.equal(s.output("KM", "closed"), false);
  s.advanceTo(ms(20.5));
  assert.equal(s.output("KM", "closed"), true);
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("M", "running"), true);
  s.act("S", "press", false, ms(100));
  s.advanceTo(ms(110));
  assert.equal(s.output("KM", "closed"), false);
});

test("electroválvula: carrera de 500 ms al salir y 400 ms al volver", () => {
  const s = scene(["PS:power-24vdc", "S:pushbutton-no", "Y:solenoid-valve"], ["PS.L+ - S.13", "S.14 - Y.A1", "Y.A2 - PS.M"]);
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(250));
  assert.ok(Math.abs(s.output("Y", "position") - 0.5) < 1e-9);
  s.advanceTo(ms(500));
  assert.equal(s.output("Y", "extended"), true);
  s.act("S", "press", false, ms(600));
  s.advanceTo(ms(800));
  assert.ok(Math.abs(s.output("Y", "position") - 0.5) < 1e-9);
  s.advanceTo(ms(1000));
  assert.equal(s.output("Y", "retracted"), true);
});

test("motor: rampa de arranque y de parada; en CC el sentido sigue a la polaridad", () => {
  const ac = scene(["L:power-230vac", "S:pushbutton-no", "M:motor"], ["L.L - S.13", "S.14 - M.U1", "M.U2 - L.N"]);
  ac.act("S", "press", true, ms(0));
  ac.advanceTo(ms(150));
  assert.ok(Math.abs(ac.output("M", "speed") - 0.5) < 1e-9);
  ac.advanceTo(ms(300));
  assert.equal(ac.output("M", "speed"), 1);
  ac.act("S", "press", false, ms(400));
  ac.advanceTo(ms(1000));
  assert.equal(ac.output("M", "speed"), 0);
  assert.equal(ac.output("M", "running"), false);

  const dc = scene(
    ["PS:power-24vdc", { id: "M", type: "jwsim/motor", params: { rating: "24VDC" } }],
    ["PS.M - M.U1", "M.U2 - PS.L+"],
  );
  dc.advanceTo(ms(400));
  assert.equal(dc.output("M", "speed"), -1);
});

test("JWPLC Basic: entrada sink, salida a relé (10 ms) y relés sin alimentación", () => {
  const s = scene(
    ["plc:jwplc-basic", "PS:power-24vdc", "S:pushbutton-no", "H:lamp"],
    ["PS.L+ - plc.24VDC", "PS.M - plc.M0", "PS.M - plc.M1", "PS.L+ - S.13", "S.14 - plc.I0_3",
      "PS.L+ - plc.Q0_5.1", "plc.Q0_5.2 - H.X1", "H.X2 - PS.M"],
  );
  assert.deepEqual(s.boardInputs(), { I0_3: 0 }, "solo maneja las entradas cableadas");
  s.act("S", "press", true, ms(5));
  assert.deepEqual(s.takeInputChanges(), { I0_3: 1 });
  assert.deepEqual(s.takeInputChanges(), {});
  s.setSignals({ Q0_5: 1 }, ms(20));
  s.advanceTo(ms(29.9));
  assert.equal(s.output("H", "lit"), false);
  s.advanceTo(ms(30));
  assert.equal(s.output("H", "lit"), true);

  const off = scene(
    ["plc:jwplc-basic", "PS:power-24vdc", "H:lamp"],
    ["PS.L+ - plc.Q0_0.1", "plc.Q0_0.2 - H.X1", "H.X2 - PS.M"],
  );
  off.setSignals({ Q0_0: 1 }, ms(1));
  off.advanceTo(ms(50));
  assert.equal(off.output("H", "lit"), false, "sin 24VDC/M0 los relés no cierran");
  assert.equal(off.output("plc", "powered"), false);
});

test("entrada sink con polaridad invertida (M1 al +): no se activa y avisa", () => {
  const s = scene(
    ["plc:jwplc-basic", "PS:power-24vdc", "S:pushbutton-no"],
    ["PS.L+ - plc.M1", "PS.M - S.13", "S.14 - plc.I0_0"],
  );
  s.act("S", "press", true, ms(1));
  assert.deepEqual(s.boardInputs(), { I0_0: 0 });
  assert.ok(s.warnings.some((w) => w.type === "polarity" && w.load === "plc.I0_0"));
});
