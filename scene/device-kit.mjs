// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Utilidades para escribir dispositivos de escena (también para el SDK):
// retardos de conmutación y rampas lineales en tiempo virtual (ns, bigint).

export const MS = 1_000_000n;

/** Milisegundos (número, admite decimales) → ns como bigint. */
export function ms(v) {
  return BigInt(Math.round(Number(v) * 1e6));
}

/**
 * Retardo de conmutación (atraque y caída de un relé, tiempo de respuesta de
 * un sensor). `step` es idempotente para el mismo instante y objetivo: la
 * escena lo llama varias veces mientras busca el punto fijo.
 */
export class Delay {
  /** @param {bigint} onNs @param {bigint} offNs @param {boolean} [initial] */
  constructor(onNs, offNs, initial = false) {
    this.onNs = onNs;
    this.offNs = offNs;
    this.value = initial;
    this.target = initial;
    /** @type {bigint | null} */
    this.at = null;
  }
  /** @param {bigint} t @param {boolean} target */
  step(t, target) {
    if (target !== this.target) {
      this.target = target;
      this.at = target === this.value ? null : t + (target ? this.onNs : this.offNs);
    }
    if (this.at !== null && t >= this.at) {
      this.value = this.target;
      this.at = null;
    }
    return this.value;
  }
  /** Próximo cambio pendiente (o undefined). */
  get next() {
    return this.at ?? undefined;
  }
}

/**
 * Magnitud que varía linealmente hacia un objetivo (carrera de un cilindro,
 * velocidad de un motor). Se publica como segmento `{ value, rate }` (rate
 * en unidades por segundo) para que la escena calcule cuándo cruza el rango
 * de un sensor sin muestrear.
 */
export class Ramp {
  /** @param {number} initial */
  constructor(initial = 0) {
    this.v0 = initial;
    this.t0 = 0n;
    this.goal = initial;
    this.rate = 0; // unidades/s, con signo
    /** @type {bigint | null} */
    this.tEnd = null;
  }
  /** Valor en t. */
  at(t) {
    if (this.tEnd !== null && t >= this.tEnd) return this.goal;
    return this.v0 + (this.rate * Number(t - this.t0)) / 1e9;
  }
  /**
   * Fija el objetivo en t con una velocidad (unidades/s, > 0).
   * @param {bigint} t @param {number} goal @param {number} speed
   */
  step(t, goal, speed) {
    if (this.tEnd !== null && t >= this.tEnd) {
      // Llegó: queda quieta en el objetivo.
      this.v0 = this.goal;
      this.t0 = this.tEnd;
      this.rate = 0;
      this.tEnd = null;
    }
    const v = this.at(t);
    if (goal === this.goal && (this.tEnd !== null || v === goal)) return;
    this.v0 = v;
    this.t0 = t;
    this.goal = goal;
    if (v === goal || !(speed > 0)) {
      this.v0 = goal;
      this.rate = 0;
      this.tEnd = null;
      return;
    }
    this.rate = Math.sign(goal - v) * speed;
    this.tEnd = t + BigInt(Math.ceil((Math.abs(goal - v) / speed) * 1e9));
  }
  /** Segmento publicado en t: valor y pendiente (0 al llegar). */
  segment(t) {
    const moving = this.tEnd !== null && t < this.tEnd;
    return { value: this.at(t), rate: moving ? this.rate : 0 };
  }
  get next() {
    return this.tEnd ?? undefined;
  }
}

/** Mínimo de horizontes (undefined = ninguno). */
export function earliest(...ts) {
  let m;
  for (const t of ts) if (t !== undefined && t !== null && (m === undefined || t < m)) m = t;
  return m;
}
