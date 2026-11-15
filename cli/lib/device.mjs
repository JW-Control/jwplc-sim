// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Dispositivos del SDK (G7): manifiesto jwsim-device.json, compilación de
// los nativos con el toolchain del simulador, carga de los de escena,
// empaquetado para el índice e instalación en ~/.jwsim/devices.
//
// Manifiesto (jwsim-device.json):
//   { "type": "autor/nombre", "version": "1.0.0", "kind": "scene" | "native" | "example",
//     "name": "...", "description": "...", "license": "MIT", "author": "...",
//     "entry": "device.mjs"            (scene: módulo ES que exporta la definición)
//     "sources": ["dispositivo.c"],    (native: fuentes C/C++; se compilan al instalar)
//     "entry": "proyecto.jwsim"        (example: proyecto con sketch y escena)
//     "sdk": 1 }
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { Registry } from "../../scene/devices/index.mjs";
import { Scene } from "../../scene/scene.mjs";
import { ROOT } from "./build.mjs";
import { checkDeviceSymbols } from "./symbol-check.mjs";
import { packTarGz } from "./tar.mjs";
import { toolchain } from "./toolchain.mjs";

export const MANIFEST = "jwsim-device.json";
export const SDK_VERSION = 1;
const SDK_NATIVE = join(ROOT, "sdk", "native");

export const jwsimHome = () => resolve(process.env.JWSIM_HOME ?? join(homedir(), ".jwsim"));
export const devicesDir = () => join(jwsimHome(), "devices");
export const typeDir = (type) => type.replace("/", "__");

/** Manifiesto validado de la carpeta de un dispositivo. */
export function readManifest(dir) {
  const file = join(dir, MANIFEST);
  if (!existsSync(file)) throw new Error(`${dir}: falta ${MANIFEST}`);
  let m;
  try {
    m = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file}: JSON inválido: ${err.message}`);
  }
  const bad = (msg) => new Error(`${file}: ${msg}`);
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(m.type ?? "")) throw bad("'type' debe ser autor/nombre en minúsculas");
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? "")) throw bad("'version' debe ser x.y.z");
  if (!["scene", "native", "example"].includes(m.kind)) throw bad("'kind' debe ser scene, native o example");
  if (!m.name) throw bad("falta 'name'");
  if (!m.license) throw bad("falta 'license' (identificador SPDX)");
  if ((m.sdk ?? SDK_VERSION) > SDK_VERSION) throw bad(`requiere el SDK ${m.sdk}; este simulador implementa el ${SDK_VERSION}`);
  if (m.kind === "scene" && !/\.m?js$/.test(m.entry ?? "")) throw bad("'entry' debe ser el módulo .mjs/.js del dispositivo");
  if (m.kind === "native" && !(Array.isArray(m.sources) && m.sources.length)) throw bad("'sources' debe listar las fuentes C/C++");
  if (m.kind === "example" && !/\.jwsim$/.test(m.entry ?? "")) throw bad("'entry' debe ser el proyecto .jwsim del ejemplo");
  for (const f of m.kind === "native" ? m.sources : [m.entry]) {
    if (!existsSync(join(dir, f))) throw bad(`no existe ${f}`);
  }
  return m;
}

/** Archivos de la carpeta (relativos, con "/"), sin salidas de compilación. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      if (["node_modules", ".git", "build"].includes(e) || e.endsWith(".tar.gz")) continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}

const libExt = (target) => (target === "windows" || process.platform === "win32" ? ".dll" : process.platform === "darwin" ? ".dylib" : ".so");

/** Compila un dispositivo nativo como biblioteca compartida. */
export function buildNativeDevice(dir, { target = "native", outDir, log = () => {} } = {}) {
  const m = readManifest(dir);
  if (m.kind !== "native") throw new Error(`${m.type} es un dispositivo de escena: no se compila`);
  const tc = toolchain(target);
  if (!tc.available) throw new Error(`no se encontró el compilador ${tc.cxx[0]}`);
  const name = m.type.split("/")[1];
  const out = resolve(outDir ?? join(ROOT, "build", "devices", name));
  mkdirSync(out, { recursive: true });
  const lib = join(out, name + libExt(target));
  const cpp = m.sources.some((s) => /\.(cc|cpp|cxx)$/.test(s));
  const cc = cpp ? tc.cxx : tc.cc;
  const win = target === "windows" || process.platform === "win32";
  const args = [
    ...cc.slice(1),
    "-shared",
    "-O2",
    ...(win ? ["-static-libgcc", ...(cpp ? ["-static-libstdc++"] : [])] : ["-fPIC", "-fvisibility=hidden"]),
    `-I${SDK_NATIVE}`,
    ...m.sources.map((s) => join(dir, s)),
    "-o",
    lib,
  ];
  log(`[device] ${cc[0]} ${args.join(" ")}`);
  const r = spawnSync(cc[0], args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${m.type}: no compila\n${r.stderr || r.error?.message}`);
  return { manifest: m, lib };
}

