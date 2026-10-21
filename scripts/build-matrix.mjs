#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Matriz de compilación: sketches de build-speed-benchmark y ejemplos de las
// librerías JW/JWPLC del package fijado. Informe en build/gates/build-matrix-<target>.json.
// Uso: node scripts/build-matrix.mjs [--target windows] [--filter texto]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";

const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const target = opt("--target") ?? "native";
const filter = opt("--filter");

const { root, lock } = resolvePackageRoot();
const tree = join(root, lock.JWPLC_PACKAGE_TREE);

function sketchesIn(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (!statSync(p).isDirectory()) continue;
    if (existsSync(join(p, `${e}.ino`))) out.push(p);
    else out.push(...sketchesIn(p));
  }
  return out;
}

const sketches = [
  ...sketchesIn(join(root, "tools", "build-speed-benchmark", "sketches")),
  ...readdirSync(join(tree, "libraries"))
    .filter((l) => /^JW/.test(l))
    .flatMap((l) => sketchesIn(join(tree, "libraries", l, "examples"))),
].filter((s) => !filter || s.includes(filter));

const expect = JSON.parse(readFileSync(join(ROOT, "tests", "matrix-expectations.json"), "utf8"));
const results = [];
for (const s of sketches) {
  const rel = relative(root, s);
  const t0 = Date.now();
  const logs = [];
  try {
    const { libraries } = await buildSketch(s, { target, outDir: join(ROOT, "build", "matrix", target, basename(s)), log: (m) => logs.push(m) });
    results.push({ sketch: rel, ok: true, libraries, seconds: (Date.now() - t0) / 1000 });
    console.log(`OK    ${rel}`);
  } catch (err) {
    const detail = logs.join("\n").split("\n").filter((l) => /error|ERROR|undefined|falta/.test(l)).slice(0, 8);
    // Clasificación: obsoleto en el package, librería no soportada (mensaje
    // explícito) o defecto del simulador.
    const key = rel.split("\\").join("/");
    const status = expect.obsolete[key]
      ? "obsolete"
      : expect.packageIssue?.[key]
        ? "package"
        : expect.externalLibrary?.[key]
          ? "external"
          : err.message.includes(expect.unsupportedPattern)
            ? "unsupported"
            : "fail";
    const reason = expect.obsolete[key] ?? expect.packageIssue?.[key] ?? expect.externalLibrary?.[key];
    results.push({ sketch: rel, ok: false, status, reason, error: err.message, detail });
    const tag = { obsolete: "OBSOL", package: "PKG  ", external: "EXTER", unsupported: "NOSOP", fail: "FALLA" }[status];
    console.log(`${tag} ${rel}: ${err.message}${status === "fail" ? "\n      " + detail.join("\n      ") : ""}`);
  }
}
const ok = results.filter((r) => r.ok).length;
const unexpected = results.filter((r) => !r.ok && r.status === "fail").length;
const obsolete = results.filter((r) => r.status === "obsolete").length;
const packageIssues = results.filter((r) => r.status === "package").length;
const external = results.filter((r) => r.status === "external").length;
const unsupported = results.filter((r) => r.status === "unsupported").length;
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", `build-matrix-${target}.json`), JSON.stringify({ package: lock.JWPLC_PACKAGE_REF, target, ok, obsolete, packageIssues, external, unsupported, unexpected, total: results.length, results }, null, 2) + "\n");
console.log(`RESULTADO (${target}): ${ok} compilan, ${unsupported} no soportados (mensaje explícito), ${obsolete} obsoletos y ${packageIssues} con defecto del package, ${external} con librería externa, ${unexpected} fallas inesperadas, de ${results.length}`);
process.exit(unexpected === 0 ? 0 : 1);
