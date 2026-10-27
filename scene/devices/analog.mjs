// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Señales analógicas de campo: potenciómetro de panel y calibrador de lazo
// (0-10 V / 4-20 mA). El JWPLC Basic no tiene entradas ni salidas
// analógicas; estas señales van a los equipos de campo (AVI del VFD-EL). Se
// cablean como sondas (probes): la entrada que las lee declara los mismos
// bornes y tipo (probeInputs) y un cable cortado se ve como señal perdida.

/** @param {unknown} v @param {number} def */
const pct = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : def;
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const potentiometer = {
  type: "jwsim/potentiometer",
  version: "1.0.0",
  name: "Potenciómetro de panel 5 kΩ",
  category: "Mando",
  description:
    "Potenciómetro lineal de 5 kΩ para montaje en panel (22 mm) con perilla graduada 0 a 10. Bornes 1 y 3 en los extremos y 2 en el cursor; girando en sentido horario el cursor va hacia 3. Para la frecuencia de un variador: 3 a 10V, 2 a AVI y 1 a ACM (con 1 y 3 cruzados gira al revés). La perilla se arrastra en el símbolo.",
  parameters: [{ id: "posicion", label: "Posición de la perilla", type: "number", default: 50, unit: "%", hint: "0 a 100; se gira en el símbolo" }],
  terminals: [{ id: "1", label: "1 (extremo)" }, { id: "2", label: "2 (cursor)" }, { id: "3", label: "3 (extremo, horario)" }],
  actions: [{ id: "pos", label: "Perilla", kind: "value", min: 0, max: 100, unit: "%" }],
  probes: () => [{ id: "pot", kind: "pot", terminals: ["3", "2", "1"], output: "ratio" }],
  create(ctx) {
    const pos0 = pct(ctx.params.posicion, 50);
    return {
      update(_t, inp) {
        const pos = pct(inp.actions.pos, pos0);
        return {
          outputs: { ratio: pos / 100, pos, dial: Math.round(pos) / 10 },
          ...(pos !== pos0 ? { params: { posicion: pos } } : {}),
        };
      },
    };
  },
};

const MODES = ["4-20 mA", "0-10 V"];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const signalSource = {
  type: "jwsim/signal-source",
  version: "1.0.0",
  name: "Calibrador de lazo 4-20 mA / 0-10 V",
  category: "Instrumentación",
  description:
    "Calibrador de lazo portátil que genera una señal de 4-20 mA (fuente de corriente, como un transmisor de 2 hilos con su fuente) o de 0-10 V, ajustable de 0 a 100 %. Se conecta + y - a la entrada analógica (AVI y ACM del variador, con Sw2 según el tipo de señal). Un cable cortado es un lazo abierto: la entrada ve 0 mA.",
  parameters: [
    { id: "modo", label: "Señal", type: "enum", options: MODES, default: MODES[0] },
    { id: "valor", label: "Valor", type: "number", default: 50, unit: "%", hint: "0 a 100 % del rango; se ajusta en el símbolo" },
  ],
  terminals: [{ id: "+", label: "+ (salida)" }, { id: "-", label: "- (común)" }],
  actions: [{ id: "valor", label: "Ajuste", kind: "value", min: 0, max: 100, unit: "%" }],
  probes: (p) =>
    String(p.modo).startsWith("0-10")
      ? [{ id: "out", kind: "0-10V", terminals: ["+", "-"], output: "senal" }]
      : [{ id: "out", kind: "4-20mA", terminals: ["+", "-"], output: "senal" }],
  create(ctx) {
    const volts = String(ctx.params.modo).startsWith("0-10");
    const v0 = pct(ctx.params.valor, 50);
    return {
      update(_t, inp) {
        const valor = pct(inp.actions.valor, v0);
        const senal = Math.round((volts ? valor / 10 : 4 + (16 * valor) / 100) * 1000) / 1000;
        return {
          outputs: { valor, senal, texto: `${senal.toFixed(2)} ${volts ? "V" : "mA"}` },
          ...(valor !== v0 ? { params: { valor } } : {}),
        };
      },
    };
  },
};
