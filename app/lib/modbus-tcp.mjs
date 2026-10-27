// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modbus TCP (Modbus Messaging on TCP/IP Implementation Guide V1.0b): un
// cliente y un servidor mínimos, para el gate JWSIM_G4_MODBUS_TCP_HOST.
// MBAP = id de transacción, protocolo 0, largo, unidad; luego el PDU.
import net from "node:net";

export class ModbusTcpClient {
  constructor(host, port, unit = 1) {
    this.host = host;
    this.port = port;
    this.unit = unit;
    this.tid = 0;
  }

  async connect(timeoutMs = 3000) {
    this.sock = net.connect(this.port, this.host);
    this.buf = Buffer.alloc(0);
    this.sock.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      this.wake?.();
    });
    this.sock.on("error", () => {});
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("sin conexión")), timeoutMs);
      this.sock.once("connect", () => {
        clearTimeout(t);
        resolve();
      });
      this.sock.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  close() {
    this.sock?.destroy();
  }

  // Envía un PDU y espera la respuesta con el mismo id de transacción.
  async request(pdu, timeoutMs = 3000) {
    const tid = (this.tid = (this.tid + 1) & 0xffff);
    const mbap = Buffer.alloc(7);
    mbap.writeUInt16BE(tid, 0);
    mbap.writeUInt16BE(0, 2);
    mbap.writeUInt16BE(pdu.length + 1, 4);
    mbap[6] = this.unit;
    this.sock.write(Buffer.concat([mbap, Buffer.from(pdu)]));
    const end = Date.now() + timeoutMs;
    for (;;) {
      if (this.buf.length >= 7) {
        const len = this.buf.readUInt16BE(4);
        if (this.buf.length >= 6 + len) {
          const frame = this.buf.subarray(0, 6 + len);
          this.buf = this.buf.subarray(6 + len);
          if (frame.readUInt16BE(0) !== tid) continue;
          return frame.subarray(7);
        }
      }
      const left = end - Date.now();
      if (left <= 0) throw new Error("sin respuesta");
      await new Promise((r) => {
        this.wake = r;
        setTimeout(r, Math.min(left, 50));
      });
    }
  }

  async readHolding(addr, qty) {
    const r = await this.request([0x03, addr >> 8, addr & 255, qty >> 8, qty & 255]);
    if (r[0] !== 0x03) throw new Error(`excepción ${r[1]}`);
    return Array.from({ length: r[1] / 2 }, (_, i) => r.readUInt16BE(2 + 2 * i));
  }
  async readInput(addr, qty) {
    const r = await this.request([0x04, addr >> 8, addr & 255, qty >> 8, qty & 255]);
    if (r[0] !== 0x04) throw new Error(`excepción ${r[1]}`);
    return Array.from({ length: r[1] / 2 }, (_, i) => r.readUInt16BE(2 + 2 * i));
  }
  async writeSingle(addr, value) {
    const r = await this.request([0x06, addr >> 8, addr & 255, value >> 8, value & 255]);
    if (r[0] !== 0x06) throw new Error(`excepción ${r[1]}`);
    return r.readUInt16BE(3);
  }
  async writeMultiple(addr, values) {
    const pdu = [0x10, addr >> 8, addr & 255, values.length >> 8, values.length & 255, values.length * 2];
    for (const v of values) pdu.push(v >> 8, v & 255);
    const r = await this.request(pdu);
    if (r[0] !== 0x10) throw new Error(`excepción ${r[1]}`);
    return r.readUInt16BE(3);
  }
  async writeCoil(addr, on) {
    const r = await this.request([0x05, addr >> 8, addr & 255, on ? 0xff : 0x00, 0x00]);
    if (r[0] !== 0x05) throw new Error(`excepción ${r[1]}`);
    return r[3] === 0xff;
  }
  async readDiscrete(addr, qty) {
    const r = await this.request([0x02, addr >> 8, addr & 255, qty >> 8, qty & 255]);
    if (r[0] !== 0x02) throw new Error(`excepción ${r[1]}`);
    return Array.from({ length: qty }, (_, i) => (r[2 + (i >> 3)] >> (i & 7)) & 1);
  }
  async writeCoils(addr, bits) {
    const n = Math.ceil(bits.length / 8);
    const pdu = [0x0f, addr >> 8, addr & 255, bits.length >> 8, bits.length & 255, n, ...new Array(n).fill(0)];
    bits.forEach((b, i) => (pdu[6 + (i >> 3)] |= (b ? 1 : 0) << (i & 7)));
    const r = await this.request(pdu);
    if (r[0] !== 0x0f) throw new Error(`excepción ${r[1]}`);
    return r.readUInt16BE(3);
  }
  async readCoils(addr, qty) {
    const r = await this.request([0x01, addr >> 8, addr & 255, qty >> 8, qty & 255]);
    if (r[0] !== 0x01) throw new Error(`excepción ${r[1]}`);
    return Array.from({ length: qty }, (_, i) => (r[2 + (i >> 3)] >> (i & 7)) & 1);
  }
}

// Servidor con registros holding (FC03/FC06/FC16); el resto, excepción 01.
export function modbusTcpServer(holding, { port = 0, host = "127.0.0.1" } = {}) {
  const requests = [];
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("error", () => {});
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 7 && buf.length >= 6 + buf.readUInt16BE(4)) {
        const len = buf.readUInt16BE(4);
        const frame = buf.subarray(0, 6 + len);
        buf = buf.subarray(6 + len);
        const pdu = frame.subarray(7);
        requests.push(Array.from(pdu));
        const a = pdu.length >= 3 ? pdu.readUInt16BE(1) : 0;
        let out;
        if (pdu[0] === 0x03) {
          const q = pdu.readUInt16BE(3);
          out = Buffer.alloc(2 + 2 * q);
          out[0] = 0x03;
          out[1] = 2 * q;
          for (let i = 0; i < q; i++) out.writeUInt16BE(holding[a + i] ?? 0, 2 + 2 * i);
        } else if (pdu[0] === 0x06) {
          holding[a] = pdu.readUInt16BE(3);
          out = Buffer.from(pdu.subarray(0, 5));
        } else if (pdu[0] === 0x10) {
          const q = pdu.readUInt16BE(3);
          for (let i = 0; i < q; i++) holding[a + i] = pdu.readUInt16BE(6 + 2 * i);
          out = Buffer.from(pdu.subarray(0, 5));
        } else {
          out = Buffer.from([pdu[0] | 0x80, 0x01]);
        }
        const mbap = Buffer.from(frame.subarray(0, 7));
        mbap.writeUInt16BE(out.length + 1, 4);
        sock.write(Buffer.concat([mbap, out]));
      }
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, port: server.address().port, requests })));
}
