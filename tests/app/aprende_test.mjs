// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Librería JWPLC_Aprende (cli/lib/aprende.mjs): el catálogo está al día y
// cada reto y arquitectura tiene su proyecto e imagen.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { APRENDE, buildCatalog, CATALOGO, listAprendeExamples } from "../../cli/lib/aprende.mjs";

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

test("los ejemplos de la librería salen con su grupo y ruta", () => {
  const ex = listAprendeExamples();
  assert.ok(ex.length >= 11);
  assert.ok(ex.every((e) => e.group === "JWPLC_Aprende" && e.label.startsWith("Curso_JWPLC_Basic / ")));
});
