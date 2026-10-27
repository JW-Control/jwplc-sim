// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Arranque de motores: relé térmico, motor de dos velocidades y variador
// Delta VFD-EL (teclado, bornes y Modbus RTU). node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { withCrc } from "../modbus.mjs";
import { vfdEl } from "../devices/vfd-el.mjs";
import { faults, ms, scene } from "./helpers.mjs";

test("relé térmico: falta de fase sostenida dispara 95-96 (NC) y cierra 97-98; RESET con las tres fases", () => {
  // Ajuste alto: así solo actúa el disparo por falta de fase (no la sobrecarga).
  const dev = { id: "F", type: "jwsim/overload-relay", params: { tripMs: 3000, range: "17-25 A", ajuste: 25 } };
  const s = scene(
    ["R:power-3ph", "S:pushbutton-nc", dev, "M:motor-3ph", "H:lamp"],
    ["R.L1 - S.11", "S.12 - F.1", "R.L2 - F.3", "R.L3 - F.5", "F.2 - M.U1", "F.4 - M.V1", "F.6 - M.W1"],
  );
  assert.equal(s.output("F", "tripped"), false);
  assert.equal(s.output("M", "connection"), "triangulo");
  // Se corta L1 (el pulsador NC hace de fusible fundido).
  s.act("S", "press", true, ms(1000));
  assert.equal(s.output("F", "faltaFase"), true);
  s.advanceTo(ms(3900));
  assert.equal(s.output("F", "tripped"), false);
  s.advanceTo(ms(4000));
  assert.equal(s.output("F", "tripped"), true);
  assert.equal(s.contact("F", "95-96"), false);
  assert.equal(s.contact("F", "97-98"), true);
  // RESET con la falta presente: no rearma; con las tres fases, sí.
  s.act("F", "reset", true, ms(4100));
  s.act("F", "reset", false, ms(4200));
  assert.equal(s.output("F", "tripped"), true);
  s.act("S", "press", false, ms(4300));
  s.act("F", "reset", true, ms(4400));
  s.act("F", "reset", false, ms(4500));
  assert.equal(s.output("F", "tripped"), false);
  // TEST dispara al instante.
  s.act("F", "test", true, ms(5000));
  assert.equal(s.output("F", "tripped"), true);
});

test("relé térmico NR2: STOP abre 95-96 sin disparar; en A se rearma solo al enfriarse", () => {
  const s = scene(
    ["R:power-3ph", "S:pushbutton-nc", { id: "F", type: "jwsim/overload-relay", params: { tripMs: 1000, rearme: "automático (A)", rearmeMs: 5000, range: "4-6 A", ajuste: 5 } }],
    ["R.L1 - S.11", "S.12 - F.1", "R.L2 - F.3", "R.L3 - F.5"],
  );
  assert.equal(s.output("F", "ajusteTxt"), "5 A (4-6)");
  assert.equal(s.output("F", "ajusteRel"), 0.5);
  s.act("F", "stop", true, ms(100));
  assert.equal(s.contact("F", "95-96"), false);
  assert.equal(s.output("F", "tripped"), false);
  s.act("F", "stop", false, ms(200));
  assert.equal(s.contact("F", "95-96"), true);
  // Falta de fase de 1 s: dispara; vuelve la fase a los 2 s y se rearma 5 s después.
  s.act("S", "press", true, ms(1000));
  s.advanceTo(ms(2000));
  assert.equal(s.output("F", "tripped"), true);
  s.act("S", "press", false, ms(2000));
  s.advanceTo(ms(6900));
  assert.equal(s.output("F", "tripped"), true);
  s.advanceTo(ms(7000));
  assert.equal(s.output("F", "tripped"), false);
  assert.equal(s.contact("F", "95-96"), true);
});

/** Red → térmico → motor W22 directo (sin contactor); el pulsador NC corta L1. */
function overloadScene(relay, motor = {}) {
  return scene(
    ["R:power-3ph", "S:pushbutton-nc", { id: "F", type: "jwsim/overload-relay", params: relay }, { id: "M", type: "jwsim/motor-3ph", params: motor }],
    ["R.L1 - S.11", "S.12 - F.1", "R.L2 - F.3", "R.L3 - F.5", "F.2 - M.U1", "F.4 - M.V1", "F.6 - M.W1"],
  );
}

