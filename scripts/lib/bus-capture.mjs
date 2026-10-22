// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Captura de buses de un runner por el protocolo (como la pestaña Buses de
// la app): corre a máxima velocidad hasta `untilMs` virtuales con el monitor
// de buses activo y devuelve los ítems crudos en orden.
import { RunnerProcess } from "../../app/lib/sim-port.mjs";

export async function captureBuses(exe, untilMs, { stim } = {}) {
  const r = new RunnerProcess();
  const items = [];
  let dropped = 0;
  let reached = null;
  let stderr = "";
  r.on("message", (m) => {
    if (m.type === "bus") {
      items.push(...m.items);
      dropped += m.dropped;
    }
    if (m.type === "reached") reached = m;
  });
  r.on("stderr", (t) => (stderr += t));
  const exited = new Promise((res) => r.on("exit", res));
  r.start(exe, stim ? ["--stim", stim] : []);
  // Sin pérdidas: la captura de referencia debe estar completa aunque un
  // tramo tenga más ítems que lo que la interfaz muestra por envío.
  r.send({ type: "subscribe", buses: 1, lossless: 1 });
  r.send({ type: "run", speed: 0, until_ns: Math.round(untilMs * 1e6) });
  for (let i = 0; i < 1200 && !reached; i++) await new Promise((res) => setTimeout(res, 50));
  // El último envío llega con "reached" (flush forzado antes de responder).
  r.send({ type: "quit" });
  await exited;
  if (!reached) throw new Error(`el runner no llegó a ${untilMs} ms: ${stderr.slice(-500)}`);
  items.sort((a, b) => a[0] - b[0]);
  return { items, dropped, stderr, hash: reached.trace_hash };
}
