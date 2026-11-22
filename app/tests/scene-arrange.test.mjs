// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Ordenar como tablero» (app/lib/scene-arrange.cjs) con el montacargas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

import { iecModel } from "../../scene/iec.mjs";
import { Scene } from "../../scene/scene.mjs";

const { arrange } = createRequire(import.meta.url)("../lib/scene-arrange.cjs");
const spec = JSON.parse(readFileSync(new URL("../../JWPLC_Aprende/extras/arquitecturas/02-montacargas/02-montacargas.jwsim", import.meta.url), "utf8")).scene;

// Geometría simplificada: bornes "t" arriba y "b" abajo; los del PLC en orden.
function geometry() {
  const sc = new Scene(spec);
  return [...sc.devices.values()].map((d) => {
    const ids = [...d.terms];
    const isPlc = d.def.type === "jwsim/jwplc-basic";
    const [w, h] = isPlc ? [620, 400] : d.def.type === "jwsim/contactor" ? [160, 160] : [80, 100];
    const terms = {};
    ids.forEach((t, i) => {
      const bottom = isPlc ? /^Q/.test(t) : /^(1?4|2?2|1?2|2|4|6|14|22|A2|X2|96|98)$/.test(t);
      terms[t] = [Math.round(((i + 1) / (ids.length + 1)) * w), bottom ? h : 0, bottom ? "b" : "t"];
    });
    return { id: d.id, type: d.def.type, w, h, mount: spec.devices.find((x) => x.id === d.id).mount, terms };
  });
}

test("ordenar: entradas arriba del PLC en el orden de I0.x, salidas abajo en el de Q0.x", () => {
  const devs = geometry();
  const r = arrange(iecModel(new Scene(spec)), devs, spec.wiring, { mountDy: { "jwsim/overload-relay": 340 } });
  const P = r.pos;
  const plc = P.plc;
  const box = (id) => ({ ...P[id], ...devs.find((d) => d.id === id) });
  for (const id of ["SQ0", "SQ1", "SQ2", "SB0", "SB1", "SB2", "SP0", "SP1", "SP2", "BW"]) assert.ok(box(id).y + box(id).h <= plc.y, `${id} arriba del PLC`);
  for (const id of ["SQS", "SQI", "KM1", "KM2", "H1", "H2", "ES"]) assert.ok(box(id).y >= plc.y + 400, `${id} abajo del PLC`);
  // Orden de columnas = orden de los bornes.
  const xs = ["SQ0", "SQ1", "SQ2", "SB0", "SB1", "SB2"].map((id) => P[id].x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.ok(P.KM1.x < P.KM2.x && P.KM2.x < P.H1.x && P.H1.x < P.H2.x, "KM1 (Q0.0), KM2 (Q0.1), H1, H2");
  // Las puertas en serie, en una sola columna.
  assert.equal(P.SP0.x, P.SP1.x);
  assert.equal(P.SP1.x, P.SP2.x);
  // Cargas en la misma fila; SQS sobre KM1.
  assert.equal(P.KM1.y, P.H1.y);
  assert.ok(P.SQS.y < P.KM1.y && Math.abs(P.SQS.x + 40 - (P.KM1.x + 80)) <= 20);
  // Emergencia a la izquierda de las salidas; motor bajo su contactor con el térmico; fuente al lado del PLC.
  assert.ok(P.ES.x + 80 <= P.KM1.x);
  assert.ok(!("F1" in P), "el térmico sigue acoplado");
  assert.ok(P.M1.y > P.KM1.y + 340 + 100);
  assert.ok(P.PS1.x + 80 < plc.x);
  assert.ok(P.CAB1.x > Math.max(P.H2.x, P.R.x), "planta a la derecha");
  // Sin encimarse.
  const ids = Object.keys(P);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = box(ids[i]);
      const b = box(ids[j]);
      const ha = a.id === "KM1" ? 500 : a.h;
      const hb = b.id === "KM1" ? 500 : b.h;
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + ha <= b.y || b.y + hb <= a.y, `${a.id} y ${b.id} se enciman`);
    }
  // Referencias: el +24 V repartido a las entradas sí; la alimentación y las E/S del PLC, no.
  const refs = r.refs.map((i) => `${spec.wiring[i].from} ${spec.wiring[i].to}`);
  assert.ok(refs.some((w) => w.startsWith("PS1.+V1 S")), refs.join(" | "));
  assert.ok(!refs.some((w) => w.includes("plc.")), "nada del PLC");
});
