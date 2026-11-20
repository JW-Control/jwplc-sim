// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Núcleo del diagrama de estados neumático (sin dependencias de DOM).
// Lo usan la interfaz (script clásico: window.JwsimStateDiagCore) y las pruebas
// unitarias en Node (import/require).
"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JwsimStateDiagCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VALVES = new Set(["jwsim/solenoid-valve", "jwsim/solenoid-valve-2"]);
  const MIN_BAR = 1.5;
  const TRACKED_KEYS = ["position", "energized", "coilPlus", "coilMinus", "actuated", "detecting", "pressure"];

  /** Convierte salida numérica, booleana o tramo { value } a número finito. */
  function toNum(raw) {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === "boolean") return raw ? 1 : 0;
    if (typeof raw === "object" && "value" in raw) raw = raw.value;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Sensores vinculados a una electroválvula/cilindro, ordenados retraído→extendido. */
  function sensorsOf(devices, valveId) {
    const list = [];
    for (const d of devices) {
      const p = d.params ?? {};
      if (d.type === "jwsim/sensor-cylinder" && p.cylinder === valveId) {
        list.push({ id: d.id, end: p.end === "extendido" ? 1 : 0, key: "detecting" });
      } else if (d.type === "jwsim/limit-switch" && String(p.source ?? "") === `${valveId}.position`) {
        list.push({ id: d.id, end: Number(p.min ?? 1) >= 0.5 ? 1 : 0, key: "actuated" });
      }
    }
    list.sort((a, b) => a.end - b.end || String(a.id).localeCompare(String(b.id)));
    return list;
  }

  /** Extrae grupos y canales graficables a partir del spec de la escena. */
  function extractChannels(spec) {
    const devices = spec?.devices ?? [];
    const valves = devices.filter((d) => VALVES.has(d.type));
    const groups = [];
    const channels = [];

    for (const v of valves) {
      const bi = v.type === "jwsim/solenoid-valve-2";
      const sens = sensorsOf(devices, v.id);
      const letter = sens.map((s) => /^([A-Z])\d$/.exec(s.id)?.[1]).find(Boolean);
      const shortCyl = letter || (v.params?.label ? String(v.params.label) : v.id);
      const cylTitle = letter ? `Cilindro ${letter}` : v.params?.label ? String(v.params.label) : `Cilindro ${v.id}`;

      const groupChannels = [];
      const pushCh = (ch) => {
        groupChannels.push(ch);
        channels.push(ch);
      };

      pushCh({
        id: `${v.id}.position`,
        groupId: v.id,
        kind: "cyl",
        label: `${cylTitle} (${v.id})`,
        shortLabel: shortCyl,
        deviceId: v.id,
        key: "position",
        unit: "",
        min: 0,
        max: 1,
      });

      if (bi) {
        pushCh({
          id: `${v.id}.coilPlus`,
          groupId: v.id,
          kind: "coil",
          label: `Bobina ${v.id}+`,
          shortLabel: `${v.id}+`,
          deviceId: v.id,
          key: "coilPlus",
          unit: "",
          min: 0,
          max: 1,
        });
        pushCh({
          id: `${v.id}.coilMinus`,
          groupId: v.id,
          kind: "coil",
          label: `Bobina ${v.id}−`,
          shortLabel: `${v.id}−`,
          deviceId: v.id,
          key: "coilMinus",
          unit: "",
          min: 0,
          max: 1,
        });
      } else {
        pushCh({
          id: `${v.id}.energized`,
          groupId: v.id,
          kind: "coil",
          label: `Bobina ${v.id}`,
          shortLabel: v.id,
          deviceId: v.id,
          key: "energized",
          unit: "",
          min: 0,
          max: 1,
        });
      }

      for (const s of sens) {
        pushCh({
          id: `${s.id}.${s.key}`,
          groupId: v.id,
          kind: "sensor",
          label: `Sensor ${s.id}`,
          shortLabel: s.id,
          deviceId: s.id,
          key: s.key,
          unit: "",
          min: 0,
          max: 1,
        });
      }

      groups.push({ id: v.id, label: cylTitle, valveType: v.type, channels: groupChannels });
    }

    const airDevs = devices.filter((d) => d.type === "jwsim/service-unit" || d.type === "jwsim/compressor");
    if (valves.length && airDevs.length) {
      const airChannels = [];
      for (const d of airDevs) {
        const isComp = d.type === "jwsim/compressor";
        const maxBar = Math.max(10, Number(d.params?.pOff ?? d.params?.setpoint ?? 8) || 10);
        const ch = {
          id: `${d.id}.pressure`,
          groupId: "air",
          kind: "pressure",
          label: isComp ? `Presión tanque ${d.id}` : `Presión regulada ${d.id}`,
          shortLabel: `${d.id} bar`,
          deviceId: d.id,
          key: "pressure",
          unit: "bar",
          min: 0,
          max: maxBar,
          threshold: MIN_BAR,
        };
        airChannels.push(ch);
        channels.push(ch);
      }
      groups.push({ id: "air", label: "Aire comprimido", valveType: null, channels: airChannels });
    }

    return { groups, channels, hasPneumatics: valves.length > 0 };
  }

  /** Compara dos mapas planos de señales con tolerancia numérica. */
  function sameValues(a, b) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!(k in b) || Math.abs(a[k] - b[k]) > 1e-4) return false;
    }
    return true;
  }

  /** Extrae el vector plano de salidas relevantes de un snapshot. */
  function flattenSnap(snap) {
    const v = {};
    for (const d of snap?.devices ?? []) {
      const o = d.outputs;
      if (!o) continue;
      for (const k of TRACKED_KEYS) {
        if (k in o) {
          const n = toNum(o[k]);
          if (n !== undefined) v[`${d.id}.${k}`] = n;
        }
      }
    }
    return v;
  }

  /** Búfer temporal con conservación al detener y reinicio en corrida nueva. */
  function createRecorder(maxPoints = 24000) {
    let pts = [];
    let wasRunning = false;
    let lastT = -1;

    function reset() {
      pts = [];
      lastT = -1;
    }

    function onProjectReset() {
      wasRunning = false;
      reset();
    }

    function push(snap, running) {
      if (!running || !snap) {
        wasRunning = false;
        return false;
      }
      const t = Math.max(0, Number(snap.t_ms ?? 0));
      if (!wasRunning || (lastT >= 0 && t < lastT - 1e-6)) {
        reset();
      }
      wasRunning = true;
      if (t < lastT) return false;

      const v = flattenSnap(snap);
      if (pts.length >= 2 && sameValues(pts[pts.length - 1].v, v) && sameValues(pts[pts.length - 2].v, v)) {
        pts[pts.length - 1].t = t;
      } else if (pts.length === 1 && t === pts[0].t) {
        pts[0].v = v;
      } else {
        pts.push({ t, v });
        if (pts.length > maxPoints) pts.shift();
      }
      lastT = t;
      return true;
    }

    return {
      push,
      reset,
      onProjectReset,
      samples: () => pts,
      lastTimeMs: () => lastT,
    };
  }

  /** Valor de un canal en el instante tMs (interpolado en analógicos, escalón en digitales). */
  function valueAt(samples, ch, tMs) {
    if (!samples.length) return undefined;
    const id = ch.id;
    if (tMs <= samples[0].t) return samples[0].v[id];
    const last = samples[samples.length - 1];
    if (tMs >= last.t) return last.v[id];

    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= tMs) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const va = a.v[id];
    const vb = b.v[id];
    if (va === undefined) return vb;
    if (ch.kind === "coil" || ch.kind === "sensor" || vb === undefined || b.t === a.t) return va;
    const alpha = (tMs - a.t) / (b.t - a.t);
    return va + (vb - va) * alpha;
  }

  /** Calcula el rango [t0, t1] visible según ventana (0 = todo) y congelado. */
  function windowBounds(totalEndMs, windowMs, panEndMs, frozen) {
    const end = Math.max(0, Number(totalEndMs) || 0);
    if (!windowMs || windowMs <= 0) {
      return { t0: 0, t1: end };
    }
    const base = frozen && panEndMs != null ? Math.min(end, panEndMs) : end;
    const t1 = Math.max(windowMs, base);
    const t0 = Math.max(0, t1 - windowMs);
    return { t0, t1 };
  }

  return { extractChannels, createRecorder, valueAt, windowBounds, MIN_BAR };
});
