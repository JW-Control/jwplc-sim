// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G7_NETLIST: casos eléctricos de la netlist simplificada de
// 24 VDC / 230 VAC. node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { analyze, parseRating, solve } from "../netlist.mjs";
import { faults, ms, scene } from "./helpers.mjs";

const PS = { id: "PS", pos: "PS.+V1", neg: "PS.-V1", kind: "DC", volts: 24 };

test("netlist pura: carga entre polos, sin camino y en serie", () => {
  const load = (id, a, b) => ({ id, a, b, rating: "24VDC" });
  const r = solve({
    wires: [["PS.+V1", "H1.X1"], ["H1.X2", "PS.-V1"], ["PS.+V1", "H2.X1"], ["H2.X2", "H3.X1"], ["H3.X2", "PS.-V1"]],
    sources: [PS],
    switches: [],
    loads: [load("H1", "H1.X1", "H1.X2"), load("H2", "H2.X1", "H2.X2"), load("H3", "H3.X1", "H3.X2"), load("H4", "H4.X1", "H4.X2")],
  });
  assert.equal(r.loads.get("H1").on, true);
  assert.equal(r.loads.get("H1").polarity, 1);
  assert.equal(r.loads.get("H2").on, false, "dos cargas en serie no se energizan (simplificación documentada)");
  assert.equal(r.loads.get("H3").on, false);
  assert.equal(r.loads.get("H4").on, false);
  assert.deepEqual(r.faults, []);
  assert.deepEqual(parseRating("230VAC"), { volts: 230, kind: "AC" });
  assert.throws(() => parseRating("24V"), /tensión nominal inválida/);
});

test("cortocircuito al pulsar: la fuente dispara, las cargas caen y queda disparada hasta rearmar", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "H:lamp"],
    ["PS.+V1 - S.13", "S.14 - PS.-V1", "PS.+V1 - H.X1", "H.X2 - PS.-V1"],
  );
  assert.equal(s.output("H", "lit"), true);
  s.act("S", "press", true, ms(10));
  assert.deepEqual(faults(s), ["short:PS"]);
  assert.match(s.snapshot().faults[0].message, /Cortocircuito en PS: PS\.\+V1 y PS\.-V1/);
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("PS", "on"), false);
  s.act("S", "press", false, ms(20));
  assert.equal(s.output("H", "lit"), false, "la protección no se rearma sola");
  s.rearm(ms(30));
  assert.equal(s.output("H", "lit"), true);
  assert.deepEqual(faults(s), ["short:PS"]);
});

test("rearmar con el cortocircuito presente vuelve a disparar", () => {
  const s = scene(["PS:power-24vdc", "S:pushbutton-no"], ["PS.+V1 - S.13", "S.14 - PS.-V1"]);
  s.act("S", "press", true, ms(1));
  s.rearm(ms(2));
  assert.deepEqual(faults(s), ["short:PS", "short:PS"]);
});

test("cortocircuito a través de un contacto principal del contactor", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "KM:contactor"],
    ["PS.+V1 - S.13", "S.14 - KM.A1", "KM.A2 - PS.-V1", "PS.+V1 - KM.1", "KM.2 - PS.-V1"],
  );
  s.act("S", "press", true, ms(0));
  s.advanceTo(ms(19));
  assert.deepEqual(faults(s), []);
  s.advanceTo(ms(20));
  assert.deepEqual(faults(s), ["short:PS"], "dispara cuando el polo cierra, no antes");
  s.advanceTo(ms(100));
  assert.equal(s.output("KM", "closed"), false, "sin tensión la bobina cae");
  assert.deepEqual(faults(s), ["short:PS"], "y la fuente queda disparada (sin oscilar)");
});

test("cruce de alimentaciones 24 VDC con 230 VAC: disparan ambas", () => {
  const s = scene(
    ["PS:power-24vdc", "L:power-230vac", "S:pushbutton-no", "H:lamp"],
    ["PS.+V1 - S.13", "S.14 - L.L", "PS.+V1 - H.X1", "H.X2 - PS.-V1"],
  );
  assert.equal(s.output("H", "lit"), true);
  s.act("S", "press", true, ms(1));
  assert.deepEqual(faults(s), ["cross:"]);
  assert.match(s.snapshot().faults[0].message, /Cruce de alimentaciones entre L y PS/);
  assert.equal(s.output("H", "lit"), false);
  assert.equal(s.output("L", "on"), false);
});

