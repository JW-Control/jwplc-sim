// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Componentes declarativos (scene/component.mjs): validación, E/S, modelo
// por bloques y esclavo Modbus a partir del mapa de registros.
// node --test scene/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildComponent, checkComponent } from "../component.mjs";
import { compileExpr } from "../expr.mjs";
import { withCrc } from "../modbus.mjs";
import { Registry } from "../devices/index.mjs";
import { Scene } from "../scene.mjs";

const ms = (v) => BigInt(Math.round(v * 1e6));
const sceneOf = (defs, devices, wiring) => {
  const reg = new Registry();
  for (const d of defs) reg.add(d);
  return new Scene(
    {
      devices: devices.map((d) => (typeof d === "string" ? { id: d.split(":")[0], type: d.split(":")[1].includes("/") ? d.split(":")[1] : `jwsim/${d.split(":")[1]}` } : d)),
      wiring: wiring.map((w) => {
        const [from, to] = w.split(/\s+-\s+/);
        return { from, to };
      }),
    },
    { registry: reg },
  );
};
const base = { format: "jwcomp/1", version: "1.0.0" };

// Horno: resistencia R1-R2 (24 VDC), 1.er orden, termostato y PT100.
const horno = {
  ...base,
  type: "utec/horno",
  name: "Horno de prueba",
  stepMs: 100,
  parameters: [
    { id: "Ta", label: "Ambiente", type: "number", default: 25, unit: "°C" },
    { id: "tau", label: "τ", type: "number", default: 60, unit: "s" },
  ],
  io: [
    { kind: "digital-in", var: "calefactor", a: "R1", b: "R2", rating: "24VDC" },
    { kind: "digital-out", var: "alarma", a: "TS1", b: "TS2" },
    { kind: "analog-out", var: "T", signal: "pt100", terminals: ["PT1", "PT2", "PT3"] },
  ],
  blocks: [
    { block: "tf", in: "calefactor", out: "y", model: "1.er orden", K: 100, tau1: "tau" },
    { block: "expr", out: "T", expr: "Ta + y" },
    { block: "compare", in: "T", out: "alarma", high: 80, low: 75 },
  ],
};

test("expresiones: aritmética, precedencia, comparaciones, funciones y errores claros", () => {
  const ev = (s, v = {}) => compileExpr(s).fn(v);
  assert.equal(ev("1 + 2 * 3"), 7);
  assert.equal(ev("(1 + 2) * 3"), 9);
  assert.equal(ev("2 ^ 3 ^ 2"), 512);
  assert.equal(ev("-x ^ 2", { x: 3 }), -9);
  assert.equal(ev("a > 2 && b <= 1 ? 10 : 20", { a: 3, b: 1 }), 10);
  assert.equal(ev("clamp(x, 0, 100) + max(1, 2, 3)", { x: 150 }), 103);
  assert.equal(ev("!(1 == 2)"), 1);
  assert.deepEqual(compileExpr("Ta + k*y").vars.sort(), ["Ta", "k", "y"]);
  assert.throws(() => compileExpr("1 +"), /termina antes/);
  assert.throws(() => compileExpr("foo(1)"), /función desconocida «foo»/);
  assert.throws(() => compileExpr("a = 1"), /carácter no válido/);
  assert.throws(() => compileExpr("constructor.constructor('x')()"), /carácter no válido|fuera de lugar|sobra/);
});

test("validación: errores juntos y con el nombre de lo que falla", () => {
  const bad = {
    ...base,
    type: "utec/malo",
    name: "x",
    io: [
      { kind: "digital-in", var: "u", a: "X1", b: "X1" },
      { kind: "analog-out", var: "nada", signal: "0-10V", a: "AO+", b: "AO-" },
    ],
    blocks: [
      { block: "expr", out: "a", expr: "b + 1" },
      { block: "expr", out: "b", expr: "a * 2" },
      { block: "tf", in: "u", out: "y", K: "Kx" },
    ],
  };
  const err = (() => {
    try {
      checkComponent(bad);
    } catch (e) {
      return e;
    }
  })();
  assert.ok(err, "debe fallar");
  const all = err.errors.join("\n");
  assert.match(all, /el borne «X1» ya lo usa/);
  assert.match(all, /«nada» no existe/);
  assert.match(all, /«Kx» no es un número ni un parámetro/);
  // El ciclo se informa cuando lo demás está bien.
  const loop = { ...bad, io: [], blocks: bad.blocks.slice(0, 2) };
  assert.throws(() => checkComponent(loop), /ciclo entre bloques sin memoria: .*a.*b/);
  assert.throws(() => checkComponent({ ...horno, type: "jwsim/horno" }), /biblioteca incluida/);
});

