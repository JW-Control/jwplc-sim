import test from "node:test";
import assert from "node:assert/strict";
import { builtinDevices } from "../../scene/devices/index.mjs";
import {
  PREFIX_BY_TYPE,
  normalizeType,
  getDeviceLayout,
  describeCatalog,
  describeDevice,
  checkReferenceFreshness,
} from "../lib/scene-spec.mjs";

test("cubre todos los tipos builtin con prefijo, layout múltiplo de 20 y bornes válidos", () => {
  const cat = describeCatalog();
  const flat = cat.categories.flatMap((c) => c.devices);
  assert.equal(flat.length, builtinDevices.length);
  for (const def of builtinDevices) {
    assert.ok(PREFIX_BY_TYPE[def.type.split("/")[1]], `falta prefijo para ${def.type}`);
    const lay = getDeviceLayout(def.type);
    assert.equal(lay.w % 20, 0, `${def.type} ancho ${lay.w}`);
    assert.equal(lay.h % 20, 0, `${def.type} alto ${lay.h}`);
    for (const [id, t] of Object.entries(lay.terms)) {
      assert.equal(t.x % 20, 0, `${def.type}.${id} x=${t.x}`);
    }
  }
});

test("variantes SVG resuelven bornes distintos y jwplc-basic lee sus bornes reales", () => {
  assert.equal(normalizeType("contactor"), "jwsim/contactor");
  const hdr = getDeviceLayout("jwsim/power-24vdc", { model: "HDR-60" });
  assert.equal("PE" in hdr.terms, false);
  const m6 = getDeviceLayout("jwsim/motor-3ph", { bornera: "6 cables" });
  assert.ok("W2" in m6.terms && "U2" in m6.terms && "V2" in m6.terms);
  const plc = getDeviceLayout("jwsim/jwplc-basic");
  assert.deepEqual([plc.w, plc.h], [460, 540]);
  assert.ok("24VDC" in plc.terms && "Q0_0.1" in plc.terms && "I0_0" in plc.terms);
});

test("describeDevice no falla en equipos con reads por defecto como building-water", () => {
  for (const def of builtinDevices) {
    const info = describeDevice(def.type.split("/")[1]);
    assert.ok(info, def.type);
    assert.equal(info.type, def.type);
    assert.ok(Array.isArray(info.outputs));
  }
});

test("docs/REFERENCIA_ESCENA.md coincide exactamente con renderReferenceMarkdown()", () => {
  const res = checkReferenceFreshness();
  assert.equal(res.ok, true, "ejecuta node scripts/gen-scene-ref.mjs para actualizar docs/REFERENCIA_ESCENA.md");
});
