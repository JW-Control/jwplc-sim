// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Catálogo, tanda 1: sensor capacitivo (y material del inductivo), parada de
// emergencia, pulsador luminoso, selector con llave, relé temporizador, SSR,
// torre de señalización, termomagnético y guardamotor. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

// Circuito de prueba: L+ → contacto → lámpara → M.
const lampVia = (dev, a, b) => scene(["PS:power-24vdc", dev, "H:lamp"], [`PS.+V1 - ${a}`, `${b} - H.X1`, "H.X2 - PS.-V1"]);

// Sensor de 3 hilos PNP con una lámpara en la salida.
const sensorScene = (type, params) =>
  scene(
    ["PS:power-24vdc", { id: "B", type: `jwsim/${type}`, params }, "H:lamp"],
    ["PS.+V1 - B.BN", "B.BU - PS.-V1", "B.BK - H.X1", "H.X2 - PS.-V1"],
  );

test("sensor capacitivo: detecta plástico a menor distancia (45 % de Sn) y agua a Sn completo", () => {
  let s = sensorScene("sensor-capacitive", { material: "plástico", distance: 12 });
  assert.equal(s.output("B", "sn"), 3.6);
  s.act("B", "distance", 4, ms(10));
  assert.equal(s.output("H", "lit"), false);
  s.act("B", "distance", 3, ms(20));
  s.advanceTo(ms(40)); // tiempo de respuesta 10 ms
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.output("B", "snTxt"), "Sn 3,6 mm · plástico");
  s = sensorScene("sensor-capacitive", { material: "agua", distance: 12 });
  s.act("B", "distance", 7.9, ms(10));
  s.advanceTo(ms(30));
  assert.equal(s.output("H", "lit"), true);
  // Histéresis del 20 %: suelta pasados 9,6 mm.
  s.act("B", "distance", 9.5, ms(40));
  s.advanceTo(ms(60));
  assert.equal(s.output("H", "lit"), true);
  s.act("B", "distance", 9.7, ms(70));
  s.advanceTo(ms(90));
  assert.equal(s.output("H", "lit"), false);
});

test("sensor capacitivo: la sensibilidad (potenciómetro) acorta el alcance", () => {
  const s = sensorScene("sensor-capacitive", { material: "metal", sensitivity: 50, distance: 5 });
  assert.equal(s.output("B", "sn"), 4);
  s.advanceTo(ms(20));
  assert.equal(s.output("H", "lit"), false);
  s.act("B", "distance", 3.9, ms(30));
  s.advanceTo(ms(50));
  assert.equal(s.output("H", "lit"), true);
});

test("sensor inductivo: el material acorta el alcance y un no metal no se detecta ni pegado a la cara", () => {
  let s = sensorScene("sensor-inductive", { material: "latón", distance: 5 });
  assert.equal(s.output("B", "sn"), 4);
  assert.equal(s.output("H", "lit"), false);
  s.act("B", "distance", 3.5, ms(10));
  s.advanceTo(ms(20));
  assert.equal(s.output("H", "lit"), true);
  s = sensorScene("sensor-inductive", { material: "plástico", distance: 0 });
  s.act("B", "target", true, ms(10));
  s.advanceTo(ms(20));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("B", "snTxt"), "no detecta plástico");
  // Sin material (escenas anteriores): acero, como antes.
  s = sensorScene("sensor-inductive", { distance: 7.9 });
  s.advanceTo(ms(10));
  assert.equal(s.output("H", "lit"), true);
});

test("parada de emergencia: queda enclavada al pulsar (11-12 abre, 23-24 cierra) y se suelta girándola", () => {
  const s = lampVia("E:emergency-stop", "E.11", "E.12");
  assert.equal(s.output("H", "lit"), true);
  s.act("E", "press", true, ms(10));
  s.advanceTo(ms(500));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.contact("E", "23-24"), true);
  assert.equal(s.output("E", "pressed"), true);
  s.act("E", "press", false, ms(600));
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.contact("E", "23-24"), false);
});

