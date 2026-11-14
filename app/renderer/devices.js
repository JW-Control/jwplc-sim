// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gestor de dispositivos propios (modo desarrollador, etapa A de
// docs/integration/PROPUESTA_MODELOS_PROPIOS.md): enlazar la carpeta de un
// dispositivo de escena del SDK sin pasar por el índice firmado, ver si
// cumple el contrato y la grilla de sus símbolos, y recargarlo sin reiniciar.
"use strict";

(() => {
  const api = window.jwsim;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clean = (err) => String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  const st = { data: null, busy: false, error: "", note: "" };

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
    box.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return box;
  }

  function item(d) {
    const status = !d.ok ? `<span class="dev-st bad" title="${d.loaded ? "El código carga; el símbolo con errores se reemplaza por el módulo genérico" : "El dispositivo no está en la paleta"}">✕ ${d.loaded ? "Con errores" : "No carga"}</span>` : d.warnings.length ? `<span class="dev-st warn">⚠ Con avisos</span>` : `<span class="dev-st ok">✓ Listo</span>`;
    const msgs = [...d.errors.map((m) => `<li class="bad">${esc(m)}</li>`), ...d.warnings.map((m) => `<li class="warn">${esc(m)}</li>`)].join("");
    return (
      `<li class="dev-item${d.ok ? "" : " broken"}" data-dir="${esc(d.dir)}">` +
      `<div class="dev-head"><b>${esc(d.name ?? "(sin nombre)")}</b>${d.type ? `<code>${esc(d.type)}@${esc(d.version)}</code>` : ""}${d.category ? `<span class="muted">${esc(d.category)}</span>` : ""}${status}</div>` +
      `<div class="dev-dir muted" title="${esc(d.dir)}">${esc(d.dir)}</div>` +
      (msgs ? `<ul class="dev-msgs">${msgs}</ul>` : "") +
      `<div class="dev-actions"><button class="link" data-act="reveal">Abrir carpeta</button><button class="link" data-act="unlink">Quitar</button></div></li>`
    );
  }

  function render() {
    const d = st.data;
    const local = d?.local ?? [];
    el().innerHTML =
      `<div class="start-card devmgr-card">` +
      `<header class="start-head"><span class="start-logo">JW</span><b>Dispositivos propios</b>` +
      `<button class="icon" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></header>` +
      `<div class="start-body">` +
      `<p class="devmgr-intro">Use en el simulador un dispositivo que está desarrollando, sin publicarlo: la carpeta con su <code>jwsim-device.json</code>, el módulo (<code>device.mjs</code>) y su <code>symbol.svg</code>. ` +
      `Guía en <code>docs/SDK.md</code>; punto de partida: <code>sdk/template/scene-device</code>.</p>` +
      `<p class="devmgr-warn">⚠ Un dispositivo ejecuta su propio código en esta computadora: agregue solo carpetas de confianza.</p>` +
      `<div class="devmgr-bar"><button class="primary" data-act="link" ${st.busy ? "disabled" : ""}>Agregar carpeta…</button>` +
      `<button data-act="reload" ${st.busy ? "disabled" : ""} title="Vuelve a leer el código y los símbolos de las carpetas, sin reiniciar">↻ Recargar</button>` +
      `<span class="muted">${esc(st.busy ? "Trabajando…" : st.note)}</span></div>` +
      (st.error ? `<p class="bad devmgr-err">${esc(st.error)}</p>` : "") +
      `<div class="start-sub">En desarrollo (${local.length})</div>` +
      (local.length ? `<ul class="dev-list">${local.map(item).join("")}</ul>` : `<p class="muted">Ninguno todavía. Agregue la carpeta de un dispositivo.</p>`) +
      `<div class="start-sub">Instalados del índice (${d?.installed?.length ?? 0})</div>` +
      (d?.installed?.length ? `<ul class="dev-simple">${d.installed.map((x) => `<li><b>${esc(x.name ?? x.type)}</b> <code>${esc(x.type)}@${esc(x.version)}</code> <span class="muted">${esc(x.kind)}</span></li>`).join("")}</ul>` : `<p class="muted">Ninguno (se instalan con <code>jwsim-cli device install autor/nombre</code>).</p>`) +
      `<p class="muted small">Incluidos en JWPLC Sim: ${d?.builtin ?? "—"} dispositivos.</p>` +
      `</div></div>`;
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
  }

  async function open() {
    el().hidden = false;
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

  api.onMenu((cmd) => cmd === "devices" && open());
  window.JwsimDevices = { open, close, link: (dir) => run(() => api.devicesLink(dir), "Agregado."), reload: () => run(() => api.devicesReload(), "Recargado."), state: () => st };
})();
