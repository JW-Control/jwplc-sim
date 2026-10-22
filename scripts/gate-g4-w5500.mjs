#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_W5500_MODEL: modelo del W5500 por registros y sus sockets
// llevados a la red del host (app/lib/net-bridge.mjs).
//   modelo        tests del modelo (tests/models/w5500_test.cpp)
//   sin_chip      sin --eth la placa no tiene W5500: el runtime lo informa
//                 y el resto del firmware sigue igual
//   dhcp          01.Ethernet_DHCP_Basic con el puente: el DHCP de la red
//                 virtual entrega 192.168.250.10 y el runtime queda listo
//   ip_fija       02.Ethernet_StaticIP_Basic: 192.168.1.50 y gw 192.168.1.1
//   cable         ETH_CABLE = 0 → enlace caído; al reconectar vuelve a estar listo
//   cliente_tcp   tests/sketches/g4_eth_http: GET a un servidor HTTP del host
//                 (puerta de enlace 192.168.250.1) y lectura de la respuesta
//   reproduccion  la sesión de cliente_tcp (entradas "net" grabadas) se
//                 reproduce por la CLI sin red con el mismo hash
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, printCriteria, runExe, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";
import { spawnSync } from "node:child_process";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "g4", `w5500-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const winPath = (p) => `Z:${p.replaceAll("/", "\\")}`;
const wine = (exe) => exe.endsWith(".exe") && process.platform !== "win32";

// Un runner en modo interactivo con el W5500 y (opcional) el puente.
// Corre a velocidad real (la red del host va a la par del reloj) hasta
// `untilMs` o hasta que una línea de la consola cumpla `doneWhen`; en ese
// caso se pausa y se toma el hash en ese instante.
async function session(exe, { bridge, untilMs, doneWhen, onLine } = {}) {
  const proc = new RunnerProcess();
  const lines = [];
  const inputs = [];
  let partial = "";
  let finish;
  const finished = new Promise((r) => (finish = r));
  proc.on("message", (m) => {
    if (m.type === "reached" || m.type === "hash") finish(m);
    if (m.type === "serial" && m.port === 0) {
      const parts = (partial + m.text).split(/\r?\n/);
      partial = parts.pop();
      for (const l of parts) {
        lines.push({ t: m.t_ns / 1e6, l });
        onLine?.(l, proc);
        if (typeof doneWhen === "function" ? doneWhen(l) : doneWhen?.test(l)) {
          proc.send({ type: "pause" });
          proc.send({ type: "hash" });
        }
      }
    } else if (m.type === "input") inputs.push(`${(m.t_ns / 1e6).toFixed(6)} ${m.stim}`);
  });
  proc.start(exe, ["--eth"], { env: { WINEDEBUG: "-all" }, launcher: wine(exe) ? WINE : undefined });
  if (bridge) bridge.attach(proc);
  proc.send({ type: "run", speed: 1, until_ns: untilMs * 1e6 });
  const r = await finished;
  const hash = r.trace_hash;
  proc.stop();
  await new Promise((res) => proc.once("exit", res));
  bridge?.close();
  return { lines, inputs, hash, t_ns: r.t_ns };
}

const criteria = {};

// ---- modelo
{
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "test-models.mjs"), "--target", target, "--only", "w5500"], { encoding: "utf8" });
  const m = r.stdout.match(/W5500: (\d+) tests, (\d+) con fallas/);
  criteria.modelo = { pass: !!m && m[2] === "0", resumen: m?.[0] ?? r.stdout.slice(-300) };
}

// ---- sin chip (placa por defecto)
{
  const exe = await build(join(libs, "JWPLC_Ethernet", "examples", "01.Ethernet_DHCP_Basic"));
  const r = runExe(exe, ["--until", "4000"]);
  const status = r.stdout.split(/\r?\n/).map((l) => l.match(/UART0 (ready=.*)/)?.[1]).filter(Boolean).at(-1) ?? "";
  criteria.sin_chip = { pass: /ready=0 .*status=No Ethernet hardware/.test(status) && r.status === 0, ultima: status };
}

// ---- DHCP con la red virtual
{
  const exe = await build(join(libs, "JWPLC_Ethernet", "examples", "01.Ethernet_DHCP_Basic"));
  const bridge = new NetBridge();
  const s = await session(exe, { bridge, untilMs: 30000, doneWhen: /ready=1/ });
  const ready = s.lines.find((x) => /ready=1 .*ip=192\.168\.250\.10/.test(x.l));
  const dhcp = bridge.log.filter((e) => e.op === "sendto" && e.port === 67).length;
  criteria.dhcp = { pass: !!ready, listo_en_ms: ready?.t, linea: ready?.l, pedidos_dhcp: dhcp, ultima: s.lines.at(-1)?.l };
}

// ---- IP fija
{
  const exe = await build(join(libs, "JWPLC_Ethernet", "examples", "02.Ethernet_StaticIP_Basic"));
  const s = await session(exe, { bridge: new NetBridge(), untilMs: 30000, doneWhen: /ready=1/ });
  const ready = s.lines.find((x) => /ready=1 ip=192\.168\.1\.50 gw=192\.168\.1\.1/.test(x.l));
  criteria.ip_fija = { pass: !!ready, listo_en_ms: ready?.t, ultima: s.lines.at(-1)?.l };
}

// ---- cable
{
  const exe = await build(join(libs, "JWPLC_Ethernet", "examples", "02.Ethernet_StaticIP_Basic"));
  let phase = 0;
  const seen = [];
  const s = await session(exe, {
    bridge: new NetBridge(),
    untilMs: 60000,
    doneWhen: () => phase === 3,
    onLine: (l, proc) => {
      if (phase === 0 && /ready=1/.test(l)) {
        phase = 1;
        proc.send({ type: "set", signal: "ETH_CABLE", value: 0 });
      } else if (phase === 1 && /ready=0/.test(l)) {
        phase = 2;
        seen.push(l);
        proc.send({ type: "set", signal: "ETH_CABLE", value: 1 });
      } else if (phase === 2 && /ready=1/.test(l)) {
        phase = 3;
        seen.push(l);
      }
    },
  });
  criteria.cable = { pass: phase === 3, fases: phase, lineas: seen, grabacion: s.inputs.filter((i) => /ETH_CABLE/.test(i)) };
}

// ---- cliente TCP contra el host
let recorded = null;
{
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain", Connection: "close" });
    res.end(`hola ${req.method} ${req.url}`);
  });
  await new Promise((r) => server.listen(18080, "127.0.0.1", r));
  const exe = await build(join(ROOT, "tests", "sketches", "g4_eth_http"));
  const s = await session(exe, { bridge: new NetBridge(), untilMs: 40000, doneWhen: /^BODY / });
  server.close();
  const body = s.lines.find((x) => /^BODY hola GET \/jwplc$/.test(x.l));
  const status = s.lines.find((x) => /^STATUS HTTP\/1\.1 200 OK$/.test(x.l));
  criteria.cliente_tcp = { pass: !!body && !!status, estado: status?.l, cuerpo: body?.l, en_ms: body?.t, hash: s.hash };
  recorded = { exe, s };
}

// ---- reproducción sin red de la sesión grabada
{
  const { exe, s } = recorded;
  const stim = join(work, "cliente_tcp.stim");
  writeFileSync(stim, s.inputs.join("\n") + "\n");
  const r = runExe(exe, ["--eth", "--stim", wine(exe) ? winPath(stim) : stim, "--until", String(s.t_ns / 1e6), "--quiet"]);
  const res = parseResult(r.stdout);
  criteria.reproduccion = { pass: res?.trace_hash === s.hash, entradas_net: s.inputs.filter((i) => / net /.test(i)).length, hash_sesion: s.hash, hash_reproduccion: res?.trace_hash };
}

const pass = printCriteria("JWSIM_G4_W5500_MODEL", criteria, ` (${target})`);
writeReport(`JWSIM_G4_W5500_MODEL-${target}`, { gate: "JWSIM_G4_W5500_MODEL", target, package: lock.JWPLC_PACKAGE_REF, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
