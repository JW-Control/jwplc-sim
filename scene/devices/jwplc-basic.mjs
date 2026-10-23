// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// JWPLC Basic como dispositivo de escena, con el pinout de JW Control
// (app/renderer/assets/jwplc-basic.svg, 2026-10-23):
//   24VDC, M0        alimentación de la placa
//   M1, I0_0…I0_7    entradas digitales sink: la corriente entra por I0_x y
//                    sale por M1 (I0_x al +24 V, M1 a 0 V)
//   Q0_x.1, Q0_x.2   salida a relé con su propia bornera de 2 contactos
//                    (contacto seco NA)
//   RS485_*          bornes del bus (sin modelo eléctrico en la netlist)
// Las entradas y salidas se intercambian con el firmware simulado: la escena
// envía I0_x al runner y recibe Q0_x.

import { Delay, earliest, ms } from "../device-kit.mjs";

const K = [0, 1, 2, 3, 4, 5, 6, 7];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const jwplcBasic = {
  type: "jwsim/jwplc-basic",
  version: "1.0.0",
  name: "JWPLC Basic",
  category: "Controladores",
  description:
    "Controlador JWPLC Basic: 8 entradas sink de 24 VDC (común M1) y 8 salidas a relé con bornera propia. Corre el firmware del proyecto.",
  parameters: [
    { id: "requirePower", label: "Relés solo con 24VDC/M0 alimentado", type: "boolean", default: true },
    { id: "relayOnMs", label: "Atraque de los relés", type: "number", default: 10, unit: "ms" },
    { id: "relayOffMs", label: "Caída de los relés", type: "number", default: 5, unit: "ms" },
  ],
  terminals: [
    { id: "24VDC", label: "+24 VDC" },
    { id: "M0", label: "0 V (M0)" },
    { id: "M1", label: "Común de entradas (M1)" },
    ...K.map((k) => ({ id: `I0_${k}`, label: `Entrada I0.${k}` })),
    ...K.flatMap((k) => [
      { id: `Q0_${k}.1`, label: `Salida Q0.${k}, contacto 1` },
      { id: `Q0_${k}.2`, label: `Salida Q0.${k}, contacto 2` },
    ]),
    ...["RS485_GND", "RS485_A", "RS485_B", "RS485_SHIELD"].map((id) => ({ id })),
  ],
  signals: { in: K.map((k) => `Q0_${k}`), out: K.map((k) => `I0_${k}`) },
  electrical: () => ({
    loads: [
      { id: "power", a: "24VDC", b: "M0", rating: "24VDC", polar: true },
      ...K.map((k) => ({ id: `I0_${k}`, a: `I0_${k}`, b: "M1", rating: "24VDC", polar: true })),
    ],
    contacts: Object.fromEntries(K.map((k) => [`Q0_${k}`, [`Q0_${k}.1`, `Q0_${k}.2`]])),
  }),
  create(ctx) {
    const relays = K.map(() => new Delay(ms(ctx.params.relayOnMs), ms(ctx.params.relayOffMs)));
    return {
      update(t, inp) {
        const powered = inp.loads.power.on;
        const relayPower = powered || !ctx.params.requirePower;
        /** @type {Record<string, boolean>} */
        const contacts = {};
        /** @type {Record<string, boolean>} */
        const outputs = { powered };
        for (const k of K) {
          contacts[`Q0_${k}`] = relays[k].step(t, relayPower && !!inp.signals[`Q0_${k}`]);
          // Solo las entradas cableadas las maneja la escena; el resto queda
          // para los botones de la interfaz.
          if (inp.wired.has(`I0_${k}`)) outputs[`I0_${k}`] = inp.loads[`I0_${k}`].on;
        }
        return { contacts, outputs, nextEventNs: earliest(...relays.map((r) => r.next)) };
      },
    };
  },
};
