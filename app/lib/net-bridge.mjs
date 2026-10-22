// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Puente entre el W5500 simulado y la red del host (gates
// JWSIM_G4_W5500_MODEL y JWSIM_G4_MODBUS_TCP_HOST).
//
// El runner informa lo que el chip envía ({"type":"net", op, s, ...}) y el
// puente responde con lo que llega de la red ({"type":"net_in", ...}), que
// el runner agenda en el instante virtual actual y deja en la grabación.
//
// Red virtual vista por el PLC (subred /24, por defecto 192.168.250.0):
//   .1    puerta de enlace = el host: servidor DHCP (entrega `plcIp`) y DNS
//         (resuelve con el DNS del host); TCP/UDP a .1 va a 127.0.0.1
//   otra  TCP/UDP a cualquier otra IP sale tal cual por la red del host,
//         salvo las de `hosts` ({ "192.168.0.100": "127.0.0.1" }); el puerto
//         de destino pasa por `connectPort(ip, puerto)` (por defecto igual)
// Un socket del PLC en LISTEN en el puerto P se publica en el host en
// `listenPort(P)` (por defecto P + 1000 si P < 1024, si no P), en
// `listenHost` (127.0.0.1; "0.0.0.0" para la LAN).
import dgram from "node:dgram";
import dns from "node:dns";
import { EventEmitter } from "node:events";
import net from "node:net";

const ip2n = (s) => s.split(".").reduce((a, b) => ((a << 8) | Number(b)) >>> 0, 0);
const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
const hex = (buf) => Buffer.from(buf).toString("hex");
const isLoopback = (a) => /^(::ffff:)?127\./.test(a) || a === "::1";
const v4 = (a) => a.replace(/^::ffff:/, "");

export class NetBridge extends EventEmitter {
  constructor({ subnet = "192.168.250", plcIp, listenHost = "127.0.0.1", listenPort, hosts = {}, connectPort, lease = 86400 } = {}) {
    super();
    this.gateway = `${subnet}.1`;
    this.plcIp = plcIp ?? `${subnet}.10`;
    this.mask = "255.255.255.0";
    this.listenHost = listenHost;
    this.listenPort = listenPort ?? ((p) => (p < 1024 ? p + 1000 : p));
    this.lease = lease;
    this.hosts = hosts;
    this.connectPort = connectPort ?? ((_ip, p) => p);
    this.proc = null;
    this.tcp = new Map();       // s → net.Socket conectado
    this.listening = new Map(); // puerto del PLC → { server, sockets: Set<s>, backlog: [net.Socket] }
    this.udp = new Map();       // s → { port, sock: dgram.Socket | null }
    this.log = [];              // [{ dir: "out"|"in", ... }] para los gates
  }

  // `proc`: RunnerProcess (o cualquier emisor de "message" con send()).
  attach(proc) {
    this.proc = proc;
    proc.on("message", (m) => {
      if (m.type === "net") this.#onNet(m);
    });
    proc.send({ type: "net", on: 1 });
  }

  close() {
    for (const s of this.tcp.values()) s.destroy();
    for (const l of this.listening.values()) {
      l.server.close();
      for (const c of l.backlog) c.destroy();
    }
    for (const u of this.udp.values()) u.sock?.close();
    this.tcp.clear();
    this.listening.clear();
    this.udp.clear();
  }

  // Puerto del host donde quedó publicado el puerto `p` del PLC.
  hostPortFor(p) {
    return this.listening.get(p)?.server.address()?.port ?? null;
  }