test("corriente del motor: pico de arranque 6 × In, régimen según la carga, el térmico la mide por polo", () => {
  const s = overloadScene({}, { In: 3.2, carga: 100 });
  assert.equal(s.output("M", "corriente"), 19.2);
  assert.equal(s.output("F", "corriente"), 19.2);
  s.advanceTo(ms(1000));
  assert.equal(s.output("M", "corriente"), 3.2);
  assert.equal(s.output("F", "corriente"), 3.2);
  assert.equal(s.output("F", "tripped"), false);
});

test("térmico NR2 clase 10: 1,5 × ajuste < 2 min, 1,05 × no dispara, 7,2 × (rotor frenado) entre 2 y 10 s", () => {
  // 1,5 × ajuste: In 3,2 A al 100 % con el dial en 3,2 / 1,5 (más el pico de arranque).
  let s = overloadScene({ range: "1.6-2.5 A", ajuste: 3.2 / 1.5 }, { In: 3.2, carga: 100 });
  s.advanceTo(ms(60_000));
  assert.equal(s.output("F", "tripped"), false);
  s.advanceTo(ms(120_000));
  assert.equal(s.output("F", "tripped"), true);
  assert.equal(s.output("F", "sobrecarga"), true);
  assert.equal(s.contact("F", "95-96"), false);
  assert.equal(s.contact("F", "97-98"), true);
  // 1,05 × ajuste: no dispara en una hora.
  s = overloadScene({ range: "2.5-4 A", ajuste: 3.2 / 1.05 }, { In: 3.2, carga: 100 });
  s.advanceTo(ms(3_600_000));
  assert.equal(s.output("F", "tripped"), false);
  // 7,2 × ajuste: arranque pesado (10 s a 6 × In) con el dial en 6 × 1,5 / 7,2.
  s = overloadScene({ range: "1-1.6 A", ajuste: 1.25 }, { In: 1.5, carga: 100, accelMs: 10_000 });
  assert.equal(s.output("F", "corriente"), 9);
  s.advanceTo(ms(2000));
  assert.equal(s.output("F", "tripped"), false);
  s.advanceTo(ms(10_000));
  assert.equal(s.output("F", "tripped"), true);
});

test("térmico NR2: 95-96 suelta el contactor y el RESET no rearma hasta que se enfría", () => {
  const s = scene(
    ["R:power-3ph", "PS:power-24vdc", "S:pushbutton-no", "KM:contactor",
      { id: "F", type: "jwsim/overload-relay", params: { range: "1.6-2.5 A", ajuste: 2.5, tauS: 30 } },
      { id: "M", type: "jwsim/motor-3ph", params: { In: 3.2, carga: 100 } }],
    ["PS.+V1 - S.13", "S.14 - F.95", "F.96 - KM.A1", "KM.A2 - PS.-V1",
      "R.L1 - KM.1", "R.L2 - KM.3", "R.L3 - KM.5", "KM.2 - F.1", "KM.4 - F.3", "KM.6 - F.5",
      "F.2 - M.U1", "F.4 - M.V1", "F.6 - M.W1"],
  );
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(1000));
  assert.equal(s.output("M", "corriente"), 3.2);
  // 1,28 × ajuste con τ = 30 s: dispara a los ~22 s.
  s.advanceTo(ms(20_000));
  assert.equal(s.output("F", "tripped"), false);
  s.advanceTo(ms(30_000));
  assert.equal(s.output("F", "tripped"), true);
  assert.equal(s.output("KM", "closed"), false);
  assert.equal(s.output("F", "corriente"), 0);
  s.act("S", "press", false, ms(30_000));
  s.act("F", "reset", true, ms(30_100));
  s.act("F", "reset", false, ms(30_200));
  assert.equal(s.output("F", "tripped"), true, "caliente: no rearma");
  s.advanceTo(ms(45_000));
  assert.equal(s.output("F", "sobrecarga"), false);
  s.act("F", "reset", true, ms(45_000));
  s.act("F", "reset", false, ms(45_100));
  assert.equal(s.output("F", "tripped"), false);
  assert.equal(s.contact("F", "95-96"), true);
});

