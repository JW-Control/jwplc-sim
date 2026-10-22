#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G2_LOCAL_COMPILE (criterios en docs/GATES.md):
//   C1 compila sin red ni Arduino IDE (Linux: dentro de un namespace sin red)
//   C2 recompilar tras cambiar loop() < 3 s
//   C3 prototipos automáticos: funciones usadas antes de definirse y desde
//      otra pestaña (tests/sketches/g2_prototipos)
//   C4 toolchain: el incluido (.jwsim/toolchain) si está, o GCC del PATH
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const criteria = {};
const { root } = resolvePackageRoot();
const work = mkdtempSync(join(tmpdir(), "jwsim-g2lc-"));
const sketch = join(work, "lc_io");
cpSync(join(root, "tools", "build-speed-benchmark", "sketches", "02_io_basic"), sketch, { recursive: true });
spawnSync(process.platform === "win32" ? "cmd" : "mv", process.platform === "win32" ? ["/c", "ren", join(sketch, "02_io_basic.ino"), "lc_io.ino"] : [join(sketch, "02_io_basic.ino"), join(sketch, "lc_io.ino")]);

// C1: primera compilación de un sketch nuevo, sin red.
if (process.platform === "linux") {
  const t0 = Date.now();
  const r = spawnSync("unshare", ["-n", process.execPath, join(ROOT, "cli", "jwsim-cli.mjs"), "build", sketch, "--target", target], { encoding: "utf8" });
  const ok = r.status === 0 && /\[build\] OK/.test(r.stderr + r.stdout);
  criteria.C1_offline = { pass: ok, ms: Date.now() - t0, note: ok ? "unshare -n (sin interfaces de red)" : (r.stderr || r.error?.message || "").slice(-400) };
} else {
  criteria.C1_offline = { pass: null, note: "solo se verifica en Linux (unshare -n)" };
}

// C2: cambio en loop() → recompilación.
await buildSketch(sketch, { target, log: () => {} });
const ino = join(sketch, "lc_io.ino");
writeFileSync(ino, readFileSync(ino, "utf8").replace("digitalWrite(Q0_0, digitalRead(I0_0));", "digitalWrite(Q0_0, !digitalRead(I0_0));"));
const lines = [];
const t1 = performance.now();
const { exe } = await buildSketch(sketch, { target, timing: true, log: (m) => lines.push(m) });
const incMs = Math.round(performance.now() - t1);
// Desglose por fase y avisos del build (p. ej. PCH no utilizable en este host).
const phases = lines.filter((l) => l.startsWith("[tiempo]") || /aviso|weak PE/.test(l)).map((l) => l.replace(/^\[\w+\] /, ""));
const run = parseResult(runExe(exe, ["--until", "1000", "--quiet"]).stdout);
criteria.C2_incremental = { pass: incMs < 3000 && run?.DO === "0b00000001", ms: incMs, DO_con_I0_0_en_0: run?.DO, fases: phases };

// C3: prototipos automáticos entre pestañas (setup() corre a ~0,7 s: el
// core inicializa la microSD en el arranque).
const proto = await buildSketch(join(ROOT, "tests", "sketches", "g2_prototipos"), { target, log: () => {} }).catch((e) => ({ error: e.message }));
let c3 = { pass: false, error: proto.error };
if (proto.exe) {
  const r = runExe(proto.exe, ["--until", "1000", "--set", "I0_0=1@800"]);
  const res = parseResult(r.stdout);
  c3 = { pass: /doble=42/.test(r.stdout) && res?.DO === "0b00000000" && res?.DI === "0b00000001", serial: (r.stdout.match(/doble=\d+/) ?? [null])[0], DO: res?.DO };
}
criteria.C3_prototypes = c3;

// C4: toolchain usado.
const tc = toolchain(target);
criteria.C4_toolchain = { pass: tc.available, compiler: tc.cxx.join(" "), bundled: !!tc.bundled };

const pass = printCriteria("JWSIM_G2_LOCAL_COMPILE", criteria, ` (${target})`);
writeReport(`JWSIM_G2_LOCAL_COMPILE-${target}`, { gate: "JWSIM_G2_LOCAL_COMPILE", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
