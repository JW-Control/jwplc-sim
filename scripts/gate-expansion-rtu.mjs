#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_EXPANSION_RTU: protocolo de expansión v2 (JWPLC_Expansion,
// alpha.16) con dos PLC en el bus RS-485 (app/lib/rs485-bus.mjs).
//   alta         el esclavo de fábrica responde en el ID 247 (estado 5); el
//                comando 5 lo pasa al ID 5 configurado y vinculado; la
//                clave errónea da resultado 1 sin cambiar nada
//   estado_seguro  con Q2+Q3 escritas y el maestro callado 1,5 s, las
//                salidas quedan en Q1 ON, Q2 mantenida, Q3 OFF (0x03)
//   persistencia el esclavo reiniciado con la misma FRAM vuelve en el ID 5
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { Rs485Bus } from "../app/lib/rs485-bus.mjs";
import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "expansion", `rtu-${target}`);
rmSync(work, { recursive: true, force: true });
const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const exes = {
  master: await build(join(ROOT, "tests", "sketches", "exp_rtu_master")),
  slave: await build(join(libs, "JWPLC_Expansion", "examples", "Expansion_Esclavo_Basic")),
};
const node = (bus, name, exe, dir) => {
  mkdirSync(dir, { recursive: true });
  return exe.endsWith(".exe") && process.platform !== "win32"
    ? bus.addNode(name, exe, ["--state", `Z:${dir.replaceAll("/", "\\")}`], { env: { WINEDEBUG: "-all" }, launcher: WINE })
    : bus.addNode(name, exe, ["--state", dir]);
};

// Los estados de cada nodo quedan en work/<nombre>: la segunda vuelta reusa la FRAM del esclavo.
async function run(ms) {
  const bus = new Rs485Bus({ baud: 115200, quantumNs: 1_000_000 });
  const m = node(bus, "maestro", exes.master, join(work, "maestro"));
  node(bus, "esclavo", exes.slave, join(work, "esclavo"));
  await bus.runUntil(ms * 1e6, { realtime: false });
  await bus.stop();
  return m.console.split(/\r?\n/).filter((l) => l.startsWith("M "));
}

const criteria = {};
const a = await run(6000);
const has = (re) => a.some((l) => re.test(l));
criteria.alta = {
  pass:
    has(/^M ident id=247 magic=4A57504C prot=2 io=0808 caps=0073 status=5\/247$/) &&
    has(/^M save OK$/) &&
    a.filter((l) => l === "M ident id=247 FAIL").length === 1 &&
    has(/^M ident id=5 magic=4A57504C prot=2 io=0808 caps=0073 status=1\/5$/) &&
    has(/^M hr id=5 res=0 safe=01 hold=02 wd=10 flags=3 link=12345678$/) &&
    has(/^M hr id=5 res=1 safe=01 hold=02 wd=10 flags=3 link=12345678$/),
  lineas: a.filter((l) => /ident|save|hr/.test(l)),
};
criteria.estado_seguro = {
  pass: has(/^M activo coils=06$/) && has(/^M seguro coils=03$/),
  lineas: a.filter((l) => /activo|seguro/.test(l)),
};
const b = await run(2500);
criteria.persistencia = {
  pass: b.includes("M ident id=247 FAIL") && b.some((l) => /^M ident id=5 .*status=1\/5$/.test(l)),
  lineas: b.filter((l) => /ident/.test(l)),
};

const pass = printCriteria("JWSIM_EXPANSION_RTU", criteria, ` (${target})`);
writeReport(`JWSIM_EXPANSION_RTU-${target}`, { gate: "JWSIM_EXPANSION_RTU", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
