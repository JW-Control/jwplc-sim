// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Compilación nativa de un sketch JWPLC para el simulador.
//
// Pasos (equivalentes a arduino-cli, pero con el HAL nativo):
//   1. Resolver el package fijado (package.lock) y las dependencias de terceros.
//   2. Leer la configuración de la placa desde boards.txt del package.
//   3. Preprocesar el .ino (concatenar pestañas + #include <Arduino.h>).
//   4. Descubrir librerías iterativamente: preprocesar cada fuente; ante
//      "No such file" buscar la librería que provee ese header y agregarla.
//   5. Compilar core (según sim/core-manifest.json), librerías, terceros,
//      runtime del simulador y sketch; enlazar un ejecutable nativo.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";
import { fetchAll, readSources, thirdPartyDir } from "../../scripts/fetch-third-party.mjs";
import { addPrototypes } from "./prototypes.mjs";
import { toolchain } from "./toolchain.mjs";
import { resolveWeakPE } from "./weak-pe.mjs";

export const ROOT = resolve(import.meta.dirname, "..", "..");
const SRC_EXT = /\.(c|cpp|cc|S)$/;
// GCC para Windows carga el PCH en una dirección fija; si ASLR ya ocupó esa
// zona del proceso falla ("PCH allocation failure"). Es aleatorio por
// proceso: se reintenta y, si persiste, esa compilación va sin PCH.
const PCH_TRANSIENT = /gt_pch_use_address|PCH allocation failure/;
const PCH_ATTEMPTS = 3;
// Fallas de GCC atribuibles al header precompilado (no a errores del sketch).
const PCH_FAILURE = /one or more PCH files were found|had to relocate PCH|(?:could not|cannot) (?:read|open|map|load)[^\n]*\.gch|\.gch: (?:created by|not used)|precompiled header[^\n]*(?:invalid|corrupt|failed)/i;

// ------------------------------------------------------------ boards.txt
export function readBoard(pkgTree, boardId) {
  const props = {};
  for (const line of readFileSync(join(pkgTree, "boards.txt"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && m[1].startsWith(`${boardId}.`)) props[m[1].slice(boardId.length + 1).trim()] = m[2].trim();
  }
  if (!props.name) throw new Error(`placa '${boardId}' no existe en boards.txt`);
  return props;
}

function splitDefines(text) {
  return (text ?? "").split(/\s+/).filter((t) => t.startsWith("-D") || t.startsWith("-U"));
}

// Opciones del archivo build_opt.h del sketch (una o varias por línea).
export function readBuildOpt(sketchDir) {
  const f = join(sketchDir, "build_opt.h");
  if (!existsSync(f)) return [];
  return (readFileSync(f, "utf8").match(/"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^"(.*)"$/, "$1"));
}

// ------------------------------------------------------------ sketch
export function preprocessSketch(sketchDir, outFile) {
  const name = basename(sketchDir);
  const files = readdirSync(sketchDir).filter((f) => f.endsWith(".ino")).sort();
  const main = `${name}.ino`;
  if (!files.includes(main)) throw new Error(`no existe ${main} en ${sketchDir}`);
  const ordered = [main, ...files.filter((f) => f !== main)];
  // Igual que arduino-cli: Arduino.h primero, #line para mapear errores y
  // prototipos automáticos de las funciones de las pestañas .ino.
  let out = "#include <Arduino.h>\n";
  for (const f of ordered) {
    const abs = resolve(sketchDir, f).replaceAll("\\", "/");
    out += `#line 1 "${abs}"\n${readFileSync(join(sketchDir, f), "utf8")}\n`;
  }
  out = addPrototypes(out);
  mkdirSync(dirname(outFile), { recursive: true });
  // Solo si cambió: conserva la fecha y evita recompilar el sketch.
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== out) writeFileSync(outFile, out);
  const extra = readdirSync(sketchDir)
    .filter((f) => /\.(c|cpp|S)$/.test(f))
    .map((f) => join(sketchDir, f));
  return [outFile, ...extra];
}

// ------------------------------------------------------------ librerías
function listSources(dir, recursive) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive && !["examples", "extras", "test", "tests"].includes(e.name)) out.push(...listSources(p, true));
    } else if (SRC_EXT.test(e.name)) out.push(p);
  }
  return out.sort();
}

