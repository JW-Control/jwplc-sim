// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Autoformato del sketch (Ctrl+T, como Arduino IDE) con clang-format en
// WebAssembly (@wasm-fmt/clang-format): no hace falta instalar nada.
//
// Estilo: el de los ejemplos del package (llaves en línea propia, 4
// espacios, `case` al nivel del `switch`). Como en Arduino IDE 2, si la
// carpeta del sketch tiene un archivo .clang-format, manda ese.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { format } from "@wasm-fmt/clang-format";

export const JWPLC_STYLE = {
  BasedOnStyle: "LLVM",
  IndentWidth: 4,
  TabWidth: 4,
  UseTab: "Never",
  BreakBeforeBraces: "Allman",
  ColumnLimit: 0,
  SortIncludes: "Never",
  IndentCaseLabels: false,
  AccessModifierOffset: -4,
  NamespaceIndentation: "None",
  FixNamespaceComments: false,
  PointerAlignment: "Right",
  Cpp11BracedListStyle: true,
  AllowShortFunctionsOnASingleLine: "Empty",
  AllowShortIfStatementsOnASingleLine: "Never",
  AllowShortLoopsOnASingleLine: false,
  AllowShortBlocksOnASingleLine: "Empty",
  AllowShortCaseLabelsOnASingleLine: false,
  // Los comentarios del usuario no se tocan (ni alineación ni corte).
  AlignTrailingComments: { Kind: "Leave" },
  ReflowComments: false,
  KeepEmptyLinesAtTheStartOfBlocks: false,
  MaxEmptyLinesToKeep: 2,
  IndentPPDirectives: "None",
  AlignEscapedNewlines: "Left",
  InsertNewlineAtEOF: true,
};

// Estilo que aplica a la carpeta: su .clang-format o el del JWPLC.
export function styleFor(sketchDir) {
  const own = sketchDir && join(sketchDir, ".clang-format");
  if (own && existsSync(own)) return { style: readFileSync(own, "utf8"), source: ".clang-format del sketch" };
  return { style: JSON.stringify(JWPLC_STYLE), source: "estilo JWPLC" };
}

// Devuelve el texto formateado. `fileName` decide el lenguaje: un .ino se
// trata como C++ (igual que Arduino IDE).
export function formatSource(text, fileName, sketchDir) {
  const { style, source } = styleFor(sketchDir);
  const name = /\.ino$/i.test(fileName) ? fileName.replace(/\.ino$/i, ".cpp") : fileName;
  return { text: format(text, name, style), style: source };
}
