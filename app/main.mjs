// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Proceso principal de JWPLC Sim (Electron): ventana, sketches del usuario,
// compilación con jwsim-cli y ciclo de vida del runner (un PLC simulado).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

import { spawn } from "node:child_process";
import { Worker } from "node:worker_threads";

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";

import { buildApiCatalog } from "../cli/lib/api-catalog.mjs";
import { BEHAVIORS, generateDevice, MODELS, normalizeSpec, RAMP, symbolLayout, writeDevice } from "../cli/lib/device-gen.mjs";
import { checkDeviceDir, installedDevices, linkDevice, localDevices, registryWithInstalled, unlinkDevice } from "../cli/lib/device.mjs";
import { isOpenPlcProject } from "../cli/lib/openplc.mjs";
import { loadProject, saveProject } from "../cli/lib/project.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { checkProjectName, closeEditor, createProject, LANGUAGES, locateEditor, openInEditor } from "./lib/openplc-editor.mjs";
import { readLock, resolvePackageRoot } from "../scripts/fetch-package.mjs";
import { formatSource } from "./lib/autoformat.mjs";
import { openArg, openPlcDir } from "./lib/open-arg.mjs";
import { MARK, syncExample, syncExercise } from "./lib/exercise-copy.mjs";
import { checkGoals, GoalTracker } from "./lib/goals.mjs";
import { levels, loadProgress, markDone, markLesson, nextAfter, saveProgress } from "./lib/learning.mjs";
import { APRENDE, ARQUITECTURAS, imageOf, lessonById, listAprendeExamples, listArquitecturas, listCurso, listCursoIec, listRetos, PRACTICAS, RETOS } from "../cli/lib/aprende.mjs";
import { DebugSession } from "./lib/debug-session.mjs";
import { IoBridge } from "./lib/io-bridge.mjs";
import { ComBridge, comAvailable, listComPorts } from "./lib/com-bridge.mjs";
import { HostLink, describeLink } from "./lib/host-link.mjs";
import { NetBridge } from "./lib/net-bridge.mjs";
import { SceneSession, wireSnapshot } from "./lib/scene-session.mjs";
import { RunnerProcess } from "./lib/sim-port.mjs";
import { Registry, builtinDevices } from "../scene/devices/index.mjs";
import { Scene } from "../scene/scene.mjs";
import { iecModel } from "../scene/iec.mjs";
import { buildComponent, checkComponent, componentTerminals, componentVars, BLOCK_KINDS, IO_KINDS, SIGNALS } from "../scene/component.mjs";
import { symbolSvg } from "../scene/component-symbol.mjs";
import { MODELS as LTI_MODELS } from "../scene/lti.mjs";
import { folderOf, readComponent, writeComponent } from "../cli/lib/component-files.mjs";
import { ComponentBench } from "./lib/component-bench.mjs";

// Portable (scripts/dist.mjs): la app empaquetada sin el desinstalador al
// lado guarda sus datos (compilaciones, estado y dispositivos instalados) en
// "datos" dentro de su carpeta, no en el perfil del usuario.
if (app.isPackaged && process.platform === "win32") {
  const dir = dirname(process.execPath);
  if (!readdirSync(dir).some((f) => /^Uninstall .*\.exe$/i.test(f))) {
    app.setPath("userData", join(dir, "datos"));
    process.env.JWSIM_HOME ??= join(dir, "datos", "jwsim");
  }
}
// Instalada, la carpeta de la app puede ser de solo lectura (Program Files,
// instalación para todos los usuarios): la caché de compilación va a los datos.
if (app.isPackaged) process.env.JWSIM_CACHE_DIR ??= join(app.getPath("userData"), "cache");

// Archivos del sketch que van al compilador: las pestañas .ino y los fuentes
// de la raíz (cli/lib/build.mjs, como arduino-cli).
const SKETCH_EXT = new Set([".ino", ".h", ".hpp", ".c", ".cpp"]);
// Notas que acompañan al sketch: se muestran y se editan, pero no se compilan.
const SKETCH_TEXT_EXT = new Set([".md", ".txt"]);
const isSketchFile = (name) => {
  const ext = extname(name).toLowerCase();
  return SKETCH_EXT.has(ext) || SKETCH_TEXT_EXT.has(ext);
};
// Contenido inicial de un archivo nuevo (Programa ▸ Nuevo archivo).
function newFileContent(name) {
  const ext = extname(name).toLowerCase();
  if (ext === ".h" || ext === ".hpp") return `#pragma once\n\n#include <Arduino.h>\n\n`;
  // Un .cpp se compila aparte: no recibe el #include <Arduino.h> del .ino.
  if (ext === ".cpp") return `#include <Arduino.h>\n\n`;
  if (ext === ".md") return `# ${basename(name, extname(name))}\n\n`;
  return "";
}
// Nombre válido para un archivo del sketch, como Arduino IDE: sin extensión
// es una pestaña .ino; solo letras, números, _ - y un punto antes de la extensión.
function sketchFileName(raw) {
  let name = String(raw ?? "").trim();
  if (!name) throw new Error("escriba un nombre de archivo");
  if (!extname(name)) name += ".ino";
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*\.[A-Za-z0-9]+$/.test(name)) {
    throw new Error(`nombre no válido: «${name}» (use letras, números, _ o -, sin espacios ni carpetas)`);
  }
  if (!isSketchFile(name)) {
    throw new Error(`tipo de archivo no admitido: ${extname(name)} (use .ino, .h, .hpp, .c, .cpp, .md o .txt)`);
  }
  return name;
}
// Windows no distingue mayúsculas: «Motor.h» y «motor.h» son el mismo archivo.
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
function sketchEntry(dir, name) {
  return readdirSync(dir).find((f) => sameName(f, name)) ?? null;
}
function editableSketchDir(dir) {
  if (!dir || !existsSync(dir)) throw new Error("no hay un sketch abierto");
  if (isOpenPlcProject(dir)) throw new Error("los archivos de un proyecto OpenPLC se crean en el OpenPLC Editor");
  return resolve(dir);
}
// Sketch nuevo: el clásico de Arduino IDE.
const TEMPLATE = `void setup() {
  // Escriba aquí su código de configuración; se ejecuta una vez:

}

void loop() {
  // Escriba aquí su código principal; se ejecuta una y otra vez:

}
`;

let win = null;
let runner = null;
let sceneSession = null; // co-simulación con la escena (G7)
let activeGoals = null; // objetivos en vivo del ejercicio abierto
let goalTracker = null;
let registryPromise = null; // biblioteca incluida + dispositivos de escena instalados
let runnerExe = null;
let debug = null; // DebugSession adjunta al runner actual
let debugAttaching = null;
const breakpoints = new Map(); // ruta absoluta -> líneas
let watcher = null;
let projectWatcher = null;
let projectWatchTimer = null;
// Contenido que la propia app escribió: un evento de fs.watch con ese mismo
// contenido no es una edición externa.
const ownWrites = new Map();

// Carpeta de trabajo: los ejemplos del package se copian aquí antes de
// editarlos (el package fijado nunca se modifica).
function workspaceDir() {
  const dir = process.env.JWSIM_WORKSPACE ?? join(app.getPath("documents"), "JWPLC Sim");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Proyecto del OpenPLC Editor (G6): sus POU se muestran de solo lectura (se
// editan en el editor) y se compila con la cadena del editor (cli/lib/openplc.mjs).
const PLC_POU_EXT = new Set([".st", ".il", ".ld", ".fbd", ".sfc", ".py", ".cpp"]);
function readOpenPlc(dir) {
  const files = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (PLC_POU_EXT.has(extname(e.name).toLowerCase())) files.push({ name: relative(dir, p).split(sep).join("/"), path: p, content: readFileSync(p, "utf8") });
    }
  };
  walk(join(dir, "pous"));
  if (!files.length) throw new Error(`el proyecto OpenPLC ${dir} no tiene POU en pous/`);
  return { dir, name: basename(dir), files, openplc: true };
}

function readSketch(dir) {
  if (isOpenPlcProject(dir)) return readOpenPlc(dir);
  const name = basename(dir);
  const files = readdirSync(dir)
    .filter((f) => isSketchFile(f) && statSync(join(dir, f)).isFile())
    .sort((a, b) => (a === `${name}.ino` ? -1 : b === `${name}.ino` ? 1 : a.localeCompare(b)))
    .map((f) => ({ name: f, path: join(dir, f), content: readFileSync(join(dir, f), "utf8") }));
  if (!files.some((f) => f.name === `${name}.ino`)) throw new Error(`la carpeta ${dir} no contiene ${name}.ino`);
  return { dir, name, files };
}

// Solo los ejemplos del JWPLC Basic: librerías propias (JWPLC_*, JW_*). Los
// del core ESP32 (WiFi, BLE, Matter…), los de terceros (Adafruit_BusIO) y los
// benchmarks de compilación de tools/ no corren en la placa o no son para el
// usuario. JWPLC_GlobalPeripherals va primero (plantilla y curso), luego
// las JWPLC_* y al final las JW_*.
const EXAMPLE_LIBS = /^(JWPLC|JW)_/;
const EXAMPLE_FIRST = ["JWPLC_GlobalPeripherals"];

function listExamples() {
  const { root, lock } = resolvePackageRoot();
  const tree = join(root, lock.JWPLC_PACKAGE_TREE);
  const out = [];
  const libs = join(tree, "libraries");
  const names = readdirSync(libs)
    .filter((n) => EXAMPLE_LIBS.test(n))
    .sort((a, b) => {
      const rank = (n) => (EXAMPLE_FIRST.includes(n) ? 0 : n.startsWith("JWPLC_") ? 1 : 2);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  for (const lib of names) {
    const ex = join(libs, lib, "examples");
    if (!existsSync(ex)) continue;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!e.isDirectory()) continue;
        const p = join(d, e.name);
        // Subcarpetas (Curso_JWPLC_Basic/1.Primeros_pasos/…) en el nombre.
        if (existsSync(join(p, `${e.name}.ino`))) out.push({ group: lib, name: e.name, label: relative(ex, p).split(sep).join(" / "), dir: p });
        else walk(p);
      }
    };
    walk(ex);
  }
  // El curso vive en JWPLC_Aprende (primera en la lista); la copia que aún
  // trae el package no se muestra para no duplicarlo.
  return [...listAprendeExamples(), ...out.filter((e) => !(e.group === "JWPLC_GlobalPeripherals" && e.label.startsWith("Curso_JWPLC_Basic / ")))];
}

