#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Descarga el árbol del package JWPLC fijado en package.lock, sin copiarlo al
// repositorio. Resultado: .jwsim/package/<REF>/ (ignorado por git; las "/" de
// una rama pasan a "_"). REF puede ser un tag (debe apuntar a COMMIT) o una
// rama: si la rama siguió avanzando, o ya no existe, se trae COMMIT exacto.
//
// Uso:
//   node scripts/fetch-package.mjs            # clona/verifica según package.lock
//   node scripts/fetch-package.mjs --print    # solo imprime la ruta resuelta
//   node scripts/fetch-package.mjs --fijado   # ignora el modo en vivo: package.lock exacto
//
// Variables:
//   JWPLC_PACKAGE_DIR  ruta a un checkout local de platform-jwplc. Si es un repo
//                      git se verifica que HEAD o el tag coincidan con el commit
//                      fijado; nunca se modifica ese checkout.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Rutas del package que necesita el simulador (sparse checkout).
const SPARSE_PATHS = [
  "JWPLC/2.1.0/boards.txt",
  "JWPLC/2.1.0/platform.txt",
  "JWPLC/2.1.0/platform.local.txt",
  "JWPLC/2.1.0/cores/",
  "JWPLC/2.1.0/variants/",
  "JWPLC/2.1.0/libraries/",
  "tools/build-speed-benchmark/sketches/",
];

export function readLock() {
  const text = readFileSync(join(ROOT, "package.lock"), "utf8");
  const lock = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) lock[m[1]] = m[2];
  }
  for (const k of ["JWPLC_PACKAGE_REPO", "JWPLC_PACKAGE_REF", "JWPLC_PACKAGE_COMMIT", "JWPLC_PACKAGE_TREE"]) {
    if (!lock[k]) throw new Error(`package.lock: falta ${k}`);
  }
  return lock;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function revParse(dir, rev) {
  try {
    return git(["rev-parse", `${rev}^{commit}`], dir);
  } catch {
    return null;
  }
}

// Marca con el commit verificado: permite usar el package sin git (el
// instalador lo lleva así a PCs donde git no está en el PATH).
const COMMIT_MARK = ".jwsim-commit";
function readMark(dir) {
  try {
    return readFileSync(join(dir, COMMIT_MARK), "utf8").trim();
  } catch {
    return null;
  }
}
function markCommit(dir, commit) {
  if (readMark(dir) === commit) return;
  try {
    writeFileSync(join(dir, COMMIT_MARK), commit + "\n");
  } catch {}
}

// Devuelve la raíz del checkout (directorio que contiene JWPLC/2.1.0).
// En la rama de revisiones en vivo (sin candado estricto de commit):
//   1. JWPLC_PACKAGE_DIR si está definida.
//   2. Checkout hermano ../platform-jwplc si contiene JWPLC_PACKAGE_TREE.
//   3. En última instancia, la rama/ref configurada en package.lock.
// Con `fijado` (instalador, gates de release) se salta 1 y 2 y se exige el
// commit de package.lock.
export function resolvePackageRoot({ fetch = true, fijado = false } = {}) {
  const lock = readLock();
  if (fijado) return lockedPackage(lock, fetch);
  const override = process.env.JWPLC_PACKAGE_DIR;

  if (override) {
    return packageFromDir(override);
  }

  const sibling = resolve(ROOT, "..", "platform-jwplc");
  if (existsSync(join(sibling, lock.JWPLC_PACKAGE_TREE))) {
    return packageFromDir(sibling);
  }

  const dest = join(ROOT, ".jwsim", "package", lock.JWPLC_PACKAGE_REF.replaceAll("/", "_"));
  if (existsSync(join(dest, ".git")) || existsSync(join(dest, COMMIT_MARK))) {
    const head = revParse(dest, "HEAD");
    if (head) {
      markCommit(dest, head);
      return { root: dest, lock: { ...lock, JWPLC_PACKAGE_COMMIT: head }, source: "cache" };
    }
    if (readMark(dest)) return { root: dest, lock, source: "cache" };
  }
  if (!fetch) throw new Error(`Package no descargado. Ejecute: node scripts/fetch-package.mjs`);
  return fetchPackageRef(lock.JWPLC_PACKAGE_REF);
}

