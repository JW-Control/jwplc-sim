// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Normalizador y auto-layout en grilla de 20 px para proyectos JSON cortos
// (PROPUESTA_AGENTES_JSON.md §4.1 y §4.3). Convierte borrador corto o parcial
// en un .jwsim v1 válido e idempotente sin alterar trabajo ya posicionado.

import { canMount, mountPos } from "../../scene/mount.mjs";
import { migrateScene } from "../../scene/scene.mjs";
import { CURRENT_VERSION, SCHEMA_URL } from "./project.mjs";
import { buildRegistry, getDeviceLayout, normalizeType, prefixForType } from "./scene-spec.mjs";

const GRID = 20;
const DEFAULT_GUTTER = 60;
const snap = (v) => Math.round(Number(v || 0) / GRID) * GRID;
const snapUp = (v) => Math.ceil(Number(v || 0) / GRID) * GRID;
const slugify = (s, fallback = "proyecto") =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;

/**
 * Convierte un cable en texto corto ("PS1.+V1 -> KM1.A1 [rojo, cable:W1, ref]")
 * o un objeto parcial en una entrada canonizada de `scene.wiring`.
 */
export function parseWireShorthand(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const out = { from: String(entry.from ?? "").trim(), to: String(entry.to ?? "").trim() };
    if (entry.color) out.color = String(entry.color).trim();
    if (Array.isArray(entry.points) && entry.points.length) out.points = entry.points;
    if (entry.cable) out.cable = String(entry.cable).trim();
    if (entry.ref) out.ref = true;
    return out;
  }
  let raw = String(entry ?? "").trim();
  const extras = {};
  const bracket = /\s*\[([^\]]+)\]\s*$/.exec(raw);
  if (bracket) {
    raw = raw.slice(0, bracket.index).trim();
    for (const part of bracket[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      if (part === "ref") extras.ref = true;
      else if (/^cable\s*:/i.test(part)) extras.cable = part.slice(part.indexOf(":") + 1).trim();
      else if (!extras.color) extras.color = part;
    }
  }
  const match = /^([A-Za-z_][A-Za-z0-9_-]*\.[^\s]+)\s*(?:->|<->|—|–|-)\s*([A-Za-z_][A-Za-z0-9_-]*\.[^\s]+)$/.exec(raw);
  if (!match) {
    throw new Error(`cable corto inválido "${entry}": se espera "<id>.<borne> -> <id>.<borne> [color]"`);
  }
  return { from: match[1], to: match[2], ...extras };
}

const ZONE_ALIASES = {
  alimentación: "alimentacion",
  power: "alimentacion",
  plc: "controlador",
  control: "controlador",
  din: "tablero",
  maniobra: "tablero",
  proteccion: "tablero",
  protección: "tablero",
  panel: "mando",
  señalizacion: "mando",
  señalización: "mando",
  field: "campo",
  sensores: "campo",
  actuadores: "campo",
  plant: "proceso",
  planta: "proceso",
};

function inferZone(rawDev, registry) {
  if (rawDev.zone) {
    const z = String(rawDev.zone).trim().toLowerCase();
    return ZONE_ALIASES[z] ?? z;
  }
  const type = normalizeType(rawDev.type);
  const short = type.split("/")[1] ?? "";
  if (short === "jwplc-basic") return "controlador";
  if (/^power-/.test(short)) return "alimentacion";
  if (["breaker", "motor-protector", "contactor", "overload-relay", "relay", "timer-relay", "ssr", "level-relay", "vfd-el", "remote-io", "energy-meter", "temp-controller"].includes(short)) {
    return "tablero";
  }
  if (/^(pushbutton|selector)/.test(short) || ["emergency-stop", "lamp", "stack-light", "buzzer", "potentiometer", "signal-source", "voltmeter", "ammeter"].includes(short)) {
    return "mando";
  }
  if (/^(conveyor|tank|door|lift|building-water|sand-filter|fermentador)/.test(short)) return "proceso";
  try {
    const cat = registry.get(type).category;
    if (cat === "Alimentación") return "alimentacion";
    if (cat === "Controladores") return "tablero";
    if (cat === "Mando" || cat === "Señalización") return "mando";
    if (cat === "Planta" || cat === "Proceso") return "proceso";
  } catch {}
  return "campo";
}

