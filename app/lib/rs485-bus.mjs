// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Bus RS-485 entre varios PLC simulados y un extremo del host (gate
// JWSIM_G4_RS485_MULTINODE).
//
// Cada nodo es un runner (proceso propio, con su tiempo virtual). El bus los
// hace avanzar juntos en ventanas de Q ns virtuales (sincronización
// conservadora): al cerrar cada ventana recoge los bytes que cada UART2
// transmitió ([inicio, fin] de cada carácter, a su velocidad) y los entrega a
// los demás nodos con una demora fija de Q contada desde el fin del
// carácter, que ningún nodo ha pasado todavía. Así la simulación conjunta es
// determinista y conserva la separación entre caracteres; la latencia extra
// es Q (con Q = un carácter, la llegada es exacta). Dos caracteres de nodos
// distintos que se solapan en el tiempo chocan: llegan corruptos (AND de
// ambos) a todos. Como el transceptor MAX13487E (auto-dirección), un nodo no
// recibe lo que él mismo transmite.
//
// Extremo del host (opcional): un flujo (socket TCP o puerto serie) por el
// que una herramienta externa habla con el bus. Con un extremo del host el
// bus avanza a la velocidad del reloj de pared.
import { EventEmitter } from "node:events";

import { RunnerProcess } from "./sim-port.mjs";

export class Rs485Bus extends EventEmitter {
  // baud: velocidad del bus (para espaciar lo que llega del host).
  constructor({ baud = 115200, quantumNs = 1_000_000, port = 2 } = {}) {
    super();
    this.baud = baud;
    this.q = quantumNs;
    this.port = port;
    this.nodes = [];
    this.t = 0;
    this.log = [];          // [{ start, stop, from (nodo o null = host), byte, collision }]
    this.hostIn = [];        // bytes del host aún no enviados al bus
    this.hostFreeAt = 0;
    this.host = null;
  }

  // Bits por carácter 8N1 = 10.
  get charNs() {
    return Math.round((10 * 1e9) / this.baud);
  }

  addNode(name, exe, args = [], { env } = {}) {
    const proc = new RunnerProcess();
    const node = { name, proc, tx: [], console: "", hash: null, exited: null, waiter: null };
    proc.on("message", (m) => {
      if (m.type === "uart_tx" && m.port === this.port) node.tx.push(...m.bytes);
      else if (m.type === "serial" && m.port === 0) node.console += m.text;
      else if (m.type === "reached") {
        node.hash = m.trace_hash;
        const w = node.waiter;
        node.waiter = null;
        w?.(m);
      }
      this.emit("message", node, m);
    });
    proc.on("stderr", (t) => this.emit("stderr", node, t));
    proc.on("exit", (info) => {
      node.exited = info;
      node.waiter?.(null);
    });
    proc.start(exe, args, { env });
    proc.send({ type: "rs485", port: this.port, on: 1 });
    this.nodes.push(node);
    return node;
  }

  // Extremo del host: `stream` es un dúplex (net.Socket, puerto serie).
  attachHost(stream) {
    this.host = stream;
    stream.on("data", (d) => this.hostIn.push(...d));
  }

  #runTo(node, untilNs) {
    return new Promise((resolve) => {
      if (node.exited) return resolve(null);
      node.waiter = resolve;
      node.proc.send({ type: "run", speed: 0, until_ns: untilNs });
    });
  }

  // Avanza el bus hasta untilNs. realtime: a la par del reloj de pared.
  //
  // Un runner informa cada carácter al escribirlo, con su [inicio, fin]
  // (puede caer varias ventanas más adelante si la trama es larga). Los
  // caracteres quedan "en el aire" hasta su fin: uno informado después que
  // se solape con ellos choca. La entrega (fin + Q) se envía a cada nodo
  // recién antes de la ventana que la contiene; para entonces todo lo que
  // podía chocar con ese carácter ya se informó (empezó antes de su fin).
  async runUntil(untilNs, { realtime = !!this.host } = {}) {
    const wall0 = Date.now();
    const t0 = this.t;
    while (this.t < untilNs) {
      const end = Math.min(this.t + this.q, untilNs);
      // Lo recibido del host sale al bus desde el comienzo de esta ventana,
      // a la velocidad del bus.
      if (this.hostIn.length) {
        const chars = this.hostIn.splice(0).map((byte) => {
          const start = Math.max(this.t, this.hostFreeAt ?? 0);
          this.hostFreeAt = start + this.charNs;
          return { start, stop: this.hostFreeAt, byte, from: null };
        });
        this.#launch(chars);
      }
      // Entregas que vencen en esta ventana.
      const due = this.#due.filter((c) => c.stop + this.q < end);
      this.#due = this.#due.filter((c) => c.stop + this.q >= end);
      for (const n of this.nodes) {
        const rx = due.filter((c) => c.from !== n);
        // El protocolo lleva objetos planos: "t_ns:hh,t_ns:hh".
        if (rx.length) n.proc.send({ type: "uart_rx", port: this.port, data: rx.map((c) => `${c.stop + this.q}:${c.byte.toString(16).padStart(2, "0")}`).join(",") });
      }
      const toHost = due.filter((c) => c.from);
      if (toHost.length && this.host) this.host.write(Buffer.from(toHost.map((c) => c.byte)));
      const reached = await Promise.all(this.nodes.map((n) => this.#runTo(n, end)));
      if (reached.some((r) => r === null)) throw new Error(`un nodo terminó: ${this.nodes.filter((n) => n.exited).map((n) => n.name).join(", ")}`);
      this.#launch(this.nodes.flatMap((n) => n.tx.splice(0).map(([start, stop, byte]) => ({ start, stop, byte, from: n }))));
      this.t = end;
      this.#air = this.#air.filter((c) => c.stop > this.t);
      if (realtime) {
        const ahead = (this.t - t0) / 1e6 - (Date.now() - wall0);
        if (ahead > 1) await new Promise((r) => setTimeout(r, ahead));
      }
    }
    // Lo que quedó en camino se entrega en la próxima llamada.
  }

  #air = [];   // caracteres que aún no terminan
  #due = [];   // caracteres por entregar

  // Caracteres nuevos en el bus: los que se solapan con otros de otro
  // emisor chocan (AND de ambos, para todos).
  #launch(chars) {
    chars.sort((a, b) => a.start - b.start || (a.from?.name ?? "").localeCompare(b.from?.name ?? ""));
    for (const c of chars) {
      for (const o of this.#air) {
        if (o.from === c.from || o.start >= c.stop || c.start >= o.stop) continue;
        o.byte = c.byte = o.byte & c.byte;
        o.collision = c.collision = true;
      }
      this.#air.push(c);
      this.#due.push(c);
      this.log.push(c);
    }
  }

  async stop() {
    for (const n of this.nodes) n.proc.stop();
    await Promise.all(this.nodes.map((n) => (n.exited ? null : new Promise((r) => n.proc.once("exit", r)))));
  }
}