function scanLibraries(pkgTree, manifest, thirdParty, extra = []) {
  const libs = [];
  // Librerías indicadas con --library (como en arduino-cli): con src/ se
  // compila src/ entera; sin ella, los fuentes de la raíz (diseño plano).
  // Cada una puede ser una carpeta o { dir, cxxflags, cxxflagsExcept }: banderas
  // C++ propias de sus unidades, salvo los archivos exceptuados (p. ej. el -std=gnu++17 con que el editor OpenPLC
  // precompila OpenPLCUserLib).
  for (const d of extra) {
    const dir = resolve(typeof d === "string" ? d : d.dir);
    const hasSrc = existsSync(join(dir, "src"));
    const srcDir = hasSrc ? join(dir, "src") : dir;
    libs.push({ name: basename(dir), dir, srcDir, sources: listSources(srcDir, hasSrc), includeDirs: [srcDir], origin: "user", cxxflags: d.cxxflags ?? [], cxxflagsExcept: d.cxxflagsExcept ?? [] });
  }
  const libRoot = join(pkgTree, "libraries");
  for (const name of readdirSync(libRoot).sort()) {
    const dir = join(libRoot, name);
    if (!statSync(dir).isDirectory()) continue;
    const hasSrc = existsSync(join(dir, "src"));
    const srcDir = hasSrc ? join(dir, "src") : dir;
    const sources = hasSrc ? listSources(srcDir, true) : [...listSources(dir, false), ...listSources(join(dir, "utility"), false)];
    const includeDirs = hasSrc ? [srcDir] : [dir, join(dir, "utility")].filter(existsSync);
    libs.push({ name, dir, srcDir, sources, includeDirs, origin: "package" });
  }
  for (const [name, spec] of Object.entries(manifest.thirdPartyLibraries ?? {})) {
    const dir = thirdParty[spec.source];
    libs.push({
      name,
      dir,
      srcDir: join(dir, spec.srcDir),
      sources: spec.sources.map((s) => join(dir, s)),
      includeDirs: [join(dir, spec.srcDir)],
      origin: "third-party",
    });
  }
  return libs;
}

function headerIndex(libs) {
  const index = new Map();
  for (const lib of libs) {
    for (const inc of lib.includeDirs) {
      for (const f of readdirSync(inc)) {
        if (!/\.(h|hpp)$/.test(f)) continue;
        const list = index.get(f) ?? [];
        list.push(lib);
        index.set(f, list);
      }
    }
  }
  return index;
}

// Prioridad entre librerías que proveen el mismo header (simplificación de la
// regla de arduino-cli): nombre igual al header > librería JWPLC/JW > otras.
function pickLibrary(header, candidates) {
  const stem = header.replace(/\.(h|hpp)$/, "");
  const score = (l) => (l.name === stem ? 3 : 0) + (/^JW/.test(l.name) ? 1 : 0) + (l.origin === "package" ? 0.5 : 0);
  return [...candidates].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
}

// ------------------------------------------------------------ compilación
function hash(text) {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

// Mensajes de GCC "archivo:línea:columna: error|warning|note: texto". Las
// rutas del .ino llegan tal cual gracias a los #line del preprocesado.
export function parseDiagnostics(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/);
    if (m) out.push({ file: m[1], line: Number(m[2]), column: Number(m[3]), severity: m[4] === "fatal error" ? "error" : m[4], message: m[5] });
  }
  return out;
}

