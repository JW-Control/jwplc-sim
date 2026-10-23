#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G5_HEADLESS_CLI: jwsim-cli build|run|test|parity sin Electron,
// con salida JSON y los códigos de salida documentados (docs/CLI.md), en el
// SO donde corre (Linux y Windows en .github/workflows/g5-cli.yml).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, writeReport } from "./lib/gate-util.mjs";

const CLI = join(ROOT, "cli", "jwsim-cli.mjs");
const { root } = resolvePackageRoot();
const IO_BASIC = join(root, "tools", "build-speed-benchmark", "sketches", "02_io_basic");

function cli(args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 1800000 });
  let json = null;
  try {
    json = JSON.parse((r.stdout ?? "").trim().split(/\r?\n/).pop());
  } catch {}
  return { code: r.status, json, stderr: r.stderr ?? "", wall_ms: Date.now() - t0 };
}

const criteria = {};

// C1: build con JSON → 0, ejecutable y librerías.
{
  const r = cli(["build", IO_BASIC, "--json"]);
  const exe = r.json?.executable;
  criteria.C1_build_json = {
    pass: r.code === 0 && r.json?.ok === true && r.json?.exit_code === 0 && !!exe && existsSync(exe) && r.json.libraries?.length > 0,
    code: r.code,
    libraries: r.json?.libraries?.length,
    wall_ms: r.wall_ms,
  };
}

// C2: run con JSON → 0, JWSIM_RESULT y eventos de bornera.
{
  const r = cli(["run", IO_BASIC, "--json", "--", "--until", "2000", "--set", "I0_0=1@1000"]);
  const ev = r.json?.run?.events ?? [];
  criteria.C2_run_json = {
    pass: r.code === 0 && /^0x[0-9a-f]{16}$/.test(r.json?.run?.result?.trace_hash ?? "") && ev.some((e) => e.kind === "DO" && e.name === "Q0_0" && e.v === 1),
    code: r.code,
    trace_hash: r.json?.run?.result?.trace_hash,
    events: ev.length,
  };
}

// C3: test → 0 si pasan; 1 si alguna falla, con el detalle en JSON.
{
  const ok = cli(["test", join(ROOT, "tests", "cli", "pass"), "--json"]);
  const bad = cli(["test", join(ROOT, "tests", "cli", "fail"), "--json"]);
  const failures = bad.json?.tests?.[0]?.runs?.[0]?.failures ?? [];
  criteria.C3_test_codes = {
    pass: ok.code === 0 && ok.json?.passed === ok.json?.total && ok.json?.total >= 3 && bad.code === 1 && bad.json?.failed === 1 && failures.some((f) => f.includes("Q0_0")),
    pass_code: ok.code,
    passed: `${ok.json?.passed}/${ok.json?.total}`,
    fail_code: bad.code,
    failure: failures[0],
  };
}

// C4: error de compilación → 3 con diagnósticos en el .ino.
{
  const r = cli(["build", join(ROOT, "tests", "sketches", "g2_errores"), "--json"]);
  const d = r.json?.diagnostics?.find((x) => x.severity === "error");
  criteria.C4_build_error = { pass: r.code === 3 && r.json?.ok === false && !!d && /\.ino$/.test(d.file), code: r.code, first: d ? `${d.file.split(/[\\/]/).pop()}:${d.line}` : null };
}

// C5: la simulación termina mal (vigilante) → 4.
{
  const r = cli(["run", join(ROOT, "tests", "sketches", "watchdog_loop"), "--json", "--", "--until", "3000"]);
  criteria.C5_sim_error = { pass: r.code === 4 && r.json?.run?.exit === 70 && r.json?.run?.fatal?.length > 0, code: r.code, runner_exit: r.json?.run?.exit };
}

// C6: uso incorrecto → 2.
{
  const a = cli(["build"]);
  const b = cli(["nada"]);
  const c = cli(["build", IO_BASIC, "--target", "xtensa"]);
  criteria.C6_usage = { pass: a.code === 2 && b.code === 2 && c.code === 2, codes: [a.code, b.code, c.code] };
}

// C7: parity del package fijado → 0 y sin diferencias.
{
  const r = cli(["parity", "--json"]);
  criteria.C7_parity_json = { pass: r.code === 0 && r.json?.ok === true && Array.isArray(r.json?.differences), code: r.code, differences: r.json?.differences?.length };
}

const os = process.platform === "win32" ? "windows" : process.platform;
writeReport("JWSIM_G5_HEADLESS_CLI", { os, criteria });
process.exit(printCriteria("JWSIM_G5_HEADLESS_CLI", criteria, ` (${os})`) ? 0 : 1);
