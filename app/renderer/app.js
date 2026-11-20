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

// La pestaña Comunicación muestra al usuario solo RS-485 (UART2) y Modbus RTU/TCP.
// I2C, SPI y las demás UART son internos de la placa: solo se ven en modo
// avanzado (window.jwsimTest.showAllBuses(true), lo usan las pruebas E2E).
let busAll = false;

function busKind(row) {
  if (/^Modbus/.test(row.dev) || row.fields?.modbus) return "Modbus";
  if (row.bus === "UART2") return "RS485";
  if (/^I2C/.test(row.bus)) return "I2C";
  if (/SPI/.test(row.bus)) return "SPI";
  return "UART";
}

const busForUser = (kind) => busAll || kind === "Modbus" || kind === "RS485";

function busRowHidden(tr, filter) {
  if (!busForUser(tr.dataset.kind)) return true;
  return !!filter && tr.dataset.kind !== filter;
}

function showAllBuses(on) {
  busAll = !!on;
  for (const o of document.querySelectorAll("#bus-filter option[data-advanced]")) o.hidden = !busAll;
  if (!busAll && document.querySelector("#bus-filter option:checked")?.hasAttribute("data-advanced")) $("bus-filter").value = "";
  applyBusFilter();
}

function resetBuses() {
  busDecoder = window.JwsimBus.createDecoder();
  $("bus-rows").textContent = "";
}

function applyBusFilter() {
  const f = $("bus-filter").value;
  for (const tr of $("bus-rows").children) tr.hidden = tr.dataset.kind ? busRowHidden(tr, f) : false;
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
      // Lo interno de la placa (I2C, SPI, consola) no se guarda en modo usuario.
      if (!busForUser(tr.dataset.kind)) continue;
      tr.hidden = busRowHidden(tr, filter);
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

const VIEW_NOTES = {
  problems: "",
  build: "",
  console: "USB · UART0 · 115200",
  buses: "RS-485 y Modbus en vivo",
  watch: "Forzar fija la señal aunque el programa o la escena la cambien",
  debug: "gdb",
  exercise: "Enunciado y calificación",
};
function setView(view) {
  state.view = view;
  if (view === "console") $("tab-console").classList.remove("fresh");
  for (const b of document.querySelectorAll(".ptab")) {
    const on = b.dataset.view === view;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  }
  for (const v of document.querySelectorAll(".view")) v.hidden = v.dataset.view !== view;
  $("view-note").textContent = VIEW_NOTES[view] ?? "";
  $("opt-ts").hidden = view !== "console";
  $("btn-view-clear").hidden = !["console", "buses"].includes(view);
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
  const btnRun = $("btn-run");
  const btnPause = $("btn-pause");
  const btnStop = $("btn-stop");
  btnPause.disabled = !live || kind === "break";
  btnStop.disabled = !live;
  btnRun.disabled = kind === "building";
  btnRun.dataset.state = kind;
  btnPause.dataset.state = kind;
  btnStop.dataset.state = kind;
  btnRun.className = `primary state-${kind}`;
  btnPause.className = kind === "paused" ? "is-paused" : kind === "break" ? "is-break" : "";
  btnStop.className = live ? "is-live" : "";
  if (kind === "building") {
    btnRun.textContent = "⟳ Compilando";
    btnRun.title = "Compilando el programa…";
  } else if (kind === "running") {
    btnRun.textContent = text === "Reproduciendo" ? "● Replay" : "● Ejecutando";
    btnRun.title = `${text} — clic para recompilar y reiniciar (F5)`;
  } else if (kind === "paused") {
    btnRun.textContent = "↻ Reiniciar";
    btnRun.title = "Recompilar y reiniciar desde el principio (F5)";
  } else if (kind === "break") {
    btnRun.textContent = "● Depurando";
    btnRun.title = `${text} — clic para recompilar y reiniciar (F5)`;
  } else if (kind === "error") {
    btnRun.textContent = "⚠ Reintentar";
    btnRun.title = `${text} — clic para reintentar (F5)`;
  } else {
    btnRun.textContent = "▶ Ejecutar";
    btnRun.title = "Compilar y ejecutar (F5)";
  }
  btnPause.textContent = kind === "paused" ? "▶ Continuar" : kind === "break" ? "⏸ Break" : "❚❚ Pausa";
  btnPause.title =
    kind === "paused"
      ? `${text} — clic para continuar (F6)`
      : kind === "break"
        ? text
        : "Pausar / continuar (F6)";
  $("led-pwr").classList.toggle("on", live);
  $("led-run").classList.toggle("on", kind === "running");
  $("led-err").classList.toggle("on", kind === "error");
  if (kind !== "running") window.JwsimSound?.buzzerStop();
  if (!live) $("led-buz").classList.remove("on");
  for (const b of document.querySelectorAll("#inputs .io, #keypad .key, #sd-slot")) b.disabled = !live;
  $("fault-rtc").disabled = live;
  for (const id of ["btn-dbg-continue", "btn-dbg-next", "btn-dbg-in", "btn-dbg-out"]) $(id).disabled = kind !== "break";
  $("btn-dbg-pause").disabled = kind !== "running";
  $("btn-rec-save").disabled = !(kind === "running" || kind === "paused");
  $("btn-serial-send").disabled = !(kind === "running" || kind === "paused");
  window.JwsimScene?.onStatus(kind);
}

// La consola junta lo que llega y lo pinta como mucho cada kConsoleMs: un
// sketch que imprime sin pausa (más aún en ×10 o Máx) no traba la interfaz.
// Cada pintada es un nodo nuevo (modificar un nodo de texto grande obliga a
// recalcular todas sus líneas) y se borran nodos enteros del principio
// cuando se pasa de kConsoleMax caracteres.
const kConsoleMax = 100_000;
const kConsoleMs = 50;
const consoleQueue = [];
let consoleTimer = 0;
let consoleChars = 0;

let consoleQueued = 0;

function consoleWrite(text, cls) {
  // Plegado (o en otra vista): un punto en «Serie» avisa que llegó algo.
  if (state.view !== "console" || document.body.classList.contains("dock-collapsed")) $("tab-console")?.classList.add("fresh");
  // Error del firmware o de la escena: el panel se abre solo en Serie.
  if (cls === "fatal") {
    setView("console");
    setDockCollapsed(false);
  }
  const last = consoleQueue.at(-1);
  if (last && last.cls === cls) last.text += text;
  else consoleQueue.push({ text, cls });
  consoleQueued += text.length;
  // En Máx llega más de lo que se puede mostrar: se guarda solo lo último.
  if (consoleQueued > 2 * kConsoleMax) {
    while (consoleQueue.length > 1 && consoleQueued - consoleQueue[0].text.length > kConsoleMax) consoleQueued -= consoleQueue.shift().text.length;
    const first = consoleQueue[0];
    if (consoleQueued > kConsoleMax) {
      const cut = first.text.indexOf("\n", consoleQueued - kConsoleMax);
      const n = cut >= 0 ? cut + 1 : consoleQueued - kConsoleMax;
      first.text = first.text.slice(n);
      consoleQueued -= n;
    }
  }
  consoleTimer ||= setTimeout(() => requestAnimationFrame(consoleFlush), kConsoleMs);
}

function consoleClear() {
  consoleQueue.length = 0;
  consoleQueued = 0;
  consoleChars = 0;
  serialBol = true;
  serialPendingT = undefined;
  $("console").textContent = "";
}

// Texto de la UART0. Con «Marca de tiempo», cada línea lleva delante el
// tiempo virtual en que el firmware la empezó a enviar (el runner manda en
// "lines" el instante de cada línea que empieza en el fragmento).
const TS_KEY = "jwsim.serialTimestamps";
let serialBol = true;
let serialPendingT; // línea que empezó con un "\r" suelto
function serialWrite(raw, lines = []) {
  const text = raw.replaceAll("\r", "");
  if (!text) {
    if (serialBol && lines.length) serialPendingT = lines[0];
    return;
  }
  if (!state.serialTs) {
    serialBol = text.endsWith("\n");
    consoleWrite(text);
    return;
  }
  let out = "";
  let k = 0;
  let from = 0;
  while (from < text.length) {
    if (serialBol) {
      const t = serialPendingT ?? lines[k++];
      serialPendingT = undefined;
      out += `${t === undefined ? "            " : fmtTime(t)} > `;
    }
    const nl = text.indexOf("\n", from);
    const to = nl < 0 ? text.length : nl + 1;
    out += text.slice(from, to);
    serialBol = nl >= 0;
    from = to;
  }
  consoleWrite(out);
}

function consoleFlush() {
  consoleTimer = 0;
  const pre = $("console");
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  // Lo nuevo ya llena la consola: lo anterior sobra entero.
  if (consoleQueued >= kConsoleMax) {
    pre.textContent = "";
    consoleChars = 0;
  }
  consoleQueued = 0;
  // Cada pintada va en su propio bloque: el navegador solo calcula las
  // líneas nuevas. Si el bloque anterior quedó a media línea, se sigue en él.
  let chunk = pre.lastElementChild;
  if (!chunk || chunk.textContent.endsWith("\n")) {
    chunk = document.createElement("div");
    chunk.className = "console-chunk";
    pre.appendChild(chunk);
  }
  for (const { text, cls } of consoleQueue.splice(0)) {
    // De un bloque más largo que el límite solo se ve el final.
    const t = text.length > kConsoleMax ? text.slice(-kConsoleMax) : text;
    if (cls) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = t;
      chunk.appendChild(span);
    } else {
      chunk.appendChild(document.createTextNode(t));
    }
    consoleChars += t.length;
  }
  // La línea a medias pasa a un bloque propio (pequeño), que es el que se
  // completa en la siguiente pintada; el bloque de líneas enteras no se toca.
  const tail = chunk.lastChild;
  if (tail?.nodeType === Node.TEXT_NODE && !tail.data.endsWith("\n") && chunk.textContent.includes("\n")) {
    const nl = tail.data.lastIndexOf("\n");
    const rest = nl >= 0 ? tail.splitText(nl + 1) : tail;
    const next = document.createElement("div");
    next.className = "console-chunk";
    next.appendChild(rest);
    pre.appendChild(next);
    if (!chunk.firstChild) chunk.remove();
    chunk = next;
  }
  while (consoleChars > kConsoleMax && pre.firstElementChild && pre.firstElementChild !== chunk) {
    consoleChars -= pre.firstElementChild.textContent.length;
    pre.firstElementChild.remove();
  }
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

// ------------------------------------------------------------- placa
// Vista Placa: el SVG del JWPLC Basic (el mismo de la escena) con las
// entradas, salidas, teclas y la pantalla encima, en las posiciones que
// declara el dibujo (.borne, .led-ancla, .tecla, #tft).
function buildBoard() {
  const inputs = $("inputs");
  const outputs = $("outputs");
  for (let k = 0; k < 8; k++) {
    const b = document.createElement("button");
    b.className = "io input";
    b.dataset.signal = `I0_${k}`;
    b.disabled = true;
    b.title = `Entrada I0.${k} (24 VDC): clic para activarla`;
    b.innerHTML = `<span class="led"></span>`;
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
    o.title = `Salida a relé Q0.${k} (COM-NO)`;
    o.innerHTML = `<span class="lamp"></span><span class="io-label">Q0.${k}</span>`;
    outputs.appendChild(o);
  }
  placeBoard().catch((e) => consoleWrite(`[placa] ${e.message}\n`, "sys"));
}

async function placeBoard() {
  const text = (await api.sceneBoardSvg()).replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "");
  // Ids propios (la app ya usa #tft y #btn-* en la barra).
  const art = $("plc-art");
  art.innerHTML = text.replace(/\bid="([^"]+)"/g, 'id="plcart-$1"').replace(/href="#/g, 'href="#plcart-');
  const svg = art.querySelector("svg");
  // Solo el frente (pantalla, botonera y LEDs de entrada): el recuadro del
  // panel frontal del dibujo, sin las borneras. Las salidas, cuyos LEDs están
  // en la bornera inferior, van en la tira de abajo (#outputs).
  const front = svg.querySelector('rect[rx="26"]');
  const full = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  // Sin los bordes: arriba asoman las borneras (terminan 1 px dentro del
  // frente) y abajo el cuerpo inferior, que empieza antes del borde.
  const lower = [...svg.querySelectorAll(":scope > rect")].find((r) => Number(r.getAttribute("y")) > Number(front?.getAttribute("y")));
  const [vx, vy, vw, vh] = front
    ? (() => {
        const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => Number(front.getAttribute(k)));
        const bottom = lower ? Math.min(y + h, Number(lower.getAttribute("y"))) : y + h;
        return [x + 2, y + 3, w - 4, bottom - y - 3];
      })()
    : full;
  svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  // El mayor tamaño que entra en el panel sin deformar el dibujo.
  const fit = () => {
    const box = $("plc-fit");
    const w = Math.min(box.clientWidth, (box.clientHeight * vw) / vh, 900);
    if (w > 0) Object.assign($("plc-stage").style, { width: `${w}px`, height: `${(w * vh) / vw}px` });
  };
  new ResizeObserver(fit).observe($("plc-fit"));
  fit();
  // Nitidez de la pantalla según el tamaño con que quedó (ver fitTftRendering).
  new ResizeObserver(() => fitTftRendering($("tft"))).observe($("tft"));
  matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.("change", () => fitTftRendering($("tft")));
  const num = (el, k) => Number(el.getAttribute(k));
  const place = (el, x, y, w, h) =>
    Object.assign(el.style, { left: `${((x - vx) / vw) * 100}%`, top: `${((y - vy) / vh) * 100}%`, width: `${(w / vw) * 100}%`, height: `${(h / vh) * 100}%` });
  const tft = svg.querySelector("#plcart-tft");
  place($("tft"), num(tft, "x"), num(tft, "y"), num(tft, "width"), num(tft, "height"));
  for (const key of document.querySelectorAll("#keypad .key")) {
    const r = svg.querySelector(`.tecla[data-btn="${key.dataset.btn}"] rect`);
    if (r) place(key, num(r, "x"), num(r, "y"), num(r, "width"), num(r, "height"));
  }
  const screw = (sig) => svg.querySelector(`.borne[data-senal="${sig}"]`);
  const led = (sig) => svg.querySelector(`.led-ancla[data-senal="${sig}"]`);
  const pitch = Number(svg.getAttribute("data-grid")) || 57;
  // Entradas: desde el borde del frente hasta debajo del LED (rótulo + LED).
  for (let k = 0; k < 8; k++) {
    const b = document.querySelector(`#inputs .io[data-signal="I0_${k}"]`);
    const g = screw(`I0_${k}`);
    const a = led(`I0_${k}`);
    if (g && a) {
      const x = num(g.querySelector("use"), "x");
      const y0 = Math.max(vy, Number(g.dataset.entrada));
      const [x0, w, h] = [x - pitch / 2, pitch, num(a, "cy") + 16 - y0];
      place(b, x0, y0, w, h);
      const r = num(a, "r");
      Object.assign(b.querySelector(".led").style, {
        left: `${((num(a, "cx") - x0) / w) * 100}%`, top: `${((num(a, "cy") - y0) / h) * 100}%`, width: `${((2 * r) / w) * 100}%`,
      });
      b.title = `${g.querySelector("title")?.textContent ?? `I0.${k}`}: clic para activarla`;
    }
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
  // Falla G9: ruido en la línea RS-485, en vivo (se graba como entrada).
  $("fault-noise").addEventListener("change", (e) => {
    if (["running", "paused", "break"].includes(state.sim)) api.command({ type: "noise", port: 2, rate: Number(e.target.value), seed: 1 });
  });
  // Zócalo microSD: quitar o poner la tarjeta (señal SD_CARD, se graba).
  $("sd-slot").addEventListener("click", () => {
    if (["running", "paused", "break"].includes(state.sim)) setInput("SD_CARD", !state.levels.get("SD_CARD"));
  });
  // Teclado sobre la pantalla (y sobre la pantalla ampliada).
  for (const tft of [$("tft"), $("tft-zoom-canvas")]) {
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
  wireTftZoom();
}

// ------------------------------------------------------------- nitidez de la TFT
// El canvas guarda los 320×170 píxeles del ST7789 y el navegador lo escala al
// tamaño de la placa. Con «pixelated» al achicar (placa chica, ventana
// angosta) el vecino más cercano salta filas y columnas enteras: desaparecen
// líneas de 1 px y trazos de letras. Por eso: pixelated solo si cada píxel
// del ST7789 ocupa al menos un píxel físico; si no, suavizado (promedia y no
// pierde nada).
function fitTftRendering(canvas) {
  if (!canvas) return;
  const w = canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1);
  const mode = w >= canvas.width - 0.5 ? "pixelated" : "auto";
  if (canvas.style.imageRendering !== mode) canvas.style.imageRendering = mode;
}
window.JwsimTft = { fitRendering: fitTftRendering };

