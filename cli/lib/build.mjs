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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";
import { fetchAll, readSources, thirdPartyDir } from "../../scripts/fetch-third-party.mjs";
import { toolchain } from "./toolchain.mjs";

export const ROOT = resolve(import.meta.dirname, "..", "..");
const SRC_EXT = /\.(c|cpp|cc|S)$/;

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

// ------------------------------------------------------------ sketch
export function preprocessSketch(sketchDir, outFile) {
  const name = basename(sketchDir);
  const files = readdirSync(sketchDir).filter((f) => f.endsWith(".ino")).sort();
  const main = `${name}.ino`;
  if (!files.includes(main)) throw new Error(`no existe ${main} en ${sketchDir}`);
  const ordered = [main, ...files.filter((f) => f !== main)];
  // Igual que arduino-cli: Arduino.h primero y #line para mapear errores.
  // (Los prototipos automáticos vía ctags quedan para G2 / ERROR_MAPPING.)
  let out = "#include <Arduino.h>\n";
  for (const f of ordered) {
    const abs = resolve(sketchDir, f).replaceAll("\\", "/");
    out += `#line 1 "${abs}"\n${readFileSync(join(sketchDir, f), "utf8")}\n`;
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, out);
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

function scanLibraries(pkgTree, manifest, thirdParty) {
  const libs = [];
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

function upToDate(obj, depFile, cmdHash, stampFile) {
  if (!existsSync(obj) || !existsSync(depFile) || !existsSync(stampFile)) return false;
  if (readFileSync(stampFile, "utf8") !== cmdHash) return false;
  const objTime = statSync(obj).mtimeMs;
  const deps = readFileSync(depFile, "utf8").replace(/\\\r?\n/g, " ").split(":").slice(1).join(":");
  for (const d of deps.split(/(?<!\\)\s+/).filter(Boolean)) {
    const p = d.replace(/\\ /g, " ");
    if (!existsSync(p) || statSync(p).mtimeMs > objTime) return false;
  }
  return true;
}

// ------------------------------------------------------------ principal
export async function buildSketch(sketchDir, options = {}) {
  const boardId = options.board ?? "jwplcbasic";
  const target = options.target ?? "native";
  const log = options.log ?? ((m) => console.error(m));
  const tc = toolchain(target, options.cc);

  const { root: pkgRoot, lock } = resolvePackageRoot();
  await fetchAll();
  const thirdParty = Object.fromEntries(readSources().packages.map((p) => [p.name, thirdPartyDir(p)]));
  const pkgTree = join(pkgRoot, lock.JWPLC_PACKAGE_TREE);
  const manifest = JSON.parse(readFileSync(join(ROOT, "sim", "core-manifest.json"), "utf8"));
  const board = readBoard(pkgTree, boardId);
  const coreDir = join(pkgTree, "cores", "jwcontrol");
  const variantDir = join(pkgTree, "variants", board["build.variant"]);

  const sketchName = basename(resolve(sketchDir));
  const outDir = resolve(options.outDir ?? join(ROOT, "build", `${sketchName}-${target}`));
  mkdirSync(outDir, { recursive: true });

  // Coherencia del manifiesto del core contra el árbol del package.
  const coreFiles = listSources(coreDir, true).map((p) => relative(coreDir, p).split(sep).join("/"));
  const classified = new Set([...manifest.compile, ...Object.keys(manifest.replaced), ...Object.keys(manifest.excluded)]);
  const unclassified = coreFiles.filter((f) => !classified.has(f));
  if (unclassified.length) {
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
    "-DJWPLC_LIBRARY_DISCOVERY_PHASE=0",
    "-DJWSIM=1",
    ...(tc.os === "windows" ? ["-D_POSIX_THREAD_SAFE_FUNCTIONS"] : []),
  ];
  const baseIncludes = [
    ...(tc.os === "windows" ? [join(ROOT, "sim", "hal", "include-win32")] : []),
    join(ROOT, "sim", "hal", "include"),
    join(ROOT, "sim", "engine", "include"),
    coreDir,
    join(coreDir, "peripherals", "include"),
    variantDir,
    thirdParty["esp-idf-fatfs"],
  ];

  const libs = scanLibraries(pkgTree, manifest, thirdParty);
  const index = headerIndex(libs);
  const usedLibs = [];
  const includeDirs = [...baseIncludes];

  const flagsFor = (file) => {
    const norm = file.split(sep).join("/");
    const extra = [];
    for (const o of manifest.flagOverrides ?? []) {
      if (o.os && o.os !== tc.os) continue;
      if (o.match.some((m) => norm.endsWith(m))) extra.push(...o.add.map((a) => a.replaceAll("${ROOT}", ROOT)));
    }
    const isC = file.endsWith(".c");
    return [...(isC ? tc.cflags : tc.cxxflags), ...defines, ...extra];
  };

  // Descubrimiento iterativo de librerías.
  const sketchSources = preprocessSketch(resolve(sketchDir), join(outDir, "sketch", `${sketchName}.ino.cpp`));
  const queue = [...sketchSources];
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (let attempt = 0; attempt < 64; attempt++) {
      const cc = file.endsWith(".c") ? tc.cc : tc.cxx;
      // Salida a archivo (no /dev/null): `zig cc -E -o /dev/null` escribe a stdout.
      const r = spawnSync(cc[0], [...cc.slice(1), "-E", "-o", join(outDir, "discovery.i"), ...flagsFor(file), ...includeDirs.map((d) => `-I${d}`), file], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const m = (r.stderr ?? "").match(/fatal error: ([^:\s]+): No such file/) ?? (r.stderr ?? "").match(/'([^']+)' file not found/);
      if (!m) break;
      const header = basename(m[1]);
      const candidates = index.get(header);
      if (!candidates) {
        throw new Error(`${relative(ROOT, file)}: falta '${m[1]}' y ninguna librería del package lo provee.`);
      }
      const lib = pickLibrary(header, candidates);
      if (usedLibs.includes(lib)) throw new Error(`no se pudo resolver '${m[1]}' desde ${lib.name}`);
      usedLibs.push(lib);
      includeDirs.push(...lib.includeDirs);
      queue.push(...lib.sources);
      log(`[build] librería: ${lib.name}${lib.origin === "third-party" ? " (terceros)" : ""}`);
    }
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
  const failures = [];
  const objects = await pool(units, availableParallelism(), async (u) => {
    const rel = relative(ROOT, u.file).split(sep).join("/").replace(/^\.jwsim\//, "");
    const obj = join(outDir, "obj", u.group, hash(u.file) + "_" + basename(u.file) + ".o");
    mkdirSync(dirname(obj), { recursive: true });
    const cc = u.file.endsWith(".c") ? tc.cc : tc.cxx;
    const incs = [...includeDirs, ...(u.group === "jwsim" ? simIncludes : [])].map((d) => `-I${d}`);
    const args = [...cc.slice(1), "-c", "-MMD", ...flagsFor(u.file), ...incs, u.file, "-o", obj];
    const cmdHash = hash(cc[0] + "\0" + args.join("\0"));
    if (upToDate(obj, obj.replace(/\.o$/, ".d"), cmdHash, obj + ".cmd")) return { ...u, obj };
    const r = await run(cc[0], args);
    if (r.code !== 0) {
      failures.push({ rel, out: r.out });
      return null;
    }
    writeFileSync(obj + ".cmd", cmdHash);
    return { ...u, obj };
  });
  if (failures.length) {
    for (const f of failures) log(`\n[build] ERROR compilando ${f.rel}\n${f.out}`);
    throw new Error(`${failures.length} unidades no compilaron`);
  }

  // Archivos .a por grupo (salvo sketch y runtime, que se enlazan directos).
  const groups = new Map();
  for (const o of objects) groups.set(o.group, [...(groups.get(o.group) ?? []), o.obj]);
  const linkInputs = [...groups.get("sketch"), ...groups.get("jwsim")];
  const archives = [];
  for (const [group, objs] of groups) {
    if (group === "sketch" || group === "jwsim") continue;
    const ar = join(outDir, `${group}.a`);
    const r = spawnSync(tc.ar[0], [...tc.ar.slice(1), "rcs", ar + ".tmp", ...objs], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`ar falló para ${group}: ${r.stderr}`);
    spawnSync(process.platform === "win32" ? "cmd" : "mv", process.platform === "win32" ? ["/c", "move", "/y", ar + ".tmp", ar] : ["-f", ar + ".tmp", ar]);
    archives.push(ar);
  }
  const exe = join(outDir, `${sketchName}${tc.exeSuffix}`);
  const linkArgs = [...tc.cxx.slice(1), ...linkInputs, ...tc.groupStart, ...archives, ...tc.groupEnd, ...tc.ldflags, "-o", exe];
  const r = await run(tc.cxx[0], linkArgs);
  if (r.code !== 0) {
    log(r.out);
    throw new Error("el enlazado falló");
  }
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
