// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Editor Ladder del Sim, compatible con el OpenPLC Editor.
//
// Edita el mismo .ld que abre el OpenPLC Editor (cabecera VAR … END_VAR y
// JSON de peldaños). Las operaciones de peldaño (dónde se puede soltar un
// elemento, agregar, borrar, abrir ramas en paralelo y reacomodar) son las
// del propio editor: corren en el proceso principal (app/lib/ladder-edit.mjs,
// IPC ld:op) con su código fijado. Aquí solo va la interfaz: la caja de
// elementos, los placeholders, la selección, las propiedades (variable y
// variante), los peldaños y su comentario, deshacer y rehacer.
//
// Script clásico: usa $, state, api, renderPlcDiagram, renderTabs y
// consoleWrite de app.js.
"use strict";

const ldEdit = {
  on: false,
  file: null,
  tool: null, // { element, variant?, block? }
  sel: new Set(),
  ph: {}, // rungId → placeholders del editor
  undo: [],
  redo: [],
  blocks: null,
};

// Tipos elementales de IEC 61131-3 (lo demás es «derived», como los bloques).
const LD_BASE_TYPES = new Set("BOOL SINT INT DINT LINT USINT UINT UDINT ULINT REAL LREAL TIME DATE TOD DT STRING WSTRING BYTE WORD DWORD LWORD".split(" "));
// Bloques que van primero en la lista (los del curso).
const LD_COMMON_BLOCKS = ["TON", "TOF", "TP", "CTU", "CTD", "CTUD", "R_TRIG", "F_TRIG", "SR", "RS", "MOVE", "EQ", "NE", "GT", "GE", "LT", "LE", "ADD", "SUB", "MUL", "DIV"];

const LD_TOOLS = [
  { element: "contact", variant: "default", label: "Contacto NA", key: "1" },
  { element: "contact", variant: "negated", label: "Contacto NC", key: "2" },
  { element: "contact", variant: "risingEdge", label: "Contacto flanco P", key: "3" },
  { element: "contact", variant: "fallingEdge", label: "Contacto flanco N", key: "4" },
  { sep: true },
  { element: "coil", variant: "default", label: "Bobina", key: "5" },
  { element: "coil", variant: "negated", label: "Bobina negada", key: "6" },
  { element: "coil", variant: "set", label: "Bobina Set", key: "7" },
  { element: "coil", variant: "reset", label: "Bobina Reset", key: "8" },
  { sep: true },
  { element: "block", label: "Bloque (TON, CTU, MOVE…)", key: "9" },
];
const LD_VARIANTS = {
  contact: [
    ["default", "Normal abierto (NA)"],
    ["negated", "Normal cerrado (NC)"],
    ["risingEdge", "Flanco de subida (P)"],
    ["fallingEdge", "Flanco de bajada (N)"],
  ],
  coil: [
    ["default", "Normal"],
    ["negated", "Negada"],
    ["set", "Set (enclava)"],
    ["reset", "Reset (desenclava)"],
    ["risingEdge", "Flanco de subida (P)"],
    ["fallingEdge", "Flanco de bajada (N)"],
  ],
};

const ldEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ldIdent = (s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);

// Iconos de la caja de elementos, con los mismos símbolos del diagrama.
function ldToolIcon(t) {
  const mark = { risingEdge: "P", fallingEdge: "N", set: "S", reset: "R" }[t.variant];
  const m = mark ? `<text x="16" y="15.5" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor" class="ld-ti-mark">${mark}</text>` : "";
  if (t.element === "contact") {
    const neg = t.variant === "negated" ? '<path d="M12 17L20 5" stroke="currentColor" stroke-width="1.4" class="ld-ti-mark"/>' : "";
    return `<svg viewBox="0 0 32 22" width="32" height="22" aria-hidden="true"><path d="M0 11H10M22 11H32M10.7 3V19M21.3 3V19" stroke="currentColor" stroke-width="1.4" fill="none"/>${neg}${m}</svg>`;
  }
  if (t.element === "coil") {
    const neg = t.variant === "negated" ? '<path d="M12.5 16L19.5 6" stroke="currentColor" stroke-width="1.4" class="ld-ti-mark"/>' : "";
    return `<svg viewBox="0 0 32 22" width="32" height="22" aria-hidden="true"><path d="M0 11H8M24 11H32" stroke="currentColor" stroke-width="1.4"/><path d="M11 3C8 7 8 15 11 19M21 3C24 7 24 15 21 19" stroke="currentColor" stroke-width="1.8" fill="none"/>${neg}${m}</svg>`;
  }
  return '<svg viewBox="0 0 32 22" width="32" height="22" aria-hidden="true"><path d="M0 8H7M0 15H7M25 8H32" stroke="currentColor" stroke-width="1.4"/><rect x="7" y="2" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.4" fill="none"/><text x="16" y="14" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">FB</text></svg>';
}

