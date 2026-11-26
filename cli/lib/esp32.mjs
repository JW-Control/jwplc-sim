// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Subir al JWPLC»: compila el sketch para el ESP32 real con arduino-cli y lo
// carga por USB (esptool), con el MISMO package fijado que usa el simulador
// (package.lock). Así lo que se probó en el Sim es lo que corre en el equipo.
//
// Disposición (un directorio de datos de arduino-cli propio del Sim, para no
// tocar el Arduino15 del usuario):
//   <datos>/arduino-cli.yaml
//   <datos>/packages/jwplc_sim/hardware/esp32/<versión> -> árbol del package
//   <datos>/packages/jwplc/tools/<herramienta>/<versión>  (compilador ESP32,
//        librerías del IDF y esptool)
// Las herramientas se toman, por enlace, del Arduino15 del usuario si ya
// tiene el JWPLC Basic instalado en Arduino IDE u OpenPLC Editor. Si no, se
// descargan una sola vez con arduino-cli (core install jwplc:esp32).
import { spawn } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";

import { bundledCtagsDir } from "../../scripts/fetch-arduino-cli.mjs";
import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";
import { ROOT } from "./build.mjs";

export const BOARD_INDEX_URL = "https://raw.githubusercontent.com/JW-Control/platform-jwplc/main/JWPLC/package_jwplc_index.json";
// Herramientas que pide platform.txt del package fijado (runtime.tools.*).
// Son las del jwplc:esp32 publicado en el índice, que es lo que se descarga
// si faltan. Al fijar un package que pida otras versiones, actualizar aquí.
export const ESP32_TOOLS = [
  { name: "esp-x32", version: "2601", label: "compilador del ESP32" },
  { name: "esp32-libs", version: "3.3.8", label: "librerías del ESP-IDF" },
  { name: "esptool_py", version: "5.2.0", label: "esptool (carga por USB)" },
];
export const FQBN = "jwplc_sim:esp32:jwplcbasic";
// Tamaño aproximado de la descarga de las herramientas (Windows x64).
export const TOOLS_DOWNLOAD_MB = 520;

const exe = process.platform === "win32" ? ".exe" : "";

// arduino-cli: el que trae el instalador (scripts/fetch-arduino-cli.mjs), el
// de JWSIM_ARDUINO_CLI o el del PATH.
export function findArduinoCli() {
  const cands = [process.env.JWSIM_ARDUINO_CLI, join(ROOT, ".jwsim", "arduino-cli", `arduino-cli${exe}`)];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) if (dir) cands.push(join(dir, `arduino-cli${exe}`));
  return cands.find((c) => c && existsSync(c)) ?? null;
}

