#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G8_OIP_FUXA: el puente de E/S (app/lib/io-bridge.mjs) publica la
// bornera del Basic simulado como esclavo Modbus TCP, con el sketch
// tests/sketches/g8_io_bridge (Q0_k = I0_k). Un cliente hace lo mismo que
// Open Industry Project (libplctag) y FUXA:
//   OIP_COILS    escribe sensores en las bobinas 0-7 (FC05 y FC15) y lee los
//                actuadores en las entradas discretas 0-7 (FC02); también
//                lee las salidas como bobinas 16-23 (FC01)
//   FUXA_REGS    escribe las entradas como bits del registro 0 (FC06/FC16) y
//                lee los registros 0 y 1 (FC03 y FC04)
//   EXCEPCIONES  dirección fuera del mapa (02), escribir una salida (02) y
//                función no admitida (01)
//   ESCENA       una entrada que maneja la escena no se escribe desde afuera
//   LATENCIA     de la escritura de la bobina al cambio de la salida a
//                velocidad real (≤ 100 ms)
// El Modbus TCP del propio sketch (FUXA contra JWPLC_ModbusTCP en 1502) lo
// cubre JWSIM_G4_MODBUS_TCP_HOST.
import { join, resolve } from "node:path";

import { IoBridge } from "../app/lib/io-bridge.mjs";
import { ModbusTcpClient } from "../app/lib/modbus-tcp.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const target = targetArg();
const { lock } = resolvePackageRoot();
const { exe } = await buildSketch(join(ROOT, "tests", "sketches", "g8_io_bridge"), { target, log: () => {} });
const wine = exe.endsWith(".exe") && process.platform !== "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bits = (n) => Array.from({ length: 8 }, (_, k) => (n >> k) & 1);

async function session(owns) {
  const proc = new RunnerProcess();
  const ready = new Promise((resolve) => proc.on("message", (m) => m.type === "serial" && /listo/.test(m.text) && resolve()));
  const bridge = new IoBridge({ port: 0, owns });
  const listening = new Promise((r) => bridge.once("listening", (_h, p) => r(p)));
  proc.start(exe, [], { env: { WINEDEBUG: "-all" }, launcher: wine ? WINE : undefined });
  bridge.attach(proc);
  proc.send({ type: "run", speed: 1 });
  const port = await listening;
  await Promise.race([ready, sleep(20000)]);
  const c = new ModbusTcpClient("127.0.0.1", port, 1);
  await c.connect();
  const stop = async () => {
    c.close();
    bridge.close();
    proc.stop();
    await new Promise((r) => proc.once("exit", r));
  };
  return { c, stop };
}

// Espera a que las salidas (FC02) valgan `want` y devuelve los ms.
async function waitOutputs(c, want, ms = 2000) {
  const t0 = Date.now();
  for (;;) {
    const got = await c.readDiscrete(0, 8);
    if (got.join("") === want.join("")) return Date.now() - t0;
    if (Date.now() - t0 > ms) throw new Error(`salidas ${got.join("")}, se esperaba ${want.join("")}`);
    await sleep(5);
  }
}

const criteria = {};
{
  const { c, stop } = await session(() => false);
  try {
    // ---- OIP: sensores en bobinas, actuadores en entradas discretas
    const o = { pass: false };
    try {
      await c.writeCoil(0, true);
      await c.writeCoil(3, true);
      o.fc05_ms = await waitOutputs(c, bits(0b00001001));
      await c.writeCoils(0, bits(0b10100110));
      o.fc15_ms = await waitOutputs(c, bits(0b10100110));
      o.coils_entradas = (await c.readCoils(0, 8)).join("");
      o.coils_salidas = (await c.readCoils(16, 8)).join("");
      o.di_entradas = (await c.readDiscrete(8, 8)).join("");
      // Un pedido para todo el bloque 0-23 (FUXA agrupa así): el hueco 8-15 vale 0.
      o.coils_bloque = (await c.readCoils(0, 24)).join("");
      o.pass = o.coils_entradas === "01100101" && o.coils_salidas === "01100101" && o.di_entradas === "01100101" &&
        o.coils_bloque === "01100101" + "00000000" + "01100101";
    } catch (e) {
      o.error = e.message;
    }
    criteria.OIP_COILS = o;

    // ---- FUXA: registros
    const f = { pass: false };
    try {
      await c.writeSingle(0, 0b01010101);
      f.fc06_ms = await waitOutputs(c, bits(0b01010101));
      f.hr = await c.readHolding(0, 2);
      await c.writeMultiple(0, [0b11110000]);
      f.fc16_ms = await waitOutputs(c, bits(0b11110000));
      f.ir = await c.readInput(0, 2);
      f.pass = f.hr.join() === "85,85" && f.ir.join() === "240,240";
    } catch (e) {
      f.error = e.message;
    }
    criteria.FUXA_REGS = f;

    // ---- excepciones
    const x = {};
    const exc = async (fn) => {
      try {
        await fn();
        return "sin excepción";
      } catch (e) {
        return e.message;
      }
    };
    x.leer_fuera = await exc(() => c.readCoils(30, 2));
    x.escribir_salida = await exc(() => c.writeCoil(16, true));
    x.registro_fuera = await exc(() => c.readHolding(5, 1));
    x.funcion = (await c.request([0x2b, 0x0e, 0x01, 0x00]))[1];
    x.pass = x.leer_fuera === "excepción 2" && x.escribir_salida === "excepción 2" && x.registro_fuera === "excepción 2" && x.funcion === 1;
    criteria.EXCEPCIONES = x;

    // ---- latencia a velocidad real
    const l = { pass: false };
    try {
      await c.writeCoils(0, bits(0));
      await waitOutputs(c, bits(0));
      const ms = [];
      for (let k = 0; k < 8; k++) {
        await c.writeCoil(k, true);
        ms.push(await waitOutputs(c, bits((1 << (k + 1)) - 1)));
      }
      l.ms = ms;
      l.max_ms = Math.max(...ms);
      l.pass = l.max_ms <= 100;
    } catch (e) {
      l.error = e.message;
    }
    criteria.LATENCIA = l;
  } finally {
    await stop();
  }
}
{
  // ---- la escena maneja I0_7: el puente no la toca
  const { c, stop } = await session((s) => s === "I0_7");
  const e = { pass: false };
  try {
    await c.writeCoils(0, bits(0b10000001));
    await waitOutputs(c, bits(0b00000001));
    await sleep(100);
    e.salidas = (await c.readDiscrete(0, 8)).join("");
    e.pass = e.salidas === "10000000";
  } catch (err) {
    e.error = err.message;
  } finally {
    await stop();
  }
  criteria.ESCENA = e;
}

const pass = printCriteria("JWSIM_G8_OIP_FUXA", criteria, ` (${target})`);
writeReport(`JWSIM_G8_OIP_FUXA-${target}`, { gate: "JWSIM_G8_OIP_FUXA", target, package: lock.JWPLC_PACKAGE_REF, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