// ------------------------------------------------------------ el archivo .ld
const ldModel = () => (ldEdit.file ? state.models.get(ldEdit.file) : null);
const ldText = () => ldModel()?.getValue() ?? "";
function ldSplit(text) {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  return { head: text.slice(0, a), body: JSON.parse(text.slice(a, b + 1)), tail: text.slice(b + 1) };
}

/** Variables declaradas en la cabecera VAR … END_VAR del POU. */
function ldVars(text) {
  const head = text.slice(0, text.indexOf("{"));
  const out = [];
  for (const m of head.matchAll(/^[ \t]*([A-Za-z_]\w*)[ \t]*(?:AT[ \t]+(%[A-Z]+[\d.]+))?[ \t]*:[ \t]*([A-Za-z_]\w*)[ \t]*(?::=[ \t]*([^;]+?))?[ \t]*;[ \t]*(?:\(\*[ \t]*(.*?)[ \t]*\*\))?/gm)) {
    out.push({ name: m[1], location: m[2] ?? "", type: m[3].toUpperCase(), initial: m[4] ?? null, doc: m[5] ?? "" });
  }
  return out;
}
// La variable como la guarda el editor en el nodo (sync-nodes-with-variables).
const ldVarData = (v) => ({
  name: v.name,
  class: "local",
  type: { definition: LD_BASE_TYPES.has(v.type) ? "base-type" : "derived", value: v.type },
  location: v.location ?? "",
  initialValue: v.initial ?? null,
  documentation: v.doc ?? "",
  debug: false,
});

/** Declara una variable nueva en la cabecera, alineada con las demás. */
function ldDeclare(head, v) {
  const at = v.location ? ` AT ${v.location}` : "";
  const line = `    ${v.name}${at} : ${v.type};${v.doc ? ` (* ${v.doc} *)` : ""}\n`;
  const i = head.search(/^[ \t]*END_VAR/m);
  if (i < 0) return head.replace(/^(\s*PROGRAM[^\n]*\n)/, `$1  VAR\n${line}  END_VAR\n`);
  return head.slice(0, i) + line + head.slice(i);
}

/** Guarda un cambio en el modelo (queda sin guardar: Ctrl+S o Ejecutar). */
function ldCommit(body, head) {
  const model = ldModel();
  if (!model) return;
  const before = model.getValue();
  const parts = ldSplit(before);
  const text = (head ?? parts.head) + JSON.stringify(body, null, 2) + parts.tail;
  if (text === before) return;
  ldEdit.undo.push(before);
  if (ldEdit.undo.length > 100) ldEdit.undo.shift();
  ldEdit.redo = [];
  model.setValue(text);
  renderTabs();
  ldRefresh();
}
function ldUndo(redo = false) {
  const model = ldModel();
  const from = redo ? ldEdit.redo : ldEdit.undo;
  if (!model || !from.length) return;
  (redo ? ldEdit.undo : ldEdit.redo).push(model.getValue());
  model.setValue(from.pop());
  ldEdit.sel.clear();
  renderTabs();
  ldRefresh();
}

// --------------------------------------------------------------- la vista
/** HTML del Ladder para renderPlcDiagram: vista normal o modo edición. */
function ldHtml(text) {
  if (!ldEdit.on) return window.JwsimPlcDiagram.ladderView(text);
  return window.JwsimPlcDiagram.ladderView(text, { edit: true, selected: [...ldEdit.sel], placeholders: ldEdit.tool ? ldEdit.ph : {} });
}
function ldRefresh() {
  if (state.active) renderPlcDiagram(state.active);
  ldRenderToolbar();
}

