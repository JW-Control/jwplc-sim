// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Co-simulación interactiva placa ↔ escena en la app (G7). Mismo lazo de
// horizontes que cli/lib/cosim.mjs (ARCHITECTURE §6.6), pero dirigido por
// los mensajes del runner y con las acciones del usuario: un clic en un
// pulsador se aplica en el próximo horizonte, fechado en ese instante. Los
// horizontes miden `stepNs` de tiempo virtual a ×1 y se alargan con la
// velocidad (cada uno es una ida y vuelta con el runner, que en la app cuesta
// milisegundos de pared); una acción del usuario corta el horizonte en curso
// ("yield") para aplicarse enseguida. Las entradas que la escena manda
// a la placa pasan por "set", así quedan en la grabación de la sesión (G3) y
// la reproducción da el mismo hash sin la escena.
import { EventEmitter } from "node:events";

import { watchedSignals } from "../../cli/lib/cosim.mjs";
import { ModbusLink, uartRxMessage } from "../../scene/modbus.mjs";

/** Instantánea de la escena para la interfaz (sin bigint). */
export function wireSnapshot(snap) {
  const ms = (t) => Number(t) / 1e6;
  return {
    t_ms: ms(snap.t),
    devices: snap.devices,
    poles: snap.poles,
    inputs: snap.inputs,
    warnings: snap.warnings,
    findings: snap.findings,
    faults: snap.faults.map((f) => ({ t_ms: ms(f.t), type: f.type, device: f.device, message: f.message })),
    injected: snap.injected ?? [],
  };
}

export class SceneSession extends EventEmitter {
  #queue = [];
  #timer = null;
  #started = false;
  #speed = 1;
  #running = false;   // horizonte pedido y sin respuesta del runner
  #yielded = false;

  /**
   * @param {import("./sim-port.mjs").RunnerProcess} runner
   * @param {import("../../scene/scene.mjs").Scene} scene
   */
  constructor(runner, scene, { stepNs = 10_000_000n, snapshotMs = 40 } = {}) {
    super();
    this.runner = runner;
    this.scene = scene;
    this.stepNs = stepNs;
    this.snapshotMs = snapshotMs;
    this.watch = watchedSignals(scene);
    // Esclavos Modbus de la escena en el bus RS-485 (G9, emulación de planta).
    this.link = scene.hasModbus() ? new ModbusLink(scene) : null;
    this.onMessage = (m) => this.#onMessage(m);
    runner.on("message", this.onMessage);
  }

  /** Velocidad pedida al runner (0 = la máxima): fija el largo de los horizontes. */
  setSpeed(speed) {
    this.#speed = Number(speed) >= 0 ? Number(speed) : 1;
  }

  /** Largo del horizonte: `stepNs` a ×1 o menos, proporcional por encima y 1 s virtual a la máxima. */
  spanNs() {
    const k = this.#speed > 0 ? Math.max(1, this.#speed) : 100;
    return this.stepNs * BigInt(Math.round(k));
  }

  /** Acción del usuario (se aplica en el próximo horizonte). */
  act(device, action, value) {
    this.#enqueue({ device, action, value });
  }

  rearm() {
    this.#enqueue({ rearm: true });
  }

  /** Falla inyectada (G9): stuck, welded, burnt u open (ver Scene.inject). */
  inject(fault) {
    this.#enqueue({ inject: fault });
  }

  clearFault(key) {
    this.#enqueue({ clear: key });
  }

  #enqueue(op) {
    this.#queue.push(op);
    // Con horizontes largos, el runner corta el actual en el instante en que
    // recibe el pedido; a ×1 el próximo horizonte llega en ≤ stepNs.
    if (this.#running && !this.#yielded && this.spanNs() > this.stepNs) {
      this.#yielded = true;
      this.runner.send({ type: "yield" });
    }
  }

  stop() {
    this.runner.off("message", this.onMessage);
    clearTimeout(this.#timer);
  }

  #send(changes, at) {
    for (const [signal, value] of Object.entries(changes)) this.runner.send({ type: "set", signal, value, at_ns: String(at) });
  }

  #next() {
    let h = this.scene.t + this.spanNs();
    const ne = this.scene.nextEvent();
    if (ne !== undefined && ne < h) h = ne;
    const le = this.link?.nextEvent();
    if (le !== undefined && le > this.scene.t && le < h) h = le;
    this.#running = true;
    this.#yielded = false;
    this.runner.send({ type: "horizon", until_ns: String(h) });
  }

  #snapshot(now = false) {
    if (now) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.emit("snapshot", wireSnapshot(this.scene.snapshot()));
      return;
    }
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.emit("snapshot", wireSnapshot(this.scene.snapshot()));
    }, this.snapshotMs);
  }

  #onMessage(m) {
    if (m.type === "hello") {
      const t = BigInt(m.t_ns);
      const levels = Object.fromEntries((m.signals ?? []).filter(([n]) => this.watch.includes(n)));
      this.scene.setSignals(levels, t);
      if (!this.#started) {
        this.#started = true;
        this.runner.send({ type: "scene", on: 1, watch: this.watch.join(",") });
        if (this.link) this.runner.send({ type: "rs485", port: 2, on: 1 });
        this.#send(this.scene.boardInputs(), t);
        this.scene.takeInputChanges();
        this.#next();
      } else {
        // Reinicio (esp_restart): el proceso nuevo recibe todas las entradas.
        if (this.link) this.runner.send({ type: "rs485", port: 2, on: 1 });
        this.#send(this.scene.boardInputs(), t);
      }
      this.#snapshot(true);
      return;
    }
    if (m.type === "uart_tx") {
      this.link?.onTx(m.bytes);
      return;
    }
    if (m.type !== "horizon") return;
    this.#running = false;
    const at = BigInt(m.t_ns);
    if (m.reason === "output") this.scene.setSignals(Object.fromEntries(m.changes), at);
    else this.scene.advanceTo(at);
    const ops = this.#queue.splice(0);
    for (const op of ops) {
      try {
        if (op.rearm) this.scene.rearm(at);
        else if (op.inject) this.scene.inject(op.inject, at);
        else if (op.clear) this.scene.clearFault(op.clear, at);
        else this.scene.act(op.device, op.action, op.value, at);
      } catch (err) {
        this.emit("error", err);
      }
    }
    this.#send(this.scene.takeInputChanges(), at);
    const reply = this.link?.poll(at) ?? [];
    if (reply.length) this.runner.send(uartRxMessage(2, reply));
    this.#snapshot(ops.length > 0);
    this.#next();
  }
}
