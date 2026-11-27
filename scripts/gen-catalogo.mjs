// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera JWPLC_Aprende/catalogo.json: el curso, los retos y las arquitecturas
// resumidos para la página web y otros repositorios (cli/lib/aprende.mjs).
//   node scripts/gen-catalogo.mjs           escribe el catálogo
//   node scripts/gen-catalogo.mjs --check   falla si no está al día
import { readFileSync, writeFileSync } from "node:fs";

import { buildCatalog, CATALOGO } from "../cli/lib/aprende.mjs";

const text = `${JSON.stringify(buildCatalog(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(CATALOGO, "utf8").replace(/\r\n/g, "\n");
  } catch {}
  if (cur !== text) {
    console.error("[catalogo] JWPLC_Aprende/catalogo.json no está al día: node scripts/gen-catalogo.mjs");
    process.exit(1);
  }
  console.log("[catalogo] al día");
} else {
  writeFileSync(CATALOGO, text);
  const c = JSON.parse(text);
  console.log(`[catalogo] ${c.curso.reduce((n, u) => n + u.lecciones.length, 0)} lecciones C++, ${c.curso_iec.reduce((n, u) => n + u.lecciones.length, 0)} IEC, ${c.retos.length} retos, ${c.arquitecturas.length} arquitecturas`);
}
