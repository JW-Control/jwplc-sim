// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Física de cajas sobre una cinta (planta 3D, etapa 1 de
// docs/integration/PROPUESTA_PLANTA3D.md). Basada en el diseño de Open
// Industry Project (MIT, © Automation Standard LLC and Contributors): la
// cinta es una superficie con velocidad, la caja la sigue por fricción de
// Coulomb (acelera a lo sumo μ·g hacia la velocidad de la superficie) y el
// accionamiento tiene rampas de arranque y frenado como un variador. El
// código es propio; las pruebas contrastan con las mismas fórmulas cerradas
// que valida OIP (scene/tests/conveyor-physics.test.mjs).
//
// Modelo en 1D a lo largo de la cinta, a paso fijo (determinista):
//   1. la superficie se acerca a la velocidad pedida con la rampa;
//   2. cada caja corrige su velocidad hacia la de la superficie, como mucho
//      μ·g·h por paso (si la diferencia es menor, se pega: fricción
//      estática);
//   3. avanza con la velocidad media del paso (exacto con aceleración
//      constante);
//   4. choques: una caja no atraviesa a la de adelante ni el tope; choque
//      inelástico (sin rebote, como las cajas de OIP) que conserva el
//      momento;
//   5. la caja cae cuando su centro de masa pasa el extremo de la cinta.

export const G = 9.81;

/**
 * @typedef {{ x: number, v: number, len: number, mass: number, mu: number }} Box
 * @typedef {{
 *   length: number,       // largo de la cinta (m)
 *   vNominal: number,     // velocidad con la orden a 1 (m/s)
 *   accelTime?: number,   // s de 0 a vNominal (0 = instantáneo)
 *   decelTime?: number,   // s de vNominal a 0 (0 = instantáneo)
 *   stop?: number,        // tope a esa distancia del inicio (m; 0 = sin tope)
 *   hz?: number,          // pasos por segundo (60 por defecto, como OIP)
 * }} LineConfig
 */

export class CargoLine {
  /** @param {LineConfig} cfg */
  constructor(cfg) {
    this.L = Math.max(0.1, cfg.length);
    this.vNom = Math.abs(cfg.vNominal);
    this.accelTime = Math.max(0, cfg.accelTime ?? 0);
    this.decelTime = Math.max(0, cfg.decelTime ?? 0);
    this.stop = cfg.stop && cfg.stop > 0 && cfg.stop < this.L ? cfg.stop : 0;
    this.hz = Math.max(1, Math.round(cfg.hz ?? 60));
    this.h = 1 / this.hz;
    /** velocidad de la superficie (m/s) */
    this.vBelt = 0;
    /** velocidad pedida (m/s) */
    this.vCmd = 0;
    /** @type {Box[]} ordenadas de atrás (x menor) hacia adelante */
    this.boxes = [];
    /** cajas que cayeron por el final / por el inicio */
    this.dischargedEnd = 0;
    this.dischargedStart = 0;
  }

  /** Orden de -1 a 1 (la velocidad del motor o del variador). */
  command(speed) {
    this.vCmd = Math.max(-1, Math.min(1, Number(speed) || 0)) * this.vNom;
  }

  /**
   * Pone una caja quieta con su centro en x (m). Devuelve false si se
   * encima con otra.
   * @param {Partial<Box> & { x: number }} b
   */
  add(b) {
    const box = { x: b.x, v: b.v ?? 0, len: Math.max(0.01, b.len ?? 0.2), mass: Math.max(0.01, b.mass ?? 1), mu: Math.max(0, b.mu ?? 0.5) };
    if (this.boxes.some((o) => Math.abs(o.x - box.x) < (o.len + box.len) / 2 - 1e-9)) return false;
    this.boxes.push(box);
    this.boxes.sort((a, c) => a.x - c.x);
    return true;
  }

  /** ¿Hay algo que cambie en el próximo paso? (si no, se puede dejar de pasar) */
  get moving() {
    return this.vBelt !== this.vCmd || this.vBelt !== 0 || this.boxes.some((b) => b.v !== 0);
  }