// Pantalla ampliada a escala entera: k×k píxeles físicos por píxel del
// ST7789, sin bordes desparejos (para mirar de cerca o grabar un video).
function wireTftZoom() {
  const box = $("tft-zoom");
  const cv = $("tft-zoom-canvas");
  const ctx = cv.getContext("2d");
  let k = 0;
  let raf = 0;
  const kMax = () => {
    const dpr = window.devicePixelRatio || 1;
    return Math.max(1, Math.floor(Math.min((innerWidth * 0.94 * dpr) / 320, ((innerHeight - 90) * dpr) / 170)));
  };
  const size = () => {
    const dpr = window.devicePixelRatio || 1;
    k = Math.min(Math.max(1, k || kMax()), kMax());
    Object.assign(cv.style, { width: `${(320 * k) / dpr}px`, height: `${(170 * k) / dpr}px` });
    $("tft-zoom-scale").textContent = `${k}× · ${320 * k}×${170 * k} px`;
    $("tft-zoom-minus").disabled = k <= 1;
    $("tft-zoom-plus").disabled = k >= kMax();
  };
  const step = () => {
    ctx.drawImage($("tft"), 0, 0);
    raf = requestAnimationFrame(step);
  };
  const open = () => {
    box.hidden = false;
    k = 0;
    size();
    cancelAnimationFrame(raf);
    step();
    cv.focus();
  };
  const close = () => {
    box.hidden = true;
    cancelAnimationFrame(raf);
    $("tft").focus();
  };
  $("tft").addEventListener("dblclick", open);
  $("tft-zoom-open").addEventListener("click", open);
  $("tft-zoom-close").addEventListener("click", close);
  $("tft-zoom-minus").addEventListener("click", () => ((k -= 1), size()));
  $("tft-zoom-plus").addEventListener("click", () => ((k += 1), size()));
  box.addEventListener("click", (e) => e.target === box && close());
  window.addEventListener("resize", () => !box.hidden && size());
}

function setInput(signal, value) {
  // Las entradas cableadas en la escena las maneja la escena (G7).
  if (window.JwsimScene?.owns(signal)) return;
  state.levels.set(signal, value);
  renderSignal(signal, value);
  api.command({ type: "set", signal, value: value ? 1 : 0 });
}

function renderSignal(name, level) {
  const el = document.querySelector(`.io[data-signal="${name}"], .key[data-btn="${name}"], #sd-slot[data-signal="${name}"]`);
  if (el) el.classList.toggle("on", !!level);
  if (name === "SD_CARD") $("sd-slot").title = level ? "microSD insertada: clic para quitarla" : "Sin tarjeta: clic para insertarla";
}

function resetBoard() {
  state.levels.clear();
  for (const el of document.querySelectorAll(".io, .key")) el.classList.remove("on");
  $("sd-slot").classList.add("on");   // la placa arranca con la tarjeta puesta
  clearDisplay();
}

// ------------------------------------------------------------- editor
function languageFor(name) {
  // ST/IL de OpenPLC: el resaltado de Pascal es el más parecido de Monaco.
  if (/\.(ino|c|cpp|h|hpp)$/i.test(name)) return "cpp";
  if (/\.(st|il)$/i.test(name)) return "pascal";
  return /\.md$/i.test(name) ? "markdown" : "plaintext";
}
// Código C/C++ del sketch (no las notas .md/.txt): autocompletado y breakpoints.
const isCodeFile = (name) => /\.(ino|c|cpp|h|hpp)$/i.test(name);
const mainFileName = () => (state.sketch && !state.sketch.openplc ? `${state.sketch.name}.ino` : null);

function addModel(f) {
  const model = monacoRef.editor.createModel(f.content, languageFor(f.name), monacoRef.Uri.file(f.path));
  model.onDidChangeContent(() => renderTabs());
  state.models.set(f.name, model);
  state.saved.set(f.name, f.content);
  return model;
}

function removeModel(name) {
  const model = state.models.get(name);
  if (!model) return;
  if (state.bpDecos.get(name)?.length) api.dbgSetBreakpoints(model.uri.fsPath, []).catch(() => {});
  if (state.lineDecos.has(name)) setCurrentLine(null);
  state.models.delete(name);
  state.saved.delete(name);
  state.bpDecos.delete(name);
  state.bpVerified.delete(name);
  if (state.active === name) showFile(state.models.keys().next().value);
  else renderTabs();
  model.dispose();
}

