// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Puente de E/S (G8 OIP_FUXA): la bornera del JWPLC Basic simulado como un
// esclavo Modbus TCP del host, para que una planta 3D (Open Industry
// Project) o un SCADA/HMI (FUXA) maneje las entradas y lea las salidas como
// si estuviera cableado a la placa. No pasa por el W5500 ni por el sketch:
// es la «bornera» vista desde afuera.
//
// Mapa (cualquier unidad; direcciones desde 0):
//   bobinas (FC01 leer, FC05/FC15 escribir)
//     0-7    I0.0-I0.7   las escribe la planta (sensores, pulsadores)
//     16-23  Q0.0-Q0.7   salidas a relé (solo lectura)
//   entradas discretas (FC02)
//     0-7    Q0.0-Q0.7   salidas a relé (los actuadores de la planta)
//     8-15   I0.0-I0.7
//   registros (FC03 holding y FC04 input; FC06/FC16 escriben el 0)
//     0      I0.7…I0.0 como bits (bit 0 = I0.0)
//     1      Q0.7…Q0.0 como bits (solo lectura)
// Otra dirección o función: excepción 02 / 01.
import { EventEmitter } from "node:events";
import net from "node:net";

const N = 8;
const IN = Array.from({ length: N }, (_, k) => `I0_${k}`);
const OUT = Array.from({ length: N }, (_, k) => `Q0_${k}`);

export class IoBridge extends EventEmitter {
  /**
   * @param {{ port?: number, host?: string, owns?: (signal: string) => boolean }} [opts]
   *   owns: entradas que maneja otro (la escena); el puente no las escribe.
   */
  constructor({ port = 5020, host = "127.0.0.1", owns = () => false } = {}) {
    super();
    this.port = port;
    this.host = host;
    this.owns = owns;
    /** @type {Map<string, boolean>} */
    this.levels = new Map([...IN, ...OUT].map((s) => [s, false]));
    this.runner = null;
    this.server = null;
    this.clients = new Set();
  }

  /** Engancha el runner y abre el puerto. */
  attach(runner) {
    this.runner = runner;
    this.onMessage = (m) => {
      if (m.type === "hello") for (const [s, v] of m.signals ?? []) if (this.levels.has(s)) this.levels.set(s, !!v);
      if (m.type === "signals") for (const [s, v] of m.changes ?? []) if (this.levels.has(s)) this.levels.set(s, !!v);
    };
    runner.on("message", this.onMessage);
    this.server = net.createServer((sock) => this.#serve(sock));
    this.server.on("error", (err) => this.emit("error", new Error(`puente de E/S: ${err.code === "EADDRINUSE" ? `el puerto ${this.port} está en uso` : err.message}`)));
    this.server.listen(this.port, this.host, () => {
      this.port = this.server.address().port;
      this.emit("listening", this.host, this.port);
    });
  }

  close() {
    this.runner?.off("message", this.onMessage);
    for (const s of this.clients) s.destroy();
    this.server?.close();
    this.server = null;
  }

  #set(signal, on) {
    if (this.owns(signal)) return;
    if (this.levels.get(signal) === on) return;
    this.levels.set(signal, on);
    this.runner?.send({ type: "set", signal, value: on ? 1 : 0 });
    this.emit("input", signal, on);
  }

  #bits(list) {
    return list.reduce((acc, s, k) => acc | (this.levels.get(s) ? 1 << k : 0), 0);
  }

  /** Bits de un rango de bobinas o entradas discretas (undefined: dirección inválida). */
  #readBits(table, a, q) {
    const out = [];
    for (let i = a; i < a + q; i++) {
      const s = table === "coil" ? (i < N ? IN[i] : i >= 16 && i < 16 + N ? OUT[i - 16] : null) : i < N ? OUT[i] : i < 2 * N ? IN[i - N] : null;
      if (!s) return undefined;
      out.push(this.levels.get(s) ? 1 : 0);
    }
    return out;
  }

  /** PDU de respuesta a un PDU de pedido (Modbus Application Protocol V1.1b3). */
  handle(pdu) {
    const fc = pdu[0];
    const exc = (code) => Buffer.from([fc | 0x80, code]);
    if (![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0f, 0x10].includes(fc)) return exc(0x01);
    if (pdu.length < 5) return exc(0x03);
    const a = pdu.readUInt16BE(1);
    const q = pdu.readUInt16BE(3);
    if (fc === 0x01 || fc === 0x02) {
      if (q < 1 || q > 2000) return exc(0x03);
      const bits = this.#readBits(fc === 0x01 ? "coil" : "di", a, q);
      if (!bits) return exc(0x02);
      const out = Buffer.alloc(2 + Math.ceil(q / 8));
      out[0] = fc;
      out[1] = Math.ceil(q / 8);
      bits.forEach((b, i) => (out[2 + (i >> 3)] |= b << (i & 7)));
      return out;
    }
    if (fc === 0x03 || fc === 0x04) {
      if (q < 1 || q > 125) return exc(0x03);
      if (a + q > 2) return exc(0x02);
      const regs = [this.#bits(IN), this.#bits(OUT)];
      const out = Buffer.alloc(2 + 2 * q);
      out[0] = fc;
      out[1] = 2 * q;
      for (let i = 0; i < q; i++) out.writeUInt16BE(regs[a + i], 2 + 2 * i);
      return out;
    }
    if (fc === 0x05) {
      if (q !== 0xff00 && q !== 0x0000) return exc(0x03);
      if (a >= N) return exc(0x02);
      this.#set(IN[a], q === 0xff00);
      return Buffer.from(pdu.subarray(0, 5));
    }
    if (fc === 0x0f) {
      if (q < 1 || q > 1968 || pdu.length < 6 + Math.ceil(q / 8)) return exc(0x03);
      if (a + q > N) return exc(0x02);
      for (let i = 0; i < q; i++) this.#set(IN[a + i], ((pdu[6 + (i >> 3)] >> (i & 7)) & 1) === 1);
      return Buffer.from(pdu.subarray(0, 5));
    }
    if (fc === 0x06) {
      if (a !== 0) return exc(0x02);
      for (let k = 0; k < N; k++) this.#set(IN[k], ((q >> k) & 1) === 1);
      return Buffer.from(pdu.subarray(0, 5));
    }
    if (fc === 0x10) {
      if (q < 1 || q > 123 || pdu.length < 6 + 2 * q) return exc(0x03);
      if (a !== 0 || q !== 1) return exc(0x02);
      const v = pdu.readUInt16BE(6);
      for (let k = 0; k < N; k++) this.#set(IN[k], ((v >> k) & 1) === 1);
      return Buffer.from(pdu.subarray(0, 5));
    }
    return exc(0x01);   // no se llega: la función ya se validó
  }

  #serve(sock) {
    this.clients.add(sock);
    this.emit("client", sock.remoteAddress, sock.remotePort);
    let buf = Buffer.alloc(0);
    sock.on("error", () => {});
    sock.on("close", () => this.clients.delete(sock));
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 7 && buf.length >= 6 + buf.readUInt16BE(4)) {
        const len = buf.readUInt16BE(4);
        const frame = buf.subarray(0, 6 + len);
        buf = buf.subarray(6 + len);
        if (frame.readUInt16BE(2) !== 0 || len < 2) continue; // no es Modbus
        const out = this.handle(Buffer.from(frame.subarray(7)));
        const mbap = Buffer.from(frame.subarray(0, 7));
        mbap.writeUInt16BE(out.length + 1, 4);
        sock.write(Buffer.concat([mbap, out]));
      }
    });
  }
}
