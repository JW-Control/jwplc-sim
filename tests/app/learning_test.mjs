// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Centro de aprendizaje (app/lib/learning.mjs): niveles, desbloqueo,
// «a continuación», nota aprobatoria y progreso guardado.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { emptyProgress, levels, loadProgress, markDone, nextAfter, PASS_GRADE, saveProgress } from "../../app/lib/learning.mjs";

const EX = [
  { id: "01-a", title: "A", level: 1 },
  { id: "02-b", title: "B", level: 1 },
  { id: "03-c", title: "C", level: 2 },
  { id: "04-d", title: "D", level: 3 },
];
const states = (r) => r.levels.flatMap((l) => l.items.map((x) => `${x.id}:${x.state}`)).join(" ");

test("sin progreso: nivel 1 abierto con el primero «a continuación», el resto bloqueado", () => {
  const r = levels(EX, emptyProgress());
  assert.equal(states(r), "01-a:next 02-b:open 03-c:locked 04-d:locked");
  assert.deepEqual(r.levels.map((l) => l.open), [true, false, false]);
  assert.equal(r.next, "01-a");
});

test("un nivel se abre al terminar todos los del anterior, en cualquier orden", () => {
  const p = emptyProgress();
  markDone(p, "02-b", "goals");
  assert.equal(states(levels(EX, p)), "01-a:next 02-b:done 03-c:locked 04-d:locked");
  markDone(p, "01-a", "goals");
  assert.equal(states(levels(EX, p)), "01-a:done 02-b:done 03-c:next 04-d:locked");
});

test("el docente desbloquea todo", () => {
  const r = levels(EX, { done: {}, unlockAll: true });
  assert.ok(r.levels.every((l) => l.open));
  assert.equal(states(r), "01-a:next 02-b:open 03-c:open 04-d:open");
});

test("Calificar cuenta solo con nota aprobatoria y guarda la mejor", () => {
  const p = emptyProgress();
  assert.equal(markDone(p, "01-a", "grade", PASS_GRADE - 0.5), false);
  assert.equal(p.done["01-a"], undefined);
  assert.ok(markDone(p, "01-a", "grade", 15));
  assert.equal(markDone(p, "01-a", "grade", 14), false);
  assert.ok(markDone(p, "01-a", "grade", 20));
  assert.equal(p.done["01-a"].grade, 20);
  assert.equal(markDone(p, "01-a", "goals"), false, "ya estaba hecho");
});

test("siguiente reto: el próximo abierto sin hacer", () => {
  const p = emptyProgress();
  markDone(p, "01-a", "goals");
  assert.equal(nextAfter(EX, p, "01-a"), "02-b");
  markDone(p, "02-b", "goals");
  assert.equal(nextAfter(EX, p, "02-b"), "03-c");
  markDone(p, "03-c", "goals");
  markDone(p, "04-d", "goals");
  assert.equal(nextAfter(EX, p, "04-d"), null);
});

test("el progreso se guarda y uno dañado empieza de cero", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-learn-"));
  const f = join(dir, "sub", "aprendizaje.json");
  const p = emptyProgress();
  markDone(p, "01-a", "goals");
  saveProgress(f, p);
  assert.ok(loadProgress(f).done["01-a"]);
  writeFileSync(f, "{roto");
  assert.deepEqual(loadProgress(f), emptyProgress());
});

test("los ejercicios del repositorio traen ficha y quedan en 3 niveles", () => {
  const root = join(import.meta.dirname, "..", "..", "JWPLC_Aprende", "extras", "retos");
  const ex = readdirSync(root).map((id) => {
    const f = readdirSync(join(root, id)).find((x) => x.endsWith(".jwsim"));
    const p = JSON.parse(readFileSync(join(root, id, f), "utf8"));
    return { id, title: p.name, level: p.exercise.level ?? 1, brief: p.exercise.brief };
  });
  for (const e of ex) {
    assert.ok(e.brief?.goal && e.brief.steps?.length && e.brief.uses?.length && e.brief.teaches, `${e.id}: ficha completa`);
  }
  const r = levels(ex, emptyProgress());
  assert.equal(r.levels.length, 3);
  assert.equal(r.total, 10);
});
