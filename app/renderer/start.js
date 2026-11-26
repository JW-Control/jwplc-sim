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
  // Ruta elegida: «cpp» (Curso JWPLC Basic en C++ y retos) o «iec» (IEC 61131-3).
  const TRACK_KEY = "jwsim.ruta";
  const readTrack = () => {
    try {
      return localStorage.getItem(TRACK_KEY) === "iec" ? "iec" : "cpp";
    } catch {
      return "cpp";
    }
  };
  const st = { track: readTrack(), learn: null, view: "home", step: 1, kind: "openplc", name: "", parent: "", interval: "T#20ms", language: "ld", status: null, busy: false, error: "" };

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

  // ------------------------------------------------------------ inicio
  // Pantalla Inicio a toda la ventana: accesos (archivo, componentes,
  // aprender), «Empieza aquí» con la ruta de aprendizaje, el progreso, la
  // vitrina de arquitecturas y los recientes. La ruta junta el Curso JWPLC
  // Basic (librería JWPLC_Aprende, cli/lib/aprende.mjs) con los retos por nivel
  // (app/lib/learning.mjs).
  const ICONS = {
    new: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>',
    open: '<path d="M3 7h6l2 2h10v10H3z"/><path d="M3 11h18"/>',
    jwsim: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 14l3-4 3 3 4-5"/><path d="M8 21h8"/>',
    blank: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    devices: '<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M9 16h6"/>',
    comped: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    route: '<path d="M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
    archs: '<path d="M3 21V9l6-4v16"/><path d="M9 21V5l12 4v12"/><path d="M13 12h4M13 16h4"/>',
    examples: '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/><path d="M6 9h3M15 9h3M6 12h3M15 12h3"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    lesson: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    motor: '<rect x="4" y="7" width="12" height="10" rx="2"/><path d="M16 12h4M8 7V5h4v2"/><circle cx="10" cy="12" r="2"/>',
    seq: '<path d="M4 6h5v5H4zM15 13h5v5h-5z"/><path d="M9 8.5h3v7h3"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20h4"/>',
    lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 016 0v3"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
  };
  const icon = (k, cls = "") => `<svg class="ini-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] ?? ""}</svg>`;
  const LEVEL_DESC = {
    1: "Lo básico de todo tablero: marcha y parada, inversión de giro y tiempos sin bloquear el programa.",
    2: "Procesos con sensores: histéresis, máquinas de estado, secuencias temporizadas y contadores.",
    3: "Alarmas, procesos continuos y neumática con vigilancia por tiempo.",
  };
  const TIER_ICON = ["lesson", "clock", "motor", "seq", "bell"];

  /** La ruta completa: unidades del curso y después los retos por nivel. */
  function tiers() {
    const out = [];
    if (st.track === "iec") {
      // Ruta IEC 61131-3: cada lección en ST, Ladder o FBD con el mismo banco.
      for (const u of st.courseIec ?? []) {
        const items = u.lessons.map((l) => ({ kind: "lesson", id: l.id, title: l.title, state: st.lessons?.[l.id] ? "done" : "open", lesson: l }));
        out.push({ key: `i${u.unit}`, kind: "unit", tag: `Unidad ${u.unit}`, name: u.name, open: true, items, desc: `La misma práctica en texto estructurado (ST), Ladder (LD) o diagrama de bloques (FBD): elige el lenguaje al abrirla. Se programa en el OpenPLC Editor.` });
      }
      return numbered(out);
    }
    for (const u of st.course ?? []) {
      const items = u.lessons.map((l) => ({ kind: "lesson", id: l.id, title: l.title, state: st.lessons?.[l.id] ? "done" : "open", lesson: l }));
      out.push({ key: `u${u.unit}`, kind: "unit", tag: `Unidad ${u.unit}`, name: u.name, open: true, items, desc: `Lecciones del Curso JWPLC Basic: se abren como ejemplo y se prueban en el simulador.` });
    }
    for (const lv of st.learn?.levels ?? []) {
      out.push({ key: `n${lv.level}`, kind: "level", tag: `Retos · Nivel ${lv.level}`, name: lv.name, open: lv.open, items: lv.items.map((x) => ({ ...x, kind: "reto" })), desc: LEVEL_DESC[lv.level] ?? "" });
    }
    return numbered(out);
  }
  function numbered(out) {
    out.forEach((t, i) => {
      t.n = i + 1;
      t.icon = TIER_ICON[i % TIER_ICON.length];
      t.done = t.items.filter((x) => x.state === "done").length;
      t.total = t.items.length;
    });
    return out;
  }
  /** Encabezado de Inicio según la ruta elegida. */
  const HERO = {
    cpp: {
      eyebrow: "Ruta C++ · Curso JWPLC Basic",
      title: "Empieza aquí",
      lead: "<b>Programa un PLC en C++</b>, como en Arduino IDE, y después resuelve retos con tableros, motores y neumática.",
    },
    iec: {
      eyebrow: "Ruta PLC · IEC 61131-3",
      title: "Como en la industria",
      lead: "<b>Ladder, ST y FBD</b>: los lenguajes IEC 61131-3 de cualquier PLC industrial, en el OpenPLC Editor.",
    },
  };
  /** Selector de ruta: C++ o IEC 61131-3. */
  const trackSwitch = () =>
    `<div class="ini-track" role="tablist" aria-label="Ruta">` +
    `<button role="tab" data-act="track" data-k="cpp" class="${st.track === "cpp" ? "on" : ""}" aria-selected="${st.track === "cpp"}"><b>Ruta C++</b><small>Código como en Arduino, con retos</small></button>` +
    `<button role="tab" data-act="track" data-k="iec" class="${st.track === "iec" ? "on" : ""}" aria-selected="${st.track === "iec"}"><b>Ruta PLC · IEC 61131-3</b><small>Ladder, ST y FBD en OpenPLC</small></button>` +
    `</div>`;
  /** Siguiente paso de la ruta: la primera lección sin ver; luego, el reto «a continuación». */
  function nextStep(T = tiers()) {
    for (const t of T) {
      if (t.kind === "unit") {
        const x = t.items.find((i) => i.state !== "done");
        if (x) return { tier: t, item: x };
      } else if (st.learn?.next) {
        const x = t.items.find((i) => i.id === st.learn.next);
        if (x) return { tier: t, item: x };
      }
    }
    return null;
  }
  const findItem = (T, id) => {
    for (const t of T) {
      const x = t.items.find((i) => i.id === id);
      if (x) return { tier: t, item: x };
    }
    return null;
  };
  const totals = (T) => {
    const total = T.reduce((n, t) => n + t.total, 0);
    const done = T.reduce((n, t) => n + t.done, 0);
    return { total, done, pct: total ? Math.round((100 * done) / total) : 0, tiersDone: T.filter((t) => t.total && t.done === t.total).length };
  };
  const ring = (pct, size = "") => `<div class="ini-ring ${size}" style="--p:${pct}"><span>${pct}%</span></div>`;
  const hex = (t, extra = "") => `<span class="ini-hex ${t.total && t.done === t.total ? "full" : ""} ${t.open ? "" : "locked"} ${extra}">${icon(t.open ? t.icon : "lock")}</span>`;

  function ribbon() {
    const b = (act, ico, label, title, cls = "") => `<button class="ini-rb ${cls}" data-act="${act}" title="${esc(title)}">${icon(ico)}<span>${label}</span></button>`;
    return (
      `<nav class="ini-ribbon" aria-label="Accesos">` +
      `<div class="ini-rgroup"><small>Archivo</small><div>` +
      b("new", "new", "Nuevo proyecto", "Arduino (C++) u OpenPLC (Ladder, ST, FBD…)", "start-big") +
      b("open", "open", "Abrir", "Un sketch (.ino) o un proyecto del OpenPLC Editor", "start-big") +
      b("openJwsim", "jwsim", "Proyecto JWPLC Sim", "Escena, simulación y programa (.jwsim)", "start-big") +
      b("blank", "blank", "Sketch en blanco", "Seguir con un sketch nuevo, como Arduino IDE", "start-big") +
      `</div></div>` +
      `<div class="ini-rgroup"><small>Componentes</small><div>` +
      b("devices", "devices", "Dispositivos propios", "Equipos propios en la paleta del esquema") +
      b("comped", "comped", "Editor de componentes", "Crear un componente con su símbolo, E/S y comportamiento") +
      `</div></div>` +
      `<div class="ini-rgroup"><small>Aprender</small><div>` +
      b("route", "route", "Ruta de aprendizaje", "Curso JWPLC Basic y retos por nivel") +
      b("archs", "archs", "Arquitecturas", "Casos industriales completos: bombeo, montacargas, tratamiento") +
      b("examples", "examples", "Ejemplos", "Ejemplos de las librerías del JWPLC Basic") +
      `</div></div>` +
      `<div class="ini-brand"><img class="app-logo" src="../icon/icon.svg" alt="" width="32" height="32"/><div><b>JWPLC Sim</b><small>JW Control</small></div>` +
      `<button class="icon ini-close" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></div>` +
      `</nav>`
    );
  }

  function home() {
    const T = tiers();
    const tot = totals(T);
    const nx = nextStep(T);
    const list = recents();
    const archs = st.archs ?? [];
    const a = archs[Math.min(st.archIdx ?? 0, Math.max(0, archs.length - 1))];
    const cur = nx?.tier ?? T[T.length - 1];
    const pos = nx ? nx.tier.items.indexOf(nx.item) + 1 : 0;
    let html = `<div class="ini-home">`;
    // ---- Empieza aquí
    html +=
      `<section class="ini-hero"${archs[0]?.img ? ` style="--img:url('${archs[0].img}')"` : ""}>` +
      `<div class="ini-hero-txt"><span class="ini-eyebrow">${icon("route")}${HERO[st.track].eyebrow}</span>` +
      `<h1>${HERO[st.track].title}</h1><p class="ini-lead">${HERO[st.track].lead}</p>` +
      trackSwitch() +
      `<div class="ini-cta"><button class="ini-go" data-act="continue">${icon("play")}${tot.done ? "Continuar" : "Comenzar"} la ruta ${st.track === "iec" ? "PLC" : "C++"}</button>` +
      (nx ? `<span class="ini-next"><small>A continuación</small><b>${esc(nx.tier.tag)} · ${nx.item.kind === "lesson" ? "Lección" : "Reto"} ${pos} de ${nx.tier.total}</b><em>${esc(nx.item.title)}</em></span>` : `<span class="ini-next"><b>¡Ruta completa!</b></span>`) +
      `</div></div></section>`;
    // ---- Progreso
    html +=
      `<aside class="ini-card ini-progress"><div class="ini-prog-main"><div class="ini-prog-head">${ring(tot.pct)}<div class="ini-prog-txt"><div class="ini-row"><b class="ini-h">Progreso</b><span class="ini-num">${tot.done} / ${tot.total}</span></div>` +
      `<div class="learn-bar"><i style="width:${tot.pct}%"></i></div><small>${tot.total - tot.done} pasos por hacer</small></div></div>` +
      `<div class="ini-kv"><span>Etapas completas</span><b>${tot.tiersDone} / ${T.length}</b></div>` +
      `<div class="ini-kv"><span>Etapa actual</span><b>${esc(cur ? `${cur.tag} · ${cur.name}` : "—")}</b></div>` +
      `</div><div class="ini-prog-ach"><div class="ini-row ini-h2"><b class="ini-h">Logros</b><span class="ini-num">${tot.tiersDone} / ${T.length}</span></div>` +
      `<div class="ini-badges">${T.map((t) => `<span title="${esc(`${t.tag} · ${t.name}`)}">${hex(t, "sm")}</span>`).join("")}</div>` +
      `<button class="link" data-act="route">Ver la ruta completa →</button></div></aside>`;
    // ---- Vitrina de arquitecturas
    html += `<section class="ini-card ini-show" id="ini-show"><div class="ini-show-txt"><span class="ini-eyebrow sm">En vitrina · Arquitecturas industriales</span>`;
    if (a) {
      html +=
        `<b class="ini-show-title">${esc(a.title)}</b><p>${esc(a.summary ?? "")}</p>` +
        `<button class="ini-outline" data-act="arch" data-id="${esc(a.id)}">${icon("open")}Abrir arquitectura</button>`;
    } else html += `<p class="muted">Sin arquitecturas instaladas.</p>`;
    html +=
      `</div><div class="ini-thumbs"><button class="icon ini-arrow" data-act="archPrev" aria-label="Anterior">‹</button>` +
      archs.map((x, i) => `<button class="ini-thumb ${x === a ? "on" : ""}" data-act="archSel" data-i="${i}" title="${esc(x.title)}">${x.img ? `<img src="${x.img}" alt=""/>` : `<i class="ini-noimg"></i>`}<span>${esc(x.title)}</span></button>`).join("") +
      `<button class="icon ini-arrow" data-act="archNext" aria-label="Siguiente">›</button></div></section>`;
    // ---- Recientes
    html +=
      `<aside class="ini-card start-recent ini-recent"><div class="ini-row"><b class="ini-h">Recientes</b><small class="muted">proyectos y sketches</small></div>` +
      (list.length
        ? `<ul>${list.map((r, i) => `<li><button data-act="recent" data-i="${i}"><span class="tag ${r.kind}">${r.kind === "openplc" ? "IEC" : "C++"}</span><b>${esc(r.name)}</b><small>${esc(r.dir)}</small></button></li>`).join("")}</ul>`
        : `<p class="muted">Los proyectos que cree o abra aparecen aquí.</p>`) +
      `</aside>`;
    // ---- Ruta (etapas)
    html +=
      `<section class="ini-card ini-path"><div class="ini-row"><b class="ini-h">Ruta</b><small class="muted">${tot.total} pasos en ${T.length} etapas</small></div><ol>` +
      T.map(
        (t) =>
          `<li><button class="ini-node ${t.key === cur?.key ? "now" : ""}" data-act="tier" data-k="${t.key}" ${t.open ? "" : 'title="Se abre al terminar el nivel anterior"'}>${hex(t)}` +
          `${t.key === cur?.key ? `<i class="ini-now">ahora</i>` : ""}<b><span class="ini-n">${t.n}</span>${esc(t.name)}</b><small>${esc(t.tag)} · ${t.done}/${t.total}</small></button></li>`,
      ).join("") +
      `</ol></section>`;
    return html + `</div>`;
  }

  // ---- Vista Ruta: etapas | pasos de la etapa | ficha
  function routeView() {
    const T = tiers();
    if (!T.length) return `<p class="muted ini-pad">Cargando…</p>`;
    const tot = totals(T);
    const nx = nextStep(T);
    const sel = (st.sel && findItem(T, st.sel)) || nx || { tier: T[0], item: T[0].items[0] };
    const tier = T.find((t) => t.key === st.tier) ?? sel.tier;
    const item = tier.items.includes(sel.item) ? sel.item : tier.items.find((x) => x.state !== "locked") ?? tier.items[0];
    let html =
      `<div class="ini-route"><div class="ini-strip">` +
      `<button class="ini-rb" data-act="home">${icon("home")}<span>Inicio</span></button>` +
      trackSwitch() +
      `<div class="ini-strip-prog">${ring(tot.pct, "sm")}<div><b>${tot.done} / ${tot.total}</b><div class="learn-bar"><i style="width:${tot.pct}%"></i></div><small>${tot.total - tot.done} pasos por hacer</small></div></div>` +
      `<div class="ini-kv"><span>Etapas completas</span><b>${tot.tiersDone} / ${T.length}</b></div>` +
      `<div class="ini-badges">${T.map((t) => hex(t, "sm")).join("")}</div>` +
      `<button class="icon ini-close" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></div>`;
    // Columna 1: etapas
    html += `<div class="ini-cols"><section class="ini-card ini-tiers"><b class="ini-h">Ruta</b><div class="ini-tier-grid">`;
    for (const t of T) {
      html +=
        `<button class="ini-node learn-level ${t.key === tier.key ? "on" : ""} ${t.open ? "" : "locked"}" data-act="tier" data-k="${t.key}">${hex(t)}` +
        `${t.key === nx?.tier.key ? `<i class="ini-now">ahora</i>` : ""}<b>${esc(t.kind === "level" ? `Nivel ${t.key.slice(1)} · ${t.name}` : `${t.tag} · ${t.name}`)}</b><small>${t.done}/${t.total}</small></button>`;
    }
    html += `</div><label class="learn-unlock"><input type="checkbox" id="learn-unlock" ${st.learn?.unlockAll ? "checked" : ""}/> Desbloquear todos los niveles (docente)</label></section>`;
    // Columna 2: pasos de la etapa
    const pct = tier.total ? Math.round((100 * tier.done) / tier.total) : 0;
    html +=
      `<section class="ini-card ini-steps"><div class="ini-tier-head"><span class="ini-n big">${tier.n}</span><div><small class="ini-eyebrow sm">${esc(tier.tag)} · ${!tier.open ? "bloqueado" : tier.done === tier.total ? "completo" : "en curso"}</small><b>${esc(tier.name)}</b></div></div>` +
      `<p class="muted">${esc(tier.desc)}</p><div class="ini-row"><div class="learn-bar grow"><i style="width:${pct}%"></i></div><span class="ini-num">${tier.done} / ${tier.total}</span></div>` +
      (tier.open ? "" : `<p class="ini-lockmsg">${icon("lock")}Se abre al terminar todos los retos del nivel anterior.</p>`) +
      `<ol class="ini-list">`;
    tier.items.forEach((x, i) => {
      const badge =
        x.state === "done"
          ? x.grade != null
            ? `<span class="learn-grade">${String(x.grade).replace(".", ",")}/20</span>`
            : `<span class="ini-ok">${icon("check")}</span>`
          : x.state === "next" || x === nx?.item
            ? `<span class="up-next">A continuación</span>`
            : x.state === "locked"
              ? icon("lock", "dim")
              : "";
      html +=
        `<li><button class="learn-item ${x.kind} ${x.state} ${x === item ? "on" : ""}" data-act="pick" data-id="${esc(x.id)}" ${x.state === "locked" ? 'aria-disabled="true"' : ""}>` +
        `<span class="ini-num">${String(x.kind === "lesson" ? x.lesson.num : i + 1).padStart(2, "0")}</span><b>${esc(x.title)}</b>${badge}</button></li>`;
    });
    html += `</ol></section>`;
    // Columna 3: ficha
    html += `<section class="ini-card ini-brief" id="ini-brief">${item ? (item.kind === "lesson" ? lessonBrief(tier, item) : retoBrief(tier, item)) : ""}</section></div></div>`;
    return html;
  }

  // Renglón del README: **negrita** y `código`; un bloque de código (varias
  // líneas) va tal cual en <pre>.
  const md = (x) =>
    String(x).includes("\n")
      ? `<pre class="ini-pre">${esc(x)}</pre>`
      : esc(x)
          .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
          .replace(/`([^`]+)`/g, "<code>$1</code>");
  const ul = (arr, cls = "") => (arr?.length ? `<ul class="${cls}">${arr.map((x) => `<li>${md(x)}</li>`).join("")}</ul>` : "");
  const SIM = /^En JWPLC Sim$/i;
  const LANG_SHORT = { ST: "ST", LD: "Ladder", FBD: "FBD" };
  const LANG_NAME = { ST: "Texto estructurado: se edita aquí mismo", LD: "Diagrama Ladder: se edita en el OpenPLC Editor", FBD: "Diagrama de bloques: se edita en el OpenPLC Editor" };
  function lessonBrief(tier, x) {
    const l = x.lesson;
    const pos = tier.items.indexOf(x) + 1;
    let html =
      `<small class="ini-eyebrow sm">${esc(tier.tag)} · Lección ${esc(String(l.num))} · ${pos} de ${tier.total}</small><h2>${esc(x.title)}</h2>` +
      `<div class="ini-brief-body">` +
      (l.learn.length ? `<h4>Qué vas a aprender</h4>${ul(l.learn)}` : "") +
      (l.need.length ? `<h4>Qué necesitas</h4>${ul(l.need)}` : "") +
      l.sections.filter((s) => s.items.length && !SIM.test(s.title)).map((s) => `<h4>${esc(s.title)}</h4>${ul(s.items)}`).join("") +
      // En el Sim se prueba con el banco: los pasos de «En JWPLC Sim» reemplazan
      // a los del equipo físico cuando la lección los trae.
      ((sim) => {
        const steps = sim?.items.filter((s) => !s.includes("\n")) ?? l.steps;
        return steps.length ? `<h4>${sim ? "Cómo probarlo en el simulador" : "Cómo probarlo"}</h4><ol class="ini-ol">${steps.map((s) => `<li>${md(s)}</li>`).join("")}</ol>` : "";
      })(l.sections.find((s) => SIM.test(s.title) && s.items.length)) +
      (l.practice.length ? `<h4>Para practicar</h4>${ul(l.practice, "ini-practice")}` : "") +
      (l.graded && l.goals?.length
        ? `<h4>Objetivos que se evalúan</h4>${ul(l.goals.map((g) => g.text + (g.extra ? " (mérito)" : "")), "ini-practice")}`
        : l.practice.length
          ? `<h4>Para practicar</h4>${ul(l.practice, "ini-practice")}`
          : "") +
      (l.iec
        ? `<h4>En el simulador</h4><div class="ini-chips"><span>Banco de práctica</span><span>Objetivos en vivo</span><span>OpenPLC Editor</span><span>Placa JWPLC Basic</span></div>` +
          `</div><div class="ini-brief-foot"><div class="ini-langs"><small>Abrir la práctica en</small>${(l.langs ?? []).map((g) => `<button class="ini-go" data-act="lesson" data-id="${esc(x.id)}" data-lang="${g}" title="${esc(LANG_NAME[g] ?? g)}">${icon("play")}${esc(LANG_SHORT[g] ?? g)}</button>`).join("")}</div>`
        : `<h4>En el simulador</h4><div class="ini-chips">${l.graded ? "<span>Banco de práctica</span><span>Objetivos en vivo</span>" : "<span>Ejemplo del Curso JWPLC Basic</span>"}<span>Placa JWPLC Basic</span><span>Monitor serie</span></div>` +
          `</div><div class="ini-brief-foot"><button class="ini-go" data-act="lesson" data-id="${esc(x.id)}">${icon("play")}${x.state === "done" ? "Abrir de nuevo" : l.graded ? "Abrir práctica" : "Abrir lección"}</button>`) +
      `<small class="muted">${
        l.graded
          ? x.state === "done"
            ? "Práctica lograda: cumpliste sus objetivos."
            : "Teoría a la izquierda, objetivos a la derecha: se da por hecha al cumplirlos."
          : x.state === "done"
            ? "Lección vista."
            : "Se abre como sketch en su carpeta de trabajo."
      }</small></div>`;
    return html;
  }
  function retoBrief(tier, x) {
    const b = x.brief ?? {};
    const pos = tier.items.indexOf(x) + 1;
    const locked = x.state === "locked";
    return (
      `<small class="ini-eyebrow sm">${esc(tier.tag)} · Reto ${pos} de ${tier.total}</small><h2>${esc(x.title)}</h2>` +
      `<div class="ini-brief-body">${x.img ? `<img class="ini-brief-img" src="${x.img}" alt=""/>` : ""}` +
      (x.intro ? `<p>${esc(x.intro)}</p>` : "") +
      (b.goal ? `<h4>El objetivo</h4><p>${esc(b.goal)}</p>` : "") +
      (b.teaches ? `<h4>Qué enseña</h4><p>${esc(b.teaches)}</p>` : "") +
      (x.goals?.length ? `<h4>Objetivos en vivo</h4><ul class="ini-goals">${x.goals.map((g) => `<li class="${g.extra ? "merit" : ""}">${esc(g.text)}${g.extra ? " <em>(mérito)</em>" : ""}</li>`).join("")}</ul>` : "") +
      (b.uses?.length ? `<h4>En la mesa</h4><div class="ini-chips">${b.uses.map((u) => `<span>${esc(u)}</span>`).join("")}</div>` : "") +
      `</div><div class="ini-brief-foot"><button class="ini-go learn-start" data-act="ex" data-id="${esc(x.id)}" ${locked ? "disabled" : ""}>${icon(locked ? "lock" : "play")}${x.state === "done" ? "Repetir reto" : "Empezar reto"}</button>` +
      `<small class="muted">${locked ? "Termine el nivel anterior para abrirlo." : x.grade != null ? `Mejor nota: ${String(x.grade).replace(".", ",")}/20` : "Se califica de 0 a 20; aprueba con 14."}</small></div>`
    );
  }

  // ---- Ejemplos de las librerías (antes, en la barra de arriba)
  function examplesView() {
    const all = st.examples ?? [];
    const q = (st.exQ ?? "").toLowerCase();
    const groups = [...new Set(all.map((e) => e.group))];
    const g = st.exGroup && groups.includes(st.exGroup) ? st.exGroup : groups[0];
    const list = all.filter((e) => (q ? `${e.group} ${e.label}`.toLowerCase().includes(q) : e.group === g));
    let html =
      `<div class="ini-route"><div class="ini-strip"><button class="ini-rb" data-act="home">${icon("home")}<span>Inicio</span></button>` +
      `<b class="ini-h">Ejemplos</b><input id="ini-exq" class="ini-search" placeholder="Buscar ejemplo…" value="${esc(st.exQ ?? "")}" spellcheck="false" autocomplete="off"/>` +
      `<button class="icon ini-close" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></div>` +
      `<div class="ini-cols ex"><section class="ini-card ini-libs">${groups.map((x) => `<button class="${x === g && !q ? "on" : ""}" data-act="exGroup" data-g="${esc(x)}">${esc(x)}<small>${all.filter((e) => e.group === x).length}</small></button>`).join("")}</section>` +
      `<section class="ini-card ini-exlist">`;
    if (!all.length) html += `<p class="muted">Cargando…</p>`;
    let sub = null;
    for (const e of list) {
      const parts = e.label.split(" / ");
      const head = q ? e.group : parts.slice(0, -1).join(" / ");
      if (head !== sub) {
        sub = head;
        html += head ? `<h4>${esc(head.replace(/_/g, " "))}</h4>` : "";
      }
      html += `<button class="ini-ex" data-act="example" data-dir="${esc(e.dir)}">${icon("blank")}<span>${esc(parts[parts.length - 1].replace(/_/g, " "))}</span></button>`;
    }
    if (all.length && !list.length) html += `<p class="muted">Ningún ejemplo coincide.</p>`;
    return html + `</section></div></div>`;
  }

  async function refreshLearn() {
    const [learn, course, courseIec, lessons, archs] = await Promise.all([
      api.learnState().catch(() => null),
      st.course ? Promise.resolve(st.course) : api.courseList?.().catch(() => []) ?? [],
      st.courseIec ? Promise.resolve(st.courseIec) : api.courseListIec?.().catch(() => []) ?? [],
      api.learnLessons?.().catch(() => ({})) ?? {},
      st.archs ? Promise.resolve(st.archs) : api.listArchs().catch(() => []),
    ]);
    st.learn = learn;
    st.course = course ?? [];
    st.courseIec = courseIec ?? [];
    st.lessons = lessons ?? {};
    st.archs = archs ?? [];
    if (!$("start")?.hidden && st.view !== "wizard") render();
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

  // Fundido: al cambiar de vista o de ruta se funde todo; al cambiar de
  // etapa, sus pasos y la ficha; al elegir un paso, solo la ficha.
  let shown = {};
  function fadeChanges(box) {
    const now = { view: st.view, track: st.track, tier: st.tier, sel: st.sel, arch: st.archIdx };
    const fade = (sel) => box.querySelectorAll(sel).forEach((e) => e.classList.add("ini-fade"));
    if (now.view !== shown.view || now.track !== shown.track) fade(".ini-body");
    else if (now.view === "learn" && now.tier !== shown.tier) fade(".ini-steps, .ini-brief");
    else if (now.view === "learn" && now.sel !== shown.sel) fade(".ini-brief");
    else if (now.view === "home" && now.arch !== shown.arch) fade(".ini-show-txt");
    shown = now;
  }

  function render() {
    const box = el();
    const focus = document.activeElement?.id;
    const caret = document.activeElement?.selectionStart;
    const full = st.view !== "wizard";
    box.classList.toggle("full", full);
    box.setAttribute("aria-label", { home: "Inicio", learn: "Ruta de aprendizaje", examples: "Ejemplos" }[st.view] ?? "Nuevo proyecto");
    if (full) {
      const body = st.view === "learn" ? routeView() : st.view === "examples" ? examplesView() : home();
      box.innerHTML =
        `<div class="ini">${st.view === "home" ? ribbon() : ""}<div class="ini-body">${body}</div>` +
        `<footer class="start-foot"><label><input type="checkbox" id="start-show" ${store.get(SHOW_KEY, true) ? "checked" : ""}/> Mostrar al iniciar</label>` +
        `<span class="muted small">Vuelve aquí con el botón «Inicio» de la barra de arriba.</span></footer></div>`;
    } else {
      box.innerHTML =
        `<div class="start-card">` +
        `<header class="start-head"><img class="app-logo" src="../icon/icon.svg" alt="" width="24" height="24"/><b>Nuevo proyecto</b>` +
        `<button class="icon" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></header>` +
        `<div class="start-body">${wizard()}</div></div>`;
    }
    fadeChanges(box);
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
    refreshLearn();
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
    if (e.target.id === "learn-unlock") {
      st.learn = await api.learnUnlockAll(e.target.checked);
      render();
      return;
    }
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "close") close();
    else if (act === "new") open("wizard");
    else if (act === "learn" || act === "route") {
      st.view = "learn";
      st.tier = null;
      render();
    } else if (act === "home") {
      st.view = "home";
      render();
    } else if (act === "continue") {
      const nx = nextStep();
      st.sel = nx?.item.id ?? null;
      st.tier = nx?.tier.key ?? null;
      st.view = "learn";
      render();
    } else if (act === "track") {
      st.track = b.dataset.k === "iec" ? "iec" : "cpp";
      try {
        localStorage.setItem(TRACK_KEY, st.track);
      } catch {}
      st.tier = null;
      st.sel = null;
      render();
    } else if (act === "tier") {
      st.tier = b.dataset.k;
      st.sel = null;
      st.view = "learn";
      render();
    } else if (act === "pick") {
      st.sel = b.dataset.id;
      render();
      $("ini-brief")?.scrollTo?.(0, 0);
    } else if (act === "ex") {
      close();
      window.openExerciseById?.(b.dataset.id);
    } else if (act === "lesson") {
      const hit = findItem(tiers(), b.dataset.id);
      if (!hit) return;
      close();
      // Con práctica evaluada se abre su banco; se da por hecha al cumplir los objetivos.
      if (hit.item.lesson.graded) return window.openLessonById?.(hit.item.id, b.dataset.lang);
      try {
        window.loadSketch(await api.openExample(hit.item.lesson.dir));
        window.showLessonGuide?.(hit.item.lesson);
        st.lessons = await api.learnLessonSeen(hit.item.id);
        window.consoleWrite?.(`[jwsim] Curso JWPLC Basic · Lección ${hit.item.lesson.num}: ${hit.item.title}\n`, "sys");
      } catch (err) {
        window.consoleWrite?.(`[jwsim] ${String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}\n`, "fatal");
      }
    } else if (act === "arch") {
      close();
      window.openArchById?.(b.dataset.id);
    } else if (act === "archSel" || act === "archPrev" || act === "archNext") {
      const n = st.archs?.length ?? 0;
      if (!n) return;
      const i = st.archIdx ?? 0;
      st.archIdx = act === "archSel" ? Number(b.dataset.i) : (i + (act === "archNext" ? 1 : n - 1)) % n;
      render();
    } else if (act === "archs") {
      st.view = "home";
      render();
      const sh = $("ini-show");
      sh?.scrollIntoView({ block: "center", behavior: "smooth" });
      sh?.classList.add("flash");
      setTimeout(() => sh?.classList.remove("flash"), 900);
    } else if (act === "examples") {
      st.view = "examples";
      render();
      if (!st.examples) {
        st.examples = await api.listExamples().catch(() => []);
        render();
      }
    } else if (act === "exGroup") {
      st.exGroup = b.dataset.g;
      st.exQ = "";
      render();
    } else if (act === "example") {
      close();
      try {
        window.loadSketch(await api.openExample(b.dataset.dir));
      } catch (err) {
        window.consoleWrite?.(`[jwsim] ${String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}\n`, "fatal");
      }
    } else if (act === "devices") {
      close();
      window.JwsimDevices?.open();
    } else if (act === "comped") {
      close();
      window.JwsimComponentEditor?.open();
    }
    else if (act === "blank") close();
    else if (act === "open") {
      close();
      const s = await api.openDialog();
      if (s) window.loadSketch(s);
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
    if (t.id === "ini-exq") st.exQ = t.value;
    else if (t.id === "start-name") st.name = t.value.trim();
    else if (t.id === "start-parent") st.parent = t.value.trim();
    else if (t.id === "start-interval") st.interval = t.value.trim();
    else return;
    render();
  }

  // ------------------------------------------------------------ enganches
  $("btn-projects").addEventListener("click", () => open("home"));
  // Al volver al programa, la ruta se pone al día (un reto pudo quedar hecho).
  window.addEventListener("jwsim:learnchange", () => refreshLearn());
  $("btn-open-editor").addEventListener("click", () => current()?.openplc && openEditor(current().dir));
  api.onMenu((cmd) => {
    if (cmd === "startScreen") open("home");
    else if (cmd === "learnCenter") open("learn");
    else if (cmd === "examplesView") {
      open("home");
      el().querySelector('[data-act="examples"]')?.click();
    }
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
      try {
        if (!openedFromEditor && store.get(SHOW_KEY, true) && (await api.startScreen())) open("home");
      } finally {
        // Ya se decidió qué se ve primero: se muestra la ventana (theme-init.js).
        document.documentElement.classList.remove("booting");
      }
    },
    state: () => ({ ...st, hidden: el().hidden }),
  };
})();
