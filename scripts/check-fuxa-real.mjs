#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba con FUXA real (C4 de JWSIM_G8_OIP_FUXA, parte FUXA): el puente de
// E/S publica la bornera del Basic simulado (sketch tests/sketches/g8_io_bridge,
// Q0_k = I0_k) en 127.0.0.1:5020 y un servidor FUXA instalado aparte se
// conecta como dispositivo ModbusTCP, configurado por su API REST (igual que
// desde el editor). Escribe pulsadores y lee pilotos por las tags de FUXA:
//   COILS     bobina 1 (FUXA numera desde 1 = dirección 0) → I0.0, y la
//             entrada discreta 1 → Q0.0
//   REGISTROS registro holding 1 (dirección 0) con las entradas como bits y
//             holding 2 (dirección 1) con las salidas
// Uso:
//   npm.cmd install @frangoteam/fuxa@1.3.5 modbus-serial@8.0.19   (en una carpeta aparte;
//   modbus-serial es el plugin Modbus de FUXA, el mismo que instala su pantalla de plugins)
//   node scripts/check-fuxa-real.mjs --fuxa <carpeta>/node_modules/@frangoteam/fuxa
// Informe en build/gates/JWSIM_G8_FUXA_REAL.json.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { IoBridge } from "../app/lib/io-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";
import { printCriteria, WINE, writeReport } from "./lib/gate-util.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fuxaSrc = arg("--fuxa");
if (!fuxaSrc) {
  console.error("Falta --fuxa <carpeta de @frangoteam/fuxa>");
  process.exit(2);
}
const BRIDGE_PORT = Number(arg("--port") ?? 5020);
const FUXA_PORT = Number(arg("--fuxa-port") ?? 18810);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = `http://127.0.0.1:${FUXA_PORT}/api`;

// Proyecto y datos de FUXA en una carpeta descartable (--userDir).
const userDir = mkdtempSync(join(tmpdir(), "jwsim-fuxa-"));

const { exe } = await buildSketch(join(ROOT, "tests", "sketches", "g8_io_bridge"), { log: () => {} });
const wine = exe.endsWith(".exe") && process.platform !== "win32";
const proc = new RunnerProcess();
const ready = new Promise((r) => proc.on("message", (m) => m.type === "serial" && /listo/.test(m.text) && r()));
const bridge = new IoBridge({ port: BRIDGE_PORT, owns: () => false });
proc.start(exe, [], { env: { WINEDEBUG: "-all" }, launcher: wine ? WINE : undefined });
bridge.attach(proc);
proc.send({ type: "run", speed: 1 });
await Promise.race([ready, sleep(20000)]);

const fuxa = spawn(process.execPath, ["main.js", "--userDir", userDir], { cwd: resolve(fuxaSrc), env: { ...process.env, PORT: String(FUXA_PORT) }, stdio: ["ignore", "pipe", "pipe"] });
let fuxaLog = "";
fuxa.stdout.on("data", (d) => (fuxaLog += d));
fuxa.stderr.on("data", (d) => (fuxaLog += d));

const call = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {}
    await sleep(100);
  }
  return false;
};
const tag = (id, memaddress, address, type = "Bool") => ({ id, name: id, type, memaddress, address: String(address) });
const value = async (id) => (await call("GET", `/getTagValue?ids=${encodeURIComponent(JSON.stringify([id]))}`))?.[0]?.value;
const set = (id, v) => call("POST", "/setTagValue", { tags: [{ id, value: v }] });

const criteria = {};
let version = "";
try {
  if (!(await until(async () => (await fetch(`${API}/version`)).ok, 30000))) throw new Error("FUXA no arrancó");
  version = JSON.parse(readFileSync(join(resolve(fuxaSrc), "package.json"), "utf8")).version;
  const device = {
    id: "jwsim",
    name: "JWPLC_Sim",
    type: "ModbusTCP",
    enabled: true,
    polling: 200,
    property: { address: `127.0.0.1:${BRIDGE_PORT}`, slaveid: 1, connectionOption: "TcpPort" },
    tags: Object.fromEntries(
      [tag("I0_0", "000000", 1), tag("I0_3", "000000", 4), tag("Q0_0", "100000", 1), tag("Q0_3", "100000", 4),
        tag("Q0_0_bobina", "000000", 17), tag("ENTRADAS", "400000", 1, "UInt16"), tag("SALIDAS", "400000", 2, "UInt16")].map((t) => [t.id, t]),
    ),
  };
  await call("POST", "/projectData", { cmd: "set-device", data: device });

  // ---- Pulsadores (bobinas) y pilotos (entradas discretas)
  {
    const c = { pass: false };
    c.conecta = await until(async () => (await value("Q0_0")) !== null && (await value("Q0_0")) !== undefined, 15000);
    await set("I0_0", true);
    await set("I0_3", true);
    c.q0_0 = await until(async () => String(await value("Q0_0")) === "true" || String(await value("Q0_0")) === "1", 5000);
    c.q0_3 = await until(async () => ["true", "1"].includes(String(await value("Q0_3"))), 5000);
    c.bobina_17 = await until(async () => ["true", "1"].includes(String(await value("Q0_0_bobina"))), 5000);
    await set("I0_0", false);
    c.q0_0_apaga = await until(async () => ["false", "0"].includes(String(await value("Q0_0"))), 5000);
    c.pass = c.conecta && c.q0_0 && c.q0_3 && c.bobina_17 && c.q0_0_apaga;
    criteria.COILS = c;
  }
  // ---- Registros: entradas como bits (escritura) y salidas (lectura)
  {
    const r = { pass: false };
    await set("ENTRADAS", 0b10100101);
    r.salidas = await until(async () => Number(await value("SALIDAS")) === 0b10100101, 5000);
    r.valor = Number(await value("SALIDAS"));
    await set("ENTRADAS", 0);
    r.vuelve = await until(async () => Number(await value("SALIDAS")) === 0, 5000);
    r.pass = r.salidas && r.vuelve;
    criteria.REGISTROS = r;
  }
} catch (err) {
  criteria.ERROR = { pass: false, error: String(err?.message ?? err), fuxa: fuxaLog.split("\n").slice(-15).join("\n") };
} finally {
  fuxa.kill();
  bridge.close();
  proc.stop();
}

const pass = printCriteria("JWSIM_G8_FUXA_REAL", criteria, ` (FUXA ${version})`);
writeReport("JWSIM_G8_FUXA_REAL", { gate: "JWSIM_G8_FUXA_REAL", result: pass ? "PASS" : "FAIL", fuxa: version, criteria });
process.exit(pass ? 0 : 1);
