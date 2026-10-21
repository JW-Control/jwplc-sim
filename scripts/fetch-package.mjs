#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Descarga el árbol del package JWPLC fijado en package.lock, sin copiarlo al
// repositorio. Resultado: .jwsim/package/<REF>/ (ignorado por git).
//
// Uso:
//   node scripts/fetch-package.mjs            # clona/verifica según package.lock
//   node scripts/fetch-package.mjs --print    # solo imprime la ruta resuelta
//
// Variables:
//   JWPLC_PACKAGE_DIR  ruta a un checkout local de platform-jwplc. Si es un repo
//                      git se verifica que HEAD o el tag coincidan con el commit
//                      fijado; nunca se modifica ese checkout.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

// Devuelve la raíz del checkout (directorio que contiene JWPLC/2.1.0).
export function resolvePackageRoot({ fetch = true } = {}) {
  const lock = readLock();
  const override = process.env.JWPLC_PACKAGE_DIR;

  if (override) {
    const dir = resolve(override);
    if (!existsSync(join(dir, lock.JWPLC_PACKAGE_TREE))) {
      throw new Error(`JWPLC_PACKAGE_DIR=${dir} no contiene ${lock.JWPLC_PACKAGE_TREE}`);
    }
    const head = revParse(dir, "HEAD");
    if (head && head !== lock.JWPLC_PACKAGE_COMMIT) {
      // Un checkout local en otra rama se acepta solo si el árbol del package
      // es idéntico al del tag fijado (p. ej. main con el cierre publicado).
      const tagCommit = revParse(dir, lock.JWPLC_PACKAGE_REF);
      let same = false;
      if (tagCommit === lock.JWPLC_PACKAGE_COMMIT) {
        try {
          execFileSync("git", ["diff", "--quiet", lock.JWPLC_PACKAGE_REF, "HEAD", "--", ...SPARSE_PATHS], { cwd: dir });
          same = true;
        } catch {
          same = false;
        }
      }
      if (!same) {
        throw new Error(
          `JWPLC_PACKAGE_DIR=${dir} está en ${head.slice(0, 12)} y su árbol difiere de ` +
            `${lock.JWPLC_PACKAGE_REF} (${lock.JWPLC_PACKAGE_COMMIT.slice(0, 12)}).`,
        );
      }
    }
    return { root: dir, lock, source: "JWPLC_PACKAGE_DIR" };
  }

  const dest = join(ROOT, ".jwsim", "package", lock.JWPLC_PACKAGE_REF);
  if (existsSync(join(dest, ".git"))) {
    const head = revParse(dest, "HEAD");
    if (head === lock.JWPLC_PACKAGE_COMMIT) return { root: dest, lock, source: "cache" };
    if (!fetch) throw new Error(`${dest} está en ${head}, se esperaba ${lock.JWPLC_PACKAGE_COMMIT}`);
    rmSync(dest, { recursive: true, force: true });
  }
  if (!fetch) throw new Error(`Package no descargado. Ejecute: node scripts/fetch-package.mjs`);

  mkdirSync(dirname(dest), { recursive: true });
  console.error(`[fetch-package] clonando ${lock.JWPLC_PACKAGE_REPO} @ ${lock.JWPLC_PACKAGE_REF}`);
  execFileSync(
    "git",
    ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", lock.JWPLC_PACKAGE_REF, lock.JWPLC_PACKAGE_REPO, dest],
    { stdio: "inherit" },
  );
  execFileSync("git", ["sparse-checkout", "set", "--no-cone", ...SPARSE_PATHS.map((p) => `/${p}`)], { cwd: dest, stdio: "inherit" });
  const head = revParse(dest, "HEAD");
  if (head !== lock.JWPLC_PACKAGE_COMMIT) {
    throw new Error(
      `El tag ${lock.JWPLC_PACKAGE_REF} apunta a ${head}, pero package.lock fija ${lock.JWPLC_PACKAGE_COMMIT}. ` +
        `¿Se movió el tag? No se continúa.`,
    );
  }
  return { root: dest, lock, source: "clone" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { root, lock, source } = resolvePackageRoot({ fetch: !process.argv.includes("--print") });
    if (!process.argv.includes("--print")) {
      console.error(`[fetch-package] ${lock.JWPLC_PACKAGE_REF} (${lock.JWPLC_PACKAGE_COMMIT.slice(0, 12)}) listo [${source}]`);
    }
    console.log(root);
  } catch (err) {
    console.error(`[fetch-package] ERROR: ${err.message}`);
    process.exit(1);
  }
}
