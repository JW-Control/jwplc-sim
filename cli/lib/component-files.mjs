// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Carpeta de un componente declarativo (editor de componentes):
//   jwsim-device.json  manifiesto (kind "scene", entry "component.json")
//   component.json     el componente (scene/component.mjs)
//   art.svg            el dibujo que subió el autor (opcional)
//   symbol.svg         el símbolo generado (scene/component-symbol.mjs)
//   README.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildComponent, componentTerminals } from "../../scene/component.mjs";
import { symbolSvg } from "../../scene/component-symbol.mjs";
import { MANIFEST } from "./device.mjs";

export const ART = "art.svg";

/** Nombre de carpeta a partir del tipo: utec/tanque-nft → tanque-nft. */
export const folderOf = (type) => String(type).split("/")[1] ?? String(type);

/**
 * Escribe (o actualiza) la carpeta del componente. Valida antes de escribir.
 * @param {string} dir carpeta del componente
 * @param {any} spec
 * @param {string | null} art SVG del autor (null: sin dibujo; undefined: deja el que había)
 */
export function writeComponent(dir, spec, art) {
  const def = buildComponent(spec);
  mkdirSync(dir, { recursive: true });
  const artFile = join(dir, ART);
  if (art === undefined && existsSync(artFile)) art = readFileSync(artFile, "utf8");
  const clean = { ...spec, format: "jwcomp/1", symbol: { ...(spec.symbol ?? {}) } };
  if (art) {
    writeFileSync(artFile, art);
    clean.symbol.art = ART;
  } else {
    delete clean.symbol.art;
  }
  const sym = symbolSvg(clean, componentTerminals(clean), art ?? null);
  // Se guarda la disposición final (ancho, alto y bornes en la grilla).
  Object.assign(clean.symbol, { width: sym.width, height: sym.height, pins: sym.pins });
  const manifest = {
    type: spec.type,
    version: spec.version,
    kind: "scene",
    name: spec.name,
    description: spec.description ?? "",
    license: spec.license ?? "MIT",
    author: spec.author ?? spec.type.split("/")[0],
    entry: "component.json",
    sdk: 1,
  };
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(dir, "component.json"), JSON.stringify(clean, null, 2) + "\n");
  writeFileSync(join(dir, "symbol.svg"), sym.svg);
  if (!existsSync(join(dir, "README.md"))) {
    writeFileSync(
      join(dir, "README.md"),
      `# ${spec.name}\n\n${spec.description ?? ""}\n\nComponente hecho con el editor de componentes de JWPLC Sim ` +
        `(Herramientas → Editor de componentes). Es solo datos: \`component.json\` (E/S, modelo por bloques y ` +
        `comunicación) y \`symbol.svg\` (generado; el dibujo original está en \`art.svg\`). Formato: \`docs/COMPONENTES.md\`.\n\n` +
        `Bornes: ${def.terminals.map((t) => `\`${t.id}\``).join(", ")}.\n`,
    );
  }
  return { dir, spec: clean, def };
}

/** Lee la carpeta de un componente: { spec, art }. */
export function readComponent(dir) {
  const file = join(dir, "component.json");
  if (!existsSync(file)) throw new Error(`${dir}: no es un componente del editor (falta component.json)`);
  const spec = JSON.parse(readFileSync(file, "utf8"));
  const artFile = join(dir, spec.symbol?.art ?? ART);
  return { spec, art: existsSync(artFile) ? readFileSync(artFile, "utf8") : null };
}
