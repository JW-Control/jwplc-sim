import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadProject } from "../lib/project.mjs";

const CLI = resolve("cli/jwsim-cli.mjs");
const runCli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("flujo completo de agente: describe -> borrador corto -> normalize -> validate --strict -> build -> preview 2D/3D", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-agent-e2e-"));
  const desc = runCli("scene", "describe", "conveyor", "--json");
  assert.equal(desc.status, 0);
  const devInfo = JSON.parse(desc.stdout).device;
  assert.ok(devInfo.outputs.includes("sensorA"));

  const draft = {
    name: "CintaClasificadora",
    scene: {
      devices: [
        { type: "power-24vdc" },
        { type: "jwplc-basic" },
        { type: "pushbutton-no", params: { color: "verde" } },
        { type: "contactor" },
        { type: "overload-relay", mount: "KM1" },
        { type: "motor-3ph", zone: "campo" },
        { type: "conveyor", zone: "proceso", params: { motor: "M1.speed" } },
        { type: "limit-switch", zone: "campo", params: { source: "CV1.sensorA", min: 1, max: 1 } },
      ],
      wiring: [
        "PS1.+V1 -> plc.24VDC [rojo]",
        "PS1.-V1 -> plc.M0 [azul]",
        "PS1.-V1 -> plc.M1 [azul]",
        "PS1.+V1 -> S1.13 [rojo]",
        "S1.14 -> plc.I0_0 [negro]",
        "PS1.+V1 -> plc.Q0_0.1 [rojo]",
        "plc.Q0_0.2 -> KM1.A1 [negro]",
        "KM1.A2 -> PS1.-V1 [azul]",
      ],
    },
  };
  const draftPath = join(dir, "borrador.json");
  writeFileSync(draftPath, JSON.stringify(draft, null, 2), "utf8");

  const outDir = join(dir, "out");
  const buildRes = runCli("scene", "build", draftPath, "--out", outDir, "--create-ino", "--strict", "--json");
  assert.equal(buildRes.status, 0, buildRes.stderr + buildRes.stdout);
  const built = JSON.parse(buildRes.stdout);
  assert.equal(built.ok, true);
  assert.equal(built.created_ino, true);
  assert.equal(built.validation.errors.length, 0);
  assert.equal(built.validation.warnings.length, 0);

  const loaded = loadProject(built.project_file);
  assert.equal(loaded.missing.length, 0);

  const previewDir = join(dir, "preview");
  const prevRes = runCli("scene", "preview", built.project_file, "--out", previewDir, "--view", "both", "--json");
  assert.equal(prevRes.status, 0, prevRes.stderr + prevRes.stdout);
  const prev = JSON.parse(prevRes.stdout);
  assert.equal(prev.ok, true);
  assert.deepEqual(prev.warnings, []);
  assert.ok(existsSync(prev.screenshots.schematic));
  assert.ok(existsSync(prev.screenshots.plant3d));
});
