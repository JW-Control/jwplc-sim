// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tratamiento de agua: filtro con retrolavado y cloración en línea.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ms, scene } from "./helpers.mjs";

test("tratamiento: el filtro colmatado sube el ΔP, el retrolavado lo limpia y el cloro sigue a dosis/caudal", () => {
  const s = scene(
    [
      "PS:power-24vdc",
      "N:power-230vac",
      "KM:pushbutton-no",
      "M1:motor",
      "SB:pushbutton-no",
      "SY:pushbutton-no",
      { id: "Y2", type: "jwsim/water-valve" },
      { id: "F1", type: "jwsim/sand-filter", params: { bomba: "M1.speed", retrolavado: "Y2.open", colmatacion0: 40 } },
      { id: "CL1", type: "jwsim/chlorinator", params: { agua: "F1.qServicio", dosis: 300, cloro0: 0 } },
    ],
    ["N.L - KM.13", "KM.14 - M1.U1", "M1.U2 - N.N", "PS.+V1 - SB.13", "SB.14 - CL1.A1", "CL1.A2 - PS.-V1", "PS.+V1 - SY.13", "SY.14 - Y2.A1", "Y2.A2 - PS.-V1"],
  );
  s.act("KM", "press", true, ms(0));
  s.act("SB", "press", true, ms(0));
  s.advanceTo(ms(5000));
  const dp0 = s.output("F1", "dp");
  assert.ok(dp0 > 0.5 && dp0 < 0.7, `ΔP con 40 %: ${dp0}`);
  s.act("F1", "colmatar", true, ms(5000));
  s.act("F1", "colmatar", false, ms(5100));
  s.advanceTo(ms(6000));
  assert.ok(s.output("F1", "dp") > 1.1, "colmatado");
  // 3 minutos dosificando: cerca de dosis / caudal de servicio (el caudal sigue bajando un poco al colmatarse).
  s.advanceTo(ms(180000));
  const target = 300 / s.output("F1", "qServicio");
  assert.ok(Math.abs(s.output("CL1", "cloro") / target - 1) < 0.05, `cloro ${s.output("CL1", "cloro")} vs ${target}`);
  // Retrolavado 25 s: limpia el lecho.
  s.act("SY", "press", true, ms(180000));
  s.advanceTo(ms(205000));
  assert.equal(s.output("F1", "lavando"), true, JSON.stringify({ y2: s.output("Y2", "open"), m: s.output("M1", "speed"), q: s.output("F1", "qRetrolavado"), c: s.output("F1", "colmatacion") }));
  assert.ok(s.output("F1", "colmatacion") < 10, `colmatación ${s.output("F1", "colmatacion")}`);
});
