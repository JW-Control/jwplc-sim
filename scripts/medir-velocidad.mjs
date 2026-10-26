#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Mide la velocidad de la simulación interactiva (protocolo de la app):
// tiempo virtual avanzado / tiempo de pared, con y sin escena.
//   node scripts/medir-velocidad.mjs <ejecutable> [--scene archivo] [--speed 1] [--segundos 10] [--latencia ms]
// --latencia emula la ida y vuelta escena ↔ runner de la app en un host más
// lento: retrasa cada respuesta "horizon" de la escena.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { SceneSession } from "../app/lib/scene-session.mjs";
import { Scene } from "../scene/scene.mjs";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Devuelve { virtual_ms, pared_ms, relacion, horizontes_por_s }. */
export async function medirVelocidad({ exe, scene = null, speed = 1, seconds = 10, latency = 0 }) {
  const r = new RunnerProcess();
  let session = null;
  let tNs = 0n;
  let horizons = 0;
  r.on("message", (m) => {
    if (m.t_ns !== undefined && BigInt(m.t_ns) > tNs) tNs = BigInt(m.t_ns);
    if (m.type === "horizon") horizons++;
  });
  r.on("stderr", (t) => process.stderr.write(t));
  if (latency > 0) {
    const send = r.send.bind(r);
    r.send = (m) => (m.type === "horizon" ? setTimeout(() => send(m), latency) : send(m));
  }
  if (scene) session = new SceneSession(r, new Scene(scene));
  r.start(exe, ["--no-eth"]);
  session?.setSpeed(speed);
  r.send({ type: "run", speed });
  // Se mide ya corriendo, sin el arranque.
  await sleep(1000);
  const t0 = tNs, w0 = performance.now(), h0 = horizons;
  await sleep(seconds * 1000);
  const t1 = tNs, w1 = performance.now();
  r.send({ type: "quit" });
  session?.stop();
  await sleep(300);
  const virt = Number(t1 - t0) / 1e6, wall = w1 - w0;
  return {
    virtual_ms: Math.round(virt),
    pared_ms: Math.round(wall),
    relacion: +(virt / wall).toFixed(3),
    horizontes_por_s: Math.round((horizons - h0) / (wall / 1000)),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : def;
  };
  const sceneFile = opt("--scene");
  const o = {
    exe: argv[0],
    scene: sceneFile ? JSON.parse(readFileSync(sceneFile, "utf8")) : null,
    speed: Number(opt("--speed", "1")),
    seconds: Number(opt("--segundos", "10")),
    latency: Number(opt("--latencia", "0")),
  };
  const res = await medirVelocidad(o);
  console.log(JSON.stringify({ escena: !!sceneFile, speed: o.speed, latencia_ms: o.latency, ...res }));
  process.exit(0);
}