/** Lo llama renderPlcDiagram: muestra el botón ✎ Editar solo con un .ld. */
function ldEditSync(name, isLd) {
  const btn = $("ld-edit-btn");
  if (!btn) return;
  btn.hidden = !isLd;
  if (!isLd || name !== ldEdit.file) {
    if (ldEdit.on && name !== ldEdit.file) ldStop();
    if (isLd) ldEdit.file = name;
  }
  btn.textContent = ldEdit.on ? "✓ Listo" : "✎ Editar";
  btn.classList.toggle("primary", ldEdit.on);
  $("ld-toolbar").hidden = !(isLd && ldEdit.on);
}

function ldStart() {
  ldEdit.on = true;
  ldEdit.file = state.active;
  ldEdit.sel.clear();
  ldEdit.tool = null;
  $("plc-diagram").classList.add("ld-editing-on");
  ldRefresh();
  if (!ldEdit.blocks) {
    api
      .ldOp({ action: "blocks" })
      .then((r) => (ldEdit.blocks = r.blocks))
      .catch((err) => consoleWrite(`[jwsim] editor Ladder: ${err.message}\n`, "fatal"));
  }
}
function ldStop() {
  ldEdit.on = false;
  ldEdit.tool = null;
  ldEdit.sel.clear();
  ldEdit.ph = {};
  $("ld-pop").hidden = true;
  $("plc-diagram").classList.remove("ld-editing-on");
  $("ld-toolbar").hidden = true;
  if (state.active === ldEdit.file) renderPlcDiagram(state.active);
}

function ldRenderToolbar() {
  const bar = $("ld-toolbar");
  if (!bar || !ldEdit.on) return;
  const t = ldEdit.tool;
  let h = '<span class="ld-tb-group">';
  for (const tool of LD_TOOLS) {
    if (tool.sep) {
      h += '</span><span class="ld-tb-sep"></span><span class="ld-tb-group">';
      continue;
    }
    const on = t && t.element === tool.element && (tool.element === "block" || t.variant === tool.variant);
    const label = tool.element === "block" && on && t.block ? `Bloque ${t.block.split("/").pop()}` : tool.label;
    h += `<button class="ld-tool${on ? " on" : ""}" data-tool="${tool.element}:${tool.variant ?? ""}" title="${ldEsc(label)} (tecla ${tool.key})" aria-pressed="${on ? "true" : "false"}">${ldToolIcon(tool)}<span>${ldEsc(tool.element === "block" ? (on && t.block ? t.block.split("/").pop() : "Bloque") : tool.label.replace(/^(Contacto|Bobina) ?/, "") || tool.label)}</span></button>`;
  }
  h += "</span>";
  const n = ldEdit.sel.size;
  h +=
    '<span class="ld-tb-sep"></span><span class="ld-tb-group">' +
    `<button class="ld-tbtn" data-cmd="undo" title="Deshacer (Ctrl+Z)"${ldEdit.undo.length ? "" : " disabled"}>↶</button>` +
    `<button class="ld-tbtn" data-cmd="redo" title="Rehacer (Ctrl+Y)"${ldEdit.redo.length ? "" : " disabled"}>↷</button>` +
    `<button class="ld-tbtn" data-cmd="props" title="Propiedades del elemento (doble clic)"${n === 1 ? "" : " disabled"}>⚙</button>` +
    `<button class="ld-tbtn" data-cmd="delete" title="Borrar lo seleccionado (Supr)"${n ? "" : " disabled"}>🗑</button>` +
    "</span>";
  const hint = t
    ? `Clic en un rombo ◆ para colocar ${t.element === "block" ? "el bloque" : t.element === "coil" ? "la bobina" : "el contacto"}; los de abajo abren una rama en paralelo. Esc cancela.`
    : n
      ? "Doble clic o ⚙ para cambiar la variable o la variante; Supr borra."
      : "Elija un elemento y luego dónde va. Clic en un elemento para seleccionarlo.";
  h += `<span class="ld-tb-hint">${ldEsc(hint)}</span>`;
  bar.innerHTML = h;
}

// ------------------------------------------------------------ herramientas
async function ldArm(tool) {
  $("ld-pop").hidden = true;
  if (!tool) {
    ldEdit.tool = null;
    ldEdit.ph = {};
    ldRefresh();
    return;
  }
  if (tool.element === "block" && !tool.block) {
    ldBlockChooser();
    return;
  }
  ldEdit.tool = tool;
  ldEdit.sel.clear();
  const { body } = ldSplit(ldText());
  const ph = {};
  await Promise.all(
    body.rungs.map(async (r) => {
      ph[r.id] = (await api.ldOp({ action: "placeholders", rung: r })).placeholders;
    }),
  );
  if (ldEdit.tool !== tool) return;
  ldEdit.ph = ph;
  ldRefresh();
}

