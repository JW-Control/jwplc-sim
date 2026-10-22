#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_FRAM_PERSIST: tests del modelo MB85RS64V y 04.FRAM_Basic del
// package (sin modificar) con un directorio de estado: el contador de
// arranques crece 1, 2, 3 entre corridas y el texto se conserva; misma
// FRAM de partida → mismo hash (la persistencia es una entrada más).
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const sketch = join(root, lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_GlobalPeripherals", "examples", "04.FRAM_Basic");
const work = join(ROOT, "build", "gates", "g4", `fram-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const models = spawnSync(process.execPath, [join(ROOT, "scripts", "test-models.mjs"), "--target", target], { encoding: "utf8" });
const modelLine = models.stdout.split("\n").find((l) => l.startsWith("MB85RS64V:")) ?? "";

const { exe } = await buildSketch(sketch, { target, log: () => {} });
const state = join(work, "estado");
const runs = [];
for (let i = 0; i < 3; i++) {
  const r = runExe(exe, ["--until", "1500", "--state", state]);
  const boot = Number(r.stdout.match(/bootCount persistente = (\d+)/)?.[1] ?? NaN);
  const text = r.stdout.match(/Texto FRAM = (.*)/)?.[1]?.trim() ?? null;
  runs.push({ boot, text, first: /Primer uso/.test(r.stdout), hash: parseResult(r.stdout)?.trace_hash });
  if (i === 1) cpSync(state, join(work, "copia-tras-2"), { recursive: true });
}
// Determinismo con estado: repetir la 3.ª corrida desde la misma FRAM.
const again = runExe(exe, ["--until", "1500", "--state", join(work, "copia-tras-2")]);

const criteria = {
  modelo: { pass: models.status === 0 && /0 con fallas/.test(modelLine), resumen: modelLine.trim() },
  persistencia: {
    pass: runs[0].first && runs.map((r) => r.boot).join() === "1,2,3" && runs.every((r) => r.text === "JWPLC Taller Alpha8"),
    corridas: runs.map(({ boot, text, first }) => ({ boot, text, first })),
  },
  determinismo_con_estado: { pass: parseResult(again.stdout)?.trace_hash === runs[2].hash, hash: runs[2].hash },
};
const pass = printCriteria("JWSIM_G4_FRAM_PERSIST", criteria, ` (${target})`);
writeReport(`JWSIM_G4_FRAM_PERSIST-${target}`, { gate: "JWSIM_G4_FRAM_PERSIST", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
