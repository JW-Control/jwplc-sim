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
  view: "console", // console | buses
  project: null, // { file, project, links, missing }
  pendingInputs: null, // niveles iniciales de entradas del proyecto
};

// ------------------------------------------------------------- buses
const TCA_REGS = ["Entrada", "Entrada", "Entrada", null, "Salida", "Salida", "Salida", null, "Polaridad", "Polaridad", "Polaridad", null, "Config.", "Config.", "Config."];
const I2C_DEVICES = { 0x22: "TCA6424A (E/S)" };
const MAX_BUS_ROWS = 1000;

function hexAddr(a) {
  return `0x${a.toString(16).padStart(2, "0")}`;
}

// [t_ns, bus, addr, w_hex, r_hex, result] → fila decodificada.
function decodeBus([t, bus, addr, w, r, res]) {
  if (addr < 0) return { t, bus, dev: "—", op: "TX", data: w, nack: false };
  const dev = I2C_DEVICES[addr] ? `${I2C_DEVICES[addr]} @${hexAddr(addr)}` : hexAddr(addr);
  if (res === 1) return { t, bus, dev, op: "NACK de dirección", data: w, nack: true };
  const wb = w ? w.split(" ") : [];
  let op = r ? "Escritura + lectura" : "Escritura";
  if (addr === 0x22 && wb.length) {
    const cmd = parseInt(wb[0], 16);
    const reg = TCA_REGS[cmd & 0x7f];
    const name = reg ? `${reg} ${(cmd & 0x7f) % 4}` : `reg ${hexAddr(cmd & 0x7f)}`;
    const ai = cmd & 0x80 ? " (AI)" : "";
    op = r ? `Leer ${name}${ai}` : `Escribir ${name}${ai}`;
    return { t, bus, dev, op, data: r ? `→ ${r}` : `← ${wb.slice(1).join(" ")}`, nack: res === 2 };
  }
  return { t, bus, dev, op, data: r ? `${w} → ${r}` : w, nack: res === 2 };
}

