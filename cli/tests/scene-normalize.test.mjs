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

test("reglas estrictas de diseño: riel DIN en y=0, cilindros en una sola fila con finales A0/A1..C0/C1 arriba y compresor abajo", () => {
  const draft = {
    name: "SecNeumatica",
    scene: {
      devices: [
        { type: "power-24vdc" },
        { type: "jwplc-basic" },
        { type: "pushbutton-no", params: { color: "verde" } },
        { type: "pushbutton-nc", params: { color: "rojo" } },
        { type: "compressor", params: { supply: "propia" } },
        { type: "solenoid-valve-2", sensors: "compacto", params: { air: "CP1" } },
        { type: "solenoid-valve-2", sensors: "compacto", params: { air: "CP1" } },
        { type: "solenoid-valve-2", sensors: "compacto", params: { air: "CP1" } },
      ],
      wiring: ["PS1.+V1 -> plc.24VDC"],
    },
  };
  const out = normalizeProject(draft);
  const byId = Object.fromEntries(out.scene.devices.map((d) => [d.id, d]));

  // Riel superior alineado en y = 0
  assert.equal(byId.PS1.y, 0);
  assert.equal(byId.plc.y, 0);
  assert.ok(byId.plc.x > byId.PS1.x);

  // Botones abajo del riel izquierdo
  assert.ok(byId.S1.y >= 580 && byId.S2.y >= 580);

  // Tres electroválvulas Y1, Y2, Y3 en una sola fila horizontal
  assert.ok(byId.Y1 && byId.Y2 && byId.Y3);
  assert.equal(byId.Y1.y, byId.Y2.y);
  assert.equal(byId.Y2.y, byId.Y3.y);
  assert.ok(byId.Y1.x < byId.Y2.x && byId.Y2.x < byId.Y3.x);

  // Finales de carrera autogenerados como A0/A1, B0/B1, C0/C1 encima de cada émbolo con orientacion abajo
  for (const [cyl, s0, s1] of [
    [byId.Y1, byId.A0, byId.A1],
    [byId.Y2, byId.B0, byId.B1],
    [byId.Y3, byId.C0, byId.C1],
  ]) {
    assert.ok(s0 && s1, `faltan sensores para ${cyl.id}`);
    assert.equal(s0.params.orientacion, "abajo");
    assert.equal(s0.y, cyl.y - 160);
    assert.equal(s1.y, cyl.y - 160);
    assert.equal(s0.x, cyl.x + 280);
    assert.equal(s1.x, cyl.x + 420);
  }

  // Compresor CP1 una fila debajo de los cilindros y con consumers autocompletado a "Y1, Y2, Y3"
  assert.ok(byId.CP1);
  assert.ok(byId.CP1.y >= byId.Y1.y + 280);
  assert.equal(byId.CP1.params.consumers, "Y1, Y2, Y3");
});

test("sensores declarados por separado sin id ni x/y reciben nombres A0/A1.. y se ubican encima de su cilindro", () => {
  const draft = {
    name: "SensoresSeparados",
    scene: {
      devices: [
        { type: "solenoid-valve-2", id: "Y1" },
        { type: "sensor-cylinder", params: { cylinder: "Y1", end: "retraído" } },
        { type: "sensor-cylinder", params: { cylinder: "Y1", end: "extendido" } },
        { type: "solenoid-valve-2", id: "Y2" },
        { type: "sensor-cylinder", params: { cylinder: "Y2", end: "retraído" } },
        { type: "sensor-cylinder", params: { cylinder: "Y2", end: "extendido" } },
      ],
      wiring: [],
    },
  };
  const out = normalizeProject(draft);
  const byId = Object.fromEntries(out.scene.devices.map((d) => [d.id, d]));
  assert.ok(byId.A0 && byId.A1 && byId.B0 && byId.B1);
  assert.equal(byId.A0.y, byId.Y1.y - 120);
  assert.equal(byId.A1.y, byId.Y1.y - 120);
  assert.equal(byId.B0.y, byId.Y2.y - 120);
  assert.equal(byId.B1.y, byId.Y2.y - 120);
});