const ZONE_ANCHORS = {
  alimentacion: { x: 40, y: 40, maxRight: 360 },
  controlador: { x: 380, y: 40, maxRight: 960 },
  tablero: { x: 920, y: 40, maxRight: 2300 },
  mando: { x: 40, y: 660, maxRight: 1200 },
  campo: { x: 40, y: 980, maxRight: 2200 },
  proceso: { x: 40, y: 1460, maxRight: 2400 },
};

function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function findFreeSlot(zoneCfg, footW, footH, placed, gutter) {
  let y = snap(zoneCfg.y);
  let rowNextY = y + snapUp(footH + gutter);
  let x = snap(zoneCfg.x);
  for (let guard = 0; guard < 500; guard++) {
    const candidate = { x, y, w: footW, h: footH };
    const hit = placed.find((p) => rectsOverlap(candidate, p, gutter));
    if (!hit) return { x, y };
    rowNextY = Math.min(rowNextY, snapUp(hit.y + hit.h + gutter));
    const nextX = snapUp(hit.x + hit.w + gutter);
    if (nextX + footW <= zoneCfg.maxRight) {
      x = nextX;
    } else {
      x = snap(zoneCfg.x);
      y = Math.max(y + GRID, rowNextY);
      rowNextY = y + snapUp(footH + gutter);
    }
  }
  return { x: snap(zoneCfg.x), y };
}

/**
 * Normaliza un objeto de escena (`devices`, `wiring`, `cables`) aplicando
 * prefijos, forma corta de cables, acoples `mount` y auto-layout en 20 px.
 */
