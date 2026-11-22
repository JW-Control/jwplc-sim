// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Esquema normalizado IEC generado de la escena. node --test scene/tests/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { contactIsNC, gridCol, gridRow, iecModel } from "../iec.mjs";
import { Scene } from "../scene.mjs";

/** Referencia «hoja-FilaColumna» del punto de un elemento. */
const refOf = (s, e) => `${s.n}-${String.fromCharCode(64 + gridRow(s, e.y))}${gridCol(s, e.x)}`;

const montacargas = () =>
  JSON.parse(readFileSync(new URL("../../JWPLC_Aprende/extras/arquitecturas/02-montacargas/02-montacargas.jwsim", import.meta.url), "utf8")).scene;

test("iec: NA/NC por la numeración de bornes (IEC 60947)", () => {
  assert.equal(contactIsNC("jwsim/limit-switch", "13-14", true), false);
  assert.equal(contactIsNC("jwsim/limit-switch", "21-22", false), true);
  assert.equal(contactIsNC("jwsim/relay", "11-12", false), true);
  assert.equal(contactIsNC("jwsim/relay", "11-14", false), false);
  assert.equal(contactIsNC("jwsim/overload-relay", "95-96", false), true);
  assert.equal(contactIsNC("jwsim/contactor", "1-2", false), false, "polo principal");
  assert.equal(contactIsNC("jwsim/pressure-switch", "1-2", false), true);
  assert.equal(contactIsNC("jwsim/jwplc-basic", "Q0_0", false), false);
});

