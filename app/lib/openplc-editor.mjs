// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Integración con el OpenPLC Editor (JWPLC Edition): el único editor de los
// lenguajes IEC 61131-3. JWPLC Sim no edita IEC: crea el proyecto con la CLI
// del editor (los mismos archivos que su asistente «New Project»), lo abre
// para simular y le pide al editor que lo abra para programarlo.
//
// Dónde está el editor (el primero que exista):
//   1. JWSIM_OPENPLC_EDITOR: el ejecutable, la carpeta del repositorio del
//      editor (desarrollo: electron + release/app/dist/main/main.js) o un
//      script .mjs/.js que hace de editor (pruebas).
//   2. La ruta elegida en la app (openplc-editor.json en los datos de la app).
//   3. La instalación por usuario o para todos los usuarios.
//   4. Sin empaquetar: el repositorio ../openplc-editor junto a jwplc-sim.
//
// Comandos del editor que se usan:
//   --cli create <nombre> --path <carpeta> --language ld|st|fbd|il|sfc --time T#20ms --json
//   --open-project=<carpeta>   (abre ese proyecto; JWPLC Edition)
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

export const LANGUAGES = [
  { id: "ld", name: "Ladder (LD)", hint: "contactos y bobinas, como un esquema de relés" },
  { id: "st", name: "Texto estructurado (ST)", hint: "parecido a Pascal: IF, CASE, FOR" },
  { id: "fbd", name: "Diagrama de bloques (FBD)", hint: "bloques de funciones unidos por líneas" },
  { id: "il", name: "Lista de instrucciones (IL)", hint: "parecido a ensamblador" },
  { id: "sfc", name: "Diagrama secuencial (SFC)", hint: "etapas y transiciones (GRAFCET)" },
];
const PRODUCT = "OpenPLC Editor - JWPLC Edition";
// Placa de los proyectos que crea el Sim (la del VPP del JWPLC Basic).
export const JWPLC_BOARD = "JWPLC BASIC [2.0.0]";

/** Comando para correr el editor que hay en `target`, o null si no sirve. @param {string} target */
function commandFor(target) {
  if (!target || !existsSync(target)) return null;
  const st = statSync(target);
  if (st.isDirectory()) {
    // Repositorio del editor (desarrollo): se corre release/app, que se llama
    // igual que `npm run dev`; si ese está abierto, el pedido le llega a él.
    const main = join(target, "release", "app", "dist", "main", "main.js");
    const electron = join(target, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
    if (existsSync(main) && existsSync(electron)) return { cmd: electron, prefix: [join(target, "release", "app")], node: false, label: `repositorio ${target}` };
    return null;
  }
  // Editor simulado (pruebas): un script de Node.
  if ([".mjs", ".js", ".cjs"].includes(extname(target).toLowerCase())) return { cmd: process.execPath, prefix: [target], node: true, label: `script ${basename(target)}` };
  return { cmd: target, prefix: [], node: false, label: target };
}

/**
 * Ubica el editor.
 * @param {{ configured?: string | null, packaged?: boolean, simRoot?: string }} [o]
 * @returns {{ cmd: string, prefix: string[], node: boolean, label: string, source: string } | null}
 */
export function locateEditor({ configured = null, packaged = true, simRoot = "" } = {}) {
  const local = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    ["variable JWSIM_OPENPLC_EDITOR", process.env.JWSIM_OPENPLC_EDITOR],
    ["ruta elegida", configured],
    // En desarrollo, la build del repo va antes que el editor instalado.
    ...(!packaged && simRoot ? [["repositorio de desarrollo", join(simRoot, "..", "openplc-editor")]] : []),
    ["instalado", local && join(local, "Programs", PRODUCT, `${PRODUCT}.exe`)],
    ["instalado", process.env.ProgramFiles && join(process.env.ProgramFiles, PRODUCT, `${PRODUCT}.exe`)],
  ];
  for (const [source, target] of candidates) {
    const c = commandFor(String(target ?? ""));
    if (c) return { ...c, source };
  }
  return null;
}

