// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Librería JWPLC_Aprende (cli/lib/aprende.mjs): el catálogo está al día y
// cada reto y arquitectura tiene su proyecto e imagen.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test } from "node:test";

import { APRENDE, buildCatalog, CATALOGO, listAprendeExamples, listCurso } from "../../cli/lib/aprende.mjs";

test("catalogo.json al día (node scripts/gen-catalogo.mjs)", () => {
  assert.equal(readFileSync(CATALOGO, "utf8").replace(/\r\n/g, "\n"), `${JSON.stringify(buildCatalog(), null, 2)}\n`);
});

test("curso, retos y arquitecturas con sus archivos", () => {
  const c = buildCatalog();
  assert.ok(c.curso.length >= 2 && c.curso[0].lecciones.length >= 5);
  assert.equal(c.retos.length, 10);
  assert.equal(c.arquitecturas.length, 3);
  for (const l of c.curso.flatMap((u) => u.lecciones)) {
    assert.ok(l.titulo && l.aprende.length, l.id);
    assert.ok(existsSync(join(APRENDE, l.ruta)), l.ruta);
  }
  for (const x of [...c.retos, ...c.arquitecturas]) {
    assert.ok(existsSync(join(APRENDE, x.ruta, `${x.id}.jwsim`)), x.ruta);
    assert.ok(x.imagen && existsSync(join(APRENDE, x.imagen)), `${x.id}: falta la imagen (node scripts/capturar-inicio.mjs)`);
  }
});

test("cada lección del curso trae su guía en README.md y el sketch solo el código", () => {
  for (const u of listCurso()) {
    for (const l of u.lessons) {
      assert.ok(l.readme.startsWith(`# Curso JWPLC Basic · Lección ${String(l.num).padStart(2, "0")} · `), `${l.id}: falta README.md con su título`);
      assert.ok(l.learn.length && l.steps.length && l.practice.length, `${l.id}: la guía no tiene sus secciones`);
      const ino = readFileSync(join(l.dir, `${basename(l.dir)}.ino`), "utf8");
      assert.doesNotMatch(ino, /^\s*\/\*/, `${l.id}: la guía sigue en la cabecera del sketch`);
      // La clase completa viene de la wiki (scripts/importar-wiki-curso.mjs).
      assert.match(l.guia, /<!-- programa -->/, `${l.id}: falta GUIA.md (la clase de la wiki)`);
      assert.match(l.guia, /^## Cómo funciona el programa$/m, `${l.id}: GUIA.md sin «Cómo funciona el programa»`);
    }
  }
});

test("los ejemplos de la librería salen con su grupo y ruta", () => {
  const ex = listAprendeExamples();
  assert.ok(ex.length >= 11);
  assert.ok(ex.every((e) => e.group === "JWPLC_Aprende" && e.label.startsWith("Curso_JWPLC_Basic / ")));
});

test("prácticas evaluadas del curso: banco, rúbrica y punto de partida = ejemplo de la lección", async () => {
  const { checkGoals } = await import("../../app/lib/goals.mjs");
  const { loadExercise } = await import("../../cli/lib/grade.mjs");
  const { lessonById, listCurso } = await import("../../cli/lib/aprende.mjs");
  const graded = listCurso().flatMap((u) => u.lessons.filter((l) => l.graded));
  assert.ok(graded.length >= 5, "la Unidad 1 tiene práctica evaluada");
  for (const l of graded) {
    const ex = loadExercise(join(APRENDE, "extras", "practicas", l.id));
    checkGoals(ex.rubric.goals, l.id);
    assert.ok(ex.rubric.goals.filter((g) => !g.extra).length >= 1, `${l.id}: sin objetivos obligatorios`);
    assert.ok(ex.solution && existsSync(ex.solution), `${l.id}: falta la solución`);
    // El alumno empieza con el ejemplo de la lección, tal cual.
    const name = ex.sketch.split(/[\\/]/).pop();
    const start = readFileSync(join(ex.sketch, `${name}.ino`), "utf8").replace(/\r\n/g, "\n");
    assert.equal(start, lessonById(l.id).code, `${l.id}: el sketch inicial difiere del ejemplo`);
  }
});
