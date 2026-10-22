#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnóstico de caídas del runner (G4 en Windows nativo): corre bajo gdb
// los casos que terminaban con 0xC0000005 en CI e imprime la pila del hilo
// que falla. Uso: node scripts/diag-windows-crash.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";

const tc = toolchain();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "diag-crash");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const build = async (dir) => (await buildSketch(dir, { log: () => {} })).exe;

function underGdb(title, exe, args) {
  console.log(`\n===== ${title}\n${exe} ${args.join(" ")}`);
  const r = spawnSync(
    tc.gdb,
    ["-batch", "-nx", "-ex", "set pagination off", "-ex", "set print thread-events off", "-ex", "run", "-ex", "info threads", "-ex", "bt 30", "-ex", "x/4i $pc", "-ex", "info registers", "--args", exe, ...args],
    { encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024 },
  );
  const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.split(/\r?\n/);
  const sig = text.findIndex((l) => /received signal|exited with code|exited normally/.test(l));
  console.log(text.slice(Math.max(0, sig - 5)).filter((l) => !/^\[New Thread|^\[Thread .* exited/.test(l)).slice(0, 120).join("\n"));
}

// 1) esp_restart en la CLI (g4_restart con su .stim).
{
  const exe = await build(join(ROOT, "tests", "sketches", "g4_hal_extras", "g4_restart"));
  underGdb("g4_restart hasta antes del primer reinicio", exe, ["--until", "1400", "--quiet"]);
  const st = join(work, "restart");
  mkdirSync(st, { recursive: true });
  underGdb("g4_restart con reinicio.stim", exe, ["--until", "6000", "--quiet", "--stim", join(ROOT, "tests", "hal_extras", "reinicio.stim"), "--state", st]);
}

// 2) Esclavo Modbus RTU 3 solo (en el bus terminaba).
{
  const exe = await build(join(ROOT, "tests", "sketches", "g4_rtu_slave3"));
  underGdb("g4_rtu_slave3", exe, ["--until", "3000", "--quiet"]);
  const stim = join(work, "slave3.stim");
  // Pedido FC03 al esclavo 3 por UART2: 03 03 00 00 00 04 + CRC.
  writeFileSync(stim, '1500 uart2 "\\x03\\x03\\x00\\x00\\x00\\x04\\x45\\xEB"\n');
  underGdb("g4_rtu_slave3 con un pedido por UART2", exe, ["--until", "3000", "--quiet", "--stim", stim]);
}

// 3) JWPLC_LogicRuntime FRAM_Boot: el 2.º arranque ejecuta el programa de la FRAM.
{
  const exe = await build(join(libs, "JWPLC_LogicRuntime", "examples", "JWPLC_LogicRuntime_FRAM_Boot"));
  const st = join(work, "fram_boot");
  mkdirSync(st, { recursive: true });
  const s1 = join(work, "fb1.stim");
  const s2 = join(work, "fb2.stim");
  writeFileSync(s1, '6000 uart0 "START\\n"\n');
  writeFileSync(s2, '2000 I0_0=1\n5000 I0_0=0\n6000 uart0 "RESTORE\\n"\n');
  underGdb("FRAM_Boot arranque 1", exe, ["--until", "9000", "--quiet", "--stim", s1, "--state", st]);
  underGdb("FRAM_Boot arranque 2", exe, ["--until", "9000", "--quiet", "--stim", s2, "--state", st]);
}
