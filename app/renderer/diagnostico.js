// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modo Diagnóstico (panel lateral de la Escena): órdenes de trabajo con una
// falla oculta, multímetro con puntas en los bornes, pinza en los cables,
// bloqueo y etiquetado, reparación y puntaje.
//
// La falla se inyecta con la misma maquinaria de G9 (Scene.inject): cable
// cortado, sensor o pulsador que no conmuta, bobina o lámpara quemada,
// contactor soldado. Mientras la orden está abierta, la falla no se marca en
// el dibujo, en el inspector ni en la lista de diagnóstico: hay que hallarla
// midiendo. Las lecturas salen del motor de la escena (scene/meter.mjs).
//
// Órdenes: las del proyecto (`diagnostico.ordenes` en el .jwsim, con el
// síntoma que reporta el operador) o, si no trae, unas generadas del
// cableado de las E/S del PLC.
(() => {
  const api = window.jwsim;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const Sc = () => window.JwsimScene;

  const MODES = [
    { id: "VDC", label: "V⎓", title: "Tensión continua" },
    { id: "VAC", label: "V~", title: "Tensión alterna" },
    { id: "OHM", label: "Ω", title: "Resistencia y continuidad (sin tensión)" },
    { id: "A", label: "A", title: "Pinza amperimétrica: clic en un cable" },
  ];
  const PEN = {
    ohmLive: { pts: 10, max: 2, text: "Midió resistencia con tensión: la lectura no vale y puede dañar el multímetro" },
    repairLive: { pts: 30, max: 1, text: "Reparó sin bloquear y etiquetar la energía" },
    noZero: { pts: 10, max: 1, text: "No probó ausencia de tensión antes de tocar" },
    wrongPart: { pts: 15, max: 4, text: "Cambió una pieza sana (el repuesto se carga a la orden)" },
  };

  const D = {
    order: null, // orden abierta
    key: null, // clave de la falla oculta
    t0: 0,
    mode: "VDC",
    red: null,
    black: null,
    wire: null, // índice del cable con la pinza
    reading: "—",
    live: false,
    locked: false,
    zeroProved: false,
    pens: [],
    log: [],
    done: null, // resultado al cerrar
    done_ids: new Set(),
    lastMeasure: 0,
  };

  const running = () => !!Sc()?.isRunning?.();
  const spec = () => Sc()?.specForView?.() ?? { devices: [], wiring: [] };
  const faultKey = (f) => (f.kind === "open" ? `open:${f.wire.split(/\s+/).sort().join(" ")}` : `${f.kind}:${f.device}`);
  const wireName = (w) => `${w.from} – ${w.to}`;
  const note = (text, cls = "") => {
    const t = (performance.now() - D.t0) / 1000;
    D.log.push({ t, text, cls });
    paint();
  };
  const penalize = (k) => {
    const n = D.pens.filter((p) => p === k).length;
    if (!D.order || n >= PEN[k].max) return;
    D.pens.push(k);
    note(`−${PEN[k].pts} · ${PEN[k].text}`, "bad");
  };

  // ------------------------------------------------------------ órdenes
  /** Órdenes del proyecto o, si no trae, generadas de las E/S cableadas. */
  function orders() {
    const own = window.JwsimProject?.()?.diagnostico?.ordenes;
    if (Array.isArray(own) && own.length) return own;
    const map = Sc()?.ioMap?.() ?? {};
    const plc = spec().devices.find((d) => d.type === "jwsim/jwplc-basic")?.id;
    const out = [];
    for (const [sig, io] of Object.entries(map)) {
      const dev = io.devices[0];
      if (!dev) continue;
      if (sig.startsWith("I")) {
        const w = spec().wiring.find((x) => [x.from, x.to].includes(`${plc}.${sig}`));
        if (w) out.push({ id: `auto-${sig}-cable`, titulo: `Entrada ${sig.replace("_", ".")}`, sintoma: `La máquina no reacciona a ${dev}: revise el circuito de esa señal.`, falla: { kind: "open", wire: `${w.from} ${w.to}` } });
        out.push({ id: `auto-${sig}-sensor`, titulo: `Entrada ${sig.replace("_", ".")}`, sintoma: `${dev} parece no cambiar de estado.`, falla: { kind: "stuck", device: dev, value: false } });
      } else {
        const load = io.devices[io.devices.length - 1];
        out.push({ id: `auto-${sig}-carga`, titulo: `Salida ${sig.replace("_", ".")}`, sintoma: `${load} no actúa cuando el programa lo pide.`, falla: { kind: "burnt", device: load } });
      }
    }
    return out;
  }

  async function newOrder() {
    if (!running()) return note("Inicie la simulación (▶) para recibir una orden de trabajo.", "warn");
    const all = orders();
    if (!all.length) return note("Este proyecto no tiene E/S cableadas para generar órdenes.", "warn");
    let pool = all.filter((o) => !D.done_ids.has(o.id));
    if (!pool.length) {
      D.done_ids.clear();
      pool = all;
    }
    const o = pool[Math.floor(Math.random() * pool.length)];
    if (D.order) await abandon(true);
    Object.assign(D, { order: o, key: faultKey(o.falla), t0: performance.now(), pens: [], log: [], done: null, zeroProved: false, red: null, black: null, wire: null, reading: "—" });
    await api.sceneInject(o.falla);
    note(`Orden recibida: ${o.titulo}`);
    paint();
  }

  async function abandon(silent = false) {
    if (!D.order) return;
    if (D.key) await api.sceneClearFault(D.key);
    if (!silent) note("Orden abandonada: la falla se quitó.", "warn");
    D.order = null;
    D.key = null;
    paint();
  }

  // ------------------------------------------------------------ medición
  const fmt = (mode, v) => {
    if (v == null) return mode === "OHM" ? "OL" : "—";
    if (mode === "OHM") return v >= 1000 ? `${(v / 1000).toFixed(2)} kΩ` : `${v.toFixed(v < 10 ? 1 : 0)} Ω`;
    if (mode === "A") return v < 1 ? `${(v * 1000).toFixed(0)} mA` : `${v.toFixed(2)} A`;
    return `${v.toFixed(1)} V`;
  };

  /** force: lectura pedida por un clic (se anota); score: cuenta para el puntaje. */
  async function measure(force = false, score = force) {
    if (!running()) {
      D.reading = "—";
      return paint();
    }
    if (!force && performance.now() - D.lastMeasure < 200) return;
    D.lastMeasure = performance.now();
    if (D.mode === "A") {
      const w = spec().wiring[D.wire];
      if (!w) return;
      const r = await api.sceneClamp(w.from, w.to);
      D.reading = r.error ? "Err" : fmt("A", r.value);
      return paint();
    }
    if (!D.red || !D.black) return paint();
    const r = await api.sceneMeasure(D.red, D.black, D.mode);
    if (r.error) {
      D.reading = "Err";
      return paint();
    }
    D.live = r.live;
    D.reading = D.mode === "OHM" && r.live ? "¡Tensión!" : fmt(D.mode, r.value);
    if (force) {
      if (D.mode === "OHM" && r.live && score) penalize("ohmLive");
      // Prueba de ausencia de tensión: bloqueado, entre los polos de una fuente.
      if (D.locked && D.mode !== "OHM" && r.value === 0 && sameSource(D.red, D.black)) {
        if (!D.zeroProved && D.order) note("Ausencia de tensión probada en la fuente: se puede trabajar.", "ok");
        D.zeroProved = true;
      }
      if (D.order) note(`${MODES.find((m) => m.id === D.mode).label} ${D.red} → ${D.black}: ${D.reading}`);
    }
    paint();
  }

  /** ¿Las dos puntas en bornes de una misma fuente (fuente de 24 V, red)? */
  function sameSource(a, b) {
    const id = a.slice(0, a.indexOf("."));
    if (id !== b.slice(0, b.indexOf("."))) return false;
    const type = spec().devices.find((d) => d.id === id)?.type ?? "";
    return /power|supply/.test(type);
  }

  function onTerm(term) {
    if (!isOpen() || !running() || D.mode === "A") return false;
    if (!D.red || (D.red && D.black)) {
      D.red = term;
      D.black = null;
    } else D.black = term;
    measure(true);
    paintProbes();
    return true;
  }

  function onWire(i) {
    if (!isOpen() || !running() || D.mode !== "A") return false;
    D.wire = i;
    measure(true).then(() => D.order && note(`Pinza en ${wireName(spec().wiring[i])}: ${D.reading}`));
    paintProbes();
    return true;
  }

  // ------------------------------------------------------------ bloqueo y reparación
  async function toggleLock() {
    if (!running()) return;
    D.locked = !D.locked;
    if (D.locked) D.zeroProved = false;
    await api.sceneLockout(D.locked);
    note(D.locked ? "Seccionador abierto, candado y etiqueta puestos. Pruebe ausencia de tensión." : "Bloqueo retirado: la máquina vuelve a tener energía.", D.locked ? "ok" : "");
  }

  async function repair() {
    if (!D.order) return;
    const what = $("diag-part").value;
    if (!what) return;
    if (!D.locked) penalize("repairLive");
    else if (!D.zeroProved) penalize("noZero");
    const f = D.order.falla;
    const ok = what.startsWith("w:")
      ? f.kind === "open" && faultKey({ kind: "open", wire: (() => {
          const w = spec().wiring[Number(what.slice(2))];
          return `${w.from} ${w.to}`;
        })() }) === D.key
      : f.kind !== "open" && f.device === what.slice(2);
    const name = what.startsWith("w:") ? `cable ${wireName(spec().wiring[Number(what.slice(2))])}` : what.slice(2);
    if (!ok) {
      penalize("wrongPart");
      return note(`Se ${what.startsWith("w:") ? "reparó el" : "cambió"} ${name}, pero la falla no estaba ahí.`, "warn");
    }
    await api.sceneClearFault(D.key);
    D.key = null;
    note(`Reparado: ${name}. Retire el bloqueo y pruebe la máquina.`, "ok");
  }

  function close() {
    if (!D.order) return;
    if (D.key) return note("La falla sigue: la máquina no quedó reparada.", "warn");
    if (D.locked) return note("Retire el bloqueo y pruebe la máquina antes de cerrar la orden.", "warn");
    const pts = Math.max(0, 100 - D.pens.reduce((s, k) => s + PEN[k].pts, 0));
    const secs = Math.round((performance.now() - D.t0) / 1000);
    D.done = { pts, secs, order: D.order, pens: [...D.pens] };
    D.done_ids.add(D.order.id);
    D.order = null;
    paint();
  }

  // ------------------------------------------------------------ interfaz
  const isOpen = () => document.querySelector(".scene-main")?.dataset.pane === "diag";

  function partOptions() {
    const sp = spec();
    const devs = sp.devices.filter((d) => d.type !== "jwsim/jwplc-basic").map((d) => `<option value="d:${esc(d.id)}">Reemplazar ${esc(d.id)} · ${esc(Sc()?.deviceName?.(d.id) ?? "")}</option>`);
    const wires = sp.wiring.map((w, i) => `<option value="w:${i}">Reparar cable ${esc(wireName(w))}</option>`);
    return `<option value="">Elija un equipo o un cable…</option><optgroup label="Equipos">${devs.join("")}</optgroup><optgroup label="Cables">${wires.join("")}</optgroup>`;
  }

  function paint() {
    const root = $("diag-root");
    if (!root) return;
    const o = D.order;
    const secs = o ? Math.round((performance.now() - D.t0) / 1000) : 0;
    const probeTxt = D.mode === "A" ? (D.wire != null && spec().wiring[D.wire] ? `Pinza: ${esc(wireName(spec().wiring[D.wire]))}` : "Clic en un cable para poner la pinza") : `<span class="diag-red">●</span> ${esc(D.red ?? "clic en un borne")} <span class="diag-black">●</span> ${esc(D.black ?? (D.red ? "clic en otro borne" : "—"))}`;
    let html = "";
    if (o) {
      html += `<div class="diag-order"><div class="diag-order-h"><b>Orden de trabajo</b><span id="diag-clock"></span></div>
        <div class="diag-title">${esc(o.titulo)}</div><p class="diag-sym">«${esc(o.sintoma)}»</p>
        <div class="diag-row"><button class="small" id="diag-close">Cerrar orden</button><button class="small link" id="diag-abandon">Abandonar</button></div></div>`;
    } else if (D.done) {
      const d = D.done;
      html += `<div class="diag-order done"><div class="diag-order-h"><b>Orden cerrada</b><span>${Math.floor(d.secs / 60)}:${String(d.secs % 60).padStart(2, "0")}</span></div>
        <div class="diag-score">${d.pts}<small>/100</small></div><div class="diag-title">${esc(d.order.titulo)}</div>
        <p class="diag-sym">Causa: ${esc(d.order.causa ?? describeFault(d.order.falla))}</p>
        ${d.pens.length ? `<ul class="diag-pens">${d.pens.map((k) => `<li>−${PEN[k].pts} ${esc(PEN[k].text)}</li>`).join("")}</ul>` : `<p class="diag-ok">Trabajo limpio: sin malas prácticas.</p>`}
        <div class="diag-row"><button class="small primary" id="diag-new">Nueva orden</button></div></div>`;
    } else {
      html += `<div class="diag-order"><p class="diag-sym">Reciba una orden de trabajo con una falla oculta (en entradas o salidas), mida y repárela trabajando seguro.</p>
        <div class="diag-row"><button class="small primary" id="diag-new" ${running() ? "" : "disabled"}>Nueva orden</button></div>${running() ? "" : `<p class="diag-hint">Inicie la simulación (▶) para empezar.</p>`}</div>`;
    }
    html += `<div class="diag-meter${D.mode === "OHM" && D.live && D.red && D.black ? " alarm" : ""}">
      <div class="diag-lcd" aria-live="polite">${esc(D.reading)}</div>
      <div class="diag-modes" role="radiogroup" aria-label="Rango">${MODES.map((m) => `<button class="seg${m.id === D.mode ? " on" : ""}" data-mode="${m.id}" title="${m.title}" role="radio" aria-checked="${m.id === D.mode}">${m.label}</button>`).join("")}</div>
      <div class="diag-probes">${probeTxt}</div>
      <button class="small link" id="diag-leads-off">Quitar puntas</button></div>`;
    html += `<div class="diag-lock${D.locked ? " on" : ""}"><span>${D.locked ? "🔒 Energía bloqueada" : "⚡ Con energía"}</span>
      <button class="small" id="diag-lock" ${running() ? "" : "disabled"}>${D.locked ? "Retirar bloqueo" : "Bloquear y etiquetar"}</button></div>`;
    if (o) {
      html += `<div class="diag-repair"><div class="insp-sub">Reparar</div><select id="diag-part">${partOptions()}</select>
        <button class="small" id="diag-fix">Hacer la reparación</button></div>`;
    }
    if (D.log.length) html += `<div class="insp-sub">Bitácora</div><ol class="diag-log">${D.log.slice(-40).map((l) => `<li class="${l.cls}"><span>${Math.floor(l.t / 60)}:${String(Math.floor(l.t % 60)).padStart(2, "0")}</span>${esc(l.text)}</li>`).join("")}</ol>`;
    const clock = () => {
      const c = $("diag-clock");
      const txt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      if (c && c.textContent !== txt) c.textContent = txt;
    };
    if (root.dataset.html === html) return clock();
    const part = $("diag-part")?.value;
    root.innerHTML = html;
    root.dataset.html = html;
    if (part && $("diag-part")) $("diag-part").value = part;
    const log = root.querySelector(".diag-log");
    if (log) log.scrollTop = log.scrollHeight;
    clock();
  }

  function describeFault(f) {
    if (f.kind === "open") return `cable cortado entre ${f.wire.replace(" ", " y ")}`;
    if (f.kind === "stuck") return `${f.device} no conmuta (${f.value === false ? "queda en reposo" : "queda accionado"})`;
    if (f.kind === "burnt") return `${f.device} quemado (no conduce)`;
    if (f.kind === "welded") return `contactos de ${f.device} soldados`;
    return f.kind;
  }

  /** Puntas dibujadas sobre los bornes del esquema. */
  function paintProbes() {
    const rootG = $("scene-root");
    if (!rootG) return;
    let g = $("diag-probes");
    if (!g) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.id = "diag-probes";
      rootG.appendChild(g);
    }
    if (g !== rootG.lastElementChild) rootG.appendChild(g);
    const show = isOpen() && running();
    const inv = rootG.getCTM()?.inverse();
    const at = (el, x, y) => {
      const m = el.getCTM();
      if (!m || !inv) return null;
      const p = new DOMPoint(x, y).matrixTransform(inv.multiply(m));
      return [p.x, p.y];
    };
    let s = "";
    if (show && D.mode !== "A") {
      for (const [term, cls, txt] of [[D.red, "red", "+"], [D.black, "black", "COM"]]) {
        if (!term) continue;
        const c = document.querySelector(`.term[data-term="${CSS.escape(term)}"] circle`);
        if (!c) continue;
        const p = at(c, Number(c.getAttribute("cx")), Number(c.getAttribute("cy")));
        if (!p) continue;
        s += `<g class="diag-tip ${cls}" transform="translate(${p[0]} ${p[1]})"><circle r="13"/><path d="M0 -13 L-10 -46 L10 -46 Z"/><text y="-52">${txt}</text></g>`;
      }
    }
    if (show && D.mode === "A" && D.wire != null) {
      const path = document.querySelector(`.wire[data-wire="${D.wire}"] .wire-hit`) ?? document.querySelector(`.wire[data-wire="${D.wire}"] path`);
      const g = document.querySelector(`.wire[data-wire="${D.wire}"]`);
      let p = null;
      if (path) {
        const q = path.getPointAtLength(path.getTotalLength() / 2);
        p = at(path, q.x, q.y);
      } else if (g) {
        // Punta de un cable multiconductor (solo la puntera): el centro del dibujo.
        const b = g.getBBox();
        p = at(g, b.x + b.width / 2, b.y + b.height / 2);
      }
      if (p) s += `<g class="diag-clamp" transform="translate(${p[0]} ${p[1]})"><circle r="16"/><text y="-22">A</text></g>`;
    }
    if (g.dataset.s !== s) {
      g.innerHTML = s;
      g.dataset.s = s;
    }
  }

  // Eventos del panel (delegados: el contenido se repinta).
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("#diag-root button");
    if (!t) return;
    if (t.dataset.mode) {
      D.mode = t.dataset.mode;
      D.reading = "—";
      measure(true, false);
      paintProbes();
      return paint();
    }
    if (t.id === "diag-new") newOrder();
    else if (t.id === "diag-abandon") abandon();
    else if (t.id === "diag-close") close();
    else if (t.id === "diag-lock") toggleLock();
    else if (t.id === "diag-fix") repair();
    else if (t.id === "diag-leads-off") {
      Object.assign(D, { red: null, black: null, wire: null, reading: "—" });
      paintProbes();
      paint();
    }
  });

  let tick = null;
  window.JwsimDiag = {
    /** Hay una orden abierta: no se muestran las fallas en el inspector. */
    active: () => !!D.order,
    onTerm,
    onWire,
    /** La falla oculta no aparece en la instantánea que dibuja la interfaz. */
    filter(snap) {
      if (!D.key) return snap;
      return {
        ...snap,
        injected: (snap.injected ?? []).filter((f) => f.key !== D.key),
        devices: snap.devices.map((d) => (d.injected?.length ? { ...d, injected: d.injected.filter((k) => `${k}:${d.id}` !== D.key) } : d)),
      };
    },
    onSnapshot(snap) {
      if (snap.lockedOut !== undefined && snap.lockedOut !== D.locked && running()) D.locked = !!snap.lockedOut;
      if (isOpen()) {
        measure();
        paintProbes();
        paint();
      }
    },
    onProject() {
      if (D.order) abandon(true);
      Object.assign(D, { done: null, log: [], done_ids: new Set(), red: null, black: null, wire: null, locked: false, reading: "—" });
      paint();
    },
    /** La simulación se detuvo: la orden se cierra sin puntaje y el bloqueo se va con ella. */
    onStop() {
      if (D.order) {
        note("La simulación se detuvo: la orden quedó sin cerrar.", "warn");
        D.order = null;
        D.key = null;
      }
      D.locked = false;
      D.reading = "—";
      paintProbes();
      paint();
    },
    paint,
    state: () => ({ order: D.order?.id ?? null, key: D.key, mode: D.mode, red: D.red, black: D.black, wire: D.wire, reading: D.reading, locked: D.locked, zeroProved: D.zeroProved, pens: [...D.pens], done: D.done && { pts: D.done.pts, pens: D.done.pens }, orders: orders().map((x) => x.id) }),
    /** Para pruebas: abre una orden concreta. */
    async open(id) {
      const o = orders().find((x) => x.id === id);
      if (!o) throw new Error(`orden inexistente: ${id}`);
      if (D.order) await abandon(true);
      Object.assign(D, { order: o, key: faultKey(o.falla), t0: performance.now(), pens: [], log: [], done: null, zeroProved: false, red: null, black: null, wire: null, reading: "—" });
      await api.sceneInject(o.falla);
      note(`Orden recibida: ${o.titulo}`);
    },
    setMode(m) {
      D.mode = m;
      D.reading = "—";
      paint();
    },
    repairWith(value) {
      const sel = $("diag-part");
      if (sel) sel.value = value;
      return repair();
    },
    close,
  };
  clearInterval(tick);
  // El reloj de la orden y las lecturas en vivo, también sin instantáneas nuevas.
  tick = setInterval(() => {
    if (isOpen()) {
      if (running()) measure();
      paint();
      paintProbes();
    }
  }, 500);
})();