test("horno: 1.er orden exacto contra la solución analítica, termostato con histéresis y PT100", () => {
  const def = buildComponent(horno);
  assert.deepEqual(def.terminals.map((t) => t.id), ["R1", "R2", "TS1", "TS2", "PT1", "PT2", "PT3"]);
  assert.deepEqual(def.parameters.map((p) => p.id), ["Ta", "tau", "stepMs"]);
  const s = sceneOf([def], ["PS:power-24vdc", "S1:selector-2", "H1:utec/horno"], ["PS.+V1 - S1.13", "S1.14 - H1.R1", "H1.R2 - PS.-V1"]);
  s.advanceTo(ms(1000));
  assert.equal(s.output("H1", "T"), 25, "sin calentar queda en el ambiente");
  s.act("S1", "position", 1, ms(1000));
  for (const sec of [30, 60, 120]) {
    s.advanceTo(ms(1000 + sec * 1000));
    const exact = 25 + 100 * (1 - Math.exp(-sec / 60));
    assert.ok(Math.abs(s.output("H1", "T") - exact) < 1e-6, `T(${sec} s) = ${s.output("H1", "T")} ≈ ${exact}`);
  }
  // T llega a 80 °C en t = −60·ln(1 − 55/100) ≈ 47,9 s: la alarma cierra TS1-TS2 en el paso siguiente.
  assert.equal(s.output("H1", "alarma"), 1);
  assert.equal(s.contact("H1", "do0_alarma"), true);
  assert.ok(Math.abs(s.output("H1", "ao_T") - s.output("H1", "T")) < 1e-9, "la PT100 entrega la temperatura");
  s.act("S1", "position", 0, ms(130_000));
  // Enfría: la alarma se mantiene hasta bajar de 75 °C (histéresis).
  s.advanceTo(ms(130_000 + 5000));
  assert.ok(s.output("H1", "T") > 75 && s.output("H1", "alarma") === 1);
  s.advanceTo(ms(130_000 + 60_000));
  assert.ok(s.output("H1", "T") < 75 && s.output("H1", "alarma") === 0);
});

test("analógicas: salida 4-20 mA de un componente a la entrada de otro, con escala y lazo abierto", () => {
  const tx = buildComponent({
    ...base,
    type: "utec/transmisor",
    name: "Transmisor",
    io: [
      { kind: "power", a: "V+", b: "V-", rating: "24VDC" },
      { kind: "control", var: "nivel", control: "slider", min: 0, max: 200, default: 50 },
      { kind: "analog-out", var: "nivel", signal: "4-20mA", a: "AO+", b: "AO-", min: 0, max: 200 },
    ],
  });
  const rx = buildComponent({
    ...base,
    type: "utec/indicador",
    name: "Indicador",
    io: [{ kind: "analog-in", var: "pct", signal: "4-20mA", a: "AI+", b: "AI-", min: 0, max: 100 }],
    blocks: [{ block: "expr", out: "ok", expr: "pct >= 0" }],
  });
  const wires = ["TX.AO+ - RX.AI+", "TX.AO- - RX.AI-"];
  const s = sceneOf([tx, rx], ["PS:power-24vdc", "TX:utec/transmisor", "RX:utec/indicador"], ["PS.+V1 - TX.V+", "TX.V- - PS.-V1", ...wires]);
  s.advanceTo(ms(10));
  assert.equal(s.output("TX", "ao_nivel"), 8, "50 de 0-200 → 8 mA");
  assert.equal(s.output("RX", "pct"), 25);
  s.act("TX", "nivel", 200, ms(20));
  s.advanceTo(ms(30));
  assert.equal(s.output("RX", "pct"), 100);
  // Sin alimentación el transmisor da 0 mA: la entrada lo ve como lazo abierto.
  const off = sceneOf([tx, rx], ["TX:utec/transmisor", "RX:utec/indicador"], wires);
  off.advanceTo(ms(10));
  assert.ok(Number.isNaN(off.output("RX", "pct")));
});

test("temporizadores a la conexión y a la desconexión en el instante exacto", () => {
  const def = buildComponent({
    ...base,
    type: "utec/tiempos",
    name: "Tiempos",
    io: [{ kind: "control", var: "x", control: "switch" }],
    blocks: [
      { block: "timer", in: "x", out: "ton", mode: "on", ms: 2000 },
      { block: "timer", in: "x", out: "tof", mode: "off", ms: 3000 },
    ],
  });
  const s = sceneOf([def], ["T:utec/tiempos"], []);
  s.act("T", "x", true, ms(1000));
  s.advanceTo(ms(2999));
  assert.deepEqual([s.output("T", "ton"), s.output("T", "tof")], [0, 1]);
  s.advanceTo(ms(3000));
  assert.equal(s.output("T", "ton"), 1);
  s.act("T", "x", false, ms(5000));
  s.advanceTo(ms(7999));
  assert.deepEqual([s.output("T", "ton"), s.output("T", "tof")], [0, 1]);
  s.advanceTo(ms(8000));
  assert.equal(s.output("T", "tof"), 0);
});

