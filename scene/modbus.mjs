// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Bus RS-485 de la escena (G9, emulación de planta): el PLC es maestro
// Modbus RTU y los dispositivos de la escena con modbus() son esclavos
// (transmisores de temperatura, pH...). La co-simulación (cli/lib/cosim.mjs,
// app/lib/scene-session.mjs) entrega a ModbusLink los caracteres que
// transmite la UART 2 del PLC con su [inicio, fin]; una trama termina tras
// 3,5 caracteres de silencio. La respuesta del esclavo vuelve como
// caracteres con su instante de llegada (mensaje uart_rx del runner).

/** CRC-16 Modbus (polinomio 0xA001, inicio 0xFFFF). */
export function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

/** Trama con su CRC agregado (para pruebas y herramientas). */
export function withCrc(bytes) {
  const c = crc16(bytes);
  return [...bytes, c & 0xff, c >> 8];
}

export class ModbusLink {
  /** @param {{ modbusRequest(frame: number[], o: { t: bigint, baud: number }): { bytes: number[], delayNs: bigint } | null }} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {{ s: bigint, e: bigint, b: number }[]} */
    this.rx = [];
    this.charNs = 0n;
    this.lastEnd = 0n;
    this.frames = 0;
    this.replies = 0;
  }

  /** Caracteres transmitidos por el PLC: [[inicio, fin, byte]...] (ns). */
  onTx(items) {
    for (const [s, e, b] of items) {
      const c = { s: BigInt(s), e: BigInt(e), b: Number(b) };
      // Silencio de 3,5 caracteres antes de este: cierra la trama anterior
      // aunque nadie haya llamado a poll (no debería pasar).
      if (this.rx.length && c.s > this.lastEnd + (this.charNs * 35n) / 10n) this.rx = [];
      this.rx.push(c);
      this.charNs = c.e - c.s;
      this.lastEnd = c.e;
    }
  }

  /** Instante en que la trama en curso se da por terminada (o undefined). */
  nextEvent() {
    return this.rx.length ? this.lastEnd + (this.charNs * 35n) / 10n : undefined;
  }

  /**
   * En t, si la trama terminó: la despacha y devuelve los caracteres de la
   * respuesta [[llegada_ns, byte]...] (vacío si nadie responde).
   * @param {bigint} t
   * @returns {[bigint, number][]}
   */
  poll(t) {
    const end = this.nextEvent();
    if (end === undefined || t < end) return [];
    const frame = this.rx.map((c) => c.b);
    const charNs = this.charNs;
    this.rx = [];
    this.frames++;
    // 8N1: 10 bits por carácter.
    const baud = Math.round(10e9 / Number(charNs));
    const r = this.scene.modbusRequest(frame, { t, baud });
    if (!r) return [];
    this.replies++;
    let at = t + r.delayNs;
    return r.bytes.map((b) => {
      at += charNs;
      return /** @type {[bigint, number]} */ ([at, b]);
    });
  }
}

/** Mensaje uart_rx del runner con los caracteres de la respuesta. */
export const uartRxMessage = (port, chars) => ({ type: "uart_rx", port, data: chars.map(([at, b]) => `${at}:${b.toString(16).padStart(2, "0")}`).join(",") });
