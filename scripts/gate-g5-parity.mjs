#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G5_RELEASE_TREE_PARITY: jwsim-cli parity <ref>.
//   C1: el package fijado no tiene diferencias (0 fuentes sin clasificar,
//       0 headers faltantes, autoload y librerías como en el registro).
//   C2: un árbol con una fuente nueva en el core que incluye un header de
//       ESP-IDF inexistente se informa con ambas diferencias y código 1.
//   C3: un tag anterior (v2.1.0-alpha.10, otro autoload y otras librerías)
//       se informa como lista de diferencias y código 1.
import { spawnSync } from "node:child_process";
import { copyFileSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, writeReport } from "./lib/gate-util.mjs";

const CLI = join(ROOT, "cli", "jwsim-cli.mjs");
const OLD_REF = "v2.1.0-alpha.10";

function cli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 1800000 });
  let json = null;
  try {
    json = JSON.parse((r.stdout ?? "").trim().split(/\r?\n/).pop());
  } catch {}
  return { code: r.status, json, stderr: r.stderr ?? "" };
}

// Copia del árbol con enlaces duros (sin tocar el original: solo se agregan
// archivos nuevos a la copia).
function linkTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const s = join(src, e.name);
    const d = join(dst, e.name);
    if (e.isDirectory()) linkTree(s, d);
    else {
      try {
        linkSync(s, d);
      } catch {
        copyFileSync(s, d);
      }
    }
  }
}

const criteria = {};
{
  const r = cli(["parity"]);
  criteria.C1_pinned_package = {
    pass: r.code === 0 && r.json?.ok === true && r.json.differences.length === 0,
    code: r.code,
    ref: r.json?.package?.ref,
    core_sources: r.json?.core?.sources,
    probed_sources: r.json?.headers?.probed,
    autoload: r.json?.autoload?.libraries?.length,
  };
}
{
  const { root, lock } = resolvePackageRoot();
  const synth = join(ROOT, "build", "gates", "parity-synthetic");
  rmSync(synth, { recursive: true, force: true });
  linkTree(join(root, "JWPLC"), join(synth, "JWPLC"));
  writeFileSync(join(synth, lock.JWPLC_PACKAGE_TREE, "cores", "jwcontrol", "esp32-hal-jwsim-paridad.c"), "#include <esp_jwsim_inexistente.h>\nint jwsim_paridad;\n");
  const r = cli(["parity", "--package", synth]);
  const d = r.json?.differences ?? [];
  criteria.C2_synthetic_tree = {
    pass: r.code === 1 && d.some((x) => x.includes("sin clasificar") && x.includes("esp32-hal-jwsim-paridad.c")) && d.some((x) => x.includes("<esp_jwsim_inexistente.h>")),
    code: r.code,
    differences: d,
  };
  rmSync(synth, { recursive: true, force: true });
}
{
  const r = cli(["parity", OLD_REF]);
  const d = r.json?.differences ?? [];
  criteria.C3_older_tag = {
    pass: r.code === 1 && d.some((x) => x.startsWith("autoload:")) && d.some((x) => x.startsWith("librerías:")),
    code: r.code,
    ref: OLD_REF,
    differences: d,
  };
}

const os = process.platform === "win32" ? "windows" : process.platform;
writeReport("JWSIM_G5_RELEASE_TREE_PARITY", { os, criteria });
process.exit(printCriteria("JWSIM_G5_RELEASE_TREE_PARITY", criteria, ` (${os})`) ? 0 : 1);
