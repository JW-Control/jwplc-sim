#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_SD_DATALOG: microSD en modo SPI sobre una imagen FAT32, con
// sd_diskio, FatFs y VFS reales del package/ESP-IDF sin modificar.
//   modelo        tests/models/sdcard_test.cpp (una prueba por fila del MODEL.md)
//   ejemplos      05.microSD_Basic (dos arranques), JW_SD CardInfo y
//                 BasicReadWrite, SD_Test de la librería SD
//   vfs           tests/sketches/g4_sd_vfs: stdio/stat/dirent de ESP-IDF
//                 sobre "/sd" y aislamiento del disco de la PC
//   datalog       tests/sketches/g4_sd_datalog (JWPLCDataLog): CSV cada
//                 100 ms con la hora del RTC; se quita la tarjeta 0,8 s y se
//                 vuelve a poner (detección por GPIO39): no se pierden líneas
//   imagen        cada imagen resultante se lee con un lector FAT32
//                 independiente de FatFs (scripts/lib/fat.mjs): contenido,
//                 fechas y consistencia (cadenas, FAT1 = FAT2, FSInfo)
//   imagen_cruda  un sd.img crudo en el directorio de estado se usa y se
//                 actualiza en su lugar
//   determinismo  mismo estado de partida → mismo hash y la misma imagen
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { Fat32, loadSdImage } from "./lib/fat.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "g4", `sd-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const uart = (stdout) => stdout.split(/\r?\n/).map((l) => l.match(/UART0 (.*)$/)?.[1]).filter((l) => l !== undefined);
// Bajo wine, el directorio de estado se pasa como ruta de Windows.
const statePath = (dir) => (target === "windows" && process.platform !== "win32" ? `Z:${dir.replaceAll("/", "\\")}` : dir);
const run = (exe, dir, until, extra = []) => {
  const r = runExe(exe, ["--until", String(until), "--state", statePath(dir), ...extra]);
  return { ...r, lines: uart(r.stdout), result: parseResult(r.stdout) };
};
const image = (dir) => new Fat32(loadSdImage(join(dir, existsSync(join(dir, "sd.img")) ? "sd.img" : "sd.bin")));
const criteria = {};

// ---- modelo
{
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "test-models.mjs"), "--target", target], { encoding: "utf8" });
  const line = r.stdout.split("\n").find((l) => l.startsWith("SDCARD:")) ?? "";
  criteria.modelo = { pass: /16 tests, 0 con fallas/.test(line), resumen: line.trim() };
}

// ---- ejemplos
{
  const out = {};
  {
    const exe = await build(join(libs, "JWPLC_GlobalPeripherals", "examples", "05.microSD_Basic"));
    const st = join(work, "microsd");
    const a = run(exe, st, 3000);
    const b = run(exe, st, 3000);
    const fat = image(st);
    const text = fat.readFile("/taller.txt")?.toString() ?? "";
    const { problems } = fat.check();
    out.microSD_Basic = {
      pass: a.lines.includes("Card present = 1") && a.lines.includes("Ready = 1") && /^(Arranque ms=\d+\r\n)\1$/.test(text) &&
        b.lines.filter((l) => /^Arranque ms=/.test(l)).length === 2 && problems.length === 0,
      archivo: text,
      fsck: problems,
    };
  }
  {
    const exe = await build(join(libs, "JW_SD", "examples", "CardInfo"));
    const r = run(exe, join(work, "cardinfo"), 2500);
    out.CardInfo = { pass: r.lines.includes("Card type: 3") && r.lines.includes("Card size MB: 64"), salida: r.lines.filter(Boolean) };
  }
  {
    const exe = await build(join(libs, "JW_SD", "examples", "BasicReadWrite"));
    const st = join(work, "basicrw");
    const r = run(exe, st, 2500);
    out.BasicReadWrite = {
      pass: r.lines.includes("Hola desde JW_SD") && image(st).readFile("/jw_sd_test.txt")?.toString().includes("Hola desde JW_SD"),
      salida: r.lines.filter(Boolean),
    };
  }
  {
    const exe = await build(join(libs, "SD", "examples", "SD_Test"));
    const st = join(work, "sdtest");
    const r = run(exe, st, 20000);
    const want = ["SD Card Type: SDHC", "SD Card Size: 64MB", "Dir created", "  DIR : mydir", "Dir removed", "File written", "Message appended",
      "Read from file: Hello World!", "File renamed", "Total space: 62MB"];
    const fat = image(st);
    const files = fat.walk();
    const { problems } = fat.check();
    out.SD_Test = {
      pass: want.every((w) => r.lines.includes(w)) && r.lines.some((l) => /^1048576 bytes written for \d+ ms$/.test(l)) &&
        fat.readFile("/foo.txt")?.toString() === "Hello World!\n" && files.get("/test.txt")?.size === 1048576 && !files.has("/mydir") && problems.length === 0,
      escritura_1MiB: r.lines.find((l) => /bytes written/.test(l)),
      archivos: [...files].map(([p, e]) => `${p} ${e.size}`),
      fsck: problems,
    };
  }
  criteria.ejemplos = { pass: Object.values(out).every((c) => c.pass), ...out };
}

