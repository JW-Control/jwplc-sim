#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_NVS_PREFERENCES: NVS de ESP-IDF persistente en el
// directorio de estado, vista desde Preferences, EEPROM y la API nvs_*.
//   api           tests/sketches/g4_nvs: tipos, longitudes, solo lectura,
//                 borrado, estadísticas y persistencia entre dos arranques
//   core          ejemplos de Preferences y EEPROM del core (sin modificar)
//   logicruntime  los 10 ejemplos de JWPLC_LogicRuntime que respaldan la FRAM
//                 en NVS: cada uno recibe por consola la palabra que pide
//                 (uart0 en el .stim), pasa todas sus verificaciones y deja la
//                 FRAM idéntica byte a byte; los de varios arranques corren
//                 una vez por arranque sobre el mismo estado
//   determinismo  mismo estado de partida → mismo hash
//
// Fallas conocidas del package (KNOWN): ninguna desde alpha.14. Hasta
// alpha.13, Superblock_Redundancy esperaba Unformatted con ambas copias del
// superblock corruptas y la librería devuelve CorruptMetadata (hallazgo H13,
// corregido en el ejemplo).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, parseTimeline, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const libs = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const work = join(ROOT, "build", "gates", "g4", `nvs-${target}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const build = async (dir) => (await buildSketch(dir, { target, log: () => {} })).exe;
const uart = (lines) => lines.map((l) => l.replace(/^UART0 /, "")).join("\n");
const console0 = (stdout) => parseTimeline(stdout).filter((e) => e.kind === "UART" && e.port === 0).map((e) => e.text);
let n = 0;
// Corre con un .stim generado (líneas "T acción") y el estado dado.
const run = (exe, state, until, stim = []) => {
  const args = ["--until", String(until), "--state", state];
  if (stim.length) {
    const f = join(work, `s${n++}.stim`);
    writeFileSync(f, stim.join("\n") + "\n");
    args.push("--stim", f);
  }
  const r = runExe(exe, args);
  return { ...r, lines: console0(r.stdout), result: parseResult(r.stdout) };
};
const criteria = {};

// ---- api
{
  const exe = await build(join(ROOT, "tests", "sketches", "g4_nvs"));
  const state = join(work, "api");
  const boots = [];
  for (let i = 0; i < 2; i++) {
    if (i === 1) cpSync(state, join(work, "api-copia"), { recursive: true });
    const r = run(exe, state, 2000);
    const m = r.stdout.match(/NVS arranque (\d+): (\d+) PASS, (\d+) FAIL/);
    boots.push({ boot: Number(m?.[1]), pass: Number(m?.[2]), fail: m ? Number(m[3]) : null, hash: r.result?.trace_hash, fallas: r.lines.filter((l) => /\[FAIL\]/.test(l)) });
  }
  const again = run(exe, join(work, "api-copia"), 2000);
  criteria.api = {
    pass: boots[0].boot === 1 && boots[1].boot === 2 && boots.every((b) => b.pass > 10 && b.fail === 0),
    arranques: boots.map(({ hash, ...b }) => b),
  };
  criteria.determinismo = { pass: again.result?.trace_hash === boots[1].hash, hash: boots[1].hash };
}

// ---- core: Preferences y EEPROM
{
  const ex = (lib, name) => join(libs, lib, "examples", name);
  const out = {};
  // StartCounter: el contador crece en cada arranque.
  {
    const exe = await build(ex("Preferences", "StartCounter"));
    const st = join(work, "StartCounter");
    const counts = [0, 1, 2].map(() => Number(run(exe, st, 2000).stdout.match(/Current counter value: (\d+)/)?.[1] ?? NaN));
    out.StartCounter = { pass: counts.join() === "1,2,3", contadores: counts };
  }
  {
    const exe = await build(ex("Preferences", "Prefs2Struct"));
    const r = run(exe, join(work, "Prefs2Struct"), 2000);
    // printf("%02X ", char): con char sin signo, como en el ESP32 (H14).
    out.Prefs2Struct = { pass: r.lines.some((l) => /^09 1E EB FF 14 0F 00 01 08 1E 14 15/.test(l)), salida: r.lines.filter(Boolean) };
  }
  {
    const exe = await build(ex("EEPROM", "eeprom_class"));
    const r = run(exe, join(work, "eeprom_class"), 3000);
    const names = r.lines.filter((l) => /^name:/.test(l));
    out.eeprom_class = { pass: names.join("|") === "name: Teo Swee Ann|name: |name: Teo Swee Ann" && r.lines.includes("Done!"), nombres: names };
  }
  {
    const exe = await build(ex("EEPROM", "eeprom_extra"));
    const r = run(exe, join(work, "eeprom_extra"), 2000);
    const want = ["128", "A", "255", "-32768", "65535", "-2147483648", "4294967295", "1234.1234", "I love ESP32.", "Thank You Espressif!"];
    out.eeprom_extra = { pass: want.every((w) => r.lines.includes(w)), salida: r.lines.filter(Boolean) };
  }
  {
    // eeprom_write escribe 64 bytes al azar: el arranque siguiente los lee.
    const exe = await build(ex("EEPROM", "eeprom_write"));
    const st = join(work, "eeprom_write");
    const read = (r) => r.lines[r.lines.findIndex((l) => /bytes read from Flash/.test(l)) + 1]?.trim();
    const written = (r) => r.lines[r.lines.findIndex((l) => /writing random/.test(l)) + 1]?.trim();
    const r1 = run(exe, st, 9000);
    const r2 = run(exe, st, 1000);
    out.eeprom_write = { pass: !!written(r1) && read(r1) === Array(64).fill("255").join(" ") && read(r2) === written(r1), escritos: written(r1), leidos: read(r2) };
  }
  criteria.core = { pass: Object.values(out).every((c) => c.pass), ...out };
}