/** Entorno para el editor: sin ELECTRON_RUN_AS_NODE, salvo para un script de Node. */
function envFor(ed) {
  const env = { ...process.env };
  if (ed.node) env.ELECTRON_RUN_AS_NODE = "1";
  else delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

// Nombre válido para el proyecto: el del asistente del editor y el de un sketch.
export function checkProjectName(name) {
  const n = String(name ?? "").trim();
  if (!n) return "escriba un nombre";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(n)) return "use letras, números y _ (sin espacios ni tildes; no puede empezar con número)";
  return null;
}

/**
 * Crea un proyecto OpenPLC con la CLI del editor y le pone la placa JWPLC Basic.
 * @param {{ cmd: string, prefix: string[], node: boolean }} ed
 * @param {{ name: string, parent: string, language: string, interval?: string, board?: string }} o
 * @returns {Promise<string>} carpeta del proyecto
 */
export function createProject(ed, { name, parent, language, interval = "T#20ms", board = JWPLC_BOARD }) {
  const bad = checkProjectName(name);
  if (bad) return Promise.reject(new Error(`nombre no válido: ${bad}`));
  if (!LANGUAGES.some((l) => l.id === language)) return Promise.reject(new Error(`lenguaje no admitido: ${language}`));
  if (!/^T#\d+(\.\d+)?(ms|s)$/i.test(String(interval))) return Promise.reject(new Error(`intervalo no válido: ${interval} (p. ej. T#20ms)`));
  const target = join(resolve(parent), name);
  if (existsSync(target)) return Promise.reject(new Error(`ya existe ${target}`));
  const args = [...ed.prefix, "--cli", "create", name, "--path", resolve(parent), "--language", language, "--time", interval, "--json"];
  return new Promise((ok, fail) => {
    const p = spawn(ed.cmd, args, { env: envFor(ed), windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("error", (e) => fail(new Error(`no se pudo ejecutar el OpenPLC Editor: ${e.message}`)));
    p.on("close", (code) => {
      // En modo --json la última línea con «{» es el resultado.
      const line = out.split(/\r?\n/).reverse().find((l) => l.trim().startsWith("{"));
      let res = null;
      try {
        res = line ? JSON.parse(line) : null;
      } catch {}
      if (!res?.ok || !res.projectPath) {
        const why = res?.error?.message ?? res?.message ?? (err.trim().split(/\r?\n/).at(-1) || `código de salida ${code}`);
        return fail(new Error(`el OpenPLC Editor no creó el proyecto: ${why}`));
      }
      try {
        setBoard(res.projectPath, board);
      } catch (e) {
        return fail(new Error(`proyecto creado, pero no se pudo fijar la placa: ${e.message}`));
      }
      ok(res.projectPath);
    });
  });
}

/** Fija la placa del proyecto (devices/configuration.json → deviceBoard). */
export function setBoard(dir, board = JWPLC_BOARD) {
  const f = join(dir, "devices", "configuration.json");
  const cfg = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  cfg.deviceBoard = board;
  writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
}

/**
 * Abre el proyecto en el OpenPLC Editor (proceso aparte, no se espera).
 * @param {{ cmd: string, prefix: string[], node: boolean }} ed @param {string} dir
 */
export function openInEditor(ed, dir) {
  return launchDetached(ed, [`--open-project=${resolve(dir)}`]);
}

/**
 * Pide cerrar el OpenPLC Editor abierto (`--jwsim-close`): cierra como
 * Archivo ▸ Salir, con su aviso de cambios sin guardar. Si no hay editor
 * abierto, el proceso nuevo termina sin mostrar nada.
 * @param {{ cmd: string, prefix: string[], node: boolean }} ed
 */
export function closeEditor(ed) {
  return launchDetached(ed, ["--jwsim-close"]);
}

/** @param {{ cmd: string, prefix: string[], node: boolean }} ed @param {string[]} args */
function launchDetached(ed, args) {
  return new Promise((ok, fail) => {
    const p = spawn(ed.cmd, [...ed.prefix, ...args], { env: envFor(ed), detached: true, stdio: "ignore", windowsHide: false });
    p.on("error", (e) => fail(new Error(`no se pudo abrir el OpenPLC Editor: ${e.message}`)));
    p.on("spawn", () => {
      p.unref();
      ok(true);
    });
  });
}

