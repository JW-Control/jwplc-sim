// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modo desarrollador (etapa A de PROPUESTA_MODELOS_PROPIOS.md): validación
// de símbolos sin navegador, enlazar y quitar carpetas, registro con los
// enlazados y recarga del código sin reiniciar.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkSymbolSvg } from "../../cli/lib/symbol-check.mjs";
import { builtinDevices } from "../../scene/devices/index.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const home = mkdtempSync(join(tmpdir(), "jwsim-home-"));
process.env.JWSIM_HOME = home;
const { checkDeviceDir, installedDevices, linkDevice, localDevices, registryWithInstalled, unlinkDevice } = await import("../../cli/lib/device.mjs");

const DEF = { terminals: [{ id: "X1" }, { id: "X2" }] };
const svg = (x2 = 60, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100"/>` +
  `<circle class="jw-term" data-term="X1" cx="20" cy="12" r="8"/><circle class="jw-term" data-term="X2" cx="${x2}" cy="88" r="8"/>${extra}</svg>`;
const newDevice = (sym = svg()) => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-dev-"));
  cpSync(join(ROOT, "sdk", "template", "scene-device"), dir, { recursive: true });
  if (sym) writeFileSync(join(dir, "symbol.svg"), sym);
  return dir;
};

test("símbolo: bornes y tamaño en la grilla de 20 px", () => {
  assert.deepEqual(checkSymbolSvg(svg(), DEF).errors, []);
  assert.match(checkSymbolSvg(svg(50), DEF).errors.join(), /X2 debe tener cx múltiplo de 20 \(tiene 50\)/);
  assert.match(checkSymbolSvg(svg().replace("0 0 80 100", "0 0 85 100"), DEF).errors.join(), /múltiplos de 20 \(85 × 100\)/);
  assert.match(checkSymbolSvg(svg().replace('data-term="X2"', 'data-term="X9"'), DEF).errors.join(), /X9 no está en la definición/);
  assert.match(checkSymbolSvg(svg().replace(/<circle class="jw-term" data-term="X2"[^>]*\/>/, ""), DEF).warnings.join(), /sin dibujar.*X2/);
  assert.match(checkSymbolSvg(svg(60, `<script>alert(1)</script>`), DEF).warnings.join(), /<script> se quita/);
  assert.match(checkSymbolSvg("<g/>", DEF).errors.join(), /no es un SVG/);
});

test("los símbolos incluidos cumplen el validador", () => {
  const dir = join(ROOT, "app", "renderer", "assets", "devices");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".svg"))) {
    const def = builtinDevices.find((d) => d.type === `jwsim/${f.slice(0, -4).split("__")[0]}`);
    assert.deepEqual(checkSymbolSvg(readFileSync(join(dir, f), "utf8"), def).errors, [], f);
  }
});

test("enlazar: valida, entra al registro marcado como local y se quita", async () => {
  const dir = newDevice();
  const r = await linkDevice(dir);
  assert.equal(r.type, "autor/mi-dispositivo");
  assert.deepEqual(r.errors, []);
  assert.ok(installedDevices().some((d) => d.local && d.dir === dir));
  const reg = await registryWithInstalled();
  assert.equal(reg.get("autor/mi-dispositivo").name, "Mi dispositivo");
  await assert.rejects(linkDevice(newDevice()), /ya está enlazado/);
  assert.deepEqual(unlinkDevice("autor/mi-dispositivo"), [dir]);
  assert.equal(localDevices().length, 0);
});

test("no se enlaza un símbolo fuera de la grilla ni una carpeta sin manifiesto", async () => {
  await assert.rejects(linkDevice(newDevice(svg(50))), /cx múltiplo de 20/);
  await assert.rejects(linkDevice(mkdtempSync(join(tmpdir(), "jwsim-empty-"))), /falta jwsim-device\.json/);
  assert.equal(localDevices().length, 0);
});

test("recargar lee el código nuevo sin reiniciar; uno roto se avisa y no frena a los demás", async () => {
  const dir = newDevice();
  await linkDevice(dir);
  const src = join(dir, "device.mjs");
  writeFileSync(src, readFileSync(src, "utf8").replace('name: "Mi dispositivo"', 'name: "Baliza v2"'));
  assert.equal((await registryWithInstalled({ fresh: true })).get("autor/mi-dispositivo").name, "Baliza v2");
  writeFileSync(src, "export default {;");
  const errors = [];
  const reg = await registryWithInstalled({ fresh: true, onError: (d, err) => errors.push(`${d.type}: ${err.message}`) });
  assert.equal(errors.length, 1);
  assert.ok(reg.get("jwsim/contactor"), "la biblioteca incluida sigue");
  const chk = await checkDeviceDir(dir);
  assert.equal(chk.ok, false);
  unlinkDevice(dir);
});