async function ldPlace(rungId, key) {
  const tool = ldEdit.tool;
  if (!tool) return;
  const { head, body } = ldSplit(ldText());
  const i = body.rungs.findIndex((r) => r.id === rungId);
  if (i < 0) return;
  let r;
  try {
    r = await api.ldOp({ action: "add", rung: body.rungs[i], placeholder: key, element: tool.element, block: tool.block });
  } catch (err) {
    consoleWrite(`[jwsim] editor Ladder: ${err.message}\n`, "fatal");
    return;
  }
  if (r.error) {
    consoleWrite(`[jwsim] Ladder: ${r.error}\n`, "sys");
    return;
  }
  for (const w of r.warnings ?? []) consoleWrite(`[jwsim] Ladder: ${w}\n`, "sys");
  const node = r.rung.nodes.find((n) => n.id === r.added);
  if (node && tool.variant && (tool.element === "contact" || tool.element === "coil")) node.data = { ...node.data, variant: tool.variant };
  body.rungs[i] = r.rung;
  ldEdit.tool = null;
  ldEdit.ph = {};
  ldEdit.sel = new Set([r.added]);
  ldCommit(body, head);
  // Como el editor: el elemento nuevo pide su variable.
  requestAnimationFrame(() => ldProps(r.added));
}

async function ldDelete() {
  if (!ldEdit.sel.size) return;
  const { head, body } = ldSplit(ldText());
  for (let i = 0; i < body.rungs.length; i++) {
    const rung = body.rungs[i];
    // Las variables de los pines se borran con su bloque, no solas.
    const ids = rung.nodes.filter((n) => ldEdit.sel.has(n.id) && n.type !== "variable" && n.type !== "powerRail").map((n) => n.id);
    if (!ids.length) continue;
    const r = await api.ldOp({ action: "remove", rung, ids });
    for (const w of r.warnings ?? []) consoleWrite(`[jwsim] Ladder: ${w}\n`, "sys");
    body.rungs[i] = r.rung;
  }
  ldEdit.sel.clear();
  $("ld-pop").hidden = true;
  ldCommit(body, head);
}

