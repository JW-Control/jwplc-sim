// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Elementos de mando: pulsadores NA/NC, selectores de 2 y 3 posiciones y
// fin de carrera. Numeración de bornes según IEC 60947-5-1 (x3-x4 NA,
// x1-x2 NC).

const COLORS = ["verde", "rojo", "amarillo", "azul", "blanco", "negro"];

/**
 * @param {"no" | "nc"} kind
 * @returns {import("../../sdk/jwsim-device.js").DeviceDefinition}
 */
function pushbutton(kind) {
  const no = kind === "no";
  const [a, b] = no ? ["13", "14"] : ["11", "12"];
  return {
    type: `jwsim/pushbutton-${kind}`,
    version: "1.0.0",
    name: no ? "Pulsador NA" : "Pulsador NC",
    category: "Mando",
    description: no
      ? "Pulsador de contacto normalmente abierto (13-14): cierra mientras se mantiene pulsado."
      : "Pulsador de contacto normalmente cerrado (11-12): abre mientras se mantiene pulsado.",
    parameters: [
      { id: "label", label: "Rótulo", type: "string", default: no ? "Marcha" : "Parada" },
      { id: "color", label: "Color", type: "enum", options: COLORS, default: no ? "verde" : "rojo" },
    ],
    terminals: [{ id: a }, { id: b }],
    actions: [{ id: "press", label: "Pulsar", kind: "momentary" }],
    electrical: () => ({ contacts: { [`${a}-${b}`]: [a, b] } }),
    create: () => ({
      update(_t, inp) {
        const pressed = !!inp.actions.press;
        return { contacts: { [`${a}-${b}`]: no ? pressed : !pressed }, outputs: { pressed } };
      },
    }),
  };
}

export const pushbuttonNO = pushbutton("no");
export const pushbuttonNC = pushbutton("nc");

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const selector2 = {
  type: "jwsim/selector-2",
  version: "1.0.0",
  name: "Selector 2 posiciones",
  category: "Mando",
  description: "Selector 0-I: 13-14 cierra en I y 21-22 cierra en 0. Con retorno por resorte vuelve a 0 al soltar.",
  parameters: [
    { id: "label", label: "Rótulo", type: "string", default: "Man/Auto" },
    { id: "spring", label: "Retorno por resorte", type: "boolean", default: false },
  ],
  terminals: [{ id: "13" }, { id: "14" }, { id: "21" }, { id: "22" }],
  actions: [{ id: "position", label: "Posición", kind: "select", options: [0, 1], labels: ["0", "I"] }],
  electrical: () => ({ contacts: { "13-14": ["13", "14"], "21-22": ["21", "22"] } }),
  create: () => ({
    update(_t, inp) {
      const pos = Number(inp.actions.position ?? 0) === 1 ? 1 : 0;
      return { contacts: { "13-14": pos === 1, "21-22": pos === 0 }, outputs: { position: pos } };
    },
  }),
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const selector3 = {
  type: "jwsim/selector-3",
  version: "1.0.0",
  name: "Selector 3 posiciones",
  category: "Mando",
  description: "Selector I-0-II: 13-14 cierra en I y 23-24 en II; en 0 ambos abiertos.",
  parameters: [
    { id: "label", label: "Rótulo", type: "string", default: "Izq/0/Der" },
    { id: "spring", label: "Retorno por resorte al centro", type: "boolean", default: false },
  ],
  terminals: [{ id: "13" }, { id: "14" }, { id: "23" }, { id: "24" }],
  actions: [{ id: "position", label: "Posición", kind: "select", options: [-1, 0, 1], labels: ["I", "0", "II"] }],
  electrical: () => ({ contacts: { "13-14": ["13", "14"], "23-24": ["23", "24"] } }),
  create: () => ({
    update(_t, inp) {
      const p = Math.sign(Number(inp.actions.position ?? 0));
      return { contacts: { "13-14": p === -1, "23-24": p === 1 }, outputs: { position: p } };
    },
  }),
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const limitSwitch = {
  type: "jwsim/limit-switch",
  version: "1.0.0",
  name: "Fin de carrera",
  category: "Sensores",
  description:
    "Interruptor de posición con contacto NA (13-14) y NC (21-22). Se acciona a mano o por la posición de otro dispositivo (p. ej. Y1.position entre 1 y 1 = cilindro fuera).",
  parameters: [
    { id: "source", label: "Accionado por", type: "string", default: "", hint: "dispositivo.salida, p. ej. Y1.position" },
    { id: "min", label: "Desde", type: "number", default: 1 },
    { id: "max", label: "Hasta", type: "number", default: 1 },
  ],
  terminals: [{ id: "13" }, { id: "14" }, { id: "21" }, { id: "22" }],
  actions: [{ id: "actuate", label: "Accionar", kind: "momentary" }],
  links: (p) => (p.source ? [{ id: "actuator", source: String(p.source), min: Number(p.min), max: Number(p.max) }] : []),
  electrical: () => ({ contacts: { "13-14": ["13", "14"], "21-22": ["21", "22"] } }),
  create: () => ({
    update(_t, inp) {
      const on = !!inp.actions.actuate || !!inp.links.actuator;
      return { contacts: { "13-14": on, "21-22": !on }, outputs: { actuated: on } };
    },
  }),
};
