// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Centro de aprendizaje: los ejercicios por nivel, con el progreso del
// alumno. Un nivel se abre al terminar todos los del anterior; dentro de un
// nivel abierto, los retos se hacen en cualquier orden. El docente puede
// desbloquear todo. Un reto queda hecho al cumplir sus objetivos en vivo o
// al aprobar con Calificar (PASS_GRADE o más).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PASS_GRADE = 14;
export const LEVEL_NAMES = { 1: "Fundamentos", 2: "Secuencias y procesos", 3: "Alarmas y procesos continuos" };

/** @typedef {{ id: string, title: string, level: number, brief?: { goal?: string, steps?: string[], uses?: string[], teaches?: string } }} Exercise */
/** @typedef {{ done: Record<string, { at: number, via: "goals" | "grade", grade?: number }>, unlockAll: boolean }} Progress */

/** @returns {Progress} */
export const emptyProgress = () => ({ done: {}, unlockAll: false });

/** Lee el progreso guardado; si falta o está dañado, empieza de cero. @param {string} file */
export function loadProgress(file) {
  try {
    const p = JSON.parse(readFileSync(file, "utf8"));
    return { done: p && typeof p.done === "object" && p.done ? p.done : {}, unlockAll: !!p?.unlockAll };
  } catch {
    return emptyProgress();
  }
}

/** @param {string} file @param {Progress} p */
export function saveProgress(file, p) {
  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
}

/**
 * Marca un reto como hecho. Con Calificar solo cuenta una nota aprobatoria;
 * se guarda la mejor.
 * @param {Progress} p @param {string} id @param {"goals" | "grade"} via @param {number} [grade]
 * @returns {boolean} si cambió algo
 */
export function markDone(p, id, via, grade) {
  if (via === "grade" && !(Number(grade) >= PASS_GRADE)) return false;
  const prev = p.done[id];
  if (prev && (via !== "grade" || Number(prev.grade ?? 0) >= Number(grade))) return false;
  p.done[id] = { at: Date.now(), via: prev?.via === "goals" ? "goals" : via, ...(via === "grade" || prev?.grade !== undefined ? { grade: Math.max(Number(grade ?? 0), Number(prev?.grade ?? 0)) } : {}) };
  return true;
}

/**
 * Niveles con el estado de cada reto: done, next (el siguiente sugerido, uno
 * solo), open o locked.
 * @param {Exercise[]} exercises @param {Progress} p @param {{ unlockAll?: boolean }} [o]
 */
export function levels(exercises, p, { unlockAll = p.unlockAll } = {}) {
  const byLevel = new Map();
  for (const e of [...exercises].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))) {
    if (!byLevel.has(e.level)) byLevel.set(e.level, []);
    byLevel.get(e.level).push(e);
  }
  let prevDone = true;
  let next = null;
  const out = [];
  for (const [level, list] of byLevel) {
    const open = unlockAll || prevDone;
    const items = list.map((e) => {
      const done = !!p.done[e.id];
      let state = done ? "done" : open ? "open" : "locked";
      if (!done && open && !next) {
        next = e.id;
        state = "next";
      }
      return { id: e.id, title: e.title, level, state, teaches: e.brief?.teaches ?? "", grade: p.done[e.id]?.grade ?? null };
    });
    const doneCount = items.filter((x) => x.state === "done").length;
    out.push({ level, name: LEVEL_NAMES[level] ?? `Nivel ${level}`, open, done: doneCount, total: items.length, items });
    prevDone = prevDone && doneCount === items.length;
  }
  const all = out.flatMap((l) => l.items);
  return { levels: out, next, done: all.filter((x) => x.state === "done").length, total: all.length, unlockAll };
}

/** El reto que sigue a `id` (el siguiente sin hacer y abierto), o null. */
export function nextAfter(exercises, p, id, o) {
  const items = levels(exercises, p, o).levels.flatMap((l) => l.items);
  const i = items.findIndex((x) => x.id === id);
  const after = [...items.slice(i + 1), ...items.slice(0, Math.max(0, i))];
  return after.find((x) => x.state === "next" || x.state === "open")?.id ?? null;
}
