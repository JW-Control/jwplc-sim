// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Librería JWPLC_Aprende: única fuente del material de aprendizaje.
//   examples/Curso_JWPLC_Basic/…   lecciones del curso (ejemplos de Arduino IDE)
//   extras/practicas/curso-NN/     práctica evaluada de cada lección (banco .jwsim, rubrica.json, sketch = el ejemplo, solucion)
//   extras/retos/<id>/             retos calificables (.jwsim, ENUNCIADO.md, rubrica.json, sketch, solucion)
//   extras/arquitecturas/<id>/     casos de la vitrina (.jwsim, VITRINA.md, sketch)
//   extras/imagenes/               miniaturas (reto-<id>.jpg, arq-<id>.jpg)
//   catalogo.json                  todo lo anterior resumido para la web (gen-catalogo.mjs)
// La usan la app (Inicio, Ejemplos), jwsim-cli, las pruebas y la web.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { buildCourse } from "./aprende-curso.mjs";
import { loadProject } from "./project.mjs";

export const APRENDE = join(import.meta.dirname, "..", "..", "JWPLC_Aprende");
export const APRENDE_NAME = "JWPLC_Aprende";
export const RETOS = join(APRENDE, "extras", "retos");
export const PRACTICAS = join(APRENDE, "extras", "practicas");
export const ARQUITECTURAS = join(APRENDE, "extras", "arquitecturas");
export const IMAGENES = join(APRENDE, "extras", "imagenes");
export const CATALOGO = join(APRENDE, "catalogo.json");

/** Versión de la librería (library.properties). */
export function aprendeVersion(root = APRENDE) {
  try {
    return /^version=(.+)$/m.exec(readFileSync(join(root, "library.properties"), "utf8"))?.[1].trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Ejemplos de la librería con el mismo formato que listExamples() de la app.
 * @returns {{ group: string, name: string, label: string, dir: string }[]}
 */
export function listAprendeExamples(root = APRENDE) {
  const ex = join(root, "examples");
  const out = [];
  if (!existsSync(ex)) return out;
  const walk = (/** @type {string} */ d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory()) continue;
      const p = join(d, e.name);
      if (existsSync(join(p, `${e.name}.ino`))) out.push({ group: APRENDE_NAME, name: e.name, label: relative(ex, p).split(sep).join(" / "), dir: p });
      else walk(p);
    }
  };
  walk(ex);
  return out;
}

/** Objetivos en vivo de una rúbrica, resumidos ([] si no hay). */
function goalsOf(/** @type {string} */ dir) {
  try {
    const r = JSON.parse(readFileSync(join(dir, "rubrica.json"), "utf8"));
    return (r.goals ?? []).map((/** @type {any} */ g) => ({ id: g.id, text: g.description ?? g.id, extra: g.extra === "merit" }));
  } catch {
    return [];
  }
}

/**
 * Curso JWPLC Basic: unidades con sus lecciones. Una lección con práctica
 * evaluada (extras/practicas/<id>) trae `graded: true` y sus objetivos.
 */
export const listCurso = (root = APRENDE) =>
  buildCourse(listAprendeExamples(root)).map((u) => ({
    ...u,
    lessons: u.lessons.map((l) => {
      const dir = join(root, "extras", "practicas", l.id);
      const has = existsSync(join(dir, `${l.id}.jwsim`));
      return { ...l, graded: has, goals: has ? goalsOf(dir) : [] };
    }),
  }));

/** Una lección del curso con el código de su ejemplo (o null). */
export function lessonById(/** @type {string} */ id, root = APRENDE) {
  for (const u of listCurso(root)) {
    const l = u.lessons.find((x) => x.id === id);
    if (!l) continue;
    let code = "";
    try {
      code = readFileSync(join(l.dir, `${l.dir.split(sep).pop()}.ino`), "utf8").replace(/\r\n/g, "\n");
    } catch {}
    return { ...l, unit: u.unit, unitName: u.name, code };
  }
  return null;
}