/**
 * Definiciones de un dispositivo de escena (módulo ES), validadas. Con
 * `fresh`, el módulo se vuelve a leer del disco (recargar sin reiniciar; los
 * módulos que importe a su vez siguen en la caché de Node).
 */
export async function loadSceneDevice(dir, { fresh = false } = {}) {
  const m = readManifest(dir);
  if (m.kind !== "scene") throw new Error(`${m.type} es nativo: lo carga el runner (--device)`);
  const url = pathToFileURL(resolve(dir, m.entry)).href + (fresh ? `?v=${Date.now()}-${Math.random().toString(36).slice(2)}` : "");
  const mod = await import(url);
  const defs = [mod.default ?? mod.device].flat().filter(Boolean);
  if (!defs.length) throw new Error(`${m.entry} no exporta la definición (export default)`);
  if (!defs.some((d) => d.type === m.type && d.version === m.version)) {
    throw new Error(`${m.entry} no define ${m.type}@${m.version} (manifiesto y código deben coincidir)`);
  }
  // Se registra y se instancia solo, sin cables, para validar el contrato.
  const reg = new Registry([]);
  for (const d of defs) reg.add(d);
  for (const d of defs) new Scene({ devices: [{ id: "D", type: d.type }], wiring: [] }, { registry: reg });
  return { manifest: m, defs };
}

/** Paquete .tar.gz reproducible con su SHA-256 y tamaño (para el índice). */
export function packDevice(dir) {
  const m = readManifest(dir);
  const files = listFiles(dir).map((name) => ({ name, data: readFileSync(join(dir, name)) }));
  const archive = packTarGz(files);
  return {
    manifest: m,
    archive,
    fileName: `${m.type.replace("/", "-")}-${m.version}.tar.gz`,
    checksum: `SHA-256:${createHash("sha256").update(archive).digest("hex")}`,
    size: archive.length,
  };
}

// ---------------------------------------------------------------- modo desarrollador
// Carpetas de dispositivos de escena en desarrollo, enlazadas sin pasar por
// el índice firmado (jwsim-cli device link <carpeta> o el gestor de la app).
// Ejecutan código: solo carpetas de confianza.
export const localLinksFile = () => join(jwsimHome(), "devices-local.json");