test("motor monofásico «2 cables»: L-N en U1-U2 arranca adelante (auxiliar puenteado de fábrica)", () => {
  const s = scene(["N:power-230vac", "S:pushbutton-no", "M:motor-1ph"], ["N.L - S.13", "S.14 - M.U1", "N.N - M.U2"]);
  assert.equal(s.output("M", "energized"), false);
  s.act("S", "press", true, ms(0));
  assert.equal(s.output("M", "corriente"), 44.8, "arranque: principal 6 × 5,6 A y auxiliar 2 × 5,6 A");
  s.advanceTo(ms(1000));
  assert.equal(s.output("M", "corriente"), 4.76, "régimen al 75 %: el centrífugo sacó el auxiliar");
  assert.equal(s.output("M", "speed"), 1);
  assert.equal(s.output("M", "rpm"), 1720);
  assert.equal(s.output("M", "direction"), 1);
  s.act("S", "press", false, ms(1000));
  s.advanceTo(ms(4000));
  assert.equal(s.output("M", "speed"), 0);
  assert.deepEqual(faults(s), []);
});

test("motor monofásico «4 cables»: sin auxiliar zumba; Z1-Z2 da el sentido y a velocidad no se invierte", () => {
  // Principal por S1; auxiliar adelante (SF: Z1 a L, Z2 a N) o atrás (SR: Z1 a N, Z2 a L).
  const s = scene(
    ["N:power-230vac", "S1:pushbutton-no", "SF:pushbutton-nono", "SR:pushbutton-nono", { id: "M", type: "jwsim/motor-1ph", params: { bornera: "4 cables" } }],
    [
      "N.L - S1.13", "S1.14 - M.U1", "N.N - M.U2",
      "N.L - SF.13", "SF.14 - M.Z1", "N.N - SF.23", "SF.24 - M.Z2",
      "N.L - SR.13", "SR.14 - M.Z2", "N.N - SR.23", "SR.24 - M.Z1",
    ],
  );
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(1000));
  assert.equal(s.output("M", "bloqueado"), true, "solo el principal: zumba");
  assert.equal(s.output("M", "speed"), 0);
  // Pulso de arranque adelante: sale a velocidad y sigue sin el auxiliar.
  s.act("SF", "press", true, ms(1000));
  s.advanceTo(ms(1300));
  s.act("SF", "press", false, ms(1300));
  assert.equal(s.output("M", "bloqueado"), false);
  s.advanceTo(ms(2000));
  assert.equal(s.output("M", "speed"), 1);
  // Auxiliar invertido a velocidad: el centrífugo está abierto, no cambia.
  s.act("SR", "press", true, ms(2000));
  s.advanceTo(ms(3000));
  assert.equal(s.output("M", "speed"), 1);
  s.act("SR", "press", false, ms(3000));
  // Se corta el principal, baja del 75 % por inercia y vuelve con el auxiliar invertido: invierte.
  s.act("S1", "press", false, ms(3000));
  s.advanceTo(ms(4000));
  assert.ok(s.output("M", "speed") < 0.75);
  s.act("SR", "press", true, ms(4000));
  s.act("S1", "press", true, ms(4000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("M", "speed"), -1);
  assert.equal(s.output("M", "direction"), -1);
  assert.deepEqual(faults(s), []);
});

