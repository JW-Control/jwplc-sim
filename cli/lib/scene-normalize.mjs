// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Normalizador y auto-layout en grilla de 20 px para proyectos JSON cortos
// (PROPUESTA_AGENTES_JSON.md §4.1 y §4.3). Integra app/lib/cylinder-sensors.cjs
// para nombrar (A0/A1, B0/B1...) y posicionar finales de carrera encima de cada
// cilindro neumático, alineando el riel DIN superior en y = 0, los cilindros en
// una sola fila horizontal y el compresor una fila debajo.

import { createRequire } from "node:module";

import { canMount, mountPos } from "../../scene/mount.mjs";
import { migrateScene } from "../../scene/scene.mjs";
import { CURRENT_VERSION, SCHEMA_URL } from "./project.mjs";
import { buildRegistry, getDeviceLayout, normalizeType, prefixForType } from "./scene-spec.mjs";

const require = createRequire(import.meta.url);
const CS = require("../../app/lib/cylinder-sensors.cjs");

const GRID = 20;
const DEFAULT_GUTTER = 60;
const CYLINDER_PITCH_X = 760;
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
  cilindros: "cilindros",
  neumatica: "neumatica",
  neumática: "neumatica",
  field: "campo",
  sensores: "campo",
  actuadores: "campo",
  plant: "proceso",
  planta: "proceso",
};

