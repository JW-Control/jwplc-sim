// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Catálogo vivo de dispositivos de escena (PROPUESTA_AGENTES_JSON.md §4.2).
// Combina las definiciones de scene/devices/ (y dispositivos SDK instalados)
// con los .svg reales de app/renderer/assets/ y jwplc-basic.svg.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { builtinDevices, Registry } from "../../scene/devices/index.mjs";
import { resolveParams, Scene } from "../../scene/scene.mjs";
import { ROOT } from "./build.mjs";
import { installedDevices } from "./device.mjs";

const GRID = 20;
const ASSETS_DEVICES = join(ROOT, "app", "renderer", "assets", "devices");
const BOARD_SVG = join(ROOT, "app", "renderer", "assets", "jwplc-basic.svg");
const FALLBACK_LAYOUT = JSON.parse(readFileSync(join(ROOT, "scene", "layout-fallback.json"), "utf8"));
export const REFERENCE_PATH = join(ROOT, "docs", "REFERENCIA_ESCENA.md");

/** Prefijos automáticos por tipo corto (alineados con app/renderer/scene.js). */
export const PREFIX_BY_TYPE = {
  "jwplc-basic": "plc",
  "remote-io": "KF",
  "power-24vdc": "PS",
  "power-230vac": "L",
  "power-3ph": "Q",
  "pushbutton-no": "S",
  "pushbutton-nc": "S",
  "pushbutton-nono": "S",
  "pushbutton-nonc": "S",
  "pushbutton-lit": "S",
  "emergency-stop": "S",
  "selector-2": "SA",
  "selector-3": "SA",
  "selector-key": "SA",
  "limit-switch": "B",
  "sensor-inductive": "B",
  "sensor-capacitive": "B",
  "sensor-photoelectric": "B",
  "sensor-cylinder": "B",
  "float-switch": "BL",
  "level-electrodes": "BL",
  "pressure-switch": "BP",
  thermostat: "BT",
  lamp: "H",
  "stack-light": "H",
  buzzer: "HA",
  relay: "K",
  "timer-relay": "KT",
  contactor: "KM",
  ssr: "K",
  "level-relay": "KL",
  "solenoid-valve": "Y",
  "solenoid-valve-2": "Y",
  compressor: "C",
  "service-unit": "UM",
  "building-water": "RED",
  lift: "ASC",
  "sand-filter": "FIL",
  chlorinator: "CL",
  "chlorine-rs485": "BCL",
  "pressure-rs485": "BP",
  motor: "M",
  "motor-1ph": "M",
  "motor-3ph": "M",
  "motor-2v": "M",
  "overload-relay": "F",
  breaker: "Q",
  "motor-protector": "QM",
  "vfd-el": "VF",
  potentiometer: "RP",
  "signal-source": "CAL",
  voltmeter: "PV",
  ammeter: "PA",
  "energy-meter": "PM",
  "temp-controller": "TC",
  "usb-rs485": "TF",
  "usb-pc": "XD",
  "pt100-rs485": "BT",
  "ph-rs485": "BPH",
  fermentador: "FER",
  "water-valve": "YV",
  conveyor: "CV",
  "conveyor-physics": "CV",
  tank: "T",
  door: "P",
};

const LINK_PARAM_RE = /^(source|motor|bomba|bombas|cylinder|agua|valvula|extraccion|cisterna|air|consumers|servicio|retrolavado)$/i;
const snap = (v) => Math.round(v / GRID) * GRID;
const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Normaliza un tipo corto ("contactor" -> "jwsim/contactor"). */
export function normalizeType(rawType) {
  const s = String(rawType ?? "").trim();
  if (!s) return "";
  return s.includes("/") ? s : `jwsim/${s}`;
}

export function prefixForType(type) {
  const short = normalizeType(type).split("/")[1];
  return PREFIX_BY_TYPE[short] ?? "D";
}

function parseAttrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = m[3] ?? m[4];
  }
  return out;
}

function parseTemplateSvg(text) {
  const svgTag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!svgTag) return null;
  const vb = String(parseAttrs(svgTag).viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0) return null;
  const [, , w, h] = vb;
  const terms = {};
  for (const m of text.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    if (!String(a.class ?? "").split(/\s+/).includes("jw-term")) continue;
    const id = a["data-term"];
    const x = Number(a.cx);
    const y = Number(a.cy);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const side = (a["data-side"] ?? (y < h / 2 ? "t" : "b")) === "b" ? "b" : "t";
    terms[id] = { x, y: side === "t" ? 0 : h, side, screw: y };
  }
  return { w, h, terms };
}