test("motor de dos velocidades: baja por 1U-1V-1W, alta por 2U-2V-2W y conflicto con las dos", () => {
  const s = scene(
    ["R:power-3ph", "KL:pushbutton-no", "KH:pushbutton-no", "M:motor-2v"],
    ["R.L1 - KL.13", "KL.14 - M.1U", "R.L2 - M.1V", "R.L3 - M.1W", "R.L1 - KH.13", "KH.14 - M.2U", "R.L2 - M.2V", "R.L3 - M.2W"],
  );
  assert.equal(s.output("M", "energized"), false);
  s.act("KL", "press", true, ms(0));
  s.advanceTo(ms(3000));
  assert.equal(s.output("M", "velocidad"), "baja");
  assert.equal(s.output("M", "rpm"), 470);
  s.act("KL", "press", false, ms(3000));
  s.act("KH", "press", true, ms(3000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("M", "velocidad"), "alta");
  assert.equal(s.output("M", "rpm"), 2800);
  s.act("KL", "press", true, ms(6000));
  assert.equal(s.output("M", "conflicto"), true);
  s.advanceTo(ms(12000));
  assert.equal(s.output("M", "speed"), 0);
});

// Variador Delta VFD-EL: entrada 230 VAC por R-S, motor en triángulo en U-V-W
// y pulsadores entre MI y DCM (NPN).
const preset = (id) => vfdEl.presets.find((p) => p.id === id).params;
// Sin el bloqueo del inicio de fábrica (02.05 = 1), salvo en su prueba: las
// escenas dan la orden en t = 0, el mismo instante en que se energizan.
const VFD = (params = {}) => ({ id: "VF", type: "jwsim/vfd-el", params: { "02-05": "0: deshabilitado", ...params } });
const vfdScene = (params, extra = [], extraWires = []) =>
  scene(
    ["N:power-230vac", VFD(params), "M:motor-3ph", "S1:pushbutton-no", "S2:pushbutton-no", "S3:pushbutton-no", "S6:pushbutton-no", { id: "H", type: "jwsim/lamp", params: { rating: "230VAC" } }, ...extra],
    [
      "N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1",
      ...["1", "2", "3", "6"].map((k) => `VF.DCM - S${k}.13`), "S1.14 - VF.MI1", "S2.14 - VF.MI2", "S3.14 - VF.MI3", "S6.14 - VF.MI6",
      ...extraWires,
    ],
  );
const tap = (s, key, t) => {
  s.act("VF", key, true, ms(t));
  s.act("VF", key, false, ms(t + 50));
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} != ${b}`);

test("VFD-EL plantilla multivelocidad: MI1 opera con rampa, MI3 velocidad 1, MI2 invierte pasando por 0", () => {
  const s = vfdScene({ ...preset("multivelocidad"), "01-09": 2, "01-10": 2, pot: 50 });
  assert.equal(s.output("VF", "powered"), true);
  assert.equal(s.output("VF", "lcd"), "F30.0", "F = potenciómetro al 50 % de 60 Hz");
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(500));
  near(s.output("VF", "hz"), 15, "rampa 0-60 Hz en 2 s");
  near(s.output("M", "speed"), 0.25, "el motor sigue a la frecuencia");
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 30);
  s.act("S3", "press", true, ms(2000));
  s.advanceTo(ms(4000));
  assert.equal(s.output("VF", "hz"), 10, "05.00 = 10 Hz");
  s.act("S1", "press", false, ms(4000));
  s.act("S2", "press", true, ms(4000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("VF", "hz"), -10);
  assert.equal(s.output("M", "direction"), -1);
  assert.equal(s.output("VF", "ledRev"), true);
  assert.deepEqual(faults(s), []);
});

test("VFD-EL: la página A muestra la corriente del motor; acelerando pide más y sin pico de arranque", () => {
  const s = vfdScene({ ...preset("multivelocidad"), "01-09": 2, "01-10": 2, pot: 50 });
  tap(s, "mode", 0);
  tap(s, "mode", 100);
  assert.equal(s.output("VF", "lcd"), "A0.00");
  s.act("S1", "press", true, ms(200));
  s.advanceTo(ms(500));
  assert.equal(s.output("VF", "corriente"), 3.26, "rampa: 1,2 × 2,72 A");
  assert.equal(s.output("VF", "lcd"), "A3.26");
  s.advanceTo(ms(3000));
  assert.equal(s.output("VF", "lcd"), "A2.72");
  s.act("S1", "press", false, ms(3000));
  s.advanceTo(ms(6000));
  assert.equal(s.output("VF", "lcd"), "A0.00");
});

test("VFD-EL AVI: potenciómetro externo en 10V-AVI-ACM fija la frecuencia; con 1 y 3 cruzados, al revés", () => {
  const pot = { id: "RP", type: "jwsim/potentiometer", params: { posicion: 25 } };
  let s = vfdScene({ ...preset("avi-pot"), "01-09": 1, "01-10": 1 }, [pot], ["RP.3 - VF.+10V", "RP.2 - VF.AVI", "RP.1 - VF.ACM"]);
  assert.equal(s.output("VF", "avi"), 2.5);
  assert.equal(s.output("VF", "lcd"), "F15.0", "2,5 V de 10 V = 25 % de 60 Hz");
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(1000));
  assert.equal(s.output("VF", "hz"), 15);
  s.act("RP", "pos", 80, ms(1000));
  s.advanceTo(ms(3000));
  assert.equal(s.output("VF", "hz"), 48);
  // 04.11-04.14: 2 V = 10 %, 8 V = 90 % ⇒ 5 V da 50 % y 9 V recorta a 90 %.
  s = vfdScene({ ...preset("avi-pot"), "04-11": 2, "04-12": 10, "04-13": 8, "04-14": 90 }, [{ ...pot, params: { posicion: 50 } }],
    ["RP.1 - VF.+10V", "RP.2 - VF.AVI", "RP.3 - VF.ACM"]);
  assert.equal(s.output("VF", "lcd"), "F30.0", "cruzado: 50 % sigue siendo 5 V");
  s.act("RP", "pos", 10, ms(10));
  assert.equal(s.output("VF", "avi"), 9, "cruzado: perilla al 10 % da 9 V");
  assert.equal(s.output("VF", "lcd"), "F54.0", "recorta en 04.14 = 90 %");
  assert.deepEqual(faults(s), []);
});

test("VFD-EL ACI: calibrador 4-20 mA con Sw2 en ACI; lazo abierto da AErr (02.06 = 1) y RESET con la señal de vuelta", () => {
  const cal = { id: "CAL", type: "jwsim/signal-source", params: { modo: "4-20 mA", valor: 50 } };
  const s = vfdScene({ ...preset("aci"), "01-09": 1, "01-10": 1 }, [cal], ["CAL.+ - VF.AVI", "CAL.- - VF.ACM"]);
  assert.equal(s.output("CAL", "texto"), "12.00 mA");
  assert.equal(s.output("VF", "aci"), 12);
  assert.equal(s.output("VF", "lcd"), "F30.0");
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(1000));
  assert.equal(s.output("VF", "hz"), 30);
  // Se corta el cable del +: lazo abierto.
  const cut = s.inject({ kind: "open", wire: "CAL.+ VF.AVI" }, ms(1000));
  assert.equal(s.output("VF", "fault"), "", "filtro de 100 ms");
  s.advanceTo(ms(1100));
  assert.equal(s.output("VF", "fault"), "AErr");
  assert.equal(s.output("VF", "lcd"), "AErr");
  assert.equal(s.output("VF", "running"), false, "parada libre");
  const req = (k) => tap(s, "stop", k);
  req(1150);
  assert.equal(s.output("VF", "fault"), "AErr", "sin señal no se borra");
  s.clearFault(cut, ms(1200));
  req(1300);
  assert.equal(s.output("VF", "fault"), "");
  // La falla corta la orden: se da de nuevo.
  s.act("S1", "press", false, ms(1400));
  s.act("S1", "press", true, ms(1500));
  s.advanceTo(ms(3000));
  assert.equal(s.output("VF", "hz"), 30);
});

test("VFD-EL: Sw2 en AVI con 4-20 mA satura en 10 V y avisa; 02.06 = 2 sigue con la última frecuencia", () => {
  const cal = { id: "CAL", type: "jwsim/signal-source", params: { modo: "4-20 mA", valor: 25 } };
  let s = vfdScene({ ...preset("avi-pot") }, [cal], ["CAL.+ - VF.AVI", "CAL.- - VF.ACM"]);
  assert.equal(s.output("VF", "avi"), 10);
  assert.match(s.output("VF", "aviso"), /satura/);
  s = vfdScene({ ...preset("aci"), "02-06": "2: seguir con la última frecuencia" }, [cal], ["CAL.+ - VF.AVI", "CAL.- - VF.ACM"]);
  assert.equal(s.output("VF", "lcd"), "F15.0", "8 mA = 25 %");
  s.inject({ kind: "open", wire: "CAL.- VF.ACM" }, ms(100));
  assert.equal(s.output("VF", "fault"), "");
  assert.equal(s.output("VF", "lcd"), "F15.0");
  assert.match(s.output("VF", "aviso"), /AErr/);
});

/** Selección de parámetros: MODE hasta GG.NN y ▲ hasta el código. */
function gotoParam(s, code, t) {
  for (let i = 0; i < 5; i++) tap(s, "mode", t + i * 100);
  t += 500;
  while (s.output("VF", "lcd") !== code) {
    tap(s, "up", t);
    t += 100;
    if (t > 60000) throw new Error(`no llega a ${code}`);
  }
  return t;
}

test("VFD-EL de fábrica: bornes y AVI sin cablear (0 Hz); se programa 02.00 = 4 con el teclado y queda en la escena", () => {
  const s = vfdScene({ pot: 100, "01-09": 1, "01-10": 1 });
  assert.equal(s.output("VF", "avi"), 0);
  assert.equal(s.output("VF", "lcd"), "F0.00");
  tap(s, "run", 0);
  s.advanceTo(ms(500));
  assert.equal(s.output("VF", "running"), false, "02.01 = 1: el teclado no da la operación");
  s.act("S1", "press", true, ms(500));
  s.advanceTo(ms(1500));
  assert.equal(s.output("VF", "hz"), 0);
  s.act("S1", "press", false, ms(1500));
  // MODE: F → H → A → U → Frd → selección (00.02); ▲ hasta 02.00; ENTER; ▲▲▲ hasta 4; ENTER.
  tap(s, "mode", 1600);
  assert.equal(s.output("VF", "lcd"), "H0.00");
  tap(s, "mode", 1700);
  assert.equal(s.output("VF", "lcd"), "A0.00");
  tap(s, "mode", 1800);
  assert.equal(s.output("VF", "lcd"), "U0.00");
  tap(s, "mode", 1900);
  assert.equal(s.output("VF", "lcd"), "Frd");
  tap(s, "mode", 2000);
  assert.equal(s.output("VF", "lcd"), "00.02");
  let t = 2100;
  for (let n = 0; s.output("VF", "lcd") !== "02.00" && n < 200; n++) tap(s, "up", (t += 100));
  tap(s, "enter", (t += 100));
  assert.equal(s.output("VF", "lcd"), "1");
  for (let i = 0; i < 3; i++) tap(s, "up", (t += 100));
  assert.equal(s.output("VF", "lcd"), "4");
  tap(s, "enter", (t += 100));
  assert.equal(s.output("VF", "lcd"), "End");
  s.advanceTo(ms((t += 1100)));
  assert.equal(s.output("VF", "lcd"), "02.00");
  const saved = s.snapshot().devices.find((d) => d.id === "VF").params;
  assert.equal(saved["02-00"], "4: potenciómetro del teclado");
  assert.equal(saved["01-09"], 1);
  tap(s, "mode", (t += 100));   // de la selección vuelve a F
  assert.equal(s.output("VF", "lcd"), "F60.0");
  s.act("S1", "press", true, ms((t += 100)));
  s.advanceTo(ms((t += 1500)));
  assert.equal(s.output("VF", "hz"), 60);
  assert.equal(s.output("VF", "aviso"), "");
});

test("VFD-EL: ▲ sostenido repite y acelera; MODE sale sin guardar; un valor fuera de rango da Err", () => {
  const s = vfdScene({});
  let t = gotoParam(s, "01.09", 0);
  tap(s, "enter", (t += 100));
  assert.equal(s.output("VF", "lcd"), "10.0");
  t += 200;
  s.act("VF", "up", true, ms(t));
  assert.equal(s.output("VF", "lcd"), "10.1");
  s.advanceTo(ms(t + 400));
  assert.equal(s.output("VF", "lcd"), "10.1", "espera 0,5 s antes de repetir");
  // Repite cada 0,1 s desde 0,5 s: 10 pasos de 0,1 hasta 1,4 s; desde 1,6 s, de a 1,0.
  s.advanceTo(ms(t + 1400));
  assert.equal(s.output("VF", "lcd"), "11.1");
  s.advanceTo(ms(t + 1700));
  assert.equal(s.output("VF", "lcd"), "13.2");
  s.act("VF", "up", false, ms(t + 1700));
  tap(s, "mode", (t += 1800));
  assert.equal(s.output("VF", "lcd"), "01.09");
  tap(s, "enter", (t += 100));
  assert.equal(s.output("VF", "lcd"), "10.0", "no se guardó");
  tap(s, "mode", (t += 100));
  // 00.02 = 1 (solo lectura): cualquier otro parámetro da Err.
  for (let n = 0; s.output("VF", "lcd") !== "00.02" && n < 200; n++) tap(s, "up", (t += 100));
  tap(s, "enter", (t += 100));
  tap(s, "up", (t += 100));
  tap(s, "enter", (t += 100));
  assert.equal(s.output("VF", "lcd"), "End");
  s.advanceTo(ms((t += 1100)));
  for (let n = 0; s.output("VF", "lcd") !== "01.09" && n < 200; n++) tap(s, "up", (t += 100));
  tap(s, "enter", (t += 100));
  tap(s, "up", (t += 100));
  tap(s, "enter", (t += 100));
  assert.equal(s.output("VF", "lcd"), "Err");
});

test("VFD-EL: falla externa EF (MI6 = 14) corta la salida, relé de falla, STOP/RESET rearma y pide nueva orden", () => {
  const s = vfdScene({ ...preset("bornes"), "04-08": "14: falla externa (EF)", pot: 100, "01-09": 1, "01-10": 1 }, [], ["N.L - VF.RC", "VF.RA - H.X1", "H.X2 - N.N"]);
  s.act("S1", "press", true, ms(0));
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 60);
  assert.equal(s.output("H", "lit"), false);
  s.act("S6", "press", true, ms(2000));
  assert.equal(s.output("VF", "fault"), "EF");
  assert.equal(s.output("VF", "lcd"), "EF");
  assert.equal(s.output("VF", "running"), false, "02.02 = 0: EF para libre");
  assert.equal(s.output("H", "lit"), true, "RA-RC cierra con falla (03.00 = 8)");
  s.advanceTo(ms(5000));
  assert.ok(s.output("M", "speed") < 1, "el motor frena por inercia");
  tap(s, "stop", 5000);
  assert.equal(s.output("VF", "fault"), "EF", "con la causa presente no rearma");
  s.act("S6", "press", false, ms(5200));
  tap(s, "stop", 5300);
  assert.equal(s.output("VF", "fault"), "");
  s.advanceTo(ms(7000));
  assert.equal(s.output("VF", "hz"), 0, "con MI1 aún cerrado no rearranca solo");
  s.act("S1", "press", false, ms(7000));
  s.act("S1", "press", true, ms(7100));
  s.advanceTo(ms(9000));
  assert.equal(s.output("VF", "hz"), 60);
});

test("VFD-EL: bloqueo del inicio (02.05 = 1): con MI1 cerrado al energizar no arranca hasta dar la orden de nuevo", () => {
  const s = scene(
    ["N:power-230vac", "Q:pushbutton-no", VFD({ ...preset("bornes"), "02-05": "1: habilitado", pot: 100, "01-09": 1 }), "M:motor-3ph", "S1:pushbutton-no"],
    ["N.L - Q.13", "Q.14 - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1", "VF.DCM - S1.13", "S1.14 - VF.MI1"],
  );
  s.act("S1", "press", true, ms(0));
  s.act("Q", "press", true, ms(100));
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "powered"), true);
  assert.equal(s.output("VF", "running"), false);
  s.act("S1", "press", false, ms(2000));
  s.act("S1", "press", true, ms(2100));
  s.advanceTo(ms(3500));
  assert.equal(s.output("VF", "hz"), 60);
});

test("VFD-EL 3 cables: MI1 opera con un pulso, MI3 (NC) para", () => {
  const s = scene(
    ["N:power-230vac", VFD({ ...preset("tres-cables"), pot: 50, "01-09": 1, "01-10": 1 }), "M:motor-3ph", "S1:pushbutton-no", "S0:pushbutton-nc"],
    ["N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1", "VF.DCM - S1.13", "S1.14 - VF.MI1", "VF.DCM - S0.11", "S0.12 - VF.MI3"],
  );
  s.act("S1", "press", true, ms(100));
  s.act("S1", "press", false, ms(300));
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 30);
  s.act("S0", "press", true, ms(2000));
  s.act("S0", "press", false, ms(2200));
  s.advanceTo(ms(4000));
  assert.equal(s.output("VF", "hz"), 0);
  assert.equal(s.output("VF", "running"), false);
});

test("VFD-EL motopotenciómetro: MI3 (UP) sube 02.11 según la rampa mientras se mantiene", () => {
  const s = vfdScene({ ...preset("motopot") });
  s.act("S1", "press", true, ms(0));
  s.act("S3", "press", true, ms(0));
  s.advanceTo(ms(2000));
  s.act("S3", "press", false, ms(2000));
  near(s.output("VF", "fRef"), 12, "6 Hz/s (60 Hz en 10 s) durante 2 s");
  s.advanceTo(ms(5000));
  near(s.output("VF", "hz"), 12);
  assert.equal(s.snapshot().devices.find((d) => d.id === "VF").params["02-11"], 12, "la frecuencia queda en 02.11");
});

test("VFD-EL por Modbus RTU: parámetros GGNNH, 2001H, 2000H, monitoreo, excepciones y pérdida de comunicación", () => {
  const s = scene(
    ["N:power-230vac", VFD({ ...preset("modbus"), "09-00": 3 }), "M:motor-3ph", "plc:jwplc-basic"],
    ["N.L - VF.R", "N.N - VF.S", "VF.U - M.U1", "VF.V - M.V1", "VF.W - M.W1", "plc.RS485_A - VF.SG+", "plc.RS485_B - VF.SG-"],
  );
  const req = (bytes, t) => s.modbusRequest(withCrc(bytes), { t: ms(t), baud: 9600 });
  // 01.09 = 2,0 s y 01.10 = 1,0 s (décimas); se lee 02.00 = 3.
  assert.ok(req([3, 6, 0x01, 0x09, 0x00, 20], 0));
  assert.ok(req([3, 6, 0x01, 0x0a, 0x00, 10], 5));
  assert.deepEqual(req([3, 3, 0x02, 0x00, 0x00, 0x01], 8).bytes.slice(0, 5), [3, 3, 2, 0, 3]);
  // 2001H = 45,00 Hz y 2000H = operar + adelante (0x12).
  assert.ok(req([3, 6, 0x20, 0x01, 0x11, 0x94], 10));
  assert.ok(req([3, 6, 0x20, 0x00, 0x00, 0x12], 20));
  s.advanceTo(ms(2000));
  assert.equal(s.output("VF", "hz"), 45);
  assert.deepEqual(req([3, 3, 0x21, 0x02, 0x00, 0x02], 2000).bytes.slice(0, 7), [3, 3, 4, 0x11, 0x94, 0x11, 0x94], "2102H F y 2103H H");
  // 2104H: corriente del motor W22 (In 3,2 A al 75 % = 2,72 A) × 10.
  assert.deepEqual(req([3, 3, 0x21, 0x04, 0x00, 0x01], 2000).bytes.slice(3, 5), [0, 27], "2104H corriente");
  const st = req([3, 3, 0x21, 0x01, 0x00, 0x01], 2000).bytes;
  assert.equal(((st[3] << 8) | st[4]) & 0b11, 0b11, "2101H: operando");
  assert.equal(((st[3] << 8) | st[4]) >> 10 & 1, 1, "2101H bit 10: comando por comunicación");
  req([3, 6, 0x20, 0x00, 0x00, 0x22], 2000);
  s.advanceTo(ms(5000));
  assert.equal(s.output("VF", "hz"), -45);
  req([3, 6, 0x20, 0x00, 0x00, 0x01], 5000);
  s.advanceTo(ms(6500));
  assert.equal(s.output("VF", "hz"), 0);
  assert.equal(s.snapshot().devices.find((d) => d.id === "VF").params["01-09"], 2, "lo escrito por Modbus queda en la escena");
  // Excepciones: dirección inexistente (02) y valor fuera de rango (03), con CExx en la pantalla.
  assert.deepEqual(req([3, 6, 0x10, 0x00, 0x00, 0x01], 6500).bytes.slice(0, 3), [3, 0x86, 2]);
  assert.deepEqual(req([3, 6, 0x01, 0x09, 0x00, 0x00], 6600).bytes.slice(0, 3), [3, 0x86, 3]);
  s.advanceTo(ms(6700));
  assert.equal(s.output("VF", "lcd"), "CE03");
  // EF por 2002H bit 0: 2100H = 8 y Pr.06.08 = 8; reset con bit 1.
  req([3, 6, 0x20, 0x02, 0x00, 0x01], 8000);
  assert.equal(s.output("VF", "fault"), "EF");
  assert.deepEqual(req([3, 3, 0x21, 0x00, 0x00, 0x01], 8000).bytes.slice(3, 5), [0, 8]);
  assert.deepEqual(req([3, 3, 0x06, 0x08, 0x00, 0x01], 8000).bytes.slice(3, 5), [0, 8]);
  req([3, 6, 0x20, 0x02, 0x00, 0x02], 8100);
  assert.equal(s.output("VF", "fault"), "");
  // Sin comunicación 3 s (09.03) con 09.02 = 1: CE10 y para en rampa.
  req([3, 6, 0x20, 0x00, 0x00, 0x12], 9000);
  s.advanceTo(ms(11000));
  assert.equal(s.output("VF", "hz"), 45);
  s.advanceTo(ms(12100));
  assert.equal(s.output("VF", "lcd"), "CE10");
  s.advanceTo(ms(14000));
  assert.equal(s.output("VF", "hz"), 0);
  // La dirección cambia en marcha (09.00 = 5) y en ASCII (09.04 = 0) no contesta a RTU.
  assert.ok(req([3, 6, 0x09, 0x00, 0x00, 0x05], 14000));
  assert.equal(req([3, 3, 0x21, 0x00, 0x00, 0x01], 14100), null);
  assert.ok(req([5, 6, 0x09, 0x04, 0x00, 0x00], 14200));
  assert.equal(req([5, 3, 0x21, 0x00, 0x00, 0x01], 14300), null);
});
