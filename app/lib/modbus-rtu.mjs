// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tramas Modbus RTU (especificación Modbus over Serial Line V1.02): CRC-16,
// pedidos FC03/FC06/FC16 y lectura de respuestas. Lo usan el gate
// JWSIM_G4_RS485_MULTINODE (como maestro externo) y el puente con el host.

export function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

export function withCrc(pdu) {
  const crc = crc16(pdu);
  return Buffer.from([...pdu, crc & 0xff, crc >> 8]);
}

export const readHolding = (slave, start, qty) => withCrc([slave, 0x03, start >> 8, start & 0xff, qty >> 8, qty & 0xff]);
export const writeSingle = (slave, addr, value) => withCrc([slave, 0x06, addr >> 8, addr & 0xff, (value >> 8) & 0xff, value & 0xff]);
export function writeMultiple(slave, start, values) {
  const pdu = [slave, 0x10, start >> 8, start & 0xff, values.length >> 8, values.length & 0xff, values.length * 2];
  for (const v of values) pdu.push((v >> 8) & 0xff, v & 0xff);
  return withCrc(pdu);
}

// Interpreta una respuesta (con CRC). Devuelve { slave, fn, ok, exception?,
// values?, addr?, value?, qty? } o null si el CRC no coincide o es corta.
export function parseResponse(frame) {
  const b = Buffer.from(frame);
  if (b.length < 5 || crc16(b.subarray(0, b.length - 2)) !== b.readUInt16LE(b.length - 2)) return null;
  const slave = b[0];
  const fn = b[1];
  if (fn & 0x80) return { slave, fn: fn & 0x7f, ok: false, exception: b[2] };
  if (fn === 0x03 || fn === 0x04) {
    const n = b[2];
    const values = [];
    for (let i = 0; i < n / 2; i++) values.push(b.readUInt16BE(3 + 2 * i));
    return { slave, fn, ok: true, values };
  }
  if (fn === 0x06) return { slave, fn, ok: true, addr: b.readUInt16BE(2), value: b.readUInt16BE(4) };
  if (fn === 0x10) return { slave, fn, ok: true, addr: b.readUInt16BE(2), qty: b.readUInt16BE(4) };
  return { slave, fn, ok: true };
}

// Separa un flujo de bytes con marcas de tiempo [{ t, byte }] en tramas por
// silencio (t3.5; 1,75 ms por encima de 19200 baudios).
export function splitFrames(stamped, baud) {
  const charNs = (11 * 1e9) / baud;
  const gap = baud > 19200 ? 1.75e6 : 3.5 * charNs;
  const frames = [];
  let cur = null;
  let last = -Infinity;
  for (const { t, byte } of stamped) {
    if (!cur || t - last > gap + charNs) {
      cur = { t, bytes: [] };
      frames.push(cur);
    }
    cur.bytes.push(byte);
    last = t;
  }
  return frames;
}