// ------------------------------------------------------------ peldaños
async function ldAddRung() {
  const { head, body } = ldSplit(ldText());
  const { rung } = await api.ldOp({ action: "new-rung", pou: body.name ?? "main" });
  body.rungs.push(rung);
  ldCommit(body, head);
  requestAnimationFrame(() => $("plc-diagram-body").querySelector(`[data-rung="${CSS.escape(rung.id)}"]`)?.scrollIntoView({ block: "nearest" }));
}
function ldRungAct(rungId, act, el) {
  const { head, body } = ldSplit(ldText());
  const i = body.rungs.findIndex((r) => r.id === rungId);
  if (i < 0) return;
  if (act === "delete") body.rungs.splice(i, 1);
  else if (act === "up" && i > 0) [body.rungs[i - 1], body.rungs[i]] = [body.rungs[i], body.rungs[i - 1]];
  else if (act === "down" && i < body.rungs.length - 1) [body.rungs[i + 1], body.rungs[i]] = [body.rungs[i], body.rungs[i + 1]];
  else if (act === "comment") return ldEditComment(rungId, el);
  else return;
  ldCommit(body, head);
}
function ldEditComment(rungId, span) {
  const { body } = ldSplit(ldText());
  const rung = body.rungs.find((r) => r.id === rungId);
  if (!rung || !span) return;
  const input = document.createElement("input");
  input.className = "ld-cmt-input";
  input.value = rung.comment ?? "";
  input.placeholder = "Qué hace este peldaño";
  input.setAttribute("aria-label", "Comentario del peldaño");
  span.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (!save) return ldRefresh();
    const parts = ldSplit(ldText());
    const r = parts.body.rungs.find((x) => x.id === rungId);
    if (r) r.comment = input.value.trim();
    ldCommit(parts.body, parts.head);
    ldRefresh();
  };
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") finish(true);
    else if (ev.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

// ------------------------------------------------------------ propiedades
function ldFind(id) {
  const parts = ldSplit(ldText());
  for (const rung of parts.body.rungs) {
    const node = rung.nodes.find((n) => n.id === id);
    if (node) return { ...parts, rung, node };
  }
  return null;
}

// Nombre libre para una instancia nueva: TON0, TON1…
function ldFreeName(base, vars) {
  const taken = new Set(vars.map((v) => v.name.toUpperCase()));
  for (let i = 0; ; i++) if (!taken.has(`${base}${i}`.toUpperCase())) return `${base}${i}`;
}

// E/S de la placa que aún no tienen variable (para declarar una nueva).
function ldFreeIo(vars, kind) {
  const used = new Set(vars.map((v) => v.location));
  const out = [];
  for (let i = 0; i < 8; i++) {
    const loc = `%${kind}X0.${i}`;
    if (!used.has(loc)) out.push(loc);
  }
  return out;
}

function ldPlacePop(pop, id) {
  const el = $("plc-diagram-body").querySelector(`[data-node="${CSS.escape(id)}"]`);
  const r = el?.getBoundingClientRect() ?? $("plc-diagram-body").getBoundingClientRect();
  pop.hidden = false;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const below = r.bottom + 8;
  pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below}px`;
}

function ldProps(id) {
  const f = ldFind(id);
  if (!f) return;
  const { node } = f;
  const pop = $("ld-pop");
  const vars = ldVars(ldText());
  const cur = node.data.variable?.name ?? "";
  pop.dataset.node = id;
  if (node.type === "contact" || node.type === "coil") {
    const kind = node.type === "contact" ? "Contacto" : "Bobina";
    const bools = vars.filter((v) => v.type === "BOOL");
    const variant = node.data.variant ?? "default";
    pop.innerHTML =
      `<div class="iec-edit-h">${kind}</div>` +
      '<label class="ld-pop-l">Variable (BOOL)</label>' +
      `<input id="ld-pop-name" class="ld-pop-in" list="ld-pop-list" value="${ldEsc(cur)}" placeholder="p. ej. S1, KM1" spellcheck="false" autocomplete="off">` +
      `<datalist id="ld-pop-list">${bools.map((v) => `<option value="${ldEsc(v.name)}">${ldEsc([v.location, v.doc].filter(Boolean).join(" · "))}</option>`).join("")}</datalist>` +
      '<div id="ld-pop-new" class="ld-pop-new" hidden></div>' +
      '<label class="ld-pop-l">Tipo</label>' +
      `<select id="ld-pop-variant" class="ld-pop-in">${LD_VARIANTS[node.type].map(([v, l]) => `<option value="${v}"${v === variant ? " selected" : ""}>${ldEsc(l)}</option>`).join("")}</select>` +
      '<div class="ld-pop-foot"><button class="small" data-pop="cancel">Cancelar</button><button class="small primary" data-pop="ok">Aplicar</button></div>';
    const name = pop.querySelector("#ld-pop-name");
    const nv = pop.querySelector("#ld-pop-new");
    const io = node.type === "contact" ? "I" : "Q";
    const showNew = () => {
      const s = name.value.trim();
      const known = vars.find((v) => v.name.toUpperCase() === s.toUpperCase());
      if (!s || known || !ldIdent(s)) {
        nv.hidden = !(s && !known && !ldIdent(s));
        nv.innerHTML = nv.hidden ? "" : '<span class="ld-pop-warn">Nombre no válido: letras, números y _, sin empezar por número.</span>';
        return;
      }
      if (nv.dataset.for === s) return;
      nv.dataset.for = s;
      nv.hidden = false;
      const free = ldFreeIo(vars, io);
      nv.innerHTML =
        `<span>Variable nueva <b>${ldEsc(s)}</b> : BOOL</span>` +
        '<label class="ld-pop-l">Dirección</label>' +
        `<select id="ld-pop-loc" class="ld-pop-in"><option value="">Interna (sin dirección)</option>${free.map((l) => `<option value="${l}">${l} · ${io === "I" ? "entrada" : "salida"} de la placa</option>`).join("")}${ldFreeIo(vars, io === "I" ? "Q" : "I")
          .map((l) => `<option value="${l}">${l} · ${io === "I" ? "salida" : "entrada"} de la placa</option>`)
          .join("")}</select>` +
        '<label class="ld-pop-l">Descripción</label><input id="ld-pop-doc" class="ld-pop-in" placeholder="opcional, p. ej. pulsador de marcha">';
    };
    name.addEventListener("input", showNew);
    showNew();
    pop.onsubmit = () => {
      const s = name.value.trim();
      if (s && !ldIdent(s)) return false;
      const variantNew = pop.querySelector("#ld-pop-variant").value;
      const parts = ldSplit(ldText());
      let head = parts.head;
      let v = vars.find((x) => x.name.toUpperCase() === s.toUpperCase());
      if (s && !v) {
        v = { name: s, type: "BOOL", location: pop.querySelector("#ld-pop-loc")?.value ?? "", doc: pop.querySelector("#ld-pop-doc")?.value.trim() ?? "" };
        head = ldDeclare(head, v);
      }
      for (const r of parts.body.rungs)
        for (const n of r.nodes) if (n.id === id) n.data = { ...n.data, variant: variantNew, variable: v ? ldVarData(v) : { name: "" } };
      ldCommit(parts.body, head);
      return true;
    };
    ldPlacePop(pop, id);
    name.focus();
    name.select();
    return;
  }
  if (node.type === "block") {
    const v = node.data.variant ?? {};
    const fb = v.type === "function-block";
    const sig = (v.variables ?? []).filter((x) => x.name !== "EN" && x.name !== "ENO");
    const sigTxt = sig.map((x) => `${x.class === "input" ? "→" : "←"} ${x.name} : ${x.type.value}`).join("<br>");
    const doc = String(v.documentation ?? "").split(/\n\n|\. /)[0];
    const suggest = cur || ldFreeName(v.name, vars);
    pop.innerHTML =
      `<div class="iec-edit-h">Bloque ${ldEsc(v.name)} <span class="muted">${fb ? "bloque de función" : "función"}</span></div>` +
      (doc ? `<div class="ld-pop-doc">${ldEsc(doc)}</div>` : "") +
      `<div class="ld-pop-sig">${sigTxt}</div>` +
      (fb
        ? '<label class="ld-pop-l">Instancia</label>' +
          `<input id="ld-pop-name" class="ld-pop-in" list="ld-pop-list" value="${ldEsc(suggest)}" spellcheck="false" autocomplete="off">` +
          `<datalist id="ld-pop-list">${vars
            .filter((x) => x.type === String(v.name).toUpperCase())
            .map((x) => `<option value="${ldEsc(x.name)}"></option>`)
            .join("")}</datalist>` +
          `<div class="ld-pop-note">Si no existe, se declara <b>${ldEsc(suggest)} : ${ldEsc(v.name)};</b> en las variables del programa.</div>`
        : "") +
      '<div class="ld-pop-foot"><button class="small" data-pop="cancel">Cerrar</button>' +
      (fb ? '<button class="small primary" data-pop="ok">Aplicar</button>' : "") +
      "</div>";
    const name = pop.querySelector("#ld-pop-name");
    pop.onsubmit = () => {
      if (!fb) return true;
      const s = name.value.trim();
      if (!ldIdent(s)) return false;
      const parts = ldSplit(ldText());
      let head = parts.head;
      let x = vars.find((q) => q.name.toUpperCase() === s.toUpperCase());
      if (!x) {
        x = { name: s, type: String(v.name).toUpperCase(), location: "", doc: "" };
        head = ldDeclare(head, x);
      }
      for (const r of parts.body.rungs) for (const n of r.nodes) if (n.id === id) n.data = { ...n.data, variable: ldVarData(x) };
      ldCommit(parts.body, head);
      return true;
    };
    ldPlacePop(pop, id);
    name?.focus();
    name?.select();
    return;
  }
  if (node.type === "variable") {
    const pin = node.data.block?.variableType;
    const type = String(pin?.type?.value ?? "").toUpperCase();
    const out = node.data.variant === "output";
    const fits = vars.filter((x) => !type || type.startsWith("ANY") || x.type === type);
    const example = { TIME: "T#5s", INT: "10", DINT: "10", REAL: "1.5", BOOL: "TRUE" }[type];
    pop.innerHTML =
      `<div class="iec-edit-h">Pin ${ldEsc(pin?.name ?? "")} <span class="muted">${ldEsc(type)} · ${out ? "salida" : "entrada"}</span></div>` +
      `<label class="ld-pop-l">${out ? "Variable que recibe el valor" : "Variable o valor"}</label>` +
      `<input id="ld-pop-name" class="ld-pop-in" list="ld-pop-list" value="${ldEsc(cur)}" placeholder="${ldEsc(out ? "p. ej. TIEMPO" : example ? `p. ej. ${example}` : "")}" spellcheck="false" autocomplete="off">` +
      `<datalist id="ld-pop-list">${fits.map((x) => `<option value="${ldEsc(x.name)}">${ldEsc(x.type)}</option>`).join("")}</datalist>` +
      `<div class="ld-pop-note">${out ? "Déjelo vacío si no se usa." : "Un valor fijo va tal cual (T#3s, 10, TRUE)."}</div>` +
      '<div class="ld-pop-foot"><button class="small" data-pop="cancel">Cancelar</button><button class="small primary" data-pop="ok">Aplicar</button></div>';
    const name = pop.querySelector("#ld-pop-name");
    pop.onsubmit = () => {
      const s = name.value.trim();
      const parts = ldSplit(ldText());
      const x = vars.find((q) => q.name.toUpperCase() === s.toUpperCase());
      // Como el editor: una variable declarada se vincula entera; un valor
      // fijo (T#3s) o una referencia se guardan solo por nombre.
      const variable = x ? ldVarData(x) : { name: s };
      for (const r of parts.body.rungs) {
        const vn = r.nodes.find((n) => n.id === id);
        if (!vn) continue;
        vn.data = { ...vn.data, variable };
        // Y en el bloque (connectedVariables), como variable.tsx del editor:
        // de ahí rehace los pines cuando se reacomoda el peldaño.
        const blk = r.nodes.find((n) => n.id === vn.data.block?.id);
        if (blk) {
          const hid = vn.data.block.handleId;
          const keep = (Array.isArray(blk.data.connectedVariables) ? blk.data.connectedVariables : []).filter((c) => c.type !== vn.data.variant || c.handleId !== hid);
          const entry = { handleId: hid, handleTableId: blk.data.variant?.variables?.find((q) => q.name === hid)?.id, type: vn.data.variant, variable };
          if (entry.handleTableId === undefined) delete entry.handleTableId;
          blk.data = { ...blk.data, connectedVariables: s ? [...keep, entry] : keep };
        }
      }
      ldCommit(parts.body, parts.head);
      return true;
    };
    ldPlacePop(pop, id);
    name.focus();
    name.select();
  }
}

function ldBlockChooser() {
  const pop = $("ld-pop");
  const list = ldEdit.blocks ?? [];
  const rank = (b) => {
    const i = LD_COMMON_BLOCKS.indexOf(b.variant.name);
    return i < 0 ? 100 : i;
  };
  const sorted = [...list].sort((a, b) => rank(a) - rank(b) || a.variant.name.localeCompare(b.variant.name));
  pop.dataset.node = "";
  pop.innerHTML =
    '<div class="iec-edit-h">Bloque</div>' +
    '<input id="ld-blk-q" class="ld-pop-in" placeholder="Buscar: TON, CTU, MOVE…" spellcheck="false" autocomplete="off">' +
    '<div id="ld-blk-list" class="ld-blk-list" role="listbox"></div>';
  const q = pop.querySelector("#ld-blk-q");
  const box = pop.querySelector("#ld-blk-list");
  const draw = () => {
    const s = q.value.trim().toUpperCase();
    const hits = sorted.filter((b) => !s || b.variant.name.includes(s)).slice(0, 60);
    box.innerHTML = hits.length
      ? hits
          .map(
            (b) =>
              `<button class="ld-blk" data-block="${ldEsc(b.id)}" role="option"><b>${ldEsc(b.variant.name)}</b><span>${ldEsc(String(b.variant.documentation ?? "").split(/\n|\. /)[0].slice(0, 70))}</span></button>`,
          )
          .join("")
      : '<div class="muted">Sin resultados.</div>';
  };
  q.addEventListener("input", draw);
  q.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") box.querySelector(".ld-blk")?.click();
  });
  draw();
  pop.onsubmit = null;
  const btn = $("ld-toolbar").querySelector('[data-tool="block:"]') ?? $("ld-toolbar");
  const r = btn.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${r.bottom + 6}px`;
  q.focus();
}

