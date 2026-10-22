#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// jwsim-net — un PLC simulado con el W5500 conectado a la red del host
// (gates JWSIM_G4_W5500_MODEL y JWSIM_G4_MODBUS_TCP_HOST).
//
//   node cli/jwsim-net.mjs <sketch_dir> [opciones]
//     --ip <a.b.c.d>        IP que entrega el DHCP de la red virtual (192.168.250.10)
//     --listen-host <h>     dónde se publican los puertos de escucha del PLC
//                           (127.0.0.1; 0.0.0.0 para la LAN)
//     --port-offset <n>     puerto del host = puerto del PLC + n (por defecto
//                           +1000 si es < 1024: Modbus TCP 502 → 1502)
//     --host <ip>=<host>    la IP del PLC <ip> se conecta a <host> del PC
//                           (p. ej. --host 192.168.0.100=127.0.0.1); repetible
//     --state <dir>         memoria no volátil (FRAM, NVS, SD)
//     --target <t>          destino de compilación (native)
//
// Corre a la par del reloj de pared hasta Ctrl+C; la consola del PLC sale
// por stdout. Al terminar guarda la sesión (entradas, incluida la red) en
// <sketch>.stim en el directorio actual: se reproduce
// sin red con `<runner> --eth --stim archivo`.
import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "./lib/build.mjs";

const args = process.argv.slice(2);
const hosts = {};
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
for (let i = args.indexOf("--host"); i >= 0; i = args.indexOf("--host")) {
  const [ip, host] = (args[i + 1] ?? "").split("=");
  hosts[ip] = host;
  args.splice(i, 2);
}
const plcIp = opt("--ip");
const listenHost = opt("--listen-host", "127.0.0.1");
const offset = opt("--port-offset");
const state = opt("--state");
const target = opt("--target", "native");
if (args.length !== 1) {
  console.error("uso: node cli/jwsim-net.mjs <sketch_dir> [--ip a.b.c.d] [--listen-host h] [--port-offset n] [--host ip=host] [--state dir]");
  process.exit(2);
}

const dir = resolve(args[0]);
const { exe } = await buildSketch(dir, { target, log: (m) => console.error(m) });
const proc = new RunnerProcess();
const bridge = new NetBridge({ plcIp, listenHost, hosts, ...(offset !== undefined ? { listenPort: (p) => p + Number(offset) } : {}) });
const inputs = [];
let partial = "";
proc.on("message", (m) => {
  if (m.type === "serial" && m.port === 0) {
    const lines = (partial + m.text).split(/\r?\n/);
    partial = lines.pop();
    for (const l of lines) console.log(l);
  } else if (m.type === "input") inputs.push(`${(m.t_ns / 1e6).toFixed(6)} ${m.stim}`);
});
proc.on("stderr", (t) => process.stderr.write(t));
bridge.on("listening", (p, hp) => console.error(`[net] puerto ${p} del PLC en ${listenHost}:${hp}`));
bridge.on("error", (err) => console.error(`[net] ${err.message}`));
proc.start(exe, ["--eth", ...(state ? ["--state", resolve(state)] : [])]);
bridge.attach(proc);
proc.send({ type: "run", speed: 1 });
console.error(`[net] ${basename(dir)}: red virtual ${bridge.gateway}/24, DHCP entrega ${bridge.plcIp} (Ctrl+C para terminar)`);

process.on("SIGINT", async () => {
  proc.send({ type: "pause" });
  const file = `${basename(dir)}.stim`;
  writeFileSync(file, inputs.join("\n") + "\n");
  console.error(`[net] sesión guardada en ${file} (${inputs.length} entradas)`);
  proc.stop();
  bridge.close();
  setTimeout(() => process.exit(0), 600);
});
