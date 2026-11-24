// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Proyectos del OpenPLC Editor para la ruta IEC: el mismo programa en ST,
// Ladder o FBD, con las variables de un solo lugar. Escribe la carpeta con
// project.json, devices/ y pous/programs/main.<st|ld|fbd>, como el editor.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { editorGraphic } from "./graphic.mjs";

const BASE_TYPES = new Set(["BOOL", "INT", "DINT", "UINT", "UDINT", "SINT", "USINT", "WORD", "DWORD", "BYTE", "REAL", "LREAL", "TIME", "STRING", "LINT", "ULINT"]);

/** Variable con la forma que guarda el editor. v = { name, type, at?, init?, doc? } */
function plcVar(v) {
  const base = BASE_TYPES.has(v.type.toUpperCase());
  return {
    name: v.name,
    class: "local",
    type: { definition: base ? "base-type" : "derived", value: base ? v.type.toUpperCase() : v.type },
    location: v.at ?? "",
    initialValue: v.init ?? null,
    documentation: v.doc ?? "",
    debug: false,
  };
}

/** Cabecera PROGRAM … VAR … END_VAR con un comentario por variable. */
function header(name, vars) {
  const w = Math.max(...vars.map((v) => v.name.length + (v.at ? v.at.length + 4 : 0)));
  const lines = vars.map((v) => {
    const left = v.at ? `${v.name} AT ${v.at}` : v.name;
    const decl = `${left.padEnd(w)} : ${v.type}${v.init !== undefined ? ` := ${v.init}` : ""};`;
    return `    ${decl}${v.doc ? ` (* ${v.doc} *)` : ""}`;
  });
  return `PROGRAM ${name}\n  VAR\n${lines.join("\n")}\n  END_VAR\n`;
}

/** Programa en ST: cabecera + cuerpo (texto ya indentado o no). */
export function stProgram({ name = "main", vars, body }) {
  const b = body.replace(/^\n+|\s+$/g, "").split("\n").map((l) => (l ? `  ${l}` : l)).join("\n");
  return `${header(name, vars)}\n${b}\n\nEND_PROGRAM\n`;
}

// ---------------------------------------------------------------- Ladder
// Elemento: "A" contacto NA, "!A" contacto NC, "^A" flanco de subida,
// "vA" flanco de bajada, "=Q" bobina, "!=Q" bobina negada, "S=Q" set,
// "R=Q" reset, { fb: "TON", inst: "T1", pins: { PT: "T#2s" } } bloque
// (pins: variables o literales en las entradas y salidas que no son el riel).
function elementSpec(e) {
  if (typeof e !== "string") return { kind: "block", blockType: e.fb, instanceName: e.inst, pins: Object.entries(e.pins ?? {}).map(([pin, variable]) => ({ pin, variable: String(variable) })) };
  const coil = /^(S|R|!)?=(.+)$/.exec(e);
  if (coil) return { kind: "coil", variable: coil[2], variant: { S: "set", R: "reset", "!": "negated" }[coil[1]] ?? "default" };
  const c = /^([!^v])?(.+)$/.exec(e);
  return { kind: "contact", variable: c[2], variant: { "!": "negated", "^": "risingEdge", v: "fallingEdge" }[c[1]] ?? "default" };
}

function resolveBlock(system, type) {
  const pou = system.flatMap((l) => l.pous).find((p) => p.name.toLowerCase() === type.toLowerCase());
  if (!pou) return undefined;
  return { name: pou.name, type: pou.type, variables: pou.variables.map((v) => ({ name: v.name, class: v.class, type: v.type })), documentation: pou.documentation, extensible: pou.extensible ?? false };
}

/**
 * Peldaño: { comment, elements: [...], branches: [{ at: i, elements: [...] }] }
 * Cada rama va en paralelo con elements[at] (contactos en serie dentro de la
 * rama), igual que un clic en el marcador de abajo del contacto en el editor.
 */
function buildRung(g, i, rung, variables) {
  const rungId = `rung_main_${i}`;
  const spec = { comment: rung.comment ?? "", elements: rung.elements.map(elementSpec) };
  const built = g.buildRungFromSpec({ rungId, spec, variables, resolveBlock: (t) => resolveBlock(g.system, t) });
  if (!built.ok) throw new Error(`peldaño ${i + 1}: ${built.errors.join("; ")}`);
  let r = built.rung;
  const spine = r.nodes.filter((n) => ["contact", "coil", "block"].includes(n.type)).map((n) => n.id);
  const varOf = (name) => {
    const v = variables.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!v) throw new Error(`peldaño ${i + 1}: variable ${name} no declarada`);
    return v;
  };
  for (const br of rung.branches ?? []) {
    let anchor = spine[br.at];
    let first = true;
    for (const e of br.elements) {
      const s = elementSpec(e);
      if (s.kind !== "contact") throw new Error(`peldaño ${i + 1}: en una rama solo van contactos`);
      const nodes = g.renderPlaceholderElements(r);
      const ph = nodes.find((n) => n.type === (first ? "parallelPlaceholder" : "placeholder") && n.data.relatedNode?.id === anchor && (first || n.data.position === "right"));
      if (!ph) throw new Error(`peldaño ${i + 1}: no hay dónde agregar la rama`);
      const res = g.addNewElement({ ...r, nodes: nodes.map((n) => (n === ph ? { ...n, selected: true } : n)) }, { elementType: "contact" });
      const id = res.newNode.id;
      const nodesOut = g.removePlaceholderElements(res.nodes).map((n) => (n.id === id ? { ...n, data: { ...n.data, variant: s.variant, variable: varOf(s.variable) } } : n));
      r = { ...r, nodes: nodesOut, edges: res.edges };
      anchor = id;
      first = false;
    }
  }
  return { ...r, nodes: r.nodes.map((n) => ({ ...n, selected: false })), selectedNodes: [] };
}

