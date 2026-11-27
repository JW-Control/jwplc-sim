// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Trae las lecciones del Curso JWPLC Basic de la wiki de jw-control.com
// (repositorio JW-Page, src/content/docs/wiki/curso-jwplc-basic) a la
// librería JWPLC_Aprende: cada lección queda como GUIA.md junto a su sketch y
// el Sim la muestra a la izquierda del código. La wiki es la fuente: después
// de cambiarla allí, se vuelve a correr esto.
//
//   node scripts/importar-wiki-curso.mjs <carpeta de JW-Page>
//
// Conversión de MDX a Markdown: sin frontmatter ni imports; <Aside> pasa a
// alerta de GitHub (> [!TIP] Título); el programa completo (entre
// {/* programa:inicio */} y {/* programa:fin */}) se reemplaza por
// <!-- programa -->, porque el código ya está en el sketch; los enlaces de la
// wiki quedan absolutos (https://jw-control.com/…).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CURSO = join(ROOT, "JWPLC_Aprende", "examples", "Curso_JWPLC_Basic");
// Ruta IEC 61131-3: misma wiki, otra sección; las lecciones viven en extras/.
const CURSO_IEC = join(ROOT, "JWPLC_Aprende", "extras", "Curso_IEC_61131");
const SITE = "https://jw-control.com";

const page = resolve(process.argv[2] ?? join(ROOT, "..", "jw-page"));
const WIKI = join(page, "src", "content", "docs", "wiki", "curso-jwplc-basic");
if (!existsSync(WIKI)) {
  console.error(`[wiki] no encuentro ${WIKI}: indique la carpeta de JW-Page`);
  process.exit(1);
}

const ALERT = { note: "NOTE", tip: "TIP", caution: "WARNING", danger: "CAUTION" };

/** MDX de una lección de la wiki → Markdown para GUIA.md. */
export function mdxToGuia(mdx, source) {
  let s = mdx.replace(/\r\n/g, "\n");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(s);
  const title = /^title:\s*"?(.*?)"?\s*$/m.exec(fm?.[1] ?? "")?.[1] ?? "";
  if (fm) s = s.slice(fm[0].length);
  s = s.replace(/^import .*\n/gm, "");
  s = s.replace(/\{\/\*\s*programa:inicio\s*\*\/\}[\s\S]*?\{\/\*\s*programa:fin\s*\*\/\}/, "<!-- programa -->");
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}\n?/g, "");
  // Pestañas (ruta IEC: el programa en ST, Ladder y FBD): un título por pestaña.
  s = s.replace(/<Tabs[^>]*>\n?/g, "").replace(/<\/Tabs>\n?/g, "").replace(/<\/TabItem>\n?/g, "");
  s = s.replace(/<TabItem\s+label="([^"]+)"[^>]*>/g, "#### $1");
  s = s.replace(/<Aside(?:\s+type="(\w+)")?(?:\s+title="([^"]*)")?\s*>\n?([\s\S]*?)\n?<\/Aside>/g, (_m, type, t, body) => {
    const head = `> [!${ALERT[type ?? "note"] ?? "NOTE"}]${t ? ` ${t}` : ""}`;
    return [head, ...body.trim().split("\n").map((l) => (l ? `> ${l}` : ">"))].join("\n");
  });
  s = s.replace(/\]\((\/[^)]*)\)/g, (_m, p) => `](${SITE}${p})`);
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  const head = `<!-- Copia de la wiki (${source}). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->`;
  return `${head}\n\n# ${title}\n\n${s}\n`;
}

const lessons = new Map();
for (const unit of readdirSync(CURSO).filter((d) => /^\d+\./.test(d)))
  for (const l of readdirSync(join(CURSO, unit)).filter((d) => /^\d+\./.test(d))) lessons.set(l.slice(0, 2), join(CURSO, unit, l));

let n = 0;
for (const unit of readdirSync(WIKI).filter((d) => /^unidad-\d+$/.test(d)).sort()) {
  for (const f of readdirSync(join(WIKI, unit)).filter((x) => /^\d+-.*\.mdx$/.test(x)).sort()) {
    const dir = lessons.get(f.slice(0, 2));
    if (!dir) {
      console.warn(`[wiki] ${unit}/${f}: no hay lección ${f.slice(0, 2)} en el curso; se omite`);
      continue;
    }
    const out = mdxToGuia(readFileSync(join(WIKI, unit, f), "utf8"), `wiki/curso-jwplc-basic/${unit}/${f}`);
    writeFileSync(join(dir, "GUIA.md"), out);
    n++;
  }
}
// Ruta IEC: wiki/curso-iec-61131/unidad-N/NN-*.mdx → extras/Curso_IEC_61131/<unidad>/NN.*/GUIA.md
const WIKI_IEC = join(page, "src", "content", "docs", "wiki", "curso-iec-61131");
if (existsSync(WIKI_IEC) && existsSync(CURSO_IEC)) {
  const iec = new Map();
  for (const unit of readdirSync(CURSO_IEC).filter((d) => /^\d+\./.test(d)))
    for (const l of readdirSync(join(CURSO_IEC, unit)).filter((d) => /^\d+\./.test(d))) iec.set(l.slice(0, 2), join(CURSO_IEC, unit, l));
  for (const unit of readdirSync(WIKI_IEC).filter((d) => /^unidad-\d+$/.test(d)).sort()) {
    for (const f of readdirSync(join(WIKI_IEC, unit)).filter((x) => /^\d+-.*\.mdx$/.test(x)).sort()) {
      const dir = iec.get(f.slice(0, 2));
      if (!dir) {
        console.warn(`[wiki] IEC ${unit}/${f}: no hay lección ${f.slice(0, 2)} en la ruta IEC; se omite`);
        continue;
      }
      writeFileSync(join(dir, "GUIA.md"), mdxToGuia(readFileSync(join(WIKI_IEC, unit, f), "utf8"), `wiki/curso-iec-61131/${unit}/${f}`));
      n++;
    }
  }
}
console.log(`[wiki] ${n} lecciones → GUIA.md`);
