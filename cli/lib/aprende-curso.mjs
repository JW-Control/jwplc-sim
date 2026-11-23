// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Curso JWPLC Basic: las lecciones viven en la librería JWPLC_Aprende
// (examples/Curso_JWPLC_Basic/<N.Unidad>/<NN.Leccion>). Cada una trae su guía
// en README.md (qué se aprende, qué se necesita, cómo probarla y un reto para
// practicar) y el sketch queda solo con el código. Una lección sin README.md
// todavía se lee de su comentario de cabecera, como antes. Aquí solo se leen;
// si se suman unidades, aparecen solas.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const COURSE_DIR = "Curso_JWPLC_Basic";

const SECTIONS = {
  learn: /^qué vas a aprender/i,
  need: /^qué necesitas/i,
  steps: /^cómo probarlo/i,
  practice: /^para practicar/i,
};

/**
 * Lee la cabecera de una lección (el primer comentario de bloque). Las
 * secciones conocidas van a learn/need/steps/practice; las demás («Qué
 * conectar», «Por qué normalmente cerrado»…) a `sections` con su título.
 * @param {string} text
 * @returns {{ title: string, num: number | null, learn: string[], need: string[], steps: string[], practice: string[], sections: { title: string, items: string[] }[] }}
 */
export function parseLesson(text) {
  const out = { title: "", num: null, learn: [], need: [], steps: [], practice: [], sections: [] };
  const m = /\/\*([\s\S]*?)\*\//.exec(String(text).replace(/\r\n/g, "\n"));
  if (!m) return out;
  let list = null;
  let last = null;
  for (const raw of m[1].split("\n")) {
    const line = raw.trim();
    if (!line) {
      last = null;
      continue;
    }
    const head = /^Curso JWPLC Basic\s*·\s*Lecci[oó]n\s*(\d+)\s*·\s*(.+)$/i.exec(line);
    if (head) {
      out.num = Number(head[1]);
      out.title = head[2].trim();
      continue;
    }
    const item = /^(?:-|\d+\.)\s+(.*)$/.exec(line);
    // Un renglón suelto, corto y sin punto final después de un blanco es un título de sección.
    if (!item && last === null && line.length <= 60 && !/[.:;,]$/.test(line)) {
      const key = Object.keys(SECTIONS).find((k) => SECTIONS[k].test(line));
      if (key) list = out[key];
      else {
        const sec = { title: line, items: [] };
        out.sections.push(sec);
        list = sec.items;
      }
      continue;
    }
    if (!list) continue;
    if (item) {
      list.push(item[1]);
      last = list.length - 1;
    } else if (last !== null) {
      list[last] += ` ${line}`; // continuación de la viñeta anterior
    } else {
      list.push(line);
      last = list.length - 1;
    }
  }
  return out;
}

/**
 * Lee la guía de una lección en Markdown (README.md): «# Curso JWPLC Basic ·
 * Lección NN · Título», secciones «## …» con viñetas, pasos numerados,
 * párrafos y bloques de código. Devuelve lo mismo que parseLesson().
 * @param {string} text
 */
export function parseLessonMd(text) {
  const out = { title: "", num: null, learn: [], need: [], steps: [], practice: [], sections: [] };
  let list = null;
  let last = null;
  let fence = null;
  for (const raw of String(text).replace(/\r\n/g, "\n").split("\n")) {
    if (fence) {
      if (/^\s*```/.test(raw)) {
        if (list && fence.length) list.push(fence.join("\n"));
        fence = null;
      } else fence.push(raw);
      continue;
    }
    if (/^\s*```/.test(raw)) {
      fence = [];
      last = null;
      continue;
    }
    const line = raw.trim();
    if (!line) {
      last = null;
      continue;
    }
    const h1 = /^#\s+Curso JWPLC Basic\s*·\s*Lecci[oó]n\s*(\d+)\s*·\s*(.+)$/i.exec(line);
    if (h1) {
      out.num = Number(h1[1]);
      out.title = h1[2].trim();
      continue;
    }
    const h2 = /^#{2,}\s+(.+)$/.exec(line);
    if (h2) {
      const title = h2[1].trim();
      const key = Object.keys(SECTIONS).find((k) => SECTIONS[k].test(title));
      if (key) list = out[key];
      else {
        const sec = { title, items: [] };
        out.sections.push(sec);
        list = sec.items;
      }
      last = null;
      continue;
    }
    if (!list) continue;
    const item = /^(?:-|\*|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      last = list.length - 1;
    } else if (last !== null) list[last] += ` ${line}`;
    else {
      list.push(line);
      last = list.length - 1;
    }
  }
  return out;
}

/** «2.Tiempo_y_logica» → { unit: 2, name: "Tiempo y lógica" } (tildes del README cuando las hay). */
const UNIT_NAMES = {
  "Primeros pasos": "Primeros pasos",
  "Tiempo y logica": "El tiempo y la lógica",
  "Pantalla y botonera": "Pantalla y botonera",
  "Reloj memoria y registro": "Reloj, memoria y registro",
  Comunicaciones: "Comunicaciones",
  Proyectos: "Proyectos",
};
export function unitOf(folder) {
  const m = /^(\d+)\.(.+)$/.exec(folder);
  if (!m) return null;
  const plain = m[2].replace(/_/g, " ").replace(/,/g, "").trim();
  return { unit: Number(m[1]), name: UNIT_NAMES[plain] ?? plain };
}

/**
 * Agrupa los ejemplos del curso (los de listExamples() de main.mjs) en
 * unidades con sus lecciones.
 * @param {{ group: string, label: string, dir: string }[]} examples
 * @param {(file: string) => string} [read]
 */
export function buildCourse(examples, read = (f) => readFileSync(f, "utf8")) {
  const units = new Map();
  for (const ex of examples) {
    const parts = String(ex.label).split(" / ");
    if (parts[0] !== COURSE_DIR || parts.length < 3) continue;
    const u = unitOf(parts[1]);
    if (!u) continue;
    let info;
    let readme = "";
    try {
      readme = read(join(ex.dir, "README.md"));
      info = parseLessonMd(readme);
    } catch {
      try {
        info = parseLesson(read(join(ex.dir, `${basename(ex.dir)}.ino`)));
      } catch {
        continue;
      }
    }
    const num = info.num ?? Number(/^(\d+)/.exec(parts[2])?.[1] ?? 0);
    if (!units.has(u.unit)) units.set(u.unit, { unit: u.unit, name: u.name, lessons: [] });
    units.get(u.unit).lessons.push({
      id: `curso-${String(num).padStart(2, "0")}`,
      num,
      title: info.title || parts[2].replace(/^\d+\./, "").replace(/_/g, " "),
      dir: ex.dir,
      learn: info.learn,
      need: info.need,
      steps: info.steps,
      practice: info.practice,
      sections: info.sections,
      readme: String(readme).replace(/\r\n/g, "\n"),
    });
  }
  return [...units.values()].sort((a, b) => a.unit - b.unit).map((u) => ({ ...u, lessons: u.lessons.sort((a, b) => a.num - b.num) }));
}
