#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Fallas del conversor USB a RS-485 de la PC en jwsim-bus (app/lib/rs485-bus.mjs),
// para probar JW Modbus Tool con y sin eco. Un JWPLC con
// JW_ModbusRTU/Slave_Holding (esclavo 2, 115200) y este script como la
// herramienta, por el extremo TCP del host:
//   sin_eco          la herramienta recibe solo la respuesta a «leer HR1»
//   con_eco          recibe su propia petición y después la respuesta
//   ab_invertidos    el esclavo ve basura y no responde; el eco llega bien
//   sin_terminacion  con 100 % de caracteres con error, ninguna respuesta
//                    válida; con 0 % (la opción sin valor de la CLI usa 2 %)
//                    igual que sin_eco
import { mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

import { readHolding } from "../app/lib/modbus-rtu.mjs";
import { Rs485Bus } from "../app/lib/rs485-bus.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { withCrc } from "../scene/modbus.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, writeReport } from "./lib/gate-util.mjs";

const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "conversor-bus");
rmSync(work, { recursive: true, force: true });
const { exe } = await buildSketch(join(libs, "JW_ModbusRTU", "examples", "Slave_Holding"), { target: "native", log: () => {} });

const REQ = Buffer.from(readHolding(2, 1, 1));
const RESP = Buffer.from(withCrc([0x02, 0x03, 0x02, 0x00, 0x64]));

/** Una petición con el conversor configurado así; devuelve lo que llegó a la herramienta. */
async function ask(name, opts) {
  const bus = new Rs485Bus({ baud: 115200, quantumNs: 1_000_000, ...opts });
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  bus.addNode("slave2", exe, ["--state", dir]);
  const server = net.createServer((sock) => bus.attachHost(sock));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const tool = net.connect(server.address().port, "127.0.0.1");
  await new Promise((r) => tool.once("connect", r));
  let rx = Buffer.alloc(0);
  tool.on("data", (d) => (rx = Buffer.concat([rx, d])));
  let running = true;
  const loop = (async () => {
    while (running) await bus.runUntil(bus.t + 50e6, { realtime: true });
  })();
  await new Promise((r) => setTimeout(r, 1500));   // arranque del esclavo
  rx = Buffer.alloc(0);
  tool.write(REQ);
  await new Promise((r) => setTimeout(r, 600));
  running = false;
  await loop;
  tool.destroy();
  server.close();
  await bus.stop();
  return { rx, noisy: bus.log.filter((c) => c.noise).length };
}

const criteria = {};
const hex = (b) => Buffer.from(b).toString("hex");
{
  const { rx } = await ask("sin-eco", {});
  criteria.sin_eco = { pass: rx.equals(RESP), recibido: hex(rx) };
}
{
  const { rx } = await ask("con-eco", { hostEcho: true });
  criteria.con_eco = { pass: rx.equals(Buffer.concat([REQ, RESP])), recibido: hex(rx) };
}
{
  const { rx } = await ask("ab-invertidos", { hostInverted: true, hostEcho: true });
  criteria.ab_invertidos = { pass: rx.equals(REQ), recibido: hex(rx), nota: "solo el eco: el esclavo no respondió" };
}
{
  const a = await ask("sin-terminacion-100", { errorRate: 1 });
  const b = await ask("sin-terminacion-0", { errorRate: 0 });
  criteria.sin_terminacion = { pass: !a.rx.includes(RESP) && a.noisy >= REQ.length && b.rx.equals(RESP), recibido_100: hex(a.rx), caracteres_con_error: a.noisy, recibido_0: hex(b.rx) };
}

const pass = printCriteria("JWSIM_CONVERSOR_BUS", criteria);
writeReport("JWSIM_CONVERSOR_BUS", { gate: "JWSIM_CONVERSOR_BUS", result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
