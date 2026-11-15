#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Trae la cadena de compilación del OpenPLC Editor fijada en editor.lock (G6),
// sin copiarla al repositorio. Resultado en .jwsim/editor/<REF>/ (ignorado):
//   src/, resources/sources/   fuentes del editor (sparse checkout del tag)
//   vpp/                        VPP del JWPLC Basic en PLATFORM_VPP_SHA del editor
//   deps/node_modules/          STruC++ y las dependencias exactas del editor
//   deps/pipeline.cjs           el pipeline del editor empaquetado con esbuild
//   ready.json                  versiones de todo lo anterior
//
// Uso:
//   node scripts/fetch-editor.mjs            # descarga/verifica según editor.lock
//   node scripts/fetch-editor.mjs --print    # solo imprime la ruta resuelta

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESBUILD = "0.24.2";

// Rutas del editor que usa el pipeline (sparse checkout).
const SPARSE_PATHS = ["src/", "resources/sources/", "binary-versions.json", "package-lock.json", ".github/workflows/jwplc-edition-prerelease.yml"];
const VPP_PATH = "openplc-editor-installers/v4.2.7/vpp";
const PLATFORM_REPO = "https://github.com/JW-Control/platform-jwplc.git";

// Lo que se exporta del editor: las mismas funciones que usa su main process
// para compilar (compiler-module.ts y compiler-adapter.ts). Desde 4.3 el editor
// pasa a ST con su transpilador JSON (st-transpiler) y ya no usa xml2st.
const ENTRY = `
export { runCompilePipeline } from '@root/backend/shared/compile/pipeline'
export { mergeStrucppRuntimeIntoSkeleton } from '@root/backend/shared/compile/steps/merge-strucpp-runtime-into-skeleton'
export { parseProjectFiles } from '@root/backend/shared/utils/parse-project-files'
export { preprocessPous } from '@root/backend/shared/utils/PLC/preprocess-pous'
export { fromSchemaShape, transpileToSt as runJsonTranspiler } from '@root/backend/shared/transpilers/st-transpiler'
export { buildDefaultPinMapping } from '@root/frontend/store/slices/device/default-pin-mapping'
export { buildProjectFileContent } from '@root/backend/shared/project/create-project-files'
export { resolveProjectAliases } from '@root/middleware/shared/utils/iec-address/resolve-project-aliases'
export { buildAliasIndex, migrateToRegistry, recalculate } from '@root/middleware/shared/utils/iec-address/registry'
`;

