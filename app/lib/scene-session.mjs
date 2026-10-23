// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Co-simulación interactiva placa ↔ escena en la app (G7). Mismo lazo de
// horizontes que cli/lib/cosim.mjs (ARCHITECTURE §6.6), pero dirigido por
// los mensajes del runner y con las acciones del usuario: un clic en un
// pulsador se aplica en el próximo horizonte (a lo sumo `stepNs` de tiempo
// virtual después), fechado en ese instante. Las entradas que la escena manda
// a la placa pasan por "set", así quedan en la grabación de la sesión (G3) y
// la reproducción da el mismo hash sin la escena.
import { EventEmitter } from "node:events";

import { watchedSignals } from "../../cli/lib/cosim.mjs";

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
  };
}

export class SceneSession extends EventEmitter {
  #queue = [];
  #timer = null;
  #started = false;

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
    this.onMessage = (m) => this.#onMessage(m);
    runner.on("message", this.onMessage);
  }

  /** Acción del usuario (se aplica en el próximo horizonte). */
  act(device, action, value) {
    this.#queue.push({ device, action, value });
  }

  rearm() {
    this.#queue.push({ rearm: true });
  }

  stop() {
    this.runner.off("message", this.onMessage);
    clearTimeout(this.#timer);
  }

  #send(changes, at) {
    for (const [signal, value] of Object.entries(changes)) this.runner.send({ type: "set", signal, value, at_ns: String(at) });
  }

  #next() {
    let h = this.scene.t + this.stepNs;
    const ne = this.scene.nextEvent();
    if (ne !== undefined && ne < h) h = ne;
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
        this.#send(this.scene.boardInputs(), t);
        this.scene.takeInputChanges();
        this.#next();
      } else {
        // Reinicio (esp_restart): el proceso nuevo recibe todas las entradas.
        this.#send(this.scene.boardInputs(), t);
      }
      this.#snapshot(true);
      return;
    }
    if (m.type !== "horizon") return;
    const at = BigInt(m.t_ns);
    if (m.reason === "output") this.scene.setSignals(Object.fromEntries(m.changes), at);
    else this.scene.advanceTo(at);
    const ops = this.#queue.splice(0);
    for (const op of ops) {
      try {
        if (op.rearm) this.scene.rearm(at);
        else this.scene.act(op.device, op.action, op.value, at);
      } catch (err) {
        this.emit("error", err);
      }
    }
    this.#send(this.scene.takeInputChanges(), at);
    this.#snapshot(ops.length > 0);
    this.#next();
  }
}