function loadSketch(sketch) {
  if (!sketch) return;
  stopSim();
  if (state.sim === "error") setStatus("idle", "Detenido");
  $("sb-build").textContent = "";
  state.project = null;
  state.pendingProjectReload = null;
  state.pendingInputs = null;
  api.watchProject?.(null);
  showProjectStatus();
  for (const m of state.models.values()) m.dispose();
  state.models.clear();
  state.bpDecos.clear();
  state.bpVerified.clear();
  state.lineDecos.clear();
  state.saved.clear();
  state.naming = null;
  state.sketch = sketch;
  for (const f of sketch.files) addModel(f);
  state.exe = null;
  // Proyecto OpenPLC (G6): se edita en el OpenPLC Editor; aquí solo se ve.
  editor.updateOptions({ readOnly: !!sketch.openplc });
  window.JwsimTabs?.onProgram(!!sketch.openplc);
  if (sketch.openplc) consoleWrite(`[jwsim] proyecto OpenPLC: se edita en el OpenPLC Editor; al guardar allí se recompila aquí\n`, "sys");
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
    t.dataset.file = name;
    t.title = isCodeFile(name) ? name : `${name} · nota del sketch, no se compila`;
    const label = document.createElement("span");
    label.textContent = name;
    t.appendChild(label);
    t.addEventListener("click", () => showFile(name));
    if (mainFileName() && name !== mainFileName()) {
      const x = document.createElement("button");
      x.className = "tab-close";
      x.textContent = "×";
      x.title = `Eliminar ${name} del sketch`;
      x.setAttribute("aria-label", `Eliminar ${name}`);
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSketchFile(name);
      });
      t.appendChild(x);
    }
    tabs.appendChild(t);
  }
  if (!mainFileName()) return;
  if (state.naming) {
    tabs.appendChild(state.naming);
    return;
  }
  const add = document.createElement("button");
  add.className = "tab-add";
  add.id = "tab-add";
  add.textContent = "+";
  add.title = "Nuevo archivo en el sketch (Ctrl+Mayús+N): .ino, .h, .c, .cpp, .md o .txt";
  add.setAttribute("aria-label", "Nuevo archivo en el sketch");
  add.addEventListener("click", () => promptNewFile());
  tabs.appendChild(add);
}

// ------------------------------------------------------------- archivos del sketch
// Nuevo archivo: un campo en la barra de pestañas (Electron no tiene prompt()).
// Enter lo crea; Esc o perder el foco lo cancela.
function promptNewFile() {
  if (!mainFileName()) return;
  window.JwsimTabs?.select("program");
  if (state.naming) return state.naming.querySelector("input").focus();
  const box = document.createElement("form");
  box.className = "tab-naming";
  const input = document.createElement("input");
  input.id = "tab-new-name";
  input.placeholder = "nombre.h";
  input.spellcheck = false;
  input.title = "Sin extensión se crea una pestaña .ino. Enter para crear, Esc para cancelar";
  box.appendChild(input);
  const close = () => {
    state.naming = null;
    renderTabs();
  };
  let busy = false;
  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await createSketchFile(input.value);
      close();
    } catch (err) {
      input.classList.add("invalid");
      input.title = cleanError(err);
      consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal");
      input.focus();
    } finally {
      busy = false;
    }
  });
  input.addEventListener("input", () => input.classList.remove("invalid"));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(() => !busy && state.naming === box && close(), 0));
  state.naming = box;
  renderTabs();
  input.focus();
}

async function createSketchFile(name) {
  const f = await api.addFile(state.sketch.dir, name);
  addModel(f);
  showFile(f.name);
  consoleWrite(`[jwsim] ${f.name} agregado al sketch${isCodeFile(f.name) ? "" : " (nota: no se compila)"}\n`, "sys");
  return f.name;
}

async function importSketchFiles() {
  if (!mainFileName()) return;
  try {
    const { added, skipped } = await api.importFiles(state.sketch.dir);
    for (const f of added) addModel(f);
    if (added.length) showFile(added[added.length - 1].name);
    for (const f of added) consoleWrite(`[jwsim] ${f.name} agregado al sketch\n`, "sys");
    for (const s of skipped) consoleWrite(`[jwsim] no se agregó ${s}\n`, "fatal");
  } catch (err) {
    consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal");
  }
}

async function deleteSketchFile(name, { ask = true } = {}) {
  if (!state.models.has(name)) return false;
  if (ask && !confirm(`¿Eliminar ${name} del sketch?\n\nEl archivo se mueve a la papelera.`)) return false;
  try {
    await api.deleteFile(state.sketch.dir, name);
    removeModel(name);
    consoleWrite(`[jwsim] ${name} eliminado del sketch (está en la papelera)\n`, "sys");
    return true;
  } catch (err) {
    consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal");
    return false;
  }
}

async function saveSketch() {
  if (!state.sketch || state.sketch.openplc) return;
  const files = [...state.models].map(([name, m]) => ({ name, content: m.getValue() }));
  await api.save({ dir: state.sketch.dir, files });
  for (const f of files) state.saved.set(f.name, f.content);
  renderTabs();
}

// ------------------------------------------------------------- diagnósticos
function clearProblems() {
  $("problems").textContent = "";
  $("problems-count").textContent = "";
  $("problems-count").className = "badge";
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
  $("problems-count").textContent = relevant.length ? String(relevant.length) : "";
  $("problems-count").className = `badge ${errors ? "error" : relevant.length ? "warning" : ""}`;
  $("problems-count").title = `${errors} error${errors === 1 ? "" : "es"} · ${relevant.length - errors} aviso${relevant.length - errors === 1 ? "" : "s"}`;
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
  // El panel inferior sigue a la compilación: Compilación mientras compila,
  // Problemas si falla y, si compila, Serie (o la vista que tenía el usuario).
  const before = state.view;
  setView("build");
  $("build-log").textContent = "";
  clearProblems();
  const r = await api.build(state.sketch.dir);
  $("sb-build").textContent = r.ok ? `Compilado en ${(r.ms / 1000).toFixed(1)} s` : "Compilación con errores";
  if (!r.ok) {
    setStatus("error", "Error de compilación");
    $("build-log").textContent += `\n${r.message}\n${r.output}`;
    $("build-log").scrollTop = $("build-log").scrollHeight;
    showProblems(r.diagnostics ?? []);
    // Error sin línea del sketch (librería que falta, enlace…): igual va a Problemas.
    if (!$("problems").childElementCount && r.message) {
      const li = document.createElement("li");
      li.className = "error";
      li.textContent = r.message.trim();
      $("problems").appendChild(li);
      $("problems-count").textContent = "1";
      $("problems-count").className = "badge error";
    }
    setView("problems");
    setDockCollapsed(false);
    return false;
  }
  if (r.diagnostics?.length) showProblems(r.diagnostics);
  setView(["problems", "build"].includes(before) ? "console" : before);
  state.exe = r.exe;
  $("build-log").textContent += `\nOK · ${r.libraries.length} librerías del package\n`;
  consoleClear();
  resetBuses();
  // Breakpoints con las líneas actuales (las ediciones los desplazan).
  for (const name of state.models.keys()) await api.dbgSetBreakpoints(state.models.get(name).uri.fsPath, bpLines(name));
  state.replay = replay;
  if (replay) consoleWrite(`[jwsim] reproduciendo ${replay.file}${replay.t_ns ? ` hasta t=${fmtTime(replay.t_ns)}` : ""}\n`, "sys");
  const sceneSpec = replay ? null : (window.JwsimScene?.specForRun() ?? null);
  // Falla G9 "RTC sin batería": vale para el arranque.
  const rtc = replay?.rtc ?? ($("fault-rtc").checked ? "sin-bateria" : null);
  const started = await api.start(r.exe, replay?.file, state.project?.file ?? null, rtc, sceneSpec);
  window.JwsimScene?.onStart(started);
  if (started?.error) {
    setStatus("error", "Escena inválida");
    consoleWrite(`[jwsim] ${started.error}\n`, "fatal");
    return false;
  }
  state.sessionRtc = started?.rtc ?? null;
  // Falla G9 "ruido en RS-485" elegida antes de iniciar (se graba como entrada).
  if (!replay && Number($("fault-noise").value) > 0) api.command({ type: "noise", port: 2, rate: Number($("fault-noise").value), seed: 1 });
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
  for (const o of document.querySelectorAll(".mode .seg[data-mode]")) {
    o.classList.toggle("active", o.dataset.mode === mode);
    o.setAttribute("aria-checked", String(o.dataset.mode === mode));
  }
}