test("Modbus RTU desde el mapa: lectura escalada, float32, escritura de consigna, bobinas y sin alimentación", () => {
  const def = buildComponent({
    ...base,
    type: "utec/control-rs485",
    name: "Controlador RS-485",
    vars: { consigna: 30, marcha: 0 },
    io: [{ kind: "power", a: "+", b: "-", rating: "24VDC" }],
    blocks: [
      { block: "expr", out: "T", expr: "21.5" },
      { block: "expr", out: "listo", expr: "marcha && T < consigna" },
    ],
    modbus: {
      address: 7,
      baud: 19200,
      input: [{ reg: 0, var: "T", scale: 10 }, { reg: 1, var: "T", type: "float32" }],
      holding: [{ reg: 0, var: "consigna", scale: 10, write: true, min: 0, max: 100 }],
      coils: [{ bit: 0, var: "marcha", write: true }],
      discrete: [{ bit: 0, var: "listo" }],
    },
  });
  assert.deepEqual(def.terminals.map((t) => t.id), ["+", "-", "A", "B"]);
  const wiring = ["PS.+V1 - plc.24VDC", "PS.-V1 - plc.M0", "plc.RS485_A - C.A", "plc.RS485_B - C.B"];
  const s = sceneOf([def], ["plc:jwplc-basic", "PS:power-24vdc", "C:utec/control-rs485"], [...wiring, "PS.+V1 - C.+", "C.- - PS.-V1"]);
  const at = (t) => ({ t: ms(t), baud: 19200 });
  const regs = (r) => Array.from({ length: r.bytes[2] / 2 }, (_, k) => (r.bytes[3 + 2 * k] << 8) | r.bytes[4 + 2 * k]);
  const r = s.modbusRequest(withCrc([7, 4, 0, 0, 0, 3]), at(10));
  const [t10, hi, lo] = regs(r);
  assert.equal(t10, 215);
  const f = new DataView(new ArrayBuffer(4));
  f.setUint16(0, hi);
  f.setUint16(2, lo);
  assert.equal(f.getFloat32(0), 21.5);
  assert.equal(s.modbusRequest(withCrc([7, 4, 0, 0, 0, 1]), { t: ms(11), baud: 9600 }), null, "otra velocidad: no responde");
  // Escribe la consigna (FC06) y la lee (FC03); fuera de rango: excepción 03.
  assert.deepEqual(s.modbusRequest(withCrc([7, 6, 0, 0, 0x01, 0xf4]), at(20)).bytes.slice(0, 6), [7, 6, 0, 0, 1, 0xf4]);
  assert.deepEqual(regs(s.modbusRequest(withCrc([7, 3, 0, 0, 0, 1]), at(30))), [500]);
  assert.deepEqual(s.modbusRequest(withCrc([7, 6, 0, 0, 0x04, 0xb0]), at(31)).bytes.slice(0, 3), [7, 0x86, 3]);
  // Bobina de marcha (FC05) y entrada discreta calculada (FC02).
  s.modbusRequest(withCrc([7, 5, 0, 0, 0xff, 0]), at(40));
  s.advanceTo(ms(50));
  assert.deepEqual(s.modbusRequest(withCrc([7, 2, 0, 0, 0, 1]), at(60)).bytes.slice(0, 4), [7, 2, 1, 1]);
  // Registro inexistente: excepción 02; input register no se escribe.
  assert.deepEqual(s.modbusRequest(withCrc([7, 4, 0, 9, 0, 1]), at(70)).bytes.slice(0, 3), [7, 0x84, 2]);
  // Sin alimentación no responde.
  const off = sceneOf([def], ["plc:jwplc-basic", "PS:power-24vdc", "C:utec/control-rs485"], wiring);
  assert.equal(off.modbusRequest(withCrc([7, 4, 0, 0, 0, 1]), at(10)), null);
});

test("integrador con límites (tanque) y tabla con interpolación", () => {
  const def = buildComponent({
    ...base,
    type: "utec/tanque",
    name: "Tanque",
    stepMs: 100,
    io: [{ kind: "control", var: "bomba", control: "switch" }],
    blocks: [
      { block: "expr", out: "caudal", expr: "bomba ? 2 : -1" },
      { block: "integrator", in: "caudal", out: "nivel", min: 0, max: 100, y0: 10 },
      { block: "table", in: "nivel", out: "volumen", points: [[0, 0], [50, 20], [100, 100]] },
    ],
  });
  const s = sceneOf([def], ["T:utec/tanque"], []);
  s.advanceTo(ms(5000));
  assert.ok(Math.abs(s.output("T", "nivel") - 5) < 1e-9, "baja 1 %/s");
  s.act("T", "bomba", true, ms(5000));
  s.advanceTo(ms(25_000));
  assert.ok(Math.abs(s.output("T", "nivel") - 45) < 1e-9, "sube 2 %/s");
  assert.ok(Math.abs(s.output("T", "volumen") - 18) < 1e-9, "45 % → 18 por la tabla");
  s.advanceTo(ms(60_000));
  assert.equal(s.output("T", "nivel"), 100, "se limita en 100");
});
