#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G1_HAL_CORE (criterios en docs/GATES.md):
//   C1 matriz de compilación (sketches de benchmark + ejemplos JW/JWPLC) sin
//      tocar el package: lee build/gates/build-matrix-<target>.json
//   C2 interrupción GPIO en contexto ISR (tests/sketches/isr_gpio)
//   C3 bucle sin puntos de sincronización detectado en <= 2 s de pared
//   C4 API no soportada falla con mensaje que la nombra
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";

const target = process.argv.includes("--target") ? process.argv[process.argv.indexOf("--target") + 1] : "native";
const runner = (exe) => (target === "windows" && process.platform !== "win32" ? ["/usr/lib/wine/wine64", exe] : [exe]);

async function runSketch(name, args, timeoutMs = 30000) {
  const { exe } = await buildSketch(join(ROOT, "tests", "sketches", name), { target, log: () => {} });
  const cmd = runner(exe);
  const t0 = Date.now();
  const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, WINEDEBUG: "-all" },
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), wallMs: Date.now() - t0 };
}

const criteria = {};

const matrixFile = join(ROOT, "build", "gates", `build-matrix-${target}.json`);
if (existsSync(matrixFile)) {
  const m = JSON.parse(readFileSync(matrixFile, "utf8"));
  criteria.C1_matrix = {
    pass: m.unexpected === 0,
    ok: m.ok,
    unsupported: m.unsupported,
    obsolete: m.obsolete,
    unexpected: m.unexpected,
    total: m.total,
    failures: m.results.filter((r) => r.status === "fail").map((r) => r.sketch),
  };
} else {
  criteria.C1_matrix = { pass: false, note: `falta ${matrixFile}: ejecute node scripts/build-matrix.mjs` };
}

// Sin --quiet: la línea del sketch sale por la consola (UART0) de la placa.
const isr = await runSketch("isr_gpio", ["--until", "1500"]);
const m = isr.out.match(/ISR toggles=(\d+) isr=(\d+) fuera_de_contexto=(\d+)/);
criteria.C2_isr_context = {
  pass: !!m && Number(m[2]) === Number(m[1]) && Number(m[3]) === 0,
  line: m ? m[0] : null,
};

const wd = await runSketch("watchdog_loop", ["--until", "5000"]);
criteria.C3_watchdog = {
  pass: wd.status === 70 && /sin llegar a ningún punto de\s+sincronización/.test(wd.out) && wd.wallMs < 4000,
  status: wd.status,
  wall_ms: wd.wallMs,
};

const un = await runSketch("unsupported_api", ["--until", "1000"]);
criteria.C4_unsupported_api = {
  pass: un.status !== 0 && /analogRead no está soportado por JWPLC Sim/.test(un.out),
  message: (un.out.match(/.*no está soportado.*/) ?? [null])[0],
};

const pass = Object.values(criteria).every((c) => c.pass);
const report = { gate: "JWSIM_G1_HAL_CORE", target, result: pass ? "PASS" : "FAIL", criteria };
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", `JWSIM_G1_HAL_CORE-${target}.json`), JSON.stringify(report, null, 2) + "\n");
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
console.log(`JWSIM_G1_HAL_CORE=${report.result} (${target})`);
process.exit(pass ? 0 : 1);