function setSpeed(speed) {
  state.speed = speed;
  window.JwsimSound?.buzzerStop();   // el agendado del buzzer se recalibra
  $("sel-speed").value = String(speed);
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

// Pestaña «E/S y variables»: entradas y salidas en tablas al estilo de la
// tabla de forzado de un PLC (valor, estado y Forzar 0/1 · Liberar) y, al
// lado, las variables del sketch que se observan.
function renderWatch() {
  watchCells.clear();
  for (const id of ["io-in-rows", "io-out-rows"]) $(id).textContent = "";
  for (const sig of IO_SIGNALS) {
    const tr = document.createElement("tr");
    tr.dataset.signal = sig;
    const name = document.createElement("td");
    name.className = "sig";
    name.textContent = sig.replace("_", ".");
    const val = document.createElement("td");
    val.className = "value";
    const st = document.createElement("td");
    st.className = "state";
    const f = document.createElement("td");
    f.className = "force";
    for (const [label, v] of [["0", 0], ["1", 1], ["Liberar", null]]) {
      const b = document.createElement("button");
      b.className = `seg ${v === null ? "free" : `f${v}`}`;
      b.textContent = label;
      b.title = v === null ? "Quitar el forzado: la señal vuelve a seguir al programa o a la escena" : `Forzar a ${v}`;
      b.addEventListener("click", () => setForce(sig, v));
      f.appendChild(b);
    }
    tr.append(name, val, st, f);
    $(sig.startsWith("I") ? "io-in-rows" : "io-out-rows").appendChild(tr);
    watchCells.set(sig, val);
    updateWatchSignal(sig);
  }
  const body = $("watch-rows");
  body.textContent = "";
  if (!state.watches.length) {
    const tr = document.createElement("tr");
    tr.className = "empty";
    tr.innerHTML = `<td colspan="3"></td>`;
    tr.firstChild.textContent = "Agregue una variable global del sketch para ver su valor mientras corre.";
    body.appendChild(tr);
  }
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
  const on = !!state.levels.get(sig);
  cell.innerHTML = `<span class="lvl ${on ? "on" : "off"}"></span>`;
  cell.firstChild.textContent = on ? "1 · ON" : "0 · OFF";
  const tr = cell.parentElement;
  tr.classList.toggle("forced", forced !== undefined);
  tr.querySelector(".state").textContent = forced !== undefined ? `Forzada a ${forced}` : "Libre";
  for (const b of tr.querySelectorAll(".force .seg")) {
    const v = b.classList.contains("free") ? undefined : b.classList.contains("f1") ? 1 : 0;
    b.classList.toggle("active", v !== undefined && v === forced);
    if (v === undefined) b.disabled = forced === undefined;
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

// Consola: el texto entra por la UART0 del firmware (como el monitor serie
// del IDE). El runner lo devuelve como entrada y queda en la grabación.
const EOL = { lf: "\n", crlf: "\r\n", cr: "\r", none: "" };
function sendSerial() {
  const input = $("serial-text");
  const bytes = new TextEncoder().encode(input.value + EOL[$("serial-eol").value]);
  if (!bytes.length || !(state.sim === "running" || state.sim === "paused")) return;
  api.command({ type: "uart", port: 0, hex: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") });
  input.value = "";
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
  const rtc = text.match(/^# rtc (fijo:\S+|sin-bateria)/m)?.[1] ?? null;
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

// Buzzer de la placa (GPIO26, LEDC): sonido con los instantes del runner y
// LED «BUZ» con el último estado de cada tanda.
const BUZZER_PIN = 26;
function onPwm(items) {
  const bz = items.filter((i) => i[1] === BUZZER_PIN);
  if (!bz.length) return;
  window.JwsimSound?.buzzer(bz, state.speed);
  const [, , hz, duty] = bz[bz.length - 1];
  $("led-buz").classList.toggle("on", hz > 0 && duty > 0);
}

function paintBuzSound() {
  const on = !!window.JwsimSound?.enabled;
  const b = $("buz-sound");
  b.textContent = on ? "🔊" : "🔇";
  b.title = on ? "Sonido (buzzer, relés y contactores): activado" : "Sonido (buzzer, relés y contactores): apagado";
  b.classList.toggle("off", !on);
}

function onMessage(m) {
  switch (m.type) {
    case "hello":
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
        // Relés de salida de la placa: clic al conmutar.
        if (name.startsWith("Q0_") && !!state.levels.get(name) !== !!level) window.JwsimSound?.click("relay", !!level);
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
    case "pwm":
      onPwm(m.items);
      break;
    case "serial":
      // La consola es UART0; el resto (RS-485 en UART2) se ve en Tráfico.
      if (!m.port) serialWrite(m.text, m.lines);
      break;
    case "restart":
      // esp_restart(): el runner relanza el firmware conservando lo externo.
      consoleWrite(`\n[jwsim] esp_restart(): reinicio del ESP32 en ${fmtTime(m.boot_ns)}\n`, "sys");
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
  const el = $("sb-project");
  const p = state.project;
  if (!p) {
    el.textContent = "";
    return;
  }
  const name = (path) => path.split(/[\\/]/).pop();
  const parts = [`Proyecto: ${p.project.name ?? name(p.file)}`];
  for (const [k, label] of [["openplc", "OpenPLC"], ["hmi", "HMI"]]) {
    if (!p.links[k]) continue;
    const missing = p.missing.some((m) => m.link === k);
    parts.push(`${label}: ${name(p.links[k])}${missing ? " (no encontrado)" : ""}`);
  }
  el.textContent = parts.join(" · ");
  if (state.pendingProjectReload) {
    const btn = document.createElement("button");
    btn.id = "sb-project-reload";
    btn.type = "button";
    btn.textContent = "Recargar .jwsim";
    btn.title = "El archivo .jwsim cambió en disco: haz clic para recargarlo";
    btn.style.marginLeft = "8px";
    btn.addEventListener("click", () => {
      const next = state.pendingProjectReload;
      if (!next) return;
      applyProject(next, { keepSketch: next.sketch?.dir === state.sketch?.dir, preserveView: true });
      consoleWrite(`[jwsim] proyecto recargado desde disco: ${next.file}\n`, "sys");
    });
    el.appendChild(btn);
  }
}

function applyProject(res, { keepSketch = false, preserveView = false } = {}) {
  if (!res) return;
  if (!keepSketch) loadSketch(res.sketch);
  state.project = res;
  state.pendingProjectReload = null;
  const sim = res.project.simulation ?? {};
  if (typeof sim.realtimeFactor === "number") setSpeed(speedFromFactor(sim.realtimeFactor));
  const scene = res.project.scene ?? {};
  if (scene.inputMode) setInputMode(scene.inputMode);
  state.pendingInputs = scene.inputs ?? null;
  for (const [signal, v] of Object.entries(state.pendingInputs ?? {})) renderSignal(signal, !!v);
  window.JwsimScene?.load(scene, { preserveView });
  api.watchProject?.(res.file);
  showProjectStatus();
  showExercise(res.file);
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

// Botón «Simular» del OpenPLC Editor (G6 SIMULATE_BUTTON). Si ese proyecto ya
// está abierto no se recarga: lo que se guardó ya llegó por el vigilante de
// archivos, y así se conservan la simulación y la escena.
async function openFromEditor(target) {
  try {
    const sketch = await api.openPlcProject(target);
    if (state.sketch?.dir === sketch.dir) return;
    const dirty = [...state.models].some(([name, model]) => model.getValue() !== state.saved.get(name));
    if (dirty && !confirm(`Hay cambios sin guardar en ${state.sketch.name}. ¿Abrir ${sketch.name} y descartarlos?`)) return;
    loadSketch(sketch);
  } catch (err) {
    consoleWrite(`[jwsim] ${err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}
`, "fatal");
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
    scene: { inputMode: state.inputMode, inputs: currentInputs(), ...(window.JwsimScene?.specForSave() ?? {}) },
  });
  if (!res) return;
  state.project = { links: {}, missing: [], ...state.project, file: res.file, project: res.project };
  state.pendingProjectReload = null;
  window.JwsimScene?.markSaved?.();
  api.watchProject?.(res.file);
  showProjectStatus();
  consoleWrite(`[jwsim] proyecto guardado: ${res.file}\n`, "sys");
}

function onExternalProjectChange({ file, res }) {
  if (!state.project?.file || !res) return;
  const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();
  if (norm(file) !== norm(state.project.file)) return;
  const codeDirty = [...state.models].some(([name, model]) => model.getValue() !== state.saved.get(name));
  const sceneDirty = !!window.JwsimScene?.isDirty?.();
  const running = state.sim === "running" || state.sim === "paused" || state.sim === "building";
  if (!codeDirty && !sceneDirty && !running) {
    applyProject(res, { keepSketch: res.sketch?.dir === state.sketch?.dir, preserveView: true });
    consoleWrite(`[jwsim] proyecto recargado desde disco: ${res.file}\n`, "sys");
    return;
  }
  state.pendingProjectReload = res;
  showProjectStatus();
  consoleWrite(`[jwsim] el proyecto cambió en disco; haz clic en «Recargar .jwsim» para aplicar sin perder cambios locales\n`, "sys");
}

// Edición externa (Arduino IDE u otro editor): se recarga el archivo y, si
// la simulación estaba activa, se recompila y reinicia conservando la escena.
async function onExternalChange({ name, path, content, deleted, at, openplc }) {
  if (openplc) return onOpenPlcChange({ name, content, at });
  if (!state.sketch || state.sketch.openplc) return;
  const model = state.models.get(name);
  // Archivo borrado o creado fuera (Explorador, Arduino IDE): las pestañas lo siguen.
  if (deleted) {
    if (!model || name === mainFileName()) return;
    if (model.getValue() !== state.saved.get(name)) {
      consoleWrite(`[jwsim] ${name} se borró fuera del simulador, pero tiene cambios sin guardar aquí: Guardar lo vuelve a crear\n`, "sys");
      return;
    }
    removeModel(name);
    consoleWrite(`[jwsim] ${name} se borró fuera del simulador\n`, "sys");
    return;
  }
  if (!model) {
    addModel({ name, path, content });
    renderTabs();
    consoleWrite(`[jwsim] ${name} apareció en la carpeta del sketch\n`, "sys");
    return;
  }
  if (model.getValue() === content) return;
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

// Proyecto OpenPLC (G6 RELOAD_FROM_EDITOR): el editor guardó un POU, la
// configuración o los pines. Las pestañas son de solo lectura, así que se
// actualizan sin preguntar; con la simulación en marcha se recompila con la
// cadena del editor y se reinicia conservando la escena.
// El editor guarda varios archivos seguidos: se agrupan (300 ms) y se
// compila una vez; si llega otro guardado durante la compilación, se repite.
const plcReload = { timer: null, first: 0, names: new Set(), again: false };
function onOpenPlcChange({ name, content, at }) {
  const model = state.models.get(name);
  if (model && content !== null && model.getValue() !== content) {
    model.setValue(content);
    state.saved.set(name, content);
    renderTabs();
  }
  if (!plcReload.names.size) plcReload.first = at;
  plcReload.names.add(name);
  clearTimeout(plcReload.timer);
  plcReload.timer = setTimeout(reloadOpenPlc, 300);
}
async function reloadOpenPlc() {
  if (state.sim === "building") {
    plcReload.again = true;
    return;
  }
  const names = [...plcReload.names];
  const at = plcReload.first;
  plcReload.names.clear();
  const live = state.sim === "running" || state.sim === "paused";
  consoleWrite(`[jwsim] guardado en el OpenPLC Editor (${names.join(", ")}); ${live ? "recompilando" : "recargado"}\n`, "sys");
  if (!live) return;
  const ok = await buildAndRun({ keepScene: true });
  if (ok) {
    const ms = Date.now() - at;
    $("sb-build").textContent = `Recargado en ${(ms / 1000).toFixed(2)} s tras guardar en el OpenPLC Editor`;
    $("sb-build").dataset.reloadMs = String(ms);
  }
  if (plcReload.again || plcReload.names.size) {
    plcReload.again = false;
    plcReload.timer = setTimeout(reloadOpenPlc, 0);
  }
}

// ------------------------------------------------------------- ejercicios (G9)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Markdown mínimo de los enunciados: títulos, párrafos, listas, tablas,
// negrita y código.
function mdToHtml(text) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (/^#{1,3} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n + 2}>${inline(l.slice(n + 1))}</h${n + 2}>`);
      i++;
    } else if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push(`<table><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (/^(\d+\.|-) /.test(l)) {
      const ordered = /^\d/.test(l);
      const items = [];
      while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-) /, ""));
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    } else if (l.trim()) {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||\d+\. |- )/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(" "))}</p>`);
    } else i++;
  }
  return out.join("");
}

// ---- Objetivos en vivo (rubrica.json "goals"): la barra de cada objetivo se
// llena mientras su condición se sostiene en la simulación.
const goalUi = { goals: [], progress: null, error: null };

function fmtReading(key, v) {
  if (v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return /Pct$/.test(key) ? `${n.toFixed(0)} %` : String(Math.round(n * 10) / 10);
}

function fmtWant(key, w) {
  if (Array.isArray(w)) return /Pct$/.test(key) ? `${w[0]}–${w[1]} %` : `${w[0]}–${w[1]}`;
  return typeof w === "boolean" ? (w ? "sí" : "no") : String(w);
}

// El panel se arma una vez por ejercicio (buildGoals) y cada snapshot solo
// cambia clases, textos y anchos: las barras se deslizan y el aviso de reto
// completado se anima una sola vez.
function buildGoals() {
  const box = $("ex-goals");
  box.hidden = !goalUi.goals.length && !goalUi.error;
  if (box.hidden) return;
  if (goalUi.error) {
    box.innerHTML = `<div class="goals-head"><b>Objetivos en vivo</b></div><p class="bad">${esc(goalUi.error)}</p>`;
    return;
  }
  const extraLabel = { merit: "Mérito", distinction: "Distinción" };
  let html = `<div class="goals-head"><b>Objetivos en vivo</b><span class="goals-count"></span><span class="goals-time muted"></span></div>`;
  html += `<div class="goals-bar"><i></i></div><div class="goals-done" hidden><b>¡Reto completado!</b> Cumplió todos los objetivos en la misma corrida.<div class="learn-after"></div></div><ol class="goals">`;
  for (const g of goalUi.goals) {
    const sigs = Object.entries(g.when)
      .map(([k, w]) => `<span class="goal-sig" data-sig="${esc(k)}"><code>${esc(k)}</code> <span class="goal-read"></span><small>→ ${esc(fmtWant(k, w))}</small></span>`)
      .join("");
    html += `<li class="goal${g.extra ? " extra" : ""}" data-goal="${esc(g.id)}"><span class="goal-icon"></span><div class="goal-body">`;
    html += `<div class="goal-title">${esc(g.description)}${g.extra ? ` <span class="goal-extra">${extraLabel[g.extra]}</span>` : ""}</div><div class="goal-sigs">${sigs}</div>`;
    if (Number(g.hold_ms ?? 0) > 0) html += `<div class="goal-hold"><i></i><small></small></div>`;
    html += `</div></li>`;
  }
  box.innerHTML = html + `</ol>`;
  renderGoals();
}

function renderGoals() {
  const box = $("ex-goals");
  if (box.hidden || goalUi.error) return;
  const p = goalUi.progress;
  const byId = new Map((p?.goals ?? []).map((g) => [g.id, g]));
  const required = goalUi.goals.filter((g) => !g.extra);
  const done = required.filter((g) => byId.get(g.id)?.state === "done").length;
  const icon = { done: "✓", active: "◔", pending: "○", blocked: "🔒" };
  box.querySelector(".goals-count").textContent = `${done}/${required.length}`;
  box.querySelector(".goals-time").textContent = p ? `t = ${(p.t_ms / 1000).toFixed(1)} s` : "Corra la simulación y opere la escena";
  box.querySelector(".goals-bar i").style.width = `${required.length ? (100 * done) / required.length : 0}%`;
  box.querySelector(".goals-done").hidden = !p?.complete;
  if (p?.complete && !goalUi.reported && state.exercise?.id) {
    goalUi.reported = true;
    reportDone("goals").then((r) => fillAfter(box.querySelector(".learn-after"), r));
  }
  for (const g of goalUi.goals) {
    const li = box.querySelector(`[data-goal="${CSS.escape(g.id)}"]`);
    const s = byId.get(g.id);
    const st = s?.state ?? (g.after ? "blocked" : "pending");
    li.classList.remove("done", "active", "pending", "blocked");
    li.classList.add(st);
    li.querySelector(".goal-icon").textContent = icon[st];
    for (const [k, w] of Object.entries(g.when)) {
      const el = li.querySelector(`[data-sig="${CSS.escape(k)}"]`);
      // Cumplido: se deja la condición, no la lectura que siguió cambiando.
      el.querySelector(".goal-read").textContent = st === "done" ? "" : fmtReading(k, s?.reading?.[k]);
      el.classList.toggle("ok", st === "done" || (!!s && st !== "blocked" && window.JwsimGoalMatch(s.reading[k], w)));
    }
    const hold = Number(g.hold_ms ?? 0);
    if (hold > 0) {
      li.querySelector(".goal-hold i").style.width = `${Math.round((s?.fraction ?? 0) * 100)}%`;
      li.querySelector(".goal-hold small").textContent = `${((s?.held_ms ?? 0) / 1000).toFixed(1)} / ${(hold / 1000).toFixed(1)} s`;
    }
  }
}

window.JwsimGoalMatch = (got, want) => {
  if (got === undefined) return false;
  const n = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : Number(v ?? 0));
  return Array.isArray(want) ? n(got) >= want[0] && n(got) <= want[1] : Math.abs(n(got) - n(want)) < 1e-6;
};

api.onGoalsProgress((p) => {
  // Al empezar a correr, la ficha se pliega para que se vean los objetivos.
  if (!goalUi.progress && !$("ex-brief").classList.contains("collapsed")) renderBrief(false);
  goalUi.progress = p;
  renderGoals();
});

async function showExercise(file) {
  const info = file ? await api.exerciseInfo(file) : null;
  goalUi.goals = info?.goals ?? [];
  goalUi.error = info?.goalsError ?? null;
  goalUi.progress = null;
  await api.setGoals(goalUi.goals.length ? goalUi.goals : null);
  buildGoals();
  state.exercise = info ? { file, id: info.id, brief: info.brief } : null;
  goalUi.reported = false;
  renderBrief(true);
  $("tab-exercise").hidden = !info;
  $("scene-tab-reto").hidden = !info;
  $("ex-reto-hint").hidden = !info;
  if (info) window.JwsimShowReto?.();
  else if (document.querySelector(".scene-main").dataset.pane === "reto") window.JwsimScenePane && document.querySelector('.side-tab[data-pane="props"]').click();
  $("grade-result").innerHTML = "";
  $("grade-note").textContent = "";
  if (!info) {
    if (state.view === "exercise") setView("console");
    return;
  }
  $("ex-statement").innerHTML = mdToHtml(info.statement);
  setView("exercise");
}

// ---- Ficha del reto (exercise.brief) y paso al siguiente (centro de aprendizaje).
function renderBrief(expanded) {
  const box = $("ex-brief");
  const b = state.exercise?.brief;
  box.hidden = !b;
  if (!b) return;
  const list = (xs) => (xs ?? []).map((x) => `<li>${esc(x)}</li>`).join("");
  box.classList.toggle("collapsed", !expanded);
  if (!expanded) $("scene-side").scrollTop = 0;
  box.innerHTML = expanded
    ? `<div class="brief-sec"><div class="brief-k">El objetivo</div><p>${esc(b.goal ?? "")}</p></div>` +
      `<div class="brief-sec"><div class="brief-k">Pasos</div><ol>${list(b.steps)}</ol></div>` +
      `<div class="brief-sec"><div class="brief-k">Con qué trabaja</div><ul class="brief-uses">${list(b.uses)}</ul></div>` +
      `<div class="brief-nav"><button class="primary" data-brief="start">Empezar</button><span class="muted">Programe, pulse ▶ Ejecutar y opere la escena: los objetivos se marcan en vivo.</span></div>`
    : `<button class="link" data-brief="show">Ver ficha del reto</button><span class="muted"> · ${esc(b.goal ?? "")}</span>`;
}

async function reportDone(via, grade) {
  try {
    const r = await api.learnComplete(state.exercise.id, via, grade);
    window.dispatchEvent(new CustomEvent("jwsim:learnchange"));
    return r;
  } catch {
    return null;
  }
}

function fillAfter(el, r, lead = "") {
  if (!el || !r) return;
  el.innerHTML =
    (lead ? `<b>${esc(lead)}</b> ` : "") +
    (r.teaches ? `<span class="learn-teaches">Qué enseña: ${esc(r.teaches)}</span>` : "") +
    (r.next ? ` <button class="primary small" data-next="${esc(r.next)}">Siguiente reto →</button>` : ` <span class="muted">Terminó todos los retos abiertos.</span>`);
}

window.openExerciseById = async (id) => {
  try {
    applyProject(await api.openExercise(id));
  } catch (err) {
    consoleWrite(`[jwsim] ${cleanError(err)}
`, "fatal");
  }
};

window.openArchById = async (id) => {
  try {
    const res = await api.openArch(id);
    applyProject(res);
    if (res?.showcase) consoleWrite(`${res.showcase.trim()}\n`, "sys");
  } catch (err) {
    consoleWrite(`[jwsim] ${cleanError(err)}\n`, "fatal");
  }
};

document.addEventListener("click", (e) => {
  if (e.target.closest("#scene-devmgr")) return window.JwsimDevices?.open();
  if (e.target.closest('[data-reto="show"]')) return window.JwsimShowReto?.();
  const b = e.target.closest("[data-brief], [data-next]");
  if (!b) return;
  if (b.dataset.next) window.openExerciseById(b.dataset.next);
  else if (b.dataset.brief === "start") renderBrief(false);
  else renderBrief(true);
});

function renderGrade(g) {
  if (!g.ok) {
    const diag = (g.diagnostics ?? []).map((d) => `<li>${esc(d.file?.split(/[\\/]/).pop() ?? "")}:${d.line}: ${esc(d.message)}</li>`).join("");
    return `<div class="grade bad"><div class="grade-num">0<small>/20</small></div><div>${g.stage === "build" ? "El sketch no compila." : esc(g.error ?? "No se pudo calificar.")}${diag ? `<ul>${diag}</ul>` : ""}</div></div>`;
  }
  const cls = g.grade >= 14 ? "ok" : g.grade >= 11 ? "mid" : "bad";
  let html = `<div class="grade ${cls}"><div class="grade-num">${String(g.grade).replace(".", ",")}<small>/20</small></div><div>${g.score} de ${g.max} puntos</div></div>`;
  for (const c of g.cases) {
    html += `<div class="grade-case"><div class="grade-case-head"><span>${esc(c.name)}</span><span>${c.score}/${c.max}</span></div><ul>`;
    for (const k of c.checks) html += `<li class="${k.ok ? "ok" : "bad"}">${k.ok ? "✓" : "✗"} ${esc(k.description)} <span class="muted">(${k.ok ? k.points : 0}/${k.points})</span>${!k.ok && k.detail ? `<div class="muted">${esc(k.detail)}</div>` : ""}</li>`;
    html += "</ul></div>";
  }
  return html;
}

async function gradeExercise() {
  if (!state.exercise || !state.sketch) return;
  await saveSketch();
  $("btn-grade").disabled = true;
  $("grade-note").textContent = "Calificando: compila y corre cada caso con la escena…";
  $("grade-result").innerHTML = "";
  try {
    const g = await api.gradeExercise(state.exercise.file, state.sketch.dir);
    $("grade-result").innerHTML = renderGrade(g);
    $("grade-note").textContent = g.ok ? `Calificado en ${(g.wall_ms / 1000).toFixed(1)} s` : "";
    if (g.ok && g.grade >= 14 && state.exercise?.id) {
      const box = document.createElement("div");
      box.className = "learn-after grade-pass";
      $("grade-result").prepend(box);
      fillAfter(box, await reportDone("grade", g.grade), "Reto aprobado.");
    }
  } catch (err) {
    $("grade-note").textContent = cleanError(err);
  } finally {
    $("btn-grade").disabled = false;
  }
}

async function populateExercises() {
  state.exercises = (await api.listExercises()) ?? [];
  return state.exercises;
}

async function populateArchs() {
  state.archs = (await api.listArchs?.()) ?? [];
  return state.archs;
}

// ------------------------------------------------------------- arranque
async function populateExamples() {
  return (await api.listExamples()) ?? [];
}

// ------------------------------------------------------------- autoformato
// Ctrl+T (Herramientas > Autoformato), como Arduino IDE: formatea la pestaña
// activa con clang-format. Es una sola edición: Ctrl+Z la deshace entera.
async function formatModel(model) {
  const name = model.uri.path.split("/").pop();
  const r = await api.formatCode(model.getValue(), name, state.sketch?.dir ?? null);
  if (r?.error) throw new Error(r.error);
  return r;
}
async function autoFormat() {
  if (!editor || !state.active || state.sketch?.openplc) return;
  const model = editor.getModel();
  if (!model || model.getLanguageId() !== "cpp" || editor.getOption(monacoRef.editor.EditorOption.readOnly)) return;
  try {
    const before = model.getValue();
    const { text, style } = await formatModel(model);
    if (model.getValue() !== before) return; // cambió mientras se formateaba
    const note = $("sb-build");
    if (text === before) {
      note.textContent = "Autoformato: sin cambios";
      return;
    }
    const pos = editor.getPosition();
    editor.pushUndoStop();
    editor.executeEdits("autoformato", [{ range: model.getFullModelRange(), text }]);
    editor.pushUndoStop();
    // El cursor queda en la misma línea (el formato rara vez la mueve mucho).
    const line = Math.min(pos.lineNumber, model.getLineCount());
    editor.setPosition({ lineNumber: line, column: model.getLineFirstNonWhitespaceColumn(line) || 1 });
    editor.revealLineInCenterIfOutsideViewport(line);
    note.textContent = `Autoformato aplicado (${style})`;
  } catch (err) {
    consoleWrite(`[jwsim] autoformato: ${err.message}\n`, "sys");
  }
}

// ------------------------------------------------------------- divisor
// Divisor entre el editor y la simulación: arrastrar cambia el ancho del
// editor (con flechas, de a 24 px); doble clic vuelve al reparto inicial.
// El ancho se recuerda en este equipo (localStorage).
const SPLIT_KEY = "jwsim.codeWidth";
const SPLIT_MIN = 320; // editor
const SPLIT_MIN_SIM = 360; // simulación
function storeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function storeSet(k, v) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: solo dura la sesión */
  }
}
function setCodeWidth(px, save = true) {
  const ws = document.querySelector(".workspace");
  if (px === null) {
    ws.style.removeProperty("--code-w");
    ws.classList.remove("code-w");
    if (save) storeSet(SPLIT_KEY, null);
    return;
  }
  const max = ws.clientWidth - SPLIT_MIN_SIM - 6;
  const w = Math.round(Math.max(SPLIT_MIN, Math.min(px, max)));
  ws.style.setProperty("--code-w", `${w}px`);
  ws.classList.add("code-w");
  if (save) storeSet(SPLIT_KEY, String(w));
}
function wireSplitter() {
  const bar = $("splitter");
  const ws = document.querySelector(".workspace");
  const saved = Number(storeGet(SPLIT_KEY));
  if (saved > 0) setCodeWidth(saved, false);
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");
    document.body.classList.add("resizing");
    const left = ws.getBoundingClientRect().left;
    const move = (ev) => setCodeWidth(ev.clientX - left, false);
    const up = (ev) => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
      bar.classList.remove("dragging");
      document.body.classList.remove("resizing");
      setCodeWidth(ev.clientX - left);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  });
  bar.addEventListener("dblclick", () => setCodeWidth(null));
  bar.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowLeft" ? -24 : e.key === "ArrowRight" ? 24 : 0;
    if (!step) return;
    e.preventDefault();
    setCodeWidth(document.querySelector(".code-pane").getBoundingClientRect().width + step);
  });
  // Al achicar la ventana, el ancho guardado no debe dejar sin lugar a la simulación.
  window.addEventListener("resize", () => {
    const cur = parseFloat(ws.style.getPropertyValue("--code-w"));
    if (cur > 0) setCodeWidth(cur, false);
  });
}

