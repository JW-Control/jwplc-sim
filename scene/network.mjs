// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Red Ethernet de la escena (alpha.19): equipos de red simulados que hablan
// con el W5500 del JWPLC sin salir a la PC, así funcionan igual en la app y
// en el calificador de retos (cli/lib/cosim.mjs).
//
// El runner informa lo que envía el W5500 ({"type":"net", op, s, ...}, ver
// app/lib/net-bridge.mjs) y la red responde con {"type":"net_in", ...}.
// Equipos (def.net(params) en scene/devices/network.mjs):
//   servidor  E/S remotas Modbus TCP en su IP: el PLC es el cliente
//             (connect a esa IP y puerto); responde con su mapa Modbus
//             (los mismos modbusRead/Write... de los esclavos RS-485).
//   cliente   HMI/SCADA maestro Modbus TCP: se conecta al puerto del PLC
//             (toma un socket del PLC en LISTEN) y pregunta cada pollMs;
//             las escrituras salen de sus acciones (inst.netWrites()).
// Todos en la subred 192.168.250.0/24 de la red virtual (la misma del puente
// de la app): el PLC en .10 por DHCP (o su IP fija), la PC en .1.
// En la app el resto del tráfico (otras IP, DHCP, DNS) sigue al puente de la
// PC; en el calificador esta red también entrega el DHCP.
import { crc16 } from "./modbus.mjs";

const ip2n = (s) => s.split(".").reduce((a, b) => ((a << 8) | Number(b)) >>> 0, 0);
const hex = (bytes) => Buffer.from(bytes).toString("hex");

/**
 * Respuesta DHCP (OFFER a DISCOVER, ACK a REQUEST) con la IP del PLC.
 * @param {Buffer} req
 * @param {{ plcIp: string, gateway: string, mask?: string, lease?: number }} o
 * @returns {Buffer | null}
 */
export function dhcpReply(req, { plcIp, gateway, mask = "255.255.255.0", lease = 86400 }) {
  if (req.length < 240 || req[0] !== 1 || req.readUInt32BE(236) !== 0x63825363) return null;
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
  if (!replyType) return null;
  const rep = Buffer.alloc(300);
  rep[0] = 2;
  rep[1] = req[1];
  rep[2] = req[2];
  req.copy(rep, 4, 4, 8);
  rep.writeUInt16BE(req.readUInt16BE(10), 10);
  rep.writeUInt32BE(ip2n(plcIp), 16);
  rep.writeUInt32BE(ip2n(gateway), 20);
  req.copy(rep, 28, 28, 44);
  rep.writeUInt32BE(0x63825363, 236);
  const gw = gateway.split(".").map(Number);
  const opts = [[53, [replyType]], [54, gw], [51, [(lease >>> 24) & 255, (lease >>> 16) & 255, (lease >>> 8) & 255, lease & 255]], [1, mask.split(".").map(Number)], [3, gw], [6, gw]];
  let o = 240;
  for (const [code, val] of opts) {
    rep[o++] = /** @type {number} */ (code);
    rep[o++] = val.length;
    for (const b of val) rep[o++] = b;
  }
  rep[o] = 255;
  return rep;
}

/** Petición Modbus TCP: [MBAP(7)][PDU]. */
function mbap(tid, unit, pdu) {
  return [(tid >> 8) & 255, tid & 255, 0, 0, ((pdu.length + 1) >> 8) & 255, (pdu.length + 1) & 255, unit, ...pdu];
}

/** PDU de lectura o escritura del maestro. */
export function requestPdu(r) {
  const u16 = (v) => [(v >> 8) & 255, v & 255];
  switch (r.fn) {
    case 1: case 2: case 3: case 4: return [r.fn, ...u16(r.start), ...u16(r.count)];
    case 5: return [5, ...u16(r.start), ...(r.value ? [0xff, 0] : [0, 0])];
    case 6: return [6, ...u16(r.start), ...u16(r.value & 0xffff)];
    default: throw new Error(`función Modbus ${r.fn} no admitida por el maestro de la escena`);
  }
}

/** Valores de la respuesta a una lectura (bits o registros), o null si es excepción. */
export function parseResponse(r, pdu) {
  if (!pdu.length || pdu[0] & 0x80) return null;
  if (r.fn === 1 || r.fn === 2) return Array.from({ length: r.count }, (_, k) => (pdu[2 + (k >> 3)] >> (k & 7)) & 1);
  if (r.fn === 3 || r.fn === 4) return Array.from({ length: r.count }, (_, k) => (pdu[2 + 2 * k] << 8) | pdu[3 + 2 * k]);
  return [];
}

