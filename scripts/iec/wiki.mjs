#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ruta IEC 61131-3: escribe las clases de la wiki (JW-Page,
// src/content/docs/wiki/curso-iec-61131) y el README.md de cada lección de la
// librería, con los textos de textos.mjs y el programa de ejemplo en los tres
// lenguajes (el Ladder y el FBD dibujados en SVG desde el proyecto).
//
//   node scripts/iec/wiki.mjs <carpeta de JW-Page>
// Después: node scripts/importar-wiki-curso.mjs <carpeta de JW-Page> (GUIA.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { LECCIONES } from "./lecciones.mjs";
import { fbdSvg, ladderSvg } from "./svg.mjs";
import { TEXTOS } from "./textos.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CURSO = join(ROOT, "JWPLC_Aprende", "extras", "Curso_IEC_61131");
const page = resolve(process.argv[2] ?? join(ROOT, "..", "jw-page"));
const WIKI = join(page, "src", "content", "docs", "wiki", "curso-iec-61131");
if (!existsSync(join(page, "astro.config.mjs"))) {
  console.error(`[wiki] no encuentro JW-Page en ${page}`);
  process.exit(1);
}

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const unitNum = (u) => Number(/^(\d+)/.exec(u)[1]);
const read = (dir, lang) => readFileSync(join(dir, lang, "pous", "programs", `main.${lang.toLowerCase()}`), "utf8");
const stBody = (txt) => txt.replace(/\r\n/g, "\n").trimEnd();
// Lección C++ hermana (la del banco), para enlazarla.
const CPP = join(page, "src", "content", "docs", "wiki", "curso-jwplc-basic");
const cppLink = (bench) => {
  const nn = bench.slice(6);
  for (const u of readdirSync(CPP).filter((d) => /^unidad-\d+$/.test(d))) {
    const f = readdirSync(join(CPP, u)).find((x) => x.startsWith(`${nn}-`) && x.endsWith(".mdx"));
    if (f) return `/wiki/curso-jwplc-basic/${u}/${f.replace(/\.mdx$/, "")}/`;
  }
  return "/wiki/curso-jwplc-basic/";
};

export function lessonUrl(l) {
  return `/wiki/curso-iec-61131/unidad-${unitNum(l.unit)}/${l.id.slice(4)}-${slug(l.title)}/`;
}

function figure(svg, caption) {
  return `<figure>\n${svg.trim()}\n<figcaption>${caption}</figcaption>\n</figure>`;
}

function mdx(l, t) {
  const dir = join(CURSO, l.unit, l.folder);
  const num = l.id.slice(4);
  const st = stBody(read(dir, "ST"));
  const ld = ladderSvg(read(dir, "LD"));
  const fbd = fbdSvg(read(dir, "FBD"));
  const list = (a) => a.map((x) => `- ${x}`).join("\n");
  return `---
title: "Lección ${num}: ${l.title}"
description: "${t.descripcion.replace(/"/g, '\\"')}"
sidebar:
  label: "${num} · ${l.title}"
  order: ${Number(num)}
---

import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección ${l.bench.slice(6)} en C++](${cppLink(l.bench)})

${t.intro}

## Qué vas a aprender

${list(t.aprende)}

${t.idea.replace(/^### /gm, "## ")}

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

<Tabs syncKey="iec-lenguaje">
<TabItem label="ST">

\`\`\`pascal title="main.st"
${st}
\`\`\`

</TabItem>
<TabItem label="Ladder">

${figure(ld, `Ladder (LD) de la lección ${num}, como se ve en el OpenPLC Editor.`)}

</TabItem>
<TabItem label="FBD">

${figure(fbd, `FBD de la lección ${num}: entradas a la izquierda, bloques al centro y salidas a la derecha.`)}

</TabItem>
</Tabs>

## Cómo funciona el programa

${t.como}

## Pruébalo en JWPLC Sim

${t.sim.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Para practicar

**${l.brief.goal}**

${l.brief.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

<Aside type="tip" title="Qué te llevas">
${l.brief.teaches}
</Aside>
`;
}