test("iec: montacargas → potencia, alimentación, entradas y salidas con referencias cruzadas", () => {
  const m = iecModel(new Scene(montacargas()), { title: "montacargas" });
  assert.deepEqual(
    m.sheets.map((s) => `${s.n} ${s.title}`),
    ["1 Potencia 220 VAC 3~", "2 PLC y alimentación 24 VDC", "3 Entradas del PLC", "4 Mando y salidas del PLC", "5 Lista de E/S y bornes"],
  );
  const [pot, , ent, sal] = m.sheets;
  // Potencia: inversor KM1/KM2 arriba, térmico y motor debajo.
  const lv = Object.fromEntries(pot.blocks.map((b) => [b.dev, b.y]));
  assert.equal(lv.KM1, lv.KM2);
  assert.ok(lv.KM1 < lv.F1 && lv.F1 < lv.M1);
  assert.equal(pot.blocks.find((b) => b.dev === "M1").kind, "motor3");
  // Entradas: una columna por entrada, en orden I0.0 … I0.7; las puertas en serie.
  const ins = ent.elems.filter((e) => e.kind === "plcin");
  assert.deepEqual(ins.map((e) => e.io), ["I0.0", "I0.1", "I0.2", "I0.3", "I0.4", "I0.5", "I0.6", "I0.7"]);
  assert.deepEqual(ins.map((e) => e.col), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(ent.elems.filter((e) => e.col === 6 && e.kind === "contact").map((e) => e.dev), ["SP0", "SP1", "SP2"]);
  assert.ok(ent.elems.find((e) => e.dev === "F1").nc, "95-96 del térmico es NC");
  // Salidas: la parada de emergencia se dibuja una sola vez y alimenta las 4 salidas.
  assert.equal(sal.elems.filter((e) => e.dev === "ES").length, 1);
  assert.deepEqual(sal.elems.filter((e) => e.act === "plc").map((e) => e.io), ["Q0.0", "Q0.1", "Q0.2", "Q0.3"]);
  // Enclavamiento: el NC de KM2 en la columna de KM1 remite a la bobina de KM2 y viceversa.
  const coil1 = sal.elems.find((e) => e.dev === "KM1" && e.kind === "coil");
  const coil2 = sal.elems.find((e) => e.dev === "KM2" && e.kind === "coil");
  assert.equal(sal.elems.find((e) => e.dev === "KM2" && e.cid === "21-22").ref, refOf(sal, coil2));
  assert.match(refOf(sal, coil2), /^4-[A-F]\d+$/);
  assert.equal(sal.elems.find((e) => e.dev === "KM1" && e.cid === "21-22").col, coil2.col);
  assert.deepEqual(
    coil1.xref.map((r) => `${r.cid}${r.nc ? " NC" : ""} /${r.at.split("-")[0]}`),
    ["1-2 /1", "3-4 /1", "5-6 /1", "21-22 NC /4"],
  );
  assert.equal(pot.blocks.find((b) => b.dev === "KM1").ref, refOf(sal, coil1));
  // Cada tramo lleva un borne cableado para pintar la tensión.
  for (const s of m.sheets) for (const w of s.wires) assert.match(w.rep, /^[A-Za-z_][\w-]*\.\S+$/);
});

test("iec: hojas A4 iguales con rejilla fija, módulo PLC con COM/NA, flechas y lista de E/S y bornes", () => {
  const m = iecModel(new Scene(montacargas()), { title: "montacargas" });
  assert.equal(m.sheets.at(-1).title, "Lista de E/S y bornes");
  const [s0] = m.sheets;
  for (const s of m.sheets) {
    assert.ok(Math.abs(s.w / s.h - Math.SQRT2) < 0.01, `hoja ${s.n} en proporción A4`);
    assert.equal(s.w, s0.w, "todas las hojas del mismo tamaño");
    assert.deepEqual([s.grid.cols, s.grid.rows], [10, 6], "rejilla 1–10 × A–F");
  }
  const [, sup, ent, sal, lista] = m.sheets;
  // Columnas del mando = columnas de la rejilla (la 1 queda para los rótulos).
  const coil1 = sal.elems.find((e) => e.dev === "KM1" && e.kind === "coil");
  assert.equal(gridCol(sal, coil1.x), coil1.col + 2);
  // Entradas: terminan en una flecha hacia el borne del módulo (hoja 2);
  // ningún cable de entrada baja al 0 V en esta hoja.
  const ins = ent.elems.filter((e) => e.kind === "plcin");
  assert.ok(ins.every((e) => e.arrow && /^2-[A-F]\d+$/.test(e.ref)));
  const railBot = ent.rails.bot.y;
  assert.equal(ent.wires.filter((w) => w.pts.at(-1)[1] === railBot && ins.some((e) => e.x === w.pts[0][0])).length, 0);
  // Salidas: el contacto del relé remite al COM y al NA del módulo.
  const q0 = sal.elems.find((e) => e.act === "plc" && e.cid === "Q0_0");
  assert.match(q0.ref, /^2-E\d+$/);
  assert.match(q0.ref2, /^2-E\d+$/);
  // Lista de E/S: 8 DI + 8 DO con borne propuesto; las no usadas como «Libre».
  const [ti, to] = lista.tables;
  assert.equal(ti.rows.length, 8);
  assert.equal(to.rows.length, 8);
  assert.deepEqual(ti.rows[3].cells, ["I0.3", "XI:03*", "Llamar PB", "-SB0 13-14", "COM M1", `/${refOf(ent, ins[3])}`]);
  assert.equal(to.rows[2].cells[2], "En movimiento");
  assert.deepEqual(to.rows.filter((r) => r.free).map((r) => r.cells[1]), ["XQ:04*", "XQ:05*", "XQ:06*", "XQ:07*"]);
  // Hoja del PLC: módulo con bornes; cada flecha remite a su circuito y vuelve.
  assert.equal(sup.kind, "plc");
  const p = sup.plc;
  assert.deepEqual(p.terms.filter((x) => x.side === "top").map((x) => x.label), ["I0.0", "I0.1", "I0.2", "I0.3", "I0.4", "I0.5", "I0.6", "I0.7", "COM M1", "24VDC", "M0"]);
  // Salidas: COM y NA de cada relé; las 4 libres sin cable.
  assert.deepEqual(p.terms.filter((x) => x.side === "bot" && x.io === "Q0.0").map((x) => x.label), ["COM", "NA"]);
  assert.equal(p.terms.filter((x) => x.side === "bot" && x.free).length, 8);
  const l3 = p.links.find((x) => x.io === "I0.3");
  assert.equal(l3.at, refOf(ent, ins[3]));
  assert.equal(l3.desc, "Llamar PB -SB0");
  assert.deepEqual(p.links.filter((x) => x.io === "Q0.0").map((x) => [x.part, x.desc]), [["com", "Q0.0 COM"], ["no", "Contactor -KM1"]]);
  assert.match(p.links.find((x) => x.io === "Q0.0").at, /^4-[A-F]2$/);
  // COM y alimentación llegan a los rieles de la fuente.
  assert.equal(sup.dots.filter((d) => d.y === sup.rails.top.y).length, 1);
  assert.equal(sup.dots.filter((d) => d.y === sup.rails.bot.y).length, 2);
});

test("iec: los bornes escritos por el usuario (params.bornes del PLC) reemplazan a los propuestos", () => {
  const sc = montacargas();
  const plc = sc.devices.find((d) => d.id === "plc");
  plc.params = { ...(plc.params ?? {}), bornes: { I0_0: "X1:01", Q0_2: " X2:05 " } };
  const lista = iecModel(new Scene(sc)).sheets.at(-1);
  const [ti, to] = lista.tables;
  assert.equal(ti.rows[0].cells[1], "X1:01");
  assert.equal(ti.rows[1].cells[1], "XI:01*", "los demás siguen propuestos");
  assert.equal(to.rows[2].cells[1], "X2:05");
  assert.deepEqual(ti.rows[0].edit, { col: 1, dev: "plc", ch: "I0_0", value: "X1:01" });
});

test("iec: marcha con autorretención → contactos en paralelo sobre una sola bobina", () => {
  const sc = new Scene({
    devices: [
      { id: "PS1", type: "jwsim/power-24vdc" },
      { id: "S0", type: "jwsim/pushbutton-nc" },
      { id: "S1", type: "jwsim/pushbutton-no" },
      { id: "KM1", type: "jwsim/contactor" },
      { id: "H1", type: "jwsim/lamp", params: { label: "En marcha" } },
    ],
    wiring: [
      { from: "PS1.+V1", to: "S0.11" },
      { from: "S0.12", to: "S1.13" },
      { from: "S0.12", to: "KM1.13" },
      { from: "S1.14", to: "KM1.A1" },
      { from: "KM1.14", to: "KM1.A1" },
      { from: "KM1.A2", to: "PS1.-V1" },
      { from: "PS1.+V1", to: "H1.X1" },
      { from: "H1.X2", to: "PS1.-V1" },
    ],
  });
  const m = iecModel(sc);
  assert.equal(m.sheets.length, 1);
  const s = m.sheets[0];
  assert.equal(s.title, "Mando y salidas del PLC");
  assert.equal(s.elems.filter((e) => e.dev === "KM1" && e.kind === "coil").length, 1, "una sola bobina");
  const s1 = s.elems.find((e) => e.dev === "S1");
  const ka = s.elems.find((e) => e.dev === "KM1" && e.cid === "13-14");
  assert.equal(s1.y, ka.y, "S1 y KM1 13-14 en la misma fila");
  assert.notEqual(s1.col, ka.col, "lado a lado");
  assert.equal(s.elems.find((e) => e.dev === "H1").text, "En marcha");
  assert.ok(s.elems.find((e) => e.dev === "S0").nc);
});
