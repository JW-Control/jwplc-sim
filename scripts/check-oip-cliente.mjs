#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Comprueba el proyecto tests/projects/oip-cinta contra el puente de E/S
// haciendo lo mismo que Open Industry Project (versión de escritorio) en el
// modo «The simulator polls the PLC»: cada 20 ms escribe el registro
// holding 0 con FC16 (sensores %IX0.n = I0.n) y lee los input registers con
// FC4 (actuadores %QX2.n = Q0.n, input register 1).
//
//   node scripts/check-oip-cliente.mjs
//
// Pasos: cinta en marcha, caja en la fotocelda (para), la caja sale del haz
// (sigue parada: enclavamiento), pulsador de marcha (arranca), caja nueva
// (para).
import { join, resolve } from "node:path";

import { IoBridge } from "../app/lib/io-bridge.mjs";
import { ModbusTcpClient } from "../app/lib/modbus-tcp.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { exe } = await buildSketch(join(ROOT, "tests", "projects", "oip-cinta", "sketch", "oip_cinta"), { log: () => {} });
const proc = new RunnerProcess();
const ready = new Promise((r) => proc.on("message", (m) => m.type === "serial" && /listo/.test(m.text) && r()));
const serial = [];
proc.on("message", (m) => m.type === "serial" && serial.push(m.text.trim()));
const bridge = new IoBridge({ port: 0 });
const listening = new Promise((r) => bridge.once("listening", (_h, p) => r(p)));
proc.start(exe, [], {});
bridge.attach(proc);
proc.send({ type: "run", speed: 1 });
const port = await listening;
await Promise.race([ready, sleep(20000)]);

const c = new ModbusTcpClient("127.0.0.1", port, 1);
await c.connect();
// [registro holding 0 (bit 0 = fotocelda, bit 1 = marcha), Q0.0 esperado, paso]
const steps = [
  [0b00, 1, "cinta en marcha"],
  [0b01, 0, "caja en la fotocelda: para"],
  [0b00, 0, "la caja sale del haz: sigue parada"],
  [0b10, 1, "pulsador de marcha: arranca"],
  [0b00, 1, "suelta el pulsador: sigue en marcha"],
  [0b01, 0, "caja nueva: para"],
];
const rows = [];
for (const [hr, run, paso] of steps) {
  const t0 = Date.now();
  let q;
  for (;;) {
    await c.writeMultiple(0, [hr]);
    q = (await c.readInput(1, 1))[0] & 0xff;
    if (((q & 1) === run && Date.now() - t0 > 150) || Date.now() - t0 > 2000) break;
    await sleep(20);
  }
  rows.push({ paso, "Q0.0": q & 1, esperado: run, ok: (q & 1) === run });
}
c.close();
bridge.close();
proc.stop();

console.table(rows);
console.log(serial.join("\n"));
const pass = rows.every((r) => r.ok);
console.log(`OIP_CLIENTE=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
