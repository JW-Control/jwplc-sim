// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Pantalla «Proyectos» y asistente de nuevo proyecto, como el OpenPLC Editor:
//   1. Tipo: Arduino (C++) u OpenPLC (IEC 61131-3).
//   2. Nombre y carpeta (en OpenPLC, también el intervalo de la tarea).
//   3. Lenguaje IEC: Ladder, ST, FBD, IL o SFC (solo OpenPLC).
// Un proyecto OpenPLC lo crea el OpenPLC Editor con su CLI (los mismos
// archivos que su asistente) y se programa en el editor: aquí se simula.
"use strict";

(() => {
  const api = window.jwsim;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const RECENT_KEY = "jwsim.recientes";
  const SHOW_KEY = "jwsim.inicio";
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
  // Programa abierto (const state de app.js, global del documento).
  // eslint-disable-next-line no-undef
  const current = () => (typeof state !== "undefined" ? state.sketch : null);
  const st = { view: "home", step: 1, kind: "openplc", name: "", parent: "", interval: "T#20ms", language: "ld", status: null, busy: false, error: "" };

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };
  const recents = () => store.get(RECENT_KEY, []).filter((r) => r && r.dir);
  function remember(sketch) {
    if (!sketch?.dir) return;
    // El sketch en blanco del arranque (sketch_AAAAMMDD) no cuenta.
    if (!sketch.openplc && /[\\/]sketch_\d{8}(_\d+)?$/.test(sketch.dir)) return;
    const list = recents().filter((r) => r.dir !== sketch.dir);
    list.unshift({ name: sketch.name, dir: sketch.dir, kind: sketch.openplc ? "openplc" : "arduino", at: Date.now() });
    store.set(RECENT_KEY, list.slice(0, 12));
  }

  // Cada proyecto que se abre: a recientes y, si es IEC, el botón del editor.
  const original = window.loadSketch;
  window.loadSketch = function (sketch) {
    original(sketch);
    if (sketch) remember(sketch);
    $("btn-open-editor").hidden = !sketch?.openplc;
  };

  function el() {
    let box = $("start");
    if (box) return box;
    box = document.createElement("div");
    box.id = "start";
    box.className = "start";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Proyectos");
    document.body.appendChild(box);
    box.addEventListener("click", onClick);
    box.addEventListener("input", onInput);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" && st.view === "wizard" && e.target.tagName === "INPUT") next();
    });
    return box;
  }

  // ------------------------------------------------------------ dibujo
  const nameError = () => (!st.name ? "Escriba un nombre." : NAME_RE.test(st.name) ? "" : "Use letras, números y _ (sin espacios ni tildes; no empiece con número).");
  const lastStep = () => (st.kind === "openplc" ? 3 : 2);

  function editorLine() {
    const s = st.status;
    if (!s) return `<span class="muted">Buscando el OpenPLC Editor…</span>`;
    return s.found
      ? `<span class="ok">● OpenPLC Editor: ${esc(s.label)}</span> <button class="link" data-act="choose">Cambiar…</button>`
      : `<span class="bad">● No se encontró el OpenPLC Editor (JWPLC Edition).</span> <button class="link" data-act="choose">Ubicar el OpenPLC Editor…</button>`;
  }

  function home() {
    const list = recents();
    return (
      `<div class="start-home">` +
      `<div class="start-actions">` +
      `<button class="start-big primary" data-act="new"><b>Nuevo proyecto</b><span>Arduino (C++) u OpenPLC (Ladder, ST, FBD…)</span></button>` +
      `<button class="start-big" data-act="open"><b>Abrir…</b><span>Un sketch (.ino) o un proyecto del OpenPLC Editor (project.json)</span></button>` +
      `<button class="start-big" data-act="openJwsim"><b>Abrir proyecto JWPLC Sim…</b><span>Escena, simulación y programa (.jwsim)</span></button>` +
      `<button class="start-big" data-act="blank"><b>Sketch en blanco</b><span>Seguir con un sketch nuevo, como Arduino IDE</span></button>` +
      `</div>` +
      `<div class="start-recent"><div class="start-sub">Recientes</div>` +
      (list.length
        ? `<ul>${list.map((r, i) => `<li><button data-act="recent" data-i="${i}"><span class="tag ${r.kind}">${r.kind === "openplc" ? "IEC" : "C++"}</span><b>${esc(r.name)}</b><small>${esc(r.dir)}</small></button></li>`).join("")}</ul>`
        : `<p class="muted">Los proyectos que cree o abra aparecen aquí.</p>`) +
      `</div></div>`
    );
  }

  function wizard() {
    const steps = ["Tipo", "Nombre", ...(st.kind === "openplc" ? ["Lenguaje"] : [])];
    let body = "";
    if (st.step === 1) {
      body =
        `<p class="start-q">¿Qué tipo de proyecto va a crear?</p><div class="start-choices">` +
        `<button class="choice${st.kind === "arduino" ? " on" : ""}" data-act="kind" data-v="arduino"><b>Arduino</b><span>C++ con las librerías del JWPLC Basic. Se programa aquí mismo.</span></button>` +
        `<button class="choice${st.kind === "openplc" ? " on" : ""}" data-act="kind" data-v="openplc"><b>OpenPLC</b><span>Lenguajes IEC 61131-3. Se programa en el OpenPLC Editor y se simula aquí.</span></button>` +
        `</div>` +
        (st.kind === "openplc" ? `<p class="start-editor">${editorLine()}</p>` : "");
    } else if (st.step === 2) {
      const err = st.name ? nameError() : "";
      body =
        `<label class="start-field"><span>Nombre del proyecto</span><input id="start-name" value="${esc(st.name)}" spellcheck="false" placeholder="marcha_parada" autocomplete="off"/></label>` +
        (err ? `<p class="bad small">${esc(err)}</p>` : "") +
        `<label class="start-field"><span>Carpeta</span><span class="start-path"><input id="start-parent" value="${esc(st.parent)}" spellcheck="false"/><button data-act="pick">Elegir…</button></span></label>` +
        `<p class="muted small">Se crea la carpeta <code>${esc(st.parent)}${st.parent && !/[\\/]$/.test(st.parent) ? "\\" : ""}${esc(st.name || "nombre")}</code>.</p>` +
        (st.kind === "openplc"
          ? `<label class="start-field"><span>Intervalo de la tarea</span><input id="start-interval" value="${esc(st.interval)}" spellcheck="false" placeholder="T#20ms"/></label>`
          : "");
    } else {
      const langs = st.status?.languages ?? [];
      body =
        `<p class="start-q">Elija el lenguaje del programa principal</p><div class="start-langs">` +
        langs.map((l) => `<button class="choice${st.language === l.id ? " on" : ""}" data-act="lang" data-v="${esc(l.id)}"><b>${esc(l.name)}</b><span>${esc(l.hint)}</span></button>`).join("") +
        `</div><p class="start-editor">${editorLine()}</p>`;
    }
    return (
      `<ol class="start-steps">${steps.map((s, i) => `<li class="${i + 1 === st.step ? "on" : i + 1 < st.step ? "done" : ""}">${i + 1}. ${esc(s)}</li>`).join("")}</ol>` +
      `<div class="start-step">${body}</div>` +
      (st.error ? `<p class="bad start-error">${esc(st.error)}</p>` : "") +
      `<div class="start-nav"><button data-act="back">${st.step === 1 ? "Cancelar" : "Atrás"}</button>` +
      `<button class="primary" data-act="next" ${st.busy || !canNext() ? "disabled" : ""}>${st.busy ? (st.kind === "openplc" ? "Creando con el OpenPLC Editor…" : "Creando…") : st.step === lastStep() ? "Crear proyecto" : "Siguiente"}</button></div>`
    );
  }

  function canNext() {
    if (st.step === 1) return st.kind === "arduino" || !!st.status?.found;
    if (st.step === 2) return !nameError() && !!st.parent && (st.kind !== "openplc" || /^T#\d+(\.\d+)?(ms|s)$/i.test(st.interval));
    return !!st.language;
  }

  function render() {
    const box = el();
    const focus = document.activeElement?.id;
    const caret = document.activeElement?.selectionStart;
    box.innerHTML =
      `<div class="start-card">` +
      `<header class="start-head"><span class="start-logo">JW</span><b>${st.view === "home" ? "Proyectos" : "Nuevo proyecto"}</b>` +
      `<button class="icon" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></header>` +
      `<div class="start-body">${st.view === "home" ? home() : wizard()}</div>` +
      `<footer class="start-foot"><label><input type="checkbox" id="start-show" ${store.get(SHOW_KEY, true) ? "checked" : ""}/> Mostrar al iniciar</label>` +
      `<span class="muted small">Ejemplos y ejercicios: en la barra de arriba.</span></footer></div>`;
    if (focus && $(focus)) {
      $(focus).focus();
      if (caret !== undefined && $(focus).setSelectionRange) $(focus).setSelectionRange(caret, caret);
    }
  }

  // ------------------------------------------------------------ acciones
  async function refreshStatus() {
    try {
      st.status = await api.openplcStatus();
      if (!st.parent) st.parent = st.status.workspace;
    } catch {
      st.status = { found: false, languages: [] };
    }
    if (!$("start")?.hidden) render();
  }

  function open(view = "home") {
    st.view = view;
    st.step = 1;
    st.error = "";
    st.busy = false;
    el().hidden = false;
    render();
    refreshStatus();
  }
  function close() {
    if (st.busy) return;
    el().hidden = true;
  }

  async function next() {
    if (!canNext() || st.busy) return;
    if (st.step < lastStep()) {
      st.step++;
      st.error = "";
      render();
      if (st.step === 2) setTimeout(() => $("start-name")?.focus(), 0);
      return;
    }
    st.busy = true;
    st.error = "";
    render();
    try {
      if (st.kind === "arduino") {
        const sketch = await api.createArduino(st.name, st.parent);
        window.loadSketch(sketch);
        st.busy = false;
        close();
        return;
      }
      const sketch = await api.createOpenPlc({ name: st.name, parent: st.parent, language: st.language, interval: st.interval });
      window.loadSketch(sketch);
      st.busy = false;
      close();
      window.consoleWrite?.(`[jwsim] proyecto OpenPLC «${sketch.name}» creado en ${sketch.dir}\n`, "sys");
      await openEditor(sketch.dir);
    } catch (err) {
      st.busy = false;
      st.error = String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      render();
    }
  }

  async function openEditor(dir) {
    try {
      const label = await api.openplcOpenInEditor(dir);
      window.consoleWrite?.(`[jwsim] abriendo el proyecto en el OpenPLC Editor (${label}); al guardar allí, se recompila aquí\n`, "sys");
    } catch (err) {
      window.consoleWrite?.(`[jwsim] ${String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}\n`, "fatal");
    }
  }

  async function openRecent(i) {
    const r = recents()[i];
    if (!r) return;
    try {
      window.loadSketch(r.kind === "openplc" ? await api.openPlcProject(r.dir) : await api.openDir(r.dir));
      close();
    } catch (err) {
      store.set(RECENT_KEY, recents().filter((x) => x.dir !== r.dir));
      window.consoleWrite?.(`[jwsim] ${String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}\n`, "fatal");
      render();
    }
  }

  async function onClick(e) {
    if (e.target === el()) return;
    const b = e.target.closest("[data-act]");
    if (e.target.id === "start-show") store.set(SHOW_KEY, e.target.checked);
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "close") close();
    else if (act === "new") open("wizard");
    else if (act === "blank") close();
    else if (act === "open") {
      close();
      $("btn-open").click();
    } else if (act === "openJwsim") {
      close();
      window.openProject?.();
    } else if (act === "recent") openRecent(Number(b.dataset.i));
    else if (act === "kind") {
      st.kind = b.dataset.v;
      render();
    } else if (act === "lang") {
      st.language = b.dataset.v;
      render();
    } else if (act === "pick") {
      const dir = await api.pickFolder(st.parent);
      if (dir) st.parent = dir;
      render();
    } else if (act === "choose") {
      st.status = await api.openplcChoose();
      render();
    } else if (act === "back") {
      if (st.step === 1) st.view = "home";
      else st.step--;
      st.error = "";
      render();
    } else if (act === "next") next();
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === "start-name") st.name = t.value.trim();
    else if (t.id === "start-parent") st.parent = t.value.trim();
    else if (t.id === "start-interval") st.interval = t.value.trim();
    else return;
    render();
  }

  // ------------------------------------------------------------ enganches
  $("btn-projects").addEventListener("click", () => open("home"));
  $("btn-open-editor").addEventListener("click", () => current()?.openplc && openEditor(current().dir));
  api.onMenu((cmd) => {
    if (cmd === "startScreen") open("home");
    else if (cmd === "newProject") open("wizard");
    else if (cmd === "openInEditor") {
      if (current()?.openplc) openEditor(current().dir);
      else window.consoleWrite?.("[jwsim] el programa abierto no es un proyecto OpenPLC\n", "sys");
    }
  });

  window.JwsimStart = {
    open,
    close,
    /** app.js al terminar de arrancar: la pantalla Proyectos, salvo si vino un proyecto del editor. */
    async onReady({ openedFromEditor }) {
      if (openedFromEditor || !store.get(SHOW_KEY, true)) return;
      if (await api.startScreen()) open("home");
    },
    state: () => ({ ...st, hidden: el().hidden }),
  };
})();
