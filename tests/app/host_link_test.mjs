// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Filtro del conversor USB a RS-485 de la escena (app/lib/host-link.mjs) y
// fallas del extremo del host de jwsim-bus (app/lib/rs485-bus.mjs).
// node --test tests/app/host_link_test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { LinkFilter, describeLink } from "../../app/lib/host-link.mjs";

const req = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xc4, 0x0b]);

test("sin fallas: los bytes pasan tal cual y la PC no recibe eco", () => {
  const f = new LinkFilter();
  const { toPlc, toHost } = f.fromHost(req);
  assert.deepEqual(toPlc, req);
  assert.equal(toHost, null);
  assert.deepEqual(f.fromPlc(req), req);
});

test("con eco: la PC recibe exactamente lo que transmitió, y la placa también lo recibe", () => {
  const f = new LinkFilter({ echo: true });
  const { toPlc, toHost } = f.fromHost(req);
  assert.deepEqual(toHost, req);
  assert.deepEqual(toPlc, req);
});

test("A/B invertidos: bits invertidos en los dos sentidos; el eco llega bien", () => {
  const f = new LinkFilter({ inverted: true, echo: true });
  const { toPlc, toHost } = f.fromHost(Buffer.from([0x01, 0xff, 0x00]));
  assert.deepEqual([...toPlc], [0xfe, 0x00, 0xff]);
  assert.deepEqual(toHost, Buffer.from([0x01, 0xff, 0x00]));
  assert.deepEqual([...f.fromPlc(Buffer.from([0x0f]))], [0xf0]);
});

test("cables cruzados invierten; cruzados con A/B invertidos se anulan", () => {
  assert.deepEqual([...new LinkFilter({ wiring: "crossed" }).fromPlc(Buffer.from([0x55]))], [0xaa]);
  assert.deepEqual([...new LinkFilter({ wiring: "crossed", inverted: true }).fromPlc(Buffer.from([0x55]))], [0x55]);
});

test("sin cablear: no pasa nada, pero el eco del conversor sí", () => {
  const f = new LinkFilter({ wiring: "open", echo: true });
  const { toPlc, toHost } = f.fromHost(req);
  assert.equal(toPlc, null);
  assert.deepEqual(toHost, req);
  assert.equal(f.fromPlc(req), null);
});

test("sin terminación: cerca de la tasa pedida, un solo bit por byte y repetible con la misma semilla", () => {
  const data = Buffer.alloc(20000, 0x00);
  const a = new LinkFilter({ errorRate: 0.05, seed: 3 }).fromPlc(data);
  const b = new LinkFilter({ errorRate: 0.05, seed: 3 }).fromPlc(data);
  assert.deepEqual(a, b);
  const bad = [...a].filter((x) => x !== 0);
  assert.ok(bad.length > 800 && bad.length < 1200, `bytes con error: ${bad.length}`);
  assert.ok(bad.every((x) => (x & (x - 1)) === 0), "un solo bit cambiado");
});

test("describeLink resume el enlace para la consola", () => {
  assert.equal(
    describeLink({ device: "U1", uart: 2, com: "COM20", echo: true, inverted: false, errorRate: 0.02, wiring: "crossed" }),
    "U1: COM20 ↔ RS-485 del JWPLC · con eco, sin terminación (2 % de bytes con error) · cables cruzados: llega basura",
  );
  assert.equal(describeLink({ device: "PC", uart: 0, com: "COM20", wiring: "ok" }), "PC: COM20 ↔ USB del JWPLC");
});
