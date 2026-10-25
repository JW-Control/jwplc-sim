// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Sensores de 3 hilos (IEC 60947-5-2): BN (+), BU (0 V), BK (salida). Con
// salida PNP la salida conmuta BK al positivo (BN); con NPN, a 0 V (BU). La
// salida solo conmuta con el sensor alimentado con la polaridad correcta.

import { Delay, earliest, ms } from "../device-kit.mjs";

// Inductivo: Autonics PR18-8D (M18 no blindado). Sn = 8 mm sobre acero
// (pieza estándar), distancia de trabajo asegurada Sa = 5,6 mm e histéresis
// del 10 %: conmuta al acercarse a Sn y suelta al alejarse más de 1,1·Sn.
// La pieza se ubica con la acción "distance" (mm, se arrastra en el símbolo)
// o con el parámetro del mismo nombre antes de simular.
export const INDUCTIVE = { sn: 8, sa: 5.6, hysteresis: 0.1, travel: 25, linked: 3 };

/**
 * @param {"inductive" | "photoelectric"} kind
 * @returns {import("../../sdk/jwsim-device.js").DeviceDefinition}
 */
function sensor(kind) {
  const inductive = kind === "inductive";
  const K = INDUCTIVE;
  /** @type {import("../../sdk/jwsim-device.js").ParameterSpec[]} */
  const distanceParam = inductive
    ? [{ id: "distance", label: "Distancia de la pieza", type: "number", default: 20, unit: "mm", hint: `0 a ${K.travel} mm; detecta hasta ${K.sn} mm` }]
    : [];
  /** @type {import("../../sdk/jwsim-device.js").ActionSpec[]} */
  const actions = inductive
    ? [
        { id: "distance", label: "Distancia de la pieza", kind: "value", min: 0, max: K.travel, unit: "mm" },
        // Atajo (y compatibilidad con escenas y grabaciones de la 1.0): la
        // pieza pasa frente a la cara activa.
        { id: "target", label: "Pieza al frente", kind: "toggle" },
      ]
    : [{ id: "target", label: "Objeto", kind: "toggle" }];
  return {
    type: `jwsim/sensor-${kind}`,
    version: inductive ? "1.1.0" : "1.0.0",
    name: inductive ? "Sensor inductivo" : "Sensor fotoeléctrico",
    category: "Sensores",
    description: inductive
      ? `Sensor inductivo de 3 hilos Autonics PR18-8D (M18, detecta metal a Sn = ${K.sn} mm, histéresis ${K.hysteresis * 100} %). Arrastre la pieza frente a la cara activa o acciónelo por la posición de otro dispositivo.`
      : "Sensor fotoeléctrico difuso de 3 hilos. Se acciona a mano o por la posición de otro dispositivo.",
    parameters: [
      { id: "output", label: "Salida", type: "enum", options: ["pnp", "npn"], default: "pnp" },
      { id: "contact", label: "Contacto", type: "enum", options: ["no", "nc"], default: "no", hint: inductive ? "NA/NC" : "no = luz, nc = oscuridad" },
      { id: "responseMs", label: "Tiempo de respuesta", type: "number", default: inductive ? 1 : 0.5, unit: "ms" },
      ...distanceParam,
      { id: "source", label: "Detecta", type: "string", default: "", hint: "dispositivo.salida, p. ej. Y1.position" },
      { id: "min", label: "Desde", type: "number", default: 1 },
      { id: "max", label: "Hasta", type: "number", default: 1 },
    ],
    terminals: [
      { id: "BN", label: "BN (+)" },
      { id: "BU", label: "BU (0 V)" },
      { id: "BK", label: "BK (salida)" },
    ],
    actions,
    links: (p) => (p.source ? [{ id: "target", source: String(p.source), min: Number(p.min), max: Number(p.max) }] : []),
    electrical: (p) => ({
      loads: [{ id: "supply", a: "BN", b: "BU", rating: "24VDC", polar: true }],
      contacts: { out: p.output === "npn" ? ["BU", "BK"] : ["BN", "BK"] },
    }),
    create(ctx) {
      const d = ms(ctx.params.responseMs);
      const response = new Delay(d, d);
      let near = false; // estado de la histéresis (inductivo)
      return {
        update(t, inp) {
          const forced = !!inp.actions.target || !!inp.links.target;
          let detect = forced;
          /** @type {Record<string, unknown>} */
          const extra = {};
          if (inductive) {
            const manual = Math.max(0, Math.min(K.travel, Number(inp.actions.distance ?? ctx.params.distance ?? K.travel) || 0));
            const dist = forced ? Math.min(manual, K.linked) : manual;
            if (dist <= K.sn) near = true;
            else if (dist > K.sn * (1 + K.hysteresis)) near = false;
            detect = near;
            extra.distance = dist;
          }
          const powered = inp.loads.supply.on;
          const want = powered && detect !== (ctx.params.contact === "nc");
          const out = response.step(t, want) && powered;
          return { contacts: { out }, outputs: { detecting: detect, output: out, powered, ...extra }, nextEventNs: earliest(response.next) };
        },
      };
    },
  };
}

export const sensorInductive = sensor("inductive");
export const sensorPhotoelectric = sensor("photoelectric");
