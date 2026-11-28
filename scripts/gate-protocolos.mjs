#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_PROTOCOLOS: librerías de comunicación de alpha.19 (JWPLC_NTP, JWPLC_MQTT,
// JWPLC_HTTP, JWPLC_MDNS) sobre el W5500 simulado y app/lib/net-bridge.mjs, con servidores
// locales en lugar de los de Internet (la red virtual del PLC ve el host como 192.168.250.1).
//
//   ntp       01.NTP_Hora (servidor .1) pone la hora de un servidor SNTP local y la imprime
//   mqtt      01.MQTT_Publicar_Recibir contra un broker local: CONNECT con último deseo,
//             «online» retenido, SUBSCRIBE a la orden, orden ON recibida y bomba en marcha
//             (marcha=1 retenido), y vuelve a conectar solo cuando el broker regresa
//   http      01.HTTP_Aviso_Webhook manda el POST JSON y recibe 200
//   https     02.HTTPS_Consultar_API (URL a .1, respuesta chunked con objetos anidados) lee
//             temperatura y lluvia de "current"
//   mdns      01.MDNS_Nombre_En_La_Red anuncia planta1.local en 224.0.0.251:5353 y contesta
//             a una consulta A con la IP del PLC
import { createSocket } from "node:dgram";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";
import { MiniBroker } from "./lib/mqtt-broker.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const criteria = {};

const freePort = () =>
  new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });

// Copia de un ejemplo con reemplazos de texto (servidor local en lugar del de Internet).
function exampleCopy(lib, name, replace = []) {
  const src = join(libs, lib, "examples", name);
  const dir = join(mkdtempSync(join(tmpdir(), "jwsim-proto-")), name);
  cpSync(src, dir, { recursive: true });
  const ino = join(dir, `${name}.ino`);
  let text = readFileSync(ino, "utf8");
  for (const [a, b] of replace) {
    if (!text.includes(a)) throw new Error(`${name}: no se encontró «${a}»`);
    text = text.replace(a, b);
  }
  writeFileSync(ino, text);
  return dir;
}

async function build(dir) {
  const { exe } = await buildSketch(dir, { target, log: () => {} });
  return exe;
}

function start(exe, { ports = {}, args = [] } = {}) {
  const wine = exe.endsWith(".exe") && process.platform !== "win32";
  const bridge = new NetBridge({ connectPort: (_ip, p) => ports[p] ?? p });
  const proc = new RunnerProcess();
  const out = [];
  let consoleText = "";
  proc.on("message", (m) => {
    if (m.type === "serial" && m.port === 0) consoleText += m.text;
    if (m.type === "net") out.push(m);
  });
  proc.start(exe, ["--eth", ...args], { env: { WINEDEBUG: "-all" }, launcher: wine ? WINE : undefined });
  bridge.attach(proc);
  proc.send({ type: "run", speed: 1 });
  return {
    bridge,
    proc,
    out,
    get console() {
      return consoleText;
    },
    async stop() {
      proc.send({ type: "quit" });
      await sleep(500);
      proc.stop();
      bridge.close();
    },
  };
}

async function waitFor(fn, ms) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

// ------------------------------------------------------------ NTP
{
  const port = await freePort();
  const srv = createSocket("udp4");
  let queries = 0;
  srv.on("message", (m, r) => {
    if (m.length < 48 || (m[0] & 7) !== 3) return;
    queries++;
    const b = Buffer.alloc(48);
    b[0] = 0x24; // LI 0, versión 4, modo 4 (servidor)
    b[1] = 2;
    b.writeUInt32BE(Math.floor(Date.UTC(2026, 10, 28, 23, 30, 5) / 1000) + 2208988800, 40);
    srv.send(b, r.port, r.address);
  });
  await new Promise((r) => srv.bind(port, "127.0.0.1", r));
  const exe = await build(exampleCopy("JWPLC_NTP", "01.NTP_Hora", [["JWPLC_NTP.begin(ZONA_HORARIA);", 'JWPLC_NTP.begin(ZONA_HORARIA, "192.168.250.1");']]));
  const sim = start(exe, { ports: { 123: port } });
  try {
    const line = await waitFor(() => /28\/11\/2026 18:3\d:\d\d EN HORA/.exec(sim.console)?.[0], 30000);
    criteria.ntp = { pass: !!line && queries >= 1, linea: line, consultas: queries };
  } finally {
    await sim.stop();
    srv.close();
  }
}

