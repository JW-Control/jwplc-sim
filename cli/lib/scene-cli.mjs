// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Despacho del subcomando `jwsim-cli scene …` (PROPUESTA_AGENTES_JSON.md §4.6).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { normalizeProject } from "./scene-normalize.mjs";
import { previewSceneProject } from "./scene-oracle.mjs";
import { describeCatalog, describeDevice } from "./scene-spec.mjs";
import { validateSceneProject } from "./scene-validate.mjs";

const STARTER_INO = `// Sketch generado por jwsim-cli scene build (no sobrescribe archivos existentes).
void setup() {
  // Inicialización del JWPLC Basic
}

void loop() {
  // Lógica de control
}
`;

const TEMPLATES = {
  vacio: () => ({ devices: [], wiring: [] }),
  plc: () => ({
    devices: [{ type: "power-24vdc" }, { type: "jwplc-basic" }],
    wiring: ["PS1.+V1 -> plc.24VDC [rojo]", "PS1.-V1 -> plc.M0 [azul]"],
  }),
  "arranque-directo": () => ({
    devices: [
      { type: "power-24vdc" },
      { type: "jwplc-basic" },
      { type: "pushbutton-no", params: { color: "verde" } },
      { type: "contactor" },
      { type: "motor-3ph" },
    ],
    wiring: [
      "PS1.+V1 -> plc.24VDC [rojo]",
      "PS1.-V1 -> plc.M0 [azul]",
      "PS1.-V1 -> plc.M1 [azul]",
      "PS1.+V1 -> S1.13 [rojo]",
      "S1.14 -> plc.I0_0 [negro]",
      "PS1.+V1 -> plc.Q0_0.1 [rojo]",
      "plc.Q0_0.2 -> KM1.A1 [negro]",
      "KM1.A2 -> PS1.-V1 [azul]",
    ],
  }),
};