test("pulsador luminoso: 13-14 mientras se pulsa y el LED X1-X2 independiente", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-lit", "H:lamp"],
    ["PS.+V1 - S.13", "S.14 - H.X1", "H.X2 - PS.-V1", "PS.+V2 - S.X1", "S.X2 - PS.-V2"],
  );
  assert.equal(s.output("S", "lit"), true);
  assert.equal(s.output("H", "lit"), false);
  s.act("S", "press", true, ms(10));
  assert.equal(s.output("H", "lit"), true);
  s.act("S", "press", false, ms(20));
  assert.equal(s.output("H", "lit"), false);
});

test("selector con llave: 13-14 en I y 21-22 en 0", () => {
  const s = lampVia("S:selector-key", "S.13", "S.14");
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.contact("S", "21-22"), true);
  s.act("S", "position", 1, ms(5));
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.contact("S", "21-22"), false);
});

// Temporizador: un selector energiza A1-A2; dos lámparas en 15-18 y 25-28.
const timerScene = (params) =>
  scene(
    ["PS:power-24vdc", "S:selector-2", { id: "KT", type: "jwsim/timer-relay", params: { time: 2, ...params } }, "H1:lamp", "H2:lamp"],
    ["PS.+V1 - S.13", "S.14 - KT.A1", "KT.A2 - PS.-V1", "PS.+V2 - KT.15", "KT.18 - H1.X1", "H1.X2 - PS.-V2", "PS.+V2 - KT.25", "KT.28 - H2.X1", "H2.X2 - PS.-V2"],
  );

test("temporizador, retardo a la conexión: cierra 15-18 y 25-28 el tiempo después de energizar", () => {
  const s = timerScene({ mode: "retardo a la conexión" });
  s.act("S", "position", 1, ms(1000));
  assert.equal(s.output("KT", "timing"), true);
  s.advanceTo(ms(2999));
  assert.equal(s.output("H1", "lit"), false);
  assert.equal(s.contact("KT", "15-16"), true);
  s.advanceTo(ms(3000));
  assert.equal(s.output("H1", "lit"), true);
  assert.equal(s.output("H2", "lit"), true);
  assert.equal(s.contact("KT", "15-16"), false);
  s.act("S", "position", 0, ms(3500));
  assert.equal(s.output("H1", "lit"), false);
});

test("temporizador, retardo a la desconexión: se mantiene el tiempo después de quitar la bobina", () => {
  const s = timerScene({ mode: "retardo a la desconexión" });
  assert.equal(s.output("H1", "lit"), false);
  s.act("S", "position", 1, ms(100));
  assert.equal(s.output("H1", "lit"), true);
  s.act("S", "position", 0, ms(1000));
  s.advanceTo(ms(2999));
  assert.equal(s.output("H1", "lit"), true);
  assert.equal(s.output("KT", "timing"), true);
  s.advanceTo(ms(3000));
  assert.equal(s.output("H1", "lit"), false);
});

test("temporizador intermitente e impulso", () => {
  let s = timerScene({ mode: "intermitente" });
  s.act("S", "position", 1, ms(0));
  assert.equal(s.output("H1", "lit"), true);
  s.advanceTo(ms(2000));
  assert.equal(s.output("H1", "lit"), false);
  s.advanceTo(ms(4000));
  assert.equal(s.output("H1", "lit"), true);
  s.act("S", "position", 0, ms(4500));
  assert.equal(s.output("H1", "lit"), false);
  s = timerScene({ mode: "impulso" });
  s.act("S", "position", 1, ms(100));
  assert.equal(s.output("H1", "lit"), true);
  s.advanceTo(ms(2100));
  assert.equal(s.output("H1", "lit"), false);
});