function parseBoardTemplate() {
  const text = readFileSync(BOARD_SVG, "utf8");
  const svgTag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const rootAttrs = parseAttrs(svgTag);
  const [vx, vy, vw, vh] = String(rootAttrs.viewBox ?? "").trim().split(/\s+/).map(Number);
  const k = GRID / (Number(rootAttrs["data-grid"]) || 64);
  const w = Math.round(vw * k);
  const h = Math.round(vh * k);
  const terms = {};
  for (const m of text.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/gi)) {
    const ga = parseAttrs(`<g ${m[1]}>`);
    if (!String(ga.class ?? "").split(/\s+/).includes("borne")) continue;
    const useTag = /<use\b[^>]*>/i.exec(m[2])?.[0];
    if (!useTag) continue;
    const ua = parseAttrs(useTag);
    const sig = ga["data-senal"];
    if (!sig) continue;
    const id = /^Q0_/.test(sig) ? `${sig}.${ga["data-pos"]}` : sig;
    const x = Math.round((Number(ua.x) - vx) * k);
    const yTerm = (Number(ua.y) - vy) * k;
    const yEntry = (Number(ga["data-entrada"]) - vy) * k;
    const side = yEntry > yTerm ? "b" : "t";
    terms[id] = { x, y: Math.round(yEntry), side, screw: Math.round(yTerm) };
  }
  return { w, h, terms, template: "jwsim/jwplc-basic" };
}

let cachedTemplates = null;
function loadBuiltinTemplates() {
  if (cachedTemplates) return cachedTemplates;
  const map = new Map();
  map.set("jwsim/jwplc-basic", parseBoardTemplate());
  const builtinNames = new Set(builtinDevices.map((d) => d.type.split("/")[1]));
  if (existsSync(ASSETS_DEVICES)) {
    for (const f of readdirSync(ASSETS_DEVICES).filter((x) => x.endsWith(".svg"))) {
      const name = f.slice(0, -4);
      const [head] = name.split("__");
      const key = !name.includes("__") || builtinNames.has(head) ? `jwsim/${name}` : name.replace("__", "/");
      const parsed = parseTemplateSvg(readFileSync(join(ASSETS_DEVICES, f), "utf8"));
      if (parsed) map.set(key, parsed);
    }
  }
  cachedTemplates = map;
  return map;
}

function loadThirdPartyTemplates() {
  const map = new Map();
  for (const d of installedDevices()) {
    if (!existsSync(d.dir)) continue;
    for (const f of readdirSync(d.dir).filter((x) => /^symbol(__[a-z0-9]+)?\.svg$/.test(x))) {
      const parsed = parseTemplateSvg(readFileSync(join(d.dir, f), "utf8"));
      if (parsed) map.set(`${d.type}${f.slice(6, -4)}`, parsed);
    }
  }
  return map;
}

function row(ids, w) {
  const n = ids.length;
  const step = n > 1 ? Math.max(GRID, Math.floor((w - 2 * GRID) / (n - 1) / GRID) * GRID) : 0;
  const x0 = snap((w - step * (n - 1)) / 2);
  return ids.map((id, i) => [id, x0 + i * step]);
}

function resolveTemplateKey(type, def, params, templates) {
  const enums = (def?.parameters ?? []).filter((prm) => prm.type === "enum").map((prm) => slug(params?.[prm.id] ?? prm.default));
  if (enums.length > 1) {
    const combo = `${type}__${enums.join("__")}`;
    if (templates.has(combo)) return combo;
  }
  for (const s of enums) {
    const k = `${type}__${s}`;
    if (templates.has(k)) return k;
  }
  return templates.has(type) ? type : null;
}

/** Construye un Registry con todos los tipos integrados + instalados válidos. */
export function buildRegistry() {
  const reg = new Registry(builtinDevices);
  return reg;
}

/**
 * Calcula ancho, alto y bornes reales de un dispositivo con sus parámetros.
 * @param {string} rawType
 * @param {Record<string, unknown>} [givenParams]
 * @param {Registry} [registry]
 */
