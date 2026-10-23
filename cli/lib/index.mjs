// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Índice comunitario firmado (gate JWSIM_G7_COMMUNITY_INDEX).
//
// Mismo modelo que el Boards Manager de Arduino y el VPP de JW Control: un
// índice JSON con los paquetes y, por cada versión, la URL del archivo, su
// SHA-256 y su tamaño; el índice va firmado aparte (jwsim_index.json.sig).
// Al instalar se verifica, en orden: la firma del índice con una clave de
// confianza (cli/keys/*.pem, incluidas en el simulador), el tamaño y el
// SHA-256 del paquete, el contenido del tar (rutas seguras) y que el
// manifiesto coincida con la entrada del índice. Si algo falla no se instala
// nada.
//
// Firma: Ed25519 sobre los bytes exactos de jwsim_index.json;
// jwsim_index.json.sig = {"key": "<id>", "algorithm": "ed25519", "signature": "<base64>"}.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ROOT } from "./build.mjs";
import { buildNativeDevice, devicesDir, jwsimHome, loadSceneDevice, readManifest, SDK_VERSION, typeDir } from "./device.mjs";
import { compareVersions } from "../../scene/devices/index.mjs";
import { unpackTarGz } from "./tar.mjs";

export const INDEX_FORMAT = 1;
export const DEFAULT_INDEX = "https://raw.githubusercontent.com/JW-Control/jwplc-sim/main/index/jwsim_index.json";
const KEYS_DIR = join(ROOT, "cli", "keys");

export class IndexError extends Error {}

/** Claves públicas de confianza: id → KeyObject (cli/keys/<id>.pem y JWSIM_TRUSTED_KEYS). */
export function trustedKeys() {
  const out = new Map();
  const dirs = [KEYS_DIR, ...(process.env.JWSIM_TRUSTED_KEYS ? process.env.JWSIM_TRUSTED_KEYS.split(delimiter) : [])];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith(".pem")).sort()) {
      out.set(basename(f, ".pem"), createPublicKey(readFileSync(join(d, f))));
    }
  }
  return out;
}

/** Firma los bytes del índice con una clave privada Ed25519 (PEM). */
export function signIndex(indexBytes, privatePem, keyId) {
  const key = createPrivateKey(privatePem);
  if (key.asymmetricKeyType !== "ed25519") throw new IndexError("la clave de firma debe ser Ed25519");
  return JSON.stringify({ key: keyId, algorithm: "ed25519", signature: sign(null, indexBytes, key).toString("base64") }, null, 2) + "\n";
}

/** Verifica la firma; devuelve el id de la clave o lanza IndexError. */
export function verifyIndex(indexBytes, sigText, keys = trustedKeys()) {
  let sig;
  try {
    sig = JSON.parse(sigText);
  } catch {
    throw new IndexError("firma ilegible (jwsim_index.json.sig no es JSON)");
  }
  if (sig.algorithm !== "ed25519") throw new IndexError(`algoritmo de firma no admitido: ${sig.algorithm}`);
  const key = keys.get(sig.key);
  if (!key) throw new IndexError(`firma con una clave que no es de confianza: ${sig.key}`);
  let ok = false;
  try {
    ok = verify(null, indexBytes, key, Buffer.from(String(sig.signature), "base64"));
  } catch {
    ok = false;
  }
  if (!ok) throw new IndexError(`firma inválida: el índice no es el que firmó ${sig.key} (alterado o corrupto)`);
  return sig.key;
}

