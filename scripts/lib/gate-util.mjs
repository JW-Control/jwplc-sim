// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Utilidades comunes de los scripts de gates.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../../cli/lib/build.mjs";

export { parseResult, parseTimeline, runExe, WINE } from "../../cli/lib/runner.mjs";

export function targetArg() {
  const i = process.argv.indexOf("--target");
  return i >= 0 ? process.argv[i + 1] : "native";
}

export function writeReport(name, report) {
  const dir = join(ROOT, "build", "gates");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(report, null, 2) + "\n");
}

export function printCriteria(gate, criteria, suffix = "") {
  for (const [k, v] of Object.entries(criteria)) {
    const { pass, ...rest } = v;
    console.log(`${k}: ${pass === null ? "OMITIDO" : pass ? "OK" : "FALLA"} ${JSON.stringify(rest)}`);
  }
  const pass = Object.values(criteria).every((c) => c.pass !== false);
  console.log(`${gate}=${pass ? "PASS" : "FAIL"}${suffix}`);
  return pass;
}
