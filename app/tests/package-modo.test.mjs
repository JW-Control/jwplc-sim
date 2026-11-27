// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Selector de package (Herramientas → Package JWPLC): «publicado» usa el de
// package.lock; «local» encuentra el checkout por la placa jwplc_local del
// Arduino15 (junction → platform-jwplc/JWPLC/2.1.0), como el OpenPLC Editor.
//   cd app && node --test tests/package-modo.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { localPackageDir, readLock, resolvePackageRoot } from "../../scripts/fetch-package.mjs";

const kind = process.platform === "win32" ? "junction" : "dir";

function entorno() {
  const base = mkdtempSync(join(tmpdir(), "jwsim-pkg-"));
  const repo = join(base, "platform-jwplc");
  const tree = join(repo, readLock().JWPLC_PACKAGE_TREE);
  mkdirSync(join(tree, "libraries"), { recursive: true });
  writeFileSync(join(tree, "platform.txt"), "name=JWPLC\n");
  const a15 = join(base, "Arduino15");
  const hw = join(a15, "packages", "jwplc_local", "hardware", "esp32");
  mkdirSync(hw, { recursive: true });
  symlinkSync(tree, join(hw, "2.1.0-dev"), kind);
  return { repo, a15 };
}

function con(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) {
    old[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(old)) if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  }
}

test("local: encuentra platform-jwplc por la junction de jwplc_local", () => {
  const { repo, a15 } = entorno();
  con({ JWSIM_ARDUINO15: a15, JWPLC_PACKAGE_DIR: undefined }, () => {
    assert.equal(localPackageDir(), resolve(repo));
    con({ JWSIM_PACKAGE: "local" }, () => {
      const p = resolvePackageRoot({ fetch: false });
      assert.equal(p.source, "dir");
      assert.equal(p.root, resolve(repo));
    });
  });
});

test("publicado: ignora el package local", () => {
  const { a15, repo } = entorno();
  con({ JWSIM_ARDUINO15: a15, JWPLC_PACKAGE_DIR: repo, JWSIM_PACKAGE: "publicado" }, () => {
    let p;
    try {
      p = resolvePackageRoot({ fetch: false });
    } catch (err) {
      // Sin el package publicado descargado: lo dice, pero nunca usa el local.
      assert.match(err.message, /no descargado/);
      return;
    }
    assert.notEqual(p.source, "dir");
  });
});

test("local sin jwplc_local: error claro", () => {
  const base = mkdtempSync(join(tmpdir(), "jwsim-pkg-"));
  con({ JWSIM_ARDUINO15: base, JWPLC_PACKAGE_DIR: undefined, JWSIM_PACKAGE: "local" }, () => {
    assert.equal(localPackageDir(), null);
    assert.throws(() => resolvePackageRoot({ fetch: false }), /jwplc_local/);
  });
});