// Package exacto de package.lock en .jwsim/package/<REF>/, con la marca de
// commit que verifica la app instalada.
function lockedPackage(lock, fetch) {
  const dest = join(ROOT, ".jwsim", "package", lock.JWPLC_PACKAGE_REF.replaceAll("/", "_"));
  const want = lock.JWPLC_PACKAGE_COMMIT;
  const current = () => revParse(dest, "HEAD") ?? readMark(dest);
  if (current() !== want) {
    if (!fetch) throw new Error(`Package fijado no descargado. Ejecute: node scripts/fetch-package.mjs --fijado`);
    rmSync(dest, { recursive: true, force: true });
    fetchPackageRef(lock.JWPLC_PACKAGE_REF);
    if (current() !== want) {
      execFileSync("git", ["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", want], { cwd: dest, stdio: "inherit" });
      execFileSync("git", ["-c", "advice.detachedHead=false", "checkout", "--quiet", want], { cwd: dest, stdio: "inherit" });
    }
    if (current() !== want) throw new Error(`${lock.JWPLC_PACKAGE_REF} no apunta a ${want} (package.lock)`);
  }
  markCommit(dest, want);
  return { root: dest, lock, source: "lock" };
}

// Package sin fijar (G5): un checkout cualquiera de platform-jwplc, p. ej. el
// del PR o de la release en su propio CI. No se verifica contra package.lock;
// la versión informada es la del commit del checkout (si es un repo git).
export function packageFromDir(dir) {
  const lock = readLock();
  const root = resolve(dir);
  if (!existsSync(join(root, lock.JWPLC_PACKAGE_TREE))) {
    throw new Error(`${root} no contiene ${lock.JWPLC_PACKAGE_TREE}`);
  }
  const head = revParse(root, "HEAD");
  let ref = "checkout";
  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root);
    ref = branch && branch !== "HEAD" ? branch : git(["describe", "--tags", "--always", "--dirty"], root);
  } catch {}
  let commit = head ?? `dir:${root}`;
  try {
    const dirty = git(["status", "--porcelain", "--", lock.JWPLC_PACKAGE_TREE], root);
    if (dirty) {
      commit = `${commit}-dirty-${createHash("sha1").update(dirty).digest("hex").slice(0, 8)}`;
    }
  } catch {}
  return {
    root,
    lock: { ...lock, JWPLC_PACKAGE_REF: ref, JWPLC_PACKAGE_COMMIT: commit },
    source: "dir",
  };
}

// Package en un tag o commit arbitrario (jwsim-cli parity <ref>): se clona
// en .jwsim/package/<ref>/ con el mismo sparse checkout. Sin verificación de
// commit fijado: es justamente lo que se quiere comparar.
export function fetchPackageRef(ref) {
  const lock = readLock();
  if (!/^[\w.\-/]+$/.test(ref)) throw new Error(`ref inválida: ${ref}`);
  const dest = join(ROOT, ".jwsim", "package", ref.replaceAll("/", "_"));
  if (!existsSync(join(dest, ".git"))) {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    console.error(`[fetch-package] clonando ${lock.JWPLC_PACKAGE_REPO} @ ${ref}`);
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", dest], { stdio: "inherit" });
    execFileSync("git", ["remote", "add", "origin", lock.JWPLC_PACKAGE_REPO], { cwd: dest });
    execFileSync("git", ["config", "core.sparseCheckout", "true"], { cwd: dest });
    execFileSync("git", ["sparse-checkout", "set", "--no-cone", ...SPARSE_PATHS.map((p) => `/${p}`)], { cwd: dest, stdio: "inherit" });
    execFileSync("git", ["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", ref], { cwd: dest, stdio: "inherit" });
    execFileSync("git", ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], { cwd: dest, stdio: "inherit" });
  }
  const head = revParse(dest, "HEAD");
  return { root: dest, lock: { ...lock, JWPLC_PACKAGE_REF: ref, JWPLC_PACKAGE_COMMIT: head }, source: "ref" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { root, lock, source } = resolvePackageRoot({
      fetch: !process.argv.includes("--print"),
      fijado: process.argv.includes("--fijado"),
    });
    if (!process.argv.includes("--print")) {
      console.error(`[fetch-package] ${lock.JWPLC_PACKAGE_REF} (${lock.JWPLC_PACKAGE_COMMIT.slice(0, 12)}) listo [${source}]`);
    }
    console.log(root);
  } catch (err) {
    console.error(`[fetch-package] ERROR: ${err.message}`);
    process.exit(1);
  }
}
