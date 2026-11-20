import test from "node:test";
import assert from "node:assert/strict";
import { validateSceneProject } from "../lib/scene-validate.mjs";
import { normalizeProject } from "../lib/scene-normalize.mjs";

test("detecta tipo mal escrito con sugerencia por Levenshtein o alias en español", () => {
  const doc = {
    format: "jwsim",
    version: 1,
    board: { id: "jwplcbasic" },
    program: { kind: "arduino", sketch: "./a/a.ino" },
    scene: { devices: [{ id: "M1", type: "jwsim/motor-trifasico", x: 0, y: 0 }], wiring: [] },
  };
  const r = validateSceneProject(doc);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].suggestion ?? "", /jwsim\/motor-3ph/);
});

test("detecta borne inexistente en la variante activa y sugiere parámetro o borne cercano", () => {
  const doc = normalizeProject({
    scene: {
      devices: [
        { id: "PS1", type: "power-24vdc", params: { model: "HDR-60" } },
        { id: "M1", type: "motor-3ph", params: { bornera: "triangulo" } },
      ],
      wiring: ["PS1.PE -> M1.W2"],
    },
  });
  const r = validateSceneProject(doc);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.message.includes("PE") && (e.suggestion ?? "").includes("MDR-60")));
  assert.ok(r.errors.some((e) => e.message.includes("W2") && (e.suggestion ?? "").includes("6 cables")));
});

test("detecta colisión 2D, coordenadas fuera de grilla y enlace 3D roto sin lanzar excepción", () => {
  const doc = normalizeProject({
    scene: {
      devices: [
        { id: "H1", type: "lamp", x: 10, y: 0 },
        { id: "H2", type: "lamp", x: 20, y: 0 },
        { id: "B1", type: "limit-switch", params: { source: "M99.speed" }, x: 300, y: 0 },
      ],
      wiring: [],
    },
  });
  // Restauramos x=10 fuera de grilla porque normalizeProject hace snap.
  doc.scene.devices[0].x = 10;
  const r = validateSceneProject(doc);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path.includes("/scene/devices/0") && /20/.test(e.message)));
  assert.ok(r.errors.some((e) => /colis|solap/i.test(e.message)));
  assert.ok(r.errors.some((e) => /M99/.test(e.message)));
});

test("detecta cortocircuito en t=0 y promueve warnings con --strict", () => {
  const shortCirc = normalizeProject({
    scene: {
      devices: [{ id: "PS1", type: "power-24vdc" }, { id: "H1", type: "lamp" }],
      wiring: ["PS1.+V1 -> PS1.-V1", "PS1.+V1 -> H1.X1"],
    },
  });
  const r1 = validateSceneProject(shortCirc);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => /cortocircuito/i.test(e.message)));

  const unpoweredOnly = normalizeProject({
    scene: {
      devices: [{ id: "PS1", type: "power-24vdc" }, { id: "H1", type: "lamp" }],
      wiring: ["PS1.+V1 -> H1.X1"],
    },
  });
  const normal = validateSceneProject(unpoweredOnly, { strict: false });
  const strict = validateSceneProject(unpoweredOnly, { strict: true });
  assert.equal(normal.ok, true);
  assert.ok(normal.warnings.length >= 1);
  assert.equal(strict.ok, false);
});
