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
  sim: "idle", // idle | building | running | paused | break | error
  speed: 1,
  inputMode: "toggle",
  levels: new Map(),
  packageRef: "",
  view: "console", // console | buses
  project: null, // { file, project, links, missing }
  pendingInputs: null, // niveles iniciales de entradas del proyecto
  // G3
  bpDecos: new Map(), // nombre de archivo -> ids de decoraciones de breakpoints
  bpVerified: new Map(), // nombre -> Set de líneas que gdb aceptó
  lineDecos: new Map(), // nombre -> ids de la decoración de línea actual
  dbgAttached: false,
  frameId: null,
  forced: new Map(), // señal -> 0 | 1
  record: [], // entradas aplicadas en la sesión: { t_ns, stim }
  watches: [], // expresiones de la tabla de observación
  replay: null, // { file, t_ns, hash } de la grabación que se reproduce
  hashWaiter: null,
};

// ------------------------------------------------------------- buses
// Decodificación en app/lib/bus-decode.cjs (la misma que usa el gate).
const MAX_BUS_ROWS = 1000;
let busDecoder = window.JwsimBus.createDecoder();

function busKind(row) {
  if (/^Modbus/.test(row.dev)) return "Modbus";
  if (/^I2C/.test(row.bus)) return "I2C";
  if (/SPI/.test(row.bus)) return "SPI";
  return "UART";
}

function resetBuses() {
  busDecoder = window.JwsimBus.createDecoder();
  $("bus-rows").textContent = "";
}

function applyBusFilter() {
  const f = $("bus-filter").value;
  for (const tr of $("bus-rows").children) tr.hidden = !!f && tr.dataset.kind !== f && !(f === "Modbus" && tr.dataset.modbus);
}

