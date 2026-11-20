// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Configuración de finales de carrera y sensores magnéticos desde el cilindro
// (estilo FluidSIM/CADeSIMU), sin dependencias de DOM. Lo usan scene.js y las
// pruebas unitarias en Node.
"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JwsimCylinderSensors = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VALVES = new Set(["jwsim/solenoid-valve", "jwsim/solenoid-valve-2"]);
  const GROUP_HOME_TOL = 40;
  const GROUP_SNAP_RADIUS = 100;
  const snap20 = (v) => Math.round(Number(v || 0) / 20) * 20;
  const round2 = (v) => Math.round(v * 100) / 100;
  const clampPos = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  function isValve(dev) {
    return !!dev && VALVES.has(dev.type);
  }

  function sensorInfo(dev, valveId) {
    if (!dev) return null;
    const p = dev.params ?? {};
    if (dev.type === "jwsim/sensor-cylinder" && p.cylinder === valveId) {
      const pos = p.end === "extendido" ? 1 : 0;
      return { id: dev.id, kind: "magnetic", pos, min: pos, max: pos, type: dev.type };
    }
    if (dev.type === "jwsim/limit-switch" && String(p.source ?? "") === `${valveId}.position`) {
      const min = clampPos(p.min ?? 1);
      const max = clampPos(p.max ?? min);
      const pos = round2((min + max) / 2);
      const kind = p.model === "XCKJ" ? "XCKJ" : "compacto";
      return { id: dev.id, kind, pos, min, max, type: dev.type };
    }
    return null;
  }

  /** Lista ordenada (0 → 1) de los sensores vinculados a una electroválvula. */
  function sensorsForValve(devices, valveId) {
    const out = [];
    for (const d of devices ?? []) {
      const info = sensorInfo(d, valveId);
      if (info) out.push(info);
    }
    out.sort((a, b) => a.pos - b.pos || String(a.id).localeCompare(String(b.id)));
    return out;
  }

  /** Letra sugerida para el cilindro (A, B, C...) según marcas existentes u orden. */
  function nextCylinderLetter(devices, valveId) {
    const linked = sensorsForValve(devices, valveId);
    const ownLetter = linked.map((s) => /^([A-Z])\d+$/.exec(s.id)?.[1]).find(Boolean);
    if (ownLetter) return ownLetter;

    const used = new Set();
    for (const d of devices ?? []) {
      const m = /^([A-Z])\d+$/.exec(String(d.id ?? ""));
      if (m) used.add(m[1]);
    }
    const valves = (devices ?? []).filter(isValve);
    for (const v of valves) {
      if (v.id === valveId) break;
      const vl = sensorsForValve(devices, v.id).map((s) => /^([A-Z])\d+$/.exec(s.id)?.[1]).find(Boolean);
      if (vl) used.add(vl);
    }
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(65 + i);
      if (!used.has(ch)) return ch;
    }
    return "A";
  }

  /** Próximo identificador libre para una marca en la posición dada (A0, A1, A2...). */
  function nextMarkId(devices, letter, pos) {
    const taken = new Set((devices ?? []).map((d) => d.id));
    const pref = pos <= 0.05 ? `${letter}0` : pos >= 0.95 ? `${letter}1` : null;
    if (pref && !taken.has(pref)) return pref;
    const start = pref ? 0 : 2;
    for (let n = start; n < 100; n++) {
      const cand = `${letter}${n}`;
      if (!taken.has(cand)) return cand;
    }
    return `${letter}_${Date.now() % 1000}`;
  }

  /** Posición (x, y) en la grilla 2D: rodillos cerca del émbolo largo y magnéticos sobre la camisa. */
  function sensorPlacement(valve, kind, pos, existingDevices = [], ignoreId = null) {
    const bx = Number(valve?.x ?? 0);
    const by = Number(valve?.y ?? 0);
    const p = clampPos(pos);
    let x;
    let y;
    if (kind === "magnetic") {
      x = snap20(bx + (p >= 0.5 ? 160 : 20));
      y = snap20(by - 120);
    } else {
      x = snap20(bx + 280 + p * 140);
      y = snap20(by - (kind === "XCKJ" ? 200 : 160));
    }
    const minDx = kind === "magnetic" ? 80 : 110;
    const minDy = kind === "magnetic" ? 100 : 180;
    const targetType = kind === "magnetic" ? "jwsim/sensor-cylinder" : "jwsim/limit-switch";
    const occupied = (cx, cy) =>
      (existingDevices ?? []).some(
        (d) =>
          d.id !== ignoreId &&
          d.type === targetType &&
          Math.abs((d.x ?? 0) - cx) < minDx &&
          Math.abs((d.y ?? 0) - cy) < minDy,
      );
    while (occupied(x, y)) y -= kind === "magnetic" ? 120 : 220;
    return { x, y };
  }

  /** Devuelve la electroválvula vinculada a un sensor/final de carrera, o null. */
  function linkedValveOf(devices, dev) {
    if (!dev || !Array.isArray(devices)) return null;
    const p = dev.params ?? {};
    let valveId = null;
    if (dev.type === "jwsim/sensor-cylinder" && p.cylinder) {
      valveId = String(p.cylinder);
    } else if (dev.type === "jwsim/limit-switch" && p.source) {
      const m = /^([^.]+)\.position$/.exec(String(p.source));
      if (m) valveId = m[1];
    }
    if (!valveId) return null;
    return devices.find((d) => d.id === valveId && isValve(d)) ?? null;
  }

  /** Posición de reposo esperada del sensor respecto a su cilindro vinculado. */
  function sensorHome(devices, dev, valve = null) {
    const v = valve ?? linkedValveOf(devices, dev);
    if (!v) return null;
    const info = sensorInfo(dev, v.id);
    if (!info) return null;
    return sensorPlacement(v, info.kind, info.pos, devices, dev.id);
  }

  /** Sensores actualmente acoplados/agrupados junto a la electroválvula (<= 40 px de su posición). */
  function groupedSensorsForValve(devices, valveId) {
    const valve = (devices ?? []).find((d) => d.id === valveId && isValve(d));
    if (!valve) return [];
    const out = [];
    for (const d of devices ?? []) {
      const info = sensorInfo(d, valve.id);
      if (!info) continue;
      const home = sensorPlacement(valve, info.kind, info.pos, devices, d.id);
      const base = sensorPlacement(valve, info.kind, info.pos, [], d.id);
      const distHome = Math.hypot((d.x ?? 0) - home.x, (d.y ?? 0) - home.y);
      const distBase = Math.hypot((d.x ?? 0) - base.x, (d.y ?? 0) - base.y);
      if (distHome <= GROUP_HOME_TOL || distBase <= GROUP_HOME_TOL) out.push(d);
    }
    return out;
  }

  function limitRange(pos) {
    const p = round2(clampPos(pos));
    if (p <= 0) return { min: 0, max: 0 };
    if (p >= 1) return { min: 1, max: 1 };
    return { min: round2(Math.max(0, p - 0.03)), max: round2(Math.min(1, p + 0.03)) };
  }

  /** Construye el dispositivo sensor listo para insertar en spec.devices. */
  function buildSensorDevice(valve, { id, kind = "compacto", pos = 0, orientacion = "abajo" }, existingDevices = []) {
    const p = clampPos(pos);
    const coords = sensorPlacement(valve, kind, p, existingDevices, id);
    if (kind === "magnetic") {
      return {
        id,
        type: "jwsim/sensor-cylinder",
        version: "1.0.0",
        params: { cylinder: valve.id, end: p >= 0.5 ? "extendido" : "retraído" },
        x: coords.x,
        y: coords.y,
      };
    }
    const { min, max } = limitRange(p);
    return {
      id,
      type: "jwsim/limit-switch",
      version: "1.0.0",
      params: { model: kind === "XCKJ" ? "XCKJ" : "compacto", orientacion, source: `${valve.id}.position`, min, max },
      x: coords.x,
      y: coords.y,
    };
  }

  /** Agrega los extremos faltantes (0 y/o 1) encima del émbolo. */
  function addStandardPair(spec, valveId, kind = "compacto") {
    const devices = spec?.devices ?? [];
    const valve = devices.find((d) => d.id === valveId);
    if (!valve) return [];
    const existing = sensorsForValve(devices, valveId);
    const has0 = existing.some((s) => s.pos <= 0.05);
    const has1 = existing.some((s) => s.pos >= 0.95);
    const letter = nextCylinderLetter(devices, valveId);
    const added = [];
    for (const pos of [!has0 ? 0 : null, !has1 ? 1 : null]) {
      if (pos === null) continue;
      const id = nextMarkId(devices, letter, pos);
      const dev = buildSensorDevice(valve, { id, kind, pos }, devices);
      devices.push(dev);
      added.push(id);
    }
    return added;
  }

  /** Agrega una sola marca (0, 1 o intermedia 0.5) encima del émbolo. */
  function addMark(spec, valveId, { kind = "compacto", pos } = {}) {
    const devices = spec?.devices ?? [];
    const valve = devices.find((d) => d.id === valveId);
    if (!valve) return { ok: false, error: "Válvula inexistente" };
    const existing = sensorsForValve(devices, valveId);
    const targetPos =
      pos !== undefined
        ? clampPos(pos)
        : !existing.some((s) => s.pos <= 0.05)
          ? 0
          : !existing.some((s) => s.pos >= 0.95)
            ? 1
            : 0.5;
    const letter = nextCylinderLetter(devices, valveId);
    const id = nextMarkId(devices, letter, targetPos);
    const dev = buildSensorDevice(valve, { id, kind, pos: targetPos }, devices);
    devices.push(dev);
    return { ok: true, id, device: dev };
  }

  /** Edita marca (ID + cables), posición y/o tipo de un sensor existente. */
  function updateSensorConfig(spec, valveId, sensorId, patch = {}) {
    const devices = spec?.devices ?? [];
    const valve = devices.find((d) => d.id === valveId);
    const dev = devices.find((d) => d.id === sensorId);
    const cur = sensorInfo(dev, valveId);
    if (!valve || !dev || !cur) return { ok: false, error: "Sensor no vinculado al cilindro" };

    let finalId = dev.id;
    if (patch.id !== undefined) {
      const nextId = String(patch.id).trim();
      if (!nextId || !/^[A-Za-z0-9_-]+$/.test(nextId)) {
        return { ok: false, error: "Nombre de marca inválido" };
      }
      if (nextId !== dev.id && devices.some((d) => d.id === nextId)) {
        return { ok: false, error: `Ya existe un equipo llamado ${nextId}` };
      }
      if (nextId !== dev.id) {
        const oldPrefix = `${dev.id}.`;
        const newPrefix = `${nextId}.`;
        for (const w of spec.wiring ?? []) {
          if (w.from.startsWith(oldPrefix)) w.from = newPrefix + w.from.slice(oldPrefix.length);
          if (w.to.startsWith(oldPrefix)) w.to = newPrefix + w.to.slice(oldPrefix.length);
        }
        dev.id = nextId;
        finalId = nextId;
      }
    }

    const nextKind = patch.kind ?? cur.kind;
    const nextPos = patch.pos !== undefined ? clampPos(patch.pos) : cur.pos;
    if (patch.kind !== undefined || patch.pos !== undefined) {
      const keepOri = dev.type === "jwsim/limit-switch" ? (dev.params?.orientacion ?? "abajo") : "abajo";
      const built = buildSensorDevice(valve, { id: finalId, kind: nextKind, pos: nextPos, orientacion: keepOri }, devices);
      const typeChanged = built.type !== dev.type;
      dev.type = built.type;
      dev.version = built.version;
      dev.params = built.params;
      dev.x = built.x;
      dev.y = built.y;
      if (typeChanged && Array.isArray(spec.wiring)) {
        const prefix = `${finalId}.`;
        spec.wiring = spec.wiring.filter((w) => !w.from.startsWith(prefix) && !w.to.startsWith(prefix));
      }
    }

    return { ok: true, id: finalId };
  }

  function removeSensor(spec, sensorId) {
    const prefix = `${sensorId}.`;
    spec.devices = (spec.devices ?? []).filter((d) => d.id !== sensorId);
    spec.wiring = (spec.wiring ?? []).filter((w) => !w.from.startsWith(prefix) && !w.to.startsWith(prefix));
  }

  return {
    GROUP_SNAP_RADIUS,
    isValve,
    sensorsForValve,
    linkedValveOf,
    sensorHome,
    groupedSensorsForValve,
    nextCylinderLetter,
    nextMarkId,
    sensorPlacement,
    buildSensorDevice,
    addStandardPair,
    addMark,
    updateSensorConfig,
    removeSensor,
  };
});
