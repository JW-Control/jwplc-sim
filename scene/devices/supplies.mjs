// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Fuentes de alimentación: 24 VDC (+V/−V) y 230 VAC (L/N). Si la netlist
// detecta un cortocircuito o un cruce, la protección dispara y la fuente
// queda sin tensión hasta que se rearme desde la escena.

// Modelos de riel DIN de Mean Well (símbolos en assets/devices/power-24vdc__<modelo>.svg).
// Todos dan 24 VDC por +V1/+V2 y −V1/−V2 (puenteados por dentro); la entrada
// L/N (y PE) no se usa todavía: la fuente es ideal y entrega 24 V sin cablearla.
// La MDR trae además el relé DC OK (DCOK1-DCOK2), cerrado con la salida en servicio.
const MODELS_24 = ["MDR-60", "HDR-60", "NDR-120"];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const power24 = {
  type: "jwsim/power-24vdc",
  version: "2.0.0",
  name: "Fuente 24 VDC",
  category: "Alimentación",
  description:
    "Fuente de riel DIN de 24 VDC (Mean Well MDR-60, HDR-60 o NDR-120) con protección contra cortocircuito (dispara y se rearma desde la escena). Salida +V/−V con dos bornes cada una; la MDR tiene relé DC OK.",
  parameters: [{ id: "model", label: "Modelo", type: "enum", options: MODELS_24, default: "MDR-60" }],
  terminals: [
    { id: "+V1", label: "+V (+24 V)" },
    { id: "+V2", label: "+V (+24 V)" },
    { id: "-V1", label: "−V (0 V)" },
    { id: "-V2", label: "−V (0 V)" },
    { id: "L", label: "L (entrada AC)" },
    { id: "N", label: "N (entrada AC)" },
    { id: "PE", label: "PE (tierra)" },
    { id: "DCOK1", label: "DC OK (relé)" },
    { id: "DCOK2", label: "DC OK (relé)" },
  ],
  electrical: (p) => ({
    sources: [{ id: "", pos: "+V1", neg: "-V1", kind: "DC", volts: 24 }],
    contacts: { "+V": ["+V1", "+V2"], "-V": ["-V1", "-V2"], ...(p.model === "MDR-60" ? { DCOK: ["DCOK1", "DCOK2"] } : {}) },
  }),
  create: (ctx) => ({
    update: (_t, inp) => ({
      contacts: { "+V": true, "-V": true, ...(ctx.params.model === "MDR-60" ? { DCOK: !inp.tripped } : {}) },
      outputs: { on: !inp.tripped },
    }),
  }),
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const power230 = {
  type: "jwsim/power-230vac",
  version: "1.0.0",
  name: "Red 230 VAC",
  category: "Alimentación",
  description: "Alimentación monofásica de 230 VAC (fase L y neutro N) con interruptor automático.",
  parameters: [],
  terminals: [
    { id: "L", label: "L (fase)" },
    { id: "N", label: "N (neutro)" },
  ],
  electrical: () => ({ sources: [{ id: "", pos: "L", neg: "N", kind: "AC", volts: 230 }] }),
  create: () => ({ update: (_t, inp) => ({ outputs: { on: !inp.tripped } }) }),
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const power3ph = {
  type: "jwsim/power-3ph",
  version: "1.0.0",
  name: "Red trifásica 220 VAC",
  category: "Alimentación",
  description:
    "Red trifásica de 220 V entre fases, 60 Hz (L1, L2, L3), con interruptor automático tripolar. Dos fases unidas son un cortocircuito y la protección dispara. Entre dos fases alimenta cargas de 230 VAC (bobinas, pilotos).",
  parameters: [],
  terminals: [
    { id: "L1", label: "L1 (fase R)" },
    { id: "L2", label: "L2 (fase S)" },
    { id: "L3", label: "L3 (fase T)" },
  ],
  electrical: () => ({ sources: [{ id: "", kind: "AC3", volts: 220, phases: { L1: "L1", L2: "L2", L3: "L3" } }] }),
  create: () => ({ update: (_t, inp) => ({ outputs: { on: !inp.tripped } }) }),
};
