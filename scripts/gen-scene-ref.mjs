#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT } from "../cli/lib/build.mjs";
import { REFERENCE_PATH, renderReferenceMarkdown } from "../cli/lib/scene-spec.mjs";

const md = renderReferenceMarkdown();
writeFileSync(REFERENCE_PATH, md, "utf8");
const agentRef = join(ROOT, "docs", "agentes", "REFERENCIA_DISPOSITIVOS.md");
mkdirSync(dirname(agentRef), { recursive: true });
writeFileSync(agentRef, md, "utf8");
console.log(`[gen-scene-ref] actualizado ${REFERENCE_PATH} y ${agentRef}`);
