// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ordena como tablero (entradas arriba del PLC, salidas abajo, cables largos
// de la fuente como referencia) los bancos de las prácticas indicadas, con el
// mismo «Ordenar como tablero» del editor de escenas. Solo cambia x/y de los
// equipos y «ref» de los cables.
//
//   xvfb-run -a node scripts/ordenar-practicas.mjs curso-12 curso-13 …
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("uso: node scripts/ordenar-practicas.mjs curso-NN [curso-NN …]");
  process.exit(2);
}
// playwright y electron están en app/node_modules.
const req = createRequire(join(ROOT, "app", "package.json"));
const { _electron: electron } = req("playwright");
req("electron");
const ws = mkdtempSync(join(tmpdir(), "jwsim-ord-"));
const env = { ...process.env, JWSIM_WORKSPACE: ws, JWSIM_HOME: join(ws, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [join(ROOT, "app"), `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ord-ud-"))}`], env });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
try {
  for (const id of ids) {
    const file = join(ROOT, "JWPLC_Aprende", "extras", "practicas", id, `${id}.jwsim`);
    await t((x) => window.openLessonById(x), id);
    await win.waitForTimeout(2500);
    const r = await t(() => window.jwsimTest.scene.arrange());
    if (r?.error) throw new Error(`${id}: ${r.error}`);
    const spec = await t(() => window.jwsimTest.scene.spec());
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const pos = new Map(spec.devices.map((d) => [d.id, d]));
    for (const d of doc.scene.devices) {
      const p = pos.get(d.id);
      if (p) Object.assign(d, { x: p.x, y: p.y });
    }
    const key = (w) => `${w.from}|${w.to}`;
    const refs = new Set(spec.wiring.filter((w) => w.ref).map(key));
    for (const w of doc.scene.wiring) {
      delete w.points;
      if (refs.has(key(w))) w.ref = true;
      else delete w.ref;
    }
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
    console.log(`[ordenar] ${id}: ${spec.devices.length} equipos, ${refs.size} cables como referencia`);
  }
} finally {
  await app.close();
}