function readme(l, t) {
  const num = l.id.slice(4);
  const list = (a) => a.map((x) => `- ${x}`).join("\n");
  return `# Curso IEC 61131-3 · Lección ${num} · ${l.title}

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

${t.intro}

## Qué vas a aprender

${list(t.aprende)}

## Cómo funciona el programa

${t.como}

## Qué conectar

${list(l.brief.uses)}

## Para practicar

${list([l.brief.goal, ...l.brief.steps])}

## En JWPLC Sim

${t.sim.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;
}

const units = new Map();
for (const l of LECCIONES) {
  const t = TEXTOS[l.id];
  if (!t) {
    console.warn(`[wiki] ${l.id}: sin textos; se omite`);
    continue;
  }
  const u = unitNum(l.unit);
  const out = join(WIKI, `unidad-${u}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${l.id.slice(4)}-${slug(l.title)}.mdx`), mdx(l, t));
  writeFileSync(join(CURSO, l.unit, l.folder, "README.md"), readme(l, t));
  if (!units.has(u)) units.set(u, { name: l.unit.replace(/^\d+\./, "").replace(/_/g, " "), lessons: [] });
  units.get(u).lessons.push({ l, t });
}

// Presentación y temario.
const NAMES = { 1: "Contactos y lógica", 2: "Tiempo y conteo", 3: "Secuencias", 4: "Comparar y calcular", 5: "Comunicaciones" };
let index = `---
title: Curso IEC 61131-3
description: Programa el JWPLC Basic con los lenguajes de la norma IEC 61131-3 (ST, Ladder y FBD) en el OpenPLC Editor y pruébalo en JWPLC Sim. Cada lección en los tres lenguajes.
sidebar:
  label: Presentación y temario
  order: 0
---

import { Aside, LinkCard, CardGrid } from "@astrojs/starlight/components";

La misma ruta del [Curso JWPLC Basic](/wiki/curso-jwplc-basic/), ahora con los lenguajes de la norma **IEC 61131-3**: los de cualquier PLC industrial. Cada lección trae el programa en **texto estructurado (ST)**, **Ladder (LD)** y **diagrama de bloques (FBD)**; eliges uno y la práctica se califica igual.

<Aside type="note" title="Qué necesitas">
El OpenPLC Editor con la placa JWPLC Basic y JWPLC Sim. En el Sim, **Inicio → Ruta de aprendizaje** abre cada práctica con su banco: el ST se edita en el mismo Sim; Ladder y FBD, en el OpenPLC Editor, y el Sim recompila al guardar.
</Aside>

## Temario
`;
for (const [u, x] of [...units].sort((a, b) => a[0] - b[0])) {
  index += `\n### Unidad ${u} · ${NAMES[u] ?? x.name}\n\n<CardGrid>\n`;
  for (const { l, t } of x.lessons) index += `  <LinkCard title="${l.id.slice(4)} · ${l.title}" description="${t.aprende[0].replace(/`/g, "").replace(/"/g, "'")}" href="${lessonUrl(l)}" />\n`;
  index += `</CardGrid>\n`;
}
index += `
### Próximas unidades

| Unidad | Qué se aprende |
|---|---|
| 3 · Secuencias | Etapas, CASE en ST, el semáforo, bloques de función propios |
| 4 · Comparar y calcular | INT y REAL, comparadores, MOVE, escalado |
| 5 · Comunicaciones | Modbus desde el OpenPLC Editor, variables ubicadas de red, pantalla HMI |

SFC (diagrama de funciones secuenciales) llega cuando el OpenPLC Editor lo compile para el JWPLC Basic.
`;
mkdirSync(WIKI, { recursive: true });
writeFileSync(join(WIKI, "index.mdx"), index);
console.log(`[wiki] ${[...units.values()].reduce((n, u) => n + u.lessons.length, 0)} lecciones IEC → ${WIKI}`);
