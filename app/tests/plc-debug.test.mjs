// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Cliente del depurador OpenPLC (app/lib/plc-debug.mjs): trama RTU y lectura
// contra un firmware de mentira que responde como el Baremetal.
//   cd app && node --test tests/plc-debug.test.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { editorPaths, resolveEditor } from "../../scripts/fetch-editor.mjs";
import { PlcDebugLink, crc16, rtuFrame } from "../lib/plc-debug.mjs";

test("CRC-16 Modbus y trama RTU (byte bajo primero)", () => {
  // Ejemplo clásico: 01 03 00 00 00 0A → CRC C5CD (se envía CD C5).
  assert.equal(crc16(Buffer.from("01030000000a", "hex")), 0xcdc5);
  assert.equal(rtuFrame(1, Buffer.from("030000000a", "hex")).toString("hex"), "01030000000ac5cd");
});

test("lee variables con el protocolo del editor", async () => {
  const { dir } = await resolveEditor({ fetch: false });
  const ops = createRequire(import.meta.url)(editorPaths(dir).ladderOps);
  const map = {
    version: 2,
    md5: "0123456789abcdef0123456789abcdef",
    typeTags: {},
    arrays: [{ index: 0, count: 3 }],
    leaves: [
      { arrayIdx: 0, elemIdx: 0, path: "INSTANCE0.MARCHA", type: "BOOL", size: 1 },
      { arrayIdx: 0, elemIdx: 1, path: "INSTANCE0.T1.ET", type: "TIME", size: 8 },
      { arrayIdx: 0, elemIdx: 2, path: "INSTANCE0.CUENTA", type: "INT", size: 2 },
    ],
  };
  const mapFile = join(mkdtempSync(join(tmpdir(), "dbg-")), "debug-map.json");
  writeFileSync(mapFile, JSON.stringify(map));
  // Firmware de mentira: MARCHA = 1, T1.ET = 1500 ms (ns, LE), CUENTA = -3.
  const vals = [Buffer.from([1]), Buffer.alloc(8), Buffer.alloc(2)];
  vals[1].writeBigInt64LE(1500000000n);
  vals[2].writeInt16LE(-3);
  const proc = new EventEmitter();
  proc.send = (m) => {
    if (m.type !== "uart_rx") return;
    const req = Buffer.from(m.data.split(",").map((x) => parseInt(x.split(":")[1], 16)));
    const fc = req[1];
    let pdu;
    if (fc === 0x45) pdu = Buffer.concat([Buffer.from([0x45, 0x7e]), Buffer.from(map.md5), Buffer.from([0xad, 0xde])]);
    if (fc === 0x44) {
      const n = req.readUInt16BE(2);
      const data = Buffer.concat([...Array(n)].map((_, i) => vals[req.readUInt16BE(4 + i * 3 + 1)]));
      const h = Buffer.alloc(10);
      h[0] = 0x44;
      h[1] = 0x7e;
      h.writeUInt16BE(n - 1, 2);
      h.writeUInt32BE(7, 4);
      h.writeUInt16BE(data.length, 8);
      pdu = Buffer.concat([h, data]);
    }
    // Texto suelto antes de la respuesta: el cliente busca la trama.
    const out = Buffer.concat([Buffer.from("hola\n"), rtuFrame(1, pdu)]);
    setImmediate(() => proc.emit("message", { type: "uart_out", port: 0, hex: out.toString("hex") }));
  };
  const link = new PlcDebugLink({ ops, mapFile });
  link.attach(proc);
  const r = await link.read();
  assert.equal(link.md5ok, true);
  assert.equal(r.tick, 7);
  assert.equal(r.values.MARCHA, true);
  assert.equal(r.values.CUENTA, -3);
  assert.equal(r.values["T1.ET"], "1s500ms");
});
