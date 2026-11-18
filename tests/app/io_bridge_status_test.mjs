// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Estado del puente de E/S para el indicador «OIP conectado» de la app:
// esperando → conectado (OIP o cliente Modbus) → en pausa (sin pedidos) →
// esperando al cerrar el cliente.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { IoBridge, QUIET_MS } from "../../app/lib/io-bridge.mjs";
import { ModbusTcpClient } from "../../app/lib/modbus-tcp.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runner falso: el puente solo usa on/off/send.
class FakeRunner extends EventEmitter {
  send() {}
}

async function open() {
  const bridge = new IoBridge({ port: 0 });
  const states = [];
  bridge.on("status", (st) => states.push(st));
  const port = new Promise((r) => bridge.once("listening", (_h, p) => r(p)));
  bridge.attach(new FakeRunner());
  return { bridge, states, port: await port };
}

async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("no llegó el estado esperado");
    await sleep(20);
  }
}

test("OIP (FC16 + FC04): esperando, conectado, en pausa y esperando", async () => {
  const { bridge, states, port } = await open();
  try {
    assert.equal(states.at(-1).state, "waiting");
    const c = new ModbusTcpClient("127.0.0.1", port, 1);
    await c.connect();
    await c.writeMultiple(0, [1]);
    await c.readInput(1, 1);
    await until(() => states.at(-1).state === "connected" && states.at(-1).clients[0]?.kind === "oip");
    assert.equal(bridge.status().clients.length, 1);

    // Sin pedidos durante QUIET_MS: en pausa (OIP en Stop).
    await until(() => states.at(-1).state === "quiet", QUIET_MS + 1500);
    assert.equal(states.at(-1).clients[0].kind, "oip");

    // Vuelve a pedir: conectado otra vez.
    await c.readInput(1, 1);
    await until(() => states.at(-1).state === "connected");

    c.close();
    await until(() => states.at(-1).state === "waiting");
    assert.deepEqual(states.at(-1).clients, []);
  } finally {
    bridge.close();
  }
});

test("FUXA u otro (FC01/FC03): cliente Modbus, no OIP", async () => {
  const { bridge, states, port } = await open();
  try {
    const c = new ModbusTcpClient("127.0.0.1", port, 1);
    await c.connect();
    await c.readCoils(0, 8);
    await c.readHolding(0, 2);
    await until(() => states.at(-1).state === "connected");
    assert.equal(states.at(-1).clients[0].kind, "modbus");
    c.close();
  } finally {
    bridge.close();
  }
});

test("solo avisa cuando cambia el estado, no por cada pedido", async () => {
  const { bridge, states, port } = await open();
  try {
    const c = new ModbusTcpClient("127.0.0.1", port, 1);
    await c.connect();
    for (let i = 0; i < 30; i++) {
      await c.writeMultiple(0, [i & 1]);
      await c.readInput(1, 1);
      await sleep(10);
    }
    await sleep(300);
    // waiting, cliente sin pedidos (quiet) y connected: no 60 avisos.
    assert.ok(states.length <= 4, `avisos: ${states.map((s) => s.state).join(", ")}`);
    c.close();
  } finally {
    bridge.close();
  }
});
