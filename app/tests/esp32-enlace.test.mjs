// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Subir al JWPLC» enlaza el package (en modo en vivo, el checkout del
// usuario: jwplc_local) dentro de los datos de la app. Al cambiar la carpeta
// de versión o rehacer el enlace, se quita SOLO el enlace: los archivos del
// package no se tocan.
//   cd app && node --test tests/esp32-enlace.test.mjs
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { prepareEsp32, removeEntry } from "../../cli/lib/esp32.mjs";

const kind = process.platform === "win32" ? "junction" : "dir";

function paquete(base) {
  const tree = join(base, "pkg", "JWPLC", "2.1.0");
  mkdirSync(join(tree, "cores", "esp32"), { recursive: true });
  writeFileSync(join(tree, "platform.txt"), "name=JWPLC\n");
  writeFileSync(join(tree, "boards.txt"), "x\n");
  writeFileSync(join(tree, "cores", "esp32", "Arduino.h"), "//\n");
  return tree;
}

test("removeEntry quita el enlace y no borra la carpeta enlazada", () => {
  const base = mkdtempSync(join(tmpdir(), "jwsim-enlace-"));
  const tree = paquete(base);
  const link = join(base, "datos", "enlace");
  mkdirSync(join(base, "datos"));
  symlinkSync(tree, link, kind);
  // Una carpeta real con un enlace dentro tampoco arrastra el destino.
  const real = join(base, "datos", "real");
  mkdirSync(real);
  symlinkSync(tree, join(real, "dentro"), kind);
  removeEntry(link);
  removeEntry(real);
  assert.equal(lstatSync(link, { throwIfNoEntry: false }), undefined);
  assert.equal(existsSync(real), false);
  assert.ok(existsSync(join(tree, "cores", "esp32", "Arduino.h")));
  assert.ok(existsSync(join(tree, "boards.txt")));
});

test("prepareEsp32 cambia de carpeta de versión sin borrar el package en vivo", () => {
  const base = mkdtempSync(join(tmpdir(), "jwsim-subir-"));
  const tree = paquete(base);
  const dataDir = join(base, "arduino");
  const hwBase = join(dataDir, "packages", "jwplc_sim", "hardware", "esp32");
  mkdirSync(hwBase, { recursive: true });
  // Enlace de una versión anterior (otra rama u otra versión del Sim).
  symlinkSync(tree, join(hwBase, "2.1.0-alpha.18_JWPLC-Sim_main"), kind);
  const pkg = { root: join(base, "pkg"), lock: { JWPLC_PACKAGE_TREE: join("JWPLC", "2.1.0"), JWPLC_PACKAGE_REF: "main" } };
  const env = prepareEsp32({ dataDir, package: pkg });
  assert.equal(env.version, "0.0.0-main");
  assert.equal(existsSync(join(hwBase, "2.1.0-alpha.18_JWPLC-Sim_main")), false);
  assert.ok(existsSync(join(hwBase, "0.0.0-main", "platform.txt")));
  // Otra rama: se vuelve a cambiar y el package sigue entero.
  prepareEsp32({ dataDir, package: { ...pkg, lock: { ...pkg.lock, JWPLC_PACKAGE_REF: "feature/x" } } });
  for (const f of ["platform.txt", "boards.txt", join("cores", "esp32", "Arduino.h")]) assert.ok(existsSync(join(tree, f)), f);
});

test("cancelar la compilación corta arduino-cli (botón Cancelar de Subir)", { skip: process.platform === "win32" }, async () => {
  const { compileEsp32 } = await import("../../cli/lib/esp32.mjs");
  const { chmodSync } = await import("node:fs");
  const base = mkdtempSync(join(tmpdir(), "jwsim-cancelar-"));
  const cli = join(base, "arduino-cli");
  writeFileSync(cli, "#!/bin/sh\necho compilando\nsleep 30\n");
  chmodSync(cli, 0o755);
  const ac = new AbortController();
  const t0 = Date.now();
  setTimeout(() => ac.abort(), 300);
  const r = await compileEsp32(base, { cli, missing: [], config: join(base, "c.yaml"), version: "x", dataDir: base }, { buildDir: join(base, "b"), signal: ac.signal });
  assert.equal(r.cancelled, true);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 5000);
});