  /** ¿Alguna caja tapa el punto s (m desde el inicio)? Haz que cruza la cinta. */
  covers(s) {
    return this.boxes.some((b) => Math.abs(b.x - s) <= b.len / 2 + 1e-9);
  }

  /** Un paso de h segundos. */
  step() {
    const h = this.h;
    // 1. Rampa del accionamiento (la tasa se mide sobre la velocidad nominal).
    const speedingUp = Math.abs(this.vCmd) > Math.abs(this.vBelt) && this.vCmd * this.vBelt >= 0;
    const rampTime = speedingUp ? this.accelTime : this.decelTime;
    // Invertir el sentido: primero frena hasta 0.
    const target = this.vCmd * this.vBelt < 0 ? 0 : this.vCmd;
    if (rampTime > 0 && this.vNom > 0) {
      const dv = (this.vNom / rampTime) * h;
      this.vBelt = Math.abs(target - this.vBelt) <= dv ? target : this.vBelt + Math.sign(target - this.vBelt) * dv;
    } else {
      this.vBelt = target;
    }
    if (Math.abs(this.vBelt) < 1e-12) this.vBelt = 0;

    // 2-3. Fricción de Coulomb contra la superficie y avance.
    for (const b of this.boxes) {
      const v0 = b.v;
      const maxDv = b.mu * G * h;
      const dv = this.vBelt - b.v;
      b.v = Math.abs(dv) <= maxDv ? this.vBelt : b.v + Math.sign(dv) * maxDv;
      if (Math.abs(b.v) < 1e-12) b.v = 0;
      b.x += ((v0 + b.v) / 2) * h;
    }

    // 4. Choques: el tope y luego de adelante hacia atrás (y al revés, por
    //    si la cinta va hacia el inicio). Inelástico, conserva el momento.
    this.boxes.sort((a, c) => a.x - c.x);
    this.#collide();

    // 5. Caen las que pasan el extremo con su centro de masa.
    const before = this.boxes.length;
    this.boxes = this.boxes.filter((b) => b.x <= this.L);
    this.dischargedEnd += before - this.boxes.length;
    const mid = this.boxes.length;
    this.boxes = this.boxes.filter((b) => b.x >= 0);
    this.dischargedStart += mid - this.boxes.length;
  }

  // Choques en la fila (ordenada de atrás hacia adelante). Una caja contra
  // el tope queda «trabada»; la que la toca por detrás, también (la fila
  // acumulada no se mueve hacia adelante). Entre cajas libres el choque es
  // inelástico y conserva el momento. Se repite hasta que no quede ninguna
  // encimada (cada pasada resuelve al menos un eslabón).
  #collide() {
    const n = this.boxes.length;
    if (!n) return;
    const EPS = 1e-9;
    /** @type {boolean[]} */
    const pinned = new Array(n).fill(false);
    if (this.stop) {
      const k = this.boxes.findLastIndex((b) => b.x - b.len / 2 < this.stop);
      const b = this.boxes[k];
      if (b && b.x + b.len / 2 >= this.stop - EPS) {
        b.x = this.stop - b.len / 2;
        if (b.v > 0) b.v = 0;
        pinned[k] = true;
      }
    }
    for (let pass = 0; pass <= n; pass++) {
      let clean = true;
      for (let i = n - 2; i >= 0; i--) {
        const rear = this.boxes[i];
        const front = this.boxes[i + 1];
        const overlap = rear.x + rear.len / 2 - (front.x - front.len / 2);
        if (pinned[i + 1] && overlap >= -EPS) {
          // Contra la fila trabada: solo retrocede la de atrás.
          rear.x -= Math.max(0, overlap);
          if (rear.v > front.v) rear.v = front.v;
          pinned[i] = true;
          continue;
        }
        if (overlap <= EPS) continue;
        clean = false;
        const m = rear.mass + front.mass;
        rear.x -= overlap * (front.mass / m);
        front.x += overlap * (rear.mass / m);
        if (rear.v > front.v) rear.v = front.v = (rear.mass * rear.v + front.mass * front.v) / m;
      }
      if (clean) break;
    }
  }
}
