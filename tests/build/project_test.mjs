// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests de proyectos .jwsim (cli/lib/project.mjs, schema/jwsim-1.json).
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ROOT } from "../../cli/lib/build.mjs";
import { loadProject, migrate, saveProject, validate } from "../../cli/lib/project.mjs";

const DEMO = join(ROOT, "tests", "projects", "demo");

test("v1 válido: vínculos resueltos y existentes", () => {
  const { project, migratedFrom, links, missing } = loadProject(join(DEMO, "demo.jwsim"));
  assert.equal(migratedFrom, null);
  assert.equal(project.name, "Marcha y parada");
  assert.ok(links.sketch.endsWith(join("sketch", "marcha", "marcha.ino")));
  assert.ok(links.openplc.endsWith(join("ladder", "plc.xml")));
  assert.deepEqual(missing, []);
});

test("v0 se migra a v1 y valida", () => {
  const { project, migratedFrom } = loadProject(join(DEMO, "demo-v0.jwsim"));
  assert.equal(migratedFrom, 0);
  assert.equal(project.version, 1);
  assert.equal(project.format, "jwsim");
  assert.deepEqual(project.program, { kind: "arduino", sketch: "./sketch/marcha/marcha.ino" });
  assert.deepEqual(project.links, { openplc: "./ladder/plc.xml", hmi: "./hmi/panel.hmi" });
  assert.deepEqual(project.simulation, { seed: 7, realtimeFactor: 10 });
  assert.equal("jwsim" in project, false);
});

test("errores del esquema con ruta", () => {
  const bad = {
    format: "jwsim",
    version: 1,
    board: { id: "esp32dev" },
    program: { kind: "arduino" },
    links: { hmi: "C:/abs/panel.hmi" },
    simulation: { realtimeFactor: -1 },
    scene: { inputs: { I0_2: 3 } },
  };
  const paths = validate(bad).map((e) => e.path);
  for (const p of ["/board/id", "/program/sketch", "/links/hmi", "/simulation/realtimeFactor", "/scene/inputs/I0_2"]) {
    assert.ok(paths.includes(p), `falta error en ${p}: ${JSON.stringify(validate(bad))}`);
  }
});

test("versión futura y archivo ajeno se rechazan", () => {
  assert.throws(() => migrate({ format: "jwsim", version: 2 }), /versión 2/);
  assert.throws(() => migrate({ hola: 1 }), /no es un proyecto/);
});

test("guardar conserva campos desconocidos y escribe rutas relativas", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-proj-"));
  const file = join(DEMO, "demo.jwsim");
  const out = join(dir, "copia.jwsim");
  copyFileSync(file, out);
  const { project } = loadProject(out);
  saveProject(out, project, {
    sketchPath: join(DEMO, "sketch", "marcha", "marcha.ino"),
    simulation: { realtimeFactor: 10 },
    scene: { inputs: { I0_0: 1 } },
  });
  const saved = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(saved["x-notas"], "campo desconocido: debe conservarse al guardar");
  assert.equal(saved.simulation.realtimeFactor, 10);
  assert.equal(saved.simulation.seed, 1);
  assert.ok(!saved.program.sketch.startsWith("/"), saved.program.sketch);
  assert.deepEqual(validate(saved), []);
});