/** Lee una URL http(s), file: o una ruta local. */
async function fetchBytes(loc) {
  if (/^https?:\/\//.test(loc)) {
    const r = await fetch(loc);
    if (!r.ok) throw new IndexError(`${loc}: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  const p = loc.startsWith("file:") ? fileURLToPath(loc) : resolve(loc);
  if (!existsSync(p)) throw new IndexError(`no existe ${p}`);
  return readFileSync(p);
}

const asUrl = (loc) => (/^(https?|file):/.test(loc) ? loc : pathToFileURL(resolve(loc)).href);

/** Índice verificado: { index, keyId, url }. */
export async function loadIndex(loc = process.env.JWSIM_INDEX ?? DEFAULT_INDEX, { keys } = {}) {
  const url = asUrl(loc);
  const bytes = await fetchBytes(url);
  let sigText;
  try {
    sigText = (await fetchBytes(url + ".sig")).toString("utf8");
  } catch {
    throw new IndexError(`el índice no está firmado (falta ${url}.sig)`);
  }
  const keyId = verifyIndex(bytes, sigText, keys);
  const index = JSON.parse(bytes.toString("utf8"));
  if (index.jwsim_index !== INDEX_FORMAT) throw new IndexError(`formato de índice ${index.jwsim_index} no admitido (se espera ${INDEX_FORMAT})`);
  return { index, keyId, url };
}

/** Entrada y versión pedidas ("tipo" o "tipo@x.y.z"; sin versión, la más nueva compatible). */
export function findPackage(index, spec) {
  const [type, version] = spec.split("@");
  const pkg = index.packages.find((p) => p.type === type);
  if (!pkg) throw new IndexError(`${type} no está en el índice`);
  const ok = pkg.versions.filter((v) => (v.sdk ?? 1) <= SDK_VERSION).sort((a, b) => compareVersions(b.version, a.version));
  const v = version ? ok.find((x) => x.version === version) : ok[0];
  if (!v) throw new IndexError(`${type}@${version ?? "?"} no está disponible (hay ${pkg.versions.map((x) => x.version).join(", ")})`);
  return { pkg, version: v };
}

/**
 * Instala un paquete del índice. Verifica firma, tamaño, SHA-256, contenido
 * y manifiesto; compila los nativos y valida los de escena antes de dejarlo
 * en ~/.jwsim/devices (o examples) — si algo falla no queda nada instalado.
 */
export async function installPackage(spec, { index: loc, keys, log = () => {} } = {}) {
  const { index, keyId, url } = await loadIndex(loc, { keys });
  log(`[index] ${url}: firma válida (${keyId})`);
  const { pkg, version } = findPackage(index, spec);
  const archiveUrl = new URL(version.url, url).href;
  const archive = await fetchBytes(archiveUrl);
  if (archive.length !== version.size) throw new IndexError(`${basename(archiveUrl)}: ${archive.length} bytes, el índice dice ${version.size}`);
  const sum = `SHA-256:${createHash("sha256").update(archive).digest("hex")}`;
  if (sum !== version.checksum) throw new IndexError(`${basename(archiveUrl)}: SHA-256 no coincide con el índice (paquete alterado)`);
  log(`[index] ${basename(archiveUrl)}: ${version.size} bytes, ${sum}`);
  const files = unpackTarGz(archive);
  const kind = pkg.kind;
  const root = kind === "example" ? join(jwsimHome(), "examples") : devicesDir();
  const final = join(root, typeDir(pkg.type), version.version);
  const tmp = join(root, `.tmp-${typeDir(pkg.type)}-${version.version}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  try {
    for (const f of files) {
      const p = join(tmp, f.name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.data);
    }
    const m = readManifest(tmp);
    if (m.type !== pkg.type || m.version !== version.version || m.kind !== kind) {
      throw new IndexError(`el manifiesto (${m.type}@${m.version}, ${m.kind}) no coincide con el índice (${pkg.type}@${version.version}, ${kind})`);
    }
    if (kind === "native") buildNativeDevice(tmp, { outDir: join(tmp, "build"), log });
    else if (kind === "scene") await loadSceneDevice(tmp);
    rmSync(final, { recursive: true, force: true });
    mkdirSync(dirname(final), { recursive: true });
    renameSync(tmp, final);
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
  log(`[index] instalado ${pkg.type}@${version.version} en ${final}`);
  return { type: pkg.type, version: version.version, kind, dir: final, keyId };
}