// Arduino15 del usuario (Arduino IDE 2 y el OpenPLC Editor JWPLC).
export function userArduino15() {
  const cands =
    process.platform === "win32"
      ? [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Arduino15")]
      : process.platform === "darwin"
        ? [join(homedir(), "Library", "Arduino15")]
        : [join(homedir(), ".arduino15")];
  return cands.find((c) => c && existsSync(c)) ?? null;
}

function linkDir(target, link) {
  try {
    if (lstatSync(link, { throwIfNoEntry: false })) {
      try {
        if (resolve(readlinkSync(link)) === resolve(target)) return true;
      } catch {}
      rmSync(link, { recursive: true, force: true });
    }
    mkdirSync(join(link, ".."), { recursive: true });
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}

function toolDir(dataDir, t) {
  return join(dataDir, "packages", "jwplc", "tools", t.name, t.version);
}
const toolReady = (dir) => existsSync(dir) && readdirSync(dir).length > 0;

// Deja listo el directorio de datos: configuración, plataforma enlazada al
// package fijado y herramientas (enlazadas desde Arduino15 si están).
// Devuelve { cli, dataDir, config, missing: [herramientas que faltan] }.
export function prepareEsp32({ dataDir, package: pkg } = {}) {
  const cli = findArduinoCli();
  const { root: pkgRoot, lock } = pkg ?? resolvePackageRoot();
  const tree = join(pkgRoot, lock.JWPLC_PACKAGE_TREE);
  dataDir = resolve(dataDir ?? process.env.JWSIM_ARDUINO_DATA ?? join(ROOT, "build", "arduino"));
  mkdirSync(join(dataDir, "packages"), { recursive: true });
  const config = join(dataDir, "arduino-cli.yaml");
  const yamlPath = (p) => JSON.stringify(p);
  writeFileSync(
    config,
    [
      "directories:",
      `  data: ${yamlPath(dataDir)}`,
      `  downloads: ${yamlPath(join(dataDir, "staging"))}`,
      `  user: ${yamlPath(join(dataDir, "sketchbook"))}`,
      "board_manager:",
      "  additional_urls:",
      `    - ${BOARD_INDEX_URL}`,
      "updater:",
      "  enable_notification: false",
      "",
    ].join("\n"),
  );
  // Plataforma: una sola versión, la del package fijado.
  const hwBase = join(dataDir, "packages", "jwplc_sim", "hardware", "esp32");
  const version = lock.JWPLC_PACKAGE_REF.replace(/^v/, "").replaceAll("/", "_");
  if (existsSync(hwBase)) for (const v of readdirSync(hwBase)) if (v !== version) rmSync(join(hwBase, v), { recursive: true, force: true });
  const hw = join(hwBase, version);
  if (!linkDir(tree, hw) && !existsSync(join(hw, "platform.txt"))) cpSync(tree, hw, { recursive: true });
  // Herramientas.
  const a15 = userArduino15();
  const missing = [];
  for (const t of ESP32_TOOLS) {
    const dir = toolDir(dataDir, t);
    if (toolReady(dir)) continue;
    const theirs = a15 && join(a15, "packages", "jwplc", "tools", t.name, t.version);
    if (theirs && toolReady(theirs) && resolve(theirs) !== resolve(dir) && linkDir(theirs, dir)) continue;
    missing.push(t);
  }
  // Herramientas «builtin» de arduino-cli (descubrimiento de puertos, monitor):
  // si el usuario tiene Arduino IDE, las suyas; si no, arduino-cli las baja.
  const builtin = join(dataDir, "packages", "builtin");
  if (!existsSync(builtin) && a15 && existsSync(join(a15, "packages", "builtin")) && resolve(a15) !== dataDir) linkDir(join(a15, "packages", "builtin"), builtin);
  return { cli, dataDir, config, tree, version, missing, arduino15: a15 };
}

// Avisos de arduino-cli sin red o sin las herramientas «builtin» (índices,
// descubrimiento de puertos): no impiden compilar ni cargar con --port.
const NOISE = /^(Downloading index|Error initializing instance: (Loading index file|Error downloading index|Error loading hardware platform: discovery))/;

function runCli(cli, args, { log = () => {}, cwd } = {}) {
  return new Promise((done) => {
    const p = spawn(cli, args, { cwd, windowsHide: true });
    let out = "";
    let buf = "";
    const onData = (d) => {
      const s = d.toString().replace(/\x1b\[[0-9;]*m/g, "");
      out += s;
      buf += s;
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      for (const l of lines) if (l.trim() && !NOISE.test(l)) log(l);
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("error", (err) => done({ code: -1, out: `${out}\n${err.message}` }));
    p.on("close", (code) => {
      if (buf.trim() && !NOISE.test(buf)) log(buf);
      done({ code, out });
    });
  });
}

// Descarga las herramientas con arduino-cli (una sola vez, ~500 MB).
export async function installEsp32Tools(env, { log = () => {} } = {}) {
  if (!env.cli) throw new Error("no se encontró arduino-cli");
  log("[subir] descargando el índice de placas JWPLC…");
  let r = await runCli(env.cli, ["--config-file", env.config, "core", "update-index"], { log });
  // Basta con el índice de JWPLC: el de Arduino (downloads.arduino.cc) puede
  // fallar detrás de un proxy y no hace falta para el ESP32.
  if (r.code !== 0 && !existsSync(join(env.dataDir, "package_jwplc_index.json"))) throw new Error(`no se pudo descargar el índice de placas (¿sin internet?)\n${r.out.trim()}`);
  log(`[subir] descargando las herramientas del ESP32 (unos ${TOOLS_DOWNLOAD_MB} MB, solo la primera vez)…`);
  r = await runCli(env.cli, ["--config-file", env.config, "core", "install", "jwplc:esp32"], { log });
  if (r.code !== 0) throw new Error(`no se pudieron instalar las herramientas del ESP32\n${r.out.trim()}`);
  // Los archivos descargados ya no hacen falta (unos 500 MB).
  rmSync(join(env.dataDir, "staging"), { recursive: true, force: true });
  const still = ESP32_TOOLS.filter((t) => !toolReady(toolDir(env.dataDir, t)));
  if (still.length) throw new Error(`faltan herramientas tras la descarga: ${still.map((t) => `${t.name} ${t.version}`).join(", ")}`);
}

// ctags (prototipos del .ino) del instalador: sin él, arduino-cli lo
// descargaría de downloads.arduino.cc en la primera compilación.
function extraProps() {
  const ctags = process.env.JWSIM_CTAGS_DIR ?? bundledCtagsDir();
  return ctags ? ["--build-property", `runtime.tools.ctags.path=${ctags}`] : [];
}

// Compila el sketch para el JWPLC Basic real. Devuelve { ok, buildDir, out,
// size } (size: líneas de uso de flash y RAM que informa arduino-cli).
export async function compileEsp32(sketchDir, env, { buildDir, log = () => {} } = {}) {
  if (!env.cli) throw new Error("no se encontró arduino-cli");
  if (env.missing.length) throw new Error(`faltan herramientas del ESP32: ${env.missing.map((t) => t.label).join(", ")}`);
  buildDir = resolve(buildDir ?? join(env.dataDir, "build", basename(resolve(sketchDir))));
  mkdirSync(buildDir, { recursive: true });
  log(`[subir] compilando ${basename(resolve(sketchDir))} para el JWPLC Basic (package ${env.version})…`);
  const r = await runCli(env.cli, ["--config-file", env.config, "compile", "--fqbn", FQBN, "--build-path", buildDir, ...extraProps(), resolve(sketchDir)], { log });
  const size = r.out.split(/\r?\n/).filter((l) => /^(El sketch usa|Sketch uses|Las variables|Global variables)/.test(l));
  return { ok: r.code === 0, buildDir, out: r.out, size };
}

// Comando de carga del platform.txt, ya resuelto por arduino-cli
// (--show-properties=expanded): esptool con los .bin de buildDir. Se ejecuta
// directo, sin «arduino-cli upload», porque este necesita el descubrimiento de
// puertos de arduino-cli (herramientas builtin que se descargan de internet).
export async function uploadCommand(sketchDir, env, buildDir) {
  const r = await runCli(env.cli, ["--config-file", env.config, "compile", "--fqbn", FQBN, "--build-path", buildDir, ...extraProps(), "--show-properties=expanded", resolve(sketchDir)]);
  if (r.code !== 0) throw new Error(`arduino-cli no informó el comando de carga\n${r.out.trim()}`);
  const props = new Map();
  for (const line of r.out.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) props.set(line.slice(0, i), line.slice(i + 1));
  }
  const tool = props.get("upload.tool") ?? "esptool_py";
  const pick = (k) => (process.platform === "win32" && props.get(`${k}.windows`)) || props.get(k);
  const path = pick(`tools.${tool}.path`);
  const cmd = pick(`tools.${tool}.cmd`);
  const argsText = pick(`tools.${tool}.upload.pattern_args`);
  if (!path || !cmd || !argsText) throw new Error(`platform.txt sin comando de carga para ${tool}`);
  const args = [...argsText.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
  return { exe: join(path, cmd), args };
}

// Carga lo compilado por el puerto serie del USB.
export async function uploadEsp32(sketchDir, env, { buildDir, port, log = () => {} } = {}) {
  if (!port) throw new Error("elija el puerto del JWPLC");
  const { exe: esptool, args } = await uploadCommand(sketchDir, env, buildDir);
  log(`[subir] cargando al JWPLC en ${port}…`);
  const r = await runCli(esptool, args.map((a) => a.replaceAll("{serial.port}", port)), { log });
  let hint = "";
  if (r.code !== 0) {
    if (/could not open port|PermissionError|Access is denied|Acceso denegado|busy|Permission denied/i.test(r.out)) hint = "El puerto está ocupado o no se pudo abrir: cierre el Monitor serie, Arduino IDE u otro programa que lo use.";
    else if (/Failed to connect|No serial data received|Wrong boot mode/i.test(r.out)) hint = "No respondió el ESP32: revise el cable USB (de datos, no solo de carga) y que el equipo esté alimentado.";
    else if (/No such file|could not find|does not exist|FileNotFound/i.test(r.out)) hint = `No existe el puerto ${port}: vuelva a buscar los puertos (↻) con el JWPLC conectado.`;
  }
  return { ok: r.code === 0, out: r.out, hint };
}
