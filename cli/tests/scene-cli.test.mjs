import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve("cli/jwsim-cli.mjs");
const runCli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("scene describe --json lista catálogo y detalle de contactor", () => {
  const all = runCli("scene", "describe", "--json");
  assert.equal(all.status, 0);
  const j1 = JSON.parse(all.stdout);
  assert.ok(j1.ok && j1.catalog.total >= 65);

  const one = runCli("scene", "describe", "contactor", "--json");
  assert.equal(one.status, 0);
  const j2 = JSON.parse(one.stdout);
  assert.equal(j2.device.type, "jwsim/contactor");
});

test("scene new crea un .jwsim base y sketch opcional sin pisar uno existente", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-scene-new-"));
  const out = join(dir, "arranque.jwsim");
  const r = runCli("scene", "new", out, "--sketch", "./arranque/arranque.ino", "--template", "arranque-directo", "--json");
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  const saved = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(saved.format, "jwsim");
  assert.ok(saved.scene.devices.length >= 2);
});

test("scene normalize y build --create-ino protegen un .ino existente", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-scene-cli-"));
  const raw = join(dir, "borrador.json");
  writeFileSync(
    raw,
    JSON.stringify({
      name: "DemoCLI",
      scene: {
        devices: [{ type: "power-24vdc" }, { type: "lamp" }],
        wiring: ["PS1.+V1 -> H1.X1", "H1.X2 -> PS1.-V1"],
      },
    }),
  );
  const outNorm = join(dir, "norm.jwsim");
  const n = runCli("scene", "normalize", raw, "-o", outNorm, "--json");
  assert.equal(n.status, 0);
  assert.ok(existsSync(outNorm));

  const outDir = join(dir, "proj");
  const b1 = runCli("scene", "build", raw, "--out", outDir, "--create-ino", "--json");
  assert.equal(b1.status, 0);
  const j = JSON.parse(b1.stdout);
  assert.equal(j.ok, true);
  assert.ok(existsSync(j.project_file));
  assert.ok(existsSync(j.sketch_file));

  writeFileSync(j.sketch_file, "// codigo manual del usuario\nvoid setup(){}\nvoid loop(){}\n");
  const b2 = runCli("scene", "build", raw, "--out", outDir, "--create-ino", "--json");
  assert.equal(b2.status, 0);
  assert.match(readFileSync(j.sketch_file, "utf8"), /codigo manual del usuario/);
  assert.equal(JSON.parse(b2.stdout).created_ino, false);
});

test("scene validate --strict falla con código 1 cuando hay advertencias", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-scene-val-"));
  const f = join(dir, "warn.jwsim");
  writeFileSync(
    f,
    JSON.stringify({
      format: "jwsim",
      version: 1,
      board: { id: "jwplcbasic" },
      program: { kind: "arduino", sketch: "./s/s.ino" },
      scene: {
        devices: [
          { id: "PS1", type: "jwsim/power-24vdc", x: 0, y: 0 },
          { id: "H1", type: "jwsim/lamp", x: 200, y: 0 },
        ],
        wiring: [{ from: "PS1.+V1", to: "H1.X1" }],
      },
    }),
  );
  assert.equal(runCli("scene", "validate", f, "--json").status, 0);
  assert.equal(runCli("scene", "validate", f, "--strict", "--json").status, 1);
});