test("temporizador estrella-triángulo: 15-18 estrella hasta el tiempo y 25-28 triángulo tras la pausa", () => {
  const s = timerScene({ mode: "estrella-triángulo", pauseMs: 50 });
  s.act("S", "position", 1, ms(1000));
  assert.equal(s.output("H1", "lit"), true);
  assert.equal(s.output("H2", "lit"), false);
  s.advanceTo(ms(3000));
  assert.equal(s.output("H1", "lit"), false);
  assert.equal(s.output("H2", "lit"), false);
  s.advanceTo(ms(3050));
  assert.equal(s.output("H2", "lit"), true);
  assert.equal(s.output("H1", "lit"), false);
});

test("SSR: 24 VDC en 3-4 cierra 1-2 (en el cruce por cero) y enciende una carga de 230 VAC", () => {
  const s = scene(
    ["PS:power-24vdc", "S:selector-2", "K:ssr", "R:power-230vac", { id: "H", type: "jwsim/lamp", params: { rating: "230VAC" } }],
    ["PS.+V1 - S.13", "S.14 - K.3", "K.4 - PS.-V1", "R.L - K.1", "K.2 - H.X1", "H.X2 - R.N"],
  );
  s.act("S", "position", 1, ms(10));
  assert.equal(s.output("K", "input"), true);
  s.advanceTo(ms(25));
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.output("K", "on"), true);
  s.act("S", "position", 0, ms(100));
  s.advanceTo(ms(120));
  assert.equal(s.output("H", "lit"), false);
});

test("torre de señalización: cada color entre su borne y COM; Z hace sonar el zumbador", () => {
  const s = scene(
    ["PS:power-24vdc", "S:selector-2", "T:stack-light"],
    ["PS.-V1 - T.COM", "PS.+V1 - T.V", "PS.+V1 - S.13", "S.14 - T.Z"],
  );
  assert.equal(s.output("T", "green"), true);
  assert.equal(s.output("T", "red"), false);
  assert.equal(s.output("T", "buzzer"), false);
  s.act("S", "position", 1, ms(10));
  assert.equal(s.output("T", "buzzer"), true);
});

// Red trifásica → protección → motor.
const motorScene = (prot, motor) =>
  scene(
    ["R:power-3ph", prot, { id: "M", type: "jwsim/motor-3ph", params: motor }],
    ["R.L1 - Q.1", "R.L2 - Q.3", "R.L3 - Q.5", "Q.2 - M.U1", "Q.4 - M.V1", "Q.6 - M.W1"],
  );

test("termomagnético 3P: el pico de arranque dispara la curva B y no la C; la sobrecarga lo dispara en minutos", () => {
  // Motor de 3,2 A: arranque 19,2 A. B 4 A: 4 × 4 = 16 A → dispara; C: 30 A → no.
  let s = motorScene({ id: "Q", type: "jwsim/breaker", params: { poles: "3P", In: "4", curve: "B" } }, { In: 3.2, carga: 100 });
  assert.equal(s.output("Q", "tripped"), true);
  assert.equal(s.output("Q", "on"), false);
  assert.equal(s.contact("Q", "1-2"), false);
  s = motorScene({ id: "Q", type: "jwsim/breaker", params: { poles: "3P", In: "4", curve: "C" } }, { In: 3.2, carga: 100 });
  s.advanceTo(ms(600_000));
  assert.equal(s.output("Q", "on"), true);
  assert.equal(s.output("Q", "rating"), "C4");
  // Curva D de 2 A (arranque 9,6 × In < 15: no dispara) con 3,2 A en régimen
  // (1,6 × In): dispara en algo más de un minuto (τ = 60 s).
  s = motorScene({ id: "Q", type: "jwsim/breaker", params: { poles: "3P", In: "2", curve: "D" } }, { In: 3.2, carga: 100 });
  s.advanceTo(ms(1000));
  assert.equal(s.output("Q", "on"), true);
  s.advanceTo(ms(40_000));
  assert.equal(s.output("Q", "on"), true);
  s.advanceTo(ms(70_000));
  assert.equal(s.output("Q", "tripped"), true);
  // Rearme: la palanca no queda arriba hasta que el bimetal se enfría.
  s.act("Q", "lever", true, ms(71_000));
  assert.equal(s.output("Q", "on"), false);
  s.act("Q", "lever", false, ms(200_000));
  assert.equal(s.output("Q", "on"), true);
  assert.equal(s.output("Q", "tripped"), false);
});

