// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Proceso principal de JWPLC Sim (Electron): ventana, sketches del usuario,
// compilación con jwsim-cli y ciclo de vida del runner (un PLC simulado).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import { Worker } from "node:worker_threads";

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

import { installedDevices, registryWithInstalled } from "../cli/lib/device.mjs";
import { loadProject, saveProject } from "../cli/lib/project.mjs";
import { toolchain } from "../cli/lib/toolchain.mjs";
import { readLock, resolvePackageRoot } from "../scripts/fetch-package.mjs";
import { DebugSession } from "./lib/debug-session.mjs";
import { NetBridge } from "./lib/net-bridge.mjs";
import { SceneSession, wireSnapshot } from "./lib/scene-session.mjs";
import { RunnerProcess } from "./lib/sim-port.mjs";
import { Registry, builtinDevices } from "../scene/devices/index.mjs";
import { Scene } from "../scene/scene.mjs";

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

const SKETCH_EXT = new Set([".ino", ".h", ".hpp", ".c", ".cpp"]);
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
let registryPromise = null; // biblioteca incluida + dispositivos de escena instalados
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
  sceneSession?.stop();
  sceneSession = null;
  bridge?.close();
  bridge = null;
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

// ---------------------------------------------------------------- ejercicios (G9)
const EXERCISES = join(import.meta.dirname, "..", "exercises");

ipcMain.handle("exercises:list", () => {
  if (!existsSync(EXERCISES)) return [];
  const out = [];
  for (const d of readdirSync(EXERCISES).sort()) {
    const f = join(EXERCISES, d, `${d}.jwsim`);
    if (!existsSync(f)) continue;
    try {
      const { project } = loadProject(f);
      if (project.exercise) out.push({ id: d, title: project.name, level: project.exercise.level ?? 1 });
    } catch {
      // un ejercicio roto no impide listar los demás
    }
  }
  return out;
});

// Abre una copia del ejercicio en la carpeta de trabajo (sin la solución):
// el alumno trabaja sobre su copia y la vuelve a abrir más tarde.
ipcMain.handle("exercises:open", (_e, id) => {
  if (!/^[\w.-]+$/.test(id)) throw new Error(`ejercicio inválido: ${id}`);
  const src = join(EXERCISES, id);
  const dst = join(workspaceDir(), "Ejercicios", id);
  if (!existsSync(dst)) cpSync(src, dst, { recursive: true, filter: (p) => !p.slice(src.length).split(/[\\/]/).includes("solucion") });
  return openProject(join(dst, `${id}.jwsim`));
});

// Enunciado de un proyecto de ejercicio (o null si no lo es).
ipcMain.handle("exercise:info", (_e, file) => {
  try {
    const { project } = loadProject(file);
    const ex = project.exercise;
    if (!ex) return null;
    const st = ex.statement ? resolve(dirname(file), ex.statement) : null;
    return { title: project.name, level: ex.level ?? 1, statement: st && existsSync(st) ? readFileSync(st, "utf8") : "" };
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
  r.on("message", (m) => m.type !== "horizon" && m.type !== "uart_tx" && forward("sim:message", m));
  if (sceneObj) {
    sceneSession = new SceneSession(r, sceneObj);
    sceneSession.on("snapshot", (snap) => forward("scene:snapshot", snap));
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
  const rtcArg = rtc ?? localRtcNow();
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

// ---------------------------------------------------------------- escena (G7)
function registry() {
  // Un dispositivo instalado roto no deja a la app sin la biblioteca incluida.
  registryPromise ??= registryWithInstalled().catch((err) => {
    forward("sim:stderr", `[jwsim] dispositivos instalados: ${err.message}\n`);
    return new Registry();
  });
  return registryPromise;
}

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

ipcMain.handle("scene:rearm", () => {
  sceneSession?.rearm();
  return !!sceneSession;
});

ipcMain.handle("sim:command", (_e, msg) => {
  if (msg?.type === "run" && msg.speed !== undefined) sceneSession?.setSpeed(msg.speed);
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
    // Ícono de la ventana y de la barra de tareas (en Windows empaquetado lo da el .exe).
    icon: join(import.meta.dirname, "icon", process.platform === "win32" ? "icon.ico" : "icon.png"),
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
  builder?.terminate();
  await stopRunner();
  app.quit();
});