function appendBus(items, dropped) {
  const body = $("bus-rows");
  const box = $("buses");
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const d = decodeBus(it);
    const tr = document.createElement("tr");
    if (d.nack) tr.className = "nack";
    for (const [v, cls] of [[(d.t / 1e6).toFixed(3)], [d.bus], [d.dev], [d.op], [d.data, "data"]]) {
      const td = document.createElement("td");
      td.textContent = v;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  if (dropped) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="data"></td>`;
    tr.firstChild.textContent = `… ${dropped} transacciones omitidas en este intervalo`;
    frag.appendChild(tr);
  }
  body.appendChild(frag);
  while (body.childNodes.length > MAX_BUS_ROWS) body.removeChild(body.firstChild);
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function setView(view) {
  state.view = view;
  for (const b of document.querySelectorAll(".ptab")) {
    const on = b.dataset.view === view;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  }
  for (const v of document.querySelectorAll(".view")) v.hidden = v.dataset.view !== view;
  $("view-note").textContent = view === "console" ? "UART0 · 115200" : "I2C0 y UART en vivo";
  api.command({ type: "subscribe", buses: view === "buses" ? 1 : 0 });
}

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
  if (state.sim === "error") setStatus("idle", "Detenido");
  $("sb-build").textContent = "";
  state.project = null;
  state.pendingInputs = null;
  showProjectStatus();
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
  api.watch(sketch.dir);
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
// Niveles de entradas a conservar al recompilar ("la escena").
function currentInputs() {
  const out = {};
  for (let k = 0; k < 8; k++) if (state.levels.get(`I0_${k}`)) out[`I0_${k}`] = 1;
  return out;
}

async function buildAndRun({ keepScene = false } = {}) {
  if (!state.sketch || state.sim === "building") return false;
  const scene = keepScene ? currentInputs() : (state.pendingInputs ?? {});
  state.pendingInputs = null;
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
    return false;
  }
  state.exe = r.exe;
  $("build-log").textContent += `\nOK · ${r.libraries.length} librerías del package\n`;
  $("console").textContent = "";
  $("bus-rows").textContent = "";
  await api.start(r.exe);
  if (state.view === "buses") api.command({ type: "subscribe", buses: 1 });
  // La escena se aplica en t = 0, antes de que corra el firmware.
  for (const [signal, v] of Object.entries(scene)) {
    if (!v) continue;
    state.levels.set(signal, true);
    renderSignal(signal, true);
    api.command({ type: "set", signal, value: 1 });
  }
  api.command({ type: "run", speed: state.speed });
  setStatus("running", "Ejecutando");
  return true;
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

function setInputMode(mode) {
  state.inputMode = mode;
  for (const o of document.querySelectorAll(".mode .seg")) {
    o.classList.toggle("active", o.dataset.mode === mode);
    o.setAttribute("aria-checked", String(o.dataset.mode === mode));
  }
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
        // Las entradas que la interfaz ya fijó (escena reaplicada al
        // reiniciar) mandan sobre el estado inicial que informa el runner.
        if (name.startsWith("I0_") && state.levels.has(name)) continue;
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
    case "bus":
      appendBus(m.items, m.dropped);
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

// ------------------------------------------------------------- proyectos
function speedFromFactor(f) {
  if (f === 0) return 0;
  return f >= 5 ? 10 : 1;
}

function showProjectStatus() {
  const p = state.project;
  if (!p) {
    $("sb-project").textContent = "";
    return;
  }
  const name = (path) => path.split(/[\\/]/).pop();
  const parts = [`Proyecto: ${p.project.name ?? name(p.file)}`];
  for (const [k, label] of [["openplc", "OpenPLC"], ["hmi", "HMI"]]) {
    if (!p.links[k]) continue;
    const missing = p.missing.some((m) => m.link === k);
    parts.push(`${label}: ${name(p.links[k])}${missing ? " (no encontrado)" : ""}`);
  }
  $("sb-project").textContent = parts.join(" · ");
}

function applyProject(res) {
  if (!res) return;
  loadSketch(res.sketch);
  state.project = res;
  const sim = res.project.simulation ?? {};
  if (typeof sim.realtimeFactor === "number") setSpeed(speedFromFactor(sim.realtimeFactor));
  const scene = res.project.scene ?? {};
  if (scene.inputMode) setInputMode(scene.inputMode);
  state.pendingInputs = scene.inputs ?? null;
  for (const [signal, v] of Object.entries(state.pendingInputs ?? {})) renderSignal(signal, !!v);
  showProjectStatus();
  if (res.migratedFrom !== null) {
    consoleWrite(`[jwsim] proyecto migrado de la versión ${res.migratedFrom} a la 1; se guardará como v1\n`, "sys");
  }
}

async function openProject() {
  try {
    applyProject(await api.openProject());
  } catch (err) {
    consoleWrite(`[jwsim] ${err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}\n`, "fatal");
  }
}

async function saveProjectFile() {
  if (!state.sketch) return;
  await saveSketch();
  const res = await api.saveProject({
    file: state.project?.file ?? null,
    project: state.project?.project ?? null,
    sketchDir: state.sketch.dir,
    simulation: { realtimeFactor: state.speed },
    scene: { inputMode: state.inputMode, inputs: currentInputs() },
  });
  if (!res) return;
  state.project = { links: {}, missing: [], ...state.project, file: res.file, project: res.project };
  showProjectStatus();
  consoleWrite(`[jwsim] proyecto guardado: ${res.file}\n`, "sys");
}

// Edición externa (Arduino IDE u otro editor): se recarga el archivo y, si
// la simulación estaba activa, se recompila y reinicia conservando la escena.
async function onExternalChange({ name, content, at }) {
  const model = state.models.get(name);
  if (!model || model.getValue() === content) return;
  if (model.getValue() !== state.saved.get(name)) {
    consoleWrite(`[jwsim] ${name} cambió fuera del simulador, pero tiene cambios sin guardar aquí: se conservan los suyos\n`, "sys");
    return;
  }
  model.setValue(content);
  state.saved.set(name, content);
  renderTabs();
  const live = state.sim === "running" || state.sim === "paused";
  consoleWrite(`[jwsim] ${name} cambió fuera del simulador; ${live ? "recompilando" : "recargado"}\n`, "sys");
  if (!live) return;
  const ok = await buildAndRun({ keepScene: true });
  if (ok) {
    const ms = Date.now() - at;
    $("sb-build").textContent = `Recargado en ${(ms / 1000).toFixed(2)} s tras edición externa`;
    $("sb-build").dataset.reloadMs = String(ms);
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
  for (const b of document.querySelectorAll(".mode .seg")) b.addEventListener("click", () => setInputMode(b.dataset.mode));
  $("btn-project-open").addEventListener("click", openProject);
  $("btn-project-save").addEventListener("click", saveProjectFile);
  api.onFileChanged(onExternalChange);
  $("btn-view-clear").addEventListener("click", () => {
    if (state.view === "console") $("console").textContent = "";
    else $("bus-rows").textContent = "";
  });
  for (const b of document.querySelectorAll(".ptab")) b.addEventListener("click", () => setView(b.dataset.view));
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
    else if (cmd === "openProject") openProject();
    else if (cmd === "saveProject") saveProjectFile();
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

// Ganchos para las pruebas E2E (abrir un proyecto sin el diálogo del SO).
window.jwsimTest = {
  openProjectFile: async (file) => applyProject(await api.openProjectFile(file)),
  openSketchDir: async (dir) => loadSketch(await api.openExample(dir)),
  saveProject: () => saveProjectFile(),
};

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