export function readEditorLock() {
  const lock = {};
  for (const line of readFileSync(join(ROOT, "editor.lock"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) lock[m[1]] = m[2];
  }
  for (const k of ["OPENPLC_EDITOR_REPO", "OPENPLC_EDITOR_REF", "OPENPLC_EDITOR_COMMIT", "STRUCPP_SHA256"]) {
    if (!lock[k]) throw new Error(`editor.lock: falta ${k}`);
  }
  return lock;
}

export const editorDir = (lock = readEditorLock()) => join(ROOT, ".jwsim", "editor", lock.OPENPLC_EDITOR_REF.replaceAll("/", "_"));

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const npm = (args, cwd) =>
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

async function download(url, sha256) {
  console.error(`[fetch-editor] descargando ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(data).digest("hex");
  if (got !== sha256) throw new Error(`SHA-256 de ${url}: ${got}, editor.lock fija ${sha256}`);
  return data;
}

function sparseClone(repo, rev, dest, paths) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  git(["-c", "init.defaultBranch=main", "init", "--quiet"], dest);
  git(["remote", "add", "origin", repo], dest);
  git(["sparse-checkout", "set", "--no-cone", ...paths.map((p) => `/${p}`)], dest);
  execFileSync("git", ["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", rev], { cwd: dest, stdio: "inherit" });
  git(["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], dest);
  return git(["rev-parse", "HEAD"], dest);
}

// Devuelve la carpeta lista (con pipeline.cjs) o la prepara si fetch=true.
export async function resolveEditor({ fetch = true } = {}) {
  const lock = readEditorLock();
  const dir = editorDir(lock);
  const readyFile = join(dir, "ready.json");
  if (existsSync(readyFile)) {
    const ready = JSON.parse(readFileSync(readyFile, "utf8"));
    if (ready.editorCommit === lock.OPENPLC_EDITOR_COMMIT && ready.platform === process.platform && ready.entry === ENTRY) return { dir, lock, ready };
  }
  if (!fetch) throw new Error("Cadena del editor OpenPLC no descargada. Ejecute: node scripts/fetch-editor.mjs");

  // 1. Fuentes del editor en el commit fijado (el tag solo como nombre).
  const src = join(dir, "editor");
  console.error(`[fetch-editor] clonando ${lock.OPENPLC_EDITOR_REPO} @ ${lock.OPENPLC_EDITOR_REF}`);
  const head = sparseClone(lock.OPENPLC_EDITOR_REPO, lock.OPENPLC_EDITOR_COMMIT, src, SPARSE_PATHS);
  if (head !== lock.OPENPLC_EDITOR_COMMIT) throw new Error(`el editor quedó en ${head}, editor.lock fija ${lock.OPENPLC_EDITOR_COMMIT}`);
  if (lock.OPENPLC_EDITOR_REF.startsWith("jwplc-editor-v")) {
    const tag = git(["ls-remote", lock.OPENPLC_EDITOR_REPO, `refs/tags/${lock.OPENPLC_EDITOR_REF}^{}`], src).split(/\s/)[0];
    if (tag && tag !== lock.OPENPLC_EDITOR_COMMIT) throw new Error(`el tag ${lock.OPENPLC_EDITOR_REF} apunta a ${tag}, editor.lock fija ${lock.OPENPLC_EDITOR_COMMIT}. ¿Se movió el tag?`);
  }
  const versions = JSON.parse(readFileSync(join(src, "binary-versions.json"), "utf8"));
  const workflow = readFileSync(join(src, ".github/workflows/jwplc-edition-prerelease.yml"), "utf8");
  const vppSha = workflow.match(/PLATFORM_VPP_SHA:\s*([0-9a-f]{40})/)?.[1];
  if (!vppSha) throw new Error("no se encontró PLATFORM_VPP_SHA en jwplc-edition-prerelease.yml del editor");

  // 2. VPP del JWPLC Basic, el mismo que empaqueta esa versión del editor.
  const vppRepo = join(dir, "platform");
  console.error(`[fetch-editor] VPP de platform-jwplc @ ${vppSha.slice(0, 12)}`);
  sparseClone(PLATFORM_REPO, vppSha, vppRepo, [`${VPP_PATH}/`]);

  // 3. Dependencias: versiones exactas del package-lock del editor + STruC++.
  const deps = join(dir, "deps");
  rmSync(deps, { recursive: true, force: true });
  mkdirSync(deps, { recursive: true });
  const pl = JSON.parse(readFileSync(join(src, "package-lock.json"), "utf8")).packages;
  const exact = ["zod", "xmlbuilder2"].map((n) => `${n}@${pl[`node_modules/${n}`].version}`);
  const sv = versions.strucpp.version.replace(/^v/, "");
  const tgz = join(deps, `strucpp-${sv}.tgz`);
  writeFileSync(tgz, await download(`https://github.com/${versions.strucpp.repository}/releases/download/${versions.strucpp.version}/strucpp-${sv}.tgz`, lock.STRUCPP_SHA256));
  writeFileSync(join(deps, "package.json"), JSON.stringify({ name: "jwsim-editor-deps", private: true }) + "\n");
  npm(["install", "--no-audit", "--no-fund", "--silent", ...exact, `esbuild@${ESBUILD}`, `./strucpp-${sv}.tgz`], deps);

  // 4. Pipeline del editor empaquetado (sin Electron).
  writeFileSync(join(dir, "entry.ts"), ENTRY);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: src, paths: { "@root/*": ["./src/*"] } } }) + "\n");
  const esbuild = createRequire(join(deps, "package.json"))("esbuild");
  esbuild.buildSync({
    entryPoints: [join(dir, "entry.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    // Dentro de deps/: así require("strucpp") resuelve en deps/node_modules.
    outfile: join(deps, "pipeline.cjs"),
    tsconfig: join(dir, "tsconfig.json"),
    external: ["strucpp", "electron"],
    nodePaths: [join(deps, "node_modules")],
    logLevel: "error",
  });

  const ready = {
    editorRef: lock.OPENPLC_EDITOR_REF,
    editorCommit: lock.OPENPLC_EDITOR_COMMIT,
    vppSha,
    strucpp: versions.strucpp.version,
    deps: exact,
    platform: process.platform,
  };
  ready.entry = ENTRY; // Si cambia lo exportado, hay que volver a empaquetar.
  writeFileSync(readyFile, JSON.stringify(ready, null, 2) + "\n");
  return { dir, lock, ready };
}

// Rutas de lo que usa cli/lib/openplc.mjs.
export function editorPaths(dir) {
  return {
    pipeline: join(dir, "deps", "pipeline.cjs"),
    sources: join(dir, "editor", "resources", "sources"),
    vpp: join(dir, "platform", VPP_PATH),
    strucpp: join(dir, "deps", "node_modules", "strucpp"),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  resolveEditor({ fetch: !process.argv.includes("--print") })
    .then(({ dir, ready }) => {
      if (!process.argv.includes("--print")) {
        console.error(`[fetch-editor] ${ready.editorRef} (${ready.editorCommit.slice(0, 12)}): STruC++ ${ready.strucpp}, VPP @ ${ready.vppSha.slice(0, 12)}`);
      }
      console.log(dir);
    })
    .catch((err) => {
      console.error(`[fetch-editor] ERROR: ${err.message}`);
      process.exitCode = 1;
    });
}
