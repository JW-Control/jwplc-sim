// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Co-simulación placa ↔ escena por horizontes (ARCHITECTURE §6.6).
//
//   1. La escena declara su próximo evento propio h (retardo de un relé,
//      fin de carrera de un cilindro) o el de la próxima acción programada.
//   2. El runner corre hasta h; si antes cambia una salida que la escena
//      vigila (Q0_x), se detiene en ese instante T y la informa.
//   3. La escena evalúa en T (o en h) y responde con las entradas que
//      cambiaron (I0_x), fechadas en T; luego el siguiente horizonte.
//
// Nada depende del reloj de pared: con la misma escena, el mismo firmware y
// las mismas acciones, la corrida es idéntica (mismo hash de traza).
import { RunnerProcess } from "../../app/lib/sim-port.mjs";
import { ModbusLink, uartRxMessage } from "../../scene/modbus.mjs";
import { Scene } from "../../scene/scene.mjs";

/** Señales de la placa que la escena lee (salidas del firmware). */
export function watchedSignals(scene) {
  const out = new Set();
  for (const dev of scene.devices.values()) for (const s of dev.def.signals?.in ?? []) out.add(s);
  return [...out];
}

/**
 * Corre el ejecutable de un sketch con una escena.
 * @param {{
 *   exe: string, args?: string[], launcher?: string,
 *   scene: import("../../scene/scene.mjs").SceneSpec, registry?: any,
 *   actions?: { at_ns: bigint, device?: string, action?: string, value?: unknown, inject?: any, clear?: any }[],
 *   untilNs: bigint, speed?: number,
 *   maxStepNs?: bigint, probes?: bigint[],
 *   onSerial?: (port: number, text: string, t_ns: number) => void,
 *   onStderr?: (text: string) => void,
 * }} o
 */
export async function cosim(o) {
  const scene = o.scene instanceof Scene ? o.scene : new Scene(o.scene, { registry: o.registry });
  const actions = [...(o.actions ?? [])].sort((a, b) => (a.at_ns < b.at_ns ? -1 : a.at_ns > b.at_ns ? 1 : 0));
  const proc = new RunnerProcess();
  const watch = watchedSignals(scene);
  const stats = { horizons: 0, outputStops: 0, inputsSent: 0 };
  // Entradas enviadas a la placa (DI) con su instante, y estado de la escena
  // en los instantes pedidos (pruebas).
  /** @type {{ t: bigint, name: string, v: number }[]} */
  const inputs = [];
  /** @type {Map<bigint, any>} */
  const snapshots = new Map();
  const probes = [...new Set(o.probes ?? [])].sort((a, b) => (a < b ? -1 : 1));
  let pi = 0;
  /** @type {any[]} */
  const inbox = [];
  /** @type {((m: any) => void) | null} */
  let waiter = null;
  let exit = null;
  let fatal = null;
  let hello = 0;

  const deliver = (m) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(m);
    } else inbox.push(m);
  };
  const next = () => (inbox.length ? Promise.resolve(inbox.shift()) : new Promise((r) => (waiter = r)));

  const sendInputs = (changes, at) => {
    for (const [signal, value] of Object.entries(changes)) {
      proc.send({ type: "set", signal, value, at_ns: String(at) });
      inputs.push({ t: at, name: signal, v: value ? 1 : 0 });
      stats.inputsSent++;
    }
  };

  // Esclavos Modbus de la escena en el bus RS-485 (UART 2 del PLC).
  const link = scene.hasModbus() ? new ModbusLink(scene) : null;
  proc.on("message", (m) => {
    if (m.type === "uart_tx") link?.onTx(m.bytes);
    else if (m.type === "serial") o.onSerial?.(m.port, m.text, m.t_ns);
    else if (m.type === "fatal") fatal = m;
    else if (m.type === "hello") {
      // Arranque (o reinicio por esp_restart): salidas actuales y todas las
      // entradas que maneja la escena.
      const t = BigInt(m.t_ns);
      const levels = Object.fromEntries((m.signals ?? []).filter(([n]) => watch.includes(n)).map(([n, v]) => [n, v]));
      if (hello++ === 0) deliver({ type: "hello", t, levels });
      else {
        scene.setSignals(levels, t > scene.t ? t : scene.t);
        sendInputs(scene.boardInputs(), t);
      }
    } else if (m.type === "horizon" || m.type === "hash") deliver(m);
  });
  proc.on("stderr", (d) => o.onStderr?.(d));
  proc.on("exit", (e) => {
    exit = e;
    deliver({ type: "exit", ...e });
  });
  proc.start(o.exe, o.args ?? [], { launcher: o.launcher });

  const first = await next();
  if (first.type !== "hello") throw new Error(`el runner terminó antes de arrancar (código ${first.code})`);
  scene.setSignals(first.levels, first.t);
  proc.send({ type: "scene", on: 1, watch: watch.join(",") });
  if (link) proc.send({ type: "rs485", port: 2, on: 1 });
  sendInputs(scene.takeInputChanges(), first.t);
  proc.send({ type: "run", speed: o.speed ?? 0 });

  let ai = 0;
  let t = first.t;
  for (;;) {
    // Acciones programadas que vencen en t.
    while (ai < actions.length && actions[ai].at_ns <= t) {
      const a = actions[ai++];
      if (a.inject) scene.inject(a.inject, t);
      else if (a.clear) scene.clearFault(a.clear, t);
      else scene.act(a.device, a.action, a.value, t);
    }
    sendInputs(scene.takeInputChanges(), t);
    const reply = link?.poll(t) ?? [];
    if (reply.length) proc.send(uartRxMessage(2, reply));
    while (pi < probes.length && probes[pi] <= t) snapshots.set(probes[pi++], scene.snapshot());
    if (t >= o.untilNs) break;
    let h = o.untilNs;
    const ne = scene.nextEvent();
    if (ne !== undefined && ne < h) h = ne;
    if (ai < actions.length && actions[ai].at_ns < h) h = actions[ai].at_ns;
    const le = link?.nextEvent();
    if (le !== undefined && le > t && le < h) h = le;
    if (pi < probes.length && probes[pi] < h) h = probes[pi];
    if (o.maxStepNs && t + o.maxStepNs < h) h = t + o.maxStepNs;
    proc.send({ type: "horizon", until_ns: String(h) });
    const m = await next();
    if (m.type === "exit") break;
    stats.horizons++;
    const at = BigInt(m.t_ns);
    if (m.reason === "output") {
      stats.outputStops++;
      scene.setSignals(Object.fromEntries(m.changes), at);
    } else {
      scene.advanceTo(at);
    }
    t = at;
  }

  let hash = null;
  if (!exit) {
    proc.send({ type: "hash" });
    for (let m = await next(); ; m = await next()) {
      if (m.type === "hash") {
        hash = m.trace_hash;
        break;
      }
      if (m.type === "exit") break;
    }
    proc.stop();
  }
  return { scene, t_ns: t, hash, exit, fatal, stats, inputs, snapshots };
}
