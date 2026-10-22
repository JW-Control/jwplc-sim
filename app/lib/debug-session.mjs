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
  constructor({ gdb, exe, pid }) {
    super();
    this.gdb = gdb;
    this.exe = exe;
    this.pid = pid;
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
      this.stoppedNow = true;
      if (b.threadId) this.threadId = b.threadId;
      // La detención propia del attach no es un breakpoint del usuario.
      if (!this.started) return;
      const frame = await this.topFrame().catch(() => null);
      this.emit("stopped", { reason: b.reason, frame });
    });
    const initialized = dap.waitEvent("initialized");
    await dap.request("initialize", { adapterID: "gdb", clientID: "jwplc-sim", linesStartAt1: true, columnsStartAt1: true, pathFormat: "path" });
    await dap.request("attach", { pid: this.pid, program: this.exe });
    await initialized;
    const verified = new Map();
    for (const [path, lines] of breakpoints) verified.set(path, await this.setBreakpoints(path, lines));
    await dap.request("configurationDone");
    const { threads } = await dap.request("threads");
    // El hilo principal del runner es el del planificador (y de las fibras
    // del firmware): el primero que lista gdb.
    this.threadId = threads[0]?.id ?? 1;
    this.started = true;
    await this.continue();
    return verified;
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