// Notas para identificadores no declarados que son APIs no soportadas.
export function unsupportedApiNotes(diagnostics, table) {
  const notes = [];
  for (const d of diagnostics) {
    if (d.severity !== "error") continue;
    const m = d.message.match(/^'(\w+)' (?:was not declared in this scope|does not name a type|has not been declared)/);
    if (!m) continue;
    const name = m[1];
    const key = Object.keys(table).find((k) => k !== "$comment" && (k.endsWith("*") ? name.startsWith(k.slice(0, -1)) : k === name));
    if (key) notes.push({ ...d, severity: "note", message: `${name} no está soportado por JWPLC Sim: ${table[key]}` });
  }
  return notes;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolvePromise({ code, out }));
  });
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Dependencias de un archivo .d de GCC (formato make). El objetivo termina en
// el primer ":" seguido de espacio: en Windows el ":" de "C:\" no cuenta.
export function parseDepFile(text) {
  const body = text.replace(/\\\r?\n/g, " ");
  const m = body.match(/:(?=\s)/);
  if (!m) return [];
  return body
    .slice(m.index + 1)
    .split(/(?<!\\)\s+/)
    .filter(Boolean)
    .map((d) => d.replace(/\\([ :#])/g, "$1"));
}

// Fecha de modificación (o -1 si no existe), con caché por build: las ~90
// unidades comparten cientos de headers, y en Windows cada consulta al disco
// es cara (un build sin cambios hacía decenas de miles).
function mtimeOf(path, cache) {
  let t = cache?.get(path);
  if (t === undefined) {
    t = statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? -1;
    cache?.set(path, t);
  }
  return t;
}

function upToDate(obj, depFile, cmdHash, stampFile, cache) {
  const objTime = mtimeOf(obj);
  if (objTime < 0 || !existsSync(depFile) || !existsSync(stampFile)) return false;
  if (readFileSync(stampFile, "utf8") !== cmdHash) return false;
  for (const p of parseDepFile(readFileSync(depFile, "utf8"))) {
    const t = mtimeOf(p, cache);
    if (t < 0 || t > objTime) return false;
  }
  return true;
}

// ------------------------------------------------------------ principal
export async function buildSketch(sketchDir, options = {}) {
  const boardId = options.board ?? "jwplcbasic";
  const target = options.target ?? "native";
  const log = options.log ?? ((m) => console.error(m));
  const tc = toolchain(target, options.cc);
  if (!tc.available) {
    throw new Error(
      `no se encontró el compilador ${tc.cxx[0]}. ` +
        (process.platform === "win32"
          ? "Instale el toolchain incluido (node scripts/fetch-toolchain.mjs) o MinGW-w64 GCC (WinLibs) en el PATH."
          : "Instale gcc/g++ (y MinGW-w64 para --target windows)."),
    );
  }

  // options.package: package sin fijar (packageFromDir/fetchPackageRef, G5).
  const { root: pkgRoot, lock } = options.package ?? resolvePackageRoot();
  // Tiempos por fase (JWSIM_BUILD_TIMING=1 u options.timing): duración de
  // cada fase, para diagnosticar recompilaciones lentas.
  const phase = (() => {
    if (!process.env.JWSIM_BUILD_TIMING && !options.timing) return () => {};
    let last = performance.now();
    return (name) => {
      const now = performance.now();
      log(`[tiempo] ${name}: ${Math.round(now - last)} ms`);
      last = now;
    };
  })();
  const phaseNote = process.env.JWSIM_BUILD_TIMING || options.timing ? (m) => log(`[tiempo] ${m}`) : () => {};
  await fetchAll();
  const thirdParty = Object.fromEntries(readSources().packages.map((p) => [p.name, thirdPartyDir(p)]));
  const pkgTree = join(pkgRoot, lock.JWPLC_PACKAGE_TREE);
  const manifest = JSON.parse(readFileSync(join(ROOT, "sim", "core-manifest.json"), "utf8"));
  const board = readBoard(pkgTree, boardId);
  const coreDir = join(pkgTree, "cores", "jwcontrol");
  const variantDir = join(pkgTree, "variants", board["build.variant"]);

  const sketchName = basename(resolve(sketchDir));
  const outDir = resolve(options.outDir ?? join(ROOT, "build", `${sketchName}-${target}`));
  const cacheDir = join(ROOT, "build", "cache", target);
  mkdirSync(outDir, { recursive: true });

  // Coherencia del manifiesto del core contra el árbol del package.
  const coreFiles = listSources(coreDir, true).map((p) => relative(coreDir, p).split(sep).join("/"));
  const classified = new Set([...manifest.compile, ...Object.keys(manifest.replaced), ...Object.keys(manifest.excluded)]);
  const unclassified = coreFiles.filter((f) => !classified.has(f));
  if (unclassified.length && !options.headerProbe) {
    throw new Error(`fuentes del core sin clasificar en sim/core-manifest.json: ${unclassified.join(", ")}`);
  }

  const defines = [
    `-DF_CPU=${board["build.f_cpu"]}`,
    "-DARDUINO=10607",
    `-DARDUINO_${board["build.board"]}`,
    "-DARDUINO_ARCH_ESP32",
    `-DARDUINO_BOARD="${board["build.board"]}"`,
    `-DARDUINO_VARIANT="${board["build.variant"]}"`,
    `-DARDUINO_FQBN="jwcontrol:esp32:${boardId}"`,
    "-DESP32=ESP32",
    "-DCORE_DEBUG_LEVEL=0",
    "-DARDUINO_USB_CDC_ON_BOOT=0",
    ...splitDefines(board["build.defines"]),
    `-DARDUINO_PARTITION_${board["build.partitions"]}`,
    // build_opt.h del sketch (platform.txt: "@{build.opt.path}" en todas las unidades).
    ...readBuildOpt(resolve(sketchDir)),
    "-DJWPLC_LIBRARY_DISCOVERY_PHASE=0",
    "-DJWSIM=1",
    ...(tc.os === "windows" ? ["-D_POSIX_THREAD_SAFE_FUNCTIONS"] : []),
  ];
  // platform.txt pone "-I{build.source.path}" (carpeta original del sketch)
  // en todas las unidades. Si la carpeta no tiene headers, solo puede afectar
  // a las unidades del sketch (#include "../otro/x.ino"); así se conserva la
  // caché de objetos compartida entre sketches.
  const sketchHasHeaders = readdirSync(resolve(sketchDir)).some((f) => /\.(h|hh|hpp|inc)$/i.test(f) && f !== "build_opt.h");
  const sketchOnlyIncludes = sketchHasHeaders ? [] : [resolve(sketchDir)];
  const baseIncludes = [
    ...(sketchHasHeaders ? [resolve(sketchDir)] : []),
    ...(tc.os === "windows" ? [join(ROOT, "sim", "hal", "include-win32")] : []),
    join(ROOT, "sim", "hal", "include"),
    join(ROOT, "sim", "engine", "include"),
    coreDir,
    join(coreDir, "peripherals", "include"),
    variantDir,
    thirdParty["esp-idf-fatfs"],
  ];

  const libs = scanLibraries(pkgTree, manifest, thirdParty, options.libraries ?? []);
  const index = headerIndex(libs);
  const usedLibs = [];
  const includeDirs = [...baseIncludes];

  // El sketch se compila sin optimizar (-O0) para depurarlo con fidelidad
  // (G3: variables y pasos línea a línea). No cambia el comportamiento
  // simulado: el modelo de costos no depende del código generado.
  const sketchRoots = [resolve(sketchDir), join(outDir, "sketch")].map((d) => d + sep);
  const isSketchUnit = (file) => sketchRoots.some((r) => resolve(file).startsWith(r));
  const isSimUnit = (file) => resolve(file).startsWith(join(ROOT, "sim") + sep);
  // El sketch se compila en C++20; el package, en C++23 (gnu++2b, como en la
  // placa). Con libstdc++ 14, <memory> trae <format> en C++23 y cada unidad
  // instancia toda su maquinaria: el .ino tardaba 4 veces más (1,6 s en
  // Windows, G2 EXTERNAL_EDIT_RELOAD). Si el sketch no compila en C++20 se
  // repite en C++23; si así compila, queda marcado (sketch-std.txt) y los
  // builds siguientes van directo en C++23.
  const stdMark = join(outDir, "sketch-std.txt");
  const sketchStd = options.sketchStd ?? (existsSync(stdMark) ? readFileSync(stdMark, "utf8").trim() : "-std=gnu++20");
  const flagsFor = (file) => {
    const norm = file.split(sep).join("/");
    const extra = [];
    for (const o of manifest.flagOverrides ?? []) {
      if (o.os && o.os !== tc.os) continue;
      if (o.match.some((m) => norm.endsWith(m))) extra.push(...o.add.map((a) => a.replaceAll("${ROOT}", ROOT)));
    }
    const isC = file.endsWith(".c");
    const base = isC ? tc.cflags : tc.cxxflags;
    // El motor, el HAL y los modelos (sim/) con -O2: se llaman en cada
    // operación del firmware (semáforos, E/S) y no cambian la traza.
    const sketch = isSketchUnit(file);
    const opt = sketch ? "-O0" : isSimUnit(file) ? "-O2" : "-O1";
    const ownLib = isC ? null : libs.find((l) => l.cxxflags?.length && file.startsWith(l.srcDir + sep));
    const own = ownLib && !ownLib.cxxflagsExcept.includes(basename(file)) ? ownLib.cxxflags : [];
    return [...base.map((f) => (f === "-O1" ? opt : sketch && f === "-std=gnu++2b" ? sketchStd : f)), ...defines, ...extra, ...own];
  };

  phase("package, terceros y placa");
  // Descubrimiento iterativo de librerías.
  const sketchSources = preprocessSketch(resolve(sketchDir), join(outDir, "sketch", `${sketchName}.ino.cpp`));
  const isSketchFile = new Set(sketchSources);
  // Caché del descubrimiento: las librerías usadas dependen solo de las
  // directivas del preprocesador del sketch (el package está fijado), así que
  // un cambio en el cuerpo de loop() no repite el preprocesado de ~90 fuentes.
  const directives = readdirSync(resolve(sketchDir))
    .filter((f) => /\.(ino|h|hh|hpp|c|cpp|cc|S|inc)$/i.test(f) || f === "build_opt.h")
    .sort()
    .map((f) => `${f}\n${readFileSync(join(sketchDir, f), "utf8").split(/\r?\n/).filter((l) => /^\s*#/.test(l)).join("\n")}`);
  const discoveryKey = hash(
    JSON.stringify([lock.JWPLC_PACKAGE_COMMIT, target, tc.cxx, defines, directives, (options.libraries ?? []).map((d) => (typeof d === "string" ? resolve(d) : { ...d, dir: resolve(d.dir) })), readFileSync(join(ROOT, "sim", "core-manifest.json"), "utf8")]),
  );
  const discoveryFile = join(outDir, "discovery.json");
  let cached = null;
  if (existsSync(discoveryFile)) {
    const d = JSON.parse(readFileSync(discoveryFile, "utf8"));
    if (d.key === discoveryKey) cached = d.libraries.map((n) => libs.find((l) => l.name === n));
  }
  const queue = cached ? [] : [...sketchSources];
  for (const lib of cached && !cached.includes(undefined) ? cached : []) {
    usedLibs.push(lib);
    includeDirs.push(...lib.includeDirs);
    log(`[build] librería: ${lib.name}${lib.origin === "third-party" ? " (terceros)" : ""} (caché)`);
  }
  if (cached?.includes(undefined)) queue.push(...sketchSources);
  const seen = new Set();
  const discoveryMissing = [];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (let attempt = 0; attempt < 64; attempt++) {
      const cc = file.endsWith(".c") ? tc.cc : tc.cxx;
      // Salida a archivo (no /dev/null): portable a cualquier compilador y SO.
      const r = spawnSync(cc[0], [...cc.slice(1), "-E", "-o", join(outDir, "discovery.i"), ...flagsFor(file), ...(isSketchFile.has(file) ? sketchOnlyIncludes : []).concat(includeDirs).map((d) => `-I${d}`), file], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const m = (r.stderr ?? "").match(/fatal error: ([^:\s]+): No such file/) ?? (r.stderr ?? "").match(/'([^']+)' file not found/);
      if (!m) break;
      const header = basename(m[1]);
      const candidates = index.get(header);
      if (!candidates) {
        // En el sondeo de paridad se informa y se sigue con el resto.
        if (options.headerProbe) {
          discoveryMissing.push({ header: m[1], file });
          break;
        }
        throw new Error(`${relative(ROOT, file)}: falta '${m[1]}' y ninguna librería del package lo provee.`);
      }
      const lib = pickLibrary(header, candidates);
      const unsupported = manifest.unsupportedLibraries?.[lib.name];
      if (unsupported) {
        throw new Error(`la librería ${lib.name} (requerida por '${m[1]}') no está soportada por JWPLC Sim: ${unsupported}`);
      }
      if (usedLibs.includes(lib)) throw new Error(`no se pudo resolver '${m[1]}' desde ${lib.name}`);
      usedLibs.push(lib);
      includeDirs.push(...lib.includeDirs);
      queue.push(...lib.sources);
      log(`[build] librería: ${lib.name}${lib.origin === "third-party" ? " (terceros)" : ""}`);
    }
  }

  writeFileSync(discoveryFile, JSON.stringify({ key: discoveryKey, libraries: usedLibs.map((l) => l.name) }) + "\n");
  phase(cached && !cached.includes(undefined) ? "descubrimiento (caché)" : "descubrimiento");

  // Sondeo de headers (jwsim-cli parity, G5): preprocesa con -M -MG las
  // fuentes del core que se compilan y las de todas las librerías del package
  // (salvo las no soportadas), con los flags reales, y devuelve los headers
  // que no se encuentran en ningún lado. No compila.
  if (options.headerProbe) {
    const probeIncludes = [...includeDirs];
    for (const lib of libs) for (const d of lib.includeDirs) if (!probeIncludes.includes(d)) probeIncludes.push(d);
    const files = [
      ...[...manifest.compile, ...unclassified].map((f) => ({ owner: "core", file: join(coreDir, f) })),
      ...libs
        .filter((l) => l.origin === "package" && !manifest.unsupportedLibraries?.[l.name])
        .flatMap((l) => l.sources.map((f) => ({ owner: l.name, file: f }))),
    ];
    const probeDir = join(outDir, "probe");
    mkdirSync(probeDir, { recursive: true });
    const results = await pool(files, availableParallelism(), async ({ owner, file }, i) => {
      const cc = file.endsWith(".c") ? tc.cc : tc.cxx;
      const dep = join(probeDir, `${i}.d`);
      const r = await run(cc[0], [...cc.slice(1), "-M", "-MG", "-MF", dep, ...flagsFor(file), ...probeIncludes.map((d) => `-I${d}`), file]);
      if (!existsSync(dep)) return { owner, file, error: r.out.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | ") };
      const deps = parseDepFile(readFileSync(dep, "utf8")).slice(1);
      return { owner, file, missing: deps.filter((d) => !existsSync(resolve(d))) };
    });
    for (const d of discoveryMissing) results.push({ owner: "descubrimiento", file: d.file, missing: [d.header] });
    return { probe: results, libraries: libs.filter((l) => l.origin === "package").map((l) => l.name), outDir };
  }

  // Unidades de compilación agrupadas en archivos .a (como el build real).
  const units = [];
  const add = (group, file) => units.push({ group, file });
  sketchSources.forEach((f) => add("sketch", f));
  manifest.compile.forEach((f) => add("core", join(coreDir, f)));
  usedLibs.forEach((lib) => lib.sources.forEach((f) => add(`lib_${lib.name}`, f)));
  for (const [name, comp] of Object.entries(manifest.idfComponents ?? {})) {
    comp.sources.forEach((f) => add(`idf_${name}`, join(thirdParty[comp.source], f)));
  }
  for (const sub of ["engine/src", "hal/src", "models", "boards/" + boardId, "runner"]) {
    listSources(join(ROOT, "sim", sub), true).forEach((f) => add("jwsim", f));
  }
  const simIncludes = [join(ROOT, "sim", "models", "include"), join(ROOT, "sim", "boards", boardId)];

  log(`[build] ${units.length} unidades, ${usedLibs.length} librerías, destino ${target}`);
  // Header precompilado para el .ino: el preprocesado empieza con
  // #include <Arduino.h>, que con el autoload arrastra 16 librerías. GCC solo
  // usa un PCH si es lo primero que se incluye, así que se precompila un
  // prefijo con los -include forzados del toolchain y Arduino.h, en ese orden,
  // y el .ino lo recibe con -include (su propio #include <Arduino.h> queda
  // vacío por el guard). Si GCC no puede usarlo, se compila sin él: el
  // resultado es idéntico.
  // El PCH vive en la caché compartida, indexado por sus flags e include
  // path: los sketches con las mismas librerías lo reutilizan.
  const inoUnit = sketchSources[0];
  const forced = [];
  const inoFlags = [];
  for (const f = flagsFor(inoUnit), i = { v: 0 }; i.v < f.length; i.v++) {
    if (f[i.v] === "-include") forced.push(f[++i.v]);
    else inoFlags.push(f[i.v]);
  }
  const pchIncs = includeDirs.map((d) => `-I${d}`);
  const pchKey = hash([tc.cxx[0], tc.pchTag ?? "", ...inoFlags, ...forced, ...pchIncs].join("\0"));
  const pchDir = join(cacheDir, "pch", pchKey);
  const pchHeader = join(pchDir, "jwsim_sketch_prefix.h");
  // Marca de PCH inutilizable en este host (con la salida de GCC que lo
  // probó). Una marca "disabled" de versiones anteriores se ignora: se creaba
  // ante cualquier error que mencionara la ruta .../pch/.
  const pchOff = join(pchDir, "pch-desactivado.txt");
  let usePch = !existsSync(pchOff);
  if (usePch) {
    mkdirSync(pchDir, { recursive: true });
    const text = [...forced.map((f) => `#include "${f.replaceAll("\\", "/")}"`), "#include <Arduino.h>", ""].join("\n");
    if (!existsSync(pchHeader) || readFileSync(pchHeader, "utf8") !== text) writeFileSync(pchHeader, text);
    const pchFile = pchHeader + ".gch";
    const pchArgs = [...tc.cxx.slice(1), "-x", "c++-header", "-MMD", ...inoFlags, ...pchIncs, pchHeader, "-o", pchFile];
    const pchHash = hash(tc.cxx[0] + "\0" + pchArgs.join("\0"));
    if (!upToDate(pchFile, pchHeader.replace(/\.h$/, ".d"), pchHash, pchFile + ".cmd")) {
      // Escritura atómica: otro build puede estar usando el mismo PCH.
      const tmp = `${pchFile}.${process.pid}.tmp`;
      const args = pchArgs.map((x) => (x === pchFile ? tmp : x));
      let r;
      for (let k = 0; k < PCH_ATTEMPTS; k++) {
        r = await run(tc.cxx[0], [...args, "-MF", pchHeader.replace(/\.h$/, ".d")]);
        if (r.code === 0 || !PCH_TRANSIENT.test(r.out)) break;
      }
      if (r.code === 0) {
        renameSync(tmp, pchFile);
        writeFileSync(pchFile + ".cmd", pchHash);
      } else {
        usePch = false;
        if (PCH_TRANSIENT.test(r.out)) {
          log("[build] aviso: GCC no pudo generar el header precompilado (ASLR de Windows); este build va sin él");
        } else {
          log("[build] aviso: no se pudo precompilar Arduino.h; se compila sin PCH");
          writeFileSync(pchOff, r.out);
        }
      }
    }
  }
  phase("pch");

  const failures = [];
  const mtimes = new Map();
  const fwSymsFile = join(ROOT, "sim", "hal", "fw-libc.syms");
  const fwSymsText = readFileSync(fwSymsFile, "utf8");
  const fwSyms = {
    file: fwSymsFile,
    hash: hash(fwSymsText),
    names: new Set(fwSymsText.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean)),
  };
  const objects = await pool(units, availableParallelism(), async (u) => {
    const rel = relative(ROOT, u.file).split(sep).join("/").replace(/^\.jwsim\//, "");
    const cc = u.file.endsWith(".c") ? tc.cc : tc.cxx;
    const withPch = usePch && u.file === inoUnit;
    const incs = [
      ...(u.group === "sketch" ? sketchOnlyIncludes : []),
      ...includeDirs,
      ...(u.group === "jwsim" ? simIncludes : []),
    ].map((d) => `-I${d}`);
    const flags = withPch ? [...inoFlags, "-include", pchHeader, "-Winvalid-pch"] : flagsFor(u.file);
    const compile = [...cc.slice(1), "-c", "-MMD", ...flags, ...incs, u.file];
    // El firmware no usa la libc del host para archivos ni hora: sus
    // referencias se redirigen al VFS y al reloj del simulador (la tabla
    // forma parte de la clave de la caché).
    const fwLibc = u.group !== "jwsim";
    const cmdHash = hash(cc[0] + "\0" + compile.join("\0") + (fwLibc ? "\0" + fwSyms.hash : ""));
    // Caché de objetos compartida entre sketches: la clave es el comando
    // completo (flags + include path + archivo). El sketch va en su carpeta.
    const obj =
      u.group === "sketch"
        ? join(outDir, "obj", "sketch", hash(u.file) + "_" + basename(u.file) + ".o")
        : join(cacheDir, cmdHash + "_" + basename(u.file) + ".o");
    mkdirSync(dirname(obj), { recursive: true });
    const args = [...compile, "-o", obj];
    if (upToDate(obj, obj.replace(/\.o$/, ".d"), cmdHash, obj + ".cmd", mtimes)) return { ...u, obj };
    const tUnit = performance.now();
    if (process.env.JWSIM_BUILD_VERBOSE) log(`[cmd] ${JSON.stringify([cc[0], ...args])}`);
    let r = await run(cc[0], args);
    let pchTries = 1;
    for (; withPch && r.code !== 0 && PCH_TRANSIENT.test(r.out) && pchTries < PCH_ATTEMPTS; pchTries++) r = await run(cc[0], args);
    if (r.code !== 0 && withPch && PCH_TRANSIENT.test(r.out)) {
      log(`[build] aviso: GCC no pudo cargar el header precompilado en ${PCH_ATTEMPTS} intentos (ASLR de Windows); esta compilación va sin él`);
      r = await run(cc[0], [...cc.slice(1), "-c", "-MMD", ...flagsFor(u.file), ...incs, u.file, "-o", obj]);
    }
    // Solo los mensajes de GCC sobre el PCH en sí (no rutas que contengan
    // "pch"). Se desactiva únicamente si sin PCH la unidad sí compila.
    if (r.code !== 0 && withPch && PCH_FAILURE.test(r.out)) {
      const plain = [...cc.slice(1), "-c", "-MMD", ...flagsFor(u.file), ...incs, u.file, "-o", obj];
      const r2 = await run(cc[0], plain);
      if (r2.code === 0) {
        writeFileSync(pchOff, r.out);
        log("[build] aviso: GCC no pudo usar el header precompilado en este host; se compila sin él");
      }
      r = r2;
    }
    if (r.code !== 0) {
      failures.push({ rel, out: r.out, sketch: u.group === "sketch" });
      return null;
    }
    if (fwLibc) {
      const nm = await run(tc.nm[0], [...tc.nm.slice(1), "-u", obj]);
      const used = nm.out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop());
      if (used.some((name) => fwSyms.names.has(name))) {
        const oc = await run(tc.objcopy[0], [...tc.objcopy.slice(1), `--redefine-syms=${fwSyms.file}`, obj]);
        if (oc.code !== 0) {
          failures.push({ rel, out: `objcopy --redefine-syms falló:\n${oc.out}` });
          return null;
        }
      }
    }
    if (withPch && /Winvalid-pch|not used because/.test(r.out)) {
      log(`[build] aviso: GCC no usó el header precompilado: ${r.out.split(/\r?\n/).find((l) => /pch|gch/i.test(l)) ?? ""}`);
    }
    if (u.group === "sketch") {
      const pchInfo = withPch ? ` (PCH, ${pchTries} intento${pchTries > 1 ? "s" : ""})` : u.file === inoUnit ? " (sin PCH)" : "";
      phaseNote(`gcc ${basename(u.file)}: ${Math.round(performance.now() - tUnit)} ms${pchInfo}`);
    }
    writeFileSync(obj + ".cmd", cmdHash);
    return { ...u, obj };
  });
  if (failures.length && sketchStd !== "-std=gnu++2b" && failures.some((f) => f.sketch)) {
    // ¿Necesita C++23? Se repite como el package; los errores que se informan
    // son los de esa compilación.
    log("[build] el sketch no compila en C++20; se repite en C++23 (gnu++2b)");
    const r = await buildSketch(sketchDir, { ...options, sketchStd: "-std=gnu++2b" });
    writeFileSync(stdMark, "-std=gnu++2b\n");
    return r;
  }
  if (failures.length) {
    for (const f of failures) log(`\n[build] ERROR compilando ${f.rel}\n${f.out}`);
    const diagnostics = failures.flatMap((f) => parseDiagnostics(f.out));
    // API del ESP32 que el JWPLC Basic simulado no ofrece: el error del
    // compilador lleva la explicación (G2 UNSUPPORTED_LIB_MSG).
    const notes = unsupportedApiNotes(diagnostics, manifest.unsupportedApis ?? {});
    diagnostics.push(...notes);
    const err = new Error([`${failures.length} unidades no compilaron`, ...new Set(notes.map((n) => n.message))].join("\n"));
    err.diagnostics = diagnostics;
    err.output = failures.map((f) => `${f.rel}\n${f.out}`).join("\n");
    throw err;
  }

  phase("compilación");
  // PE/COFF: resolución de símbolos weak (cli/lib/weak-pe.mjs).
  let weakObj = null;
  if (tc.weakPE) {
    const w = resolveWeakPE(tc, objects.map((o) => o.obj), outDir);
    w.objects.forEach((obj, i) => (objects[i] = { ...objects[i], obj }));
    weakObj = w.asm.replace(/\.S$/, ".o");
    // El .S solo se reensambla si cambió (un proceso menos por build).
    const r = !w.changed && existsSync(weakObj) ? { code: 0 } : await run(tc.cc[0], [...tc.cc.slice(1), "-c", w.asm, "-o", weakObj]);
    if (r.code !== 0) throw new Error(`no se pudo ensamblar ${w.asm}: ${r.out}`);
    log(`[build] weak PE/COFF: ${w.thunks} definiciones elegidas, ${w.zeros} referencias a 0, ${w.renamed} objetos renombrados`);
  }

  phase("weak PE/COFF");
  // Archivos .a por grupo (salvo sketch y runtime, que se enlazan directos).
  const groups = new Map();
  for (const o of objects) groups.set(o.group, [...(groups.get(o.group) ?? []), o.obj]);
  const linkInputs = [...groups.get("sketch"), ...groups.get("jwsim"), ...(weakObj ? [weakObj] : [])];
  const archives = [];
  for (const [group, objs] of groups) {
    if (group === "sketch" || group === "jwsim") continue;
    const ar = join(outDir, `${group}.a`);
    // Se rehace solo si cambió la lista de objetos o alguno es más nuevo.
    const stamp = hash(objs.join("\0"));
    if (existsSync(ar) && existsSync(ar + ".list") && readFileSync(ar + ".list", "utf8") === stamp) {
      const arTime = statSync(ar).mtimeMs;
      if (objs.every((o) => statSync(o).mtimeMs <= arTime)) {
        archives.push(ar);
        continue;
      }
    }
    const r = spawnSync(tc.ar[0], [...tc.ar.slice(1), "rcs", ar + ".tmp", ...objs], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`ar falló para ${group}: ${r.stderr}`);
    spawnSync(process.platform === "win32" ? "cmd" : "mv", process.platform === "win32" ? ["/c", "move", "/y", ar + ".tmp", ar] : ["-f", ar + ".tmp", ar]);
    writeFileSync(ar + ".list", stamp);
    archives.push(ar);
  }
  phase("archivos .a");
  const exe = join(outDir, `${sketchName}${tc.exeSuffix}`);
  const linkArgs = [...tc.cxx.slice(1), ...linkInputs, ...tc.groupStart, ...archives, ...tc.groupEnd, ...tc.ldflags, "-o", exe];
  const r = await run(tc.cxx[0], linkArgs);
  if (r.code !== 0) {
    log(r.out);
    throw new Error("el enlazado falló");
  }
  phase("enlace");
  writeFileSync(
    join(outDir, "build-info.json"),
    JSON.stringify(
      {
        sketch: resolve(sketchDir),
        board: boardId,
        target,
        package: { ref: lock.JWPLC_PACKAGE_REF, commit: lock.JWPLC_PACKAGE_COMMIT },
        libraries: usedLibs.map((l) => ({ name: l.name, origin: l.origin })),
        executable: exe,
      },
      null,
      2,
    ) + "\n",
  );
  log(`[build] OK -> ${relative(process.cwd(), exe)}`);
  return { exe, outDir, libraries: usedLibs.map((l) => l.name) };
}
