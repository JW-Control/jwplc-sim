// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Dibujo SVG de Ladder y FBD para la wiki: el mismo de la app (app/lib/plc-diagram.cjs).
import { createRequire } from "node:module";

const d = createRequire(import.meta.url)("../../app/lib/plc-diagram.cjs");
export const { graphicBody, ladderSvg, fbdSvg } = d;