  #in(msg) {
    this.log.push({ dir: "in", ...msg });
    this.proc?.send({ type: "net_in", ...msg });
  }

  #peerIp(addr) {
    return isLoopback(addr) ? this.gateway : v4(addr);
  }

  #target(ip) {
    return this.hosts[ip] ?? (ip === this.gateway ? "127.0.0.1" : ip);
  }

  #onNet(m) {
    this.log.push({ dir: "out", ...m });
    const s = m.s;
    switch (m.op) {
      case "listen": return this.#listen(s, m.port);
      case "connect": return this.#connect(s, m.ip, m.port);
      case "send": return this.tcp.get(s)?.write(Buffer.from(m.hex, "hex"));
      case "close": return this.#closeTcp(s, !!m.fin);
      case "udp_open": return this.#udpOpen(s, m.port);
      case "sendto": return this.#sendto(s, m.ip, m.port, Buffer.from(m.hex, "hex"));
      case "udp_close": {
        this.udp.get(s)?.sock?.close();
        this.udp.delete(s);
        return;
      }
    }
  }

  // ------------------------------------------------------------- TCP
  #wire(s, sock) {
    this.tcp.set(s, sock);
    sock.on("data", (d) => this.tcp.get(s) === sock && this.#in({ op: "data", s, hex: hex(d) }));
    sock.on("end", () => this.tcp.get(s) === sock && this.#in({ op: "peer_closed", s }));
    sock.on("error", () => {});
    sock.on("close", (hadError) => {
      if (this.tcp.get(s) !== sock) return;
      this.tcp.delete(s);
      if (hadError) this.#in({ op: "reset", s });
    });
  }

  #connect(s, ip, port) {
    const sock = net.connect({ host: this.#target(ip), port: this.connectPort(ip, port) });
    let connected = false;
    sock.once("connect", () => {
      connected = true;
      this.#wire(s, sock);
      this.#in({ op: "connected", s, ip, port });
    });
    sock.once("error", () => {
      if (connected || this.tcp.get(s) !== sock) return;
      this.tcp.delete(s);
      this.#in({ op: "timeout", s });
    });
    this.tcp.set(s, sock);
  }

  #closeTcp(s, fin) {
    const sock = this.tcp.get(s);
    for (const l of this.listening.values()) l.sockets.delete(s);
    if (!sock) return;
    this.tcp.delete(s);
    if (fin) sock.end();
    else sock.destroy();
  }

  #listen(s, port) {
    let l = this.listening.get(port);
    if (!l) {
      const server = net.createServer({ pauseOnConnect: false }, (c) => {
        l.backlog.push(c);
        c.on("error", () => {});
        this.#accept(port);
      });
      l = { server, sockets: new Set(), backlog: [] };
      this.listening.set(port, l);
      server.on("error", (err) => this.emit("error", err));
      server.listen(this.listenPort(port), this.listenHost, () => this.emit("listening", port, server.address().port));
    }
    l.sockets.add(s);
    this.#accept(port);
  }

  // Un cliente del host se asigna al primer socket del PLC en LISTEN en ese
  // puerto; si no hay ninguno, espera (backlog) hasta el próximo LISTEN.
  #accept(port) {
    const l = this.listening.get(port);
    while (l && l.backlog.length && l.sockets.size) {
      const c = l.backlog.shift();
      if (c.destroyed) continue;
      const [s] = [...l.sockets].sort((a, b) => a - b);
      l.sockets.delete(s);
      this.#wire(s, c);
      this.#in({ op: "connected", s, ip: this.#peerIp(c.remoteAddress ?? "127.0.0.1"), port: c.remotePort ?? 0 });
    }
  }

  // ------------------------------------------------------------- UDP
  #udpOpen(s, port) {
    this.udp.get(s)?.sock?.close();
    this.udp.set(s, { port, sock: null });
  }

  #hostUdp(s) {
    const u = this.udp.get(s);
    if (!u) return null;
    if (!u.sock) {
      u.sock = dgram.createSocket("udp4");
      u.sock.on("message", (d, rinfo) => this.#in({ op: "udp", s, ip: this.#peerIp(rinfo.address), port: rinfo.port, hex: hex(d) }));
      u.sock.on("error", () => {});
      u.sock.bind(0);
    }
    return u.sock;
  }

  #sendto(s, ip, port, data) {
    const u = this.udp.get(s);
    if (!u) return;
    if (port === 67 && (ip === "255.255.255.255" || ip === this.gateway)) return this.#dhcp(s, data);
    if (port === 53 && ip === this.gateway) return this.#dns(s, data);
    if (ip === "255.255.255.255" || ip.endsWith(".255")) return;   // difusión: no sale del simulador
    this.#hostUdp(s)?.send(data, this.connectPort(ip, port), this.#target(ip));
  }

  // DHCP (RFC 2131/2132): OFFER a DISCOVER y ACK a REQUEST, con la IP del
  // PLC, máscara, puerta de enlace y DNS = .1.
  #dhcp(s, req) {
    if (req.length < 240 || req[0] !== 1 || req.readUInt32BE(236) !== 0x63825363) return;
    let type = 0;
    for (let i = 240; i < req.length && req[i] !== 255; ) {
      if (req[i] === 0) {
        i++;
        continue;
      }
      if (req[i] === 53) type = req[i + 2];
      i += 2 + req[i + 1];
    }
    const replyType = type === 1 ? 2 : type === 3 ? 5 : 0;
    if (!replyType) return;
    const rep = Buffer.alloc(300);
    rep[0] = 2;                       // BOOTREPLY
    rep[1] = req[1];
    rep[2] = req[2];
    req.copy(rep, 4, 4, 8);           // xid
    rep.writeUInt16BE(req.readUInt16BE(10), 10);   // flags
    rep.writeUInt32BE(ip2n(this.plcIp), 16);       // yiaddr
    rep.writeUInt32BE(ip2n(this.gateway), 20);     // siaddr
    req.copy(rep, 28, 28, 44);        // chaddr
    rep.writeUInt32BE(0x63825363, 236);
    const gw = ip2n(this.gateway);
    const opts = [
      [53, [replyType]],
      [54, [gw >>> 24, (gw >>> 16) & 255, (gw >>> 8) & 255, gw & 255]],
      [51, [(this.lease >>> 24) & 255, (this.lease >>> 16) & 255, (this.lease >>> 8) & 255, this.lease & 255]],
      [1, this.mask.split(".").map(Number)],
      [3, this.gateway.split(".").map(Number)],
      [6, this.gateway.split(".").map(Number)],
    ];
    let o = 240;
    for (const [code, val] of opts) {
      rep[o++] = code;
      rep[o++] = val.length;
      for (const b of val) rep[o++] = b;
    }
    rep[o++] = 255;
    this.#in({ op: "udp", s, ip: this.gateway, port: 67, hex: hex(rep.subarray(0, Math.max(o, 300))) });
  }

  // DNS (RFC 1035): una pregunta tipo A, resuelta con el DNS del host.
  #dns(s, q) {
    if (q.length < 17) return;
    let i = 12;
    const labels = [];
    while (i < q.length && q[i] !== 0) {
      labels.push(q.subarray(i + 1, i + 1 + q[i]).toString("latin1"));
      i += 1 + q[i];
    }
    const qEnd = i + 5;
    const name = labels.join(".");
    const reply = (addr) => {
      const head = Buffer.alloc(12);
      q.copy(head, 0, 0, 2);
      head.writeUInt16BE(addr ? 0x8180 : 0x8183, 2);
      head.writeUInt16BE(1, 4);
      head.writeUInt16BE(addr ? 1 : 0, 6);
      const parts = [head, q.subarray(12, qEnd)];
      if (addr) {
        const an = Buffer.alloc(16);
        an.writeUInt16BE(0xc00c, 0);
        an.writeUInt16BE(1, 2);
        an.writeUInt16BE(1, 4);
        an.writeUInt32BE(60, 6);
        an.writeUInt16BE(4, 10);
        an.writeUInt32BE(ip2n(addr), 12);
        parts.push(an);
      }
      this.#in({ op: "udp", s, ip: this.gateway, port: 53, hex: hex(Buffer.concat(parts)) });
    };
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return reply(name);
    dns.lookup(name, { family: 4 }, (err, addr) => reply(err ? null : addr));
  }
}

export { ip2n, n2ip };
