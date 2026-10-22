#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_MODBUS_TCP_HOST: JWPLC_ModbusTCP con un cliente o un
// servidor Modbus TCP del host, a través del W5500 simulado y
// app/lib/net-bridge.mjs.
//   servidor  01.ModbusTCP_Server publicado en 127.0.0.1:1502: un cliente
//             externo (este script) lee y escribe holding (FC03/06/16),
//             coils (FC01/05) e input registers (FC04)
//   dos_plc   dos PLC con el mismo sketch en 1502 y 2502: cada uno conserva
//             lo que se le escribe
//   cliente   02.ModbusTCP_Client (servidor 192.168.0.100:502 en el
//             ejemplo) contra un servidor Modbus TCP del host: lecturas FC03
//             correctas y una sola conexión TCP reutilizada
import { join } from "node:path";

import { ModbusTcpClient, modbusTcpServer } from "../app/lib/modbus-tcp.mjs";
import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const ex = (name) => join(root, lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_ModbusTCP", "examples", name);
const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const wine = (exe) => exe.endsWith(".exe") && process.platform !== "win32";

// PLC a velocidad real con el puente; resuelve cuando la consola muestra `ready`.
function plc(exe, bridge, ready) {
  const proc = new RunnerProcess();
  const lines = [];
  let partial = "";
  const isReady = new Promise((resolve) => {
    proc.on("message", (m) => {
      if (m.type !== "serial" || m.port !== 0) return;
      const parts = (partial + m.text).split(/\r?\n/);
      partial = parts.pop();
      for (const l of parts) {
        lines.push(l);
        if (ready.test(l)) resolve(l);
      }
    });
  });
  proc.start(exe, ["--eth"], { env: { WINEDEBUG: "-all" }, launcher: wine(exe) ? WINE : undefined });
  bridge.attach(proc);
  proc.send({ type: "run", speed: 1 });
  const stop = async () => {
    proc.stop();
    await new Promise((r) => proc.once("exit", r));
    bridge.close();
  };
  return { proc, lines, isReady, stop };
}
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`sin ${what} en ${ms} ms`)), ms))]);

const criteria = {};
const serverExe = await build(ex("01.ModbusTCP_Server"));

// ---- servidor
{
  const bridge = new NetBridge({ listenPort: (p) => p + 1000 });
  const p = plc(serverExe, bridge, /^Modbus TCP READY/);
  const out = { pass: false };
  try {
    out.listo = await within(p.isReady, 20000, "READY");
    const c = new ModbusTcpClient("127.0.0.1", 1502, 1);
    await c.connect();
    out.hr_inicial = await c.readHolding(0, 4);
    out.fc06 = await c.writeSingle(0, 1234);
    out.fc16 = await c.writeMultiple(1, [11, 22, 33]);
    out.hr_final = await c.readHolding(0, 4);
    out.fc05 = await c.writeCoil(2, true);
    out.coils = await c.readCoils(0, 8);
    out.ir = await c.readInput(0, 2);
    c.close();
    out.pass = out.hr_final.join() === "1234,11,22,33" && out.coils.join("") === "00100000" && out.ir[0] >= 1;
  } catch (e) {
    out.error = e.message;
  }
  out.consola = p.lines.slice(0, 3);
  await p.stop();
  criteria.servidor = out;
}

// ---- dos PLC en puertos distintos
{
  const a = plc(serverExe, new NetBridge({ listenPort: (p) => p + 1000 }), /^Modbus TCP READY/);
  const b = plc(serverExe, new NetBridge({ listenPort: (p) => p + 2000 }), /^Modbus TCP READY/);
  const out = { pass: false };
  try {
    await within(Promise.all([a.isReady, b.isReady]), 20000, "READY");
    const ca = new ModbusTcpClient("127.0.0.1", 1502);
    const cb = new ModbusTcpClient("127.0.0.1", 2502);
    await ca.connect();
    await cb.connect();
    await ca.writeSingle(5, 111);
    await cb.writeSingle(5, 222);
    out.plc1 = (await ca.readHolding(5, 1))[0];
    out.plc2 = (await cb.readHolding(5, 1))[0];
    ca.close();
    cb.close();
    out.pass = out.plc1 === 111 && out.plc2 === 222;
  } catch (e) {
    out.error = e.message;
  }
  await a.stop();
  await b.stop();
  criteria.dos_plc = out;
}

// ---- cliente contra un servidor del host
{
  const srv = await modbusTcpServer({ 0: 4321, 1: 8765 });
  const bridge = new NetBridge({ hosts: { "192.168.0.100": "127.0.0.1" }, connectPort: (ip, port) => (ip === "192.168.0.100" && port === 502 ? srv.port : port) });
  const exe = await build(ex("02.ModbusTCP_Client"));
  const p = plc(exe, bridge, /^FC03 OK .*HR\[0\]=4321 \| HR\[1\]=8765 \| TCP=CONNECTED/);
  const out = { pass: false };
  try {
    out.primera = await within(p.isReady, 20000, "FC03 OK");
    await new Promise((r) => setTimeout(r, 2500));
    out.lecturas_ok = p.lines.filter((l) => /^FC03 OK/.test(l)).length;
    out.conexiones = bridge.log.filter((e) => e.op === "connect").length;
    out.pedidos_al_servidor = srv.requests.length;
    out.pass = out.lecturas_ok >= 2 && out.conexiones === 1 && srv.requests.every((r) => r[0] === 3);
  } catch (e) {
    out.error = e.message;
    out.consola = p.lines.slice(-5);
  }
  await p.stop();
  srv.server.close();
  criteria.cliente = out;
}

const pass = printCriteria("JWSIM_G4_MODBUS_TCP_HOST", criteria, ` (${target})`);
writeReport(`JWSIM_G4_MODBUS_TCP_HOST-${target}`, { gate: "JWSIM_G4_MODBUS_TCP_HOST", target, package: lock.JWPLC_PACKAGE_REF, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
