// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Editor de componentes (hito 1, docs/COMPONENTES.md): un componente propio
// sin programar, al estilo del JWPLC HMI Designer. Se ajusta en cinco pasos
// (Dibujo, E/S, Modelo, Comunicación, Probar) mientras el lienzo muestra el
// símbolo con sus bornes, que se arrastran con imán a la grilla de 20 px, o
// el diagrama del modelo. Se guarda como carpeta (component.json + art.svg +
// symbol.svg) enlazada en modo desarrollador: queda en la paleta Equipos.
"use strict";

(() => {
  const api = window.jwsim;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clean = (err) => String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  const GRID = 20;
  const slug = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

  const TABS = [
    ["dibujo", "1 Dibujo"],
    ["io", "2 E/S y bornes"],
    ["modelo", "3 Modelo"],
    ["com", "4 Comunicación"],
    ["probar", "5 Probar"],
  ];
  // E/S que se agregan, con su forma inicial.
  const IO_ADD = [
    ["power", "Alimentación", "El equipo funciona solo con tensión (sin ella, salidas apagadas y Modbus mudo).", { kind: "power", a: "V+", b: "V-", rating: "24VDC" }],
    ["digital-in", "Entrada digital", "Bobina o carga entre dos bornes (bomba, válvula, resistencia): vale 1 con su tensión.", { kind: "digital-in", var: "entrada", a: "X1", b: "X2", rating: "24VDC" }],
    ["digital-out", "Salida digital", "Contacto libre de potencial que cierra cuando la variable vale 1 (flotador, termostato, alarma).", { kind: "digital-out", var: "", a: "13", b: "14" }],
    ["analog-in", "Entrada analógica", "0-10 V o 4-20 mA de otro equipo, escalada a tu rango.", { kind: "analog-in", var: "consigna", signal: "0-10V", a: "AI+", b: "AI-", min: 0, max: 100 }],
    ["analog-out", "Salida analógica", "Transmite una variable por 0-10 V, 4-20 mA o como PT100.", { kind: "analog-out", var: "", signal: "4-20mA", a: "AO+", b: "AO-", min: 0, max: 100 }],
    ["read", "Lectura de otro equipo", "Toma una salida de otro equipo de la escena, sin cable (p. ej. T1.nivelPct).", { kind: "read", var: "externo", source: "" }],
    ["control", "Control del usuario", "Botón, selector o perilla que el alumno mueve con la simulación en marcha.", { kind: "control", var: "ajuste", control: "slider", min: 0, max: 100, default: 50 }],
  ];
  const BLOCK_ADD = [
    ["tf", "Planta (función de transferencia)", "1.er a 4.º orden u oscilatorio, con tiempo muerto: temperatura, presión, pH…", { block: "tf", in: "", out: "y", model: "1.er orden", K: 1, tau1: 10, tau2: 5, tau3: 3, tau4: 2, wn: 0.5, zeta: 0.3, theta: 0, y0: 0 }],
    ["integrator", "Acumulador (integrador)", "Nivel de un tanque, volumen, posición: suma su entrada en el tiempo, con límites.", { block: "integrator", in: "", out: "acumulado", gain: 1, min: 0, max: 100, y0: 0 }],
    ["expr", "Fórmula", "Cualquier cuenta con las variables: 2*x + 4, a > b ? 1 : 0, clamp(x, 0, 100).", { block: "expr", out: "resultado", expr: "0" }],
    ["table", "Tabla (curva)", "Curva de un sensor o de una válvula, con interpolación entre puntos.", { block: "table", in: "", out: "curva", points: [[0, 0], [100, 100]] }],
    ["compare", "Comparador con histéresis", "Vale 1 sobre el umbral alto y vuelve a 0 bajo el bajo (o al revés).", { block: "compare", in: "", out: "alarma", high: 50, low: 45, invert: false }],
    ["limit", "Límite", "Recorta la variable entre un mínimo y un máximo.", { block: "limit", in: "", out: "limitado", min: 0, max: 100 }],
    ["timer", "Temporizador", "A la conexión o a la desconexión, en el instante exacto.", { block: "timer", in: "", out: "temporizado", mode: "on", ms: 1000 }],
  ];
  const IO_NAME = Object.fromEntries(IO_ADD.map((x) => [x[0], x[1]]));
  const BLOCK_NAME = Object.fromEntries(BLOCK_ADD.map((x) => [x[0], x[1]]));
  const BAUDS = [2400, 4800, 9600, 19200, 38400, 57600, 115200];

  const blank = () => ({
    format: "jwcomp/1",
    type: "mi-autor/mi-componente",
    version: "1.0.0",
    name: "Mi componente",
    category: "Componentes propios",
    description: "",
    stepMs: 100,
    parameters: [],
    vars: {},
    io: [],
    blocks: [],
    symbol: { width: 160, height: 120, widgets: [] },
  });

  const st = {
    spec: blank(),
    art: null,
    dir: null,
    tab: "dibujo",
    view: "dibujo",
    check: { ok: false, errors: [], warnings: [], vars: [], terminals: [] },
    sym: null,
    info: null,
    note: "",
    error: "",
    busy: false,
    typeEdited: false,
    examples: [],
    bench: { running: false, timer: 0, speed: 1, inputs: { power: true, digital: {}, analog: {}, reads: {}, actions: {} }, state: null, hist: [], watch: [] },
  };

  // ------------------------------------------------------------ marco
  function el() {
    let box = $("comped");
    if (box) return box;
    box = document.createElement("div");
    box.id = "comped";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Editor de componentes");
    document.body.appendChild(box);
    box.addEventListener("click", onClick);
    box.addEventListener("input", onInput);
    box.addEventListener("change", onInput);
    box.addEventListener("pointerdown", onPointerDown);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    return box;
  }

  function render() {
    const s = st.spec;
    el().innerHTML =
      `<header class="ce-head"><span class="start-logo">JW</span><b>Editor de componentes</b>` +
      `<label class="ce-f">Nombre <input data-path="name" value="${esc(s.name)}" size="20"></label>` +
      `<label class="ce-f">Autor <input data-meta="author" value="${esc(s.type.split("/")[0])}" size="12" placeholder="utec"></label>` +
      `<label class="ce-f">Id <input data-meta="id" value="${esc(s.type.split("/")[1] ?? "")}" size="14"></label>` +
      `<label class="ce-f">Categoría <input data-path="category" value="${esc(s.category)}" size="12"></label>` +
      `<span class="ce-grow"></span>` +
      `<button data-act="new" title="Componente nuevo">Nuevo</button>` +
      `<select data-act-change="example" title="Abrir un ejemplo incluido"><option value="">Ejemplos…</option>${st.examples.map((x) => `<option value="${esc(x.id)}">${esc(x.spec.name)}</option>`).join("")}</select>` +
      `<button data-act="open" title="Abrir la carpeta de un componente">Abrir…</button>` +
      `<button class="primary" data-act="save" ${st.busy ? "disabled" : ""} title="Guarda la carpeta y la deja en la paleta Equipos">Guardar y usar en el Sim</button>` +
      `<button class="icon" data-act="close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button></header>` +
      `<nav class="ce-tabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" aria-selected="${st.tab === id}" class="${st.tab === id ? "on" : ""}" data-cetab="${id}">${label}</button>`).join("")}</nav>` +
      `<main class="ce-main">` +
      `<section class="ce-canvas"><div class="ce-viewbar">` +
      `<button class="${st.view === "dibujo" ? "on" : ""}" data-ceview="dibujo">Dibujo y bornes</button>` +
      `<button class="${st.view === "diagrama" ? "on" : ""}" data-ceview="diagrama">Diagrama del modelo</button>` +
      `<span class="ce-hint">${st.view === "dibujo" ? "Arrastra los bornes (arriba o abajo) y los indicadores; la grilla es de 20 px." : "Entradas a la izquierda, bloques al medio, salidas a la derecha. Clic en un bloque para editarlo."}</span></div>` +
      `<div class="ce-stage" id="ce-stage">${st.view === "dibujo" ? stageSymbol() : stageDiagram()}</div></section>` +
      `<aside class="ce-panel">${panel()}</aside></main>` +
      `<footer class="ce-foot">${footer()}</footer>`;
    decorateStage();
    if (st.tab === "probar") {
      drawTrend();
      liveSymbol();
    }
  }

  function footer() {
    const c = st.check;
    const parts = [];
    if (st.error) parts.push(`<span class="ce-err">${esc(st.error)}</span>`);
    if (st.note) parts.push(`<span class="ce-ok">${esc(st.note)}</span>`);
    if (c.errors.length) parts.push(`<details class="ce-err"><summary>${c.errors.length} por corregir</summary><ul>${c.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></details>`);
    else parts.push(`<span class="ce-ok">✓ El componente es válido${st.dir ? ` · ${esc(st.dir)}` : ""}</span>`);
    if (c.warnings.length) parts.push(`<span class="ce-warn">${c.warnings.map(esc).join(" · ")}</span>`);
    return parts.join("");
  }
  const refreshFoot = () => {
    const f = el().querySelector(".ce-foot");
    if (f) f.innerHTML = footer();
  };

  // ------------------------------------------------------------ lienzo: símbolo
  function stageSymbol() {
    if (!st.sym?.svg) return `<p class="ce-empty">Agrega una E/S o importa un dibujo para empezar.</p>`;
    return `<div class="ce-sym" style="--w:${st.sym.width};--h:${st.sym.height}">${st.sym.svg}</div>`;
  }

  // Grilla, bornes visibles y zonas de arrastre sobre el símbolo (solo en el editor).
  function decorateStage() {
    const svg = el().querySelector(".ce-sym svg");
    if (!svg) return;
    const W = st.sym.width;
    const H = st.sym.height;
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", "ce-grid");
    for (let x = GRID; x < W; x += GRID) g.insertAdjacentHTML("beforeend", `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
    for (let y = GRID; y < H; y += GRID) g.insertAdjacentHTML("beforeend", `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
    svg.insertBefore(g, svg.children[1] ?? null);
  }

  // ------------------------------------------------------------ lienzo: diagrama del modelo
  function stageDiagram() {
    const s = st.spec;
    const inputs = [];
    for (const e of s.io) if (["digital-in", "analog-in", "read", "control"].includes(e.kind) || (e.kind === "power" && e.var)) inputs.push({ v: e.var, label: `${IO_NAME[e.kind]}`, sub: e.var });
    for (const p of s.parameters) inputs.push({ v: p.id, label: "Parámetro", sub: p.id, param: true });
    for (const k of Object.keys(s.vars ?? {})) inputs.push({ v: k, label: "Estado (Modbus)", sub: k });
    const prod = new Map(inputs.map((n) => [n.v, { col: 0, node: n }]));
    // Columna de cada bloque: 1 + la mayor de sus entradas (los lazos por un bloque dinámico no suman).
    const ins = (b) => {
      if (b.block === "expr") return [...String(b.expr ?? "").matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map((m) => m[0]).filter((x) => x !== b.out);
      return [b.in];
    };
    // Columna de cada bloque: 1 + la mayor de sus entradas; un lazo (por un acumulador o una planta) no suma.
    const byOut = new Map(s.blocks.map((b) => [b.out, b]));
    const col = new Map();
    const depth = (v, stack) => {
      if (prod.has(v)) return 0;
      const b = byOut.get(v);
      if (!b || stack.has(b)) return 0;
      if (col.has(v)) return col.get(v);
      stack.add(b);
      const d = 1 + Math.max(0, ...ins(b).map((x) => depth(x, stack)));
      stack.delete(b);
      col.set(v, d);
      return d;
    };
    for (const b of s.blocks) depth(b.out, new Set());
    s.blocks.forEach((b, i) => prod.set(b.out, { col: col.get(b.out) ?? 1, node: { v: b.out, label: BLOCK_NAME[b.block] ?? b.block, sub: `${b.out}`, block: i } }));
    const maxCol = Math.max(1, ...[...prod.values()].map((x) => x.col));
    const outs = [];
    for (const e of s.io) if (e.kind === "digital-out" || e.kind === "analog-out") outs.push({ v: e.var, label: IO_NAME[e.kind], sub: `${ioTerms(e).join("-")}` });
    for (const t of ["holding", "input"]) for (const r of s.modbus?.[t] ?? []) outs.push({ v: r.var, label: `Modbus ${t === "holding" ? "holding" : "input"} ${r.reg}`, sub: r.var });
    for (const t of ["coils", "discrete"]) for (const r of s.modbus?.[t] ?? []) outs.push({ v: r.var, label: `Modbus ${t === "coils" ? "bobina" : "discreta"} ${r.bit}`, sub: r.var });
    const cols = Array.from({ length: maxCol + 2 }, () => []);
    for (const x of prod.values()) cols[x.col].push(x.node);
    for (const o of outs) cols[maxCol + 1].push({ ...o, out: true });
    const BW = 150;
    const BH = 44;
    const GX = 60;
    const GY = 16;
    const pos = new Map();
    const W = cols.length * (BW + GX) + GX;
    const H = Math.max(...cols.map((c) => c.length), 1) * (BH + GY) + 70;
    let boxes = "";
    cols.forEach((c, ci) =>
      c.forEach((n, ri) => {
        const x = GX + ci * (BW + GX);
        const y = 50 + ri * (BH + GY);
        if (!n.out) pos.set(n.v, { x: x + BW, y: y + BH / 2 });
        n.x = x;
        n.y = y;
        const kind = n.out ? "out" : n.block !== undefined ? "blk" : n.param ? "prm" : "in";
        boxes +=
          `<g class="ce-node ce-${kind}" ${n.block !== undefined ? `data-block="${n.block}"` : ""}><rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="8"/>` +
          `<text x="${x + 10}" y="${y + 18}" class="ce-n1">${esc(n.label)}</text><text x="${x + 10}" y="${y + 34}" class="ce-n2">${esc(n.sub ?? "")}</text></g>`;
      }),
    );
    let edges = "";
    const link = (v, x, y) => {
      const p = pos.get(v);
      if (!p) return;
      const mx = (p.x + x) / 2;
      edges += `<path d="M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${y} ${x} ${y}"/>`;
    };
    for (const c of cols) for (const n of c) {
      if (n.block !== undefined) for (const v of ins(s.blocks[n.block])) link(v, n.x, n.y + BH / 2);
      if (n.out) link(n.v, n.x, n.y + BH / 2);
    }
    const head = ["Entradas", ...Array.from({ length: maxCol }, (_, i) => (i === 0 ? "Modelo" : "")), "Salidas"];
    const heads = head.map((h, i) => (h ? `<text x="${GX + i * (BW + GX)}" y="30" class="ce-colh">${h}</text>` : "")).join("");
    return `<svg class="ce-diagram" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${heads}<g class="ce-edges">${edges}</g>${boxes}</svg>`;
  }

  // ------------------------------------------------------------ paneles
  const ioTerms = (e) => (Array.isArray(e.terminals) ? e.terminals : [e.a, e.b].filter((x) => x !== undefined));
  const varOptions = (cur, { params = true } = {}) => {
    const list = st.check.vars.filter((v) => params || v.from !== "parámetro");
    const has = list.some((v) => v.name === cur);
    return (
      `<option value="">—</option>` +
      (!has && cur ? `<option value="${esc(cur)}" selected>${esc(cur)} (no existe)</option>` : "") +
      list.map((v) => `<option value="${esc(v.name)}" ${v.name === cur ? "selected" : ""}>${esc(v.name)} · ${esc(v.from)}</option>`).join("")
    );
  };
  const paramList = () => `<datalist id="ce-params">${st.spec.parameters.filter((p) => p.type === "number").map((p) => `<option value="${esc(p.id)}">`).join("")}</datalist>`;
  const num = (path, v, label, extra = "") => `<label class="ce-fld">${label}<input data-path="${path}" data-num value="${esc(v ?? "")}" list="ce-params" ${extra}></label>`;
  const txt = (path, v, label, extra = "") => `<label class="ce-fld">${label}<input data-path="${path}" value="${esc(v ?? "")}" ${extra}></label>`;
  const sel = (path, v, label, opts) => `<label class="ce-fld">${label}<select data-path="${path}" data-rerender>${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const chk = (path, v, label) => `<label class="ce-chk"><input type="checkbox" data-path="${path}" ${v ? "checked" : ""}> ${label}</label>`;
  const varSel = (path, v, label) => `<label class="ce-fld">${label}<select data-path="${path}">${varOptions(v)}</select></label>`;
  const card = (title, body, del) => `<div class="ce-card"><div class="ce-card-h"><b>${title}</b>${del ? `<button class="icon" data-act="${del}" title="Quitar" aria-label="Quitar">✕</button>` : ""}</div><div class="ce-card-b">${body}</div></div>`;

  function panel() {
    switch (st.tab) {
      case "dibujo":
        return panelDibujo();
      case "io":
        return panelIo();
      case "modelo":
        return panelModelo();
      case "com":
        return panelCom();
      default:
        return panelProbar();
    }
  }

  function panelDibujo() {
    const sym = st.spec.symbol;
    const w = sym.widgets ?? [];
    return (
      `<h3>Dibujo</h3><p class="ce-p">Sube el SVG de tu componente (Inkscape, Illustrator, Fritzing). Se limpia (sin scripts ni imágenes externas) y se acomoda entre las borneras. Sin dibujo, sale una caja con el nombre.</p>` +
      `<div class="ce-row"><label class="ce-btn">Importar SVG…<input type="file" accept=".svg,image/svg+xml" data-act-file="art" hidden></label>` +
      (st.art ? `<button data-act="art-clear">Quitar dibujo</button>` : "") +
      `</div><div class="ce-row">${num("symbol.width", sym.width, "Ancho (px)", 'step="20" min="40"')}${num("symbol.height", sym.height, "Alto (px)", 'step="20" min="60"')}</div>` +
      txt("description", st.spec.description, "Descripción (la ve el alumno en la paleta)", 'class="ce-wide"') +
      `<h3>Indicadores en el dibujo</h3><p class="ce-p">Muestran una variable en vivo sobre el símbolo. Se arrastran en el lienzo.</p>` +
      `<div class="ce-row"><button data-act="w-add" data-v="value">+ Valor</button><button data-act="w-add" data-v="lamp">+ Luz</button></div>` +
      w
        .map((x, i) =>
          card(
            x.kind === "lamp" ? "Luz" : "Valor",
            varSel(`symbol.widgets.${i}.var`, x.var, "Variable") +
              (x.kind === "lamp"
                ? txt(`symbol.widgets.${i}.color`, x.color, "Color", 'type="color"')
                : txt(`symbol.widgets.${i}.label`, x.label, "Rótulo") + txt(`symbol.widgets.${i}.unit`, x.unit, "Unidad", 'size="6"') + num(`symbol.widgets.${i}.decimals`, x.decimals, "Decimales", 'min="0" max="4"')),
            `w-del:${i}`,
          ),
        )
        .join("")
    );
  }

  function panelIo() {
    const s = st.spec;
    const cards = s.io
      .map((e, i) => {
        const p = `io.${i}`;
        let body = "";
        if (e.kind !== "power") body += txt(`${p}.var`, e.var, e.kind === "digital-out" || e.kind === "analog-out" ? "Variable que sale" : "Nombre de la variable", 'size="14"');
        if (e.kind === "digital-out" || e.kind === "analog-out") body = varSel(`${p}.var`, e.var, "Variable que sale");
        if (e.kind === "power") body += txt(`${p}.var`, e.var, "Variable (opcional, 1 con tensión)", 'size="12"');
        body += txt(`${p}.label`, e.label, "Rótulo");
        if (e.kind !== "read" && e.kind !== "control") {
          const ts = ioTerms(e);
          body += `<div class="ce-row">${ts.map((t, k) => txt(`${p}.${Array.isArray(e.terminals) ? `terminals.${k}` : k ? "b" : "a"}`, t, `Borne ${k + 1}`, 'size="6"')).join("")}</div>`;
        }
        if (e.kind === "power" || e.kind === "digital-in") body += sel(`${p}.rating`, e.rating ?? "24VDC", "Tensión", [["24VDC", "24 VDC"], ["12VDC", "12 VDC"], ["230VAC", "230 VAC"]]);
        if (e.kind === "digital-out") body += chk(`${p}.nc`, e.nc, "Normalmente cerrado (abre con 1)");
        if (e.kind === "analog-in" || e.kind === "analog-out") {
          body += sel(`${p}.signal`, e.signal, "Señal", [["0-10V", "0-10 V"], ["4-20mA", "4-20 mA"], ["pt100", "PT100 (°C)"]]);
          if (e.signal !== "pt100") body += `<div class="ce-row">${num(`${p}.min`, e.min, "Valor en el mínimo")}${num(`${p}.max`, e.max, "Valor en el máximo")}</div>`;
        }
        if (e.kind === "read") body += txt(`${p}.source`, e.source, "Salida a leer (equipo.salida)", 'placeholder="T1.nivelPct"');
        if (e.kind === "control") {
          body += sel(`${p}.control`, e.control, "Tipo", [["button", "Botón (vuelve solo)"], ["switch", "Selector (queda)"], ["slider", "Perilla o deslizador"]]);
          if (e.control === "slider") body += `<div class="ce-row">${num(`${p}.min`, e.min, "Mínimo")}${num(`${p}.max`, e.max, "Máximo")}${num(`${p}.default`, e.default, "Inicial")}</div>`;
        }
        return card(`${IO_NAME[e.kind] ?? e.kind}`, body, `io-del:${i}`);
      })
      .join("");
    return (
      `<h3>E/S y bornes</h3><p class="ce-p">Cada E/S crea sus bornes en el dibujo. Las entradas van arriba y las salidas abajo; después se arrastran.</p>` +
      `<div class="ce-add">${IO_ADD.map(([id, name, hint]) => `<button data-act="io-add" data-v="${id}" title="${esc(hint)}">+ ${name}</button>`).join("")}</div>` +
      (cards || `<p class="ce-p">Todavía no hay E/S.</p>`) +
      paramList()
    );
  }

  function blockBody(b, i) {
    const p = `blocks.${i}`;
    let body = "";
    if (b.block !== "expr") body += varSel(`${p}.in`, b.in, "Entrada");
    body += txt(`${p}.out`, b.out, "Salida (variable nueva)", 'size="14"');
    switch (b.block) {
      case "tf": {
        const models = st.info?.models ?? ["1.er orden", "2.º orden", "3.er orden", "4.º orden", "2.º orden oscilatorio"];
        const osc = b.model === models[4];
        const n = osc ? 0 : Math.max(1, models.indexOf(b.model) + 1);
        body += sel(`${p}.model`, b.model ?? models[0], "Modelo", models.map((m) => [m, m]));
        body += `<div class="ce-formula">${osc ? "G(s) = K·ωn²·e<sup>−θs</sup> / (s² + 2ζωn·s + ωn²)" : `G(s) = K·e<sup>−θs</sup> / ${Array.from({ length: n }, (_, k) => `(τ${k + 1}·s + 1)`).join("")}`}</div>`;
        body += `<div class="ce-row">${num(`${p}.K`, b.K, "K (ganancia)")}${num(`${p}.theta`, b.theta, "θ, tiempo muerto (s)")}${num(`${p}.y0`, b.y0, "Valor inicial")}</div>`;
        if (osc) body += `<div class="ce-row">${num(`${p}.wn`, b.wn, "ωn (rad/s)")}${num(`${p}.zeta`, b.zeta, "ζ (< 1 oscila)")}</div>`;
        else body += `<div class="ce-row">${Array.from({ length: n }, (_, k) => num(`${p}.tau${k + 1}`, b[`tau${k + 1}`], `τ${k + 1} (s)`)).join("")}</div>`;
        break;
      }
      case "integrator":
        body += `<div class="ce-formula">salida(t) = valor inicial + ∫ ganancia · entrada · dt, entre mín y máx</div>`;
        body += `<div class="ce-row">${num(`${p}.gain`, b.gain, "Ganancia")}${num(`${p}.y0`, b.y0, "Inicial")}${num(`${p}.min`, b.min, "Mín")}${num(`${p}.max`, b.max, "Máx")}</div>`;
        break;
      case "expr":
        body += txt(`${p}.expr`, b.expr, "Fórmula", 'class="ce-wide ce-mono" spellcheck="false"');
        body += `<p class="ce-p">Variables: ${st.check.vars.map((v) => `<code>${esc(v.name)}</code>`).join(" ") || "—"}. Funciones: min, max, abs, sqrt, exp, ln, clamp(x, a, b), round; condición: <code>a &gt; b ? 1 : 0</code>.</p>`;
        break;
      case "table":
        body += `<label class="ce-fld">Puntos (una fila «x, y» por línea; x en aumento)<textarea data-path="${p}.points" data-points rows="4" class="ce-mono">${esc((b.points ?? []).map((q) => q.join(", ")).join("\n"))}</textarea></label>`;
        break;
      case "compare":
        body += `<div class="ce-row">${num(`${p}.high`, b.high, "Umbral alto")}${num(`${p}.low`, b.low, "Umbral bajo")}</div>` + chk(`${p}.invert`, b.invert, "Invertir (1 bajo el umbral: nivel bajo, falta de presión)");
        break;
      case "limit":
        body += `<div class="ce-row">${num(`${p}.min`, b.min, "Mínimo")}${num(`${p}.max`, b.max, "Máximo")}</div>`;
        break;
      case "timer":
        body += `<div class="ce-row">${sel(`${p}.mode`, b.mode ?? "on", "Tipo", [["on", "A la conexión"], ["off", "A la desconexión"]])}${num(`${p}.ms`, b.ms, "Tiempo (ms)")}</div>`;
        break;
    }
    return body;
  }

  function panelModelo() {
    const s = st.spec;
    const params = s.parameters
      .map(
        (q, i) =>
          `<tr><td><input data-path="parameters.${i}.id" value="${esc(q.id)}" size="9"></td><td><input data-path="parameters.${i}.label" value="${esc(q.label ?? "")}" size="14"></td>` +
          `<td><input data-path="parameters.${i}.default" data-num value="${esc(q.default)}" size="6"></td><td><input data-path="parameters.${i}.unit" value="${esc(q.unit ?? "")}" size="5"></td>` +
          `<td><button class="icon" data-act="p-del:${i}" aria-label="Quitar">✕</button></td></tr>`,
      )
      .join("");
    const vars = Object.entries(s.vars ?? {})
      .map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><input data-var="${esc(k)}" data-num value="${esc(v)}" size="6"></td><td><button class="icon" data-act="v-del:${esc(k)}" aria-label="Quitar">✕</button></td></tr>`)
      .join("");
    return (
      `<h3>Parámetros ajustables</h3><p class="ce-p">Se cambian en Propiedades al usar el componente. Un número de un bloque puede ser el nombre de un parámetro.</p>` +
      `<table class="ce-tbl"><tr><th>Nombre</th><th>Rótulo</th><th>Valor</th><th>Unidad</th><th></th></tr>${params}</table><button data-act="p-add">+ Parámetro</button>` +
      `<h3>Variables de estado</h3><p class="ce-p">Valores que guarda el equipo y cambia el PLC por Modbus o el alumno (consignas).</p>` +
      `<table class="ce-tbl"><tr><th>Variable</th><th>Inicial</th><th></th></tr>${vars}</table>` +
      `<div class="ce-row"><input id="ce-newvar" placeholder="consigna" size="12"><button data-act="v-add">+ Variable</button></div>` +
      `<h3>Bloques del modelo</h3><p class="ce-p">Se calculan en orden de dependencias cada ${esc(s.stepMs)} ms (paso del modelo). Mira el «Diagrama del modelo» en el lienzo.</p>` +
      `<div class="ce-row">${num("stepMs", s.stepMs, "Paso del modelo (ms)", 'min="1"')}</div>` +
      `<div class="ce-add">${BLOCK_ADD.map(([id, name, hint]) => `<button data-act="b-add" data-v="${id}" title="${esc(hint)}">+ ${name}</button>`).join("")}</div>` +
      s.blocks.map((b, i) => `<div id="ce-block-${i}">${card(`${i + 1}. ${BLOCK_NAME[b.block] ?? b.block}`, blockBody(b, i), `b-del:${i}`)}</div>`).join("") +
      paramList()
    );
  }

  function panelCom() {
    const m = st.spec.modbus;
    let html = `<h3>RS-485 · Modbus RTU</h3><p class="ce-p">El componente responde al PLC (maestro, UART2) por sus bornes A y B cableados a RS485_A/B de la placa.</p>` + `<label class="ce-chk"><input type="checkbox" data-act-change="modbus" ${m ? "checked" : ""}> Esclavo Modbus RTU</label>`;
    if (m) {
      html +=
        `<div class="ce-row">${num("modbus.address", m.address, "Dirección (1-247)")}${sel("modbus.baud", m.baud ?? 9600, "Velocidad (8N1)", BAUDS.map((b) => [b, String(b)]))}${num("modbus.responseMs", m.responseMs ?? 5, "Demora (ms)")}</div>` +
        `<div class="ce-row">${txt("modbus.a", m.a ?? "A", "Borne A", 'size="5"')}${txt("modbus.b", m.b ?? "B", "Borne B", 'size="5"')}</div>`;
      const rows = [];
      for (const t of ["input", "holding"]) (m[t] ?? []).forEach((r, i) => rows.push({ t, i, r, bit: false }));
      for (const t of ["coils", "discrete"]) (m[t] ?? []).forEach((r, i) => rows.push({ t, i, r, bit: true }));
      html +=
        `<table class="ce-tbl"><tr><th>Tabla</th><th>Dir.</th><th>Variable</th><th>Tipo</th><th>Escala</th><th>Escribe</th><th></th></tr>` +
        rows
          .map(({ t, i, r, bit }) => {
            const p = `modbus.${t}.${i}`;
            return (
              `<tr><td>${{ input: "Input (04)", holding: "Holding (03/06/16)", coils: "Bobina (01/05)", discrete: "Discreta (02)" }[t]}</td>` +
              `<td><input data-path="${p}.${bit ? "bit" : "reg"}" data-int value="${esc(bit ? r.bit : r.reg)}" size="4"></td>` +
              `<td><select data-path="${p}.var">${varOptions(r.var)}</select></td>` +
              `<td>${bit ? "bit" : `<select data-path="${p}.type">${["int16", "uint16", "int32", "float32"].map((x) => `<option ${x === (r.type ?? "int16") ? "selected" : ""}>${x}</option>`).join("")}</select>`}</td>` +
              `<td>${bit ? "" : `<input data-path="${p}.scale" data-num value="${esc(r.scale ?? 1)}" size="4" title="valor × escala = registro">`}</td>` +
              `<td>${t === "holding" || t === "coils" ? `<input type="checkbox" data-path="${p}.write" ${r.write ? "checked" : ""}>` : ""}</td>` +
              `<td><button class="icon" data-act="r-del:${t}:${i}" aria-label="Quitar">✕</button></td></tr>`
            );
          })
          .join("") +
        `</table><div class="ce-add">${[["input", "Input register"], ["holding", "Holding register"], ["coils", "Bobina"], ["discrete", "Entrada discreta"]].map(([t, l]) => `<button data-act="r-add" data-v="${t}">+ ${l}</button>`).join("")}</div>` +
        `<p class="ce-p">Escala: el registro vale variable × escala (pH × 100 → 640 = 6,40). Solo se escriben variables de estado (Modelo → Variables de estado).</p>`;
    }
    html += `<h3>Ethernet · Modbus TCP</h3><p class="ce-p">Próximo hito: el mismo mapa de registros servido en una IP de la red virtual de la escena.</p>`;
    return html;
  }

  function panelProbar() {
    const s = st.spec;
    const b = st.bench;
    const i = b.inputs;
    const out = b.state?.outputs ?? {};
    const fmt = (v) => (typeof v === "number" ? (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(3).replace(/\.?0+$/, "")) : "—") : typeof v === "boolean" ? (v ? "1" : "0") : esc(v));
    let ins = "";
    if (s.io.some((e) => e.kind === "power")) ins += `<label class="ce-chk"><input type="checkbox" data-bench="power" ${i.power ? "checked" : ""}> Alimentación</label>`;
    for (const e of s.io) {
      if (e.kind === "digital-in") ins += `<label class="ce-chk"><input type="checkbox" data-bench="digital.${esc(e.var)}" ${i.digital[e.var] ? "checked" : ""}> ${esc(e.label || e.var)} (${esc(ioTerms(e).join("-"))})</label>`;
      if (e.kind === "analog-in") {
        const max = e.signal === "0-10V" ? 10 : e.signal === "4-20mA" ? 20 : 400;
        const v = i.analog[e.var] ?? (e.signal === "4-20mA" ? 4 : 0);
        ins += `<label class="ce-fld">${esc(e.label || e.var)}: <b>${fmt(Number(v))} ${e.signal === "pt100" ? "°C" : e.signal === "0-10V" ? "V" : "mA"}</b><input type="range" min="0" max="${max}" step="0.1" value="${v}" data-bench="analog.${esc(e.var)}"></label>`;
      }
      if (e.kind === "read") ins += num(`__bench.reads.${e.var}`, i.reads[e.var] ?? 0, `${esc(e.var)} (lectura de ${esc(e.source)})`).replace("data-path", "data-bench-num");
      if (e.kind === "control") {
        if (e.control === "slider") ins += `<label class="ce-fld">${esc(e.label || e.var)}: <b>${fmt(Number(i.actions[e.var] ?? e.default ?? 0))}</b><input type="range" min="${esc(e.min ?? 0)}" max="${esc(e.max ?? 100)}" step="any" value="${esc(i.actions[e.var] ?? e.default ?? 0)}" data-bench="actions.${esc(e.var)}"></label>`;
        else ins += `<label class="ce-chk"><input type="checkbox" data-bench="actions.${esc(e.var)}" ${i.actions[e.var] ? "checked" : ""}> ${esc(e.label || e.var)}</label>`;
      }
    }
    const vars = Object.entries(out).filter(([k]) => !k.startsWith("ao_") && k !== "powered");
    const outsIo = s.io
      .filter((e) => e.kind === "digital-out" || e.kind === "analog-out")
      .map((e, k) => {
        if (e.kind === "analog-out") return `<tr><td>${esc(ioTerms(e).join("-"))}</td><td>${fmt(out[`ao_${e.var}`])} ${e.signal === "pt100" ? "°C" : e.signal === "0-10V" ? "V" : "mA"}</td></tr>`;
        const idx = s.io.filter((x) => x.kind === "digital-out").indexOf(e);
        const closed = b.state?.contacts?.[`do${idx}_${e.var}`];
        return `<tr><td>${esc(ioTerms(e).join("-"))}</td><td class="${closed ? "ce-on" : ""}">${closed ? "cerrado" : "abierto"}</td></tr>`;
      })
      .join("");
    const regs = (b.state?.regs ?? [])
      .map(
        (r) =>
          `<tr><td>${esc(r.table)} ${r.reg}</td><td>${esc(r.var)}</td><td class="ce-mono">${r.words === null ? "sin respuesta" : r.words.join(" ")}</td>` +
          `<td>${r.write ? `<input size="6" data-bench-write="${esc(r.table)}:${r.reg}" placeholder="valor"> ` : ""}</td></tr>`,
      )
      .join("");
    return (
      `<h3>Probar</h3><p class="ce-p">Corre el componente solo, con el mismo motor que la escena. Mueve las entradas y mira las salidas.</p>` +
      `<div class="ce-row"><button class="primary" data-act="bench-toggle">${b.running ? "⏸ Pausar" : "▶ Correr"}</button><button data-act="bench-reset">↺ Reiniciar</button>` +
      `<select data-bench-speed>${[1, 10, 60].map((x) => `<option value="${x}" ${b.speed === x ? "selected" : ""}>×${x}</option>`).join("")}</select>` +
      `<span class="ce-mono">t = ${((b.state?.tMs ?? 0) / 1000).toFixed(1)} s</span></div>` +
      `<h4>Entradas</h4>${ins || `<p class="ce-p">Sin entradas.</p>`}` +
      `<h4>Gráfica</h4><canvas id="ce-trend" width="360" height="150"></canvas><div class="ce-row ce-legend">${vars.map(([k]) => `<label class="ce-chk"><input type="checkbox" data-watch="${esc(k)}" ${b.watch.includes(k) ? "checked" : ""}> ${esc(k)}</label>`).join("")}</div>` +
      `<h4>Variables</h4><table class="ce-tbl">${vars.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="ce-mono">${fmt(v)}</td></tr>`).join("")}</table>` +
      (outsIo ? `<h4>Bornes de salida</h4><table class="ce-tbl">${outsIo}</table>` : "") +
      (regs ? `<h4>Registros Modbus</h4><table class="ce-tbl"><tr><th>Registro</th><th>Variable</th><th>Palabras</th><th>Escribir</th></tr>${regs}</table>` : "")
    );
  }

  // ------------------------------------------------------------ edición
  function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let k = 0; k < keys.length - 1; k++) {
      const key = keys[k];
      if (o[key] === undefined) o[key] = /^\d+$/.test(keys[k + 1]) ? [] : {};
      o = o[key];
    }
    o[keys.at(-1)] = value;
  }
  const asNum = (v) => (v === "" ? "" : Number.isFinite(Number(v)) ? Number(v) : v);

  let checkTimer = 0;
  function changed({ rerender = false } = {}) {
    st.note = "";
    if (rerender) render();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(refresh, 150);
  }
  async function refresh() {
    const s = st.spec;
    const [check, sym] = await Promise.all([api.compCheck(s), api.compSymbol(s, st.art)]);
    st.check = check;
    if (sym.ok) st.sym = sym;
    else st.error = sym.error;
    // Repintar el lienzo y el pie sin perder el foco del panel.
    const stage = $("ce-stage");
    if (stage) {
      stage.innerHTML = st.view === "dibujo" ? stageSymbol() : stageDiagram();
      decorateStage();
    }
    refreshFoot();
    // Las listas de variables del panel dependen de la validación.
    const panelEl = el().querySelector(".ce-panel");
    if (panelEl && !panelEl.contains(document.activeElement) && st.tab !== "probar") panelEl.innerHTML = panel();
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.path && !t.dataset.path.startsWith("__")) {
      let v = t.type === "checkbox" ? t.checked : t.value;
      if (t.dataset.num !== undefined) v = asNum(v);
      if (t.dataset.int !== undefined) v = Math.round(Number(v) || 0);
      if (t.dataset.points !== undefined) {
        v = t.value
          .split(/\n/)
          .map((l) => l.split(/[,;\s]+/).filter(Boolean).map(Number))
          .filter((q) => q.length === 2 && q.every(Number.isFinite));
      }
      if (t.dataset.path === "modbus.baud") v = Number(v);
      setPath(st.spec, t.dataset.path, v);
      if (t.dataset.path === "name" && !st.typeEdited) st.spec.type = `${st.spec.type.split("/")[0]}/${slug(v) || "componente"}`;
      changed({ rerender: e.type === "change" && t.dataset.rerender !== undefined });
      return;
    }
    if (t.dataset.meta && e.type === "input") {
      const [author, id] = st.spec.type.split("/");
      if (t.dataset.meta === "author") st.spec.type = `${slug(t.value)}/${id ?? ""}`;
      else {
        st.typeEdited = true;
        st.spec.type = `${author}/${slug(t.value)}`;
      }
      return changed();
    }
    if (t.dataset.var !== undefined) {
      st.spec.vars[t.dataset.var] = asNum(t.value);
      return changed();
    }
    if (t.dataset.actFile === "art" && e.type === "change") return importArt(t.files?.[0]);
    if (t.dataset.actChange === "example" && e.type === "change") return openExample(t.value);
    if (t.dataset.actChange === "modbus" && e.type === "change") {
      if (t.checked) st.spec.modbus = { address: 1, baud: 9600, responseMs: 5, input: [], holding: [], coils: [], discrete: [] };
      else delete st.spec.modbus;
      return changed({ rerender: true });
    }
    // Banco de prueba.
    if (t.dataset.bench) {
      const v = t.type === "checkbox" ? t.checked : Number(t.value);
      setPath(st.bench.inputs, t.dataset.bench, v);
      if (!st.bench.running) benchTick(0);
      return;
    }
    if (t.dataset.benchNum !== undefined) {
      setPath(st.bench.inputs, t.dataset.benchNum.replace(/^__bench\./, ""), Number(t.value) || 0);
      return;
    }
    if (t.dataset.benchSpeed !== undefined) st.bench.speed = Number(t.value);
    if (t.dataset.watch && e.type === "change") {
      const w = st.bench.watch;
      if (t.checked) w.push(t.dataset.watch);
      else w.splice(w.indexOf(t.dataset.watch), 1);
      drawTrend();
    }
    if (t.dataset.benchWrite && e.type === "change") {
      const [table, reg] = t.dataset.benchWrite.split(":");
      api.compBenchWrite(table, Number(reg), Number(t.value)).then((r) => {
        st.note = r?.ok === true ? `Escrito ${t.value} en ${table} ${reg}.` : `El componente rechazó la escritura (${r?.ok === false ? "excepción 02" : `excepción ${r?.ok}`}).`;
        refreshFoot();
      });
    }
  }

  async function onClick(e) {
    const tab = e.target.closest("[data-cetab]");
    if (tab) {
      st.tab = tab.dataset.cetab;
      if (st.tab !== "probar") benchStop();
      render();
      if (st.tab === "probar") benchStart();
      return;
    }
    const view = e.target.closest("[data-ceview]");
    if (view) {
      st.view = view.dataset.ceview;
      return render();
    }
    const node = e.target.closest("[data-block]");
    if (node && st.view === "diagrama") {
      st.tab = "modelo";
      render();
      $(`ce-block-${node.dataset.block}`)?.scrollIntoView({ block: "center" });
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const [act, arg, arg2] = b.dataset.act.split(":");
    const s = st.spec;
    switch (act) {
      case "close":
        return close();
      case "new":
        return load({ spec: blank(), art: null, dir: null }, "Componente nuevo.");
      case "open":
        try {
          const r = await api.compOpen();
          if (r) load(r, `Abierto ${r.dir}.`);
        } catch (err) {
          st.error = clean(err);
          refreshFoot();
        }
        return;
      case "save":
        return save();
      case "art-clear":
        st.art = null;
        return changed({ rerender: true });
      case "w-add":
        (s.symbol.widgets ??= []).push(b.dataset.v === "lamp" ? { kind: "lamp", var: "", x: 20, y: Math.round((s.symbol.height ?? 120) / 2), color: "#37d67a" } : { kind: "value", var: "", x: Math.round((s.symbol.width ?? 160) / 2), y: Math.round((s.symbol.height ?? 120) / 2), decimals: 1, unit: "", label: "" });
        return changed({ rerender: true });
      case "w-del":
        s.symbol.widgets.splice(Number(arg), 1);
        return changed({ rerender: true });
      case "io-add": {
        const tpl = structuredClone(IO_ADD.find((x) => x[0] === b.dataset.v)[3]);
        // Bornes y variables sin repetir: X1/X2 → X3/X4…
        const used = new Set(st.check.terminals.map((t) => t.id));
        const vars = new Set(st.check.vars.map((v) => v.name));
        const bump = (id) => {
          if (!used.has(id)) return id;
          const m = /^(.*?)(\d+)$/.exec(id);
          let k = m ? Number(m[2]) : 1;
          let cand;
          do cand = m ? `${m[1]}${++k}` : `${id}${++k}`;
          while (used.has(cand));
          return cand;
        };
        if (tpl.a) {
          tpl.a = bump(tpl.a);
          used.add(tpl.a);
          tpl.b = bump(tpl.b);
        }
        if (tpl.var) {
          let v = tpl.var;
          let k = 1;
          while (vars.has(v)) v = `${tpl.var}${++k}`;
          tpl.var = v;
        }
        s.io.push(tpl);
        return changed({ rerender: true });
      }
      case "io-del":
        s.io.splice(Number(arg), 1);
        return changed({ rerender: true });
      case "b-add": {
        const tpl = structuredClone(BLOCK_ADD.find((x) => x[0] === b.dataset.v)[3]);
        const vars = new Set(st.check.vars.map((v) => v.name));
        let out = tpl.out;
        let k = 1;
        while (vars.has(out)) out = `${tpl.out}${++k}`;
        tpl.out = out;
        s.blocks.push(tpl);
        changed({ rerender: true });
        $(`ce-block-${s.blocks.length - 1}`)?.scrollIntoView({ block: "center" });
        return;
      }
      case "b-del":
        s.blocks.splice(Number(arg), 1);
        return changed({ rerender: true });
      case "p-add": {
        let id = "k";
        let k = 1;
        while (st.check.vars.some((v) => v.name === id)) id = `k${++k}`;
        s.parameters.push({ id, label: "", type: "number", default: 1, unit: "", group: "Modelo" });
        return changed({ rerender: true });
      }
      case "p-del":
        s.parameters.splice(Number(arg), 1);
        return changed({ rerender: true });
      case "v-add": {
        const name = $("ce-newvar")?.value.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name ?? "")) {
          st.error = "La variable debe ser una palabra (letras, números y _).";
          return refreshFoot();
        }
        s.vars[name] = 0;
        return changed({ rerender: true });
      }
      case "v-del":
        delete s.vars[arg];
        return changed({ rerender: true });
      case "r-add": {
        const t = b.dataset.v;
        const list = (s.modbus[t] ??= []);
        const key = t === "coils" || t === "discrete" ? "bit" : "reg";
        const next = list.reduce((m, r) => Math.max(m, r[key] + (r.type === "float32" || r.type === "int32" ? 2 : 1)), 0);
        list.push(key === "bit" ? { bit: next, var: "" } : { reg: next, var: "", type: "int16", scale: 1, ...(t === "holding" ? { write: false } : {}) });
        return changed({ rerender: true });
      }
      case "r-del":
        s.modbus[arg].splice(Number(arg2), 1);
        return changed({ rerender: true });
      case "bench-toggle":
        if (st.bench.running) benchStop();
        else benchRun();
        return render();
      case "bench-reset":
        benchStop();
        return benchStart();
    }
  }

  // ------------------------------------------------------------ arrastre de bornes e indicadores
  function onPointerDown(e) {
    const svg = e.target.closest?.(".ce-sym svg");
    if (!svg) return;
    const term = e.target.closest(".jw-term");
    const widget = e.target.closest("[data-widget]");
    if (!term && !widget) return;
    e.preventDefault();
    const pt = (ev) => {
      const p = svg.createSVGPoint();
      p.x = ev.clientX;
      p.y = ev.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    const W = st.sym.width;
    const H = st.sym.height;
    const s = st.spec;
    const move = (ev) => {
      const p = pt(ev);
      if (term) {
        const x = Math.min(W - GRID, Math.max(GRID, Math.round(p.x / GRID) * GRID));
        const side = p.y < H / 2 ? "t" : "b";
        (s.symbol.pins ??= {})[term.dataset.term] = { side, x };
        term.setAttribute("cx", x);
        term.setAttribute("cy", side === "t" ? 12 : H - 12);
        term.classList.add("ce-drag");
      } else {
        const w = s.symbol.widgets[Number(widget.dataset.widget)];
        w.x = Math.round(Math.min(W, Math.max(0, p.x)));
        w.y = Math.round(Math.min(H, Math.max(0, p.y)));
        widget.setAttribute("transform", `translate(${w.x - (widget._x0 ?? w.x)} ${w.y - (widget._y0 ?? w.y)})`);
      }
    };
    if (widget) {
      const w = s.symbol.widgets[Number(widget.dataset.widget)];
      widget._x0 = w.x;
      widget._y0 = w.y;
    }
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // Dos bornes en el mismo lugar: el que se movía se corre al siguiente libre.
      if (term) {
        const pins = s.symbol.pins;
        const me = term.dataset.term;
        const clash = () => Object.entries(pins).some(([id, q]) => id !== me && q.side === pins[me].side && q.x === pins[me].x);
        while (clash() && pins[me].x < W - GRID) pins[me].x += GRID;
      }
      changed();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ------------------------------------------------------------ dibujo del autor
  async function importArt(file) {
    if (!file) return;
    try {
      const text = await file.text();
      if (!/<svg\b/i.test(text)) throw new Error("el archivo no es un SVG");
      st.art = text;
      // Tamaño inicial con la proporción del dibujo (ancho 200 a 400 px).
      const vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(text)?.[1]?.trim().split(/[\s,]+/).map(Number);
      if (vb?.length === 4 && vb[2] > 0 && vb[3] > 0) {
        const w = Math.min(400, Math.max(st.spec.symbol.width ?? 160, 200));
        st.spec.symbol.width = Math.round(w / GRID) * GRID;
        st.spec.symbol.height = Math.max(80, Math.round(((w - 8) * (vb[3] / vb[2]) + 48) / GRID) * GRID);
      }
      st.error = "";
      st.note = `Dibujo importado: ${file.name}.`;
      changed({ rerender: true });
    } catch (err) {
      st.error = `No se pudo importar: ${clean(err)}`;
      refreshFoot();
    }
  }

  // ------------------------------------------------------------ abrir, ejemplos, guardar
  async function load(r, note) {
    benchStop();
    st.spec = { ...blank(), ...r.spec, symbol: { widgets: [], ...(r.spec.symbol ?? {}) } };
    st.spec.parameters ??= [];
    st.spec.vars ??= {};
    st.art = r.art ?? null;
    st.dir = r.dir ?? null;
    st.typeEdited = true;
    st.note = note;
    st.error = "";
    st.bench.inputs = { power: true, digital: {}, analog: {}, reads: {}, actions: {} };
    st.bench.watch = [];
    st.bench.hist = [];
    st.check = await api.compCheck(st.spec);
    render();
    changed();
  }
  function openExample(id) {
    const x = st.examples.find((q) => q.id === id);
    if (x) load({ spec: structuredClone(x.spec), art: x.art, dir: null }, `Ejemplo «${x.spec.name}»: al guardar se copia a tu carpeta Dispositivos.`);
  }
  async function save() {
    if (!st.check.ok) {
      st.error = "Corrige lo marcado abajo antes de guardar.";
      return refreshFoot();
    }
    st.busy = true;
    try {
      const r = await api.compSave(st.spec, st.art, st.dir);
      st.dir = r.dir;
      st.spec = { ...st.spec, symbol: r.spec.symbol };
      await window.JwsimScene?.reloadDevices?.();
      st.error = "";
      st.note = `Guardado en ${r.dir}: ya está en la paleta Equipos («${st.spec.category}»).`;
    } catch (err) {
      st.error = clean(err);
    }
    st.busy = false;
    render();
  }

  // ------------------------------------------------------------ banco de prueba
  async function benchStart() {
    if (!st.check.ok) {
      st.bench.state = null;
      st.error = "El componente tiene errores: corrígelos para probarlo.";
      return render();
    }
    try {
      st.bench.state = await api.compBenchStart(st.spec);
      st.bench.hist = [];
      if (!st.bench.watch.length) st.bench.watch = Object.keys(st.bench.state.outputs).filter((k) => typeof st.bench.state.outputs[k] === "number" && !k.startsWith("ao_")).slice(0, 3);
      st.error = "";
    } catch (err) {
      st.error = clean(err);
    }
    if (st.tab === "probar") rerenderBench();
  }
  function benchRun() {
    st.bench.running = true;
    clearInterval(st.bench.timer);
    st.bench.timer = setInterval(() => benchTick(100 * st.bench.speed), 100);
  }
  function benchStop() {
    st.bench.running = false;
    clearInterval(st.bench.timer);
  }
  let ticking = false;
  async function benchTick(dtMs) {
    if (ticking) return;
    ticking = true;
    try {
      const state = await api.compBenchStep(dtMs, st.bench.inputs);
      if (state) {
        st.bench.state = state;
        st.bench.hist.push({ t: state.tMs, v: { ...state.outputs } });
        if (st.bench.hist.length > 600) st.bench.hist.shift();
      }
    } catch (err) {
      st.error = clean(err);
      benchStop();
    }
    ticking = false;
    if (st.tab === "probar") rerenderBench();
  }
  function rerenderBench() {
    const panelEl = el().querySelector(".ce-panel");
    if (!panelEl) return;
    // No reemplazar el control que el usuario está moviendo.
    const active = document.activeElement;
    if (panelEl.contains(active) && active.matches?.("input[type=range], input[data-bench-write], input[data-bench-num]")) {
      for (const td of panelEl.querySelectorAll(".ce-mono")) td.dataset.stale = "1";
      drawTrend();
      return;
    }
    panelEl.innerHTML = panel();
    drawTrend();
    liveSymbol();
  }
  // Indicadores del símbolo en vivo (los mismos data-text y data-show que en la escena).
  function liveSymbol() {
    const svg = el().querySelector(".ce-sym svg");
    if (!svg || !st.bench.state) return;
    for (const t of svg.querySelectorAll("[data-text]")) {
      const [expr, fmt, unit] = t.dataset.text.split(":");
      const v = st.bench.state.outputs[expr.replace(/^out\./, "")];
      const d = Number((fmt ?? "d1").slice(1)) || 0;
      t.textContent = typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(d).replace(".", ",")} ${unit ?? ""}`.trim() : "—";
    }
    for (const c of svg.querySelectorAll("[data-show]")) {
      const m = /^out\.(\w+)>([\d.]+)$/.exec(c.dataset.show);
      if (m) c.style.display = Number(st.bench.state.outputs[m[1]]) > Number(m[2]) ? "" : "none";
    }
  }
  function drawTrend() {
    const cv = $("ce-trend");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#10151b";
    ctx.fillRect(0, 0, W, H);
    const h = st.bench.hist;
    const keys = st.bench.watch;
    if (h.length < 2 || !keys.length) return;
    const colors = ["#2f8cff", "#37d67a", "#ffb020", "#ff5d5d", "#c08cff", "#5fd3e0"];
    const t0 = h[0].t;
    const t1 = h.at(-1).t;
    keys.forEach((k, ki) => {
      const vals = h.map((p) => Number(p.v[k])).filter(Number.isFinite);
      if (!vals.length) return;
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      if (hi - lo < 1e-9) {
        hi += 1;
        lo -= 1;
      }
      ctx.strokeStyle = colors[ki % colors.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      h.forEach((p, i) => {
        const v = Number(p.v[k]);
        if (!Number.isFinite(v)) return;
        const x = ((p.t - t0) / Math.max(1, t1 - t0)) * (W - 8) + 4;
        const y = H - 14 - ((v - lo) / (hi - lo)) * (H - 28);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = colors[ki % colors.length];
      ctx.font = "11px sans-serif";
      ctx.fillText(`${k}: ${lo.toFixed(2)} … ${hi.toFixed(2)}`, 6, 12 + ki * 13);
    });
  }

  // ------------------------------------------------------------ abrir y cerrar
  async function open() {
    el().hidden = false;
    document.body.classList.add("ce-open");
    try {
      st.info ??= await api.compInfo();
      if (!st.examples.length) st.examples = await api.compExamples();
    } catch (err) {
      st.error = clean(err);
    }
    render();
    changed();
  }
  function close() {
    benchStop();
    el().hidden = true;
    document.body.classList.remove("ce-open");
  }

  api.onMenu((cmd) => {
    if (cmd === "componentEditor") open();
  });
  window.JwsimComponentEditor = { open, close, state: () => st, load, openExample };
})();
