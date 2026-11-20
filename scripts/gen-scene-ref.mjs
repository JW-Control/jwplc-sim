#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
import { writeFileSync } from "node:fs";
import { REFERENCE_PATH, renderReferenceMarkdown } from "../cli/lib/scene-spec.mjs";

const md = renderReferenceMarkdown();
writeFileSync(REFERENCE_PATH, md, "utf8");
console.log(`[gen-scene-ref] actualizado ${REFERENCE_PATH}`);