function inferZone(rawDev, registry) {
  const type = normalizeType(rawDev.type);
  const short = type.split("/")[1] ?? "";
  if (short === "solenoid-valve" || short === "solenoid-valve-2") return "cilindros";
  if (short === "compressor" || short === "service-unit") return "neumatica";
  if (rawDev.zone) {
    const z = String(rawDev.zone).trim().toLowerCase();
    return ZONE_ALIASES[z] ?? z;
  }
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

function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function findFreeSlot(zoneCfg, footW, footH, placed, gutter, stepX = 0) {
  let y = snap(zoneCfg.y);
  let rowNextY = y + snapUp(footH + gutter);
  let x = snap(zoneCfg.x);
  for (let guard = 0; guard < 500; guard++) {
    const candidate = { x, y, w: footW, h: footH };
    const hit = placed.find((p) => rectsOverlap(candidate, p, gutter));
    if (!hit) return { x, y };
    rowNextY = Math.min(rowNextY, snapUp(hit.y + hit.h + gutter));
    const minNextX = snapUp(hit.x + hit.w + gutter);
    const nextX = stepX > 0 ? Math.max(minNextX, snap(hit.x + stepX)) : minNextX;
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

function isUnamedCylinderSensor(raw) {
  if (raw.id) return false;
  const type = normalizeType(raw.type);
  const p = raw.params ?? {};
  return (
    (type === "jwsim/sensor-cylinder" && !!p.cylinder) ||
    (type === "jwsim/limit-switch" && /^[^.]+\.position$/.test(String(p.source ?? "")))
  );
}

/**
 * Normaliza un objeto de escena (`devices`, `wiring`, `cables`) aplicando
 * prefijos, forma corta de cables, sensores de cilindro encima del émbolo,
 * acoples `mount` y auto-layout en 20 px.
 */
export function normalizeScene(sceneInput = {}, { registry = buildRegistry(), gutter = DEFAULT_GUTTER } = {}) {
  const rawList = Array.isArray(sceneInput.devices) ? sceneInput.devices.map((d) => ({ ...d })) : [];
  const usedIds = new Set(rawList.map((d) => d.id).filter(Boolean));
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

  // Paso 1a: asignar IDs primero a equipos que NO son sensores de cilindro sin id,
  // para que las electroválvulas Y1, Y2, Y3 existan antes de bautizar A0/A1, B0/B1...
  for (const raw of rawList) {
    raw.type = normalizeType(raw.type);
    if (!raw.id && !isUnamedCylinderSensor(raw)) {
      raw.id = allocId(raw.type);
    }
  }

  // Paso 1b: bautizar sensores de cilindro declarados por separado sin id (A0, A1, B0, B1...)
  // y asegurar orientacion="abajo" por defecto en limit-switch de cilindro.
  const tempDevicesForNaming = rawList.filter((d) => d.id).map((d) => ({ id: d.id, type: d.type, params: d.params ?? {} }));
  for (const raw of rawList) {
    if (raw.type === "jwsim/limit-switch" && /^[^.]+\.position$/.test(String(raw.params?.source ?? ""))) {
      raw.params = {
        model: "compacto",
        orientacion: "abajo",
        ...raw.params,
      };
    }
    if (!raw.id && isUnamedCylinderSensor(raw)) {
      const valveId =
        raw.type === "jwsim/sensor-cylinder"
          ? String(raw.params.cylinder)
          : String(raw.params.source).split(".")[0];
      const pos =
        raw.type === "jwsim/sensor-cylinder"
          ? (raw.params?.end === "extendido" ? 1 : 0)
          : Number(raw.params?.min ?? 0);
      const letter = CS.nextCylinderLetter(tempDevicesForNaming, valveId);
      const id = CS.nextMarkId(tempDevicesForNaming, letter, pos);
      raw.id = id;
      usedIds.add(id);
      tempDevicesForNaming.push({ id, type: raw.type, params: raw.params ?? {} });
    } else if (!raw.id) {
      raw.id = allocId(raw.type);
    }
  }

  // Paso 1c: expandir atajo `sensors: true | "compacto" | "XCKJ" | "magnetic" | ["A0", "A1"]` en válvulas.
  const expandedRaw = [];
  const synthSpec = {
    devices: rawList.map((d) => ({ id: d.id, type: d.type, params: d.params ? { ...d.params } : {}, x: d.x ?? 0, y: d.y ?? 0 })),
  };
  for (const raw of rawList) {
    const sensorOpt = raw.sensors;
    delete raw.sensors;
    expandedRaw.push(raw);
    if (!sensorOpt || !CS.isValve(raw)) continue;
    const kind = sensorOpt === "XCKJ" || sensorOpt === "magnetic" ? sensorOpt : "compacto";
    const beforeLen = synthSpec.devices.length;
    const addedIds = CS.addStandardPair(synthSpec, raw.id, kind);
    if (Array.isArray(sensorOpt) && sensorOpt.length >= 2 && addedIds.length === 2) {
      for (let k = 0; k < 2; k++) {
        const wantId = String(sensorOpt[k]).trim();
        if (wantId && !usedIds.has(wantId)) {
          synthSpec.devices[beforeLen + k].id = wantId;
        }
      }
    }
    for (let idx = beforeLen; idx < synthSpec.devices.length; idx++) {
      const sDev = synthSpec.devices[idx];
      usedIds.add(sDev.id);
      // Sin x/y fijos todavía para que se ubiquen encima del cilindro una vez posicionada la válvula.
      expandedRaw.push({ id: sDev.id, type: sDev.type, params: sDev.params });
    }
  }

  // Paso 1d: autocompletar consumers en compresores cuando omitieron params.consumers.
  for (const raw of expandedRaw) {
    if (raw.type !== "jwsim/compressor") continue;
    if (raw.params?.consumers) continue;
    const serviceUnits = new Set(
      expandedRaw
        .filter((d) => d.type === "jwsim/service-unit" && d.params?.source === raw.id)
        .map((d) => d.id),
    );
    const consumers = expandedRaw
      .filter((d) => CS.isValve(d) && (d.params?.air === raw.id || serviceUnits.has(d.params?.air) || !d.params?.air))
      .map((d) => d.id);
    if (consumers.length) {
      raw.params = { ...(raw.params ?? {}), consumers: consumers.join(", ") };
    }
  }

  // Paso 2: construir descriptores con layout real.
  const devices = expandedRaw.map((raw) => {
    const type = normalizeType(raw.type);
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
        id: String(raw.id),
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
  const allDevs = devices.map((d) => d.dev);

  // Huéspedes acoplados por mount (relé térmico bajo contactor).
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

  // Sensores acoplados encima de un cilindro (no se ubican como equipos sueltos).
  const cylSensorsByValve = new Map();
  const cylSensorSet = new Set();
  for (const item of devices) {
    if (item.hasPos) continue;
    const valve = CS.linkedValveOf(allDevs, item.dev);
    if (!valve) continue;
    cylSensorSet.add(item);
    const list = cylSensorsByValve.get(valve.id) ?? [];
    list.push(item);
    cylSensorsByValve.set(valve.id, list);
  }

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

  // Registrar cajas ya posicionadas explícitamente.
  const placedRects = [];
  for (const item of devices) {
    if (mountedSet.has(item) || cylSensorSet.has(item) || !item.hasPos) continue;
    const fp = footprintOf(item);
    placedRects.push({ x: item.dev.x, y: item.dev.y, w: fp.w, h: fp.h });
  }

  const hasTablero = devices.some((d) => !mountedSet.has(d) && !cylSensorSet.has(d) && d.zone === "tablero");
  const cylinderY = hasTablero ? 600 : 440;
  const neumaticaY = cylinderY + 460;

  const zoneAnchors = {
    // Riel DIN superior (y = 0): fuentes a la izquierda, PLC al lado, maniobra/protección a la derecha
    alimentacion: { x: 0, y: 0, maxRight: 1600, stepX: 0 },
    controlador: { x: 240, y: 0, maxRight: 2400, stepX: 0 },
    tablero: { x: 760, y: 0, maxRight: 4800, stepX: 0 },
    // Botones y pilotos abajo a la izquierda, debajo de las fuentes/PLC
    mando: { x: 0, y: 600, maxRight: 700, stepX: 0 },
    // Cilindros en una sola fila horizontal (maxRight amplio para nunca partir la fila)
    cilindros: { x: 760, y: cylinderY, maxRight: 20000, stepX: CYLINDER_PITCH_X },
    // Compresor y unidad de mantenimiento una fila abajo de los cilindros
    neumatica: { x: 760, y: neumaticaY, maxRight: 4800, stepX: 0 },
    campo: { x: 760, y: hasTablero ? 980 : 900, maxRight: 4800, stepX: 0 },
    proceso: { x: 760, y: neumaticaY + 420, maxRight: 4800, stepX: 0 },
  };

  const zoneOrder = ["alimentacion", "controlador", "tablero", "mando", "cilindros", "neumatica", "campo", "proceso"];
  const pending = devices.filter((item) => !mountedSet.has(item) && !cylSensorSet.has(item) && !item.hasPos);
  pending.sort((a, b) => zoneOrder.indexOf(a.zone) - zoneOrder.indexOf(b.zone));

  for (const item of pending) {
    const cfg = zoneAnchors[item.zone] ?? zoneAnchors.campo;
    const fp = footprintOf(item);
    const hasTopSensors = (cylSensorsByValve.get(item.dev.id)?.length ?? 0) > 0;
    const topReserve = hasTopSensors ? 200 : 0;
    const pos = findFreeSlot(
      { ...cfg, y: cfg.y - topReserve },
      fp.w,
      fp.h + topReserve,
      placedRects,
      gutter,
      cfg.stepX,
    );
    item.dev.x = pos.x;
    item.dev.y = pos.y + topReserve;
    placedRects.push({ x: pos.x, y: pos.y, w: fp.w, h: fp.h + topReserve });
  }

  // Paso 3: posicionar huéspedes acoplados por mount (relé térmico bajo contactor).
  for (const item of mountedSet) {
    const hostItem = byId.get(item.dev.mount);
    const pos = mountPos(item.dev, hostItem.dev);
    item.dev.x = snap(pos.x);
    item.dev.y = snap(pos.y);
  }

  // Paso 4: posicionar finales de carrera y sensores magnéticos encima de cada cilindro.
  for (const [valveId, sensorItems] of cylSensorsByValve.entries()) {
    const valveItem = byId.get(valveId);
    if (!valveItem) continue;
    const placedForValve = [];
    for (const sItem of sensorItems) {
      const info = CS.sensorsForValve([sItem.dev], valveId)[0];
      const kind = info?.kind ?? (sItem.dev.type === "jwsim/sensor-cylinder" ? "magnetic" : "compacto");
      const pos = info?.pos ?? 0;
      const coords = CS.sensorPlacement(valveItem.dev, kind, pos, placedForValve, sItem.dev.id);
      sItem.dev.x = snap(coords.x);
      sItem.dev.y = snap(coords.y);
      placedForValve.push(sItem.dev);
    }
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