export function normalizeScene(sceneInput = {}, { registry = buildRegistry(), gutter = DEFAULT_GUTTER } = {}) {
  const rawDevices = Array.isArray(sceneInput.devices) ? sceneInput.devices : [];
  const usedIds = new Set(rawDevices.map((d) => d.id).filter(Boolean));
  const allocId = (type) => {
    if (type === "jwsim/jwplc-basic" && !usedIds.has("plc")) {
      usedIds.add("plc");
      return "plc";
    }
    const prefix = prefixForType(type);
    for (let n = 1; ; n++) {
      const candidate = `${prefix}${n}`;
      if (!usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
    }
  };

  // Paso 1: normalizar tipos, IDs y zonas conservando orden de dispositivos.
  const devices = rawDevices.map((raw) => {
    const type = normalizeType(raw.type);
    const id = raw.id ? String(raw.id) : allocId(type);
    const hasX = typeof raw.x === "number" && Number.isFinite(raw.x);
    const hasY = typeof raw.y === "number" && Number.isFinite(raw.y);
    const params = raw.params && Object.keys(raw.params).length ? { ...raw.params } : undefined;
    const lay = getDeviceLayout(type, params ?? {}, registry);
    return {
      raw,
      zone: inferZone({ ...raw, type }, registry),
      hasPos: hasX && hasY,
      layout: lay,
      dev: {
        id,
        type,
        ...(raw.version ? { version: raw.version } : {}),
        ...(params ? { params } : {}),
        x: hasX ? snap(raw.x) : 0,
        y: hasY ? snap(raw.y) : 0,
        ...(raw.rotation ? { rotation: raw.rotation } : {}),
        ...(raw.mount ? { mount: String(raw.mount) } : {}),
      },
    };
  });

  const byId = new Map(devices.map((d) => [d.dev.id, d]));
  const guestsByHost = new Map();
  const mountedSet = new Set();
  for (const item of devices) {
    if (!item.dev.mount) continue;
    const hostItem = byId.get(item.dev.mount);
    if (hostItem && canMount(item.dev, hostItem.dev)) {
      mountedSet.add(item);
      const list = guestsByHost.get(hostItem.dev.id) ?? [];
      list.push(item);
      guestsByHost.set(hostItem.dev.id, list);
    }
  }

  // Huella total de cada dispositivo considerando huéspedes montados abajo.
  const footprintOf = (item) => {
    let w = item.layout.w;
    let h = item.layout.h;
    for (const g of guestsByHost.get(item.dev.id) ?? []) {
      const rel = mountPos(g.dev, { ...item.dev, x: 0, y: 0 });
      w = Math.max(w, rel.x + g.layout.w);
      h = Math.max(h, rel.y + g.layout.h);
    }
    return { w: snapUp(w), h: snapUp(h) };
  };

  // Paso 2: registrar primero cajas ya posicionadas explícitamente.
  const placedRects = [];
  for (const item of devices) {
    if (mountedSet.has(item) || !item.hasPos) continue;
    const fp = footprintOf(item);
    placedRects.push({ x: item.dev.x, y: item.dev.y, w: fp.w, h: fp.h });
  }

  // Paso 3: ubicar sin solapamientos todos los equipos independientes sin x/y.
  const zoneOrder = ["alimentacion", "controlador", "tablero", "mando", "campo", "proceso"];
  const pending = devices.filter((item) => !mountedSet.has(item) && !item.hasPos);
  pending.sort((a, b) => zoneOrder.indexOf(a.zone) - zoneOrder.indexOf(b.zone));
  for (const item of pending) {
    const cfg = ZONE_ANCHORS[item.zone] ?? ZONE_ANCHORS.campo;
    const fp = footprintOf(item);
    const pos = findFreeSlot(cfg, fp.w, fp.h, placedRects, gutter);
    item.dev.x = pos.x;
    item.dev.y = pos.y;
    placedRects.push({ x: pos.x, y: pos.y, w: fp.w, h: fp.h });
  }

  // Paso 4: ajustar posiciones de los dispositivos acoplados a su anfitrión.
  for (const item of mountedSet) {
    const hostItem = byId.get(item.dev.mount);
    const pos = mountPos(item.dev, hostItem.dev);
    item.dev.x = snap(pos.x);
    item.dev.y = snap(pos.y);
  }

  // Paso 5: cables multipolares y forma corta de wiring.
  const cables = [];
  const cableWires = [];
  for (const c of Array.isArray(sceneInput.cables) ? sceneInput.cables : []) {
    if (!c || !c.id) continue;
    cables.push({
      id: String(c.id),
      ...(c.label ? { label: String(c.label) } : {}),
      ...(c.ref ? { ref: true } : {}),
    });
    for (const w of Array.isArray(c.wires) ? c.wires : []) {
      const parsed = parseWireShorthand(w);
      cableWires.push({ ...parsed, cable: String(c.id), ...(c.ref ? { ref: true } : {}) });
    }
  }

  const wiring = [];
  const seenWire = new Set();
  for (const rawW of [...(Array.isArray(sceneInput.wiring) ? sceneInput.wiring : []), ...cableWires]) {
    const w = parseWireShorthand(rawW);
    const key = `${w.from}|${w.to}|${w.cable ?? ""}`;
    if (seenWire.has(key)) continue;
    seenWire.add(key);
    wiring.push(w);
  }

  const normalized = {
    ...(sceneInput.$comment ? { $comment: sceneInput.$comment } : {}),
    ...(sceneInput.inputMode ? { inputMode: sceneInput.inputMode } : {}),
    ...(sceneInput.inputs ? { inputs: sceneInput.inputs } : {}),
    devices: devices.map((d) => d.dev),
    wiring,
    ...(cables.length ? { cables } : {}),
  };
  return migrateScene(normalized);
}

/**
 * Normaliza un proyecto completo `.jwsim` desde borrador JSON corto o v1 parcial.
 */
export function normalizeProject(input = {}, { registry = buildRegistry(), baseName, gutter = DEFAULT_GUTTER } = {}) {
  const {
    $schema,
    format,
    version,
    name,
    board,
    program,
    scene,
    ...rest
  } = input && typeof input === "object" ? input : {};
  const projName = name ?? baseName ?? "proyecto";
  const slug = slugify(projName);
  const outProgram = program
    ? { ...program }
    : { kind: "arduino", sketch: `./${slug}/${slug}.ino` };
  if (!outProgram.kind) outProgram.kind = outProgram.project ? "openplc" : "arduino";
  if (outProgram.kind === "arduino" && !outProgram.sketch) outProgram.sketch = `./${slug}/${slug}.ino`;

  return {
    $schema: $schema ?? SCHEMA_URL,
    format: "jwsim",
    version: CURRENT_VERSION,
    ...(name ? { name } : {}),
    board: board ?? { id: "jwplcbasic" },
    program: outProgram,
    ...rest,
    scene: normalizeScene(scene ?? {}, { registry, gutter }),
  };
}
