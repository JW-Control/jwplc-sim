// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sesión de depuración (G3): gdb -i=dap adjunto al runner ya lanzado (en
// pausa, protocolo por stdio intacto). Mientras gdb lo tiene detenido el
// proceso no corre, así que el tiempo virtual no avanza; al continuar, el
// runner se re-sincroniza con el reloj sin recuperar el tiempo perdido.
//
// Eventos: "stopped" ({ reason, frame: { name, path, line } }), "continued",
// "output" (texto de gdb), "exited".
import { EventEmitter } from "node:events";

import { DapClient } from "./dap-client.mjs";

export class DebugSession extends EventEmitter {
  // allowCalls: permitir que las expresiones llamen funciones del firmware.
  // Por defecto no: una llamada (p. ej. millis()) corre código del sketch y le
  // cobra CPU virtual, y la simulación dejaría de ser reproducible.
  constructor({ gdb, exe, pid, allowCalls = false }) {
    super();
    this.gdb = gdb;
    this.exe = exe;
    this.pid = pid;
    this.allowCalls = allowCalls;
    this.sampleWaiter = null;
    this.threadId = null;
    this.stoppedNow = false;
    this.started = false;
  }

  // breakpoints: Map<rutaAbsoluta, número de línea[]>. Devuelve las líneas
  // verificadas por gdb por archivo.
  async start(breakpoints = new Map()) {
    const dap = new DapClient(this.gdb);
    this.dap = dap;
    dap.on("output", (b) => this.emit("output", b.output ?? ""));
    dap.on("stderr", (t) => this.emit("output", t));
    dap.on("exit", () => this.emit("exited"));
    dap.on("continued", () => {
      this.stoppedNow = false;
      this.emit("continued");
    });
    dap.on("stopped", async (b) => {
      // La detención propia del attach no es un breakpoint del usuario.
      if (!this.started) return;
      // Una pausa pedida llega como "pause" (SIGINT, Linux) o como "signal"
      // (SIGTRAP de DebugBreakProcess en Windows, en un hilo inyectado que
      // no es el del firmware: se sigue mirando el hilo principal).
      let reason = b.reason;
      if (this.pauseRequested && (reason === "pause" || reason === "signal")) {
        reason = "pause";
      } else if (b.threadId) {
        this.threadId = b.threadId;
      }
      this.pauseRequested = false;
      if (reason === "pause") this.threadId = this.mainThreadId ?? this.threadId;
      if (this.sampleWaiter) {
        const w = this.sampleWaiter;
        this.sampleWaiter = null;
        w(reason);
        // La pausa de un muestreo no se informa; un breakpoint que llegó
        // antes que la pausa, sí.
        if (reason === "pause") return;
      }
      this.stoppedNow = true;
      const frame = await this.topFrame().catch(() => null);
      this.emit("stopped", { reason, frame });
    });
    const initialized = dap.waitEvent("initialized");
    await dap.request("initialize", { adapterID: "gdb", clientID: "jwplc-sim", linesStartAt1: true, columnsStartAt1: true, pathFormat: "path" });
    // Orden del protocolo: attach, (initialized) configuración, configurationDone.
    // gdb ≥ 16 responde al attach recién después de configurationDone; gdb 15,
    // de inmediato. No se espera la respuesta antes de configurar.
    const attached = dap.request("attach", { pid: this.pid, program: this.exe }, 120000);
    attached.catch(() => {});
    await initialized;
    await this.#cli(`set may-call-functions ${this.allowCalls ? "on" : "off"}`);
    for (const [path, lines] of breakpoints) await this.setBreakpoints(path, lines);
    await dap.request("configurationDone");
    await attached;
    // Con el programa ya cargado, gdb informa qué líneas tienen código.
    const verified = new Map();
    for (const [path, lines] of breakpoints) verified.set(path, await this.setBreakpoints(path, lines));
    const { threads } = await dap.request("threads");
    // El hilo principal del runner (planificador y fibras del firmware) es el
    // primero que creó el proceso: el de número menor en gdb.
    this.threadId = threads.length ? Math.min(...threads.map((t) => t.id)) : 1;
    this.mainThreadId = this.threadId;
    this.started = true;
    await this.continue();
    return verified;
  }

  #cli(command) {
    return this.dap.request("evaluate", { expression: command, context: "repl" });
  }

  // Lee expresiones con el firmware corriendo (tabla de observación en vivo):
  // detiene el proceso un instante, evalúa y continúa. El tiempo virtual no
  // avanza mientras tanto, así que no altera la simulación. Devuelve null si
  // el programa ya está detenido por el usuario (la interfaz evalúa aparte).
  async sample(expressions) {
    if (!this.started || this.stoppedNow || this.sampling) return null;
    this.sampling = true;
    try {
      const reason = new Promise((resolve) => (this.sampleWaiter = resolve));
      this.pauseRequested = true;
      await this.dap.request("pause", { threadId: this.threadId });
      const why = await Promise.race([reason, new Promise((r) => setTimeout(() => r(null), 3000))]);
      this.sampleWaiter = null;
      if (why === null) return null;
      const out = {};
      for (const e of expressions) {
        out[e] = await this.evaluate(e).then(
          (v) => v.value,
          (err) => `‹${err.message}›`,
        );
      }
      if (why === "pause") await this.dap.request("continue", { threadId: this.threadId });
      return out;
    } finally {
      this.sampling = false;
    }
  }

  async setBreakpoints(path, lines) {
    const r = await this.dap.request("setBreakpoints", { source: { path }, breakpoints: lines.map((line) => ({ line })) });
    return r.breakpoints.filter((b) => b.verified).map((b) => b.line);
  }

  async topFrame() {
    const { stackFrames } = await this.dap.request("stackTrace", { threadId: this.threadId, levels: 1 });
    const f = stackFrames[0];
    return f ? { id: f.id, name: f.name, path: f.source?.path ?? null, line: f.line } : null;
  }

  async stack(levels = 20) {
    const { stackFrames } = await this.dap.request("stackTrace", { threadId: this.threadId, levels });
    return stackFrames.map((f) => ({ id: f.id, name: f.name, path: f.source?.path ?? null, line: f.line }));
  }

  async scopes(frameId) {
    const { scopes } = await this.dap.request("scopes", { frameId });
    return scopes.filter((s) => s.name !== "Registers").map((s) => ({ name: s.name, ref: s.variablesReference }));
  }

  async variables(ref) {
    const { variables } = await this.dap.request("variables", { variablesReference: ref });
    return variables.map((v) => ({ name: v.name, value: v.value, type: v.type ?? "", ref: v.variablesReference }));
  }

  async evaluate(expression, frameId) {
    const r = await this.dap.request("evaluate", { expression, frameId, context: "watch" });
    return { value: r.result, ref: r.variablesReference ?? 0 };
  }

  #step(command) {
    this.stoppedNow = false;
    return this.dap.request(command, { threadId: this.threadId });
  }
  continue() {
    return this.#step("continue");
  }
  next() {
    return this.#step("next");
  }
  stepIn() {
    return this.#step("stepIn");
  }
  stepOut() {
    return this.#step("stepOut");
  }
  pause() {
    this.pauseRequested = true;
    return this.dap.request("pause", { threadId: this.threadId });
  }

  async stop() {
    if (!this.dap) return;
    await Promise.race([
      this.dap.request("disconnect", { terminateDebuggee: false }).catch(() => {}),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    this.dap.kill();
  }
}
