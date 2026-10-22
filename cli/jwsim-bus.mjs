#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// jwsim-bus — varios PLC simulados en un bus RS-485 (UART2), y una
// herramienta externa conectada al bus (gate JWSIM_G4_RS485_MULTINODE).
//
//   node cli/jwsim-bus.mjs <sketch_dir> [<sketch_dir>...] [opciones]
//     --baud <n>        velocidad del bus para lo que llega del host (115200)
//     --q <µs>          ventana de sincronización = latencia del bus (1000)
//     --tcp <puerto>    extremo del host: RTU crudo por TCP en 127.0.0.1
//                       (p. ej. "RTU over TCP" de JW Modbus Tool)
//     --com <ruta>      extremo del host: puerto serie (en Windows, un par COM
//                       virtual como com0com: \\.\COM10; en Linux, un pty)
//     --until <ms>      tiempo virtual a simular (sin extremo del host: 10000)
//     --state <dir>     carpeta de estado por nodo (<dir>/nodo-N)
//     --target <t>      destino de compilación (native)
//
// Cada nodo imprime su consola con el prefijo [N]. Con un extremo del host
// el bus avanza a la par del reloj de pared hasta Ctrl+C.
import { closeSync, createReadStream, createWriteStream, mkdirSync, openSync } from "node:fs";
import net from "node:net";
import { basename, join, resolve } from "node:path";
import { Duplex } from "node:stream";

import { Rs485Bus } from "../app/lib/rs485-bus.mjs";
import { buildSketch } from "./lib/build.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const baud = Number(opt("--baud", 115200));
const q = Number(opt("--q", 1000)) * 1000;
const tcp = opt("--tcp");
const com = opt("--com");
const untilMs = Number(opt("--until", tcp || com ? Infinity : 10000));
const stateRoot = opt("--state");
const target = opt("--target", "native");
if (!args.length) {
  console.error("uso: node cli/jwsim-bus.mjs <sketch_dir> [<sketch_dir>...] [--tcp puerto | --com ruta] [--until ms]");
  process.exit(2);
}

const bus = new Rs485Bus({ baud, quantumNs: q });
for (const [i, dir] of args.entries()) {
  const { exe } = await buildSketch(resolve(dir), { target, log: () => {} });
  const extra = [];
  if (stateRoot) {
    const st = join(resolve(stateRoot), `nodo-${i + 1}`);
    mkdirSync(st, { recursive: true });
    extra.push("--state", st);
  }
  const node = bus.addNode(`${i + 1}`, exe, extra);
  console.log(`[bus] nodo ${i + 1}: ${basename(dir)}`);
  let partial = "";
  bus.on("message", (n, m) => {
    if (n !== node || m.type !== "serial" || m.port !== 0) return;
    const lines = (partial + m.text).split(/\r?\n/);
    partial = lines.pop();
    for (const l of lines) console.log(`[${i + 1}] ${l}`);
  });
}
bus.on("stderr", (n, t) => process.stderr.write(`[${n.name}] ${t}`));

let server = null;
if (tcp) {
  server = net.createServer((sock) => {
    console.log("[bus] herramienta conectada por TCP");
    bus.attachHost(sock);
  });
  await new Promise((r) => server.listen(Number(tcp), "127.0.0.1", r));
  console.log(`[bus] extremo del host: tcp://127.0.0.1:${server.address().port} (RTU crudo)`);
} else if (com) {
  // Puerto serie como flujo de archivo (la configuración de línea la da el
  // par virtual o el adaptador; el bus no la necesita).
  const fd = openSync(com, "r+");
  const rd = createReadStream(null, { fd, autoClose: false });
  const wr = createWriteStream(null, { fd, autoClose: false });
  const port = new Duplex({ read() {}, write(chunk, _e, cb) { wr.write(chunk, cb); } });
  rd.on("data", (d) => port.push(d));
  bus.attachHost(port);
  process.on("exit", () => closeSync(fd));
  console.log(`[bus] extremo del host: ${com}`);
}

let stopping = false;
process.on("SIGINT", () => (stopping = true));
const step = 100e6;
while (!stopping && bus.t < untilMs * 1e6) await bus.runUntil(Math.min(bus.t + step, untilMs * 1e6));
await bus.stop();
server?.close();
for (const n of bus.nodes) console.log(`[bus] nodo ${n.name}: t=${(bus.t / 1e6).toFixed(3)} ms hash=${n.hash}`);
const collisions = bus.log.filter((e) => e.collision).length;
console.log(`[bus] ${bus.log.length} caracteres en el bus${collisions ? `, ${collisions} en choques` : ""}`);
process.exit(0);
