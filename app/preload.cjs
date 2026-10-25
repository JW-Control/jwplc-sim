// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Puente mínimo entre la interfaz (sin acceso a Node) y el proceso principal.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("jwsim", {
  info: () => ipcRenderer.invoke("app:info"),
  listExamples: () => ipcRenderer.invoke("examples:list"),
  openExample: (dir) => ipcRenderer.invoke("sketch:openExample", dir),
  newSketch: () => ipcRenderer.invoke("sketch:new"),
  openDialog: () => ipcRenderer.invoke("sketch:openDialog"),
  save: (sketch) => ipcRenderer.invoke("sketch:save", sketch),
  build: (dir) => ipcRenderer.invoke("sketch:build", dir),
  start: (exe, stim, projectFile, rtc, scene) => ipcRenderer.invoke("sim:start", { exe, stim, projectFile, rtc, scene }),
  command: (msg) => ipcRenderer.invoke("sim:command", msg),
  stop: () => ipcRenderer.invoke("sim:stop"),
  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectFile: (file) => ipcRenderer.invoke("project:openFile", file),
  saveProject: (args) => ipcRenderer.invoke("project:save", args),
  watch: (dir) => ipcRenderer.invoke("watch:set", dir),
  dbgSetBreakpoints: (path, lines) => ipcRenderer.invoke("dbg:setBreakpoints", { path, lines }),
  dbgCommand: (cmd) => ipcRenderer.invoke("dbg:command", { cmd }),
  dbgStack: () => ipcRenderer.invoke("dbg:stack"),
  dbgScopes: (frameId) => ipcRenderer.invoke("dbg:scopes", frameId),
  dbgVariables: (ref) => ipcRenderer.invoke("dbg:variables", ref),
  dbgEvaluate: (expressions, frameId) => ipcRenderer.invoke("dbg:evaluate", { expressions, frameId }),
  dbgSample: (expressions) => ipcRenderer.invoke("dbg:sample", expressions),
  saveStim: (text, name) => ipcRenderer.invoke("stim:save", { text, name }),
  openStim: () => ipcRenderer.invoke("stim:open"),
  onDbgStopped: on("dbg:stopped"),
  onDbgContinued: on("dbg:continued"),
  onDbgAttached: on("dbg:attached"),
  onDbgDetached: on("dbg:detached"),
  onDbgOutput: on("dbg:output"),
  onFileChanged: on("fs:changed"),
  onBuildLog: on("build:log"),
  onMessage: on("sim:message"),
  onDisplay: on("sim:display"),
  onStderr: on("sim:stderr"),
  onExit: on("sim:exit"),
  onMenu: on("menu"),
  // Escena (G7)
  sceneDevices: () => ipcRenderer.invoke("scene:devices"),
  sceneBoardSvg: () => ipcRenderer.invoke("scene:boardSvg"),
  sceneSymbols: () => ipcRenderer.invoke("scene:symbols"),
  sceneAnalyze: (spec) => ipcRenderer.invoke("scene:analyze", spec),
  sceneAct: (device, action, value) => ipcRenderer.invoke("scene:act", { device, action, value }),
  sceneRearm: () => ipcRenderer.invoke("scene:rearm"),
  sceneInject: (fault) => ipcRenderer.invoke("scene:inject", fault),
  sceneClearFault: (key) => ipcRenderer.invoke("scene:clearFault", key),
  onSceneSnapshot: on("scene:snapshot"),
});
