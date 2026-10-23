// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Fuentes de alimentación: 24 VDC (L+/M) y 230 VAC (L/N). Si la netlist
// detecta un cortocircuito o un cruce, la protección dispara y la fuente
// queda sin tensión hasta que se rearme desde la escena.

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const power24 = {
  type: "jwsim/power-24vdc",
  version: "1.0.0",
  name: "Fuente 24 VDC",
  category: "Alimentación",
  description: "Fuente conmutada de 24 VDC con protección contra cortocircuito (dispara y se rearma desde la escena).",
  parameters: [],
  terminals: [
    { id: "L+", label: "L+ (+24 V)" },
    { id: "M", label: "M (0 V)" },
  ],
  electrical: () => ({ sources: [{ id: "", pos: "L+", neg: "M", kind: "DC", volts: 24 }] }),
  create: () => ({ update: (_t, inp) => ({ outputs: { on: !inp.tripped } }) }),
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