const readJsonFile = (file, CliError, EXIT) => {
  try {
    return JSON.parse(readFileSync(resolve(file), "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new CliError(EXIT.USAGE, `no se pudo leer JSON "${file}": ${err.message}`);
  }
};

function printValidationText(v) {
  for (const e of v.errors) console.error(`[jwsim-cli] ERROR ${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ""}`);
  for (const w of v.warnings) console.error(`[jwsim-cli] AVISO ${w.path}: ${w.message}${w.suggestion ? ` (${w.suggestion})` : ""}`);
  console.log(`[jwsim-cli] ${v.ok ? "VALIDO" : "CON ERRORES"} (${v.errors.length} errores, ${v.warnings.length} avisos)`);
}

export async function runSceneCommand({ opts, CliError, EXIT, emit }) {
  const [sub, arg] = opts._;

  if (sub === "describe") {
    if (arg) {
      const device = describeDevice(arg);
      if (!device) throw new CliError(EXIT.USAGE, `dispositivo desconocido: ${arg}`);
      if (!opts.json) {
        console.log(`${device.type} — ${device.name} (${device.category})`);
        console.log(`Prefijo: ${device.prefix} | Bornes: ${device.terminals.map((t) => t.id).join(", ") || "(ninguno)"}`);
        if (device.outputs.length) console.log(`Salidas: ${device.outputs.join(", ")}`);
      }
      emit({ ok: true, subcommand: sub, device });
      return EXIT.OK;
    }
    const catalog = describeCatalog();
    if (!opts.json) {
      console.log(`Catálogo de dispositivos (${catalog.total} tipos):`);
      for (const c of catalog.categories) {
        console.log(`- ${c.name}: ${c.devices.map((d) => `${d.type} (${d.size.w}×${d.size.h})`).join(", ")}`);
      }
    }
    emit({ ok: true, subcommand: sub, catalog });
    return EXIT.OK;
  }

  if (sub === "new") {
    if (!arg) throw new CliError(EXIT.USAGE, "uso: scene new <salida.jwsim> [--sketch <ruta>] [--template <base>] [--json]");
    const tplKey = String(opts.template ?? "plc");
    const tpl = TEMPLATES[tplKey];
    if (!tpl) throw new CliError(EXIT.USAGE, `plantilla desconocida '${tplKey}' (vacio, plc, arranque-directo)`);
    const outFile = resolve(arg);
    const baseName = basename(outFile, ".jwsim");
    const draft = {
      name: baseName,
      ...(opts.sketch ? { program: { kind: "arduino", sketch: opts.sketch } } : {}),
      scene: tpl(),
    };
    const project = normalizeProject(draft, { baseName });
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(project, null, 2) + "\n", "utf8");
    if (!opts.json) console.log(`[jwsim-cli] creado ${outFile}`);
    emit({ ok: true, subcommand: sub, file: outFile, project });
    return EXIT.OK;
  }

  if (sub === "normalize") {
    if (!arg) throw new CliError(EXIT.USAGE, "uso: scene normalize <entrada.json> [-o <salida.jwsim>] [--json]");
    const raw = readJsonFile(arg, CliError, EXIT);
    const baseName = raw.name ?? basename(opts.outFile ?? arg).replace(/\.(jwsim|json)$/i, "");
    const project = normalizeProject(raw, { baseName });
    const serialized = JSON.stringify(project, null, 2) + "\n";
    if (opts.outFile) {
      const outFile = resolve(opts.outFile);
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, serialized, "utf8");
      if (!opts.json) console.log(`[jwsim-cli] normalizado -> ${outFile}`);
      emit({ ok: true, subcommand: sub, file: outFile, project });
    } else {
      if (!opts.json) process.stdout.write(serialized);
      emit({ ok: true, subcommand: sub, project });
    }
    return EXIT.OK;
  }

  if (sub === "validate") {
    if (!arg) throw new CliError(EXIT.USAGE, "uso: scene validate <archivo.jwsim> [--fast] [--strict] [--json]");
    const proj = readJsonFile(arg, CliError, EXIT);
    const v = validateSceneProject(proj, { fast: !!opts.fast, strict: !!opts.strict });
    if (!opts.json) printValidationText(v);
    emit({ ok: v.ok, subcommand: sub, file: resolve(arg), ...v }, v.ok ? EXIT.OK : EXIT.FAIL);
    return v.ok ? EXIT.OK : EXIT.FAIL;
  }

  if (sub === "build") {
    if (!arg || !opts.outDir) throw new CliError(EXIT.USAGE, "uso: scene build <entrada.json> --out <dir> [--create-ino] [--strict] [--json]");
    const raw = readJsonFile(arg, CliError, EXIT);
    const rawName = raw.name ?? basename(arg).replace(/\.(jwsim|json)$/i, "");
    const project = normalizeProject(raw, { baseName: rawName });
    const validation = validateSceneProject(project, { strict: !!opts.strict });
    if (!validation.ok) {
      if (!opts.json) printValidationText(validation);
      emit({ ok: false, subcommand: sub, validation }, EXIT.FAIL);
      return EXIT.FAIL;
    }
    const outDir = resolve(opts.outDir);
    const slug = rawName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "proyecto";
    const projectFile = join(outDir, `${slug}.jwsim`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(projectFile, JSON.stringify(project, null, 2) + "\n", "utf8");

    let sketchFile = null;
    let createdIno = false;
    if (project.program?.kind === "arduino" && project.program.sketch) {
      sketchFile = resolve(outDir, project.program.sketch);
      if (opts.createIno && !existsSync(sketchFile)) {
        mkdirSync(dirname(sketchFile), { recursive: true });
        writeFileSync(sketchFile, STARTER_INO, { encoding: "utf8", flag: "wx" });
        createdIno = true;
      }
    }
    if (!opts.json) {
      console.log(`[jwsim-cli] proyecto generado: ${projectFile}${createdIno ? ` (creado ${sketchFile})` : ""}`);
    }
    emit({
      ok: true,
      subcommand: sub,
      project_file: projectFile,
      sketch_file: sketchFile,
      created_ino: createdIno,
      validation,
    });
    return EXIT.OK;
  }

  if (sub === "preview") {
    if (!arg) throw new CliError(EXIT.USAGE, "uso: scene preview <archivo.jwsim> [--out <dir>] [--view 2d|3d|both] [--smoke-ms <ms>] [--json]");
    const view = String(opts.view ?? "both");
    if (!["2d", "3d", "both"].includes(view)) throw new CliError(EXIT.USAGE, `--view inválido '${view}' (2d, 3d, both)`);
    let res;
    try {
      res = await previewSceneProject(arg, {
        outDir: opts.outDir,
        view,
        smokeMs: Number.isFinite(opts.smokeMs) ? opts.smokeMs : 0,
      });
    } catch (err) {
      if (err?.code === "MISSING_ORACLE_ENV") throw new CliError(EXIT.ENV, err.message);
      throw err;
    }
    if (!opts.json) {
      for (const w of res.warnings) console.error(`[jwsim-cli] AVISO SVG: ${w}`);
      for (const [k, p] of Object.entries(res.screenshots)) console.log(`[jwsim-cli] captura ${k}: ${p}`);
      console.log(`[jwsim-cli] preview ${res.ok ? "OK" : "CON AVISOS"}`);
    }
    emit({ subcommand: sub, ...res }, res.ok ? EXIT.OK : EXIT.FAIL);
    return res.ok ? EXIT.OK : EXIT.FAIL;
  }

  throw new CliError(EXIT.USAGE, `scene: subcomando desconocido '${sub ?? ""}' (describe, new, normalize, validate, preview, build)`);
}
