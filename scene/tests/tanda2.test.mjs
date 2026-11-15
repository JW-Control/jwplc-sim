// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Catálogo, tanda 2: interruptor de nivel tipo pera, electrodos y relé de
// nivel, presostato, termostato, voltímetro y amperímetro. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { faults, ms, scene } from "./helpers.mjs";

const tank = (params) => ({ id: "T1", type: "jwsim/tank", params: { volumen: 200, caudal: 40, consumo: 15, nivel0: 50, ...params } });

test("flotador tipo pera: sube al llegar a «Sube en» y baja al caer a «Baja en» (con el tanque)", () => {
  // Bomba a mano con un selector: llena a 25 L/min netos y vacía a 15 L/min.
  const s = scene(
    ["PS:power-24vdc", "S:selector-2", tank({ bomba: "S.position" }), { id: "BL", type: "jwsim/float-switch", params: { source: "T1.nivel", alto: 80, bajo: 20 } }, "H:lamp"],
    ["PS.+V1 - BL.BK", "BL.BN - H.X1", "H.X2 - PS.-V1"],
  );
  assert.equal(s.output("BL", "up"), false);
  s.act("S", "position", 1, ms(0));
  // De 100 L (50 %) a 160 L (80 %) con 25 L/min netos: 144 s.
  s.advanceTo(ms(143_000));
  assert.equal(s.output("H", "lit"), false);
  s.advanceTo(ms(144_100));
  assert.equal(s.output("H", "lit"), true);
  // Sin bomba (a los 150 s, con 162,5 L) baja a 15 L/min: sigue arriba bajo
  // el 80 % y baja recién en el 20 % (40 L): 490 s después.
  s.act("S", "position", 0, ms(150_000));
  s.advanceTo(ms(150_000 + 489_000));
  assert.equal(s.output("BL", "up"), true);
  s.advanceTo(ms(150_000 + 490_100));
  assert.equal(s.output("BL", "up"), false);
  assert.equal(s.output("H", "lit"), false);
});

test("flotador tipo pera sin tanque: se sube y baja a mano; BU cierra abajo", () => {
  const s = scene(["PS:power-24vdc", "BL:float-switch", "H:lamp"], ["PS.+V1 - BL.BK", "BL.BU - H.X1", "H.X2 - PS.-V1"]);
  assert.equal(s.output("H", "lit"), true);
  s.act("BL", "float", true, ms(10));
  assert.equal(s.output("H", "lit"), false);
});

// Relé de nivel con sus electrodos cableados uno a uno y una lámpara en 11-14.
const levelScene = (relay, electrodes, extra = [], wiring = ["E.E1 - KL.E1", "E.E2 - KL.E2", "E.E3 - KL.E3"]) =>
  scene(
    ["PS:power-24vdc", { id: "KL", type: "jwsim/level-relay", params: relay }, { id: "E", type: "jwsim/level-electrodes", params: electrodes }, "H:lamp", ...extra],
    ["PS.+V1 - KL.A1", "KL.A2 - PS.-V1", "PS.+V2 - KL.11", "KL.14 - H.X1", "H.X2 - PS.-V2", ...wiring],
  );

test("relé de nivel en vaciado: cierra 11-14 al mojarse E1 y abre recién al secarse E2", () => {
  const s = levelScene({ modo: "vaciado", retardoMs: 500 }, { nivel: 50 });
  s.advanceTo(ms(1000));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("KL", "nivel"), "medio");
  s.act("E", "nivel", 90, ms(2000));
  s.advanceTo(ms(2400));
  assert.equal(s.output("H", "lit"), false);
  s.advanceTo(ms(2500));
  assert.equal(s.output("H", "lit"), true);
  s.act("E", "nivel", 50, ms(3000));
  s.advanceTo(ms(4000));
  assert.equal(s.output("H", "lit"), true);
  s.act("E", "nivel", 10, ms(5000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("H", "lit"), false);
});

test("relé de nivel en llenado: cierra con el tanque bajo; un electrodo sin cablear se lee seco", () => {
  let s = levelScene({ modo: "llenado", retardoMs: 0 }, { nivel: 90 });
  assert.equal(s.output("H", "lit"), false);
  s.act("E", "nivel", 10, ms(100));
  assert.equal(s.output("H", "lit"), true);
  // Sin E1 ni E2 cableados: vacío para el relé (llenado: la bomba no para nunca).
  s = levelScene({ modo: "llenado", retardoMs: 0 }, { nivel: 90 }, [], ["E.E3 - KL.E3"]);
  assert.equal(s.output("KL", "nivel"), "bajo");
  assert.equal(s.output("H", "lit"), true);
});