// Para la ficha del reto: el primer párrafo del enunciado y los objetivos en
// vivo de la rúbrica.
function retoExtras(/** @type {string} */ dir) {
  let intro = "";
  /** @type {{ id: string, text: string, extra: boolean }[]} */
  let goals = goalsOf(dir);
  try {
    const md = readFileSync(join(dir, "ENUNCIADO.md"), "utf8").replace(/\r\n/g, "\n");
    const para = md.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !x.startsWith("#"));
    intro = (para ?? "").replace(/^\*\*Nivel \d+\.\*\*\s*/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  } catch {}
  return { intro, goals };
}

/** Retos con su nivel, ficha (brief), primer párrafo del enunciado y objetivos. */
export function listRetos(root = join(APRENDE, "extras", "retos")) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const d of readdirSync(root).sort()) {
    const f = join(root, d, `${d}.jwsim`);
    if (!existsSync(f)) continue;
    try {
      const { project } = loadProject(f);
      if (project.exercise) out.push({ id: d, title: project.name, level: project.exercise.level ?? 1, brief: project.exercise.brief ?? null, ...retoExtras(join(root, d)) });
    } catch {
      // un reto roto no impide listar los demás
    }
  }
  return out;
}

/** Arquitecturas con el resumen de su VITRINA.md. */
export function listArquitecturas(root = join(APRENDE, "extras", "arquitecturas")) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const d of readdirSync(root).sort()) {
    const f = join(root, d, `${d}.jwsim`);
    if (!existsSync(f)) continue;
    try {
      let summary = "";
      try {
        // VITRINA.md: la primera línea es el título; las siguientes, hasta «Recorrido», la descripción.
        const lines = readFileSync(join(root, d, "VITRINA.md"), "utf8").split(/\r?\n/).slice(1);
        const end = lines.findIndex((l) => /^\s*(Recorrido|Fallas)/.test(l));
        summary = lines.slice(0, end < 0 ? 3 : end).map((l) => l.trim()).filter(Boolean).join(" ");
      } catch {}
      out.push({ id: d, title: loadProject(f).project.name, summary });
    } catch {
      // una arquitectura rota no impide listar las demás
    }
  }
  return out;
}

/** Nombre de la miniatura de un reto o arquitectura (o null si no hay). */
export function imageOf(/** @type {"reto" | "arq"} */ kind, /** @type {string} */ id, root = APRENDE) {
  const f = `${kind}-${id}.jpg`;
  return existsSync(join(root, "extras", "imagenes", f)) ? `extras/imagenes/${f}` : null;
}

/**
 * Catálogo para la web y otros repositorios: rutas relativas a la librería,
 * sin rutas absolutas ni fechas, para que el archivo solo cambie cuando
 * cambia el contenido.
 */
export function buildCatalog(root = APRENDE) {
  const rel = (/** @type {string} */ p) => relative(root, p).split(sep).join("/");
  return {
    libreria: APRENDE_NAME,
    version: aprendeVersion(root),
    curso: listCurso(root).map((u) => ({
      unidad: u.unit,
      nombre: u.name,
      lecciones: u.lessons.map((l) => ({
        id: l.id,
        numero: l.num,
        titulo: l.title,
        ruta: rel(l.dir),
        aprende: l.learn,
        necesita: l.need,
        secciones: l.sections.filter((s) => s.items.length).map((s) => ({ titulo: s.title, items: s.items })),
        pasos: l.steps,
        practica: l.practice,
        ...(l.graded ? { practica_evaluada: { ruta: `extras/practicas/${l.id}`, objetivos_en_vivo: l.goals } } : {}),
      })),
    })),
    retos: listRetos(join(root, "extras", "retos")).map((r) => ({
      id: r.id,
      titulo: r.title,
      nivel: r.level,
      ruta: `extras/retos/${r.id}`,
      imagen: imageOf("reto", r.id, root),
      introduccion: r.intro,
      objetivo: r.brief?.goal ?? "",
      ensena: r.brief?.teaches ?? "",
      pasos: r.brief?.steps ?? [],
      en_la_mesa: r.brief?.uses ?? [],
      objetivos_en_vivo: r.goals,
    })),
    arquitecturas: listArquitecturas(join(root, "extras", "arquitecturas")).map((a) => ({
      id: a.id,
      titulo: a.title,
      ruta: `extras/arquitecturas/${a.id}`,
      imagen: imageOf("arq", a.id, root),
      resumen: a.summary,
    })),
  };
}
