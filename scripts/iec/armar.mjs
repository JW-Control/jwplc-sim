#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Arma la ruta IEC 61131-3 en JWPLC_Aprende a partir de scripts/iec/lecciones.mjs:
//   extras/Curso_IEC_61131/<unidad>/<lección>/{ST,LD,FBD}   el ejemplo en los tres lenguajes
//   extras/practicas/iec-NN/                                  banco (el de la lección C++
//       hermana), rubrica.json, iniciar/{ST,LD,FBD} (= el ejemplo) y solucion/{ST,LD,FBD}
// El README.md de cada lección se escribe a mano y no se toca.
//
//   node scripts/iec/armar.mjs [iec-01 …]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { LECCIONES } from "./lecciones.mjs";
import { fbdProgram, ldProgram, stProgram, writeProject } from "./proyecto.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const APRENDE = join(ROOT, "JWPLC_Aprende");
const CURSO = join(APRENDE, "extras", "Curso_IEC_61131");
const PRACTICAS = join(APRENDE, "extras", "practicas");
const LANGS = { ST: "st", LD: "ld", FBD: "fbd" };

const only = process.argv.slice(2);

async function program(lang, vars, p) {
  if (lang === "st") return stProgram({ vars, body: p.st });
  if (lang === "ld") return ldProgram({ vars, rungs: p.ld.rungs });
  return fbdProgram({ vars, networks: p.fbd.networks });
}

async function writeSet(dir, l, p) {
  for (const [L, lang] of Object.entries(LANGS)) writeProject(join(dir, L), { name: `${l.project}_${lang}`, lang, program: await program(lang, l.vars, p) });
}

function rubricOf(l) {
  if (!l.rubricFrom) return { $schema: "../../../../schema/jwsim-rubric-1.json", id: l.id, ...l.rubric };
  const r = JSON.parse(readFileSync(join(PRACTICAS, l.rubricFrom, "rubrica.json"), "utf8"));
  r.id = l.id;
  for (const g of r.goals ?? []) if (l.hints?.[g.id]) g.hint = l.hints[g.id];
  return r;
}

for (const l of LECCIONES) {
  if (only.length && !only.includes(l.id)) continue;
  const num = l.id.slice(4);
  // Lección: el ejemplo en los tres lenguajes.
  const ldir = join(CURSO, l.unit, l.folder);
  mkdirSync(ldir, { recursive: true });
  await writeSet(ldir, l, l.example);
  if (!existsSync(join(ldir, "README.md"))) writeFileSync(join(ldir, "README.md"), `# Curso IEC 61131-3 · Lección ${num} · ${l.title}\n`);

  // Práctica: banco de la lección C++ hermana, programa de partida y solución.
  const pdir = join(PRACTICAS, l.id);
  mkdirSync(pdir, { recursive: true });
  await writeSet(join(pdir, "iniciar"), l, l.example);
  await writeSet(join(pdir, "solucion"), l, l.solution);
  const bench = JSON.parse(readFileSync(join(PRACTICAS, l.bench, `${l.bench}.jwsim`), "utf8"));
  const jw = {
    ...bench,
    name: `IEC · Lección ${num} · ${l.title}`,
    program: { kind: "openplc", project: "./iniciar/ST" },
    exercise: { lesson: l.id, rubric: "./rubrica.json", solution: "./solucion/ST", brief: l.brief },
  };
  if (l.rtc) jw.simulation = { ...(jw.simulation ?? {}), rtc: l.rtc };
  writeFileSync(join(pdir, `${l.id}.jwsim`), JSON.stringify(jw, null, 2) + "\n");
  writeFileSync(join(pdir, "rubrica.json"), JSON.stringify(rubricOf(l), null, 2) + "\n");
  console.log(`[iec] ${l.id} ${l.title}`);
}