// ---- vfs
{
  const exe = await build(join(ROOT, "tests", "sketches", "g4_sd_vfs"));
  const st = join(work, "vfs");
  const r = run(exe, st, 2500);
  const m = r.stdout.match(/SD_VFS: (\d+) PASS, (\d+) FAIL/);
  criteria.vfs = { pass: !!m && Number(m[1]) >= 20 && m[2] === "0" && image(st).check().problems.length === 0, resumen: m?.[0], fallas: r.lines.filter((l) => /^\[FAIL\]/.test(l)) };
}

// ---- datalog (con extracción de la tarjeta)
const datalog = async (name) => {
  const exe = await build(join(ROOT, "tests", "sketches", "g4_sd_datalog"));
  const st = join(work, name);
  const stim = join(work, "datalog.stim");
  writeFileSync(stim, "1500 I0_0=1\n2500 SD_CARD=0\n3300 SD_CARD=1\n4000 I0_1=1\n");
  const r = run(exe, st, 7000, ["--stim", stim, "--rtc", "fijo:2026-10-22T08:30:00"]);
  return { r, st };
};
{
  const { r, st } = await datalog("datalog");
  const reports = r.lines.filter((l) => l.startsWith("t=")).map((l) => Object.fromEntries(l.split(" ").map((kv) => kv.split("=")).map(([k, v]) => [k, Number(v)])));
  const out = r.lines.find((l) => l.startsWith("DATALOG")) ?? "";
  const lines = Number(out.match(/lineas=(\d+)/)?.[1] ?? NaN);
  const last = reports.at(-1) ?? {};
  const removed = reports.find((x) => x.t >= 2500 && x.t < 3300) ?? {};
  const fat = image(st);
  const entry = fat.walk().get("/datalog.csv");
  const csv = (fat.readFile("/datalog.csv")?.toString() ?? "").split("\n").filter(Boolean).map((l) => l.split(","));
  const ms = csv.map((c) => Number(c[0]));
  const wellFormed = csv.every((c) => c.length === 4 && /^\d+$/.test(c[0]) && /^[01]$/.test(c[1]) && /^[01]$/.test(c[2]) && /^08:30:0\d$/.test(c[3]));
  const ordered = ms.every((v, i) => i === 0 || v > ms[i - 1]);
  // I0_0 sube a los 1500 ms e I0_1 a los 4000 (con la latencia del ciclo).
  const levels = csv.every((c) => (Number(c[0]) < 1500 ? c[1] === "0" : Number(c[0]) > 1520 ? c[1] === "1" : true) && (Number(c[0]) < 4000 ? c[2] === "0" : Number(c[0]) > 4020 ? c[2] === "1" : true));
  criteria.datalog = {
    pass: lines === last.aceptadas + 0 && csv.length === lines && wellFormed && ordered && levels && entry?.mtime.startsWith("2026-10-22 08:30") && fat.check().problems.length === 0,
    lineas: lines,
    aceptadas: last.aceptadas,
    commits: last.commits,
    fecha_archivo: entry?.mtime,
    primera: csv[0]?.join(","),
    ultima: csv.at(-1)?.join(","),
  };
  criteria.deteccion = {
    pass: removed.presente === 0 && removed.lista === 0 && last.fallidos > 0 && last.presente === 1 && last.lista === 1 && lines === last.aceptadas,
    sin_tarjeta: removed,
    al_final: last,
  };
  // Determinismo: la misma corrida desde cero da el mismo hash e imagen.
  const again = await datalog("datalog-2");
  criteria.determinismo = {
    pass: again.r.result?.trace_hash === r.result?.trace_hash && readFileSync(join(st, "sd.bin")).equals(readFileSync(join(again.st, "sd.bin"))),
    hash: r.result?.trace_hash,
  };
}

// ---- imagen cruda
{
  const exe = await build(join(libs, "JWPLC_GlobalPeripherals", "examples", "05.microSD_Basic"));
  const st = join(work, "imagen-cruda");
  mkdirSync(st, { recursive: true });
  // La imagen de la corrida de 05.microSD_Basic, como .img crudo.
  const disk = loadSdImage(join(work, "microsd", "sd.bin"));
  const img = Buffer.alloc(disk.sectors * 512);
  for (let lba = 0; lba < disk.sectors; lba++) disk.read(lba).copy(img, lba * 512);
  writeFileSync(join(st, "sd.img"), img);
  run(exe, st, 3000);
  const fat = image(st);
  const text = fat.readFile("/taller.txt")?.toString() ?? "";
  criteria.imagen_cruda = {
    pass: !existsSync(join(st, "sd.bin")) && readFileSync(join(st, "sd.img")).length === img.length && text.split("\r\n").filter(Boolean).length === 3 && fat.check().problems.length === 0,
    lineas: text.split("\r\n").filter(Boolean).length,
  };
}

const pass = printCriteria("JWSIM_G4_SD_DATALOG", criteria, ` (${target})`);
writeReport(`JWSIM_G4_SD_DATALOG-${target}`, { gate: "JWSIM_G4_SD_DATALOG", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
