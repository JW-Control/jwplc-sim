// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Proyectos .jwsim (docs/ARCHITECTURE.md §8): lectura con migración de
// versiones anteriores, validación contra schema/jwsim-1.json y escritura
// conservando los campos desconocidos.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { ROOT } from "./build.mjs";

export const SCHEMA_URL = "https://jw-control.github.io/jwplc-sim/schema/jwsim-1.json";
export const CURRENT_VERSION = 1;
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "schema", "jwsim-1.json"), "utf8"));

// ---------------------------------------------------------------- validación
// Subconjunto de JSON Schema 2020-12 que usa schema/jwsim-1.json: type,
// required, properties, patternProperties, const, enum, minLength, pattern,
// minimum, items, $ref local, allOf e if/then. Devuelve [{ path, message }].
export function validate(value, schema = SCHEMA, root = SCHEMA, path = "") {
  const errors = [];
  const at = path || "/";
  const err = (message) => errors.push({ path: at, message });
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root);
    errors.push(...validate(value, target, root, path));
  }
  const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (schema.type) {
    const ok =
      schema.type === "integer" ? Number.isInteger(value) : schema.type === "number" ? type === "number" : schema.type === type;
    if (!ok) {
      err(`debe ser de tipo ${schema.type}`);
      return errors;
    }
  }
  if ("const" in schema && value !== schema.const) err(`debe valer ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) err(`debe ser uno de ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  if (type === "string") {
    if (schema.minLength && value.length < schema.minLength) err("no puede estar vacío");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) err(`no cumple el formato ${schema.pattern}`);
  }
  if (type === "number" && "minimum" in schema && value < schema.minimum) err(`debe ser ≥ ${schema.minimum}`);
  if (type === "object") {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push({ path: `${path}/${k}`, message: "falta (obligatorio)" });
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in value) errors.push(...validate(value[k], sub, root, `${path}/${k}`));
    }
    for (const [re, sub] of Object.entries(schema.patternProperties ?? {})) {
      for (const k of Object.keys(value)) if (new RegExp(re).test(k)) errors.push(...validate(value[k], sub, root, `${path}/${k}`));
    }
  }
  if (type === "array" && schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, root, `${path}/${i}`)));
  for (const sub of schema.allOf ?? []) errors.push(...validate(value, sub, root, path));
  if (schema.if && validate(value, schema.if, root, path).length === 0 && schema.then) {
    errors.push(...validate(value, schema.then, root, path));
  }
  return errors;
}

// ---------------------------------------------------------------- migración
// v0: borrador previo a v1 (G0), con el sketch y los vínculos en la raíz:
//   { "jwsim": 0, "name", "sketch", "openplc", "hmi", "realtime", "seed" }
// Es el formato de prueba de la ruta de migración que exige
// JWSIM_G2_PROJECT_LINKING; las versiones mayores futuras agregan su paso aquí.
const MIGRATIONS = {
  0: (p) => {
    const { jwsim, sketch, openplc, hmi, realtime, seed, ...rest } = p;
    void jwsim;
    const out = {
      $schema: SCHEMA_URL,
      format: "jwsim",
      version: 1,
      ...rest,
      board: rest.board ?? { id: "jwplcbasic" },
      program: { kind: "arduino", sketch },
    };
    if (openplc || hmi) out.links = { ...(openplc ? { openplc } : {}), ...(hmi ? { hmi } : {}) };
    if (realtime !== undefined || seed !== undefined) {
      out.simulation = { ...(seed !== undefined ? { seed } : {}), ...(realtime !== undefined ? { realtimeFactor: realtime } : {}) };
    }
    return out;
  },
};

function versionOf(p) {
  if (p && p.format === "jwsim" && Number.isInteger(p.version)) return p.version;
  if (p && Number.isInteger(p.jwsim)) return p.jwsim;
  return null;
}

export function migrate(project) {
  let p = project;
  const from = versionOf(p);
  if (from === null) throw new Error("no es un proyecto .jwsim (falta \"format\": \"jwsim\" y \"version\")");
  if (from > CURRENT_VERSION) {
    throw new Error(`el proyecto es versión ${from}; esta versión de JWPLC Sim abre hasta la ${CURRENT_VERSION}`);
  }
  for (let v = from; v < CURRENT_VERSION; v++) p = MIGRATIONS[v](p);
  return { project: p, migratedFrom: from === CURRENT_VERSION ? null : from };
}

// ---------------------------------------------------------------- archivos
const toPosix = (p) => p.split(sep).join("/");

// Rutas absolutas resueltas de los artefactos vinculados.
export function resolveLinks(project, file) {
  const base = dirname(resolve(file));
  const abs = (p) => (p ? resolve(base, p) : null);
  return {
    sketch: abs(project.program?.sketch),
    // kind openplc (G6): carpeta del proyecto del OpenPLC Editor.
    plcProject: abs(project.program?.project),
    openplc: abs(project.links?.openplc),
    hmi: abs(project.links?.hmi),
  };
}

export function loadProject(file) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: JSON inválido (${e.message})`);
  }
  const { project, migratedFrom } = migrate(raw);
  const errors = validate(project);
  if (errors.length) {
    const e = new Error(`${file}: el proyecto no cumple el esquema jwsim-1:\n${errors.map((x) => `  ${x.path}: ${x.message}`).join("\n")}`);
    e.errors = errors;
    throw e;
  }
  const links = resolveLinks(project, file);
  const missing = Object.entries(links)
    .filter(([, p]) => p && !existsSync(p))
    .map(([k, p]) => ({ link: k, path: p }));
  return { project, migratedFrom, links, missing };
}

// Escribe el proyecto: los campos de la interfaz se actualizan y el resto
// (incluidos los desconocidos) se conserva tal cual.
export function saveProject(file, project, { sketchPath, plcProjectPath, links = {}, simulation = {}, scene = {} } = {}) {
  const base = dirname(resolve(file));
  const rel = (p) => {
    const r = toPosix(relative(base, p));
    return r.startsWith(".") ? r : `./${r}`;
  };
  const out = { $schema: SCHEMA_URL, format: "jwsim", version: CURRENT_VERSION, board: { id: "jwplcbasic" }, ...project };
  out.format = "jwsim";
  out.version = CURRENT_VERSION;
  if (sketchPath) {
    out.program = { ...(out.program ?? {}), kind: "arduino", sketch: rel(sketchPath) };
    delete out.program.project;
  }
  if (plcProjectPath) {
    out.program = { ...(out.program ?? {}), kind: "openplc", project: rel(plcProjectPath) };
    delete out.program.sketch;
  }
  for (const [k, p] of Object.entries(links)) {
    out.links = { ...(out.links ?? {}) };
    if (p) out.links[k] = isAbsolute(p) ? rel(p) : p;
    else delete out.links[k];
  }
  if (Object.keys(simulation).length) out.simulation = { ...(out.simulation ?? {}), ...simulation };
  if (Object.keys(scene).length) out.scene = { ...(out.scene ?? {}), ...scene };
  const errors = validate(out);
  if (errors.length) throw new Error(`proyecto inválido: ${errors.map((x) => `${x.path}: ${x.message}`).join("; ")}`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  return out;
}
