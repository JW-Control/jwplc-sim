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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { Registry } from "../../scene/devices/index.mjs";
import { Scene } from "../../scene/scene.mjs";
import { ROOT } from "./build.mjs";
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

/** Definiciones de un dispositivo de escena (módulo ES), validadas. */
export async function loadSceneDevice(dir) {
  const m = readManifest(dir);
  if (m.kind !== "scene") throw new Error(`${m.type} es nativo: lo carga el runner (--device)`);
  const mod = await import(pathToFileURL(resolve(dir, m.entry)).href);
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

/** Dispositivos instalados: [{ type, version, kind, dir, lib? }]. */
export function installedDevices() {
  const root = devicesDir();
  if (!existsSync(root)) return [];
  const out = [];
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

/** Registro con los dispositivos incluidos más los de escena instalados. */
export async function registryWithInstalled() {
  const reg = new Registry();
  for (const d of installedDevices()) {
    if (d.kind !== "scene") continue;
    const { defs } = await loadSceneDevice(d.dir);
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
