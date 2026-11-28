// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Broker MQTT 3.1.1 mínimo (QoS 0) para los gates: CONNECT/CONNACK, SUBSCRIBE/SUBACK con
// comodines + y #, PUBLISH (retenidos), PINGREQ/PINGRESP, último deseo y DISCONNECT. Guarda un
// registro de todo lo que pasó en `log` ({ kind, ... }).
import net from "node:net";

const len = (n) => {
  const o = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 128;
    o.push(b);
  } while (n);
  return Buffer.from(o);
};
const str = (s) => {
  const b = Buffer.from(s);
  return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]);
};
const pubPacket = (topic, msg, retain) => {
  const body = Buffer.concat([str(topic), Buffer.from(msg)]);
  return Buffer.concat([Buffer.from([0x30 | (retain ? 1 : 0)]), len(body.length), body]);
};
export const topicMatch = (f, t) => {
  const a = f.split("/"),
    b = t.split("/");
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "#") return true;
    if (a[i] !== "+" && a[i] !== b[i]) return false;
  }
  return a.length === b.length;
};

export class MiniBroker {
  constructor() {
    this.log = [];
    this.subs = new Map(); // socket → [filtros]
    this.retained = new Map();
    this.server = net.createServer((sock) => this.#client(sock));
  }

  listen(port = 0) {
    return new Promise((r) => this.server.listen(port, "127.0.0.1", () => r(this.server.address().port)));
  }

  close() {
    for (const s of this.subs.keys()) s.destroy();
    this.subs.clear();
    return new Promise((r) => this.server.close(() => r()));
  }

  publish(topic, msg, retain = false) {
    this.log.push({ kind: "pub_broker", topic, msg });
    this.#deliver(topic, msg, retain);
  }

  #deliver(topic, msg, retain) {
    if (retain) this.retained.set(topic, msg);
    for (const [sock, fs] of this.subs) if (fs.some((f) => topicMatch(f, topic))) sock.write(pubPacket(topic, msg, false));
  }

  #client(sock) {
    let buf = Buffer.alloc(0);
    let will = null;
    let id = "?";
    this.subs.set(sock, []);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 2) return;
        let n = 0,
          m = 1,
          i = 1,
          b;
        do {
          b = buf[i++];
          n += (b & 127) * m;
          m *= 128;
        } while (b & 128 && i < buf.length);
        if (buf.length < i + n) return;
        const t = buf[0];
        const body = buf.subarray(i, i + n);
        buf = buf.subarray(i + n);
        const k = t >> 4;
        if (k === 1) {
          let p = 0;
          const rd = () => {
            const l = body.readUInt16BE(p);
            const s = body.subarray(p + 2, p + 2 + l).toString();
            p += 2 + l;
            return s;
          };
          rd();
          const level = body[p++];
          const flags = body[p++];
          const keepAlive = body.readUInt16BE(p);
          p += 2;
          id = rd();
          if (flags & 4) will = { topic: rd(), msg: rd() };
          const user = flags & 128 ? rd() : null;
          const pass = flags & 64 ? rd() : null;
          this.log.push({ kind: "connect", id, level, keepAlive, will, user, pass });
          sock.write(Buffer.from([0x20, 2, 0, 0]));
        } else if (k === 3) {
          const l = body.readUInt16BE(0);
          const topic = body.subarray(2, 2 + l).toString();
          const msg = body.subarray(2 + l).toString();
          this.log.push({ kind: "publish", id, topic, msg, retain: !!(t & 1) });
          this.#deliver(topic, msg, !!(t & 1));
        } else if (k === 8) {
          const pid = body.readUInt16BE(0);
          const l = body.readUInt16BE(2);
          const f = body.subarray(4, 4 + l).toString();
          this.subs.get(sock)?.push(f);
          this.log.push({ kind: "subscribe", id, filter: f });
          sock.write(Buffer.from([0x90, 3, pid >> 8, pid & 255, 0]));
          for (const [topic, msg] of this.retained) if (topicMatch(f, topic)) sock.write(pubPacket(topic, msg, true));
        } else if (k === 12) {
          this.log.push({ kind: "ping", id });
          sock.write(Buffer.from([0xd0, 0]));
        } else if (k === 14) {
          this.log.push({ kind: "disconnect", id });
          will = null;
        }
      }
    });
    const bye = () => {
      if (!this.subs.has(sock)) return;
      this.subs.delete(sock);
      this.log.push({ kind: "closed", id });
      if (will) this.#deliver(will.topic, will.msg, true);
    };
    sock.on("close", bye);
    sock.on("error", bye);
  }
}
