import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../lib/project.mjs";
import { parseWireShorthand, normalizeProject } from "../lib/scene-normalize.mjs";
import { getDeviceLayout } from "../lib/scene-spec.mjs";

test("parseWireShorthand soporta flecha, guion, color, ref y cable", () => {
  assert.deepEqual(parseWireShorthand("PS1.+V1 -> KM1.A1"), { from: "PS1.+V1", to: "KM1.A1" });
  assert.deepEqual(parseWireShorthand("PS1.+V1 - KM1.A1 [rojo]"), { from: "PS1.+V1", to: "KM1.A1", color: "rojo" });
  assert.deepEqual(parseWireShorthand("VF1.U -> M1.U1 [negro, cable:W1, ref]"), {
    from: "VF1.U",
    to: "M1.U1",
    color: "negro",
    cable: "W1",
    ref: true,
  });
});

test("auto-layout ubica zonas sin solapamientos, respeta mount y ajusta a grilla de 20", () => {
  const short = {
    name: "Arranque motor",
    scene: {
      devices: [
        { type: "power-24vdc" },
        { type: "jwplc-basic" },
        { type: "pushbutton-no", params: { color: "verde" } },
        { type: "contactor" },
        { type: "overload-relay", mount: "KM1" },
        { type: "motor-3ph" },
      ],
      wiring: ["PS1.+V1 -> S1.13", "S1.14 -> plc.I0_0", "plc.Q0_0.1 -> KM1.A1"],
    },
  };
  const out = normalizeProject(short);
  assert.equal(validate(out).length, 0);
  const byId = Object.fromEntries(out.scene.devices.map((d) => [d.id, d]));
  assert.ok(byId.PS1 && byId.plc && byId.S1 && byId.KM1 && byId.F1 && byId.M1);
  assert.equal(byId.F1.x, byId.KM1.x);
  assert.equal(byId.F1.y, byId.KM1.y + 340);
  for (const d of out.scene.devices) {
    assert.equal(d.x % 20, 0);
    assert.equal(d.y % 20, 0);
  }
  const boxes = out.scene.devices.map((d) => ({ ...d, ...getDeviceLayout(d.type, d.params) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.mount === b.id || b.mount === a.id) continue;
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlap, false, `solapamiento entre ${a.id} (${a.x},${a.y},${a.w}x${a.h}) y ${b.id} (${b.x},${b.y},${b.w}x${b.h})`);
    }
  }
});

test("respeta equipos ya posicionados y ubica los nuevos sin pisarlos", () => {
  const mixed = {
    name: "Parcial",
    scene: {
      devices: [
        { id: "PS1", type: "power-24vdc", x: 0, y: 0 },
        { id: "H1", type: "lamp" },
      ],
      wiring: ["PS1.+V1 -> H1.X1"],
    },
  };
  const out = normalizeProject(mixed);
  const byId = Object.fromEntries(out.scene.devices.map((d) => [d.id, d]));
  assert.deepEqual([byId.PS1.x, byId.PS1.y], [0, 0]);
  const lPs = getDeviceLayout("jwsim/power-24vdc");
  const lH1 = getDeviceLayout("jwsim/lamp");
  const overlap = byId.PS1.x < byId.H1.x + lH1.w && byId.PS1.x + lPs.w > byId.H1.x && byId.PS1.y < byId.H1.y + lH1.h && byId.PS1.y + lPs.h > byId.H1.y;
  assert.equal(overlap, false);
});

test("normalizeProject es idempotente y conserva campos desconocidos", () => {
  const input = {
    name: "Demo",
    customMeta: { autor: "JW" },
    scene: { devices: [{ type: "power-24vdc" }, { type: "lamp" }], wiring: ["PS1.+V1 -> H1.X1 [rojo]"] },
  };
  const once = normalizeProject(input);
  const twice = normalizeProject(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.customMeta, { autor: "JW" });
});
