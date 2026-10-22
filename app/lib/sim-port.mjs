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
// ({ code, signal }), "restarted" ({ pid, boot_ns }).
//
// esp_restart() del firmware (G4): el runner informa {"type":"restart"} y
// termina con el código 75; aquí se lanza el proceso nuevo con --resume y el
// mismo objeto sigue representando al PLC. Lo que la interfaz envíe mientras
// tanto se encola, y al llegar el "hello" nuevo se repone el estado de
// marcha (run/pause, suscripción a buses) antes de entregarlo. `onRestart`
// (async) corre antes de reanudar: p. ej. adjuntar el depurador al pid nuevo.
export const RESTART_EXIT_CODE = 75;

export class RunnerProcess extends EventEmitter {
  // env: variables extra para el proceso (p. ej. JWSIM_DEBUG para depurar).
  // launcher: programa que ejecuta el runner (wine para un .exe en Linux).
  start(exe, args = [], { env, onRestart, launcher } = {}) {
    this.exe = exe;
    this.launcher = launcher;
    this.args = args;
    this.env = env;
    this.onRestart = onRestart;
    this.lastRun = null;
    this.lastSubscribe = null;
    this.queue = null;   // comandos durante un reinicio
    this.#spawn(args);
    return this;
  }
  #spawn(args) {
    const cmd = this.launcher ? [this.launcher, this.exe] : [this.exe];
    const child = spawn(cmd[0], [...cmd.slice(1), "--port", "stdio", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: this.env ? { ...process.env, ...this.env } : process.env,
    });
    this.child = child;
    // Tipo 2: zona cambiada de la pantalla (binario, ver port.cpp).
    const dec = new FrameDecoder((type, msg) => {
      if (type === FRAME_JSON) this.#onMessage(msg);
      else this.emit(type === FRAME_DISPLAY ? "display" : "frame", msg);
    });
    child.stdout.on("data", (d) => dec.push(d));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => this.emit("stderr", d));
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      const r = this.pendingRestart;
      this.pendingRestart = null;
      if (code === RESTART_EXIT_CODE && r) {
        this.#spawn([...this.#baseArgs(r), "--resume", r.resume, ...(r.state_temp ? ["--state", r.state, "--state-temp"] : [])]);
        return;
      }
      this.child = null;
      this.emit("exit", { code, signal });
    });
    child.on("error", (err) => this.emit("stderr", `[jwsim] no se pudo iniciar el runner: ${err.message}\n`));
    child.stdin.on("error", () => {});
  }
  // Argumentos originales sin los de una reanudación anterior.
  #baseArgs(r) {
    const out = [];
    for (let i = 0; i < this.args.length; i++) {
      const a = this.args[i];
      if (a === "--resume" || (r.state_temp && a === "--state")) i++;
      else if (a !== "--state-temp") out.push(a);
    }
    return out;
  }
  async #onMessage(msg) {
    if (msg.type === "restart") {
      this.pendingRestart = msg;
      this.queue = [];
      this.emit("message", msg);
    } else if (msg.type === "hello" && this.queue) {
      this.emit("message", msg);
      this.emit("restarted", { pid: this.pid, boot_ns: msg.t_ns });
      try {
        await this.onRestart?.();
      } catch (err) {
        this.emit("stderr", `[jwsim] ${err.message}\n`);
      }
      const queued = this.queue;
      this.queue = null;
      if (this.lastSubscribe) this.#write(this.lastSubscribe);
      for (const m of queued) this.send(m);
      if (this.lastRun?.type === "run" && !queued.some((m) => m.type === "run" || m.type === "pause")) this.#write(this.lastRun);
      return;
    }
    if (msg.type === "reached") this.lastRun = null;
    this.emit("message", msg);
  }
  #write(msg) {
    if (this.child) this.child.stdin.write(encodeFrame(FRAME_JSON, msg));
  }
  send(msg) {
    if (msg.type === "run" || msg.type === "pause") this.lastRun = msg;
    if (msg.type === "subscribe") this.lastSubscribe = msg;
    if (msg.type === "quit") this.lastRun = null;
    if (this.queue && msg.type !== "quit") {
      this.queue.push(msg);
      return;
    }
    this.#write(msg);
  }
  get pid() {
    return this.child?.pid ?? null;
  }
  get running() {
    return !!this.child;
  }
  stop() {
    this.pendingRestart = null;
    this.queue = null;
    if (!this.child) return;
    this.send({ type: "quit" });
    const c = this.child;
    setTimeout(() => c.exitCode === null && c.kill(), 500);
  }
}
