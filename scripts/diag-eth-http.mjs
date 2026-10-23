#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ejemplos HTTP de JWPLC_Ethernet contra un servidor HTTP local, a través de
// la red del host (app/lib/net-bridge.mjs): DHCP del puente, DNS de
// example.com resuelto a una IP fija y el puerto 80 llevado a un servidor en
// 127.0.0.1 que responde como example.com. Sirve para verificar en el
// simulador que DNS + connect + GET llegan a "HTTP 200" (hallazgo H15).
//
// Uso: node scripts/diag-eth-http.mjs [--package <dir de platform-jwplc>]
import dns from "node:dns";
import http from "node:http";
import { join } from "node:path";

import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { packageFromDir, resolvePackageRoot } from "./fetch-package.mjs";

const argv = process.argv.slice(2);
const pkgDir = argv.includes("--package") ? argv[argv.indexOf("--package") + 1] : null;
const pkg = pkgDir ? packageFromDir(pkgDir) : resolvePackageRoot();
const examples = join(pkg.root, pkg.lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_Ethernet", "examples");
const FAKE_IP = "93.184.215.14";

// example.com → FAKE_IP (sin depender del DNS del host) y FAKE_IP:80 → servidor local.
const realLookup = dns.lookup;
dns.lookup = (name, opts, cb) => (name === "example.com" ? cb(null, FAKE_IP, 4) : realLookup(name, opts, cb));
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html", Connection: "close" });
  res.end("<!doctype html><html><head><title>Example Domain</title></head><body><h1>Example Domain</h1></body></html>\n");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const localPort = server.address().port;

async function run(name, { pressAt, doneWhen, untilMs }) {
  const { exe } = await buildSketch(join(examples, name), { package: pkg, log: () => {} });
  const bridge = new NetBridge({ hosts: { [FAKE_IP]: "127.0.0.1" }, connectPort: (ip, p) => (ip === FAKE_IP && p === 80 ? localPort : p) });
  const proc = new RunnerProcess();
  const lines = [];
  let partial = "";
  let finish;
  const done = new Promise((r) => (finish = r));
  let pressed = false;
  proc.on("message", (m) => {
    if (m.type === "reached") finish("fin del tiempo");
    if (m.type !== "serial" || m.port !== 0) return;
    const parts = (partial + m.text).split(/\r?\n/);
    partial = parts.pop();
    for (const l of parts) {
      lines.push(l);
      if (!pressed && pressAt?.test(l)) {
        pressed = true;
        proc.send({ type: "set", signal: "BTN_OK", value: 1 });
        setTimeout(() => proc.send({ type: "set", signal: "BTN_OK", value: 0 }), 200);
      }
      if (doneWhen.test(l)) finish(l);
    }
  });
  proc.start(exe, []);
  bridge.attach(proc);
  proc.send({ type: "run", speed: 1, until_ns: untilMs * 1e6 });
  const end = await done;
  proc.stop();
  bridge.close();
  return { name, end, http: lines.filter((l) => /HTTP|DNS|Example|GET|TCP/i.test(l)).slice(0, 12) };
}

const results = [];
results.push(await run("Ethernet_HTTP_TFT_Diagnostics", { pressAt: /192\.168\.250\.10/, doneWhen: /HTTP \d+ (OK|ERROR)|FALLO|SIN RESPUESTA/, untilMs: 30000 }));
results.push(await run("Ethernet_Continuous_Stress_TFT", { doneWhen: /HTTP OK|STRESS_OK|test #\d+ OK|ERROR|FALLO|fallo/i, untilMs: 25000 }));
server.close();
for (const r of results) {
  console.log(`== ${r.name}\n   fin: ${r.end}`);
  for (const l of r.http) console.log(`   ${l}`);
}
