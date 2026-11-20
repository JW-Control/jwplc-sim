// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del oráculo visual 2D/3D (cli/lib/scene-oracle.mjs, Task 6).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { normalizeProject } from "../../cli/lib/scene-normalize.mjs";
import { previewSceneProject } from "../../cli/lib/scene-oracle.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const outDir = mkdtempSync(join(tmpdir(), "jwsim-oracle-out-"));
const projDir = mkdtempSync(join(tmpdir(), "jwsim-oracle-proj-"));
mkdirSync(join(projDir, "s"), { recursive: true });
writeFileSync(join(projDir, "s", "s.ino"), "void setup(){}\nvoid loop(){}\n", "utf8");
const projFile = join(projDir, "demo.jwsim");
const proj = normalizeProject({
  name: "OracleDemo",
  program: { kind: "arduino", sketch: "./s/s.ino" },
  scene: {
    devices: [
      { id: "PS1", type: "power-24vdc" },
      { id: "plc", type: "jwplc-basic" },
      { id: "M1", type: "motor-3ph" },
      { id: "CV1", type: "conveyor", params: { motor: "M1" } },
    ],
    wiring: ["PS1.+V1 -> plc.24VDC [rojo]", "PS1.-V1 -> plc.M0 [azul]"],
  },
});
writeFileSync(projFile, JSON.stringify(proj, null, 2) + "\n", "utf8");

// 1. Prueba directa de API previewSceneProject
const res = await previewSceneProject(projFile, { outDir, view: "both" });
assert.equal(res.ok, true, JSON.stringify(res));
assert.deepEqual(res.warnings, []);
assert.equal(res.routes.every((r) => r.routed), true);
assert.ok(existsSync(res.screenshots.schematic) && statSync(res.screenshots.schematic).size > 5000);
assert.ok(existsSync(res.screenshots.plant3d) && statSync(res.screenshots.plant3d).size > 5000);

// 2. Prueba vía jwsim-cli scene preview --json
const cliOut = join(outDir, "cli");
const r = spawnSync(
  process.execPath,
  [resolve(ROOT, "cli", "jwsim-cli.mjs"), "scene", "preview", projFile, "--out", cliOut, "--view", "both", "--json"],
  { encoding: "utf8" },
);
assert.equal(r.status, 0, r.stderr);
const json = JSON.parse(r.stdout);
assert.equal(json.ok, true);
assert.ok(existsSync(json.screenshots.schematic));
assert.ok(existsSync(json.screenshots.plant3d));
console.log("JWSIM_SCENE_ORACLE_E2E=PASS");