// Paneles laterales de la escena (tipo Altium): barra izquierda (Diagrama de
// estados) y barra derecha (Reto, Equipos, Propiedades), ambos con ancho
// ajustable por divisor y plegado en un clic.
const SIDE_KEY = "jwsim.scenePane";
const SIDE_W_KEY = "jwsim.sceneSideW";
const LEFT_KEY = "jwsim.sceneLeftPane";
const LEFT_W_KEY = "jwsim.sceneLeftW";
const SCENE_MIN_STAGE = 260;
const SCENE_LEFT_DEF = 440;
const SCENE_LEFT_MIN = 260;
const SCENE_LEFT_MAX = 680;
const SCENE_SIDE_MIN = 240;
const SCENE_SIDE_MAX = 560;
let leftAvail = false;
const liveSideW = { left: null, right: null };

function scenePaneWidth(side, fallback) {
  if (liveSideW[side] != null) return liveSideW[side];
  const raw = Number(storeGet(side === "left" ? LEFT_W_KEY : SIDE_W_KEY));
  return raw > 0 ? raw : fallback;
}
function clampSideWidths() {
  const main = document.querySelector(".scene-main");
  if (!main) return;
  const total = main.getBoundingClientRect().width;
  const leftOpen = !main.classList.contains("left-collapsed");
  const sideOpen = !main.classList.contains("side-collapsed");
  const rails = 72 + (leftOpen ? 5 : 0) + (sideOpen ? 5 : 0);
  const avail = total > 0 ? Math.max(0, total - rails - SCENE_MIN_STAGE) : 1200;

  const sideDef = main.dataset.pane === "reto" ? 380 : 340;
  let lw = leftOpen ? Math.max(SCENE_LEFT_MIN, Math.min(SCENE_LEFT_MAX, scenePaneWidth("left", SCENE_LEFT_DEF))) : 0;
  let rw = sideOpen ? Math.max(SCENE_SIDE_MIN, Math.min(SCENE_SIDE_MAX, scenePaneWidth("right", sideDef))) : 0;

  if (total > 0 && lw + rw > avail) {
    if (leftOpen && sideOpen) {
      const minL = Math.min(SCENE_LEFT_MIN, Math.floor(avail / 2));
      const minR = Math.min(SCENE_SIDE_MIN, Math.floor(avail / 2));
      const excess = lw + rw - avail;
      const dl = Math.min(Math.max(0, lw - minL), Math.round(excess * 0.6));
      lw -= dl;
      rw = Math.max(minR, rw - (excess - dl));
      if (lw + rw > avail) lw = Math.max(0, avail - rw);
    } else if (leftOpen) {
      lw = avail;
    } else if (sideOpen) {
      rw = avail;
    }
  }
  if (leftOpen) main.style.setProperty("--scene-left-w", `${Math.round(lw)}px`);
  else main.style.removeProperty("--scene-left-w");
  if (sideOpen && (liveSideW.right != null || storeGet(SIDE_W_KEY) || (total > 0 && rw < sideDef))) {
    main.style.setProperty("--scene-side-w", `${Math.round(rw)}px`);
  } else {
    main.style.removeProperty("--scene-side-w");
  }
  return { lw: Math.round(lw), rw: Math.round(rw) };
}
function setSideWidth(side, px, save = true) {
  const key = side === "left" ? LEFT_W_KEY : SIDE_W_KEY;
  if (px === null) {
    liveSideW[side] = null;
    try {
      localStorage.removeItem(key);
    } catch {}
    clampSideWidths();
    window.JwsimStateDiag?.resize?.();
    return;
  }
  const min = side === "left" ? SCENE_LEFT_MIN : SCENE_SIDE_MIN;
  const max = side === "left" ? SCENE_LEFT_MAX : SCENE_SIDE_MAX;
  liveSideW[side] = Math.round(Math.max(min, Math.min(max, px)));
  const clamped = clampSideWidths();
  const applied = side === "left" ? clamped?.lw : clamped?.rw;
  if (save) {
    liveSideW[side] = null;
    if (applied != null) storeSet(key, String(applied));
  }
  window.JwsimStateDiag?.resize?.();
}
function wireSceneSplitter(id, side) {
  const bar = $(id);
  const main = document.querySelector(".scene-main");
  if (!bar || !main) return;
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");
    document.body.classList.add("resizing");
    const widthAt = (ev) => {
      const r = main.getBoundingClientRect();
      return side === "left" ? ev.clientX - r.left - 36 : r.right - 36 - ev.clientX;
    };
    const move = (ev) => setSideWidth(side, widthAt(ev), false);
    const finish = (ev, commit) => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onCancel);
      bar.classList.remove("dragging");
      document.body.classList.remove("resizing");
      if (commit) {
        setSideWidth(side, widthAt(ev), true);
      } else {
        liveSideW[side] = null;
        clampSideWidths();
        window.JwsimStateDiag?.resize?.();
      }
    };
    const onUp = (ev) => finish(ev, true);
    const onCancel = (ev) => finish(ev, false);
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onCancel);
  });
  bar.addEventListener("dblclick", () => setSideWidth(side, null));
  bar.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowLeft" ? -24 : e.key === "ArrowRight" ? 24 : 0;
    if (!dir) return;
    e.preventDefault();
    const el = $(side === "left" ? "scene-left" : "scene-side");
    const cur = el?.getBoundingClientRect().width ?? (side === "left" ? SCENE_LEFT_DEF : 340);
    setSideWidth(side, cur + (side === "left" ? dir : -dir), true);
  });
}
function setLeftPane(pane, save = true) {
  const main = document.querySelector(".scene-main");
  const open = leftAvail ? pane : null;
  main.classList.toggle("left-collapsed", !open);
  for (const t of document.querySelectorAll(".side-tab-left")) {
    const on = t.dataset.leftPane === open;
    t.classList.toggle("active", on);
    t.setAttribute("aria-pressed", String(on));
  }
  for (const p of document.querySelectorAll(".left-pane")) p.hidden = p.dataset.leftPane !== open;
  main.dataset.leftPane = open ?? "";
  if (save) storeSet(LEFT_KEY, pane || "none");
  clampSideWidths();
  window.JwsimStateDiag?.setVisible?.(!!open);
}
function setLeftAvailability(hasPneu) {
  leftAvail = !!hasPneu;
  const btn = $("scene-tab-states");
  if (btn) {
    btn.disabled = !leftAvail;
    btn.title = leftAvail
      ? "Diagrama de estados en vivo (FluidSIM): cilindros, bobinas, sensores y presión"
      : "Diagrama de estados: la escena necesita una electroválvula con cilindro";
  }
  const saved = storeGet(LEFT_KEY);
  setLeftPane(leftAvail && saved === "states" ? "states" : null, false);
}
function setScenePane(pane, save = true) {
  const main = document.querySelector(".scene-main");
  main.classList.toggle("side-collapsed", !pane);
  for (const t of document.querySelectorAll(".side-tab")) {
    const on = t.dataset.pane === pane;
    t.classList.toggle("active", on);
    t.setAttribute("aria-pressed", String(on));
  }
  for (const p of document.querySelectorAll(".side-pane")) p.hidden = p.dataset.pane !== pane;
  main.dataset.pane = pane ?? "";
  if (save) storeSet(SIDE_KEY, pane || "none");
  clampSideWidths();
  if (pane === "add") $("scene-add-filter").focus();
}
function wireSceneSide() {
  const saved = storeGet(SIDE_KEY);
  setScenePane(saved === "none" ? null : saved === "add" ? "add" : "props", false);
  setLeftAvailability(false);
  wireSceneSplitter("scene-left-splitter", "left");
  wireSceneSplitter("scene-side-splitter", "right");
  const mainEl = document.querySelector(".scene-main");
  if (mainEl) new ResizeObserver(() => clampSideWidths()).observe(mainEl);
  window.addEventListener("resize", () => {
    clampSideWidths();
    window.JwsimStateDiag?.resize?.();
  });
  // Ir al reto: la vista del esquema con su pestaña abierta.
  window.JwsimShowReto = () => {
    window.JwsimScene?.setView("scene");
    setScenePane("reto", false);
  };
  for (const t of document.querySelectorAll(".side-tab"))
    t.addEventListener("click", () => setScenePane(document.querySelector(".scene-main").dataset.pane === t.dataset.pane ? null : t.dataset.pane));
  for (const t of document.querySelectorAll(".side-tab-left"))
    t.addEventListener("click", () => {
      if (t.disabled) return;
      setLeftPane(document.querySelector(".scene-main").dataset.leftPane === t.dataset.leftPane ? null : t.dataset.leftPane, true);
    });
  // Al seleccionar un equipo o un cable con el panel abierto, se ven sus propiedades.
  // Con el reto abierto no se cambia: el alumno opera la escena mirando los objetivos.
  window.JwsimScenePane = {
    showProps: () => !["", "reto"].includes(document.querySelector(".scene-main").dataset.pane ?? "") && setScenePane("props", false),
    setLeftAvailability,
    setLeftPane,
    isLeftOpen: () => !document.querySelector(".scene-main")?.classList.contains("left-collapsed"),
  };
}

