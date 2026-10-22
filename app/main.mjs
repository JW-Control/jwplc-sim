// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Proceso principal de JWPLC Sim (Electron): ventana, sketches del usuario,
// compilación con jwsim-cli y ciclo de vida del runner (un PLC simulado).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

import { buildSketch } from "../cli/lib/build.mjs";
import { loadProject, saveProject } from "../cli/lib/project.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { readLock, resolvePackageRoot } from "../scripts/fetch-package.mjs";
import { DebugSession } from "./lib/debug-session.mjs";
import { RunnerProcess } from "./lib/sim-port.mjs";

const SKETCH_EXT = new Set([".ino", ".h", ".hpp", ".c", ".cpp"]);
const TEMPLATE = `// Sketch nuevo para JWPLC Basic.
// Las entradas I0_0..I0_7 y salidas Q0_0..Q0_7 se manejan con la API del core.

void setup()
{
  Serial.begin(115200);
  Serial.println("Hola desde JWPLC Sim");
}

void loop()
{
  // Copia la entrada I0_0 en la salida Q0_0.
  digitalWrite(Q0_0, digitalRead(I0_0));
  delay(10);
}
`;

let win = null;
let runner = null;
let runnerExe = null;
let debug = null; // DebugSession adjunta al runner actual
let debugAttaching = null;
const breakpoints = new Map(); // ruta absoluta -> líneas
let watcher = null;
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

function readSketch(dir) {
  const name = basename(dir);
  const files = readdirSync(dir)
    .filter((f) => SKETCH_EXT.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile())
    .sort((a, b) => (a === `${name}.ino` ? -1 : b === `${name}.ino` ? 1 : a.localeCompare(b)))
    .map((f) => ({ name: f, path: join(dir, f), content: readFileSync(join(dir, f), "utf8") }));
  if (!files.some((f) => f.name === `${name}.ino`)) throw new Error(`la carpeta ${dir} no contiene ${name}.ino`);
  return { dir, name, files };
}

function listExamples() {
  const { root, lock } = resolvePackageRoot();
  const tree = join(root, lock.JWPLC_PACKAGE_TREE);
  const out = [];
  const bench = join(root, "tools", "build-speed-benchmark", "sketches");
  if (existsSync(bench)) {
    for (const n of readdirSync(bench).sort()) out.push({ group: "Benchmark del package", name: n, dir: join(bench, n) });
  }
  const libs = join(tree, "libraries");
  for (const lib of readdirSync(libs).sort()) {
    const ex = join(libs, lib, "examples");
    if (!existsSync(ex)) continue;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const p = join(d, e.name);
        if (existsSync(join(p, `${e.name}.ino`))) out.push({ group: lib, name: e.name, dir: p });
        else walk(p);
      }
    };
    walk(ex);
  }
  return out;
}

