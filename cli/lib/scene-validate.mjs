// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Validador semántico, geométrico y eléctrico orientado a agentes
// (PROPUESTA_AGENTES_JSON.md §4.4). Corre en Node puro en milisegundos.

import { canMount, mountPos } from "../../scene/mount.mjs";
import { migrateScene, Scene } from "../../scene/scene.mjs";
import { validate as validateSchema } from "./project.mjs";
import { buildRegistry, describeDevice, getDeviceLayout } from "./scene-spec.mjs";

const GRID = 20;

const TYPE_ALIASES = {
  "jwsim/motor-trifasico": "jwsim/motor-3ph",
  "motor-trifasico": "jwsim/motor-3ph",
  "jwsim/motor-monofasico": "jwsim/motor-1ph",
  "motor-monofasico": "jwsim/motor-1ph",
  "jwsim/motor3ph": "jwsim/motor-3ph",
  "jwsim/motor1ph": "jwsim/motor-1ph",
  "jwsim/pulsador-na": "jwsim/pushbutton-no",
  "pulsador-na": "jwsim/pushbutton-no",
  "jwsim/pulsador-nc": "jwsim/pushbutton-nc",
  "pulsador-nc": "jwsim/pushbutton-nc",
  "jwsim/paro-emergencia": "jwsim/emergency-stop",
  "paro-emergencia": "jwsim/emergency-stop",
  "jwsim/fuente-24v": "jwsim/power-24vdc",
  "fuente-24v": "jwsim/power-24vdc",
  "jwsim/fuente-24vdc": "jwsim/power-24vdc",
  "jwsim/guardamotor": "jwsim/motor-protector",
  guardamotor: "jwsim/motor-protector",
  "jwsim/disyuntor": "jwsim/breaker",
  disyuntor: "jwsim/breaker",
  "jwsim/llave-termica": "jwsim/breaker",
  "jwsim/final-carrera": "jwsim/limit-switch",
  "final-carrera": "jwsim/limit-switch",
  "jwsim/electrovalvula": "jwsim/solenoid-valve",
  electrovalvula: "jwsim/solenoid-valve",
  "jwsim/rele-termico": "jwsim/overload-relay",
  "rele-termico": "jwsim/overload-relay",
  "jwsim/lampara": "jwsim/lamp",
  lampara: "jwsim/lamp",
  "jwsim/cinta": "jwsim/conveyor",
  cinta: "jwsim/conveyor",
  "jwsim/tanque": "jwsim/tank",
  tanque: "jwsim/tank",
  "jwsim/puerta": "jwsim/door",
  puerta: "jwsim/door",
};

