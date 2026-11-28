// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Usuario del panel web del calificador (scene/web-user.mjs): reclama con el
// código de la consola, mira /api/vivo y anota lo que ve como «WEB.<id>».
//   cd app && node --test tests/web-user.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseHttp, WebUser } from "../../scene/web-user.mjs";

const http = (status, json, cookie) =>
  Buffer.from(`HTTP/1.1 ${status} X\r\nContent-Type: application/json\r\n${cookie ? `Set-Cookie: jw=${cookie}; Path=/; HttpOnly\r\n` : ""}Connection: close\r\n\r\n${JSON.stringify(json)}`);

test("parseHttp: estado, cookie y JSON", () => {
  const r = parseHttp(http(200, { ok: true }, "abc123"));
  assert.equal(r?.status, 200);
  assert.equal(r?.cookie, "abc123");
  assert.deepEqual(r?.json, { ok: true });
  assert.equal(parseHttp(Buffer.from("HTTP/1.1 200 OK\r\n")), null);
});

test("reclama con el código, mira el panel y escribe", () => {
  const seen = [];
  const w = new WebUser({ record: (k, v) => seen.push([k, v]) });
  assert.equal(w.next(0n), null, "sin código no reclama");
  w.onSerial("[JWPLC_Web] Primer ingreso: abrir el panel y escribir el codigo 123456\n");
  const claim = w.next(0n);
  assert.equal(claim?.path, "/api/reclamar");
  const body = w.bytes(claim).toString();
  assert.match(body, /^POST \/api\/reclamar HTTP\/1\.1\r\n/);
  assert.match(body, /X-JW: 1/);
  assert.match(body, /c=123456&u=profe&s=[0-9a-f]{32}&k=[0-9a-f]{64}$/);
  w.done([...http(200, { ok: true }, "s1")], claim, 1n);
  assert.deepEqual(seen.at(-1), ["WEB.sesion", 1]);

  const live = w.next(2n);
  assert.equal(live?.path, "/api/vivo");
  assert.match(w.bytes(live).toString(), /Cookie: jw=s1/);
  w.done([...http(200, { v: { cajas: 3, banda: true }, a: { atasco: { activa: true, reconocida: false } } })], live, 3n);
  assert.deepEqual(Object.fromEntries(seen), { "WEB.sesion": 1, "WEB.cajas": 3, "WEB.banda": 1, "WEB.alarma.atasco": 1, "WEB.reconocida.atasco": 0 });

  w.act("write", { id: "meta", value: 5 });
  const wr = w.next(4n);
  assert.match(w.bytes(wr).toString(), /id=meta&v=5$/);
  w.done([...http(400, { error: "fuera de rango" })], wr, 5n);
  assert.deepEqual(seen.at(-1), ["WEB.respuesta", 400]);
  assert.throws(() => w.act("borrar", { id: "x" }), /acción desconocida/);
});