// ---- logicruntime
{
  // FRAM de partida con un patrón: al terminar debe quedar idéntica.
  const pattern = Buffer.alloc(8192);
  for (let i = 0, x = 0x1234567; i < pattern.length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    pattern[i] = x >>> 24;
  }
  const T = 6000; // después de la pregunta (Metadata_Diagnostic pregunta a los 5,6 s)
  const word = (w) => [`${T} uart0 "${w}\\n"`];
  // Ejemplo → arranques: { stim, ok(líneas, timeline) }.
  /** @type {Record<string, string[]>} */
  const KNOWN = {};
  const summary = (lines, known = []) => {
    const p = lines.filter((l) => /^\[PASS\]/.test(l)).length;
    const fails = lines.filter((l) => /^\[FAIL\]|^FAIL|ABORTADA|FALLO/.test(l));
    return { p, f: fails.filter((l) => !known.includes(l.trim())).length, known: fails.filter((l) => known.includes(l.trim())) };
  };
  const final = (re) => (lines) => lines.some((l) => re.test(l));
  const SINGLE = {
    Storage_API_Reversible: "FORMAT",
    Storage_API_Rollback: "ROLLBACK",
    Storage_API_Startup_Policy: "BOOT",
    Storage_API_Superblock_Redundancy: "SUPERBLOCK",
    Storage_Metadata_Diagnostic: "METADATA",
    Stored_Program_Integration: "RUNTIME",
    Retentive_Runtime_Integration: "RETRUNTIME",
    Retentive_Store_FRAM: "RETENTIVE",
  };
  const plans = Object.fromEntries(Object.entries(SINGLE).map(([k, w]) => [k, [{ stim: word(w), until: 20000 }]]));
  plans.FRAM_Persistent = [
    { stim: word("START"), until: 9000, ok: final(/ETAPA 1 COMPLETA/) },
    { stim: [], until: 3000, ok: final(/ETAPA 2 COMPLETA/) },
    { stim: [], until: 3000, ok: final(/PERSISTENCIA ENTRE REINICIOS: PASS/) },
  ];
  // FRAM_Boot: el 2.º arranque ejecuta el programa instalado en FRAM
  // (I0_0 AND NOT I0_1 → TON 2 s → Q0_0) y luego se le pide RESTORE.
  plans.FRAM_Boot = [
    { stim: word("START"), until: 9000, ok: final(/INSTALACION COMPLETA/) },
    {
      stim: ["2000 I0_0=1", "5000 I0_0=0", "6000 uart0 \"RESTORE\\n\""],
      until: 9000,
      ok: (lines, tl) => {
        const q = tl.filter((e) => e.kind === "DO" && e.name === "Q0_0");
        const on = q.find((e) => e.v === 1);
        return final(/ARRANQUE Y EJECUCION DESDE FRAM: PASS/)(lines) && !!on && on.t >= 3990 && on.t <= 4100 && q.some((e) => e.v === 0 && e.t >= 5000 && e.t < 5100);
      },
    },
  ];
  const out = {};
  for (const [name, boots] of Object.entries(plans)) {
    const full = `JWPLC_LogicRuntime_${name}`;
    const exe = await build(join(libs, "JWPLC_LogicRuntime", "examples", full));
    const st = join(work, full);
    mkdirSync(st, { recursive: true });
    writeFileSync(join(st, "fram.bin"), pattern);
    const res = [];
    for (const b of boots) {
      const r = run(exe, st, b.until, b.stim);
      const known = KNOWN[name] ?? [];
      const s = summary(r.lines, known);
      // Fin con PASS, o con FAIL solo por las fallas conocidas del package.
      const end = known.length ? s.known.length === known.length : final(/: PASS$/)(r.lines);
      const ok = s.f === 0 && r.status === 0 && (b.ok ? b.ok(r.lines, parseTimeline(r.stdout)) : s.p > 0 && end);
      res.push({ ok, pass: s.p, fail: s.f, ...(known.length ? { fallas_conocidas: s.known } : {}), fin: r.lines.filter(Boolean).at(-1) });
    }
    const framSame = readFileSync(join(st, "fram.bin")).equals(pattern);
    out[name] = { pass: res.every((x) => x.ok) && framSame, fram_restaurada: framSame, arranques: res };
  }
  criteria.logicruntime = { pass: Object.values(out).every((c) => c.pass), ...out };
}

const pass = printCriteria("JWSIM_G4_NVS_PREFERENCES", criteria, ` (${target})`);
writeReport(`JWSIM_G4_NVS_PREFERENCES-${target}`, { gate: "JWSIM_G4_NVS_PREFERENCES", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
