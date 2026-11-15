// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Enlaces de la escena con un puerto COM de la PC (scene/devices/comms.mjs):
// el conversor USB a RS-485 cableado a RS485_A/B y el cable USB al puerto
// USB-C de la placa. Cada enlace es un ComBridge (app/lib/com-bridge.mjs) con
// un filtro que hace lo que el equipo real haría con los bytes:
//
//   eco             la PC recibe de vuelta lo que transmite, al instante (el
//                   receptor del MAX485 sigue encendido mientras transmite);
//                   no depende del cableado del bus
//   invertido       A/B invertidos en el conversor o cables cruzados (si
//                   ambas cosas, se anulan): cada byte llega con sus bits
//                   invertidos en los dos sentidos, como la basura que da la
//                   polaridad al revés (el CRC Modbus no cierra)
//   errorRate       bus sin terminación: cada byte, en los dos sentidos,
//                   llega con un bit cambiado con esa probabilidad
//                   (pseudoaleatoria con semilla: repetible)
//   wiring "open"   falta un cable o está cortado: no pasa nada entre la PC
//                   y la placa (el eco sí, es del propio conversor)
import { ComBridge } from "./com-bridge.mjs";

export class LinkFilter {
  /** @param {{ echo?: boolean, inverted?: boolean, errorRate?: number, wiring?: string, seed?: number }} o */
  constructor({ echo = false, inverted = false, errorRate = 0, wiring = "ok", seed = 1 } = {}) {
    this.echo = echo;
    this.inverted = inverted;
    this.errorRate = errorRate;
    this.wiring = wiring;
    this.s = seed >>> 0 || 1;
    this.corrupted = 0;
  }

  // xorshift32: la misma secuencia de errores en cada corrida.
  #rand() {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 0x100000000;
  }

  #line(buf) {
    const inv = this.inverted !== (this.wiring === "crossed");
    const out = Buffer.from(buf);
    for (let i = 0; i < out.length; i++) {
      if (inv) out[i] = ~out[i] & 0xff;
      if (this.errorRate > 0 && this.#rand() < this.errorRate) {
        out[i] ^= 1 << Math.floor(this.#rand() * 8);
        this.corrupted++;
      }
    }
    return out;
  }

  /** Bytes que transmite la PC: lo que llega a la placa y lo que vuelve a la PC (eco). */
  fromHost(buf) {
    return { toPlc: this.wiring === "open" ? null : this.#line(buf), toHost: this.echo ? Buffer.from(buf) : null };
  }

  /** Bytes que transmite la placa: lo que llega a la PC. */
  fromPlc(buf) {
    return this.wiring === "open" ? null : this.#line(buf);
  }
}

/** Texto para la consola de la app con el estado de un enlace. */
export function describeLink(p) {
  const what = p.uart === 2 ? "RS-485" : "USB";
  const faults = [p.echo && "con eco", p.inverted && "A/B invertidos", p.errorRate > 0 && `sin terminación (${Math.round(p.errorRate * 100)} % de bytes con error)`].filter(Boolean);
  const wiring =
    p.wiring === "open" ? " · sin cablear a la placa: no pasa nada" : p.wiring !== "crossed" ? "" : p.inverted ? " · cables cruzados: se anula con A/B invertidos" : " · cables cruzados: llega basura";
  return `${p.device}: ${p.com} ↔ ${what} del JWPLC${faults.length ? ` · ${faults.join(", ")}` : ""}${wiring}`;
}

/** ComBridge de un dispositivo de la escena. */
export class HostLink extends ComBridge {
  /** @param {{ device: string, uart: number, com: string, echo?: boolean, inverted?: boolean, errorRate?: number, wiring?: string }} p */
  constructor(p) {
    const filter = new LinkFilter(p);
    super({ path: p.com, uart: p.uart, filter });
    this.device = p.device;
    this.spec = p;
  }

  /** Cableado o fallas nuevas (un cable cortado en marcha). */
  update(p) {
    this.spec = p;
    Object.assign(this.filter, { echo: !!p.echo, inverted: !!p.inverted, errorRate: p.errorRate ?? 0, wiring: p.wiring });
  }
}
