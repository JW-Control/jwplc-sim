// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWPLC «real» para pruebas de «Ejecutar en vivo» (solo Linux): el firmware
// compilado corre en el runner a tiempo real y su UART0 sale por un pty, como
// el COM del USB de la placa. fakeJwplc(exe) → { tty, runner, close }.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { RunnerProcess } from "../../lib/sim-port.mjs";

export async function fakeJwplc(exe) {
  const runner = new RunnerProcess().start(exe, []);
  const pty = spawn("python3", [join(import.meta.dirname, "pty-pair.py")], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: pty.stdout });
  const tty = await new Promise((ok) => lines.once("line", (l) => ok(l.split(" ")[1])));
  lines.on("line", (l) => {
    if (!l.startsWith("R ")) return;
    const hex = l.slice(2).trim();
    runner.send({ type: "uart_rx", port: 0, data: hex.match(/../g).map((h) => `0:${h}`).join(",") });
  });
  // Al cerrar, el runner aún puede soltar bytes de UART0: el pty ya no existe.
  let closed = false;
  pty.stdin.on("error", () => {});
  runner.on("message", (m) => {
    if (closed) return;
    if (m.type === "uart_out" && m.port === 0) pty.stdin.write(`W ${m.hex.replaceAll(" ", "")}\n`);
  });
  runner.send({ type: "tap", port: 0, on: 1 });
  runner.send({ type: "run", speed: 1 });
  return {
    tty,
    runner,
    close: () => {
      closed = true;
      runner.stop();
      pty.kill();
    },
  };
}