// Panel inferior: alto ajustable con su divisor y plegable a una barra con
// sus pestañas. Cada pestaña principal recuerda su estado: en Programa empieza
// abierto; en Esquema, Planta 3D y Placa, plegado (el lienzo usa toda la
// altura). Se abre solo con un error de compilación o del firmware.
const DOCK_KEY = "jwsim.dock.";
const DOCK_MIN = 120;
const DOCK_MIN_TOP = 300; // editor y placa
const mainTab = () => document.body.dataset.tab || "program";
function dockState(tab = mainTab()) {
  try {
    const v = JSON.parse(storeGet(DOCK_KEY + tab) ?? "null");
    if (v && typeof v === "object") return v;
  } catch {}
  return { collapsed: tab !== "program", h: 0 };
}
function saveDock(patch) {
  storeSet(DOCK_KEY + mainTab(), JSON.stringify({ ...dockState(), ...patch }));
}
function setDockHeight(px, save = true) {
  if (px === null) {
    document.body.style.removeProperty("--dock-h");
    if (save) saveDock({ h: 0 });
    return;
  }
  const max = window.innerHeight - DOCK_MIN_TOP;
  const h = Math.round(Math.max(DOCK_MIN, Math.min(px, max)));
  document.body.style.setProperty("--dock-h", `${h}px`);
  if (save) saveDock({ h });
}
function setDockCollapsed(collapsed, save = true) {
  if (save) saveDock({ collapsed });
  if (document.body.classList.contains("dock-collapsed") === collapsed) return;
  document.body.classList.toggle("dock-collapsed", collapsed);
  const t = $("btn-dock-toggle");
  t.setAttribute("aria-expanded", String(!collapsed));
  t.textContent = collapsed ? "▴" : "▾";
  t.title = collapsed ? "Abrir el panel inferior (Ctrl+J)" : "Plegar el panel inferior (Ctrl+J)";
  window.dispatchEvent(new Event("resize"));
}
/** Aplica el estado guardado de la pestaña principal visible. */
function applyDockForTab() {
  const st = dockState();
  setDockHeight(st.h > 0 ? st.h : null, false);
  setDockCollapsed(!!st.collapsed, false);
}
function wireDock() {
  const bar = $("dock-splitter");
  applyDockForTab();
  new MutationObserver(applyDockForTab).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
  const toggle = () => setDockCollapsed(!document.body.classList.contains("dock-collapsed"));
  $("btn-dock-toggle").addEventListener("click", toggle);
  $("sb-dock").addEventListener("click", toggle);

  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");
    document.body.classList.add("resizing", "resizing-v");
    const move = (ev) => setDockHeight(window.innerHeight - ev.clientY - statusbarH(), false);
    const up = (ev) => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
      bar.classList.remove("dragging");
      document.body.classList.remove("resizing", "resizing-v");
      setDockHeight(window.innerHeight - ev.clientY - statusbarH());
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  });
  bar.addEventListener("dblclick", () => setDockHeight(null));
  bar.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowUp" ? 24 : e.key === "ArrowDown" ? -24 : 0;
    if (!step) return;
    e.preventDefault();
    setDockHeight($("dock").getBoundingClientRect().height + step);
  });
  window.addEventListener("resize", () => {
    const cur = parseFloat(document.body.style.getPropertyValue("--dock-h"));
    if (cur > 0) setDockHeight(cur, false);
  });
}
function statusbarH() {
  return document.querySelector(".statusbar").getBoundingClientRect().height;
}

