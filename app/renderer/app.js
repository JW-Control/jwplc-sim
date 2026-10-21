// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Interfaz de JWPLC Sim (MVP de G2): editor, compilación, placa y consola.
"use strict";

const $ = (id) => document.getElementById(id);
const api = window.jwsim;

const state = {
  sketch: null, // { dir, name, files: [{ name, path, content }] }
  models: new Map(), // nombre -> modelo de Monaco
  saved: new Map(), // nombre -> contenido guardado
  active: null,
  exe: null,
  sim: "idle", // idle | building | running | paused | error
  speed: 1,
  inputMode: "toggle",
  levels: new Map(),
  packageRef: "",
};

let editor = null;
let monacoRef = null;

// ------------------------------------------------------------- utilidades
function fmtTime(ns) {
  const ms = Math.floor(ns / 1e6);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (v, n = 2) => String(v).padStart(n, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(r, 3)}`;
}

function normPath(p) {
  return p.replaceAll("\\", "/").toLowerCase();
}

function setStatus(kind, text) {
  state.sim = kind;
  const el = $("status");
  el.className = `status ${kind}`;
  el.textContent = text;
  const live = kind === "running" || kind === "paused";
  $("btn-pause").disabled = !live;
  $("btn-stop").disabled = !live;
  $("btn-run").disabled = kind === "building";
  $("btn-pause").textContent = kind === "paused" ? "▶ Continuar" : "❚❚ Pausa";
  $("led-pwr").classList.toggle("on", live);
  $("led-run").classList.toggle("on", kind === "running");
  $("led-err").classList.toggle("on", kind === "error");
  for (const b of document.querySelectorAll("#inputs .io")) b.disabled = !live;
}

function consoleWrite(text, cls) {
  const pre = $("console");
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  if (cls) {
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    pre.appendChild(span);
  } else {
    pre.appendChild(document.createTextNode(text));
  }
  // Límite para sketches que imprimen sin parar.
  while (pre.childNodes.length > 4000) pre.removeChild(pre.firstChild);
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

// ------------------------------------------------------------- placa
function buildBoard() {
  const inputs = $("inputs");
  const outputs = $("outputs");
  for (let k = 0; k < 8; k++) {
    const b = document.createElement("button");
    b.className = "io input";
    b.dataset.signal = `I0_${k}`;
    b.disabled = true;
    b.title = `Entrada I0.${k}`;
    b.innerHTML = `<span class="screw"></span><span class="name">I0.${k}</span><span class="led"></span>`;
    b.addEventListener("click", () => {
      if (state.inputMode === "toggle") setInput(b.dataset.signal, !state.levels.get(b.dataset.signal));
    });
    b.addEventListener("pointerdown", () => state.inputMode === "push" && setInput(b.dataset.signal, true));
    const release = () => state.inputMode === "push" && state.levels.get(b.dataset.signal) && setInput(b.dataset.signal, false);
    b.addEventListener("pointerup", release);
    b.addEventListener("pointerleave", release);
    inputs.appendChild(b);

    const o = document.createElement("div");
    o.className = "io output";
    o.dataset.signal = `Q0_${k}`;
    o.title = `Salida relé Q0.${k}`;
    o.innerHTML = `<span class="lamp"></span><span class="name">Q0.${k}</span><span class="screw"></span>`;
    outputs.appendChild(o);
  }
}

function setInput(signal, value) {
  state.levels.set(signal, value);
  renderSignal(signal, value);
  api.command({ type: "set", signal, value: value ? 1 : 0 });
}

function renderSignal(name, level) {
  const el = document.querySelector(`.io[data-signal="${name}"]`);
  if (el) el.classList.toggle("on", !!level);
}

function resetBoard() {
  state.levels.clear();
  for (const el of document.querySelectorAll(".io")) el.classList.remove("on");
}

// ------------------------------------------------------------- editor
function languageFor(name) {
  return /\.(ino|c|cpp|h|hpp)$/i.test(name) ? "cpp" : "plaintext";
}

function loadSketch(sketch) {
  if (!sketch) return;
  stopSim();
  for (const m of state.models.values()) m.dispose();
  state.models.clear();
  state.saved.clear();
  state.sketch = sketch;
  for (const f of sketch.files) {
    const uri = monacoRef.Uri.file(f.path);
    const model = monacoRef.editor.createModel(f.content, languageFor(f.name), uri);
    model.onDidChangeContent(() => renderTabs());
    state.models.set(f.name, model);
    state.saved.set(f.name, f.content);
  }
  state.exe = null;
  showFile(sketch.files[0].name);
  clearProblems();
  $("build-log").textContent = "";
  $("sb-sketch").textContent = sketch.dir;
  document.title = `${sketch.name} — JWPLC Sim`;
}

function showFile(name) {
  state.active = name;
  editor.setModel(state.models.get(name));
  renderTabs();
}

function renderTabs() {
  const tabs = $("tabs");
  tabs.textContent = "";
  for (const [name, model] of state.models) {
    const t = document.createElement("div");
    t.className = "tab";
    if (name === state.active) t.classList.add("active");
    if (model.getValue() !== state.saved.get(name)) t.classList.add("dirty");
    t.textContent = name;
    t.addEventListener("click", () => showFile(name));
    tabs.appendChild(t);
  }
}

async function saveSketch() {
  if (!state.sketch) return;
  const files = [...state.models].map(([name, m]) => ({ name, content: m.getValue() }));
  await api.save({ dir: state.sketch.dir, files });
  for (const f of files) state.saved.set(f.name, f.content);
  renderTabs();
}

// ------------------------------------------------------------- diagnósticos
function clearProblems() {
  $("problems").textContent = "";
  $("problems-count").textContent = "";
  for (const m of state.models.values()) monacoRef.editor.setModelMarkers(m, "gcc", []);
}

function showProblems(diags) {
  clearProblems();
  const byFile = new Map();
  const relevant = diags.filter((d) => d.severity !== "note");
  for (const d of relevant) {
    const fileName = [...state.models.keys()].find((n) => normPath(state.models.get(n).uri.fsPath) === normPath(d.file));
    const li = document.createElement("li");
    li.className = d.severity;
    li.textContent = `${fileName ?? d.file}:${d.line}:${d.column}  ${d.message}`;
    if (fileName) {
      li.addEventListener("click", () => {
        showFile(fileName);
        editor.revealLineInCenter(d.line);
        editor.setPosition({ lineNumber: d.line, column: d.column });
        editor.focus();
      });
      if (!byFile.has(fileName)) byFile.set(fileName, []);
      byFile.get(fileName).push({
        severity: d.severity === "error" ? monacoRef.MarkerSeverity.Error : monacoRef.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: d.column + 1,
      });
    }
    $("problems").appendChild(li);
  }
  for (const [name, markers] of byFile) monacoRef.editor.setModelMarkers(state.models.get(name), "gcc", markers);
  const errors = relevant.filter((d) => d.severity === "error").length;
  $("problems-count").textContent = errors ? `${errors} error${errors > 1 ? "es" : ""}` : "";
  const first = relevant.find((d) => d.severity === "error");
  if (first) $("problems").firstChild?.click();
}

// ------------------------------------------------------------- simulación
async function buildAndRun() {
  if (!state.sketch || state.sim === "building") return;
  await saveSketch();
  await api.stop();
  resetBoard();
  setStatus("building", "Compilando…");
  $("output-panel").classList.remove("collapsed");
  $("btn-output-toggle").textContent = "Ocultar";
  $("build-log").textContent = "";
  clearProblems();
  const r = await api.build(state.sketch.dir);
  $("sb-build").textContent = r.ok ? `Compilado en ${(r.ms / 1000).toFixed(1)} s` : "Compilación con errores";
  if (!r.ok) {
    setStatus("error", "Error de compilación");
    $("build-log").textContent += `\n${r.message}\n${r.output}`;
    showProblems(r.diagnostics);
    return;
  }
  state.exe = r.exe;
  $("build-log").textContent += `\nOK · ${r.libraries.length} librerías del package\n`;
  $("console").textContent = "";
  await api.start(r.exe);
  api.command({ type: "run", speed: state.speed });
  setStatus("running", "Ejecutando");
}

function togglePause() {
  if (state.sim === "running") {
    api.command({ type: "pause" });
    setStatus("paused", "En pausa");
  } else if (state.sim === "paused") {
    api.command({ type: "run", speed: state.speed });
    setStatus("running", "Ejecutando");
  }
}

function stopSim() {
  api.stop();
  if (state.sim === "running" || state.sim === "paused") setStatus("idle", "Detenido");
}

function setSpeed(speed) {
  state.speed = speed;
  for (const b of document.querySelectorAll(".speed .seg")) {
    const on = Number(b.dataset.speed) === speed;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
  if (state.sim === "running") api.command({ type: "run", speed });
}

function onMessage(m) {
  switch (m.type) {
    case "hello":
      $("board-name").textContent = `${m.board} · package ${state.packageRef}`;
      for (const [name, level] of m.signals ?? []) {
        state.levels.set(name, !!level);
        renderSignal(name, level);
      }
      break;
    case "signals":
      for (const [name, level] of m.changes) {
        state.levels.set(name, !!level);
        renderSignal(name, level);
      }
      $("clock").textContent = fmtTime(m.t_ns);
      break;
    case "status":
      $("clock").textContent = fmtTime(m.t_ns);
      break;
    case "serial":
      consoleWrite(m.text.replaceAll("\r", ""));
      break;
    case "fatal":
      consoleWrite(`\n${m.message}\n`, "fatal");
      setStatus("error", "Error del firmware");
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------- arranque
async function populateExamples() {
  const sel = $("sel-example");
  const list = await api.listExamples();
  const groups = new Map();
  for (const ex of list) {
    if (!groups.has(ex.group)) groups.set(ex.group, []);
    groups.get(ex.group).push(ex);
  }
  for (const [group, items] of groups) {
    const og = document.createElement("optgroup");
    og.label = group;
    for (const ex of items) {
      const o = document.createElement("option");
      o.value = ex.dir;
      o.textContent = ex.name;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  return list;
}

function wireUi() {
  $("btn-new").addEventListener("click", async () => loadSketch(await api.newSketch()));
  $("btn-open").addEventListener("click", async () => loadSketch(await api.openDialog()));
  $("btn-save").addEventListener("click", saveSketch);
  $("sel-example").addEventListener("change", async (e) => {
    const dir = e.target.value;
    e.target.value = "";
    if (dir) loadSketch(await api.openExample(dir));
  });
  $("btn-run").addEventListener("click", buildAndRun);
  $("btn-pause").addEventListener("click", togglePause);
  $("btn-stop").addEventListener("click", stopSim);
  for (const b of document.querySelectorAll(".speed .seg")) b.addEventListener("click", () => setSpeed(Number(b.dataset.speed)));
  for (const b of document.querySelectorAll(".mode .seg")) {
    b.addEventListener("click", () => {
      state.inputMode = b.dataset.mode;
      for (const o of document.querySelectorAll(".mode .seg")) {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-checked", String(o === b));
      }
    });
  }
  $("btn-console-clear").addEventListener("click", () => ($("console").textContent = ""));
  $("btn-output-toggle").addEventListener("click", () => {
    const p = $("output-panel");
    p.classList.toggle("collapsed");
    $("btn-output-toggle").textContent = p.classList.contains("collapsed") ? "Mostrar" : "Ocultar";
    editor.layout();
  });

  api.onBuildLog((line) => {
    const log = $("build-log");
    log.textContent += `${line}\n`;
    log.scrollTop = log.scrollHeight;
  });
  api.onMessage(onMessage);
  api.onStderr((t) => consoleWrite(t, /FATAL|no está soportad/.test(t) ? "fatal" : "sys"));
  api.onExit(({ code }) => {
    if (state.sim === "running" || state.sim === "paused") {
      if (code === 0 || code === null) setStatus("idle", "Detenido");
      else {
        consoleWrite(`\n[jwsim] el firmware terminó (código ${code})\n`, "fatal");
        setStatus("error", "Error del firmware");
      }
    }
  });
  api.onMenu((cmd) => {
    if (cmd === "new") $("btn-new").click();
    else if (cmd === "open") $("btn-open").click();
    else if (cmd === "save") saveSketch();
    else if (cmd === "run") buildAndRun();
    else if (cmd === "pause") togglePause();
    else if (cmd === "stop") stopSim();
  });
}

function initMonaco() {
  return new Promise((resolveInit) => {
    const base = new URL("../node_modules/monaco-editor/min/", location.href).href;
    window.require.config({ paths: { vs: `${base}vs` } });
    window.require(["vs/editor/editor.main"], () => {
      monacoRef = window.monaco;
      monacoRef.editor.defineTheme("jwsim-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: { "editor.background": "#14171b", "editorGutter.background": "#14171b" },
      });
      editor = monacoRef.editor.create($("editor"), {
        theme: "jwsim-dark",
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
      });
      resolveInit();
    });
  });
}

async function main() {
  buildBoard();
  wireUi();
  setStatus("idle", "Detenido");
  const info = await api.info();
  state.packageRef = info.packageRef;
  $("board-name").textContent = `JWPLC Basic · package ${info.packageRef}`;
  $("sb-package").textContent = `platform-jwplc ${info.packageRef} (${info.packageCommit})`;
  await initMonaco();
  const examples = await populateExamples();
  // Primer arranque: el ejemplo de E/S básico del package.
  const first = examples.find((e) => e.name === "02_io_basic") ?? examples[0];
  if (first) loadSketch(await api.openExample(first.dir));
}

main();