export class VirtualNet {
  /**
   * @param {import("./scene.mjs").Scene} scene
   * @param {{ send: (m: object) => void, subnet?: string, plcIp?: string, dhcp?: boolean }} o
   * dhcp: esta red entrega el DHCP (en el calificador; en la app lo hace el puente).
   */
  constructor(scene, { send, subnet = "192.168.250", plcIp, dhcp = false }) {
    this.scene = scene;
    this.send = send;
    this.gateway = `${subnet}.1`;
    this.plcIp = plcIp ?? `${subnet}.10`;
    this.dhcp = dhcp;
    /** @type {Map<number, Set<number>>} puerto → sockets del PLC en LISTEN */
    this.listens = new Map();
    /** @type {Map<number, { dev: any, role: "server" | "client", rx: number[] }>} socket del PLC → conexión */
    this.conns = new Map();
    /** @type {Map<string, { s: number | null, tid: number, pending: any, due: bigint, queue: any[], ok: number, errors: number }>} */
    this.clients = new Map();
    this.udp = new Set();
    this.t = 0n;
    this.frames = 0;
    this.dirty = false;
  }

  /** Equipos de red de la escena (conectados a la red). */
  devices() {
    return [...this.scene.devices.values()].filter((d) => d.net);
  }

  #in(m) {
    this.send({ type: "net_in", ...m });
  }

  /** ¿Este mensaje del W5500 es para la red de la escena? (en la app, el resto va al puente de la PC) */
  claims(m) {
    if (m.type !== "net") return false;
    switch (m.op) {
      case "listen": return this.devices().some((d) => d.net.role === "client" && d.net.port === m.port);
      case "connect": return this.devices().some((d) => d.net.role === "server" && d.net.ip === m.ip);
      case "send": case "close": return this.conns.has(m.s) || [...this.listens.values()].some((l) => l.has(m.s));
      case "udp_open": case "sendto": case "udp_close": return this.dhcp;
      default: return false;
    }
  }

  /** Mensaje del W5500 (ya reclamado). */
  onNet(m, t = this.scene.t) {
    if (t > this.t) this.t = t;
    this.active = true;
    const s = m.s;
    switch (m.op) {
      case "listen": {
        if (!this.listens.has(m.port)) this.listens.set(m.port, new Set());
        this.listens.get(m.port)?.add(s);
        return;
      }
      case "connect": {
        const dev = this.devices().find((d) => d.net.role === "server" && d.net.ip === m.ip);
        if (!dev || !this.#online(dev) || m.port !== dev.net.port) return this.#in({ op: "timeout", s });
        this.conns.set(s, { dev, role: "server", rx: [] });
        return this.#in({ op: "connected", s, ip: m.ip, port: m.port });
      }
      case "send": {
        const c = this.conns.get(s);
        if (!c) return;
        c.rx.push(...Buffer.from(m.hex, "hex"));
        return c.role === "server" ? this.#serve(s, c) : this.#answer(s, c);
      }
      case "close": {
        for (const l of this.listens.values()) l.delete(s);
        const c = this.conns.get(s);
        this.conns.delete(s);
        if (c?.role === "client") {
          const st = this.clients.get(c.dev.id);
          if (st) {
            st.s = null;
            st.pending = null;
          }
        }
        return;
      }
      case "udp_open": return void this.udp.add(s);
      case "udp_close": return void this.udp.delete(s);
      case "sendto": {
        if (m.port !== 67) return;
        const rep = dhcpReply(Buffer.from(m.hex, "hex"), { plcIp: this.plcIp, gateway: this.gateway });
        if (rep) this.#in({ op: "udp", s, ip: this.gateway, port: 67, hex: hex(rep) });
      }
    }
  }

  #online(dev) {
    const on = dev.inst.netOnline?.();
    return on === undefined ? true : !!on;
  }

  // ---------------------------------------------------------------- servidor
  // Tramas completas del PLC hacia unas E/S remotas: se responden con su mapa.
  #serve(s, c) {
    while (c.rx.length >= 8) {
      const len = (c.rx[4] << 8) | c.rx[5];
      if (c.rx.length < 6 + len) return;
      const frame = c.rx.splice(0, 6 + len);
      if (!this.#online(c.dev)) continue;
      const unit = frame[6];
      const pdu = frame.slice(7);
      // Se reusa el despacho Modbus de la escena con una trama RTU equivalente.
      const rtu = [unit, ...pdu];
      const crc = crc16(rtu);
      const r = this.scene.modbusRequest([...rtu, crc & 255, crc >> 8], { t: this.t, baud: 0, only: c.dev.id });
      this.frames++;
      if (!r) continue;
      const body = r.bytes.slice(1, -2);
      this.#in({ op: "data", s, hex: hex([frame[0], frame[1], 0, 0, ((body.length + 1) >> 8) & 255, (body.length + 1) & 255, unit, ...body]) });
    }
  }

  // ---------------------------------------------------------------- cliente
  // Respuesta del PLC al maestro de la escena (HMI).
  #answer(s, c) {
    const st = this.clients.get(c.dev.id);
    while (c.rx.length >= 8) {
      const len = (c.rx[4] << 8) | c.rx[5];
      if (c.rx.length < 6 + len) return;
      const frame = c.rx.splice(0, 6 + len);
      const tid = (frame[0] << 8) | frame[1];
      if (!st?.pending || st.pending.tid !== tid) continue;
      const r = st.pending.req;
      const values = parseResponse(r, frame.slice(7));
      st.pending = null;
      if (values === null) st.errors++;
      else st.ok++;
      c.dev.inst.netResult?.(r, values, this.t);
      this.dirty = true;
    }
    this.#refresh();
  }

  // Lo que llegó por la red cambia lo que muestran los equipos: se reevalúa la escena.
  #refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    this.scene.evaluate(this.t > this.scene.t ? this.t : this.scene.t);
  }

  /** Próximo instante en que la red tiene algo que hacer (para el calificador). */
  nextEvent() {
    // Con la red en uso, pasos cortos: lo que responde la red llega a la placa
    // a lo sumo 2 ms (virtuales) después de que la placa lo pidió (10 ms antes
    // de que arranque el Ethernet).
    let n = this.t + (this.active ? 2_000_000n : 10_000_000n);
    for (const [id, st] of this.clients) {
      // Con una pregunta en vuelo, se mira de nuevo pronto (llega la respuesta).
      const at = st.s === null ? undefined : st.pending ? this.t + 1_000_000n : st.due;
      if (at !== undefined && (n === undefined || at < n)) n = at;
      // Sin conexión y el PLC ya escucha en su puerto: conectar ya.
      const dev = this.scene.devices.get(id);
      if (st.s === null && dev && this.listens.get(dev.net.port)?.size) n = this.t;
    }
    return n;
  }

  /** Avance del tiempo: conexiones y preguntas de los maestros de la escena. */
  tick(t) {
    if (t > this.t) this.t = t;
    for (const dev of this.devices()) {
      if (dev.net.role !== "client") continue;
      let st = this.clients.get(dev.id);
      if (!st) {
        st = { s: null, tid: 0, pending: null, due: 0n, queue: [], ok: 0, errors: 0 };
        this.clients.set(dev.id, st);
      }
      const online = this.#online(dev);
      // Cable desconectado o equipo apagado: se cae la conexión.
      if (!online && st.s !== null) {
        this.#in({ op: "reset", s: st.s });
        this.conns.delete(st.s);
        st.s = null;
        st.pending = null;
      }
      if (dev.inst.netStatus?.({ connected: st.s !== null, ok: st.ok, errors: st.errors }, this.t)) this.dirty = true;
      if (!online) continue;
      if (st.s === null) {
        if (dev.net.target !== this.plcIp && dev.net.target !== undefined) continue;
        const l = this.listens.get(dev.net.port);
        const s = l && [...l].sort((a, b) => a - b)[0];
        if (s === undefined) continue;
        l.delete(s);
        st.s = s;
        st.due = this.t;
        this.conns.set(s, { dev, role: "client", rx: [] });
        this.#in({ op: "connected", s, ip: dev.net.ip, port: 49152 + (this.clients.size % 1000) });
        continue;
      }
      // Pregunta pendiente sin respuesta por más de 1 s: se descarta.
      if (st.pending && this.t - st.pending.at > 1_000_000_000n) {
        st.pending = null;
        st.errors++;
      }
      if (st.pending || this.t < st.due) continue;
      // Primero las escrituras de los mandos; si no, la siguiente lectura.
      st.queue.push(...(dev.inst.netWrites?.() ?? []));
      let req = st.queue.shift();
      if (!req) {
        const reads = dev.net.reads ?? [];
        if (!reads.length) continue;
        st.readIdx = ((st.readIdx ?? -1) + 1) % reads.length;
        req = reads[st.readIdx];
        if (st.readIdx === reads.length - 1) st.due = this.t + BigInt(Math.round((dev.net.pollMs ?? 200) * 1e6));
      }
      st.tid = (st.tid + 1) & 0xffff;
      st.pending = { tid: st.tid, req, at: this.t };
      this.#in({ op: "data", s: st.s, hex: hex(mbap(st.tid, dev.net.unit ?? 1, requestPdu(req))) });
    }
    this.#refresh();
  }
}