function wireUi() {
  wireSplitter();
  wireDock();
  wireSceneSide();
  $("btn-save").addEventListener("click", saveSketch);
  $("btn-grade").addEventListener("click", gradeExercise);
  $("btn-run").addEventListener("click", buildAndRun);
  $("btn-pause").addEventListener("click", togglePause);
  $("btn-stop").addEventListener("click", stopSim);
  $("sel-speed").addEventListener("change", (e) => setSpeed(Number(e.target.value)));
  $("buz-sound").addEventListener("click", () => {
    window.JwsimSound.enabled = !window.JwsimSound.enabled;
  });
  window.JwsimSound?.onChange(paintBuzSound);
  paintBuzSound();
  for (const b of document.querySelectorAll(".mode .seg[data-mode]")) b.addEventListener("click", () => setInputMode(b.dataset.mode));
  api.onFileChanged(onExternalChange);
  api.onProjectChanged?.(onExternalProjectChange);
  api.onOpenTarget(openFromEditor);
  $("btn-dbg-continue").addEventListener("click", () => dbgCommand("continue"));
  $("btn-dbg-next").addEventListener("click", () => dbgCommand("next"));
  $("btn-dbg-in").addEventListener("click", () => dbgCommand("stepIn"));
  $("btn-dbg-out").addEventListener("click", () => dbgCommand("stepOut"));
  $("btn-dbg-pause").addEventListener("click", () => dbgCommand("pause"));
  $("btn-rec-save").addEventListener("click", saveRecording);
  $("serial-send").addEventListener("submit", (e) => {
    e.preventDefault();
    sendSerial();
  });
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
  $("btn-com").addEventListener("click", async (e) => {
    e.stopPropagation();
    await comPopover($("com-panel").hidden);
  });
  // El panel del COM se cierra con Esc o con un clic fuera de él.
  document.addEventListener("pointerdown", (e) => {
    if (!$("com-panel").hidden && !e.target.closest("#com-panel, #btn-com")) comPopover(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("com-panel").hidden) comPopover(false);
  });
  window.addEventListener("resize", () => !$("com-panel").hidden && comPlace());
  $("com-refresh").addEventListener("click", comRefresh);
  $("com-connect").addEventListener("click", comToggle);
  $("com-install").addEventListener("click", async () => {
    $("com-note").textContent = "Instalando el puerto COM virtual (acepta el permiso de administrador)…";
    const r = await api.comInstall();
    await comRefresh();
    if (r.error) $("com-note").textContent = r.error;
  });
  api.onComClosed?.((path) => comShow(null, `Se cerró ${path}.`));
  $("btn-view-clear").addEventListener("click", () => {
    if (state.view === "console") consoleClear();
    else if (state.view === "buses") resetBuses();
  });
  for (const b of document.querySelectorAll(".ptab"))
    b.addEventListener("click", () => {
      setView(b.dataset.view);
      setDockCollapsed(false);
    });
  state.serialTs = storeGet(TS_KEY) === "1";
  $("serial-ts").checked = state.serialTs;
  $("serial-ts").addEventListener("change", (e) => {
    state.serialTs = e.target.checked;
    storeSet(TS_KEY, state.serialTs ? "1" : "0");
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
  api.onIoBridgeStatus(iobShow);
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
  api.onMenu(async (cmd) => {
    if (typeof cmd !== "string") return;
    if (cmd === "new") loadSketch(await api.newSketch());
    else if (cmd === "open") {
      const s = await api.openDialog();
      if (s) loadSketch(s);
    } else if (cmd.startsWith("example:")) loadSketch(await api.openExample(cmd.slice(8)));
    else if (cmd === "save") saveSketch();
    else if (cmd === "newFile") promptNewFile();
    else if (cmd === "importFiles") importSketchFiles();
    else if (cmd === "format") autoFormat();
    else if (cmd === "undo") {
      if (document.body.dataset.tab === "schematic") window.JwsimScene?.undo?.();
      else editor?.trigger("menu", "undo");
    } else if (cmd === "redo") {
      if (document.body.dataset.tab === "schematic") window.JwsimScene?.redo?.();
      else editor?.trigger("menu", "redo");
    } else if (cmd === "duplicate") {
      if (document.body.dataset.tab === "schematic") window.JwsimScene?.duplicate?.();
      else editor?.trigger("menu", "editor.action.duplicateSelection");
    } else if (cmd === "delete") {
      if (document.body.dataset.tab === "schematic") window.JwsimScene?.removeSelected?.();
    }
    else if (cmd === "dock") $("sb-dock").click();
    else if (cmd.startsWith("tab:")) window.JwsimTabs?.select(cmd.slice(4));
    else if (cmd === "run") buildAndRun();
    else if (cmd === "pause") togglePause();
    else if (cmd === "stop") stopSim();
    else if (cmd === "openProject") openProject();
    else if (cmd === "saveProject") saveProjectFile();
    else if (cmd === "dbgToggle" && state.active && isCodeFile(state.active)) toggleBreakpoint(state.active, editor.getPosition().lineNumber);
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
      monacoRef.editor.defineTheme("jwsim-light", {
        base: "vs",
        inherit: true,
        rules: [],
        colors: { "editor.background": "#f5f7fa", "editorGutter.background": "#f5f7fa" },
      });
      editor = monacoRef.editor.create($("editor"), {
        theme: isDarkTheme() ? "jwsim-dark" : "jwsim-light",
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        // 4 espacios: el estilo de los ejemplos del package y del autoformato.
        tabSize: 4,
        insertSpaces: true,
        detectIndentation: false,
        glyphMargin: true,
        // Autocompletado propio (completion.js): sin la lista de palabras de
        // Monaco, que mezcla todo lo que aparece en el archivo.
        wordBasedSuggestions: "off",
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
      });
      api
        .apiCatalog()
        .then((catalog) => window.JwsimCompletion?.install(monacoRef, catalog, () => [...state.models].filter(([n]) => isCodeFile(n)).map(([, m]) => m)))
        .catch((err) => consoleWrite(`[jwsim] autocompletado no disponible: ${err.message}\n`, "sys"));
      // Autoformato también desde el menú contextual del editor ("Dar formato
      // al documento", Mayús+Alt+F). Ctrl+T llega por el menú Herramientas.
      monacoRef.languages.registerDocumentFormattingEditProvider("cpp", {
        provideDocumentFormattingEdits: async (model) => {
          try {
            const { text } = await formatModel(model);
            return [{ range: model.getFullModelRange(), text }];
          } catch (err) {
            consoleWrite(`[jwsim] autoformato: ${err.message}\n`, "sys");
            return [];
          }
        },
      });
      // Ctrl+T con el foco en el editor (el menú Herramientas también lo atiende).
      editor.addCommand(monacoRef.KeyMod.CtrlCmd | monacoRef.KeyCode.KeyT, () => autoFormat());
      // Clic en el margen: alterna un breakpoint en esa línea.
      editor.onMouseDown((e) => {
        if (e.target.type === monacoRef.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && state.active && isCodeFile(state.active)) {
          toggleBreakpoint(state.active, e.target.position.lineNumber);
        }
      });
      resolveInit();
    });
  });
}