test("termomagnético: la palanca abre y cierra a mano", () => {
  const s = lampVia({ id: "Q", type: "jwsim/breaker", params: { poles: "1P" } }, "Q.1", "Q.2");
  assert.equal(s.output("H", "lit"), true);
  s.act("Q", "lever", true, ms(10));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("Q", "tripped"), false);
  s.act("Q", "lever", false, ms(20));
  assert.equal(s.output("H", "lit"), true);
});

test("guardamotor: perilla I/O, falta de fase y sobrecarga lo llevan a TRIP; se rearma pasando por O", () => {
  const prot = { id: "Q", type: "jwsim/motor-protector", params: { range: "2.5-4 A", ajuste: 3.2, tripMs: 2000 } };
  let s = motorScene(prot, { In: 3.2, carga: 100 });
  assert.equal(s.output("Q", "on"), false);
  assert.equal(s.contact("Q", "21-22"), true);
  s.act("Q", "knob", true, ms(100));
  assert.equal(s.output("Q", "on"), true);
  assert.equal(s.contact("Q", "13-14"), true);
  // Arranque de 19,2 A < 13 × 4 A: no dispara el magnético.
  s.advanceTo(ms(60_000));
  assert.equal(s.output("Q", "tripped"), false);
  assert.equal(s.output("M", "running"), true);
  // TEST: dispara; la perilla queda en TRIP (0,5) y los polos abren.
  s.act("Q", "test", true, ms(61_000));
  s.act("Q", "test", false, ms(61_100));
  assert.equal(s.output("Q", "tripped"), true);
  assert.equal(s.output("Q", "knob"), 0.5);
  assert.equal(s.contact("Q", "1-2"), false);
  // Primer giro: a O; segundo: a I.
  s.act("Q", "knob", false, ms(62_000));
  assert.equal(s.output("Q", "knob"), 0);
  s.act("Q", "knob", true, ms(63_000));
  assert.equal(s.output("Q", "on"), true);
  // Sobrecarga: dial en 3,2 A con un motor al 150 % (4,8 A).
  s = motorScene({ ...prot, params: { ...prot.params, start: "cerrado (I)" } }, { In: 3.2, carga: 150 });
  s.advanceTo(ms(30_000));
  assert.equal(s.output("Q", "tripped"), false);
  s.advanceTo(ms(240_000));
  assert.equal(s.output("Q", "tripped"), true);
});

test("guardamotor: la falta de fase dispara después del tiempo", () => {
  const s = scene(
    ["R:power-3ph", "S:pushbutton-nc", { id: "Q", type: "jwsim/motor-protector", params: { range: "17-25 A", ajuste: 25, tripMs: 2000, start: "cerrado (I)" } }, { id: "M", type: "jwsim/motor-3ph", params: { In: 3.2 } }],
    ["R.L1 - S.11", "S.12 - Q.1", "R.L2 - Q.3", "R.L3 - Q.5", "Q.2 - M.U1", "Q.4 - M.V1", "Q.6 - M.W1"],
  );
  s.act("S", "press", true, ms(1000));
  assert.equal(s.output("Q", "faltaFase"), true);
  s.advanceTo(ms(2900));
  assert.equal(s.output("Q", "tripped"), false);
  s.advanceTo(ms(3000));
  assert.equal(s.output("Q", "tripped"), true);
});
