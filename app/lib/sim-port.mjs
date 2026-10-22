// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Lado Node del protocolo motor ↔ interfaz (docs/ARCHITECTURE.md §7).
//
// Tramas por stdin/stdout del runner: [u32 LE longitud][u8 tipo][payload],
// donde longitud cuenta tipo + payload. Tipo 1 = JSON UTF-8 (el único que
// usa el MVP de G2; los datos masivos binarios llegan con G4).
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export const FRAME_JSON = 1;
export const FRAME_DISPLAY = 2;

export function encodeFrame(type, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), "utf8");
  const head = Buffer.alloc(5);
  head.writeUInt32LE(body.length + 1, 0);
  head.writeUInt8(type, 4);
  return Buffer.concat([head, body]);
}

// Decodificador incremental: acepta trozos arbitrarios del pipe.
export class FrameDecoder {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.buf = Buffer.alloc(0);
  }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32LE(0);
      if (this.buf.length < 4 + len) break;
      const type = this.buf.readUInt8(4);
      const body = this.buf.subarray(5, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      this.onFrame(type, type === FRAME_JSON ? JSON.parse(body.toString("utf8")) : body);
    }
  }
}

// Un runner (un PLC simulado). Eventos: "message" (objeto JSON), "display"
// (Buffer con la zona cambiada de la pantalla), "stderr" (texto), "exit"
// ({ code, signal }).
export class RunnerProcess extends EventEmitter {
  // env: variables extra para el proceso (p. ej. JWSIM_DEBUG para depurar).
  start(exe, args = [], { env } = {}) {
    this.child = spawn(exe, ["--port", "stdio", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
    });
    // Tipo 2: zona cambiada de la pantalla (binario, ver port.cpp).
    const dec = new FrameDecoder((type, msg) => this.emit(type === FRAME_JSON ? "message" : type === FRAME_DISPLAY ? "display" : "frame", msg));
    this.child.stdout.on("data", (d) => dec.push(d));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (d) => this.emit("stderr", d));
    this.child.on("exit", (code, signal) => {
      this.child = null;
      this.emit("exit", { code, signal });
    });
    this.child.on("error", (err) => this.emit("stderr", `[jwsim] no se pudo iniciar el runner: ${err.message}\n`));
    this.child.stdin.on("error", () => {});
    return this;
  }
  send(msg) {
    if (this.child) this.child.stdin.write(encodeFrame(FRAME_JSON, msg));
  }
  get pid() {
    return this.child?.pid ?? null;
  }
  get running() {
    return !!this.child;
  }
  stop() {
    if (!this.child) return;
    this.send({ type: "quit" });
    const c = this.child;
    setTimeout(() => c.exitCode === null && c.kill(), 500);
  }
}
