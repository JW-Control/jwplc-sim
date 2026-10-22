#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_RS485_MULTINODE: UART con tiempo de carácter y bus RS-485
// entre varios runners (app/lib/rs485-bus.mjs) y con el host.
//   tiempo_caracter  la trama de 8 bytes del maestro ocupa 8 caracteres de
//                    10 bits a 115200 baudios en el bus (694 µs), sin huecos
//   tres_nodos       g4_rtu_master (maestro) + 01.ModbusRTU_Slave_Holding del
//                    package (esclavo 2) + g4_rtu_slave3 (esclavo 3): lecturas
//                    FC03 de ambos, escrituras FC06 al 3 y plazo vencido con
//                    el esclavo 4 inexistente; las tramas del bus tienen CRC
//                    válido y nunca chocan
//   determinismo     el mismo bus dos veces: el mismo hash en cada nodo
//   choques          dos maestros que piden a la vez: sus caracteres chocan
//                    en el bus, ninguno recibe respuesta válida
//   herramienta      un maestro Modbus RTU externo (este script) por un
//                    socket TCP del host (RTU crudo, como "RTU over TCP" de
//                    JW Modbus Tool o un par COM virtual) lee y escribe los
//                    esclavos 2 y 3 a la par del reloj de pared
import { mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

import { crc16, parseResponse, readHolding, splitFrames, writeSingle } from "../app/lib/modbus-rtu.mjs";
import { Rs485Bus } from "../app/lib/rs485-bus.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "g4", `rs485-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const BAUD = 115200;
const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const exes = {
  master: await build(join(ROOT, "tests", "sketches", "g4_rtu_master")),
  slave2: await build(join(libs, "JWPLC_ModbusRTU", "examples", "01.ModbusRTU_Slave_Holding")),
  slave3: await build(join(ROOT, "tests", "sketches", "g4_rtu_slave3")),
};
// Bajo wine el runner de Windows se lanza a través de wine.
const node = (bus, name, exe, dir) => {
  mkdirSync(dir, { recursive: true });
  return exe.endsWith(".exe") && process.platform !== "win32"
    ? bus.addNode(name, exe, ["--state", `Z:${dir.replaceAll("/", "\\")}`], { env: { WINEDEBUG: "-all" }, launcher: WINE })
    : bus.addNode(name, exe, ["--state", dir]);
};

async function threeNodes(run) {
  const bus = new Rs485Bus({ baud: BAUD, quantumNs: 1_000_000 });
  const nodes = ["master", "slave2", "slave3"].map((n) => node(bus, n, exes[n], join(work, `${run}-${n}`)));
  await bus.runUntil(5000e6, { realtime: false });
  await bus.stop();
  return { bus, nodes };
}

const criteria = {};
const a = await threeNodes("a");
{
  const lines = a.nodes[0].console.split(/\r?\n/).filter((l) => l.startsWith("M "));
  const count = (re) => lines.filter((l) => re.test(l)).length;
  const reads2 = lines.filter((l) => /^M read esclavo=2 OK v=\d+,100,200,300$/.test(l));
  const reads3 = lines.filter((l) => /^M read esclavo=3 OK v=\d+,\d+,3002,3003$/.test(l));
  const writes = count(/^M write esclavo=3 OK v=\d+$/);
  const timeouts = count(/^M read esclavo=4 FAIL /);
  // El esclavo 3 recibió las escrituras (las imprime).
  const written = (a.nodes[2].console.match(/HR1 escrito = \d+/g) ?? []).length;
  // Tramas del bus: separadas por silencio, todas con CRC válido.
  const frames = splitFrames(a.bus.log.map((e) => ({ t: e.start, byte: e.byte })), BAUD);
  const badCrc = frames.filter((f) => f.bytes.length < 4 || crc16(f.bytes.slice(0, -2)) !== (f.bytes.at(-2) | (f.bytes.at(-1) << 8)));
  const collisions = a.bus.log.filter((e) => e.collision).length;
  criteria.tres_nodos = {
    pass: reads2.length >= 3 && reads3.length >= 3 && writes >= 3 && written === writes && timeouts >= 3 && badCrc.length === 0 && collisions === 0 && frames.length > 20,
    lecturas_esclavo2: reads2.length,
    lecturas_esclavo3: reads3.length,
    escrituras: writes,
    escrituras_recibidas: written,
    plazos_vencidos_esclavo4: timeouts,
    tramas_en_el_bus: frames.length,
    crc_invalido: badCrc.length,
    choques: collisions,
    ejemplo: lines.slice(0, 4),
  };
  // Tiempo de carácter: los 8 bytes del primer pedido del maestro.
  const first = a.bus.log.filter((e) => e.from?.name === "master").slice(0, 8);
  const span = first.at(-1).start - first[0].start;
  const charNs = Math.round(10e9 / BAUD);
  criteria.tiempo_caracter = {
    pass: first.length === 8 && first.every((e, i) => i === 0 || Math.abs(e.start - first[i - 1].start - charNs) <= 1),
    caracter_ns: charNs,
    trama_ns: span + charNs,
  };
}
{
  const b = await threeNodes("b");
  const ha = a.nodes.map((n) => n.hash);
  const hb = b.nodes.map((n) => n.hash);
  criteria.determinismo = { pass: ha.every((h, i) => h && h === hb[i]), hashes: Object.fromEntries(a.nodes.map((n, i) => [n.name, ha[i]])) };
}

{
  const bus = new Rs485Bus({ baud: BAUD, quantumNs: 1_000_000 });
  const ms = ["m1", "m2"].map((n) => node(bus, n, exes.master, join(work, `choque-${n}`)));
  node(bus, "slave2", exes.slave2, join(work, "choque-slave2"));
  await bus.runUntil(1500e6, { realtime: false });
  await bus.stop();
  const collided = bus.log.filter((e) => e.collision);
  const firsts = ms.map((n) => n.console.split(/\r?\n/).find((l) => l.startsWith("M ")));
  criteria.choques = {
    pass: collided.length >= 16 && firsts.every((l) => /^M read esclavo=2 FAIL /.test(l ?? "")),
    caracteres_en_choque: collided.length,
    resultado_maestros: firsts,
  };
}

// ---- herramienta externa por TCP (a la par del reloj de pared)
{
  const bus = new Rs485Bus({ baud: BAUD, quantumNs: 1_000_000 });
  node(bus, "slave2", exes.slave2, join(work, "tool-slave2"));
  node(bus, "slave3", exes.slave3, join(work, "tool-slave3"));
  const server = net.createServer((sock) => bus.attachHost(sock));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const tool = net.connect(port, "127.0.0.1");
  await new Promise((r) => tool.once("connect", r));
  let rx = Buffer.alloc(0);
  tool.on("data", (d) => (rx = Buffer.concat([rx, d])));
  // El bus corre en segundo plano a la velocidad del reloj.
  let running = true;
  const loop = (async () => {
    while (running) await bus.runUntil(bus.t + 50e6, { realtime: true });
  })();
  const ask = async (frame, expectLen) => {
    rx = Buffer.alloc(0);
    tool.write(frame);
    const t0 = Date.now();
    while (rx.length < expectLen && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 10));
    return parseResponse(rx.subarray(0, expectLen));
  };
  await new Promise((r) => setTimeout(r, 1500));   // arranque de los esclavos
  const r2 = await ask(readHolding(2, 0, 4), 13);
  const r3 = await ask(readHolding(3, 1, 3), 11);
  const w3 = await ask(writeSingle(3, 1, 4242), 8);
  const r3b = await ask(readHolding(3, 1, 1), 7);
  running = false;
  await loop;
  tool.destroy();
  server.close();
  await bus.stop();
  criteria.herramienta = {
    pass: r2?.ok && r2.values.slice(1).join() === "100,200,300" && r3?.ok && r3.values.join() === "3001,3002,3003" && w3?.ok && w3.value === 4242 && r3b?.ok && r3b.values[0] === 4242,
    lectura_esclavo2: r2?.values,
    lectura_esclavo3: r3?.values,
    escritura_esclavo3: w3?.value,
    relectura_esclavo3: r3b?.values,
  };
}

const pass = printCriteria("JWSIM_G4_RS485_MULTINODE", criteria, ` (${target})`);
writeReport(`JWSIM_G4_RS485_MULTINODE-${target}`, { gate: "JWSIM_G4_RS485_MULTINODE", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
