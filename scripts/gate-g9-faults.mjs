#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G9_FAULT_INJECTION (docs/GATES.md): fallas configurables, con
// un caso por falla. Deja el informe en build/gates/g9-faults.json.
//
//   C1 escena: pegado, soldado, quemado y cable cortado en el motor de escena
//      (scene/tests/faults.test.mjs)
//   C2 modelo: RTC sin batería (fila 12 de sim/models/ds3232m/MODEL.md)
//   C3 casos por falla: tests/faults/*.jwtest.json con el firmware real; las
//      siete fallas (sd-absent, rtc-battery, rs485-noise, stuck, welded,
//      burnt, open) tienen al menos un caso y todos pasan
//   C4 determinismo: el ruido es pseudoaleatorio con semilla; tres corridas
//      dan el mismo hash de traza y los mismos bytes corrompidos
//   C5 app: criterio SCENE_FAULTS de la E2E (build/gates/JWSIM_G7_E2E.json,
//      xvfb-run -a node app/tests/e2e-g7.mjs)
//
// Uso: node scripts/gate-g9-faults.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";

const CLI = join(ROOT, "cli", "jwsim-cli.mjs");
const KINDS = ["sd-absent", "rtc-battery", "rs485-noise", "stuck", "welded", "burnt", "open"];
const criteria = {};
const log = (k, c) => console.log(`  ${k} ${c.ok ? "OK" : "FALLA"} ${c.detail ?? ""}`);

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), stdout: r.stdout ?? "" };
}
const cliJson = (args) => {
  const r = sh(process.execPath, [CLI, ...args, "--json"]);
  try {
    return JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    return null;
  }
};

console.log("JWSIM_G9_FAULT_INJECTION");

// C1
{
  const r = sh(process.execPath, ["--test", "scene/tests/faults.test.mjs"]);
  const pass = Number(r.out.match(/^# pass (\d+)/m)?.[1] ?? 0);
  const fail = Number(r.out.match(/^# fail (\d+)/m)?.[1] ?? 1);
  criteria.C1_SCENE = { ok: r.code === 0 && fail === 0 && pass > 0, detail: `${pass} pruebas, ${fail} fallas` };
  log("C1 escena (stuck, welded, burnt, open):", criteria.C1_SCENE);
}

// C2
{
  const r = sh(process.execPath, ["scripts/test-models.mjs"]);
  const row = /ok\s+fila12_sin_bateria/.test(r.out);
  criteria.C2_RTC_MODEL = { ok: r.code === 0 && row, detail: row ? "fila12_sin_bateria ok" : "falta fila12_sin_bateria" };
  log("C2 modelo DS3232M sin batería:", criteria.C2_RTC_MODEL);
}

// C3
{
  const dir = join(ROOT, "tests", "faults");
  const files = readdirSync(dir).filter((f) => f.endsWith(".jwtest.json"));
  const byKind = Object.fromEntries(KINDS.map((k) => [k, []]));
  for (const f of files) {
    const t = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const r of t.runs ?? [t]) for (const x of r.faults ?? []) byKind[x.kind]?.push(f.replace(".jwtest.json", ""));
  }
  const res = cliJson(["test", "tests/faults"]);
  const missing = KINDS.filter((k) => !byKind[k].length);
  criteria.C3_CASES = {
    ok: !!res && res.failed === 0 && res.passed === files.length && !missing.length,
    detail: `${res?.passed ?? 0}/${files.length} pasan${missing.length ? `; sin caso: ${missing.join(", ")}` : ""}`,
    cases: Object.fromEntries(KINDS.map((k) => [k, [...new Set(byKind[k])]])),
    failed: (res?.tests ?? []).filter((t) => !t.ok).map((t) => ({ name: t.name, failures: t.runs?.flatMap((r) => r.failures) ?? t.error })),
  };
  log("C3 casos por falla:", criteria.C3_CASES);
}

// C4
{
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const r = cliJson(["test", "tests/faults/rs485-ruido-parcial.jwtest.json"]);
    const res = r?.tests?.[0]?.runs?.[0]?.result;
    runs.push(res ? `${res.trace_hash}/${res.rs485_corrupted}` : "sin resultado");
  }
  criteria.C4_DETERMINISM = { ok: !runs.includes("sin resultado") && new Set(runs).size === 1, detail: runs[0], runs };
  log("C4 determinismo del ruido (3 corridas):", criteria.C4_DETERMINISM);
}

// C5
{
  const f = join(ROOT, "build", "gates", "JWSIM_G7_E2E.json");
  const c = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).criteria?.SCENE_FAULTS : null;
  criteria.C5_APP = { ok: !!c?.ok, detail: c ? JSON.stringify(c) : "falta correr app/tests/e2e-g7.mjs" };
  log("C5 app (E2E SCENE_FAULTS):", criteria.C5_APP);
}

const ok = Object.values(criteria).every((c) => c.ok);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "g9-faults.json"), JSON.stringify({ host: `${process.platform}-${process.arch}`, ok, criteria }, null, 2) + "\n");
console.log(`JWSIM_G9_FAULT_INJECTION=${ok ? "PASS" : "FAIL"}`);
process.exitCode = ok ? 0 : 1;