export async function ldProgram({ name = "main", vars, rungs }) {
  const g = await editorGraphic();
  const variables = vars.map(plcVar);
  const body = { name, rungs: rungs.map((r, i) => buildRung(g, i, r, variables)) };
  return `${header(name, vars)}\n${JSON.stringify(body, null, 2)}\nEND_PROGRAM\n`;
}

// ---------------------------------------------------------------- FBD
// Redes: { out: "KM1", expr } asigna una expresión a una variable;
// { fb: "TON", inst: "T1", in: { IN: expr, PT: "T#2s" }, out: { Q: "KM1" } }
// llama a un bloque de función. expr: "A" (variable o literal), "!A"
// (entrada negada), ["AND", e1, e2, …], ["OR", …], ["NOT", e], ["GT", a, b]…
// Se dibuja como en el editor: variables a la izquierda, bloques al centro y
// la salida a la derecha, una red debajo de la otra.
const COL = 190;
const GAP = 16;

export async function fbdProgram({ name = "main", vars, networks }) {
  const g = await editorGraphic();
  const B = g.fbdBuild;
  const variables = vars.map(plcVar);
  const nodes = [];
  const edges = [];
  let order = 0;
  let uid = 0;
  const nid = (k) => `${k}_${(++uid).toString().padStart(4, "0")}_${name}`;
  const varObj = (n) => variables.find((v) => v.name.toLowerCase() === n.toLowerCase()) ?? { id: "", name: n };
  const edge = (s, sh, t, th) => edges.push({ id: `xy-edge__${s}${sh}-${t}${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th, type: "smoothstep" });
  const variant = (type, nIn) => {
    const v = resolveBlock(g.system, type);
    if (!v) throw new Error(`FBD: bloque ${type} desconocido`);
    if (v.extensible && nIn > 2) {
      const ins = v.variables.filter((x) => x.class === "input");
      const extra = Array.from({ length: nIn - ins.length }, (_, k) => ({ ...ins[ins.length - 1], name: `IN${ins.length + k + 1}` }));
      const i = v.variables.indexOf(ins[ins.length - 1]) + 1;
      v.variables = [...v.variables.slice(0, i), ...extra, ...v.variables.slice(i)];
    }
    return v;
  };
  const depth = (e) => (Array.isArray(e) ? 1 + Math.max(...e.slice(1).map(depth)) : 0);
  const sample = B.buildVariableNode({ id: "x", position: { x: 0, y: 0 }, variant: "input-variable" });
  const VAR_W = sample.width;
  const VAR_H = sample.height;
  const VAR_Y = sample.data.outputConnector.relPosition.y;
  const outOf = (n) => n.data.outputHandles.find((h) => h.id !== "ENO") ?? n.data.outputHandles[0];
  // Distancia del borde de arriba a la salida (para alinear con el pin que la recibe).
  const offOf = (e) => (Array.isArray(e) ? outOf(B.buildBlockNode({ id: "x", position: { x: 0, y: 0 }, variant: variant(e[0], e.length - 1) })).relPosition.y : VAR_Y);
  // Dibuja e con su borde derecho en la columna col y su borde de arriba en y0 o más abajo.
  // Devuelve { id, handle, bottom }.
  const draw = (e, col, y0) => {
    if (!Array.isArray(e)) {
      const neg = typeof e === "string" && e.startsWith("!");
      const n = B.buildVariableNode({ id: nid("INPUT-VARIABLE"), position: { x: col * COL + COL - VAR_W - 40, y: y0 }, variant: "input-variable" });
      n.data.variable = varObj(neg ? e.slice(1) : String(e));
      n.data.negated = neg;
      n.selected = false;
      nodes.push(n);
      return { id: n.id, handle: "output-variable", bottom: y0 + VAR_H };
    }
    const [op, ...args] = e;
    const n = B.buildBlockNode({ id: nid("BLOCK"), position: { x: col * COL + 20, y: y0 }, variant: variant(op, args.length) });
    n.selected = false;
    nodes.push(n);
    const ins = n.data.inputHandles.filter((h) => h.id !== "EN");
    let cursor = y0;
    args.forEach((a, k) => {
      const top = Math.max(cursor, y0 + ins[k].relPosition.y - offOf(a));
      const r = draw(a, col - 1, top);
      edge(r.id, r.handle, n.id, ins[k].id);
      cursor = r.bottom + GAP;
    });
    n.data.executionOrder = ++order;
    return { id: n.id, handle: outOf(n).id, bottom: Math.max(cursor - GAP, y0 + n.height) };
  };
  const outVar = (target, x, y) => {
    const o = B.buildVariableNode({ id: nid("OUTPUT-VARIABLE"), position: { x, y }, variant: "output-variable" });
    o.data.variable = varObj(target);
    o.data.executionOrder = ++order;
    o.selected = false;
    nodes.push(o);
    return o;
  };
  // Todas las redes alinean su salida en la misma columna.
  const cols = Math.max(1, ...networks.map((n) => (n.fb ? 1 + Math.max(0, ...Object.values(n.in ?? {}).map(depth)) : Math.max(1, depth(n.expr)))));
  let top = 20;
  for (const net of networks) {
    if (net.out && net.expr !== undefined) {
      const d = Math.max(depth(net.expr), 1);
      // Una asignación directa (A → B) va sin bloque: la variable en la última columna de entradas.
      const r = draw(net.expr, Array.isArray(net.expr) ? cols - 1 : cols - 1, top);
      const src = nodes.find((n) => n.id === r.id);
      const y = src.position.y + (src.type === "block" ? outOf(src).relPosition.y : VAR_Y) - VAR_Y;
      const o = outVar(net.out, cols * COL + 40, y);
      edge(r.id, r.handle, o.id, "input-variable");
      top = Math.max(r.bottom, y + VAR_H) + 40;
      void d;
    } else if (net.fb) {
      const ins = Object.entries(net.in ?? {});
      const col = cols - 1;
      const v = variant(net.fb, 0);
      const n = B.buildBlockNode({ id: nid("BLOCK"), position: { x: col * COL + 20, y: top + 14 }, variant: v });
      n.data.variable = varObj(net.inst);
      n.selected = false;
      nodes.push(n);
      let cursor = top;
      for (const [pin, e] of ins) {
        const h = n.data.inputHandles.find((x) => x.id === pin);
        if (!h) throw new Error(`FBD: ${net.fb} no tiene la entrada ${pin}`);
        const r = draw(e, col - 1, Math.max(cursor, n.position.y + h.relPosition.y - offOf(e)));
        edge(r.id, r.handle, n.id, pin);
        cursor = r.bottom + GAP;
      }
      n.data.executionOrder = ++order;
      let bottom = Math.max(cursor - GAP, n.position.y + n.height);
      for (const [pin, target] of Object.entries(net.out ?? {})) {
        const h = n.data.outputHandles.find((x) => x.id === pin);
        if (!h) throw new Error(`FBD: ${net.fb} no tiene la salida ${pin}`);
        const o = outVar(target, cols * COL + 40, n.position.y + h.relPosition.y - VAR_Y);
        edge(n.id, pin, o.id, "input-variable");
        bottom = Math.max(bottom, o.position.y + VAR_H);
      }
      top = bottom + 40;
    } else throw new Error(`FBD: red no válida ${JSON.stringify(net)}`);
  }
  const body = { name, rung: { comment: "", reactFlowViewport: [1000, Math.max(500, top)], nodes, edges } };
  return `${header(name, vars)}\n${JSON.stringify(body, null, 2)}\nEND_PROGRAM\n`;
}

// ---------------------------------------------------------------- proyecto
const PROJECT = (name) => ({
  meta: { name, type: "plc-project" },
  data: {
    pous: [],
    dataTypes: [],
    libraries: [],
    configuration: {
      resource: {
        tasks: [{ name: "task0", triggering: "Cyclic", interval: "T#20ms", priority: 1 }],
        instances: [{ name: "instance0", program: "main", task: "task0" }],
        globalVariables: [],
      },
    },
  },
});
const DEVICE = { deviceBoard: "JWPLC BASIC [2.0.0]", communicationPort: "", runtimeIpAddress: "", vendorScreenData: {}, vendorScreenDataByBoard: {}, selectedPlatformOptions: {} };

/** Escribe la carpeta del proyecto (la borra antes). lang: st | ld | fbd. */
export function writeProject(dir, { name, lang, program }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "pous", "programs"), { recursive: true });
  mkdirSync(join(dir, "devices"), { recursive: true });
  writeFileSync(join(dir, "project.json"), JSON.stringify(PROJECT(name), null, 2) + "\n");
  writeFileSync(join(dir, "devices", "configuration.json"), JSON.stringify(DEVICE, null, 2) + "\n");
  writeFileSync(join(dir, "devices", "pin-mapping.json"), "{}\n");
  writeFileSync(join(dir, "pous", "programs", `main.${lang}`), program);
}
