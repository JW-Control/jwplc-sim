// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Cliente mínimo de Debug Adapter Protocol para `gdb -i=dap` (GDB ≥ 14 con
// Python; el GDB de WinLibs y el de las distribuciones lo traen).
//
// Mensajes con encabezado "Content-Length: N\r\n\r\n" + JSON. request()
// devuelve una promesa con el cuerpo de la respuesta (o rechaza con el
// mensaje de error del adaptador); los eventos se emiten con su nombre DAP
// ("stopped", "continued", "output", "terminated"...).
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export class DapClient extends EventEmitter {
  // extraArgs: opciones de gdb antes de -i=dap (p. ej. -iex "set debug
  // dap-log-file ..." para diagnosticar).
  constructor(gdbPath, { cwd, env, extraArgs = [] } = {}) {
    super();
    this.seq = 1;
    this.pending = new Map();
    this.buf = Buffer.alloc(0);
    this.child = spawn(gdbPath, ["-q", "-nx", ...extraArgs, "-i=dap"], { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stdout.on("data", (d) => this.#onData(d));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (t) => this.emit("stderr", t));
    this.child.on("exit", (code) => {
      for (const { reject } of this.pending.values()) reject(new Error(`gdb terminó (código ${code})`));
      this.pending.clear();
      this.emit("exit", code);
    });
    this.child.on("error", (err) => this.emit("stderr", `no se pudo iniciar gdb: ${err.message}\n`));
    this.child.stdin.on("error", () => {});
  }

  #onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const sep = this.buf.indexOf("\r\n\r\n");
      if (sep < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(this.buf.subarray(0, sep).toString("ascii"));
      if (!m) {
        this.buf = this.buf.subarray(sep + 4);
        continue;
      }
      const len = Number(m[1]);
      if (this.buf.length < sep + 4 + len) return;
      const msg = JSON.parse(this.buf.subarray(sep + 4, sep + 4 + len).toString("utf8"));
      this.buf = this.buf.subarray(sep + 4 + len);
      this.#dispatch(msg);
    }
  }

  #dispatch(msg) {
    // JWSIM_DAP_TRACE=1: todo lo que envía gdb, a stderr (diagnóstico).
    if (process.env.JWSIM_DAP_TRACE && msg.type === "event" && msg.event !== "output" && msg.event !== "module") {
      process.stderr.write(`[dap] ${msg.event} ${JSON.stringify(msg.body ?? {})}\n`);
    }
    if (msg.type === "response") {
      const p = this.pending.get(msg.request_seq);
      if (!p) return;
      this.pending.delete(msg.request_seq);
      if (msg.success) p.resolve(msg.body ?? {});
      else p.reject(new Error(msg.body?.error?.format ?? msg.message ?? `${p.command} falló`));
    } else if (msg.type === "event") {
      this.emit(msg.event, msg.body ?? {});
    }
  }

  // timeoutMs: gdb puede quedar colgado (p. ej. un attach que no progresa);
  // la interfaz no debe esperar para siempre.
  request(command, args = {}, timeoutMs = 30000) {
    const seq = this.seq++;
    const body = Buffer.from(JSON.stringify({ seq, type: "request", command, arguments: args }), "utf8");
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`gdb no respondió '${command}' en ${timeoutMs} ms`));
      }, timeoutMs);
      const done = (fn) => (v) => {
        clearTimeout(t);
        fn(v);
      };
      this.pending.set(seq, { resolve: done(resolve), reject: done(reject), command });
      this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]));
    });
  }

  waitEvent(name, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.off(name, on);
        reject(new Error(`gdb no envió el evento '${name}' en ${timeoutMs} ms`));
      }, timeoutMs);
      const on = (body) => {
        clearTimeout(t);
        resolve(body);
      };
      this.once(name, on);
    });
  }

  kill() {
    if (this.child.exitCode === null) this.child.kill();
  }
}