function appendBus(items, dropped) {
  const body = $("bus-rows");
  const box = $("buses");
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
  const filter = $("bus-filter").value;
  const frag = document.createDocumentFragment();
  for (const it of items) {
    for (const d of busDecoder.decode(it)) {
      const tr = document.createElement("tr");
      if (d.level !== "ok") tr.className = d.level === "err" ? "nack" : "warn";
      tr.dataset.kind = busKind(d);
      if (d.fields?.modbus) tr.dataset.modbus = "1";
      tr.hidden = !!filter && tr.dataset.kind !== filter && !(filter === "Modbus" && tr.dataset.modbus);
      for (const [v, cls] of [[(d.t / 1e6).toFixed(3)], [d.bus], [d.dev], [d.op, "op"], [d.data, "data"]]) {
        const td = document.createElement("td");
        td.textContent = v;
        if (cls) td.className = cls;
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
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
  $("view-note").textContent = { console: "UART0 · 115200", buses: "I2C, SPI por CS y UART en vivo", watch: "E/S y variables", debug: "gdb" }[view];
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
  const live = kind === "running" || kind === "paused" || kind === "break";
  $("btn-pause").disabled = !live || kind === "break";
  $("btn-stop").disabled = !live;
  $("btn-run").disabled = kind === "building";
  $("btn-pause").textContent = kind === "paused" ? "▶ Continuar" : "❚❚ Pausa";
  $("led-pwr").classList.toggle("on", live);
  $("led-run").classList.toggle("on", kind === "running");
  $("led-err").classList.toggle("on", kind === "error");
  for (const b of document.querySelectorAll("#inputs .io, #keypad .key")) b.disabled = !live;
  for (const id of ["btn-dbg-continue", "btn-dbg-next", "btn-dbg-in", "btn-dbg-out"]) $(id).disabled = kind !== "break";
  $("btn-dbg-pause").disabled = kind !== "running";
  $("btn-rec-save").disabled = !(kind === "running" || kind === "paused");
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

// ------------------------------------------------------------- pantalla y botonera
let tftCtx = null;
function drawDisplay(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const x = dv.getUint16(0, true), y = dv.getUint16(2, true), w = dv.getUint16(4, true), h = dv.getUint16(6, true);
  if (!w || !h) return;
  tftCtx ??= $("tft").getContext("2d");
  const img = tftCtx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = dv.getUint16(8 + i * 2, true);
    const r = (v >> 11) & 0x1f, g = (v >> 5) & 0x3f, bl = v & 0x1f;
    img.data[i * 4] = (r << 3) | (r >> 2);
    img.data[i * 4 + 1] = (g << 2) | (g >> 4);
    img.data[i * 4 + 2] = (bl << 3) | (bl >> 2);
    img.data[i * 4 + 3] = 255;
  }
  tftCtx.putImageData(img, x, y);
}

function clearDisplay() {
  tftCtx ??= $("tft").getContext("2d");
  tftCtx.fillStyle = "#000";
  tftCtx.fillRect(0, 0, 320, 170);
}

const KEYMAP = { ArrowLeft: "BTN_LEFT", ArrowUp: "BTN_UP", ArrowRight: "BTN_RIGHT", ArrowDown: "BTN_DOWN", Enter: "BTN_OK", Escape: "BTN_ESC" };
function pressKey(signal, down) {
  if (!["running", "paused", "break"].includes(state.sim)) return;
  if (!!state.levels.get(signal) === down) return;
  setInput(signal, down);
}

function wireKeypad() {
  for (const k of document.querySelectorAll("#keypad .key")) {
    const sig = k.dataset.btn;
    k.addEventListener("pointerdown", (e) => {
      k.setPointerCapture?.(e.pointerId);
      pressKey(sig, true);
    });
    const up = () => pressKey(sig, false);
    k.addEventListener("pointerup", up);
    k.addEventListener("pointercancel", up);
  }
  const tft = $("tft");
  tft.addEventListener("keydown", (e) => {
    const sig = KEYMAP[e.key];
    if (!sig) return;
    e.preventDefault();
    if (!e.repeat) pressKey(sig, true);
  });
  tft.addEventListener("keyup", (e) => {
    const sig = KEYMAP[e.key];
    if (sig) pressKey(sig, false);
  });
}

function setInput(signal, value) {
  state.levels.set(signal, value);
  renderSignal(signal, value);
  api.command({ type: "set", signal, value: value ? 1 : 0 });
}

function renderSignal(name, level) {
  const el = document.querySelector(`.io[data-signal="${name}"], .key[data-btn="${name}"]`);
  if (el) el.classList.toggle("on", !!level);
}

function resetBoard() {
  state.levels.clear();
  for (const el of document.querySelectorAll(".io, .key")) el.classList.remove("on");
  clearDisplay();
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
  state.bpDecos.clear();
  state.bpVerified.clear();
  state.lineDecos.clear();
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

async function buildAndRun({ keepScene = false, replay = null } = {}) {
  if (!state.sketch || state.sim === "building") return false;
  const scene = replay ? {} : keepScene ? currentInputs() : (state.pendingInputs ?? {});
  state.pendingInputs = null;
  await saveSketch();
  await api.stop();
  resetBoard();
  resetSession();
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
  resetBuses();
  // Breakpoints con las líneas actuales (las ediciones los desplazan).
  for (const name of state.models.keys()) await api.dbgSetBreakpoints(state.models.get(name).uri.fsPath, bpLines(name));
  state.replay = replay;
  if (replay) consoleWrite(`[jwsim] reproduciendo ${replay.file}${replay.t_ns ? ` hasta t=${fmtTime(replay.t_ns)}` : ""}\n`, "sys");
  const started = await api.start(r.exe, replay?.file, state.project?.file ?? null, replay?.rtc ?? null);
  state.sessionRtc = started?.rtc ?? null;
  if (state.view === "buses") api.command({ type: "subscribe", buses: 1 });
  // La escena se aplica en t = 0, antes de que corra el firmware.
  for (const [signal, v] of Object.entries(scene)) {
    if (!v) continue;
    state.levels.set(signal, true);
    renderSignal(signal, true);
    api.command({ type: "set", signal, value: 1 });
  }
  api.command({ type: "run", speed: state.speed, ...(replay?.t_ns ? { until_ns: replay.t_ns } : {}) });
  setStatus("running", replay ? "Reproduciendo" : "Ejecutando");
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
  clearDebugView();
  if (state.sim === "running" || state.sim === "paused" || state.sim === "break") setStatus("idle", "Detenido");
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

// ------------------------------------------------------------- depuración (G3)
// Líneas con breakpoint según las decoraciones (siguen las ediciones).
function bpLines(name) {
  const model = state.models.get(name);
  const ids = state.bpDecos.get(name) ?? [];
  const lines = ids.map((id) => model.getDecorationRange(id)?.startLineNumber).filter(Boolean);
  return [...new Set(lines)].sort((a, b) => a - b);
}

function renderBreakpoints(name, lines) {
  const model = state.models.get(name);
  const verified = state.dbgAttached ? state.bpVerified.get(name) : null;
  const decos = lines.map((line) => ({
    range: new monacoRef.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName: verified && !verified.has(line) ? "bp-glyph unverified" : "bp-glyph",
      glyphMarginHoverMessage: { value: verified && !verified.has(line) ? "Breakpoint sin código asociado" : "Breakpoint" },
      stickiness: monacoRef.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  }));
  state.bpDecos.set(name, model.deltaDecorations(state.bpDecos.get(name) ?? [], decos));
}

async function toggleBreakpoint(name, line) {
  if (!state.models.has(name)) return;
  const lines = bpLines(name);
  const i = lines.indexOf(line);
  if (i >= 0) lines.splice(i, 1);
  else lines.push(line);
  renderBreakpoints(name, lines);
  try {
    const verified = await api.dbgSetBreakpoints(state.models.get(name).uri.fsPath, lines);
    if (Array.isArray(verified)) {
      state.bpVerified.set(name, new Set(verified));
      renderBreakpoints(name, bpLines(name));
    }
  } catch (err) {
    consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal");
  }
}

function cleanError(err) {
  return String(err.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function fileNameOf(path) {
  if (!path) return null;
  return [...state.models.keys()].find((n) => normPath(state.models.get(n).uri.fsPath) === normPath(path)) ?? null;
}

function setCurrentLine(name, line) {
  for (const [n, ids] of state.lineDecos) state.models.get(n)?.deltaDecorations(ids, []);
  state.lineDecos.clear();
  if (!name) return;
  if (state.active !== name) showFile(name);
  const ids = state.models.get(name).deltaDecorations([], [
    { range: new monacoRef.Range(line, 1, line, 1), options: { isWholeLine: true, className: "dbg-line", linesDecorationsClassName: "dbg-arrow" } },
  ]);
  state.lineDecos.set(name, ids);
  editor.revealLineInCenterIfOutsideViewport(line);
}

function clearDebugView() {
  setCurrentLine(null);
  state.frameId = null;
  $("dbg-stack").textContent = "";
  $("dbg-vars").innerHTML = `<div class="empty">${state.dbgAttached ? "En ejecución: se muestran al detenerse." : "Ponga un breakpoint (F9 o clic en el margen) o interrumpa con Ctrl+F8."}</div>`;
}

async function onDbgStopped({ reason }) {
  const labels = { breakpoint: "En breakpoint", step: "Paso a paso", pause: "Interrumpido" };
  setStatus("break", labels[reason] ?? "Detenido (depurador)");
  let frames = [];
  try {
    frames = await api.dbgStack();
  } catch (err) {
    consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal");
  }
  const list = $("dbg-stack");
  list.textContent = "";
  // Los marcos sin símbolo (arranque de las fibras del planificador) no aportan.
  for (const f of frames.filter((x) => !/^\?+$/.test(x.name))) {
    const li = document.createElement("li");
    li.dataset.id = f.id;
    li.textContent = f.name;
    const loc = document.createElement("span");
    loc.className = "loc";
    loc.textContent = f.path ? `${f.path.split(/[\\/]/).pop()}:${f.line}` : "";
    li.appendChild(loc);
    li.addEventListener("click", () => selectFrame(f));
    list.appendChild(li);
  }
  // Primer marco con código del sketch (al interrumpir puede estar en el HAL).
  const mine = frames.find((f) => fileNameOf(f.path)) ?? frames[0];
  if (mine) await selectFrame(mine);
  if (state.view !== "watch") setView("debug");
}

async function selectFrame(f) {
  state.frameId = f.id;
  for (const li of $("dbg-stack").children) li.classList.toggle("active", Number(li.dataset.id) === f.id);
  const name = fileNameOf(f.path);
  setCurrentLine(name, f.line);
  const box = $("dbg-vars");
  box.textContent = "";
  try {
    const names = { Locals: "Locales", Arguments: "Argumentos", Globals: "Globales", Static: "Estáticas" };
    for (const sc of await api.dbgScopes(f.id)) {
      if (sc.lazy) {
        // Ámbito grande (p. ej. globales): plegado hasta que se abra.
        box.appendChild(varNode({ name: names[sc.name] ?? sc.name, value: "", type: "", ref: sc.ref }, 0, true));
        continue;
      }
      const head = document.createElement("div");
      head.className = "node scope";
      head.textContent = names[sc.name] ?? sc.name;
      box.appendChild(head);
      for (const v of sc.vars) box.appendChild(varNode(v, 1));
      if (!sc.vars.length) head.textContent += " (vacío)";
    }
  } catch (err) {
    box.innerHTML = `<div class="empty"></div>`;
    box.firstChild.textContent = cleanError(err);
  }
  await refreshWatchValues();
}

function varNode(v, depth, isScope = false) {
  const wrap = document.createElement("div");
  const row = document.createElement("div");
  row.className = "node";
  row.style.paddingLeft = `${8 + depth * 12}px`;
  const tog = document.createElement("span");
  tog.className = "toggle";
  tog.textContent = v.ref ? "▸" : "";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = v.name;
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = isScope ? "" : ` = ${v.value}`;
  if (isScope) name.className = "scope";
  const type = document.createElement("span");
  type.className = "type";
  type.textContent = v.type;
  row.append(tog, name, val, type);
  wrap.appendChild(row);
  if (v.ref) {
    let open = false;
    let kids = null;
    tog.addEventListener("click", async () => {
      open = !open;
      tog.textContent = open ? "▾" : "▸";
      if (open && !kids) {
        kids = document.createElement("div");
        for (const c of await api.dbgVariables(v.ref)) kids.appendChild(varNode(c, depth + 1));
        wrap.appendChild(kids);
      }
      if (kids) kids.hidden = !open;
    });
  }
  return wrap;
}

function dbgCommand(cmd) {
  if (cmd === "pause" ? state.sim !== "running" : state.sim !== "break") return;
  if (cmd !== "pause") {
    setCurrentLine(null);
    setStatus("running", "Ejecutando");
  }
  api.dbgCommand(cmd).catch((err) => consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal"));
}

// ------------------------------------------------------------- observación y forzado
const IO_SIGNALS = [...Array(8).keys()].map((k) => `I0_${k}`).concat([...Array(8).keys()].map((k) => `Q0_${k}`));
const watchCells = new Map(); // señal o expresión -> celda de valor

function renderWatch() {
  const body = $("watch-rows");
  body.textContent = "";
  watchCells.clear();
  const group = (text) => {
    const tr = document.createElement("tr");
    tr.className = "group";
    tr.innerHTML = `<td colspan="3"></td>`;
    tr.firstChild.textContent = text;
    body.appendChild(tr);
  };
  group("Entradas digitales");
  for (const sig of IO_SIGNALS) {
    if (sig === "Q0_0") group("Salidas relé");
    const tr = document.createElement("tr");
    tr.dataset.signal = sig;
    const name = document.createElement("td");
    name.textContent = sig.replace("_", ".");
    const val = document.createElement("td");
    val.className = "value";
    const f = document.createElement("td");
    f.className = "force";
    for (const [label, v] of [["Libre", null], ["0", 0], ["1", 1]]) {
      const b = document.createElement("button");
      b.className = `seg ${v === null ? "free" : `f${v}`}`;
      b.textContent = label;
      b.title = v === null ? "Sin forzar" : `Forzar a ${v}`;
      b.addEventListener("click", () => setForce(sig, v));
      f.appendChild(b);
    }
    tr.append(name, val, f);
    body.appendChild(tr);
    watchCells.set(sig, val);
    updateWatchSignal(sig);
  }
  group("Variables del sketch");
  for (const expr of state.watches) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = expr;
    const val = document.createElement("td");
    val.className = "value";
    val.textContent = "—";
    const del = document.createElement("td");
    const b = document.createElement("button");
    b.className = "ghost small del";
    b.textContent = "Quitar";
    b.addEventListener("click", () => {
      state.watches = state.watches.filter((w) => w !== expr);
      renderWatch();
    });
    del.appendChild(b);
    tr.append(name, val, del);
    body.appendChild(tr);
    watchCells.set(`expr:${expr}`, val);
  }
}

function updateWatchSignal(sig) {
  const cell = watchCells.get(sig);
  if (!cell) return;
  const forced = state.forced.get(sig);
  cell.textContent = `${state.levels.get(sig) ? 1 : 0}${forced !== undefined ? `  (forzada a ${forced})` : ""}`;
  const tr = cell.parentElement;
  tr.classList.toggle("forced", forced !== undefined);
  for (const b of tr.querySelectorAll(".force .seg")) {
    const v = b.classList.contains("free") ? undefined : b.classList.contains("f1") ? 1 : 0;
    b.classList.toggle("active", v === forced);
  }
}

function setForce(signal, value) {
  if (!["running", "paused", "break"].includes(state.sim)) return;
  if (value === null) {
    state.forced.delete(signal);
    api.command({ type: "unforce", signal });
  } else {
    state.forced.set(signal, value);
    api.command({ type: "force", signal, value });
  }
  const el = document.querySelector(`.io[data-signal="${signal}"]`);
  el?.classList.toggle("forced", value !== null);
  if (el) el.title = value === null ? el.title.replace(/ · forzada.*$/, "") : `${el.title.replace(/ · forzada.*$/, "")} · forzada a ${value}`;
  updateWatchSignal(signal);
}

function setWatchValues(values) {
  if (!values) return;
  for (const [expr, v] of Object.entries(values)) {
    const cell = watchCells.get(`expr:${expr}`);
    if (cell) cell.textContent = v;
  }
}

async function refreshWatchValues() {
  if (!state.watches.length) return;
  try {
    if (state.sim === "break") setWatchValues(await api.dbgEvaluate(state.watches, state.frameId));
    else if (state.sim === "running" && state.view === "watch") setWatchValues(await api.dbgSample(state.watches));
  } catch (err) {
    for (const w of state.watches) {
      const cell = watchCells.get(`expr:${w}`);
      if (cell) cell.textContent = `‹${cleanError(err)}›`;
    }
  }
}

// Sesión nueva: sin forzados, grabación vacía.
function resetSession() {
  state.forced.clear();
  for (const el of document.querySelectorAll(".io.forced")) el.classList.remove("forced");
  state.record = [];
  $("rec-info").textContent = "● 0 eventos";
  state.replay = null;
  clearDebugView();
  renderWatch();
}

// ------------------------------------------------------------- grabación
function requestHash() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      state.hashWaiter = null;
      reject(new Error("la simulación no respondió (¿detenida en el depurador?)"));
    }, 3000);
    state.hashWaiter = (m) => {
      clearTimeout(t);
      resolve(m);
    };
    api.command({ type: "hash" });
  });
}

async function saveRecording() {
  if (!state.sketch || !(state.sim === "running" || state.sim === "paused")) return null;
  try {
    const h = await requestHash();
    const lines = [
      `# Grabación de JWPLC Sim · sketch ${state.sketch.name} · package ${state.packageRef}`,
      `# fin t_ns=${h.t_ns} hash=${h.trace_hash}`,
      ...(state.sessionRtc ? [`# rtc ${state.sessionRtc}`] : []),
      ...state.record.filter((e) => e.t_ns <= h.t_ns).map((e) => `${(e.t_ns / 1e6).toFixed(6)} ${e.stim}`),
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const file = await api.saveStim(lines.join("\n") + "\n", `${state.sketch.name}-${stamp}`);
    if (file) consoleWrite(`[jwsim] grabación guardada: ${file} (t=${fmtTime(h.t_ns)}, hash ${h.trace_hash})\n`, "sys");
    return file ? { file, t_ns: h.t_ns, hash: h.trace_hash } : null;
  } catch (err) {
    consoleWrite(`[jwsim] no se pudo guardar la grabación: ${cleanError(err)}\n`, "fatal");
    return null;
  }
}

function parseStimHeader(text) {
  const m = text.match(/^# fin t_ns=(\d+) hash=(0x[0-9a-f]+)/m);
  const rtc = text.match(/^# rtc (fijo:\S+)/m)?.[1] ?? null;
  return m ? { t_ns: Number(m[1]), hash: m[2], rtc } : { t_ns: 0, hash: null, rtc };
}

async function replayFile(file, text) {
  const h = parseStimHeader(text);
  return buildAndRun({ replay: { file, ...h } });
}

function onReplayEnd(m) {
  const rp = state.replay;
  setStatus("paused", "Reproducida");
  const ok = rp?.hash ? m.trace_hash === rp.hash : null;
  consoleWrite(
    `[jwsim] reproducción terminada en t=${fmtTime(m.t_ns)} · hash ${m.trace_hash}` +
      (ok === null ? "\n" : ok ? " · coincide con la grabación ✓\n" : ` · NO coincide con la grabación (${rp.hash})\n`),
    ok === false ? "fatal" : "sys",
  );
  state.lastReplay = { t_ns: m.t_ns, hash: m.trace_hash, match: ok };
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
        updateWatchSignal(name);
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
    case "input":
      state.record.push({ t_ns: m.t_ns, stim: m.stim });
      $("rec-info").textContent = `● ${state.record.length} evento${state.record.length === 1 ? "" : "s"}`;
      break;
    case "hash":
      state.hashWaiter?.(m);
      state.hashWaiter = null;
      break;
    case "reached":
      onReplayEnd(m);
      break;
    case "stopped":
      consoleWrite(`[jwsim] sesión terminada en t=${fmtTime(m.t_ns)} · hash de traza ${m.trace_hash} (${m.trace_events} eventos)\n`, "sys");
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
  $("btn-dbg-continue").addEventListener("click", () => dbgCommand("continue"));
  $("btn-dbg-next").addEventListener("click", () => dbgCommand("next"));
  $("btn-dbg-in").addEventListener("click", () => dbgCommand("stepIn"));
  $("btn-dbg-out").addEventListener("click", () => dbgCommand("stepOut"));
  $("btn-dbg-pause").addEventListener("click", () => dbgCommand("pause"));
  $("btn-rec-save").addEventListener("click", saveRecording);
  $("bus-filter").addEventListener("change", applyBusFilter);
  $("watch-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const expr = $("watch-expr").value.trim();
    if (expr && !state.watches.includes(expr)) {
      state.watches.push(expr);
      renderWatch();
      refreshWatchValues();
    }
    $("watch-expr").value = "";
  });
  setInterval(() => state.sim === "running" && state.view === "watch" && refreshWatchValues(), 500);
  api.onDbgStopped(onDbgStopped);
  api.onDbgContinued(() => {
    if (state.sim !== "break") return;
    setCurrentLine(null);
    setStatus("running", "Ejecutando");
  });
  api.onDbgAttached(({ verified }) => {
    state.dbgAttached = true;
    for (const [path, lines] of verified) {
      const name = fileNameOf(path);
      if (!name) continue;
      state.bpVerified.set(name, new Set(lines));
      renderBreakpoints(name, bpLines(name));
    }
    consoleWrite("[jwsim] depurador (gdb) adjunto\n", "sys");
    clearDebugView();
  });
  api.onDbgDetached(() => {
    state.dbgAttached = false;
    for (const name of state.models.keys()) renderBreakpoints(name, bpLines(name));
    if (state.sim === "break") setStatus("running", "Ejecutando");
    clearDebugView();
  });
  $("btn-view-clear").addEventListener("click", () => {
    if (state.view === "console") $("console").textContent = "";
    else if (state.view === "buses") resetBuses();
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
  api.onDisplay(drawDisplay);
  wireKeypad();
  api.onStderr((t) => consoleWrite(t, /FATAL|no está soportad/.test(t) ? "fatal" : "sys"));
  api.onExit(({ code }) => {
    if (state.sim === "running" || state.sim === "paused" || state.sim === "break") {
      clearDebugView();
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
    else if (cmd === "dbgToggle" && state.active) toggleBreakpoint(state.active, editor.getPosition().lineNumber);
    else if (cmd === "dbgContinue") dbgCommand("continue");
    else if (cmd === "dbgNext") dbgCommand("next");
    else if (cmd === "dbgStepIn") dbgCommand("stepIn");
    else if (cmd === "dbgStepOut") dbgCommand("stepOut");
    else if (cmd === "dbgPause") dbgCommand("pause");
    else if (cmd === "dbgDetach") api.dbgCommand("detach");
    else if (cmd === "replay") {
      api.openStim().then((r) => r && replayFile(r.file, r.text));
    }
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
        glyphMargin: true,
      });
      // Clic en el margen: alterna un breakpoint en esa línea.
      editor.onMouseDown((e) => {
        if (e.target.type === monacoRef.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && state.active) {
          toggleBreakpoint(state.active, e.target.position.lineNumber);
        }
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
  toggleBreakpoint: (name, line) => toggleBreakpoint(name, line),
  breakpoints: (name) => bpLines(name),
  dbg: (cmd) => dbgCommand(cmd),
  status: () => state.sim,
  currentLine: () => {
    const [name, ids] = [...state.lineDecos][0] ?? [];
    return name ? { name, line: state.models.get(name).getDecorationRange(ids[0])?.startLineNumber } : null;
  },
  frameName: () => document.querySelector("#dbg-stack li.active")?.firstChild?.textContent ?? null,
  variables: () => [...document.querySelectorAll("#dbg-vars .node:not(.scope)")].map((n) => n.textContent),
  addWatch: (expr) => {
    $("watch-expr").value = expr;
    $("watch-add").requestSubmit();
  },
  watchValue: (key) => watchCells.get(key)?.textContent ?? null,
  setForce: (signal, value) => setForce(signal, value),
  saveRecording: () => saveRecording(),
  replay: (file, text) => replayFile(file, text),
  lastReplay: () => state.lastReplay ?? null,
  clock: () => $("clock").textContent,
  // Píxel de la pantalla en la vista (RGB).
  tftPixel: (x, y) => Array.from($("tft").getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3)),
  tftDataUrl: () => $("tft").toDataURL("image/png"),
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
  renderWatch();
  clearDebugView();
  const examples = await populateExamples();
  // Primer arranque: el ejemplo de E/S básico del package.
  const first = examples.find((e) => e.name === "02_io_basic") ?? examples[0];
  if (first) loadSketch(await api.openExample(first.dir));
}

main();
