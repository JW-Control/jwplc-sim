#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G3_BUS_ANALYZER: capturas de referencia (tests/bus/*.json)
// comparadas contra la decodificación esperada.
//
// Cada captura tiene `items` (ítems crudos del runner) y `esperado` (una
// entrada por fila decodificada con los campos que deben coincidir). Las
// capturas con `fuente.sketch` se vuelven a capturar del firmware real (sin
// modificar) y deben ser idénticas a las guardadas: la captura es
// determinista. Las sintéticas cubren lo que el firmware aún no puede
// generar en G3 (respuestas Modbus, Modbus TCP sin modelo W5500, tarjeta SD).
//
//   node scripts/gate-g3-bus-analyzer.mjs            verifica
//   node scripts/gate-g3-bus-analyzer.mjs --record   reescribe los `items` de
//                                                    las capturas con sketch
//   node scripts/gate-g3-bus-analyzer.mjs --show     imprime las filas
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { captureBuses } from "./lib/bus-capture.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";

const { createDecoder } = createRequire(import.meta.url)("../app/lib/bus-decode.cjs");
const target = targetArg();
const record = process.argv.includes("--record");
const show = process.argv.includes("--show");
const dir = join(ROOT, "tests", "bus");

// Rutas de sketch: "package:<ruta en el repo del package>", "arbol:<ruta en
// el árbol del core (JWPLC_PACKAGE_TREE)>" o relativas a este repositorio.
function sketchPath(ref) {
  const { root, lock } = resolvePackageRoot();
  if (ref.startsWith("package:")) return join(root, ref.slice("package:".length));
  if (ref.startsWith("arbol:")) return join(root, lock.JWPLC_PACKAGE_TREE, ref.slice("arbol:".length));
  return join(ROOT, ref);
}

const keyOf = (it) => `${it[1]}${typeof it[2] === "string" ? `:${it[2]}` : ""}`;

// Coincidencia parcial: cada campo esperado debe estar en el decodificado.
function matches(want, got) {
  if (want === null || typeof want !== "object") return want === got;
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length && want.every((w, i) => matches(w, got[i]));
  return got !== null && typeof got === "object" && Object.entries(want).every(([k, v]) => matches(v, got[k]));
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const captures = new Map(); // sketch+until -> items (una corrida por sketch)
const perturbation = {}; // sketch -> la captura no cambia el hash de traza
const criteria = {};
for (const file of files) {
  const path = join(dir, file);
  const cap = JSON.parse(readFileSync(path, "utf8"));
  const name = file.replace(/\.json$/, "");
  let live = null;
  if (cap.fuente?.sketch) {
    const k = `${cap.fuente.sketch}@${cap.fuente.until_ms}`;
    if (!captures.has(k)) {
      const { exe } = await buildSketch(sketchPath(cap.fuente.sketch), { target, log: () => {} });
      const c = await captureBuses(exe, cap.fuente.until_ms);
      captures.set(k, c.items);
      const plain = parseResult(runExe(exe, ["--until", String(cap.fuente.until_ms), "--quiet"]).stdout);
      perturbation[k] = { pass: plain?.trace_hash === c.hash, con_captura: c.hash, sin_captura: plain?.trace_hash };
    }
    const re = new RegExp(cap.fuente.filtro);
    live = captures.get(k).filter((it) => re.test(keyOf(it))).slice(0, cap.fuente.max ?? Infinity);
    if (record) {
      cap.items = live;
      writeFileSync(path, JSON.stringify(cap, null, 2) + "\n");
    }
  }
  const dec = createDecoder();
  const rows = cap.items.flatMap((it) => dec.decode(it));
  if (show) {
    console.log(`\n== ${name}`);
    rows.forEach((r, i) => console.log(`${i}: [${r.bus}] ${r.dev} | ${r.op} | ${r.data} | ${JSON.stringify(r.fields)}`));
  }
  const bad = [];
  (cap.esperado ?? []).forEach((want, i) => {
    if (!rows[i] || !matches(want, { ...rows[i].fields, level: rows[i].level, dev: rows[i].dev })) bad.push({ fila: i, esperado: want, obtenido: rows[i] ?? null });
  });
  const sameCapture = live === null || JSON.stringify(live) === JSON.stringify(cap.items);
  criteria[name] = {
    pass: sameCapture && bad.length === 0 && rows.length === (cap.esperado ?? []).length,
    filas: rows.length,
    esperadas: (cap.esperado ?? []).length,
    ...(live ? { captura_identica: sameCapture } : { sintetica: true }),
    ...(bad.length ? { diferencias: bad.slice(0, 3) } : {}),
  };
}

// Observar los buses no altera la simulación.
criteria.sin_perturbacion = { pass: Object.values(perturbation).every((p) => p.pass), corridas: perturbation };
const pass = printCriteria("JWSIM_G3_BUS_ANALYZER", criteria, ` (${target})`);
writeReport(`JWSIM_G3_BUS_ANALYZER-${target}`, { gate: "JWSIM_G3_BUS_ANALYZER", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