test("dos fuentes de 24 VDC con el 0 V común: sin falla", () => {
  const s = scene(
    ["PS1:power-24vdc", "PS2:power-24vdc", "H1:lamp", "H2:lamp"],
    ["PS1.-V1 - PS2.-V1", "PS1.+V1 - H1.X1", "H1.X2 - PS1.-V1", "PS2.+V1 - H2.X1", "H2.X2 - PS1.-V1"],
  );
  assert.deepEqual(faults(s), []);
  assert.equal(s.output("H1", "lit"), true);
  assert.equal(s.output("H2", "lit"), true, "H2 vuelve por el 0 V común");
});

test("bobina sin alimentación (análisis estático): A2 sin cablear o sin retorno", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "KM1:contactor", "KM2:contactor", "K3:relay"],
    ["PS.+V1 - S.13", "S.14 - KM1.A1", "S.14 - KM2.A1", "KM2.A2 - K3.A1"],
  );
  const msg = Object.fromEntries(s.findings.map((f) => [f.load, f.message]));
  assert.match(msg["KM1.coil"], /^Bobina sin alimentación: KM1\.coil nunca se energiza \(KM1\.A2 sin cablear\)/);
  assert.match(msg["KM2.coil"], /KM2\.A2 no llega a ningún polo de alimentación/);
  assert.ok(!("K3.coil" in msg) || /K3/.test(msg["K3.coil"]));
  s.act("S", "press", true, ms(1));
  s.advanceTo(ms(50));
  assert.equal(s.output("KM1", "closed"), false);
});

test("análisis estático: una bobina mandada por contactos abiertos sí puede energizarse (sin aviso)", () => {
  const s = scene(
    ["PS:power-24vdc", "S:pushbutton-no", "KM:contactor", "H:lamp"],
    ["PS.+V1 - S.13", "S.14 - KM.A1", "KM.A2 - PS.-V1", "PS.+V1 - KM.13", "KM.14 - H.X1", "H.X2 - PS.-V1"],
  );
  assert.deepEqual(s.findings, []);
  // Y un dispositivo sin ningún cable no avisa (todavía no se cableó).
  const r = analyze(
    { wires: [], sources: [PS], switches: [], loads: [{ id: "K.coil", a: "K.A1", b: "K.A2", rating: "24VDC", coil: true }] },
    new Set(),
  );
  assert.deepEqual(r, []);
});

test("sobretensión: bobina de 24 VDC en 230 VAC se quema y queda fuera hasta reponerla", () => {
  const s = scene(
    ["L:power-230vac", "S:pushbutton-no", "KM:contactor"],
    ["L.L - S.13", "S.14 - KM.A1", "KM.A2 - L.N"],
  );
  s.act("S", "press", true, ms(1));
  assert.deepEqual(faults(s), ["overvoltage:KM"]);
  s.advanceTo(ms(100));
  assert.equal(s.output("KM", "closed"), false);
  s.act("S", "press", false, ms(110));
  s.rearm(ms(120));
  s.act("S", "press", true, ms(130));
  assert.deepEqual(faults(s), ["overvoltage:KM", "overvoltage:KM"], "repuesta, se vuelve a quemar");
});

test("bobina de 230 VAC en 24 VDC: tensión insuficiente, no atrae", () => {
  const s = scene(
    ["PS:power-24vdc", { id: "KM", type: "jwsim/contactor", params: { coil: "230VAC" } }],
    ["PS.+V1 - KM.A1", "KM.A2 - PS.-V1"],
  );
  s.advanceTo(ms(100));
  assert.equal(s.output("KM", "closed"), false);
  assert.ok(s.warnings.some((w) => w.type === "undervoltage" && w.load === "KM.coil"));
});

test("contactos auxiliares: autorretención con 13-14 y enclavamiento con 21-22", () => {
  // KM1 se retiene con su 13-14; KM2 no puede entrar mientras KM1 está (21-22 de KM1 en serie).
  const s = scene(
    ["PS:power-24vdc", "S0:pushbutton-nc", "S1:pushbutton-no", "S2:pushbutton-no", "KM1:contactor", "KM2:contactor"],
    [
      "PS.+V1 - S0.11", "S0.12 - S1.13", "S1.14 - KM1.A1", "S0.12 - KM1.13", "KM1.14 - KM1.A1", "KM1.A2 - PS.-V1",
      "S0.12 - S2.13", "S2.14 - KM1.21", "KM1.22 - KM2.A1", "KM2.A2 - PS.-V1",
    ],
  );
  s.act("S1", "press", true, ms(0));
  s.act("S1", "press", false, ms(50));
  s.advanceTo(ms(100));
  assert.equal(s.output("KM1", "closed"), true, "autorretención");
  s.act("S2", "press", true, ms(100));
  s.advanceTo(ms(200));
  assert.equal(s.output("KM2", "closed"), false, "enclavado por el 21-22 de KM1");
  s.act("S2", "press", false, ms(200));
  s.act("S0", "press", true, ms(300));
  s.advanceTo(ms(400));
  assert.equal(s.output("KM1", "closed"), false, "parada");
});

