// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Sensores de 3 hilos (IEC 60947-5-2): BN (+), BU (0 V), BK (salida). Con
// salida PNP la salida conmuta BK al positivo (BN); con NPN, a 0 V (BU). La
// salida solo conmuta con el sensor alimentado con la polaridad correcta.

import { Delay, earliest, ms } from "../device-kit.mjs";

// Inductivo: Autonics PR18-8D (M18 no blindado). Sn = 8 mm sobre acero
// (pieza estándar) e histéresis del 10 %: conmuta al acercarse a Sn y suelta al alejarse más de 1,1·Sn.
// La pieza se ubica con la acción "distance" (mm, se arrastra en el símbolo)
// o con el parámetro del mismo nombre antes de simular.
export const INDUCTIVE = { sn: 8, hysteresis: 0.1, travel: 20, linked: 3 };

// Capacitivo: Autonics CR18-8DP (M18 de plástico, no blindado). Sn ajustable
// hasta 8 mm con el potenciómetro de sensibilidad e histéresis máx. 20 %.
// Detecta metales y también no metales (agua, madera, plástico, vidrio).
export const CAPACITIVE = { sn: 8, hysteresis: 0.2, travel: 20, linked: 3 };

// Factor de corrección del alcance según el material de la pieza (Sn real =
// Sn × factor). Inductivo: tablas de Autonics y Pepperl+Fuchs (el acero es
// la pieza estándar; un no metal no se detecta). Capacitivo: la constante
// dieléctrica manda (agua y metales al 100 %).
export const MATERIALS = {
  inductive: { acero: 1, "acero inoxidable": 0.75, "latón": 0.5, aluminio: 0.45, cobre: 0.4, "plástico": 0, madera: 0, agua: 0 },
  capacitive: { metal: 1, agua: 1, vidrio: 0.5, madera: 0.5, "plástico": 0.45, papel: 0.2 },
};

const fmtMm = (v) => `${(Math.round(v * 10) / 10).toFixed(1).replace(".", ",")} mm`;

/**
 * @param {"inductive" | "capacitive" | "photoelectric"} kind
 * @returns {import("../../sdk/jwsim-device.js").DeviceDefinition}
 */
function sensor(kind) {
  // Inductivo y capacitivo: pieza a una distancia, con alcance según el material.
  const proximity = kind === "inductive" || kind === "capacitive";
  const capacitive = kind === "capacitive";
  const K = capacitive ? CAPACITIVE : INDUCTIVE;
  const mats = capacitive ? MATERIALS.capacitive : MATERIALS.inductive;
  /** @type {import("../../sdk/jwsim-device.js").ParameterSpec[]} */
  const distanceParam = proximity
    ? [
        { id: "distance", label: "Distancia de la pieza", type: "number", default: 12, unit: "mm", hint: `0 a ${K.travel} mm; detecta hasta Sn (${K.sn} mm con ${capacitive ? "metal o agua" : "acero"})` },
        { id: "material", label: "Material de la pieza", type: "enum", options: Object.keys(mats), default: Object.keys(mats)[0] },
        ...(capacitive ? [{ id: "sensitivity", label: "Sensibilidad (potenciómetro)", type: "number", default: 100, unit: "%", hint: "20 a 100 %: ajusta el alcance" }] : []),
      ]
    : [];
  /** @type {import("../../sdk/jwsim-device.js").ActionSpec[]} */
  const actions = proximity
    ? [
        { id: "distance", label: "Distancia de la pieza", kind: "value", min: 0, max: K.travel, unit: "mm" },
        // Atajo (y compatibilidad con escenas y grabaciones de la 1.0): la
        // pieza pasa frente a la cara activa.
        { id: "target", label: "Pieza al frente", kind: "toggle" },
      ]
    : [{ id: "target", label: "Objeto", kind: "toggle" }];
  const NAMES = { inductive: "Sensor inductivo", capacitive: "Sensor capacitivo", photoelectric: "Sensor fotoeléctrico" };
  const DESCRIPTIONS = {
    inductive: `Sensor inductivo de 3 hilos Autonics PR18-8D (M18, detecta metal a Sn = ${K.sn} mm sobre acero, histéresis ${K.hysteresis * 100} %). Otros metales acortan el alcance (latón 50 %, aluminio 45 %, cobre 40 %) y los no metales no se detectan. Arrastre la pieza frente a la cara activa o acciónelo por la posición de otro dispositivo.`,
    capacitive: `Sensor capacitivo de 3 hilos Autonics CR18-8D (M18 de plástico, Sn ajustable hasta ${K.sn} mm, histéresis ${K.hysteresis * 100} %). Detecta metales y no metales: agua y metal al 100 %, vidrio y madera 50 %, plástico 45 %, papel 20 %, por eso sirve para nivel de líquidos o granos a través de un tanque de plástico. El potenciómetro de sensibilidad ajusta el alcance. Arrastre la pieza frente a la cara activa o acciónelo por la posición de otro dispositivo.`,
    photoelectric: "Sensor fotoeléctrico difuso de 3 hilos. Se acciona a mano o por la posición de otro dispositivo.",
  };
  return {
    type: `jwsim/sensor-${kind}`,
    version: kind === "inductive" ? "1.2.0" : "1.0.0",
    name: NAMES[kind],
    category: "Sensores",
    description: DESCRIPTIONS[kind],
    parameters: [
      { id: "output", label: "Salida", type: "enum", options: ["pnp", "npn"], default: "pnp" },
      { id: "contact", label: "Contacto", type: "enum", options: ["no", "nc"], default: "no", hint: proximity ? "NA/NC" : "no = luz, nc = oscuridad" },
      { id: "responseMs", label: "Tiempo de respuesta", type: "number", default: capacitive ? 10 : kind === "inductive" ? 1 : 0.5, unit: "ms" },
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
      let near = false; // estado de la histéresis (inductivo y capacitivo)
      // Alcance real: Sn × factor del material (× sensibilidad en el capacitivo).
      const material = String(ctx.params.material ?? Object.keys(mats)[0]);
      const factor = mats[material] ?? 1;
      const sens = capacitive ? Math.max(0.2, Math.min(1, Number(ctx.params.sensitivity ?? 100) / 100)) : 1;
      const sn = K.sn * factor * sens;
      return {
        update(t, inp) {
          const forced = !!inp.actions.target || !!inp.links.target;
          let detect = forced;
          /** @type {Record<string, unknown>} */
          const extra = {};
          if (proximity) {
            const manual = Math.max(0, Math.min(K.travel, Number(inp.actions.distance ?? ctx.params.distance ?? K.travel) || 0));
            const dist = forced ? Math.min(manual, K.linked) : manual;
            if (sn > 0 && dist <= sn) near = true;
            else if (dist > sn * (1 + K.hysteresis)) near = false;
            detect = near;
            extra.distance = dist;
            extra.sn = Math.round(sn * 100) / 100;
            extra.snTxt = sn > 0 ? `Sn ${fmtMm(sn)} · ${material}` : `no detecta ${material}`;
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
export const sensorCapacitive = sensor("capacitive");
export const sensorPhotoelectric = sensor("photoelectric");
