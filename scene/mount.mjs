// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Acoples: equipos que en el tablero real se engrapan a otro y quedan unidos
// sin cables (el relé térmico bajo el contactor). En la escena, el equipo
// acoplado lleva `mount: "<id del anfitrión>"`; su posición sale de la del
// anfitrión y sus bornes quedan unidos por dentro a los del anfitrión.

/**
 * Reglas de acople por tipo de equipo acoplado (sin autor).
 * - hosts: tipos de anfitrión admitidos;
 * - dx, dy: posición del acoplado respecto del anfitrión (px de escena);
 * - links: [borne del acoplado, borne del anfitrión] unidos por dentro.
 * @type {Record<string, { hosts: string[], dx: number, dy: number, links: [string, string][] }>}
 */
export const MOUNTS = {
  // Los puentes de cobre 1-3-5 del térmico entran por abajo en 2/T1, 4/T2 y 6/T3:
  // el térmico queda pegado al borde inferior del contactor (se dibuja detrás).
  "overload-relay": { hosts: ["contactor"], dx: 0, dy: 280, links: [["1", "2"], ["3", "4"], ["5", "6"]] },
};

/** Nombre del tipo sin autor: "jwsim/contactor" → "contactor". */
export const baseType = (type) => String(type ?? "").split("/").pop();

/** Regla de acople del equipo, o null si no se acopla a nada. */
export const mountRule = (type) => MOUNTS[baseType(type)] ?? null;

/** ¿El equipo `guest` puede acoplarse al `host`? (ambos sin girar) */
export function canMount(guest, host) {
  const r = mountRule(guest?.type);
  return !!r && !!host && guest.id !== host.id && r.hosts.includes(baseType(host.type)) && !(guest.rotation ?? 0) && !(host.rotation ?? 0);
}

/** Posición del acoplado sobre su anfitrión. */
export function mountPos(guest, host) {
  const r = mountRule(guest.type);
  return { x: (host.x ?? 0) + r.dx, y: (host.y ?? 0) + r.dy };
}

/**
 * Uniones internas de los acoples válidos de la escena, como pares de bornes
 * "<id>.<borne>". Un acople a un anfitrión inexistente o incompatible se ignora.
 * @param {{ devices?: { id: string, type: string, mount?: string, rotation?: number }[] }} spec
 * @returns {[string, string][]}
 */
export function mountLinks(spec) {
  const byId = new Map((spec.devices ?? []).map((d) => [d.id, d]));
  const out = [];
  for (const d of spec.devices ?? []) {
    if (!d.mount) continue;
    const host = byId.get(d.mount);
    if (!canMount(d, host)) continue;
    for (const [g, h] of mountRule(d.type).links) out.push([`${d.id}.${g}`, `${host.id}.${h}`]);
  }
  return out;
}
