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
  start: (exe) => ipcRenderer.invoke("sim:start", { exe }),
  command: (msg) => ipcRenderer.invoke("sim:command", msg),
  stop: () => ipcRenderer.invoke("sim:stop"),
  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectFile: (file) => ipcRenderer.invoke("project:openFile", file),
  saveProject: (args) => ipcRenderer.invoke("project:save", args),
  watch: (dir) => ipcRenderer.invoke("watch:set", dir),
  onFileChanged: on("fs:changed"),
  onBuildLog: on("build:log"),
  onMessage: on("sim:message"),
  onStderr: on("sim:stderr"),
  onExit: on("sim:exit"),
  onMenu: on("menu"),
});