// ------------------------------------------------------------- puente de E/S (OIP)
// Indicador de la barra de estado inferior con el estado del puente Modbus TCP
// (app/lib/io-bridge.mjs): oculta sin puente; gris esperando; verde con un
// cliente que pide (Open Industry Project u otro); ámbar si está conectado
// pero callado (Stop en OIP); rojo si el puerto no se pudo abrir.
function iobShow(st) {
  const el = $("iob-status");
  el.hidden = !st || st.state === "off";
  if (el.hidden) return;
  const oip = st.clients?.some((c) => c.kind === "oip");
  const others = (st.clients ?? []).filter((c) => c.kind !== "oip").length;
  const name = oip ? "OIP" : others ? "Modbus" : "OIP";
  const addr = st.host ? `${st.host}:${st.port}` : "";
  const label = {
    waiting: "OIP: esperando",
    connected: `${name} conectado`,
    quiet: `${name} en pausa`,
    error: "OIP: error",
  }[st.state] ?? "OIP";
  $("iob-label").textContent = label;
  el.classList.toggle("on", st.state === "connected");
  el.classList.toggle("quiet", st.state === "quiet");
  el.classList.toggle("error", st.state === "error");
  const who = (st.clients ?? []).map((c) => `${c.kind === "oip" ? "Open Industry Project" : c.kind === "modbus" ? "cliente Modbus" : "cliente"} (${c.remote})`).join(", ");
  el.title = {
    waiting: `Puente de E/S abierto en ${addr}. En OIP: PLC Controllers… → An external PLC → The simulator polls the PLC, ${addr}.`,
    connected: `Conectado en ${addr}: ${who}. Sensores %IX0.n = I0.n, actuadores %QX2.n = Q0.n.`,
    quiet: `Conectado en ${addr} pero sin pedidos desde hace más de 1,5 s: ${who}. ¿OIP está en Stop?`,
    error: st.message ?? "No se pudo abrir el puente de E/S.",
  }[st.state] ?? "";
}

// ------------------------------------------------------------- puerto COM virtual
// El instalador de Windows crea el par com0com COM20 ↔ COM21: el Sim abre
// COM20 y JW Serial (u otro programa) abre COM21.
const COM_DEFAULT = "COM20";
let comCurrent = null;

function comShow(current, note = "") {
  comCurrent = current;
  const on = !!current;
  $("com-label").textContent = on ? `${current.path} ↔ ${current.uart === 2 ? "RS-485" : "USB"}` : "Sin COM";
  $("btn-com").classList.toggle("on", on);
  $("btn-com").title = on
    ? `Conectado: ${current.path} unido al ${current.uart === 2 ? "RS-485" : "USB (Monitor serie)"} del JWPLC simulado. Clic para cambiar.`
    : "Une el USB o el RS-485 del JWPLC simulado con un puerto COM de la PC (JW Serial u otro programa)";
  $("com-connect").textContent = on ? "Desconectar" : "Conectar";
  $("com-port").disabled = on;
  $("com-uart").disabled = on;
  $("com-note").textContent = note || (on ? `Conectado: el otro programa abre el par de ${current.path}.` : "");
}

// Panel del COM: se abre bajo su botón de la barra superior.
function comPlace() {
  const r = $("btn-com").getBoundingClientRect();
  const panel = $("com-panel");
  panel.style.top = `${Math.round(r.bottom + 6)}px`;
  panel.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
}
async function comPopover(open) {
  $("com-panel").hidden = !open;
  $("btn-com").setAttribute("aria-expanded", String(open));
  if (!open) return;
  comPlace();
  await comRefresh();
}

async function comRefresh() {
  const { available, ports, current, canInstall } = await api.comList();
  $("com-install").hidden = !canInstall || ports.some((p) => p.path === COM_DEFAULT);
  const sel = $("com-port");
  const prev = sel.value || current?.path;
  sel.textContent = "";
  for (const p of ports) {
    const o = document.createElement("option");
    o.value = p.path;
    o.textContent = p.label;
    sel.appendChild(o);
  }
  if (prev && ports.some((p) => p.path === prev)) sel.value = prev;
  else if (ports.some((p) => p.path === COM_DEFAULT)) sel.value = COM_DEFAULT;
  if (current) $("com-uart").value = String(current.uart);
  $("com-connect").disabled = !available || (!current && !ports.length);
  comShow(current, !available ? "Puerto COM no disponible en esta instalación." : !ports.length ? "No hay puertos COM. En Windows, usa «Instalar COM20 ↔ COM21»." : "");
}

async function comToggle() {
  if (comCurrent) {
    const r = await api.comSet(null);
    return comShow(r.current);
  }
  const path = $("com-port").value;
  if (!path) return;
  const r = await api.comSet({ path, uart: Number($("com-uart").value) });
  comShow(r.current, r.error ?? "");
}

const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function storedTheme() {
  try {
    const v = localStorage.getItem("jwsim-theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
function isDarkTheme(mode = storedTheme()) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemDarkQuery.matches;
}
function syncThemeUi(mode) {
  const dark = isDarkTheme(mode);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = mode === "light" || mode === "dark" ? mode : "light dark";
  const btn = $("btn-theme");
  if (btn) {
    btn.innerHTML = `<span class="theme-ico" aria-hidden="true">${dark ? "☾" : "☀"}</span><span class="theme-lbl">${dark ? "Oscuro" : "Claro"}</span>`;
    btn.title = dark ? "Tema actual: oscuro (clic para cambiar a claro)" : "Tema actual: claro (clic para cambiar a oscuro)";
    btn.setAttribute("aria-label", btn.title);
  }
  monacoRef?.editor?.setTheme(dark ? "jwsim-dark" : "jwsim-light");
  window.dispatchEvent(new CustomEvent("jwsim:themechange", { detail: { theme: mode, dark } }));
}
async function setThemeMode(mode, { persist = true } = {}) {
  const next = mode === "light" || mode === "dark" ? mode : "system";
  try {
    if (next === "system") localStorage.removeItem("jwsim-theme");
    else localStorage.setItem("jwsim-theme", next);
  } catch {}
  syncThemeUi(next);
  if (persist) await api.setTheme?.(next);
}
function toggleThemeQuick() {
  const target = isDarkTheme() ? "light" : "dark";
  const matchesSystem = (target === "dark") === systemDarkQuery.matches;
  return setThemeMode(matchesSystem ? "system" : target);
}

// Ganchos para las pruebas E2E (abrir un proyecto sin el diálogo del SO).
window.jwsimTest = {
  getTheme: () => ({ theme: storedTheme(), dark: isDarkTheme() }),
  setTheme: (mode) => setThemeMode(mode),
  // Pantalla ampliada: abierta y ancho en píxeles físicos; modo de la TFT.
  tftZoom: () => ({
    open: !$("tft-zoom").hidden,
    px: Math.round($("tft-zoom-canvas").getBoundingClientRect().width * (window.devicePixelRatio || 1)),
    rendering: $("tft").style.imageRendering,
    tftPx: Math.round($("tft").getBoundingClientRect().width * (window.devicePixelRatio || 1)),
  }),
  autoFormat: () => autoFormat(),
  setActiveText: (text) => editor.getModel().setValue(text),
  activeText: () => editor.getModel().getValue(),
  comConnect: async (path, uart) => {
    await comRefresh();
    const r = await api.comSet(path ? { path, uart } : null);
    comShow(r.current, r.error ?? "");
    return r;
  },
  showAllBuses: (on) => showAllBuses(on),
  openProjectFile: async (file) => applyProject(await api.openProjectFile(file)),
  openSketchDir: async (dir) => loadSketch(await api.openExample(dir)),
  openExampleNamed: async (name) => loadSketch(await api.openExample(state.examples.find((e) => e.name === name).dir)),
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
  // Ejercicios (G9): abrir por la lista, reemplazar el código del .ino
  // principal y calificar con el botón.
  examples: () => state.examples ?? [],
  exercises: () => state.exercises ?? [],
  archs: () => state.archs ?? [],
  pickArch: (id) => window.openArchById(id),
  pickExercise: (id) => window.openExerciseById(id),
  setSource: (text) => state.models.get(state.sketch.name + ".ino")?.setValue(text),
  grade: () => gradeExercise(),
  sketchDir: () => state.sketch?.dir ?? null,
  // Archivos adicionales del sketch.
  fileNames: () => [...state.models.keys()],
  addFile: (name) => createSketchFile(name),
  deleteFile: (name) => deleteSketchFile(name, { ask: false }),
  showFile: (name) => showFile(name),
  language: () => editor.getModel()?.getLanguageId() ?? null,
};

async function main() {
  buildBoard();
  wireUi();
  $("btn-theme")?.addEventListener("click", () => toggleThemeQuick());
  systemDarkQuery.addEventListener("change", () => {
    if (storedTheme() === "system") syncThemeUi("system");
  });
  api.onThemeChanged?.(({ theme }) => setThemeMode(theme, { persist: false }));
  const pref = await api.getTheme?.().catch(() => null);
  if (pref?.theme) {
    try {
      if (pref.theme === "system") localStorage.removeItem("jwsim-theme");
      else localStorage.setItem("jwsim-theme", pref.theme);
    } catch {}
    syncThemeUi(pref.theme);
  } else {
    syncThemeUi(storedTheme());
  }
  setStatus("idle", "Detenido");
  const info = await api.info();
  state.packageRef = info.packageRef;
  // La versión del package va solo en la ayuda emergente del logo (antes era
  // un texto fijo en la cabecera de la placa y en la barra de estado).
  document.querySelector(".brand").title = `JWPLC Sim · package platform-jwplc ${info.packageRef} (${info.packageCommit})`;
  await initMonaco();
  renderWatch();
  clearDebugView();
  // Un package que no se puede usar no debe dejar la app muda: el error se
  // muestra en la consola y el resto arranca igual.
  const fail = (what, err) =>
    consoleWrite(`[jwsim] ${what}: ${String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}\n`, "fatal");
  try {
    state.examples = await populateExamples();
  } catch (err) {
    state.examples = [];
    fail("no se pudieron cargar los ejemplos del package", err);
  }
  try {
    await populateExercises();
  } catch (err) {
    fail("no se pudieron cargar los ejercicios", err);
  }
  try {
    await populateArchs();
  } catch (err) {
    fail("no se pudieron cargar las arquitecturas", err);
  }
  // Como Arduino IDE: arranca con un sketch nuevo (setup y loop vacíos).
  try {
    loadSketch(await api.newSketch());
  } catch (err) {
    fail("no se pudo crear el sketch nuevo", err);
  }
  const target = await api.takeOpenTarget();
  if (target) await openFromEditor(target);
  // Pantalla «Proyectos» (start.js), salvo si el OpenPLC Editor pidió un proyecto.
  window.JwsimStart?.onReady({ openedFromEditor: !!target });
}

main();