// ------------------------------------------------------------ MQTT
{
  let broker = new MiniBroker();
  const port = await broker.listen(0);
  const exe = await build(exampleCopy("JWPLC_MQTT", "01.MQTT_Publicar_Recibir"));
  const sim = start(exe, { ports: { 1883: port } });
  try {
    const sub = await waitFor(() => broker.log.find((e) => e.kind === "subscribe"), 30000);
    const conn = broker.log.find((e) => e.kind === "connect");
    const online = broker.log.find((e) => e.kind === "publish" && e.topic === "jwplc/bomba/estado" && e.msg === "online" && e.retain);
    broker.publish("jwplc/bomba/orden", "ON");
    const order = await waitFor(() => sim.console.includes("Orden recibida: jwplc/bomba/orden = ON"), 8000);
    const marcha = await waitFor(() => broker.log.find((e) => e.kind === "publish" && e.topic === "jwplc/bomba/marcha" && e.msg === "1" && e.retain), 8000);
    criteria.mqtt = {
      pass: !!conn?.will && conn.will.topic === "jwplc/bomba/estado" && conn.will.msg === "offline" && !!online && sub?.filter === "jwplc/bomba/orden" && !!order && !!marcha,
      cliente: conn?.id,
      keepalive: conn?.keepAlive,
      suscripcion: sub?.filter,
    };
    // El broker se cae y vuelve en el mismo puerto: el PLC reconecta solo.
    await broker.close();
    await sleep(3000);
    broker = new MiniBroker();
    await broker.listen(port);
    const again = await waitFor(() => broker.log.find((e) => e.kind === "subscribe"), 40000);
    criteria.mqtt_reconecta = { pass: !!again, reconecto: !!again };
  } finally {
    await sim.stop();
    await broker.close();
  }
}

// ------------------------------------------------------------ HTTP / HTTPS
{
  const reqs = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      reqs.push({ method: req.method, url: req.url, type: req.headers["content-type"] ?? "", body });
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url.startsWith("/v1/forecast")) {
        // Sin Content-Length: Node responde chunked. "current_units" va antes que "current",
        // como en Open-Meteo, para probar la ruta con punto.
        res.write('{"latitude":-12.0,"current_units":{"time":"iso8601","temperature_2m":"°C","rain":"mm"},');
        res.end('"current":{"time":"2026-11-28T11:45","temperature_2m":21.4,"rain":0.3}}');
      } else res.end('{"ok":true}');
    });
  });
  const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  try {
    const exe1 = await build(exampleCopy("JWPLC_HTTP", "01.HTTP_Aviso_Webhook"));
    const sim1 = start(exe1, { ports: { 1880: port } });
    try {
      const ok = await waitFor(() => sim1.console.includes("Aviso enviado: HTTP 200"), 30000);
      const post = reqs.find((r) => r.method === "POST" && r.url === "/alarma");
      let json = null;
      try {
        json = JSON.parse(post?.body ?? "");
      } catch {}
      criteria.http = { pass: !!ok && !!json && post.type.startsWith("application/json"), cuerpo: post?.body };
    } finally {
      await sim1.stop();
    }
    const exe2 = await build(
      exampleCopy("JWPLC_HTTP", "02.HTTPS_Consultar_API", [["https://api.open-meteo.com/v1/forecast", "http://192.168.250.1:1880/v1/forecast"]]),
    );
    const sim2 = start(exe2, { ports: { 1880: port } });
    try {
      const line = await waitFor(() => /Lima: 21\.4 °C, lluvia 0\.3 mm/.exec(sim2.console)?.[0], 30000);
      criteria.https = { pass: !!line, linea: line, nota: "la parte TLS la cubre JWSIM_TLS; aquí se prueba chunked y JSON anidado" };
    } finally {
      await sim2.stop();
    }
  } finally {
    server.close();
  }
}

// ------------------------------------------------------------ mDNS
{
  const exe = await build(exampleCopy("JWPLC_MDNS", "01.MDNS_Nombre_En_La_Red"));
  const sim = start(exe);
  try {
    const open = await waitFor(() => sim.out.find((m) => m.op === "udp_open" && m.port === 5353), 30000);
    const announce = await waitFor(() => sim.out.find((m) => m.op === "sendto" && m.ip === "224.0.0.251" && m.port === 5353), 8000);
    // Consulta «heredada» (puerto de origen distinto de 5353): respuesta unicast con el mismo id.
    const q = "123400000001000000000000" + "07706c616e74613105" + "6c6f63616c00" + "00010001";
    sim.proc.send({ type: "net_in", op: "udp", s: open?.s, ip: "192.168.250.1", port: 40000, hex: q });
    const reply = await waitFor(() => sim.out.find((m) => m.op === "sendto" && m.ip === "192.168.250.1" && m.port === 40000), 8000);
    const hex = reply?.hex ?? "";
    const count = await waitFor(() => /mDNS: [1-9]\d* consultas/.test(sim.console), 35000);
    criteria.mdns = {
      pass: !!announce && announce.hex.includes("c0a8fa0a") && hex.startsWith("1234") && hex.endsWith("c0a8fa0a") && sim.console.includes("http://planta1.local") && !!count,
      anuncio: !!announce,
      respuesta: hex.slice(0, 24),
    };
  } finally {
    await sim.stop();
  }
}

const pass = printCriteria("JWSIM_PROTOCOLOS", criteria);
writeReport("JWSIM_PROTOCOLOS", { gate: "JWSIM_PROTOCOLOS", target, pass, criteria });
process.exit(pass ? 0 : 1);