test("lazo cerrado: los electrodos en el tanque y el relé en llenado mantienen el nivel entre E2 y E1", () => {
  const s = levelScene({ modo: "llenado", retardoMs: 0 }, { source: "T1.nivel", alto: 80, bajo: 20 }, [tank({ bomba: "KL.closed", nivel0: 50 })]);
  // Arranca en 50 % (entre E2 y E1): llena hasta el 80 % (144 s) y para.
  assert.equal(s.output("KL", "closed"), true);
  s.advanceTo(ms(144_100));
  assert.equal(s.output("KL", "closed"), false);
  // Se vacía a 15 L/min hasta el 20 % (8 min) y vuelve a llenar.
  s.advanceTo(ms(144_000 + 480_000 - 1000));
  assert.equal(s.output("KL", "closed"), false);
  s.advanceTo(ms(144_000 + 480_000 + 1000));
  assert.equal(s.output("KL", "closed"), true);
  assert.ok(!faults(s).some((f) => f.startsWith("oscillation")));
});

test("presostato: al subir a Corte cierra 1-4 y abre 1-2; vuelve recién en Corte − Diferencial", () => {
  const s = scene(["PS:power-24vdc", { id: "BP", type: "jwsim/pressure-switch", params: { corte: 4, dif: 1 } }, "H:lamp"], ["PS.+V1 - BP.1", "BP.4 - H.X1", "H.X2 - PS.-V1"]);
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.contact("BP", "1-2"), true);
  assert.equal(s.output("BP", "ajusteTxt"), "3,0 – 4,0 bar");
  s.act("BP", "presion", 4.2, ms(10));
  assert.equal(s.output("H", "lit"), true);
  assert.equal(s.output("BP", "texto"), "4,2 bar");
  s.act("BP", "presion", 3.5, ms(20));
  assert.equal(s.output("H", "lit"), true);
  s.act("BP", "presion", 2.9, ms(30));
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.contact("BP", "1-2"), true);
});

test("termostato leyendo otro dispositivo: sigue el valor y su diferencial", () => {
  // La «temperatura» es el nivel del tanque (0 a 1) solo para la prueba: Corte 0,8 y diferencial 0,3.
  const s = scene(
    ["PS:power-24vdc", "S:selector-2", tank({ bomba: "S.position" }), { id: "BT", type: "jwsim/thermostat", params: { source: "T1.nivel", corte: 0.8, dif: 0.3 } }],
    [],
  );
  s.act("S", "position", 1, ms(0));
  s.advanceTo(ms(143_000));
  assert.equal(s.output("BT", "activado"), false);
  s.advanceTo(ms(144_100));
  assert.equal(s.output("BT", "activado"), true);
  assert.equal(s.contact("BT", "1-4"), true);
  // Vuelve en 0,8 − 0,3 = 0,5 (100 L): de 162,5 L a 15 L/min, 250 s después.
  s.act("S", "position", 0, ms(150_000));
  s.advanceTo(ms(399_000));
  assert.equal(s.output("BT", "activado"), true);
  s.advanceTo(ms(400_100));
  assert.equal(s.output("BT", "activado"), false);
});

test("voltímetro: 24 VDC con signo, 230 VAC, tipo equivocado «---»; no avisa como carga", () => {
  let s = scene(["PS:power-24vdc", { id: "PV", type: "jwsim/voltmeter", params: { range: "6-100VDC" } }], ["PS.+V1 - PV.1", "PS.-V1 - PV.2"]);
  assert.equal(s.output("PV", "texto"), "24,0 V");
  assert.ok(!s.findings.some((f) => f.load?.startsWith("PV")));
  s = scene(["PS:power-24vdc", { id: "PV", type: "jwsim/voltmeter", params: { range: "6-100VDC" } }], ["PS.-V1 - PV.1", "PS.+V1 - PV.2"]);
  assert.equal(s.output("PV", "texto"), "-24,0 V");
  s = scene(["R:power-230vac", "PV:voltmeter"], ["R.L - PV.1", "R.N - PV.2"]);
  assert.equal(s.output("PV", "texto"), "230 V");
  s = scene(["PS:power-24vdc", "PV:voltmeter"], ["PS.+V1 - PV.1", "PS.-V1 - PV.2"]);
  assert.equal(s.output("PV", "lcd"), "---");
  assert.equal(faults(s).length, 0);
});

test("amperímetro en serie con una fase del motor: pico de arranque y corriente de régimen", () => {
  const s = scene(
    ["R:power-3ph", "PA:ammeter", { id: "M", type: "jwsim/motor-3ph", params: { In: 3.2, carga: 100 } }],
    ["R.L1 - PA.1", "PA.2 - M.U1", "R.L2 - M.V1", "R.L3 - M.W1"],
  );
  assert.equal(s.output("PA", "texto"), "19 A");
  s.advanceTo(ms(1000));
  assert.equal(s.output("PA", "texto"), "3,2 A");
  assert.equal(s.output("M", "running"), true);
});