function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  const dp = Array.from({ length: s.length + 1 }, (_, i) => i);
  for (let j = 1; j <= t.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= s.length; i++) {
      const tmp = dp[i];
      dp[i] = s[i - 1] === t[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[s.length];
}

function nearest(value, candidates) {
  if (!candidates.length) return null;
  let best = null;
  let bestD = Infinity;
  const low = String(value).toLowerCase();
  for (const c of candidates) {
    const d = levenshtein(low, String(c).toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Valida un proyecto `.jwsim` completo contra el catálogo, SVG activos, grilla,
 * colisiones 2D, enlaces 3D/sensores y netlist estática en t = 0.
 */
export function validateSceneProject(project, { fast = false, strict = false, registry = buildRegistry() } = {}) {
  /** @type {{ path: string, message: string, suggestion?: string }[]} */
  const errors = [];
  /** @type {{ path: string, message: string, suggestion?: string }[]} */
  const warnings = [];
  const err = (path, message, suggestion) => errors.push(suggestion ? { path, message, suggestion } : { path, message });
  const warn = (path, message, suggestion) => warnings.push(suggestion ? { path, message, suggestion } : { path, message });

  if (!project || typeof project !== "object") {
    err("/", "el proyecto debe ser un objeto JSON");
    return { ok: false, errors, warnings, stats: { devices: 0, wiring: 0, findings: 0, faults: 0 } };
  }

  // 1. Esquema jwsim-1 y jwsim-scene-1
  for (const e of validateSchema(project)) {
    err(e.path, e.message);
  }
  if (!project.scene || typeof project.scene !== "object") {
    err("/scene", "falta el objeto 'scene'", "agrega \"scene\": { \"devices\": [...], \"wiring\": [...] }");
    return { ok: false, errors, warnings, stats: { devices: 0, wiring: 0, findings: 0, faults: 0 } };
  }

  const scene = migrateScene(project.scene);
  const devices = Array.isArray(scene.devices) ? scene.devices : [];
  const wiring = Array.isArray(scene.wiring) ? scene.wiring : [];
  const knownTypes = registry.list().map((d) => d.type);
  const byId = new Map();
  const defById = new Map();
  const layoutById = new Map();
  const resolvedParamsById = new Map();
  let sceneCanRun = true;

  // 2. Dispositivos, tipos, parámetros y grilla
  devices.forEach((d, idx) => {
    const pfx = `/scene/devices/${idx}`;
    if (!d.id) {
      err(`${pfx}/id`, "falta el id del dispositivo");
      sceneCanRun = false;
    } else if (byId.has(d.id)) {
      err(`${pfx}/id`, `id duplicado "${d.id}"`, `cambia uno de ellos, p. ej. "${d.id}_2"`);
      sceneCanRun = false;
    } else {
      byId.set(d.id, { dev: d, idx });
    }

    let def = null;
    try {
      def = registry.get(d.type, d.version);
      if (d.id) defById.set(d.id, def);
    } catch (e) {
      sceneCanRun = false;
      const alias = TYPE_ALIASES[String(d.type ?? "").toLowerCase()] ?? TYPE_ALIASES[String(d.type ?? "").toLowerCase().split("/").pop()];
      const guess = alias ?? nearest(String(d.type ?? "").includes("/") ? d.type : `jwsim/${d.type}`, knownTypes);
      err(`${pfx}/type`, `tipo desconocido "${d.type}" (${e.message})`, guess ? `¿quisiste decir "${guess}"?` : undefined);
    }

    if (d.x !== undefined && d.x % GRID !== 0) {
      err(`${pfx}/x`, `x=${d.x} no es múltiplo de ${GRID}`, `ajusta a ${Math.round(d.x / GRID) * GRID}`);
    }
    if (d.y !== undefined && d.y % GRID !== 0) {
      err(`${pfx}/y`, `y=${d.y} no es múltiplo de ${GRID}`, `ajusta a ${Math.round(d.y / GRID) * GRID}`);
    }

    if (def) {
      const paramMap = new Map((def.parameters ?? []).map((p) => [p.id, p]));
      const merged = Object.fromEntries((def.parameters ?? []).map((p) => [p.id, p.default]));
      for (const [k, v] of Object.entries(d.params ?? {})) {
        const spec = paramMap.get(k);
        if (!spec) {
          const guess = nearest(k, [...paramMap.keys()]);
          warn(`${pfx}/params/${k}`, `parámetro desconocido "${k}" en ${def.type}`, guess ? `¿quisiste decir "${guess}"?` : undefined);
          merged[k] = v;
          continue;
        }
        if (spec.type === "enum" && !spec.options.includes(v)) {
          const guess = nearest(v, spec.options);
          err(
            `${pfx}/params/${k}`,
            `${def.type}: parámetro "${k}"=${JSON.stringify(v)} inválido (permitidos: ${spec.options.join(", ")})`,
            guess ? `usa "${guess}"` : undefined,
          );
          sceneCanRun = false;
        } else if (spec.type === "number" && !Number.isFinite(Number(v))) {
          err(`${pfx}/params/${k}`, `${def.type}: parámetro "${k}" debe ser numérico`);
          sceneCanRun = false;
        } else {
          merged[k] = v;
        }
      }
      if (d.id) {
        resolvedParamsById.set(d.id, merged);
        layoutById.set(d.id, getDeviceLayout(def.type, merged, registry));
      }
    }
  });

  // 3. Acoples mount y colisiones 2D por rectángulo real
  const validMounts = new Set();
  devices.forEach((d, idx) => {
    if (!d.mount) return;
    const pfx = `/scene/devices/${idx}/mount`;
    const hostEntry = byId.get(d.mount);
    if (!hostEntry) {
      const guess = nearest(d.mount, [...byId.keys()]);
      err(pfx, `mount="${d.mount}" apunta a un dispositivo inexistente`, guess ? `¿quisiste decir "${guess}"?` : undefined);
      return;
    }
    if (!canMount(d, hostEntry.dev)) {
      err(pfx, `${d.id} (${d.type}) no puede acoplarse a ${hostEntry.dev.id} (${hostEntry.dev.type})`);
      return;
    }
    validMounts.add(`${d.id}->${hostEntry.dev.id}`);
    validMounts.add(`${hostEntry.dev.id}->${d.id}`);
    const expected = mountPos(d, hostEntry.dev);
    if ((d.x ?? 0) !== expected.x || (d.y ?? 0) !== expected.y) {
      warn(
        `/scene/devices/${idx}`,
        `${d.id} acoplado a ${hostEntry.dev.id} debería estar en (${expected.x}, ${expected.y})`,
        `ejecuta scene normalize o mueve a (${expected.x}, ${expected.y})`,
      );
    }
  });

  for (let i = 0; i < devices.length; i++) {
    const a = devices[i];
    const la = layoutById.get(a.id);
    if (!la) continue;
    const ax = a.x ?? 0;
    const ay = a.y ?? 0;
    for (let j = i + 1; j < devices.length; j++) {
      const b = devices[j];
      const lb = layoutById.get(b.id);
      if (!lb) continue;
      if (validMounts.has(`${a.id}->${b.id}`)) continue;
      const bx = b.x ?? 0;
      const by = b.y ?? 0;
      const overlap = ax < bx + lb.w && ax + la.w > bx && ay < by + lb.h && ay + la.h > by;
      if (overlap) {
        err(
          `/scene/devices/${j}`,
          `colisión 2D entre ${a.id} (${ax},${ay} ${la.w}×${la.h}) y ${b.id} (${bx},${by} ${lb.w}×${lb.h})`,
          `desplaza ${b.id} al menos a x=${Math.ceil((ax + la.w + 40) / GRID) * GRID} o y=${Math.ceil((ay + la.h + 40) / GRID) * GRID}`,
        );
      }
    }
  }

  // 4. Validación de cables y bornes por variante activa
  const cableIds = new Set((scene.cables ?? []).map((c) => c.id));
  wiring.forEach((w, idx) => {
    const wpfx = `/scene/wiring/${idx}`;
    if (w.cable && !cableIds.has(w.cable)) {
      warn(`${wpfx}/cable`, `el hilo referencia el cable inexistente "${w.cable}"`);
    }
    for (const endKey of ["from", "to"]) {
      const end = String(w[endKey] ?? "");
      const dot = end.indexOf(".");
      if (dot <= 0) {
        err(`${wpfx}/${endKey}`, `extremo inválido "${end}"; usa "<id>.<borne>"`);
        sceneCanRun = false;
        continue;
      }
      const devId = end.slice(0, dot);
      const termId = end.slice(dot + 1);
      if (!byId.has(devId)) {
        const guess = nearest(devId, [...byId.keys()]);
        err(`${wpfx}/${endKey}`, `dispositivo inexistente "${devId}" en "${end}"`, guess ? `¿quisiste decir "${guess}.${termId}"?` : undefined);
        sceneCanRun = false;
        continue;
      }
      const lay = layoutById.get(devId);
      const def = defById.get(devId);
      if (!lay || !def) continue;
      const activeTerms = Object.keys(lay.terms);
      if (!activeTerms.includes(termId)) {
        sceneCanRun = false;
        const info = describeDevice(def.type, { registry });
        const otherVar = info?.variants.find((v) => v.terminals.includes(termId));
        const curParams = resolvedParamsById.get(devId) ?? {};
        const hintParams = otherVar
          ? (Object.keys(otherVar.params).length
              ? otherVar.params
              : Object.fromEntries((def.parameters ?? []).filter((p) => p.type === "enum" && curParams[p.id] !== p.default).map((p) => [p.id, p.default])))
          : null;
        const suggestion = otherVar
          ? `el borne "${termId}" está disponible con ${Object.entries(hintParams).map(([k, v]) => `params.${k}=${JSON.stringify(v)}`).join(", ") || otherVar.variant}`
          : (() => {
              const guess = nearest(termId, activeTerms);
              return guess ? `bornes activos: ${activeTerms.join(", ")}. ¿Quisiste decir "${devId}.${guess}"?` : `bornes activos: ${activeTerms.join(", ")}`;
            })();
        err(`${wpfx}/${endKey}`, `el borne "${termId}" no está disponible en ${devId} (${def.type}) con la configuración actual`, suggestion);
      }
    }
  });

  // 5. Enlaces de Planta 3D / sensores / proceso
  const outputCache = new Map();
  const outputsOf = (type) => {
    if (!outputCache.has(type)) outputCache.set(type, describeDevice(type, { registry })?.outputs ?? []);
    return outputCache.get(type);
  };
  devices.forEach((d, idx) => {
    const def = defById.get(d.id);
    if (!def) return;
    const params = resolvedParamsById.get(d.id) ?? {};
    const links = [
      ...(def.links?.(params) ?? []).map((l) => ({ source: l.source, param: d.type === "jwsim/sensor-cylinder" ? "cylinder" : "source" })),
      ...(def.reads?.(params) ?? []).filter((r) => r.source).map((r) => ({ source: r.source, param: r.id })),
    ];
    for (const l of links) {
      const src = String(l.source ?? "");
      const dot = src.indexOf(".");
      const targetId = dot > 0 ? src.slice(0, dot) : src;
      const outName = dot > 0 ? src.slice(dot + 1) : "";
      if (!byId.has(targetId)) {
        sceneCanRun = false;
        const guess = nearest(targetId, [...byId.keys()].filter((x) => x !== d.id));
        err(
          `/scene/devices/${idx}/params`,
          `${d.id}: enlace a "${src}" apunta al dispositivo inexistente "${targetId}"`,
          guess ? `actualiza el parámetro correspondiente a "${guess}${outName ? `.${outName}` : ""}" o agrega el equipo "${targetId}"` : `agrega el equipo "${targetId}" o limpia el parámetro de enlace`,
        );
        continue;
      }
      if (outName) {
        const targetDef = defById.get(targetId);
        const outs = targetDef ? outputsOf(targetDef.type) : [];
        if (outs.length && !outs.includes(outName)) {
          const guess = nearest(outName, outs);
          warn(
            `/scene/devices/${idx}/params`,
            `${d.id}: "${targetId}" no publica la salida "${outName}" (salidas: ${outs.join(", ")})`,
            guess ? `¿quisiste decir "${targetId}.${guess}"?` : undefined,
          );
        }
      }
    }
  });

  // 6. Análisis eléctrico estático t = 0
  let findingsCount = 0;
  let faultsCount = 0;
  if (!fast && sceneCanRun) {
    try {
      const snap = new Scene(scene, { registry }).snapshot();
      for (const f of snap.faults ?? []) {
        faultsCount++;
        err("/scene/wiring", f.message);
      }
      for (const w of snap.warnings ?? []) {
        warn("/scene/wiring", w.message);
      }
      for (const fd of snap.findings ?? []) {
        findingsCount++;
        warn("/scene/wiring", fd.message, "revisa retorno de alimentación o puente faltante");
      }
    } catch (e) {
      err("/scene", `no se pudo inicializar la escena: ${e.message}`);
    }
  }

  // Promover avisos en modo --strict
  if (strict && warnings.length) {
    for (const w of warnings) errors.push(w);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      devices: devices.length,
      wiring: wiring.length,
      findings: findingsCount,
      faults: faultsCount,
    },
  };
}