function forward(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Suelta gdb (el proceso sigue) y luego cierra el runner.
async function stopRunner() {
  const r = runner;
  runner = null;
  sceneSession?.stop();
  sceneSession = null;
  bridge?.close();
  bridge = null;
  if (ioBridge) forward("iobridge:status", { state: "off", clients: [] });
  ioBridge?.close();
  ioBridge = null;
  comBridge?.detach();
  const links = hostLinks;
  hostLinks = [];
  await Promise.all(links.map((l) => l.close()));
  r?.removeAllListeners();
  // El resumen final (instante y hash de traza) sí llega a la interfaz.
  r?.on("message", (m) => m.type === "stopped" && forward("sim:message", m));
  await detachDebugger();
  r?.stop();
}

// ---------------------------------------------------------------- depurador
// gdb -i=dap se adjunta al runner solo cuando hace falta (hay breakpoints o
// se pidió interrumpir); sin depurador la simulación corre igual que en G2.
async function attachDebugger() {
  if (debug) return debug;
  if (debugAttaching) return debugAttaching;
  if (!runner?.pid) throw new Error("no hay una simulación en curso");
  const r = runner;
  debugAttaching = (async () => {
    r.send({ type: "debug", attached: 1 });
    const d = new DebugSession({ gdb: toolchain().gdb, exe: runnerExe, pid: r.pid });
    d.on("stopped", (s) => debug === d && forward("dbg:stopped", s));
    d.on("continued", () => debug === d && forward("dbg:continued", {}));
    d.on("output", (t) => debug === d && forward("dbg:output", t));
    d.on("exited", () => {
      if (debug !== d) return;
      debug = null;
      forward("dbg:detached", {});
    });
    debug = d;
    try {
      const verified = await d.start(breakpoints);
      forward("dbg:attached", { verified: [...verified] });
      return d;
    } catch (err) {
      debug = null;
      d.removeAllListeners();
      await d.stop().catch(() => {});
      r.send({ type: "debug", attached: 0 });
      throw new Error(`no se pudo adjuntar el depurador (gdb): ${err.message}`);
    }
  })();
  try {
    return await debugAttaching;
  } finally {
    debugAttaching = null;
  }
}

async function detachDebugger() {
  const d = debug;
  debug = null;
  if (!d) return;
  d.removeAllListeners();
  await d.stop().catch(() => {});
  runner?.send({ type: "debug", attached: 0 });
  forward("dbg:detached", {});
}

const hasBreakpoints = () => [...breakpoints.values()].some((l) => l.length);

// Autoformato (Ctrl+T): clang-format con el estilo del JWPLC o el
// .clang-format de la carpeta del sketch.
ipcMain.handle("code:format", (_e, { text, name, dir }) => {
  try {
    return formatSource(text, name, dir);
  } catch (err) {
    return { error: err.message };
  }
});

const themeCfgFile = () => join(app.getPath("userData"), "preferencias.json");
const VALID_THEMES = new Set(["system", "light", "dark"]);
function loadThemePref() {
  try {
    const raw = JSON.parse(readFileSync(themeCfgFile(), "utf8"));
    return VALID_THEMES.has(raw?.theme) ? raw.theme : "system";
  } catch {
    return "system";
  }
}
function saveThemePref(theme) {
  const mode = VALID_THEMES.has(theme) ? theme : "system";
  try {
    const cur = existsSync(themeCfgFile()) ? JSON.parse(readFileSync(themeCfgFile(), "utf8")) : {};
    writeFileSync(themeCfgFile(), `${JSON.stringify({ ...cur, theme: mode }, null, 2)}\n`);
  } catch {}
  return mode;
}
function applyThemePref(mode, persist = true) {
  const theme = persist ? saveThemePref(mode) : VALID_THEMES.has(mode) ? mode : "system";
  nativeTheme.themeSource = theme;
  const bg = nativeTheme.shouldUseDarkColors ? "#16191d" : "#f5f7fa";
  win?.setBackgroundColor?.(bg);
  realWin?.setBackgroundColor?.(nativeTheme.shouldUseDarkColors ? "#14171b" : "#f5f7fa");
  if (app.isReady()) buildMenu();
  forward("app:themeChanged", { theme, dark: nativeTheme.shouldUseDarkColors });
  return { theme, dark: nativeTheme.shouldUseDarkColors };
}

ipcMain.handle("app:getTheme", () => ({ theme: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors }));
ipcMain.handle("app:setTheme", (_e, theme) => applyThemePref(theme, true));

ipcMain.handle("app:info", () => {
  try {
    const { lock } = resolvePackageRoot({ fetch: false });
    return { packageRef: lock.JWPLC_PACKAGE_REF, packageCommit: lock.JWPLC_PACKAGE_COMMIT.slice(0, 12), version: app.getVersion() };
  } catch {
    const lock = readLock();
    return { packageRef: lock.JWPLC_PACKAGE_REF, packageCommit: lock.JWPLC_PACKAGE_COMMIT.slice(0, 12), version: app.getVersion() };
  }
});

ipcMain.handle("examples:list", () => listExamples());

// Catálogo de la API del Basic para el autocompletado, de los headers del
// package activo (cli/lib/api-catalog.mjs).
let apiCatalog = null;
let apiCatalogCommit = null;
ipcMain.handle("api:catalog", () => {
  const { root, lock } = resolvePackageRoot();
  if (!apiCatalog || apiCatalogCommit !== lock.JWPLC_PACKAGE_COMMIT) {
    apiCatalog = buildApiCatalog(join(root, lock.JWPLC_PACKAGE_TREE));
    apiCatalogCommit = lock.JWPLC_PACKAGE_COMMIT;
  }
  return apiCatalog;
});

// ---------------------------------------------------------------- ejercicios (G9)
// Retos, curso y arquitecturas viven en la librería JWPLC_Aprende (cli/lib/aprende.mjs).
const EXERCISES = RETOS;

// Miniaturas como data: URL (la página solo carga imágenes de su origen).
const imgCache = new Map();
function imageData(kind, id) {
  const key = `${kind}-${id}`;
  if (!imgCache.has(key)) {
    const rel = imageOf(kind, id);
    imgCache.set(key, rel ? `data:image/jpeg;base64,${readFileSync(join(APRENDE, rel)).toString("base64")}` : null);
  }
  return imgCache.get(key);
}
const listExercises = () => listRetos();
ipcMain.handle("exercises:list", () => listExercises());

// ---- Centro de aprendizaje: progreso del alumno en el perfil.
const progressFile = () => join(app.getPath("userData"), "aprendizaje.json");
const unlockOpts = (p) => ({ unlockAll: p.unlockAll || process.env.JWSIM_UNLOCK_ALL === "1" });
// Estado de la ruta con la miniatura de cada reto.
const withImages = (r) => ({ ...r, levels: r.levels.map((l) => ({ ...l, items: l.items.map((x) => ({ ...x, img: imageData("reto", x.id) })) })) });
ipcMain.handle("learn:state", () => {
  const p = loadProgress(progressFile());
  return withImages(levels(listExercises(), p, unlockOpts(p)));
});
// Lecciones con práctica evaluada, en el orden del curso.
const gradedLessons = () => {
  try {
    return [...listCurso(), ...listCursoIec()].flatMap((u) => u.lessons.filter((l) => l.graded));
  } catch {
    return [];
  }
};
ipcMain.handle("learn:complete", (_e, { id, via, grade }) => {
  const p = loadProgress(progressFile());
  // Una lección del curso solo queda hecha al cumplir sus objetivos en vivo.
  if (/^(curso|iec)-\d+$/.test(String(id))) {
    const changed = via === "goals" && markLesson(p, String(id));
    if (changed) saveProgress(progressFile(), p);
    const list = gradedLessons();
    const i = list.findIndex((l) => l.id === id);
    const next = [...list.slice(i + 1), ...list.slice(0, Math.max(0, i))].find((l) => !p.lessons?.[l.id])?.id ?? null;
    return { lesson: true, changed, done: !!p.lessons?.[id], next, teaches: lessonBrief(String(id))?.teaches ?? "" };
  }
  const changed = markDone(p, String(id), via === "grade" ? "grade" : "goals", grade);
  if (changed) saveProgress(progressFile(), p);
  const ex = listExercises();
  return { changed, done: !!p.done[id], next: nextAfter(ex, p, String(id), unlockOpts(p)), teaches: ex.find((e) => e.id === id)?.brief?.teaches ?? "" };
});
// Curso JWPLC Basic (librería JWPLC_Aprende) y lecciones ya abiertas.
ipcMain.handle("course:list", () => {
  try {
    return listCurso();
  } catch {
    return [];
  }
});
// Ruta IEC 61131-3 (las mismas ideas en ST, Ladder y FBD).
ipcMain.handle("course:listIec", () => {
  try {
    return listCursoIec();
  } catch {
    return [];
  }
});
ipcMain.handle("learn:lessons", () => loadProgress(progressFile()).lessons ?? {});
ipcMain.handle("learn:lessonSeen", (_e, id) => {
  const p = loadProgress(progressFile());
  if (markLesson(p, String(id))) saveProgress(progressFile(), p);
  return p.lessons;
});
ipcMain.handle("learn:unlockAll", (_e, on) => {
  const p = loadProgress(progressFile());
  p.unlockAll = !!on;
  saveProgress(progressFile(), p);
  return withImages(levels(listExercises(), p, unlockOpts(p)));
});

// Abre una copia del ejercicio en la carpeta de trabajo (sin la solución):
// el alumno trabaja sobre su copia y la vuelve a abrir más tarde.
ipcMain.handle("exercises:open", (_e, id) => {
  if (!/^[\w.-]+$/.test(id)) throw new Error(`ejercicio inválido: ${id}`);
  const src = join(EXERCISES, id);
  const dst = join(workspaceDir(), "Ejercicios", id);
  syncExercise(src, dst);
  return openProject(join(dst, `${id}.jwsim`));
});

// Práctica evaluada de una lección del curso (JWPLC_Aprende/extras/practicas/
// curso-NN): banco propio, el ejemplo de la lección como punto de partida y
// sus objetivos. Se abre como copia en la carpeta de trabajo (Curso/<id>).
function lessonBrief(id) {
  try {
    return loadProject(join(PRACTICAS, id, `${id}.jwsim`)).project.exercise?.brief ?? null;
  } catch {
    return null;
  }
}
// Enlaces de la guía de la lección (wiki de jw-control.com): solo https, en el navegador.
ipcMain.handle("shell:openExternal", (_e, url) => {
  if (!/^https:\/\//.test(String(url))) return false;
  shell.openExternal(String(url));
  return true;
});
ipcMain.handle("lessons:open", (_e, id, lang) => {
  if (!/^(curso|iec)-\d+$/.test(id)) throw new Error(`lección inválida: ${id}`);
  const src = join(PRACTICAS, id);
  if (!existsSync(src)) throw new Error(`la lección ${id} no tiene práctica evaluada`);
  const dst = join(workspaceDir(), "Curso", id);
  syncExercise(src, dst);
  if (lang) chooseLanguage(dst, id, String(lang));
  return openProject(join(dst, `${id}.jwsim`));
});

// Práctica IEC: el banco apunta al programa en el lenguaje elegido
// (iniciar/ST, LD o FBD). La copia anota el .jwsim como «sin tocar» para
// que siga poniéndose al día con el Sim.
function chooseLanguage(dst, id, lang) {
  if (!/^(ST|LD|FBD)$/.test(lang) || !existsSync(join(dst, "iniciar", lang, "project.json"))) throw new Error(`lenguaje no disponible: ${lang}`);
  const file = join(dst, `${id}.jwsim`);
  const jw = JSON.parse(readFileSync(file, "utf8"));
  const want = `./iniciar/${lang}`;
  if (jw.program?.project === want) return;
  jw.program = { ...jw.program, kind: "openplc", project: want };
  const text = JSON.stringify(jw, null, 2) + "\n";
  writeFileSync(file, text);
  try {
    const mf = join(dst, MARK);
    const mark = JSON.parse(readFileSync(mf, "utf8"));
    mark.files[`${id}.jwsim`] = createHash("sha256").update(Buffer.from(text)).digest("hex");
    writeFileSync(mf, `${JSON.stringify(mark, null, 2)}\n`);
  } catch {}
}

// Código de partida de una práctica de lección o de un reto (el ejemplo de la
// lección o el .ino inicial del reto), para «Reiniciar código» en Teoría.
ipcMain.handle("exercise:starter", (_e, id, lesson) => {
  if (!/^[\w.-]+$/.test(String(id))) throw new Error(`ejercicio inválido: ${id}`);
  const src = join(lesson ? PRACTICAS : EXERCISES, id);
  const { project } = loadProject(join(src, `${id}.jwsim`));
  const sketch = project.program?.sketch;
  if (project.program?.kind === "openplc" || typeof sketch !== "string") return [];
  const dir = dirname(resolve(src, sketch));
  return readdirSync(dir)
    .filter((f) => /\.(ino|h|hpp|c|cpp)$/i.test(f))
    .map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") }));
});

// ---------------------------------------------------------------- arquitecturas
// Casos de la vitrina (JWPLC_Aprende/extras/arquitecturas/<id>): proyecto
// completo con su programa, escena y una ficha VITRINA.md con el recorrido y
// las fallas para mostrar. Se abren como copia en la carpeta de trabajo
// (Arquitecturas/<id>).
const ARCHS = ARQUITECTURAS;
const listArchs = () => listArquitecturas().map((a) => ({ ...a, img: imageData("arq", a.id) }));
ipcMain.handle("archs:list", () => listArchs());
ipcMain.handle("archs:open", (_e, id) => {
  if (!/^[\w.-]+$/.test(id)) throw new Error(`arquitectura inválida: ${id}`);
  const src = join(ARCHS, id);
  const dst = join(workspaceDir(), "Arquitecturas", id);
  syncExercise(src, dst);
  const res = openProject(join(dst, `${id}.jwsim`));
  const card = join(dst, "VITRINA.md");
  return { ...res, showcase: existsSync(card) ? readFileSync(card, "utf8") : "" };
});

// Objetivos en vivo del ejercicio abierto (null: ninguno). Cuentan desde la
// corrida siguiente o, si ya corre, desde ahora.
ipcMain.handle("goals:set", (_e, goals) => {
  activeGoals = Array.isArray(goals) && goals.length ? goals : null;
  goalTracker = activeGoals && sceneSession ? new GoalTracker(activeGoals) : null;
});

// Enunciado de un proyecto de ejercicio (o null si no lo es).
ipcMain.handle("exercise:info", (_e, file) => {
  try {
    const { project } = loadProject(file);
    const ex = project.exercise;
    if (!ex) return null;
    const st = ex.statement ? resolve(dirname(file), ex.statement) : null;
    // Objetivos en vivo de la rúbrica (opcionales); si están mal, se avisa.
    let goals = [];
    let goalsError = null;
    try {
      const rub = ex.rubric ? JSON.parse(readFileSync(resolve(dirname(file), ex.rubric), "utf8")) : {};
      checkGoals(rub.goals, ex.rubric);
      goals = rub.goals ?? [];
    } catch (err) {
      goalsError = err.message;
    }
    // id: carpeta del ejercicio (la copia de trabajo se llama igual).
    // Práctica de una lección: la teoría va al panel izquierdo.
    const lesson = typeof ex.lesson === "string" ? lessonById(ex.lesson) : null;
    return { id: basename(dirname(file)), title: project.name, level: ex.level ?? 1, brief: ex.brief ?? null, statement: st && existsSync(st) ? readFileSync(st, "utf8") : "", goals, goalsError, lesson };
  } catch {
    return null;
  }
});

let grader = null;
let gradeSeq = 0;
const grades = new Map();
ipcMain.handle("exercise:grade", (_e, { file, sketchDir }) => {
  if (!grader) {
    grader = new Worker(new URL("./lib/grade-worker.mjs", import.meta.url));
    grader.on("message", ({ id, log, done }) => {
      if (log !== undefined) forward("build:log", log);
      if (done) {
        grades.get(id)?.(done);
        grades.delete(id);
      }
    });
    grader.on("error", (err) => {
      for (const r of grades.values()) r({ ok: false, stage: "error", error: err.message, cases: [] });
      grades.clear();
      grader = null;
    });
  }
  const id = ++gradeSeq;
  return new Promise((r) => {
    grades.set(id, r);
    grader.postMessage({ id, project: file, sketchDir, buildRoot: join(app.getPath("userData"), "grade") });
  });
});

ipcMain.handle("sketch:openExample", (_e, srcDir) => {
  // La copia se pone al día con el package fijado (ver syncExample).
  const dst = join(workspaceDir(), basename(srcDir));
  syncExample(srcDir, dst);
  return readSketch(dst);
});

ipcMain.handle("sketch:new", () => {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  let name = `sketch_${stamp}`;
  for (let i = 2; existsSync(join(workspaceDir(), name)); i++) name = `sketch_${stamp}_${i}`;
  const dir = join(workspaceDir(), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.ino`), TEMPLATE);
  return readSketch(dir);
});

ipcMain.handle("sketch:openDialog", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Abrir sketch o proyecto OpenPLC",
    defaultPath: workspaceDir(),
    properties: ["openFile"],
    filters: [
      { name: "Sketch de Arduino o proyecto OpenPLC", extensions: ["ino", "json"] },
      { name: "Sketch de Arduino", extensions: ["ino"] },
      { name: "Proyecto del OpenPLC Editor (project.json)", extensions: ["json"] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readSketch(dirname(r.filePaths[0]));
});

// Proyecto pedido por el OpenPLC Editor (G6 SIMULATE_BUTTON).
ipcMain.handle("sketch:openPlc", (_e, target) => readSketch(openPlcDir(target)));

ipcMain.handle("sketch:save", (_e, { dir, files }) => {
  if (isOpenPlcProject(dir)) {
    // Proyecto OpenPLC: el texto estructurado (pous/**/*.st) se edita aquí
    // también; Ladder y FBD, en el OpenPLC Editor.
    for (const f of files) {
      const p = resolve(dir, f.name);
      if (!/\.st$/i.test(f.name) || relative(join(resolve(dir), "pous"), p).startsWith("..") || !existsSync(p)) continue;
      ownWrites.set(p, f.content);
      writeFileSync(p, f.content);
    }
    return true;
  }
  for (const f of files) {
    const p = resolve(dir, f.name);
    if (dirname(p) !== resolve(dir)) throw new Error(`nombre de archivo inválido: ${f.name}`);
    ownWrites.set(p, f.content);
    writeFileSync(p, f.content);
  }
  return true;
});

// Archivos adicionales del sketch (como las pestañas de Arduino IDE): .h, .c,
// .cpp y .ino extra se compilan; .md y .txt solo se editan.
ipcMain.handle("sketch:addFile", (_e, { dir, name }) => {
  const root = editableSketchDir(dir);
  const file = sketchFileName(name);
  const taken = sketchEntry(root, file);
  if (taken) throw new Error(`ya existe ${taken} en el sketch`);
  const p = join(root, file);
  const content = newFileContent(file);
  ownWrites.set(p, content);
  writeFileSync(p, content, { flag: "wx" });
  return { name: file, path: p, content };
});

// Programa ▸ Agregar archivo…: copia archivos de otra carpeta al sketch.
ipcMain.handle("sketch:importFiles", async (_e, dir) => {
  const root = editableSketchDir(dir);
  const r = await dialog.showOpenDialog(win, {
    title: "Agregar archivos al sketch",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Código y notas", extensions: ["ino", "h", "hpp", "c", "cpp", "md", "txt"] },
      { name: "Todos los archivos", extensions: ["*"] },
    ],
  });
  if (r.canceled) return { added: [], skipped: [] };
  const added = [];
  const skipped = [];
  for (const src of r.filePaths) {
    const file = basename(src);
    if (!isSketchFile(file)) {
      skipped.push(`${file}: tipo de archivo no admitido`);
      continue;
    }
    if (dirname(resolve(src)) === root) {
      skipped.push(`${file}: ya está en el sketch`);
      continue;
    }
    const taken = sketchEntry(root, file);
    if (taken) {
      skipped.push(`${file}: ya existe ${taken} en el sketch`);
      continue;
    }
    const p = join(root, file);
    const content = readFileSync(src, "utf8");
    ownWrites.set(p, content);
    writeFileSync(p, content, { flag: "wx" });
    added.push({ name: file, path: p, content });
  }
  return { added, skipped };
});

// El .ino principal no se borra: sin él la carpeta deja de ser un sketch.
ipcMain.handle("sketch:deleteFile", (_e, { dir, name }) => {
  const root = editableSketchDir(dir);
  const file = String(name ?? "");
  if (sameName(file, `${basename(root)}.ino`)) throw new Error(`${file} es el archivo principal del sketch: no se puede eliminar`);
  const p = resolve(root, file);
  if (dirname(p) !== root || !isSketchFile(file) || !existsSync(p)) throw new Error(`no existe ${file} en el sketch`);
  // A la papelera, no un borrado definitivo.
  return shell.trashItem(p).then(() => true);
});

// ---------------------------------------------------------------- inicio y nuevo proyecto
// Pantalla «Proyectos» al abrir (como el OpenPLC Editor) y asistente de 3
// pasos: tipo (Arduino u OpenPLC), nombre y carpeta, lenguaje IEC. Los
// proyectos IEC los crea y los edita el OpenPLC Editor (app/lib/openplc-editor.mjs).
// En las pruebas (JWSIM_WORKSPACE) no se muestra, salvo JWSIM_START_SCREEN=1.
ipcMain.handle("app:startScreen", () => (process.env.JWSIM_START_SCREEN ?? (process.env.JWSIM_WORKSPACE ? "0" : "1")) === "1");

const editorCfgFile = () => join(app.getPath("userData"), "openplc-editor.json");
function configuredEditor() {
  try {
    return JSON.parse(readFileSync(editorCfgFile(), "utf8")).path ?? null;
  } catch {
    return null;
  }
}
const findEditor = () => locateEditor({ configured: configuredEditor(), packaged: app.isPackaged, simRoot: join(import.meta.dirname, "..") });
function editorStatus() {
  const ed = findEditor();
  return { found: !!ed, label: ed?.label ?? null, source: ed?.source ?? null, languages: LANGUAGES, workspace: workspaceDir() };
}
ipcMain.handle("openplc:status", () => editorStatus());
// Recientes: abrir un sketch o un proyecto OpenPLC por su carpeta, sin copiarlo.
ipcMain.handle("sketch:openDir", (_e, dir) => {
  if (!dir || !existsSync(dir)) throw new Error(`ya no existe ${dir}`);
  return readSketch(dir);
});

ipcMain.handle("openplc:choose", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Ubicar el OpenPLC Editor (JWPLC Edition)",
    properties: ["openFile"],
    filters: process.platform === "win32" ? [{ name: "Aplicación", extensions: ["exe"] }] : [],
  });
  if (!r.canceled && r.filePaths[0]) writeFileSync(editorCfgFile(), JSON.stringify({ path: r.filePaths[0] }, null, 2) + "\n");
  return editorStatus();
});

ipcMain.handle("project:pickFolder", async (_e, current) => {
  const r = await dialog.showOpenDialog(win, { title: "Carpeta del proyecto", defaultPath: current || workspaceDir(), properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("project:createArduino", (_e, { name, parent }) => {
  const bad = checkProjectName(name);
  if (bad) throw new Error(`nombre no válido: ${bad}`);
  const dir = join(resolve(parent || workspaceDir()), name);
  if (existsSync(dir)) throw new Error(`ya existe ${dir}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.ino`), TEMPLATE);
  return readSketch(dir);
});

ipcMain.handle("project:createOpenPlc", async (_e, { name, parent, language, interval }) => {
  const ed = findEditor();
  if (!ed) throw new Error("no se encontró el OpenPLC Editor (JWPLC Edition): instálelo o ubíquelo con «Ubicar el OpenPLC Editor…»");
  const dir = await createProject(ed, { name, parent: parent || workspaceDir(), language, interval });
  return readSketch(dir);
});

ipcMain.handle("openplc:openInEditor", async (_e, dir) => {
  const ed = findEditor();
  if (!ed) throw new Error("no se encontró el OpenPLC Editor (JWPLC Edition): instálelo o ubíquelo con «Ubicar el OpenPLC Editor…»");
  await openInEditor(ed, dir);
  editorLinked = true;
  return ed.label;
});

// ---------------------------------------------------------------- proyectos
ipcMain.handle("project:open", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Abrir proyecto",
    defaultPath: workspaceDir(),
    properties: ["openFile"],
    filters: [{ name: "Proyecto JWPLC Sim", extensions: ["jwsim"] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return openProject(r.filePaths[0]);
});

function openProject(file) {
  const { project, migratedFrom, links, missing } = loadProject(file);
  if (missing.some((m) => m.link === "sketch")) throw new Error(`el sketch vinculado no existe: ${links.sketch}`);
  if (project.program?.kind === "openplc") {
    if (!links.plcProject || missing.some((m) => m.link === "plcProject")) throw new Error(`el proyecto OpenPLC vinculado no existe: ${links.plcProject}`);
    return { file, project, migratedFrom, links, missing, sketch: readSketch(links.plcProject) };
  }
  return { file, project, migratedFrom, links, missing, sketch: readSketch(dirname(links.sketch)) };
}
ipcMain.handle("project:openFile", (_e, file) => openProject(file));

ipcMain.handle("project:save", async (_e, { file, project, sketchDir, simulation, scene }) => {
  let target = file;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: "Guardar proyecto",
      defaultPath: join(dirname(sketchDir), `${basename(sketchDir)}.jwsim`),
      filters: [{ name: "Proyecto JWPLC Sim", extensions: ["jwsim"] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  const saved = saveProject(target, project ?? { name: basename(sketchDir) }, {
    ...(isOpenPlcProject(sketchDir) ? { plcProjectPath: sketchDir } : { sketchPath: join(sketchDir, `${basename(sketchDir)}.ino`) }),
    simulation,
    scene,
  });
  const abs = resolve(target);
  if (existsSync(abs)) ownWrites.set(abs, readFileSync(abs, "utf8"));
  return { file: target, project: saved };
});

// Vigila el archivo .jwsim abierto: permite reflejar ediciones hechas por
// agentes o editores externos sin perder trabajo manual del usuario.
ipcMain.handle("project:watch", (_e, file) => {
  clearTimeout(projectWatchTimer);
  projectWatchTimer = null;
  projectWatcher?.close();
  projectWatcher = null;
  if (!file) return false;
  const abs = resolve(file);
  try {
    if (existsSync(abs)) ownWrites.set(abs, readFileSync(abs, "utf8"));
  } catch {}
  const dir = dirname(abs);
  const name = basename(abs).toLowerCase();
  projectWatcher = watch(dir, (_event, rawName) => {
    if (rawName && basename(String(rawName)).toLowerCase() !== name) return;
    clearTimeout(projectWatchTimer);
    projectWatchTimer = setTimeout(() => {
      projectWatchTimer = null;
      let content;
      let res;
      try {
        if (!existsSync(abs) || !statSync(abs).isFile()) return;
        content = readFileSync(abs, "utf8");
        if (ownWrites.get(abs) === content) return;
        res = openProject(abs);
      } catch {
        // Ignorar bloqueos transitorios o JSON truncado durante escritura externa.
        return;
      }
      ownWrites.set(abs, content);
      forward("project:changed", { file: abs, res, at: Date.now() });
    }, 80);
  });
  projectWatcher.on("error", () => {});
  return true;
});

// ---------------------------------------------------------------- recarga externa
// Vigila la carpeta del sketch: un cambio hecho fuera (Arduino IDE, otro
// editor) llega a la interfaz, que recarga el editor y la simulación.
ipcMain.handle("watch:set", (_e, dir) => {
  watcher?.close();
  watcher = null;
  if (!dir) return false;
  const pending = new Map();
  // Proyecto OpenPLC: lo que guarda el editor (project.json, pous/, devices/,
  // hmi/), en subcarpetas; nunca su salida (build/).
  const plc = isOpenPlcProject(dir);
  const relevant = (name) =>
    plc ? !/^build[\\/]/.test(name) && (name === "project.json" || /^(pous|devices|hmi)[\\/]/.test(name)) : isSketchFile(name);
  watcher = watch(dir, { recursive: plc }, (_event, rawName) => {
    const name = rawName && String(rawName).split(sep).join("/");
    if (!name || !relevant(name)) return;
    const p = join(dir, name);
    clearTimeout(pending.get(p));
    // Los editores suelen escribir en varios pasos: se espera a que se asiente.
    pending.set(
      p,
      setTimeout(() => {
        if (!existsSync(p)) {
          // Sketch: un archivo borrado fuera se quita de las pestañas.
          if (!plc) {
            ownWrites.delete(p);
            forward("fs:changed", { name, path: p, content: null, deleted: true, at: Date.now(), openplc: false });
          }
          return;
        }
        if (!statSync(p).isFile()) return;
        const content = readFileSync(p, "utf8");
        if (ownWrites.get(p) === content) return;
        ownWrites.set(p, content);
        forward("fs:changed", { name, path: p, content, at: Date.now(), openplc: plc });
      }, 60),
    );
  });
  return true;
});

// Un worker persistente: conserva las cachés en memoria entre compilaciones.
let builder = null;
let buildSeq = 0;
const builds = new Map();
function buildInWorker(dir, outDir) {
  if (!builder) {
    builder = new Worker(new URL("./lib/build-worker.mjs", import.meta.url));
    builder.on("message", ({ id, log, done }) => {
      if (log !== undefined) forward("build:log", log);
      if (done) {
        builds.get(id)?.(done);
        builds.delete(id);
      }
    });
    builder.on("error", (err) => {
      for (const resolveBuild of builds.values()) resolveBuild({ ok: false, message: `el compilador interno falló: ${err.message}`, diagnostics: [], output: "" });
      builds.clear();
      builder = null;
    });
  }
  const id = ++buildSeq;
  return new Promise((resolveBuild) => {
    builds.set(id, resolveBuild);
    builder.postMessage({ id, dir, outDir });
  });
}

ipcMain.handle("sketch:build", async (_e, dir) => {
  await stopRunner();
  const outDir = join(app.getPath("userData"), "build", basename(dir));
  const t0 = Date.now();
  const r = await buildInWorker(dir, outDir);
  return { ...r, ms: Date.now() - t0 };
});

// Memoria no volátil de la placa (FRAM, NVS, SD): por proyecto (junto al
// .jwsim, carpeta "<nombre>.estado") o, sin proyecto, por sketch en los datos
// de la app. Al empezar una sesión se guarda una copia ("…inicio") para que
// la reproducción de su grabación parta del mismo estado.
function stateDirs(exe, projectFile) {
  const dir = projectFile ? projectFile.replace(/\.jwsim$/i, "") + ".estado" : join(app.getPath("userData"), "estado", basename(dirname(exe)));
  return { dir, start: `${dir}.inicio`, replay: `${dir}.reproduccion` };
}
function copyDir(from, to) {
  rmSync(to, { recursive: true, force: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
  else mkdirSync(to, { recursive: true });
}

// W5500 de la placa: poblado, como viene el JWPLC Basic. El proyecto puede
// quitarlo (simulation.peripherals.ethernet.present = false) o configurar
// la red ("ip" para el DHCP de la red virtual, "listenHost" "0.0.0.0" para
// publicar en la LAN y "portOffset" para los puertos de escucha).
let bridge = null;
// Puente de E/S (G8): la bornera como esclavo Modbus TCP para Open Industry
// Project o FUXA (app/lib/io-bridge.mjs). En el proyecto,
// simulation.ioBridge: { "present": false } lo quita; "port" (5020) y
// "listenHost" ("127.0.0.1"; "0.0.0.0" para la LAN) lo configuran.
let ioBridge = null;
// Puerto COM virtual (JW Serial u otro programa): queda abierto entre corridas.
let comBridge = null;
// Enlaces de la escena con la PC (conversor USB a RS-485, cable USB): se
// abren al iniciar la simulación y se cierran al detenerla.
let hostLinks = [];
let lastSceneInputs = null;
function ioBridgeConfig(projectFile) {
  let cfg = {};
  if (projectFile) {
    try {
      cfg = loadProject(projectFile).project.simulation?.ioBridge ?? {};
    } catch {
      cfg = {};
    }
  }
  return cfg.present === false ? null : cfg;
}
function ethernetConfig(projectFile) {
  let eth = {};
  if (projectFile) {
    try {
      eth = loadProject(projectFile).project.simulation?.peripherals?.ethernet ?? {};
    } catch {
      eth = {};
    }
  }
  return eth.present === false ? null : eth;
}
/** Hora fija del RTC al arrancar (simulation.rtc = "fijo:AAAA-MM-DDTHH:MM:SS"), p. ej. una práctica con horario. */
function projectRtc(projectFile) {
  if (!projectFile) return null;
  try {
    const r = loadProject(projectFile).project.simulation?.rtc;
    return typeof r === "string" && /^fijo:\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(r) ? r : null;
  } catch {
    return null;
  }
}

// stim: archivo .stim a reproducir desde t = 0 (grabación de una sesión).
// Hora local de la PC como "fijo:AAAA-MM-DDTHH:MM:SS" para el RTC simulado.
function localRtcNow() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, "0");
  return `fijo:${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// rtc: hora de arranque del RTC ("fijo:…"); sin ella, la hora local de la PC
// (como sincronizar el reloj al encender). Se devuelve para guardarla en la
// grabación: la reproducción arranca con la misma hora.
ipcMain.handle("sim:start", async (_e, { exe, stim, projectFile, rtc, scene }) => {
  await stopRunner();
  // Escena (G7): se valida antes de lanzar el runner. Al reproducir una
  // grabación no hay escena: las entradas salen del .stim.
  let sceneObj = null;
  if (scene?.devices?.length && !stim) {
    try {
      sceneObj = new Scene(scene, { registry: await registry() });
    } catch (err) {
      return { error: `escena: ${err.message}` };
    }
  }
  const r = new RunnerProcess();
  runner = r;
  runnerExe = exe;
  // Los horizontes de la escena (cientos por segundo) y los bytes del enlace
  // Modbus son de SceneSession: no van a la interfaz.
  r.on("message", (m) => {
    // Monitor Serie (puerto 0) para los objetivos de consola y de ritmo.
    if (m.type === "serial" && !m.port && goalTracker) goalTracker.serial(m.text, m.t_ns !== undefined ? Number(m.t_ns) / 1e6 : undefined);
    if (m.type !== "horizon" && m.type !== "uart_tx" && m.type !== "uart_out") forward("sim:message", m);
  });
  if (sceneObj) {
    sceneSession = new SceneSession(r, sceneObj);
    goalTracker = activeGoals?.length ? new GoalTracker(activeGoals) : null;
    sceneSession.on("snapshot", (snap) => {
      lastSceneInputs = snap.inputs ?? null;
      updateHostLinks(sceneObj);
      forward("scene:snapshot", snap);
      if (goalTracker) forward("goals:progress", goalTracker.update(snap));
    });
    sceneSession.on("error", (err) => forward("sim:stderr", `[jwsim] escena: ${err.message}\n`));
  }
  r.on("display", (buf) => forward("sim:display", buf));
  r.on("stderr", (t) => forward("sim:stderr", t));
  r.on("exit", (info) => {
    if (runner === r) {
      runner = null;
      detachDebugger();
    }
    forward("sim:exit", info);
  });
  // JWSIM_DEBUG: el runner admite que gdb se le adjunte más tarde.
  const st = stateDirs(exe, projectFile);
  let stateDir = st.dir;
  if (stim) {
    copyDir(st.start, st.replay);
    stateDir = st.replay;
  } else {
    copyDir(st.dir, st.start);
  }
  const rtcArg = rtc ?? projectRtc(projectFile) ?? localRtcNow();
  // esp_restart(): el proceso nuevo tiene otro pid; con breakpoints, gdb se
  // vuelve a adjuntar antes de que el firmware reanude.
  const onRestart = async () => {
    if (runner !== r) return;
    await detachDebugger();
    if (hasBreakpoints()) await attachDebugger();
  };
  const eth = ethernetConfig(projectFile);
  r.start(exe, [...(stim ? ["--stim", stim] : []), "--state", stateDir, "--rtc", rtcArg, ...(eth ? [] : ["--no-eth"])], { env: { JWSIM_DEBUG: "1" }, onRestart });
  // Red del host para el W5500 (al reproducir una grabación, la red sale
  // del .stim: sin puente).
  if (eth && !stim) {
    bridge = new NetBridge({
      plcIp: eth.ip,
      listenHost: eth.listenHost ?? "127.0.0.1",
      ...(eth.portOffset !== undefined ? { listenPort: (p) => p + eth.portOffset } : {}),
    });
    bridge.on("listening", (p, hp) => forward("sim:stderr", `[jwsim] Ethernet: puerto ${p} del PLC en ${bridge.listenHost}:${hp}\n`));
    bridge.on("error", (err) => forward("sim:stderr", `[jwsim] Ethernet: ${err.message}\n`));
    bridge.attach(r);
  }
  const iob = !stim && ioBridgeConfig(projectFile);
  if (iob) {
    lastSceneInputs = null;
    ioBridge = new IoBridge({ port: iob.port ?? 5020, host: iob.listenHost ?? "127.0.0.1", owns: (s) => !!lastSceneInputs && s in lastSceneInputs });
    ioBridge.on("listening", (h, p) => forward("sim:stderr", `[jwsim] puente de E/S (Modbus TCP): bornera en ${h}:${p}\n`));
    ioBridge.on("error", (err) => {
      forward("sim:stderr", `[jwsim] ${err.message}\n`);
      forward("iobridge:status", { state: "error", message: err.message, clients: [] });
    });
    // Indicador de la barra de estado y una línea en la consola por cada
    // cambio de conexión (conectado, en pausa, desconectado).
    let prevState = "";
    ioBridge.on("status", (st) => {
      forward("iobridge:status", st);
      const who = st.clients.some((c) => c.kind === "oip") ? "Open Industry Project" : "cliente Modbus";
      if (st.state !== prevState && prevState) {
        const msg = { connected: `${who} conectado`, quiet: `${who} conectado, sin pedidos (¿Stop en OIP?)`, waiting: "sin clientes, esperando" }[st.state];
        if (msg) forward("sim:stderr", `[jwsim] puente de E/S: ${msg}\n`);
      }
      prevState = st.state;
    });
    // Vigilancia del puente: solo se avisa si alguna entrada estaba en 1.
    ioBridge.on("released", ({ wasOn }) => {
      if (!wasOn.length) return;
      const names = wasOn.map((s) => s.replace("_", ".")).join(", ");
      forward("sim:stderr", `[jwsim] puente de E/S: el cliente se fue o dejó de pedir: ${names} a 0\n`);
    });
    ioBridge.attach(r);
  }
  // Al reproducir una grabación, lo que llegó del COM ya está en el .stim.
  if (comBridge && !stim) comBridge.attach(r);
  if (sceneObj) await openHostLinks(sceneObj, r);
  // Con breakpoints ya puestos, gdb se adjunta antes de que corra el firmware.
  if (hasBreakpoints()) {
    try {
      await attachDebugger();
    } catch (err) {
      forward("sim:stderr", `[jwsim] ${err.message}\n`);
    }
  }
  return { rtc: rtcArg };
});

// Abre el COM de cada conversor o cable USB de la escena y lo une al runner.
// Un COM que no se puede abrir (o que ya tiene el botón COM) queda avisado en
// la consola y la simulación sigue sin él.
async function openHostLinks(scene, r) {
  for (const p of scene.hostPorts()) {
    if (!p.com) continue;
    if (comBridge?.path?.toUpperCase() === p.com.toUpperCase() || hostLinks.some((l) => l.path.toUpperCase() === p.com.toUpperCase())) {
      forward("sim:stderr", `[jwsim] ${p.device}: ${p.com} ya está en uso en el Sim (botón COM u otro equipo de la escena)\n`);
      continue;
    }
    const link = new HostLink(p);
    try {
      await link.open();
    } catch (err) {
      forward("sim:stderr", `[jwsim] ${p.device}: ${err.message}\n`);
      continue;
    }
    if (runner !== r) {
      await link.close();
      return;
    }
    link.on("error", (err) => forward("sim:stderr", `[jwsim] ${p.device} (${p.com}): ${err.message}\n`));
    link.attach(r);
    hostLinks.push(link);
    forward("sim:stderr", `[jwsim] ${describeLink(p)}\n`);
  }
}

// Un cable cortado o reparado en marcha cambia el enlace.
function updateHostLinks(scene) {
  if (!hostLinks.length) return;
  for (const p of scene.hostPorts()) {
    const link = hostLinks.find((l) => l.device === p.device);
    if (!link || link.spec.wiring === p.wiring) continue;
    link.update(p);
    forward("sim:stderr", `[jwsim] ${describeLink(p)}\n`);
  }
}

// ---------------------------------------------------------------- escena (G7)
function registry() {
  // Un dispositivo instalado roto no deja a la app sin la biblioteca incluida.
  // Un dispositivo enlazado que no carga (error en su código) se avisa y se salta.
  registryPromise ??= registryWithInstalled({ onError: (d, err) => forward("sim:stderr", `[jwsim] dispositivo ${d.type ?? d.dir}: ${err.message}\n`) }).catch((err) => {
    forward("sim:stderr", `[jwsim] dispositivos instalados: ${err.message}\n`);
    return new Registry();
  });
  return registryPromise;
}

// ---- Gestor de dispositivos (modo desarrollador): carpetas enlazadas sin el
// índice firmado, validadas (contrato y símbolos en la grilla) y recargadas
// sin reiniciar. Una simulación en marcha sigue con lo que tenía.
async function devicesState() {
  const reg = await registry();
  const local = await Promise.all(localDevices().map((d) => (d.error ? { dir: d.dir, ok: false, errors: [d.error], warnings: [] } : checkDeviceDir(d.dir))));
  for (const d of local) d.loaded = !!d.type && reg.list().some((x) => x.type === d.type);
  const fromIndex = installedDevices().filter((d) => !d.local).map(({ type, version, kind, name }) => ({ type, version, kind, name }));
  return { builtin: builtinDevices.length, installed: fromIndex, local };
}
function reloadDevices() {
  registryPromise = null;
  return registry();
}
ipcMain.handle("devices:list", () => devicesState());
ipcMain.handle("devices:link", async (_e, dir) => {
  if (!dir) {
    const r = await dialog.showOpenDialog(win, { title: "Carpeta del dispositivo (con jwsim-device.json)", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
  }
  await linkDevice(dir);
  await reloadDevices();
  return devicesState();
});
ipcMain.handle("devices:unlink", async (_e, dir) => {
  unlinkDevice(dir);
  await reloadDevices();
  return devicesState();
});
ipcMain.handle("devices:reload", async () => {
  await reloadDevices();
  return devicesState();
});
ipcMain.handle("devices:reveal", (_e, dir) => shell.openPath(dir));

// ---- Nuevo dispositivo (etapa B): bloques de comportamiento → carpeta del
// SDK generada (cli/lib/device-gen.mjs), enlazada y lista en la paleta.
const devicesHome = () => join(workspaceDir(), "Dispositivos");
ipcMain.handle("devices:behaviors", () => ({ behaviors: BEHAVIORS, models: MODELS, ramp: RAMP, parent: devicesHome() }));
ipcMain.handle("devices:preview", (_e, spec) => {
  try {
    const o = normalizeSpec(spec);
    const L = symbolLayout(o);
    return { ok: true, type: o.type, svg: generateDevice(spec).files["symbol.svg"], w: L.w, h: L.h, top: L.top.map((t) => t.id), bottom: L.bottom.map((t) => t.id) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle("devices:pickParent", async (_e, current) => {
  const r = await dialog.showOpenDialog(win, { title: "Carpeta donde crear el dispositivo", defaultPath: current || devicesHome(), properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("devices:create", async (_e, { spec, parent }) => {
  const r = writeDevice(parent || devicesHome(), spec);
  await linkDevice(r.dir);
  await reloadDevices();
  return { dir: r.dir, type: r.spec.type, state: await devicesState() };
});

// ---- Editor de componentes (hito 1, docs/COMPONENTES.md): componentes
// declarativos (solo datos, sin código del autor) con su dibujo, bornes,
// modelo por bloques y mapa Modbus; se guardan como carpeta enlazada.
ipcMain.handle("comp:info", () => ({ models: LTI_MODELS, blocks: BLOCK_KINDS, io: IO_KINDS, signals: SIGNALS, parent: devicesHome() }));
ipcMain.handle("comp:check", (_e, spec) => {
  const vars = componentVars(spec);
  const terminals = componentTerminals(spec);
  try {
    const { warnings } = checkComponent(spec);
    const def = buildComponent(spec);
    return { ok: true, errors: [], warnings, vars, terminals, parameters: def.parameters };
  } catch (err) {
    return { ok: false, errors: err.errors ?? [err.message], warnings: err.warnings ?? [], vars, terminals };
  }
});
ipcMain.handle("comp:symbol", (_e, { spec, art }) => {
  try {
    return { ok: true, ...symbolSvg(spec, componentTerminals(spec), art || null) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle("comp:save", async (_e, { spec, art, dir }) => {
  const target = resolve(dir || join(devicesHome(), folderOf(spec.type)));
  const r = writeComponent(target, spec, art ?? null);
  if (!localDevices().some((d) => resolve(d.dir) === target)) await linkDevice(target);
  await reloadDevices();
  return { dir: target, spec: r.spec };
});
ipcMain.handle("comp:open", async (_e, dir) => {
  if (!dir) {
    const r = await dialog.showOpenDialog(win, { title: "Carpeta del componente (con component.json)", defaultPath: devicesHome(), properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
  }
  return { dir, ...readComponent(dir) };
});
// Ejemplos incluidos (sdk/examples con component.json): se abren como copia (se guardan en Dispositivos).
ipcMain.handle("comp:examples", () => {
  const root = join(import.meta.dirname, "..", "sdk", "examples");
  return readdirSync(root)
    .filter((d) => existsSync(join(root, d, "component.json")))
    .map((d) => ({ id: d, ...readComponent(join(root, d)) }));
});
let bench = null;
ipcMain.handle("comp:benchStart", (_e, spec) => {
  bench = new ComponentBench(spec);
  return bench.advance(0, {});
});
ipcMain.handle("comp:benchStep", (_e, { dtMs, inputs }) => (bench ? bench.advance(dtMs, inputs) : null));
ipcMain.handle("comp:benchWrite", (_e, { table, reg, value }) => {
  if (!bench) return null;
  const ok = bench.write(table, reg, value);
  return { ok, state: bench.state() };
});

// Definiciones para la paleta y el inspector (sin funciones).
ipcMain.handle("scene:devices", async () =>
  (await registry()).list().map((d) => ({
    type: d.type,
    version: d.version,
    name: d.name,
    category: d.category ?? "Otros",
    description: d.description ?? "",
    parameters: d.parameters ?? [],
    presets: d.presets ?? [],
    terminals: d.terminals,
    actions: d.actions ?? [],
    installed: installedDevices().some((x) => x.type === d.type),
    local: installedDevices().some((x) => x.type === d.type && x.local),
  })),
);

// Símbolos .svg (contrato en docs/SIMBOLOS.md): app/renderer/assets/devices/
// <nombre>.svg para la biblioteca incluida (jwsim/<nombre>) o
// <autor>__<nombre>.svg, y symbol.svg de cada dispositivo instalado.
ipcMain.handle("scene:symbols", () => {
  const out = {};
  const dir = join(import.meta.dirname, "renderer", "assets", "devices");
  if (existsSync(dir)) {
    // <nombre>.svg → jwsim/<nombre>; <nombre>__<variante>.svg de un tipo incluido →
    // su variante (jwsim/<nombre>__<variante>); <autor>__<nombre>.svg → <autor>/<nombre>.
    const builtin = new Set(builtinDevices.map((d) => d.type.split("/")[1]));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".svg"))) {
      const name = f.slice(0, -4);
      const [head] = name.split("__");
      const key = !name.includes("__") || builtin.has(head) ? `jwsim/${name}` : name.replace("__", "/");
      out[key] = readFileSync(join(dir, f), "utf8");
    }
  }
  // Dispositivos instalados: symbol.svg y sus variantes symbol__<variante>.svg.
  for (const d of installedDevices()) {
    if (!existsSync(d.dir)) continue;
    for (const f of readdirSync(d.dir).filter((x) => /^symbol(__[a-z0-9]+)?\.svg$/.test(x))) {
      out[`${d.type}${f.slice(6, -4)}`] = readFileSync(join(d.dir, f), "utf8");
    }
  }
  return out;
});

ipcMain.handle("scene:boardSvg", () => readFileSync(join(import.meta.dirname, "renderer", "assets", "jwplc-basic.svg"), "utf8"));

// Análisis de la escena sin simular (al editar): estado en t = 0, avisos del
// cableado y fallas inmediatas (p. ej. un cortocircuito directo).
ipcMain.handle("scene:analyze", async (_e, spec) => {
  try {
    return { snapshot: wireSnapshot(new Scene(spec, { registry: await registry() }).snapshot()) };
  } catch (err) {
    return { error: err.message };
  }
});

// Esquema normalizado (IEC 60617) generado del circuito: hojas con la
// geometría y el borne de referencia de cada tramo (scene/iec.mjs).
ipcMain.handle("scene:iec", async (_e, { spec, title }) => {
  try {
    return iecModel(new Scene(spec, { registry: await registry() }), { title });
  } catch (err) {
    return { error: err.message, sheets: [] };
  }
});

// Esquema IEC a PDF: una hoja por página (A4 apaisada por defecto, o A3), impresa por
// una ventana oculta con el SVG y los estilos que manda la vista.
ipcMain.handle("iec:pdf", async (_e, { pages, css, name, size: req }) => {
  const size = req === "A3" ? "A3" : "A4";
  const fmt = size === "A4" ? { w: 297, h: 210 } : { w: 420, h: 297 };
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${size === "A4" ? "A4" : "A3"} landscape;margin:0}` +
    `html,body{margin:0;background:#fff}.iec-view{position:static;display:block;background:#fff;color-scheme:light}` +
    `.pg{width:${fmt.w}mm;height:${fmt.h}mm;page-break-after:always;overflow:hidden}.pg:last-child{page-break-after:auto}.pg svg{display:block;width:100%;height:100%}` +
    `${css}</style></head><body><div class="iec-view">${pages.map((p) => `<div class="pg">${p}</div>`).join("")}</div></body></html>`;
  let file;
  if (process.env.JWSIM_E2E_PDF_DIR) file = join(process.env.JWSIM_E2E_PDF_DIR, `${basename(name || "esquema")}.pdf`);
  else {
    const r = await dialog.showSaveDialog(win, {
      title: "Exportar esquema IEC a PDF",
      defaultPath: join(workspaceDir(), `${name || "esquema"} - esquema IEC.pdf`),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath;
  }
  const tmp = join(app.getPath("temp"), `jwsim-iec-${process.pid}.html`);
  writeFileSync(tmp, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ pageSize: size === "A4" ? "A4" : "A3", landscape: true, printBackground: true, margins: { marginType: "none" } });
    writeFileSync(file, pdf);
    return { file, pages: pages.length };
  } finally {
    pw.destroy();
    rmSync(tmp, { force: true });
  }
});

ipcMain.handle("scene:act", (_e, { device, action, value }) => {
  sceneSession?.act(device, action, value);
  return !!sceneSession;
});

ipcMain.handle("scene:inject", (_e, fault) => {
  sceneSession?.inject(fault);
  return !!sceneSession;
});

ipcMain.handle("scene:clearFault", (_e, key) => {
  sceneSession?.clearFault(key);
  return !!sceneSession;
});

// Modo Diagnóstico: bloqueo y etiquetado, multímetro y pinza (scene/meter.mjs).
ipcMain.handle("scene:lockout", (_e, on) => {
  sceneSession?.lockout(on);
  return !!sceneSession;
});

ipcMain.handle("scene:measure", (_e, { red, black, mode }) => {
  if (!sceneSession) return { error: "Inicie la simulación para medir" };
  try {
    const r = sceneSession.scene.measure(red, black, mode);
    return { value: Number.isFinite(r.value) ? r.value : null, live: r.live };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("scene:clamp", (_e, { a, b }) => {
  if (!sceneSession) return { error: "Inicie la simulación para medir" };
  try {
    return { value: sceneSession.scene.clamp(a, b) };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("scene:rearm", () => {
  sceneSession?.rearm();
  return !!sceneSession;
});

ipcMain.handle("sim:command", (_e, msg) => {
  if (msg?.type === "run" && msg.speed !== undefined) sceneSession?.setSpeed(msg.speed);
  runner?.send(msg);
  return !!runner;
});

// ---------------------------------------------------------------- puerto COM virtual
const comStatus = () => (comBridge ? { path: comBridge.path, uart: comBridge.uart } : null);
// Script de com0com que trae el instalador de Windows (scripts/fetch-com0com.mjs).
const COM_INSTALL = join(import.meta.dirname, "..", ".jwsim", "com0com", "instalar-puerto-com.cmd");
ipcMain.handle("com:list", async () => ({
  available: await comAvailable(),
  ports: await listComPorts(),
  current: comStatus(),
  canInstall: process.platform === "win32" && existsSync(COM_INSTALL),
}));
// Instala com0com y el par COM20 <-> COM21 como administrador (Windows pide
// permiso). Para quien no lo instaló junto con JWPLC Sim.
ipcMain.handle("com:install", () => {
  if (process.platform !== "win32" || !existsSync(COM_INSTALL)) return { error: "este JWPLC Sim no trae el instalador del puerto COM" };
  const ps = `$p = Start-Process -FilePath '${COM_INSTALL.replaceAll("'", "''")}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
  return new Promise((done) => {
    const c = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true });
    c.on("error", (err) => done({ error: err.message }));
    c.on("exit", (code) => done(code === 0 ? { ok: true } : { error: `la instalación terminó con código ${code} (¿se canceló el permiso de administrador?)` }));
  });
});
// cfg = { path, uart } conecta; null desconecta.
ipcMain.handle("com:set", async (_e, cfg) => {
  await comBridge?.close();
  comBridge = null;
  if (!cfg?.path) return { current: null };
  const b = new ComBridge({ path: cfg.path, uart: cfg.uart === 2 ? 2 : 0 });
  try {
    await b.open();
  } catch (err) {
    return { error: err.message, current: null };
  }
  b.on("error", (err) => forward("sim:stderr", `[jwsim] puerto ${b.path}: ${err.message}\n`));
  b.on("closed", () => {
    if (comBridge !== b) return;
    comBridge = null;
    forward("com:closed", b.path);
  });
  comBridge = b;
  if (runner) b.attach(runner);
  return { current: comStatus() };
});

ipcMain.handle("sim:stop", async () => {
  await stopRunner();
  return true;
});

ipcMain.handle("dbg:setBreakpoints", async (_e, { path, lines }) => {
  breakpoints.set(path, lines);
  if (debug) return debug.setBreakpoints(path, lines);
  if (runner && lines.length) {
    await attachDebugger();
    return null; // start() ya los fijó; llegan en dbg:attached
  }
  return null;
});

ipcMain.handle("dbg:command", async (_e, { cmd }) => {
  const d = cmd === "pause" ? await attachDebugger() : debug;
  if (!d) return false;
  if (cmd === "detach") await detachDebugger();
  else if (["continue", "next", "stepIn", "stepOut", "pause"].includes(cmd)) await d[cmd]();
  return true;
});

ipcMain.handle("dbg:stack", () => debug?.stack() ?? []);
ipcMain.handle("dbg:scopes", async (_e, frameId) => {
  if (!debug) return [];
  const scopes = await debug.scopes(frameId);
  // Argumentos y locales se muestran abiertos; otros ámbitos (gdb 16 agrega
  // uno con todas las globales y constantes del programa) se cargan al abrirlos.
  const open = (sc) => sc.name === "Arguments" || sc.name === "Locals";
  return Promise.all(scopes.map(async (sc) => ({ ...sc, lazy: !open(sc), vars: open(sc) ? await debug.variables(sc.ref) : [] })));
});
ipcMain.handle("dbg:variables", (_e, ref) => debug?.variables(ref) ?? []);
ipcMain.handle("dbg:evaluate", async (_e, { expressions, frameId }) => {
  if (!debug) return null;
  const out = {};
  for (const e of expressions) out[e] = await debug.evaluate(e, frameId).then((v) => v.value, (err) => `‹${err.message}›`);
  return out;
});
// Tabla de observación con el firmware corriendo: adjunta gdb si hace falta.
ipcMain.handle("dbg:sample", async (_e, expressions) => {
  if (!runner || !expressions.length) return null;
  const d = debug ?? (await attachDebugger());
  return d.sample(expressions);
});

// ---------------------------------------------------------------- grabación
ipcMain.handle("stim:save", async (_e, { text, name }) => {
  // Pruebas E2E: sin diálogo, en la carpeta indicada.
  if (process.env.JWSIM_E2E_STIM_DIR) {
    const file = join(process.env.JWSIM_E2E_STIM_DIR, `${basename(name)}.stim`);
    writeFileSync(file, text);
    return file;
  }
  const r = await dialog.showSaveDialog(win, {
    title: "Guardar grabación",
    defaultPath: join(workspaceDir(), `${name}.stim`),
    filters: [{ name: "Estímulos JWPLC Sim", extensions: ["stim"] }],
  });
  if (r.canceled || !r.filePath) return null;
  writeFileSync(r.filePath, text);
  return r.filePath;
});
ipcMain.handle("stim:open", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Reproducir grabación",
    defaultPath: workspaceDir(),
    properties: ["openFile"],
    filters: [{ name: "Estímulos JWPLC Sim", extensions: ["stim"] }],
  });
  const file = r.canceled ? null : r.filePaths[0];
  return file ? { file, text: readFileSync(file, "utf8") } : null;
});

// Pantalla de un JWPLC Basic real (JWPLC_WebScreen): ventana aparte que pide la IP
// y carga la página que sirve el equipo. Sin preload: es contenido de la red.
let realWin = null;
function openRealDevice() {
  if (realWin && !realWin.isDestroyed()) {
    realWin.focus();
    return;
  }
  realWin = new BrowserWindow({
    width: 1040,
    height: 760,
    title: "JWPLC real",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#14171b" : "#f5f7fa",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  realWin.loadFile(join(import.meta.dirname, "renderer", "equipo.html"));
  realWin.on("closed", () => (realWin = null));
}

const EXAMPLE_SECTIONS = [
  ["JWPLC_Aprende", "JWPLC_GlobalPeripherals"],
  ["JWPLC_Display", "JWPLC_UI_Widgets", "JWPLC_Runtime", "JWPLC_WebScreen"],
  ["JWPLC_Ethernet", "JWPLC_RS485", "JWPLC_ModbusRTU", "JWPLC_ModbusTCP", "JWPLC_Expansion"],
  ["JW_DWIN", "JW_FRAM", "JW_MatrixButtons", "JW_ModbusRTU", "JW_RS485", "JW_RTC", "JW_SD"],
];

function examplesSubmenu() {
  let list;
  try {
    list = listExamples();
  } catch {
    return [{ label: "No disponibles", enabled: false }];
  }
  if (!list.length) return [{ label: "Sin ejemplos", enabled: false }];
  const byLib = new Map();
  for (const ex of list) {
    if (!byLib.has(ex.group)) byLib.set(ex.group, []);
    byLib.get(ex.group).push(ex);
  }
  const toMenuItems = (items) => {
    const files = [];
    const dirs = new Map();
    for (const ex of items) {
      const parts = String(ex.label ?? ex.name).split(" / ");
      if (parts.length <= 1) {
        files.push({ label: parts[0], click: () => forward("menu", `example:${ex.dir}`) });
      } else {
        const sub = parts[0];
        if (!dirs.has(sub)) dirs.set(sub, []);
        dirs.get(sub).push({ ...ex, label: parts.slice(1).join(" / ") });
      }
    }
    const dirItems = [...dirs.entries()].map(([sub, subItems]) => ({ label: sub, submenu: toMenuItems(subItems) }));
    return files.length && dirItems.length ? [...files, { type: "separator" }, ...dirItems] : [...files, ...dirItems];
  };

  const used = new Set();
  const menu = [];
  const pushSection = (libs) => {
    const items = [];
    for (const lib of libs) {
      if (!byLib.has(lib)) continue;
      used.add(lib);
      items.push({ label: lib, submenu: toMenuItems(byLib.get(lib)) });
    }
    if (!items.length) return;
    if (menu.length) menu.push({ type: "separator" });
    menu.push(...items);
  };
  for (const sec of EXAMPLE_SECTIONS) pushSection(sec);
  pushSection([...byLib.keys()].filter((g) => !used.has(g) && g.startsWith("JWPLC_")).sort());
  pushSection([...byLib.keys()].filter((g) => !used.has(g) && !g.startsWith("JWPLC_")).sort());
  return menu;
}

function buildMenu() {
  const send = (cmd) => () => forward("menu", cmd);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Archivo",
        submenu: [
          { label: "Inicio…", click: send("startScreen") },
          { label: "Ruta de aprendizaje…", click: send("learnCenter") },
          { label: "Nuevo proyecto…", accelerator: "CmdOrCtrl+Alt+N", click: send("newProject") },
          { label: "Nuevo sketch", accelerator: "CmdOrCtrl+N", click: send("new") },
          { label: "Abrir…", accelerator: "CmdOrCtrl+O", click: send("open") },
          { label: "Guardar", accelerator: "CmdOrCtrl+S", click: send("save") },
          { type: "separator" },
          { label: "Ejemplos", submenu: examplesSubmenu() },
          { type: "separator" },
          { label: "Nuevo archivo en el sketch…", accelerator: "CmdOrCtrl+Shift+N", click: send("newFile") },
          { label: "Agregar archivos al sketch…", click: send("importFiles") },
          { type: "separator" },
          { label: "Abrir proyecto…", accelerator: "CmdOrCtrl+Shift+O", click: send("openProject") },
          { label: "Guardar proyecto", accelerator: "CmdOrCtrl+Shift+S", click: send("saveProject") },
          { type: "separator" },
          { label: "Abrir en OpenPLC Editor", click: send("openInEditor") },
          { label: "Abrir carpeta de trabajo", click: () => shell.openPath(workspaceDir()) },
          { type: "separator" },
          { role: "quit", label: "Salir" },
        ],
      },
      {
        label: "Edición",
        submenu: [
          { label: "Deshacer", accelerator: "CmdOrCtrl+Z", click: send("undo") },
          { label: "Rehacer", accelerator: "CmdOrCtrl+Y", click: send("redo") },
          { type: "separator" },
          { role: "cut", label: "Cortar" },
          { role: "copy", label: "Copiar" },
          { role: "paste", label: "Pegar" },
          { label: "Duplicar", accelerator: "CmdOrCtrl+D", click: send("duplicate") },
          { label: "Eliminar", accelerator: "Delete", click: send("delete") },
          { type: "separator" },
          { role: "selectAll", label: "Seleccionar todo" },
        ],
      },
      {
        label: "Herramientas",
        submenu: [
          { label: "Autoformato", accelerator: "CmdOrCtrl+T", click: send("format") },
          { type: "separator" },
          { label: "Dispositivos propios…", click: send("devices") },
          { label: "Nuevo dispositivo…", click: send("newDevice") },
          { label: "Editor de componentes…", click: send("componentEditor") },
        ],
      },
      {
        label: "Simulación",
        submenu: [
          { label: "Compilar y ejecutar", accelerator: "F5", click: send("run") },
          { label: "Pausar / continuar", accelerator: "F6", click: send("pause") },
          { label: "Detener", accelerator: "Shift+F5", click: send("stop") },
          { type: "separator" },
          { label: "Reproducir grabación…", click: send("replay") },
        ],
      },
      {
        label: "Depuración",
        submenu: [
          { label: "Alternar breakpoint", accelerator: "F9", click: send("dbgToggle") },
          { type: "separator" },
          { label: "Continuar", accelerator: "F8", click: send("dbgContinue") },
          { label: "Paso por encima", accelerator: "F10", click: send("dbgNext") },
          { label: "Paso a paso (entrar)", accelerator: "F11", click: send("dbgStepIn") },
          { label: "Salir de la función", accelerator: "Shift+F11", click: send("dbgStepOut") },
          { label: "Interrumpir", accelerator: "CmdOrCtrl+F8", click: send("dbgPause") },
          { type: "separator" },
          { label: "Soltar el depurador", click: send("dbgDetach") },
        ],
      },
      {
        label: "Ver",
        submenu: [
          { label: "Programa", accelerator: "CmdOrCtrl+1", click: send("tab:program") },
          { label: "Esquema eléctrico", accelerator: "CmdOrCtrl+2", click: send("tab:schematic") },
          { label: "Planta 3D", accelerator: "CmdOrCtrl+3", click: send("tab:plant") },
          { label: "Placa", accelerator: "CmdOrCtrl+4", click: send("tab:board") },
          { type: "separator" },
          { label: "Panel inferior", accelerator: "CmdOrCtrl+J", click: send("dock") },
          {
            label: "Tema",
            submenu: [
              { label: "Seguir al sistema", type: "radio", checked: nativeTheme.themeSource === "system", click: () => applyThemePref("system") },
              { label: "Claro", type: "radio", checked: nativeTheme.themeSource === "light", click: () => applyThemePref("light") },
              { label: "Oscuro", type: "radio", checked: nativeTheme.themeSource === "dark", click: () => applyThemePref("dark") },
            ],
          },
          { type: "separator" },
          { label: "JWPLC real (pantalla en vivo)…", accelerator: "CmdOrCtrl+Shift+R", click: openRealDevice },
          { type: "separator" },
          { role: "reload", label: "Recargar" },
          { role: "toggleDevTools", label: "Herramientas de desarrollo" },
          { type: "separator" },
          { role: "resetZoom", label: "Tamaño original" },
          { role: "zoomIn", label: "Acercar" },
          { role: "zoomOut", label: "Alejar" },
        ],
      },
    ]),
  );
}

// Vista 3D (three.js): sin GPU (máquina virtual, escritorio remoto) WebGL
// cae a SwiftShader por software en lugar de no estar disponible.
app.commandLine.appendSwitch("enable-unsafe-swiftshader");

// Raster del esquema en varios hilos de la CPU en lugar del único hilo de la
// GPU. Medido en una RTX 5060 con pantalla 4K al 200 %: con raster por GPU
// cada paso de zoom tardaba ~22 ms en ese hilo (picos de 39 ms) y se perdían
// cuadros; por CPU el mismo trabajo se reparte y solo un cuadro pasó de 33 ms.
// La composición y WebGL (vista 3D) siguen en la GPU. JWSIM_GPU_RASTER=1 lo
// vuelve a activar para comparar.
if (process.env.JWSIM_GPU_RASTER !== "1") app.commandLine.appendSwitch("disable-gpu-rasterization");

// G6 SIMULATE_BUTTON: el OpenPLC Editor lanza la app con --jwsim-open. Si ya hay
// una abierta, el proyecto se abre en ella y este proceso termina; abrir varias
// a mano (sin la opción) sigue funcionando.
let pendingOpen = openArg(process.argv);
// Sim y editor van juntos (abierto con Simular o el Sim abrió el editor): al
// cerrar el Sim se pide cerrar también el editor.
let editorLinked = !!pendingOpen;
let rendererReady = false;
const primary = app.requestSingleInstanceLock();
if (!primary && pendingOpen) app.quit();
app.on("second-instance", (_e, argv) => {
  const target = openArg(argv);
  if (!target) return;
  editorLinked = true;
  if (win?.isMinimized()) win.restore();
  win?.focus();
  if (rendererReady) forward("app:openTarget", target);
  else pendingOpen = target;
});
ipcMain.handle("app:takeOpenTarget", () => {
  rendererReady = true;
  const target = pendingOpen;
  pendingOpen = null;
  return target;
});

app.whenReady().then(() => {
  if (!primary && pendingOpen) return;
  nativeTheme.themeSource = loadThemePref();
  nativeTheme.on("updated", () => {
    const bg = nativeTheme.shouldUseDarkColors ? "#16191d" : "#f5f7fa";
    win?.setBackgroundColor?.(bg);
    realWin?.setBackgroundColor?.(nativeTheme.shouldUseDarkColors ? "#14171b" : "#f5f7fa");
    forward("app:themeChanged", { theme: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors });
  });
  buildMenu();
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    // 640: cabe a media pantalla aun en monitores de 1366 px o con escala de Windows alta.
    minWidth: 640,
    minHeight: 600,
    title: "JWPLC Sim",
    // Sin la barra de menús a la vista: los atajos siguen funcionando y Alt la muestra.
    autoHideMenuBar: true,
    // Ícono de la ventana y de la barra de tareas (en Windows empaquetado lo da el .exe).
    icon: join(import.meta.dirname, "icon", process.platform === "win32" ? "icon.ico" : "icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#16191d" : "#f5f7fa",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(join(import.meta.dirname, "renderer", "index.html"));
});

app.on("window-all-closed", async () => {
  watcher?.close();
  builder?.terminate();
  await stopRunner();
  await comBridge?.close();
  app.quit();
});

// Cerrar la ventana, Archivo ▸ Salir o app.quit(): todos pasan por will-quit.
// El pedido sale en un proceso aparte que sigue aunque el Sim termine.
app.on("will-quit", () => {
  if (!editorLinked || process.env.JWSIM_CLOSE_EDITOR === "0") return;
  editorLinked = false;
  const ed = findEditor();
  if (ed) closeEditor(ed).catch(() => {});
});
