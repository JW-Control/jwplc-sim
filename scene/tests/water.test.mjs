// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Bombeo de edificio: red con hidroneumático, cisterna y transmisor RS-485.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

const net = (extra = {}) => ({ id: "RED1", type: "jwsim/building-water", params: { bombas: "M1", cisterna: "T1.nivel", presion0: 0, ...extra } });
const cis = { id: "T1", type: "jwsim/tank", params: { volumen: 1000, consumo: 0, bomba: "RED1.reposicion", caudal: 80, extraccion: "RED1.qBombas", nivel0: 95 } };
const pt = { id: "PT1", type: "jwsim/pressure-rs485", params: { address: 3, source: "RED1.presion" } };

test("bombeo de edificio: la bomba a 60 Hz llega al equilibrio con el consumo y vacía la cisterna", () => {
  const s = scene(["R:power-3ph", "M1:motor-3ph", "PS:power-24vdc", net(), cis, pt], ["R.L1 - M1.U1", "R.L2 - M1.V1", "R.L3 - M1.W1", "PS.+V1 - PT1.+", "PS.-V1 - PT1.-"]);
  s.advanceTo(ms(2000));
  assert.ok(s.output("RED1", "presion") > 1, "sube rápido hasta la precarga");
  s.advanceTo(ms(60000));
  // 150·√(1-P/7) = 60·√(P/3,5) → P ≈ 5,30 bar
  assert.ok(Math.abs(s.output("RED1", "presion") - 5.3) < 0.05, `equilibrio ${s.output("RED1", "presion")}`);
  assert.equal(s.output("PT1", "raw"), Math.round(s.output("RED1", "presion") * 100));
  assert.ok(s.output("T1", "nivelPct") < 95, "las bombas succionan de la cisterna");
  // Más consumo: baja la presión.
  s.act("RED1", "consumo", 150, ms(60000));
  s.advanceTo(ms(120000));
  assert.ok(s.output("RED1", "presion") < 4, `con más consumo ${s.output("RED1", "presion")}`);
});

test("bombeo de edificio: cisterna vacía, la bomba trabaja en seco y la presión cae", () => {
  const dry = { ...cis, params: { ...cis.params, nivel0: 0, bomba: "" } };
  const s = scene(["R:power-3ph", "M1:motor-3ph", net({ presion0: 4 }), dry], ["R.L1 - M1.U1", "R.L2 - M1.V1", "R.L3 - M1.W1"]);
  s.advanceTo(ms(5000));
  assert.equal(s.output("RED1", "seco"), true);
  assert.equal(s.output("RED1", "qBombas"), 0);
  assert.ok(s.output("RED1", "presion") < 4);
});
