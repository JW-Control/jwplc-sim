// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gestor de dispositivos propios (docs/integration/PROPUESTA_MODELOS_PROPIOS.md):
//   etapa A: enlazar la carpeta de un dispositivo de escena del SDK sin el
//            índice firmado, ver si cumple el contrato y la grilla de sus
//            símbolos, y recargarlo sin reiniciar;
//   etapa B: «Nuevo dispositivo», que genera la carpeta a partir de un bloque
//            de comportamiento (cli/lib/device-gen.mjs) y la enlaza.
"use strict";

(() => {
  const api = window.jwsim;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clean = (err) => String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  const st = { data: null, busy: false, error: "", note: "", view: "list", nb: null };

  // Opciones de cada bloque en el formulario del asistente.
  const FIELDS = {
    rating: { label: "Tensión de la bobina o carga", type: "select", options: [["24VDC", "24 VDC"], ["230VAC", "230 VAC"]] },
    color: { label: "Color", type: "select", options: [["verde", "Verde"], ["rojo", "Rojo"], ["amarillo", "Amarillo"], ["azul", "Azul"], ["blanco", "Blanco"]] },
    mode: { label: "Tipo", type: "select", options: [["momentary", "Pulsador (vuelve solo)"], ["toggle", "Selector (queda en su posición)"]] },
    no: { label: "Contactos NA", type: "number", min: 0, max: 4 },
    nc: { label: "Contactos NC", type: "number", min: 0, max: 4 },
    source: { label: "Ejemplo de lectura (se elige al colocarlo)", type: "text", placeholder: "T1.nivelPct" },
    threshold: { label: "Umbral", type: "number" },
    hysteresis: { label: "Histéresis", type: "number", min: 0 },
    delayMs: { label: "Tiempo (ms)", type: "number", min: 1 },
    upPerS: { label: "Sube (%/s)", type: "number", min: 0 },
    downPerS: { label: "Baja (%/s)", type: "number", min: 0 },
    modelo: { label: "Modelo (orden)", type: "select", options: [] },
    tau: { label: "τ1, constante de tiempo (s)", type: "number", min: 0.001 },
    tau2: { label: "τ2 (s)", type: "number", min: 0.001 },
    tau3: { label: "τ3 (s)", type: "number", min: 0.001 },
    tau4: { label: "τ4 (s)", type: "number", min: 0.001 },
    wn: { label: "ωn, frecuencia natural (rad/s)", type: "number", min: 0 },
    zeta: { label: "ζ, amortiguamiento (< 1 oscila)", type: "number", min: 0 },
    gain: { label: "K, ganancia (°C en la térmica; % en la planta)", type: "number" },
    theta: { label: "θ, tiempo muerto (s)", type: "number", min: 0 },
    ambient: { label: "Temperatura ambiente (°C)", type: "number" },
    tmax: { label: "Termostato de seguridad (°C)", type: "number" },
    stepMs: { label: "Paso de discretización Ts (ms)", type: "number", min: 10, max: 10000 },
    analogIn: { label: "Entrada analógica: consigna 0-10 V (AI+ AI-)", type: "checkbox" },
    pt100: { label: "Salida analógica: sonda PT100 (PT1 PT2 PT3)", type: "checkbox" },
    thermostat: { label: "Salida digital: termostato de seguridad (TS1 TS2)", type: "checkbox" },
  };
  const DEFAULTS = {
    rating: "24VDC", color: "verde", mode: "momentary", no: 1, nc: 0, source: "", threshold: 50, hysteresis: 5, delayMs: 3000, upPerS: 10, downPerS: 5,
    tau: 600, gain: 180, theta: 20, ambient: 25, tmax: 220, stepMs: 500, analogIn: true, pt100: true, thermostat: true,
  };

  function el() {
    let box = $("devmgr");
    if (box) return box;
    box = document.createElement("div");
    box.id = "devmgr";
    box.className = "start";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Dispositivos propios");
    document.body.appendChild(box);
    box.addEventListener("click", onClick);
    // Formulario del asistente: cada cambio actualiza la vista previa.
    box.addEventListener("input", (e) => {
      const k = e.target.dataset?.f;
      if (!k || !st.nb?.spec) return;
      if (k === "parent") st.nb.parent = e.target.value.trim();
      else st.nb.spec[k] = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value;
      // Otro orden: otros campos (τ2…τ4, ωn y ζ, o la rampa).
      if (k === "modelo") render();
      refreshPreview();
    });
    box.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return box;
  }

  // ------------------------------------------------------------ lista
  function item(d) {
    const status = !d.ok
      ? `<span class="dev-st bad" title="${d.loaded ? "El código carga; el símbolo con errores se reemplaza por el módulo genérico" : "El dispositivo no está en la paleta"}">✕ ${d.loaded ? "Con errores" : "No carga"}</span>`
      : d.warnings.length
        ? `<span class="dev-st warn">⚠ Con avisos</span>`
        : `<span class="dev-st ok">✓ Listo</span>`;
    const msgs = [...d.errors.map((m) => `<li class="bad">${esc(m)}</li>`), ...d.warnings.map((m) => `<li class="warn">${esc(m)}</li>`)].join("");
    return (
      `<li class="dev-item${d.ok ? "" : " broken"}" data-dir="${esc(d.dir)}">` +
      `<div class="dev-head"><b>${esc(d.name ?? "(sin nombre)")}</b>${d.type ? `<code>${esc(d.type)}@${esc(d.version)}</code>` : ""}${d.category ? `<span class="muted">${esc(d.category)}</span>` : ""}${status}</div>` +
      `<div class="dev-dir muted" title="${esc(d.dir)}">${esc(d.dir)}</div>` +
      (msgs ? `<ul class="dev-msgs">${msgs}</ul>` : "") +
      `<div class="dev-actions"><button class="link" data-act="reveal">Abrir carpeta</button><button class="link" data-act="unlink">Quitar</button></div></li>`
    );
  }

  function listView() {
    const d = st.data;
    const local = d?.local ?? [];
    return (
      `<p class="devmgr-intro">Use en el simulador un dispositivo que está desarrollando, sin publicarlo: la carpeta con su <code>jwsim-device.json</code>, el módulo (<code>device.mjs</code>) y su <code>symbol.svg</code>. ` +
      `<b>Nuevo dispositivo…</b> la genera a partir de un comportamiento. Guía en <code>docs/SDK.md</code>.</p>` +
      `<p class="devmgr-warn">⚠ Un dispositivo ejecuta su propio código en esta computadora: agregue solo carpetas de confianza.</p>` +
      `<div class="devmgr-bar"><button class="primary" data-act="new" ${st.busy ? "disabled" : ""}>Nuevo dispositivo…</button><button data-act="comped" title="Componente propio con tu dibujo SVG, sus bornes, su modelo por bloques y Modbus, sin programar">Editor de componentes…</button>` +
      `<button data-act="link" ${st.busy ? "disabled" : ""}>Agregar carpeta…</button>` +
      `<button data-act="reload" ${st.busy ? "disabled" : ""} title="Vuelve a leer el código y los símbolos de las carpetas, sin reiniciar">↻ Recargar</button>` +
      `<span class="muted devmgr-note">${esc(st.busy ? "Trabajando…" : st.note)}</span></div>` +
      (st.error ? `<p class="bad devmgr-err">${esc(st.error)}</p>` : "") +
      `<div class="start-sub">En desarrollo (${local.length})</div>` +
      (local.length ? `<ul class="dev-list">${local.map(item).join("")}</ul>` : `<p class="muted">Ninguno todavía. Cree uno o agregue la carpeta de un dispositivo.</p>`) +
      `<div class="start-sub">Instalados del índice (${d?.installed?.length ?? 0})</div>` +
      (d?.installed?.length
        ? `<ul class="dev-simple">${d.installed.map((x) => `<li><b>${esc(x.name ?? x.type)}</b> <code>${esc(x.type)}@${esc(x.version)}</code> <span class="muted">${esc(x.kind)}</span></li>`).join("")}</ul>`
        : `<p class="muted">Ninguno (se instalan con <code>jwsim-cli device install autor/nombre</code>).</p>`) +
      `<p class="muted small">Incluidos en JWPLC Sim: ${d?.builtin ?? "—"} dispositivos.</p>`
    );
  }

  // ------------------------------------------------------------ nuevo dispositivo
  function wizardView() {
    const nb = st.nb;
    if (!nb.behaviors) return `<p class="muted">Cargando…</p>`;
    if (nb.step === 1) {
      return (
        `<p class="devmgr-intro">Elija qué hace el dispositivo. Se genera una carpeta normal del SDK (código, símbolo con los bornes en la grilla y prueba) que después puede editar a mano.</p>` +
        `<div class="nb-blocks">${nb.behaviors.map((b) => `<button class="choice" data-act="nb-block" data-v="${esc(b.id)}"><b>${esc(b.name)}</b><span>${esc(b.hint)}</span></button>`).join("")}</div>` +
        `<div class="start-nav"><button data-act="nb-cancel">Volver</button></div>`
      );
    }
    const b = nb.behaviors.find((x) => x.id === nb.spec.behavior);
    const f = (label, input) => `<label class="start-field"><span>${esc(label)}</span>${input}</label>`;
    const text = (id, ph = "") => `<input data-f="${id}" value="${esc(nb.spec[id] ?? "")}" placeholder="${esc(ph)}" spellcheck="false"/>`;
    const opt = (id) => {
      const F = FIELDS[id];
      if (!visible(id)) return "";
      if (id === "modelo") {
        const opts = [...(nb.spec.behavior === "planta" ? [nb.ramp] : []), ...nb.models];
        return f(F.label, `<select data-f="modelo">${opts.map((v) => `<option value="${esc(v)}" ${nb.spec.modelo === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`) +
          `<p class="muted small nb-model-note">${esc(modelNote(nb.spec.modelo))}</p>`;
      }
      if (F.type === "checkbox") return `<label class="start-check"><input data-f="${id}" type="checkbox" ${nb.spec[id] ? "checked" : ""}/> ${esc(F.label)}</label>`;
      if (F.type === "select") return f(F.label, `<select data-f="${id}">${F.options.map(([v, l]) => `<option value="${esc(v)}" ${String(nb.spec[id]) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`);
      const lim = `${F.min !== undefined ? ` min="${F.min}"` : ""}${F.max !== undefined ? ` max="${F.max}"` : ""}`;
      return f(F.label, `<input data-f="${id}" type="${F.type}" value="${esc(nb.spec[id])}"${lim} placeholder="${esc(F.placeholder ?? "")}" spellcheck="false"/>`);
    };
    return (
      (st.error ? `<p class="bad devmgr-err">${esc(st.error)}</p>` : "") +
      `<div class="nb-form"><div class="nb-fields">` +
      `<div class="start-sub">${esc(b.name)}</div>` +
      f("Autor (minúsculas)", text("author", "utec")) +
      f("Nombre (minúsculas y guiones)", text("name", "rele-dos-contactos")) +
      f("Nombre en la paleta", text("title", b.name)) +
      f("Categoría de la paleta", text("category", b.category)) +
      b.options.map(opt).join("") +
      `<label class="start-field"><span>Carpeta</span><span class="start-path"><input data-f="parent" value="${esc(nb.parent)}" spellcheck="false"/><button data-act="nb-pick">Elegir…</button></span></label>` +
      `</div><div class="nb-preview" id="nb-preview">${previewHtml()}</div></div>` +
      `<div class="start-nav"><button data-act="nb-back">Atrás</button>` +
      `<button class="primary" data-act="nb-create" ${nb.busy || !nb.preview?.ok ? "disabled" : ""}>${nb.busy ? "Creando…" : "Crear y agregar a la paleta"}</button></div>`
    );
  }

  // Qué campos del modelo se ven según el orden elegido.
  function visible(id) {
    const m = st.nb.spec.modelo;
    const ramp = m === st.nb.ramp;
    const osc = m === "2.º orden oscilatorio";
    const order = st.nb.models.indexOf(m) + 1;
    if (["upPerS", "downPerS"].includes(id)) return ramp;
    if (["gain", "theta", "stepMs"].includes(id)) return !ramp;
    if (id === "tau") return !ramp && !osc;
    if (id === "tau2") return !ramp && !osc && order >= 2;
    if (id === "tau3") return !ramp && !osc && order >= 3;
    if (id === "tau4") return !ramp && !osc && order >= 4;
    if (["wn", "zeta"].includes(id)) return osc;
    return true;
  }
  function modelNote(m) {
    if (m === st.nb.ramp) return "Sube y baja a velocidad fija entre 0 y 100 % (integrador con límites).";
    if (m === "2.º orden oscilatorio") return "G(s) = K·ωn²·e^(−θs) / (s² + 2ζωn·s + ωn²): con ζ < 1 oscila y tiene sobrepico.";
    const n = st.nb.models.indexOf(m) + 1;
    const den = Array.from({ length: n }, (_, i) => `(τ${i + 1}s + 1)`).join("");
    return `G(s) = K·e^(−θs) / ${den}: discretizado exacto con el paso Ts. Se puede cambiar después en Propiedades.`;
  }

  function previewHtml() {
    const p = st.nb?.preview;
    if (!p) return `<p class="muted">Vista previa…</p>`;
    if (!p.ok) return `<p class="bad">${esc(p.error)}</p>`;
    // El SVG lo genera el propio simulador (cli/lib/device-gen.mjs) con datos escapados.
    const where = [p.top.length ? `arriba: <b>${p.top.map(esc).join(" ")}</b>` : "", p.bottom.length ? `abajo: <b>${p.bottom.map(esc).join(" ")}</b>` : ""].filter(Boolean).join(" · ");
    return (
      `<div class="nb-svg">${p.svg}</div>` +
      `<p class="muted small"><code>${esc(p.type)}</code> · ${p.w} × ${p.h} px</p>` +
      `<p class="small">${where ? `Bornes en la grilla de 20 px · ${where}` : "Sin bornes: equipo de planta (lo mueve lo que lee; los sensores lo leen)."}</p>`
    );
  }

  let previewTimer = 0;
  function refreshPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      st.nb.preview = await api.devicesPreview(st.nb.spec);
      const box = $("nb-preview");
      if (box) box.innerHTML = previewHtml();
      const btn = el().querySelector('[data-act="nb-create"]');
      if (btn) btn.disabled = st.nb.busy || !st.nb.preview?.ok;
    }, 120);
  }

  async function openWizard() {
    st.view = "new";
    st.error = "";
    st.nb = { step: 1, behaviors: null, parent: "", spec: null, preview: null, busy: false };
    render();
    const r = await api.devicesBehaviors();
    st.nb.behaviors = r.behaviors;
    st.nb.models = r.models;
    st.nb.ramp = r.ramp;
    st.nb.parent = r.parent;
    render();
  }

  async function create() {
    const nb = st.nb;
    nb.busy = true;
    st.error = "";
    render();
    try {
      const r = await api.devicesCreate(nb.spec, nb.parent);
      st.data = r.state;
      await window.JwsimScene?.reloadDevices?.();
      st.view = "list";
      st.note = `Creado ${r.type} en ${r.dir}: ya está en la paleta Equipos.`;
    } catch (err) {
      st.error = clean(err);
    }
    nb.busy = false;
    render();
  }

  // ------------------------------------------------------------ marco
  function render() {
    const title = st.view === "new" ? "Nuevo dispositivo" : "Dispositivos propios";
    el().innerHTML =
      `<div class="start-card devmgr-card">` +
      `<header class="start-head"><img class="app-logo" src="../icon/icon.svg" alt="" width="24" height="24"/><b>${title}</b>` +
      `<button class="icon" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></header>` +
      `<div class="start-body">${st.view === "new" ? wizardView() : listView()}</div></div>`;
  }

  async function run(fn, note) {
    st.busy = true;
    st.error = "";
    render();
    try {
      const data = await fn();
      if (data) {
        st.data = data;
        await window.JwsimScene?.reloadDevices?.();
        st.note = note;
      }
    } catch (err) {
      st.error = clean(err);
    }
    st.busy = false;
    render();
  }

  async function onClick(e) {
    if (e.target === el()) return close();
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const dir = b.closest("[data-dir]")?.dataset.dir;
    const act = b.dataset.act;
    if (act === "close") close();
    else if (act === "link") run(() => api.devicesLink(), "Agregado. Ya está en la paleta Equipos.");
    else if (act === "reload") run(() => api.devicesReload(), `Recargado a las ${new Date().toLocaleTimeString()}.`);
    else if (act === "unlink") run(() => api.devicesUnlink(dir), "Quitado.");
    else if (act === "reveal") api.devicesReveal(dir);
    else if (act === "new") openWizard();
    else if (act === "comped") {
      close();
      window.JwsimComponentEditor?.open();
    }
    else if (act === "nb-cancel") {
      st.view = "list";
      render();
    } else if (act === "nb-block") {
      const beh = st.nb.behaviors.find((x) => x.id === b.dataset.v);
      const plant = beh.id === "planta";
      st.nb.spec = {
        behavior: beh.id, author: st.nb.spec?.author ?? "", name: "", title: "", category: "", ...DEFAULTS, nc: beh.id === "rele" ? 1 : 0,
        // Valores por defecto del modelo según el bloque (como en device-gen.mjs).
        modelo: plant ? st.nb.ramp : st.nb.models[0], gain: plant ? 100 : 180, theta: plant ? 0 : 20,
        tau: plant ? 10 : 600, tau2: plant ? 5 : 120, tau3: plant ? 3 : 60, tau4: plant ? 2 : 30, wn: plant ? 0.5 : 0.02, zeta: 0.3,
      };
      st.nb.step = 2;
      st.nb.preview = null;
      render();
      refreshPreview();
    } else if (act === "nb-back") {
      st.nb.step = 1;
      render();
    } else if (act === "nb-pick") {
      const picked = await api.devicesPickParent(st.nb.parent);
      if (picked) {
        st.nb.parent = picked;
        render();
      }
    } else if (act === "nb-create") create();
  }

  async function open() {
    el().hidden = false;
    st.view = "list";
    st.error = "";
    st.note = "";
    render();
    try {
      st.data = await api.devicesList();
    } catch (err) {
      st.error = clean(err);
    }
    render();
  }
  function close() {
    el().hidden = true;
  }

  api.onMenu((cmd) => {
    if (cmd === "devices") open();
    else if (cmd === "newDevice") open().then(openWizard);
  });
  window.JwsimDevices = {
    open,
    close,
    newDevice: () => open().then(openWizard),
    link: (dir) => run(() => api.devicesLink(dir), "Agregado."),
    reload: () => run(() => api.devicesReload(), "Recargado."),
    state: () => st,
  };
})();