function forward(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Suelta gdb (el proceso sigue) y luego cierra el runner.
async function stopRunner() {
  const r = runner;
  runner = null;
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

ipcMain.handle("app:info", () => {
  const lock = readLock();
  return { packageRef: lock.JWPLC_PACKAGE_REF, packageCommit: lock.JWPLC_PACKAGE_COMMIT.slice(0, 12), version: app.getVersion() };
});

ipcMain.handle("examples:list", () => listExamples());

ipcMain.handle("sketch:openExample", (_e, srcDir) => {
  const dst = join(workspaceDir(), basename(srcDir));
  if (!existsSync(dst)) cpSync(srcDir, dst, { recursive: true });
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
    title: "Abrir sketch",
    defaultPath: workspaceDir(),
    properties: ["openFile"],
    filters: [{ name: "Sketch de Arduino", extensions: ["ino"] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readSketch(dirname(r.filePaths[0]));
});

ipcMain.handle("sketch:save", (_e, { dir, files }) => {
  for (const f of files) {
    const p = resolve(dir, f.name);
    if (dirname(p) !== resolve(dir)) throw new Error(`nombre de archivo inválido: ${f.name}`);
    ownWrites.set(p, f.content);
    writeFileSync(p, f.content);
  }
  return true;
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
    sketchPath: join(sketchDir, `${basename(sketchDir)}.ino`),
    simulation,
    scene,
  });
  return { file: target, project: saved };
});

// ---------------------------------------------------------------- recarga externa
// Vigila la carpeta del sketch: un cambio hecho fuera (Arduino IDE, otro
// editor) llega a la interfaz, que recarga el editor y la simulación.
ipcMain.handle("watch:set", (_e, dir) => {
  watcher?.close();
  watcher = null;
  if (!dir) return false;
  const pending = new Map();
  watcher = watch(dir, (_event, name) => {
    if (!name || !SKETCH_EXT.has(extname(name).toLowerCase())) return;
    const p = join(dir, name);
    clearTimeout(pending.get(p));
    // Los editores suelen escribir en varios pasos: se espera a que se asiente.
    pending.set(
      p,
      setTimeout(() => {
        if (!existsSync(p)) return;
        const content = readFileSync(p, "utf8");
        if (ownWrites.get(p) === content) return;
        ownWrites.set(p, content);
        forward("fs:changed", { name, path: p, content, at: Date.now() });
      }, 60),
    );
  });
  return true;
});

ipcMain.handle("sketch:build", async (_e, dir) => {
  await stopRunner();
  const outDir = join(app.getPath("userData"), "build", basename(dir));
  const t0 = Date.now();
  try {
    const { exe, libraries } = await buildSketch(dir, { outDir, log: (m) => forward("build:log", m) });
    return { ok: true, exe, libraries, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, message: err.message, diagnostics: err.diagnostics ?? [], output: err.output ?? "", ms: Date.now() - t0 };
  }
});

// stim: archivo .stim a reproducir desde t = 0 (grabación de una sesión).
ipcMain.handle("sim:start", async (_e, { exe, stim }) => {
  await stopRunner();
  const r = new RunnerProcess();
  runner = r;
  runnerExe = exe;
  r.on("message", (m) => forward("sim:message", m));
  r.on("stderr", (t) => forward("sim:stderr", t));
  r.on("exit", (info) => {
    if (runner === r) {
      runner = null;
      detachDebugger();
    }
    forward("sim:exit", info);
  });
  // JWSIM_DEBUG: el runner admite que gdb se le adjunte más tarde.
  r.start(exe, stim ? ["--stim", stim] : [], { env: { JWSIM_DEBUG: "1" } });
  // Con breakpoints ya puestos, gdb se adjunta antes de que corra el firmware.
  if (hasBreakpoints()) {
    try {
      await attachDebugger();
    } catch (err) {
      forward("sim:stderr", `[jwsim] ${err.message}\n`);
    }
  }
  return true;
});

ipcMain.handle("sim:command", (_e, msg) => {
  runner?.send(msg);
  return !!runner;
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
  return Promise.all(scopes.map(async (sc) => ({ ...sc, vars: await debug.variables(sc.ref) })));
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

function buildMenu() {
  const send = (cmd) => () => forward("menu", cmd);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Archivo",
        submenu: [
          { label: "Nuevo sketch", accelerator: "CmdOrCtrl+N", click: send("new") },
          { label: "Abrir…", accelerator: "CmdOrCtrl+O", click: send("open") },
          { label: "Guardar", accelerator: "CmdOrCtrl+S", click: send("save") },
          { type: "separator" },
          { label: "Abrir proyecto…", accelerator: "CmdOrCtrl+Shift+O", click: send("openProject") },
          { label: "Guardar proyecto", accelerator: "CmdOrCtrl+Shift+S", click: send("saveProject") },
          { type: "separator" },
          { label: "Abrir carpeta de trabajo", click: () => shell.openPath(workspaceDir()) },
          { type: "separator" },
          { role: "quit", label: "Salir" },
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

app.whenReady().then(() => {
  buildMenu();
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "JWPLC Sim",
    backgroundColor: "#16191d",
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
  await stopRunner();
  app.quit();
});
