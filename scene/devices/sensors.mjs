// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Sensores de 3 hilos (IEC 60947-5-2): BN (+), BU (0 V), BK (salida). Con
// salida PNP la salida conmuta BK al positivo (BN); con NPN, a 0 V (BU). La
// salida solo conmuta con el sensor alimentado con la polaridad correcta.

import { Delay, earliest, ms } from "../device-kit.mjs";

/**
 * @param {"inductive" | "photoelectric"} kind
 * @returns {import("../../sdk/jwsim-device.js").DeviceDefinition}
 */
function sensor(kind) {
  const inductive = kind === "inductive";
  return {
    type: `jwsim/sensor-${kind}`,
    version: "1.0.0",
    name: inductive ? "Sensor inductivo" : "Sensor fotoeléctrico",
    category: "Sensores",
    description: inductive
      ? "Sensor inductivo de 3 hilos (detecta metal). Se acciona a mano o por la posición de otro dispositivo."
      : "Sensor fotoeléctrico difuso de 3 hilos. Se acciona a mano o por la posición de otro dispositivo.",
    parameters: [
      { id: "output", label: "Salida", type: "enum", options: ["pnp", "npn"], default: "pnp" },
      { id: "contact", label: "Contacto", type: "enum", options: ["no", "nc"], default: "no", hint: inductive ? "NA/NC" : "no = luz, nc = oscuridad" },
      { id: "responseMs", label: "Tiempo de respuesta", type: "number", default: inductive ? 1 : 0.5, unit: "ms" },
      { id: "source", label: "Detecta", type: "string", default: "", hint: "dispositivo.salida, p. ej. Y1.position" },
      { id: "min", label: "Desde", type: "number", default: 1 },
      { id: "max", label: "Hasta", type: "number", default: 1 },
    ],
    terminals: [
      { id: "BN", label: "BN (+)" },
      { id: "BU", label: "BU (0 V)" },
      { id: "BK", label: "BK (salida)" },
    ],
    actions: [{ id: "target", label: inductive ? "Pieza metálica" : "Objeto", kind: "toggle" }],
    links: (p) => (p.source ? [{ id: "target", source: String(p.source), min: Number(p.min), max: Number(p.max) }] : []),
    electrical: (p) => ({
      loads: [{ id: "supply", a: "BN", b: "BU", rating: "24VDC", polar: true }],
      contacts: { out: p.output === "npn" ? ["BU", "BK"] : ["BN", "BK"] },
    }),
    create(ctx) {
      const d = ms(ctx.params.responseMs);
      const response = new Delay(d, d);
      return {
        update(t, inp) {
          const detect = !!inp.actions.target || !!inp.links.target;
          const powered = inp.loads.supply.on;
          const want = powered && detect !== (ctx.params.contact === "nc");
          const out = response.step(t, want) && powered;
          return { contacts: { out }, outputs: { detecting: detect, output: out, powered }, nextEventNs: earliest(response.next) };
        },
      };
    },
  };
}

export const sensorInductive = sensor("inductive");
export const sensorPhotoelectric = sensor("photoelectric");