/** Carpetas enlazadas (rutas absolutas). */
export function localLinks() {
  try {
    const j = JSON.parse(readFileSync(localLinksFile(), "utf8"));
    return Array.isArray(j.dirs) ? j.dirs.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

function saveLinks(dirs) {
  mkdirSync(jwsimHome(), { recursive: true });
  writeFileSync(localLinksFile(), JSON.stringify({ dirs: [...new Set(dirs)] }, null, 2) + "\n");
}

/**
 * Valida un dispositivo de escena en una carpeta: manifiesto, contrato (se
 * instancia) y símbolos. No lanza: devuelve el resultado.
 */
export async function checkDeviceDir(dir, { fresh = true } = {}) {
  const out = { dir, ok: false, type: null, version: null, name: null, errors: [], warnings: [], symbols: [] };
  try {
    const { manifest, defs } = await loadSceneDevice(dir, { fresh });
    Object.assign(out, { type: manifest.type, version: manifest.version, name: manifest.name, category: defs[0].category ?? "Otros" });
    out.symbols = checkDeviceSymbols(dir, defs);
    for (const s of out.symbols) {
      for (const e of s.errors) out.errors.push(`${s.file}: ${e}`);
      for (const w of s.warnings) out.warnings.push(`${s.file}: ${w}`);
    }
    if (!out.symbols.length) out.warnings.push("sin symbol.svg: se dibuja como módulo genérico con los bornes repartidos en la grilla");
  } catch (err) {
    out.errors.push(err.message);
  }
  out.ok = !out.errors.length;
  return out;
}

/** Enlaza una carpeta (modo desarrollador). Lanza si no es un dispositivo de escena válido. */
export async function linkDevice(dir) {
  const abs = resolve(dir);
  const m = readManifest(abs);
  if (m.kind !== "scene") throw new Error(`${m.type}: solo se enlazan dispositivos de escena (es ${m.kind})`);
  const r = await checkDeviceDir(abs);
  if (!r.ok) throw new Error(`${m.type}: ${r.errors.join("; ")}`);
  const other = localDevices().find((d) => d.type === m.type && d.dir !== abs);
  if (other) throw new Error(`${m.type} ya está enlazado desde ${other.dir}`);
  saveLinks([...localLinks(), abs]);
  return r;
}

/** Quita un enlace por carpeta o por tipo; devuelve las carpetas quitadas. */
export function unlinkDevice(target) {
  const abs = resolve(target);
  const dirs = localLinks();
  const gone = dirs.filter((d) => d === abs || localDevices().find((x) => x.dir === d)?.type === target);
  if (!gone.length) throw new Error(`no hay un dispositivo enlazado ${target}`);
  saveLinks(dirs.filter((d) => !gone.includes(d)));
  return gone;
}

/** Dispositivos enlazados: [{ type, version, kind, name, dir, local: true }] o { dir, error }. */
export function localDevices() {
  return localLinks().map((dir) => {
    try {
      const m = readManifest(dir);
      return { type: m.type, version: m.version, kind: m.kind, name: m.name, dir, local: true };
    } catch (err) {
      return { dir, local: true, error: err.message };
    }
  });
}

/** Dispositivos instalados del índice y enlazados: [{ type, version, kind, dir, lib?, local? }]. */
export function installedDevices() {
  // Los enlazados van primero: si coinciden tipo y versión con uno del índice, manda el local.
  const out = localDevices().filter((d) => !d.error && d.kind === "scene");
  const root = devicesDir();
  if (!existsSync(root)) return out;
  for (const t of readdirSync(root).sort()) {
    for (const v of readdirSync(join(root, t)).sort()) {
      const dir = join(root, t, v);
      try {
        const m = readManifest(dir);
        const libFile = join(dir, "build", m.type.split("/")[1] + libExt("native"));
        out.push({ type: m.type, version: m.version, kind: m.kind, name: m.name, dir, ...(m.kind === "native" ? { lib: libFile } : {}) });
      } catch {
        // Una carpeta incompleta (instalación interrumpida) no se lista.
      }
    }
  }
  return out;
}

/**
 * Registro con los dispositivos incluidos más los de escena instalados y
 * enlazados. `onError(d, err)` recibe los que no cargan (no frenan a los demás).
 */
export async function registryWithInstalled({ fresh = false, onError } = {}) {
  const reg = new Registry();
  for (const d of installedDevices()) {
    if (d.kind !== "scene") continue;
    let defs;
    try {
      ({ defs } = await loadSceneDevice(d.dir, { fresh: fresh || !!d.local }));
    } catch (err) {
      if (onError) {
        onError(d, err);
        continue;
      }
      throw err;
    }
    for (const def of defs) {
      try {
        reg.add(def);
      } catch {
        // Misma versión ya registrada (incluida): manda la incluida.
      }
    }
  }
  return reg;
}