export function getDeviceLayout(rawType, givenParams = {}, registry = buildRegistry()) {
  const type = normalizeType(rawType);
  let def = null;
  try {
    def = registry.get(type);
  } catch {}
  const defaults = Object.fromEntries((def?.parameters ?? []).map((p) => [p.id, p.default]));
  const params = { ...defaults, ...givenParams };

  const templates = new Map([...loadBuiltinTemplates(), ...loadThirdPartyTemplates()]);
  const key = resolveTemplateKey(type, def, params, templates);
  const tpl = key && templates.get(key);
  if (tpl) return { w: tpl.w, h: tpl.h, terms: tpl.terms, template: key };

  const short = type.split("/")[1];
  let [w, h, top, bottom] = type.startsWith("jwsim/") && FALLBACK_LAYOUT[short] ? FALLBACK_LAYOUT[short] : [];
  if (!w) {
    const ids = (def?.terminals ?? []).map((t) => t.id);
    top = ids.slice(0, Math.ceil(ids.length / 2));
    bottom = ids.slice(top.length);
    w = Math.max(120, (Math.max(top.length, bottom.length) + 1) * GRID);
    h = 120;
  }
  if (short === "motor-3ph" && params?.bornera === "6 cables") {
    w = 200;
    top = ["U1", "V1", "W1", "W2", "U2", "V2", "PE"];
  }
  const terms = {};
  if (short === "solenoid-valve") {
    terms.A1 = { x: GRID, y: 0, side: "t" };
    terms.A2 = { x: 2 * GRID, y: 0, side: "t" };
    return { w, h, terms, template: null };
  }
  for (const [id, x] of row(top, w)) terms[id] = { x, y: 0, side: "t" };
  for (const [id, x] of row(bottom, w)) terms[id] = { x, y: h, side: "b" };
  return { w, h, terms, template: null };
}

function linkParamNames(def) {
  return (def.parameters ?? []).filter((p) => LINK_PARAM_RE.test(p.id)).map((p) => p.id);
}

/**
 * Descubre variantes visuales de parámetros enum cuyas plantillas difieren.
 */
function variantsFor(def, registry) {
  const baseParams = Object.fromEntries((def.parameters ?? []).map((p) => [p.id, p.default]));
  const candidates = [{ label: "por defecto", params: baseParams }];
  for (const p of def.parameters ?? []) {
    if (p.type !== "enum") continue;
    for (const o of p.options ?? []) {
      if (o !== p.default) candidates.push({ label: `${p.id}=${o}`, params: { ...baseParams, [p.id]: o } });
    }
  }
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const lay = getDeviceLayout(def.type, c.params, registry);
    const sig = JSON.stringify([lay.w, lay.h, Object.keys(lay.terms)]);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({
      variant: c.label,
      params: c.label === "por defecto" ? {} : Object.fromEntries(Object.entries(c.params).filter(([k, v]) => baseParams[k] !== v)),
      size: { w: lay.w, h: lay.h },
      terminals: Object.keys(lay.terms),
      template: lay.template,
    });
  }
  return out;
}

/**
 * Descubre las salidas (`outputs`) reales del dispositivo sin fallar si sus
 * parámetros enlazan a equipos aún ausentes (`M1`, `CP1`, `Y1`, etc.).
 */
export function discoverOutputs(def, registry = buildRegistry(), givenParams = {}) {
  let params = {};
  try {
    params = resolveParams(def, givenParams);
  } catch {
    params = { ...givenParams };
  }
  try {
    const links = def.links?.(params) ?? [];
    const reads = (def.reads?.(params) ?? []).filter((r) => r.source);
    const extraDevices = new Map();
    for (const l of [...links, ...reads]) {
      const targetId = String(l.source).split(".")[0];
      if (!targetId || targetId === "D1" || extraDevices.has(targetId)) continue;
      const stubType = targetId.startsWith("Y")
        ? "jwsim/solenoid-valve"
        : /^C(P)?\d*$/i.test(targetId)
          ? "jwsim/compressor"
          : "jwsim/motor";
      extraDevices.set(targetId, { id: targetId, type: stubType });
    }
    const sc = new Scene(
      { devices: [{ id: "D1", type: def.type, params }, ...extraDevices.values()], wiring: [] },
      { registry },
    );
    const d1 = sc.snapshot().devices.find((d) => d.id === "D1");
    if (d1) return Object.keys(d1.outputs ?? {});
  } catch {}
  try {
    const inst = def.create({ id: "D1", params });
    const step = inst.update?.(0n, { loads: {}, actions: {}, signals: {}, values: {}, wired: new Set() });
    return Object.keys(step?.outputs ?? {});
  } catch {
    return [];
  }
}

