// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Ejecutar en vivo» (app/lib/plc-live.mjs) contra un JWPLC «real» de prueba:
// el firmware Baremetal de una lección IEC corre en el runner y su UART0 sale
// por un pty (como el COM del USB). LiveSession abre ese pty con serialport,
// igual que con la placa:
//   CONECTA   MD5 del programa de la placa = el compilado
//   LEE       una entrada física (I0_0) llega como cambio de señal y de variable
//   FUERZA    un clic en una entrada del Sim fuerza la variable en la placa
//   LIBERA    al detener se liberan los forzados
//   MD5_MAL   con otro programa compilado se niega a conectar
// Solo Linux (pty). Necesita la cadena del editor (node scripts/fetch-editor.mjs).
//   cd app && node --test tests/plc-live.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { editorPaths, resolveEditor } from "../../scripts/fetch-editor.mjs";
import { LiveSession, locatedVars } from "../lib/plc-live.mjs";
import { fakeJwplc as fakeBoard } from "./helpers/fake-jwplc.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const LESSON = join(ROOT, "JWPLC_Aprende", "extras", "Curso_IEC_61131", "1.Contactos_y_logica", "01.Contactos_y_bobinas", "LD");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function build(dir) {
  const r = spawnSync(process.execPath, [join(ROOT, "cli", "jwsim-cli.mjs"), "build", dir, "--json"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const j = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.ok(j.ok, j.error);
  return j.executable;
}

const opsP = resolveEditor({ fetch: false }).then(({ dir }) => createRequire(import.meta.url)(editorPaths(dir).ladderOps));
const work = mkdtempSync(join(tmpdir(), "jwsim-live-"));
cpSync(LESSON, join(work, "a"), { recursive: true });
const exeP = Promise.resolve().then(() => build(join(work, "a")));

test("variables con dirección de configuration.cpp", async () => {
  const loc = locatedVars(await exeP);
  assert.deepEqual(loc.get("S1"), { loc: "%IX0.0", signal: "I0_0" });
  assert.deepEqual(loc.get("H1"), { loc: "%QX0.0", signal: "Q0_0" });
});

test("en vivo contra la placa: conecta, lee, fuerza y libera", { skip: process.platform !== "linux" }, async () => {
  const ops = await opsP;
  const exe = await exeP;
  const board = await fakeBoard(exe);
  const live = new LiveSession({ ops, exe, path: board.tty, periodMs: 100 });
  const seen = [];
  let last = {};
  live.on("values", (v) => {
    last = v.values;
    seen.push(...v.changes);
  });
  try {
    const info = await live.start();
    assert.equal(info.vars, 4);
    await sleep(400);
    assert.equal(last.S1, false);
    // Entrada física en la placa → se ve en el Sim.
    board.runner.send({ type: "set", signal: "I0_0", value: 1 });
    await sleep(600);
    assert.equal(last.S1, true, "S1 no llegó en vivo");
    assert.ok(seen.some(([s, v]) => s === "I0_0" && v === 1));
    // El programa de la placa responde (peldaño «H1 sigue a S1») y la salida se ve.
    assert.equal(last.H1, true, "H1 no siguió a S1");
    assert.ok(seen.some(([s, v]) => s === "Q0_0" && v === 1), "Q0.0 no llegó como señal");
    board.runner.send({ type: "set", signal: "I0_0", value: 0 });
    await sleep(400);
    // Clic en I0.1 del Sim → fuerza S2 en la placa.
    assert.equal(await live.setSignal("I0_1", 1), "S2");
    await sleep(600);
    assert.equal(last.S2, true, "S2 no quedó forzada");
  } finally {
    await live.stop();
  }
  // Liberado: vuelve a mandar la entrada física (0).
  const check = new LiveSession({ ops, exe, path: board.tty, periodMs: 100 });
  let after = {};
  check.on("values", (v) => (after = v.values));
  await check.start();
  await sleep(400);
  await check.stop();
  board.close();
  assert.equal(after.S2, false, "S2 quedó forzada después de detener");
});

test("se niega con otro programa en la placa (MD5)", { skip: process.platform !== "linux" }, async () => {
  const ops = await opsP;
  const exe = await exeP;
  // Otro programa: la misma lección con un peldaño cambiado de nombre.
  cpSync(LESSON, join(work, "b"), { recursive: true });
  const f = join(work, "b", "pous", "programs", "main.ld");
  writeFileSync(f, readFileSync(f, "utf8").replaceAll("H2", "H9"));
  const other = build(join(work, "b"));
  const board = await fakeBoard(other);
  const live = new LiveSession({ ops, exe, path: board.tty });
  try {
    await assert.rejects(live.start(), /no es el mismo/);
  } finally {
    board.close();
  }
});
