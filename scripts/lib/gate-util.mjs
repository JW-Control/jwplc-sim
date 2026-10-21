// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Utilidades comunes de los scripts de gates.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../../cli/lib/build.mjs";

export const WINE = ["/usr/lib/wine/wine64", "/usr/bin/wine64", "/usr/bin/wine"].find(existsSync);

export function targetArg() {
  const i = process.argv.indexOf("--target");
  return i >= 0 ? process.argv[i + 1] : "native";
}

// Ejecuta un runner nativo o, para Windows desde Linux, bajo wine.
export function runExe(exe, args, { timeoutMs = 600000 } = {}) {
  const cmd = exe.endsWith(".exe") && process.platform !== "win32" ? [WINE, exe] : [exe];
  if (!cmd[0]) throw new Error("se necesita wine para ejecutar el .exe de Windows");
  const t0 = Date.now();
  const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, WINEDEBUG: "-all" },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", wallMs: Date.now() - t0 };
}

// Línea JWSIM_RESULT del runner como objeto.
export function parseResult(stdout) {
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith("JWSIM_RESULT "));
  if (!line) return null;
  const out = {};
  for (const kv of line.slice("JWSIM_RESULT ".length).split(" ")) {
    const [k, v] = kv.split("=");
    out[k] = v;
  }
  return out;
}

// Eventos de bornera y consola: [t ms] DI/DO NOMBRE = v, [t ms] UARTn texto.
export function parseTimeline(stdout) {
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    let m = line.match(/^\[\s*([\d.]+) ms\] (DI|DO)\s+(\S+) = ([01])/);
    if (m) {
      events.push({ t: Number(m[1]), kind: m[2], name: m[3], v: Number(m[4]) });
      continue;
    }
    m = line.match(/^\[\s*([\d.]+) ms\] UART(\d) (.*)$/);
    if (m) events.push({ t: Number(m[1]), kind: "UART", port: Number(m[2]), text: m[3] });
  }
  return events;
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
