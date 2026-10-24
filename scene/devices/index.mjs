// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Biblioteca de dispositivos de la escena (propuesta v0.1, gate
// JWSIM_G7_DEVICE_LIBRARY) y registro por tipo y versión.

import { buzzer, contactor, lamp, motor, relay, solenoidValve } from "./loads.mjs";
import { limitSwitch, pushbuttonNC, pushbuttonNO, pushbuttonNONC, pushbuttonNONO, selector2, selector3 } from "./controls.mjs";
import { jwplcBasic } from "./jwplc-basic.mjs";
import { power230, power24 } from "./supplies.mjs";
import { sensorInductive, sensorPhotoelectric } from "./sensors.mjs";

export const builtinDevices = [
  jwplcBasic,
  power24,
  power230,
  pushbuttonNO,
  pushbuttonNC,
  pushbuttonNONO,
  pushbuttonNONC,
  selector2,
  selector3,
  limitSwitch,
  sensorInductive,
  sensorPhotoelectric,
  lamp,
  buzzer,
  relay,
  contactor,
  solenoidValve,
  motor,
];

/** Compara versiones x.y.z. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export class Registry {
  /** @type {Map<string, import("../../sdk/jwsim-device.js").DeviceDefinition[]>} */
  #byType = new Map();

  constructor(defs = builtinDevices) {
    for (const d of defs) this.add(d);
  }

  /** @param {import("../../sdk/jwsim-device.js").DeviceDefinition} def */
  add(def) {
    for (const k of ["type", "version", "name", "terminals", "create"]) {
      if (!(k in def)) throw new Error(`dispositivo sin "${k}": ${def.type ?? "(sin tipo)"}`);
    }
    if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(def.type)) throw new Error(`tipo inválido: ${def.type} (formato autor/nombre)`);
    if (!/^\d+\.\d+\.\d+$/.test(def.version)) throw new Error(`versión inválida en ${def.type}: ${def.version}`);
    const list = this.#byType.get(def.type) ?? [];
    if (list.some((d) => d.version === def.version)) throw new Error(`${def.type}@${def.version} ya está registrado`);
    list.push(def);
    list.sort((x, y) => compareVersions(y.version, x.version));
    this.#byType.set(def.type, list);
  }

  /**
   * Definición por tipo; con versión pide la misma versión mayor y toma la
   * más nueva compatible (semver: un cambio de versión mayor rompe la escena).
   */
  get(type, version) {
    const list = this.#byType.get(type);
    if (!list) throw new Error(`dispositivo desconocido: ${type}`);
    if (!version) return list[0];
    const major = String(version).split(".")[0];
    const ok = list.find((d) => d.version.split(".")[0] === major && compareVersions(d.version, version) >= 0);
    if (!ok) throw new Error(`${type}@${version} no está instalado (hay ${list.map((d) => d.version).join(", ")})`);
    return ok;
  }

  list() {
    return [...this.#byType.values()].map((l) => l[0]);
  }
}
