// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Curso JWPLC Basic en Inicio (cli/lib/aprende-curso.mjs) y lecciones vistas
// (markLesson de app/lib/learning.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCourse, parseLesson, parseLessonMd, unitOf } from "../../cli/lib/aprende-curso.mjs";
import { emptyProgress, markLesson } from "../../app/lib/learning.mjs";

const INO = `/*
  Curso JWPLC Basic · Lección 08 · Marcha y parada de un motor

  Qué vas a aprender
  - El circuito más usado: arrancar un motor y que siga
    en marcha al soltarlo.
  - Por qué la parada es NC.

  Qué conectar
  - I0.0: pulsador de MARCHA.

  Cómo probarlo
  1. Un toque a MARCHA cierra Q0.0.
  2. Un toque a PARADA lo abre.

  Para practicar
  - Agrega una lámpara de marcha en Q0.2.
*/
void setup() {}
`;

test("lee título, número y secciones de la cabecera", () => {
  const l = parseLesson(INO);
  assert.equal(l.num, 8);
  assert.equal(l.title, "Marcha y parada de un motor");
  assert.deepEqual(l.learn, ["El circuito más usado: arrancar un motor y que siga en marcha al soltarlo.", "Por qué la parada es NC."]);
  assert.deepEqual(l.sections, [{ title: "Qué conectar", items: ["I0.0: pulsador de MARCHA."] }]);
  assert.deepEqual(l.steps, ["Un toque a MARCHA cierra Q0.0.", "Un toque a PARADA lo abre."]);
  assert.deepEqual(l.practice, ["Agrega una lámpara de marcha en Q0.2."]);
});

const MD = `# Curso JWPLC Basic · Lección 08 · Marcha y parada de un motor

## Qué vas a aprender

- El circuito más usado: arrancar un motor y que siga
  en marcha al soltarlo.
- Por qué la parada es NC.

## Qué conectar

- I0.0: pulsador de MARCHA.

## La regla

\`\`\`text
motor = (marcha O motor) Y parada
\`\`\`

"O motor" es el sello.

## Cómo probarlo

1. Un toque a MARCHA cierra Q0.0.
2. Un toque a PARADA lo abre.

## Para practicar

- Agrega una lámpara de marcha en Q0.2.
`;

test("lee la guía de la lección en README.md igual que la cabecera", () => {
  const l = parseLessonMd(MD);
  const c = parseLesson(INO);
  assert.equal(l.num, 8);
  assert.equal(l.title, c.title);
  assert.deepEqual(l.learn, c.learn);
  assert.deepEqual(l.steps, c.steps);
  assert.deepEqual(l.practice, c.practice);
  assert.deepEqual(l.sections, [
    { title: "Qué conectar", items: ["I0.0: pulsador de MARCHA."] },
    { title: "La regla", items: ["motor = (marcha O motor) Y parada", '"O motor" es el sello.'] },
  ]);
});

test("con README.md la guía sale de ahí; sin él, de la cabecera del sketch", () => {
  const ex = [
    { group: "g", label: "Curso_JWPLC_Basic / 2.Tiempo_y_logica / 08.Marcha_y_parada", dir: "/x/08.Marcha_y_parada" },
    { group: "g", label: "Curso_JWPLC_Basic / 2.Tiempo_y_logica / 09.Temporizadores", dir: "/x/09.Temporizadores" },
  ];
  const read = (f) => {
    if (f.includes("08.") && f.endsWith("README.md")) return MD;
    if (f.endsWith("README.md")) throw new Error("ENOENT");
    return `/*\n  Curso JWPLC Basic · Lección 09 · Temporizadores\n\n  Para practicar\n  - Cambia el tiempo.\n*/`;
  };
  const [u] = buildCourse(ex, read);
  assert.deepEqual(u.lessons.map((l) => [l.id, l.practice, !!l.readme]), [
    ["curso-08", ["Agrega una lámpara de marcha en Q0.2."], true],
    ["curso-09", ["Cambia el tiempo."], false],
  ]);
});

test("nombre de unidad con tildes", () => {
  assert.deepEqual(unitOf("2.Tiempo_y_logica"), { unit: 2, name: "El tiempo y la lógica" });
  assert.deepEqual(unitOf("7.Algo_nuevo"), { unit: 7, name: "Algo nuevo" });
  assert.equal(unitOf("README"), null);
});

test("agrupa solo los ejemplos del curso, por unidad y en orden", () => {
  const ex = [
    { group: "JWPLC_GlobalPeripherals", label: "01.DigitalIO_Basic", dir: "/x/01.DigitalIO_Basic" },
    { group: "JWPLC_GlobalPeripherals", label: "Curso_JWPLC_Basic / 2.Tiempo_y_logica / 08.Marcha_y_parada", dir: "/x/08.Marcha_y_parada" },
    { group: "JWPLC_GlobalPeripherals", label: "Curso_JWPLC_Basic / 1.Primeros_pasos / 02.Encender_un_rele", dir: "/x/02.Encender_un_rele" },
    { group: "JWPLC_GlobalPeripherals", label: "Curso_JWPLC_Basic / 1.Primeros_pasos / 01.Hola_JWPLC", dir: "/x/01.Hola_JWPLC" },
  ];
  const read = (f) => (f.endsWith("README.md") ? (() => { throw new Error("ENOENT"); })() : f.includes("08.") ? INO : `/*\n  Curso JWPLC Basic · Lección ${f.includes("01.") ? "01 · Hola" : "02 · Relé"}\n*/`);
  const c = buildCourse(ex, read);
  assert.deepEqual(c.map((u) => [u.unit, u.name, u.lessons.map((l) => l.id)]), [
    [1, "Primeros pasos", ["curso-01", "curso-02"]],
    [2, "El tiempo y la lógica", ["curso-08"]],
  ]);
});

test("una lección vista se marca una sola vez", () => {
  const p = emptyProgress();
  assert.equal(markLesson(p, "curso-01"), true);
  assert.equal(markLesson(p, "curso-01"), false);
  assert.ok(p.lessons["curso-01"] > 0);
});