test("relé que se corta a sí mismo: sin retardo oscila (falla); con retardo vibra", () => {
  const wiring = ["PS.+V1 - K.11", "K.12 - K.A1", "K.A2 - PS.-V1"];
  const zero = scene(["PS:power-24vdc", { id: "K", type: "jwsim/relay", params: { pullInMs: 0, dropOutMs: 0 } }], wiring);
  assert.ok(faults(zero).includes("oscillation:"));

  const s = scene(["PS:power-24vdc", "K:relay"], wiring);
  s.advanceTo(ms(120));
  const toggles = s.events.filter((e) => e.kind === "output" && e.device === "K" && e.key === "closed");
  // Atraque 8 ms + caída 4 ms: un ciclo cada 12 ms → ~20 cambios en 120 ms.
  assert.ok(toggles.length >= 18 && toggles.length <= 21, `cambios: ${toggles.length}`);
});

test("cableado inválido: borne o dispositivo inexistente", () => {
  assert.throws(() => scene(["PS:power-24vdc"], ["PS.+V1 - X.1"]), /dispositivo inexistente en "X\.1"/);
  assert.throws(() => scene(["PS:power-24vdc", "H:lamp"], ["PS.+V1 - H.A1"]), /no tiene el borne "A1"/);
  assert.throws(() => scene(["PS:power-24vdc", "PS:lamp"], []), /identificador repetido/);
});

test("determinismo: la misma escena y acciones dan la misma secuencia de eventos", () => {
  const run = () => {
    const s = scene(
      ["PS:power-24vdc", "S:pushbutton-no", "Y:solenoid-valve", "K:relay",
        { id: "B", type: "jwsim/limit-switch", params: { source: "Y.position", min: 1, max: 1 } }],
      ["PS.+V1 - S.13", "S.14 - Y.A1", "Y.A2 - PS.-V1", "PS.+V1 - B.13", "B.14 - K.A1", "K.A2 - PS.-V1"],
    );
    s.act("S", "press", true, ms(3));
    s.advanceTo(ms(700));
    s.act("S", "press", false, ms(700));
    s.advanceTo(ms(1500));
    return JSON.stringify(s.events, (_k, v) => (typeof v === "bigint" ? String(v) : v));
  };
  assert.equal(run(), run());
});

// ---------------------------------------------------------------- trifásico
const R3 = { id: "R", kind: "AC3", volts: 220, phases: { L1: "R.L1", L2: "R.L2", L3: "R.L3" } };

test("trifásico: bobina de 230 VAC entre dos fases se energiza con 220 V", () => {
  const r = solve({
    wires: [["R.L1", "K.A1"], ["K.A2", "R.L2"]],
    sources: [R3],
    switches: [],
    loads: [{ id: "K", a: "K.A1", b: "K.A2", rating: "230VAC", coil: true }],
  });
  assert.equal(r.loads.get("K").on, true);
  assert.equal(r.loads.get("K").volts, 220);
  assert.equal(r.loads.get("K").kind, "AC");
  assert.deepEqual(r.faults, []);
  assert.deepEqual(r.phaseOf("K.A1"), { source: "R", phase: "L1", volts: 220, hz: null, controlled: false });
  assert.equal(r.phaseOf("K.X"), null);
});

test("trifásico: dos fases unidas son un cortocircuito y la red dispara", () => {
  const r = solve({ wires: [["R.L1", "X.1"], ["X.1", "R.L3"]], sources: [R3], switches: [], loads: [] });
  assert.deepEqual(r.faults.map((f) => f.type), ["short"]);
  assert.match(r.faults[0].message, /Cortocircuito entre fases en R: L1 y L3/);
  assert.ok(r.tripped.has("R"));
});

test("trifásico: una fase unida al +24 V es un cruce de alimentaciones", () => {
  const r = solve({ wires: [["R.L2", "PS.+V1"]], sources: [R3, PS], switches: [], loads: [] });
  assert.deepEqual(r.faults.map((f) => f.type), ["cross"]);
  assert.deepEqual(r.faults[0].sources, ["PS", "R"]);
});
