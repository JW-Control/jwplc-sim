// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ejecución del runner (el ejecutable de un sketch) y lectura de su salida:
// línea JWSIM_RESULT y eventos de bornera y consola. Usado por jwsim-cli y
// por los scripts de gates.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export const WINE = ["/usr/lib/wine/wine64", "/usr/bin/wine64", "/usr/bin/wine"].find(existsSync);

function command(exe) {
  const cmd = exe.endsWith(".exe") && process.platform !== "win32" ? [WINE, exe] : [exe];
  if (!cmd[0]) throw new Error("se necesita wine para ejecutar el .exe de Windows");
  return cmd;
}

// Ejecuta un runner nativo o, para Windows desde Linux, bajo wine.
export function runExe(exe, args, { timeoutMs = 600000 } = {}) {
  const cmd = command(exe);
  const t0 = Date.now();
  const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, WINEDEBUG: "-all" },
  });
  return {
    status: r.status,
    signal: r.signal ?? null,
    timedOut: r.error?.code === "ETIMEDOUT",
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    wallMs: Date.now() - t0,
  };
}

// Igual que runExe, sin bloquear el proceso (varias corridas en paralelo).
export function runExeAsync(exe, args, { timeoutMs = 600000 } = {}) {
  const cmd = command(exe);
  const t0 = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(cmd[0], [...cmd.slice(1), ...args], { env: { ...process.env, WINEDEBUG: "-all" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolvePromise({ status, signal, timedOut, stdout, stderr, wallMs: Date.now() - t0 });
    });
  });
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