/** Catálogo compacto agrupado por categoría. */
export function describeCatalog({ registry = buildRegistry() } = {}) {
  const byCategory = new Map();
  const defs = registry.list();
  for (const def of defs) {
    const cat = def.category ?? "Otros";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    const lay = getDeviceLayout(def.type, {}, registry);
    const variants = variantsFor(def, registry);
    byCategory.get(cat).push({
      type: def.type,
      name: def.name,
      prefix: prefixForType(def.type),
      size: { w: lay.w, h: lay.h },
      terminals: Object.keys(lay.terms),
      variants: variants.length > 1 ? variants.map((v) => v.variant) : [],
      linkParams: linkParamNames(def),
    });
  }
  return {
    total: defs.length,
    categories: [...byCategory.entries()].map(([name, devices]) => ({ name, devices })),
  };
}

/** Ficha completa de un dispositivo por tipo completo o corto. */
export function describeDevice(typeOrShort, { registry = buildRegistry() } = {}) {
  const normalized = normalizeType(typeOrShort);
  let def;
  try {
    def = registry.get(normalized);
  } catch {
    return null;
  }
  const variants = variantsFor(def, registry);
  return {
    type: def.type,
    version: def.version,
    name: def.name,
    category: def.category ?? "Otros",
    description: def.description ?? "",
    prefix: prefixForType(def.type),
    parameters: (def.parameters ?? []).map((p) => ({
      id: p.id,
      label: p.label ?? p.id,
      type: p.type,
      default: p.default,
      ...(p.options ? { options: p.options } : {}),
      ...(p.unit ? { unit: p.unit } : {}),
      ...(p.hint ? { hint: p.hint } : {}),
    })),
    terminals: (def.terminals ?? []).map((t) => ({ id: t.id, label: t.label ?? t.id })),
    variants,
    actions: (def.actions ?? []).map((a) => ({
      id: a.id,
      label: a.label ?? a.id,
      kind: a.kind,
      ...(a.options ? { options: a.options } : {}),
      ...(a.min !== undefined ? { min: a.min } : {}),
      ...(a.max !== undefined ? { max: a.max } : {}),
      ...(a.unit ? { unit: a.unit } : {}),
    })),
    outputs: discoverOutputs(def, registry),
    linkParams: linkParamNames(def),
  };
}

/** Genera la documentación viva docs/REFERENCIA_ESCENA.md. */
export function renderReferenceMarkdown({ registry = buildRegistry() } = {}) {
  const cat = describeCatalog({ registry });
  const lines = [
    "# Referencia de dispositivos de escena (`jwsim-cli scene describe`)",
    "",
    "> Archivo generado automáticamente desde `scene/devices/` y los símbolos `.svg` reales mediante `node scripts/gen-scene-ref.mjs`.",
    "> No editar a mano.",
    "",
    `Total de tipos integrados: **${cat.total}** · Grilla obligatoria: **20 px**.`,
    "",
  ];
  for (const group of cat.categories) {
    lines.push(`## ${group.name}`, "");
    lines.push("| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |");
    lines.push("|---|---|---|---|---|---|");
    for (const d of group.devices) {
      const full = describeDevice(d.type, { registry });
      const terms = d.terminals.length ? d.terminals.map((t) => `\`${t}\``).join(", ") : "*(sin bornes)*";
      const extras = [
        ...(d.variants.length ? [`var: ${d.variants.join(", ")}`] : []),
        ...(d.linkParams.length ? [`enlaces: ${d.linkParams.join(", ")}`] : []),
        ...(full?.outputs.length ? [`salidas: ${full.outputs.slice(0, 6).join(", ")}${full.outputs.length > 6 ? "…" : ""}`] : []),
      ].join("<br>");
      const desc = (full?.description ?? d.name).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
      const shortDesc = desc.length > 140 ? `${desc.slice(0, 137)}...` : desc;
      lines.push(`| \`${d.type}\` | \`${d.prefix}\` | ${d.size.w}×${d.size.h} | ${terms} | ${extras || "—"} | ${shortDesc} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function checkReferenceFreshness(filePath = REFERENCE_PATH) {
  const expected = renderReferenceMarkdown();
  const actual = existsSync(filePath) ? readFileSync(filePath, "utf8").replace(/\r\n/g, "\n") : "";
  return { ok: actual === expected, expected, actual };
}