// ------------------------------------------------------------ eventos
function wireLadderEdit() {
  const body = $("plc-diagram-body");
  const pop = $("ld-pop");
  $("ld-edit-btn").addEventListener("click", () => (ldEdit.on ? ldStop() : ldStart()));
  $("ld-toolbar").addEventListener("click", (ev) => {
    const tb = ev.target.closest("[data-tool]");
    if (tb) {
      const [element, variant] = tb.dataset.tool.split(":");
      const t = ldEdit.tool;
      const same = t && t.element === element && (element === "block" || t.variant === variant);
      ldArm(same ? null : { element, variant: variant || undefined });
      return;
    }
    const cmd = ev.target.closest("[data-cmd]")?.dataset.cmd;
    if (cmd === "undo") ldUndo();
    else if (cmd === "redo") ldUndo(true);
    else if (cmd === "delete") ldDelete();
    else if (cmd === "props" && ldEdit.sel.size === 1) ldProps([...ldEdit.sel][0]);
  });
  body.addEventListener("click", (ev) => {
    if (!ldEdit.on) return;
    const ph = ev.target.closest(".ld-ph");
    if (ph) return ldPlace(ph.dataset.rung, ph.dataset.ph);
    const act = ev.target.closest("[data-act]");
    if (act) {
      if (act.dataset.act === "add-rung") return ldAddRung();
      return ldRungAct(act.closest("[data-rung]")?.dataset.rung, act.dataset.act, act);
    }
    if (ldEdit.tool) return;
    const el = ev.target.closest("[data-node].ld-el, [data-node].ld-block");
    if (!el) {
      if (ldEdit.sel.size) {
        ldEdit.sel.clear();
        ldRefresh();
      }
      return;
    }
    const id = el.dataset.node;
    if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ldEdit.sel.has(id) ? ldEdit.sel.delete(id) : ldEdit.sel.add(id);
    else ldEdit.sel = new Set([id]);
    ldRefresh();
    // Los pines de un bloque se editan con un clic.
    if (el.classList.contains("ld-pinvar")) ldProps(id);
  });
  body.addEventListener("dblclick", (ev) => {
    if (!ldEdit.on || ldEdit.tool) return;
    const el = ev.target.closest("[data-node].ld-el, [data-node].ld-block");
    if (el) ldProps(el.dataset.node);
  });
  pop.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pop]");
    if (b?.dataset.pop === "cancel") pop.hidden = true;
    else if (b?.dataset.pop === "ok") {
      if (pop.onsubmit?.() !== false) pop.hidden = true;
    }
    const blk = ev.target.closest("[data-block]");
    if (blk) {
      pop.hidden = true;
      ldArm({ element: "block", block: blk.dataset.block });
    }
  });
  pop.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.matches("input") && !ev.target.closest("#ld-blk-q") && pop.onsubmit) {
      ev.preventDefault();
      if (pop.onsubmit() !== false) pop.hidden = true;
    } else if (ev.key === "Escape") {
      pop.hidden = true;
      ev.stopPropagation();
    }
  });
  document.addEventListener("pointerdown", (ev) => {
    if (!pop.hidden && !ev.target.closest("#ld-pop") && !ev.target.closest("#ld-toolbar")) pop.hidden = true;
  });
  document.addEventListener("keydown", (ev) => {
    if (!ldEdit.on || $("plc-diagram").hidden || state.active !== ldEdit.file) return;
    if (ev.target.closest?.("input, textarea, select, .monaco-editor")) return;
    const k = ev.key;
    if (k === "Escape") {
      if (ldEdit.tool) ldArm(null);
      else if (ldEdit.sel.size) {
        ldEdit.sel.clear();
        ldRefresh();
      }
    } else if ((k === "Delete" || k === "Backspace") && ldEdit.sel.size) {
      ev.preventDefault();
      ldDelete();
    } else if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === "z") {
      ev.preventDefault();
      ldUndo(ev.shiftKey);
    } else if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === "y") {
      ev.preventDefault();
      ldUndo(true);
    } else if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && /^[1-9]$/.test(k)) {
      const tool = LD_TOOLS.filter((t) => !t.sep).find((t) => t.key === k);
      if (tool) ldArm({ element: tool.element, variant: tool.variant });
    } else if (k === "Enter" && ldEdit.sel.size === 1) ldProps([...ldEdit.sel][0]);
  });
}
wireLadderEdit();

// Ganchos para las pruebas (tests/e2e-ladder-editor.mjs).
if (window.jwsimTest) {
  window.jwsimTest.ldText = () => ldText();
  window.jwsimTest.ldEditing = () => ldEdit.on;
  window.jwsimTest.sketchDir = () => state.sketch?.dir ?? null;
}
