// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Neumática: compresor con tanque y presostato, y unidad de mantenimiento
// (filtro-regulador con manómetro). Las electroválvulas con cilindro
// (loads.mjs) toman el aire de una de ellas con su parámetro «air»: sin
// presión suficiente el cilindro no se mueve, y su velocidad sigue a la
// presión. Presiones en bar (manométrica).

import { Ramp, earliest, ms } from "../device-kit.mjs";

/** Presión nominal a la que los cilindros hacen su tiempo de carrera. */
export const NOMINAL_BAR = 6;
/** Debajo de esta presión el cilindro no vence su rozamiento: se queda quieto. */
export const MIN_BAR = 1.5;
/** Período de reevaluación mientras la presión cambia (regulador, cilindros). */
const TICK_NS = ms(100);

/** Lista de ids «Y1, Y2 Y3» → ["Y1", "Y2", "Y3"]. */
const idList = (v) =>
  String(v ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const compressor = {
  type: "jwsim/compressor",
  version: "1.0.0",
  name: "Compresor con tanque",
  category: "Neumática",
  description:
    "Compresor de pistón con tanque y presostato: arranca cuando la presión baja a la de arranque y para al llegar a la de corte. Los cilindros que se mueven (los de «Consumidores») gastan aire y la presión baja. Con alimentación «propia» funciona solo; con «230 VAC» su motor se cablea en L-N.",
  parameters: [
    { id: "supply", label: "Alimentación", type: "enum", options: ["propia", "230 VAC"], default: "propia" },
    { id: "pOff", label: "Presostato: corte", type: "number", default: 8, unit: "bar" },
    { id: "pOn", label: "Presostato: arranque", type: "number", default: 6, unit: "bar" },
    { id: "start", label: "Presión al arrancar", type: "number", default: 8, unit: "bar", hint: "0 = tanque vacío" },
    { id: "fillS", label: "Llenado de 0 al corte", type: "number", default: 20, unit: "s" },
    { id: "leak", label: "Fugas", type: "number", default: 0.02, unit: "bar/s" },
    { id: "consumers", label: "Consumidores", type: "string", default: "", hint: "electroválvulas, p. ej. Y1, Y2" },
    { id: "use", label: "Consumo por cilindro en movimiento", type: "number", default: 0.25, unit: "bar/s" },
  ],
  terminals: [{ id: "L" }, { id: "N" }],
  electrical: (p) => (p.supply === "230 VAC" ? { loads: [{ id: "motor", a: "L", b: "N", rating: "230VAC" }] } : {}),
  reads: (p) => idList(p.consumers).map((id) => ({ id: `m_${id}`, source: `${id}.moving` })),
  create(ctx) {
    const pOff = Math.max(0.5, Number(ctx.params.pOff) || 8);
    const pOn = Math.min(pOff - 0.1, Math.max(0, Number(ctx.params.pOn) || 6));
    const fill = pOff / Math.max(0.5, Number(ctx.params.fillS) || 20);
    const leak = Math.max(0, Number(ctx.params.leak) || 0);
    const use = Math.max(0, Number(ctx.params.use) || 0);
    const own = ctx.params.supply !== "230 VAC";
    const p = new Ramp(Math.max(0, Math.min(pOff, Number(ctx.params.start ?? pOff))));
    let running = false;
    return {
      update(t, inp) {
        const powered = own || !!inp.loads.motor?.on;
        const now = p.at(t);
        // Presostato con histéresis.
        if (!powered) running = false;
        else if (running && now >= pOff - 1e-9) running = false;
        else if (!running && now <= pOn + 1e-9) running = true;
        const moving = Object.values(inp.values).filter((v) => v > 0).length;
        const net = (running ? fill : 0) - leak - use * moving;
        // Hacia el corte si sube; hacia el arranque (o a 0 sin motor) si baja.
        const goal = net > 0 ? pOff : running || !powered ? 0 : pOn;
        p.set(t, now);
        // Sin cambio neto queda quieta (Ramp.step con velocidad 0 saltaría al objetivo).
        if (net !== 0) p.step(t, goal, Math.abs(net));
        const seg = p.segment(t);
        return {
          outputs: { pressure: seg, running, powered, consumers: moving },
          nextEventNs: earliest(p.next, seg.rate ? t + TICK_NS : undefined),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const serviceUnit = {
  type: "jwsim/service-unit",
  version: "1.0.0",
  name: "Unidad de mantenimiento (FR)",
  category: "Neumática",
  description:
    "Filtro-regulador con manómetro: entrega a los cilindros la presión regulada, o la del compresor si es menor. Sin compresor indicado entrega siempre la regulada (aire ideal).",
  parameters: [
    { id: "source", label: "Compresor", type: "string", default: "", hint: "p. ej. CP1; vacío = aire de red ideal" },
    { id: "setpoint", label: "Presión regulada", type: "number", default: 6, unit: "bar" },
  ],
  terminals: [],
  reads: (p) => (p.source ? [{ id: "in", source: `${String(p.source)}.pressure` }] : []),
  create(ctx) {
    const set = Math.max(0, Number(ctx.params.setpoint) || 0);
    const ideal = !ctx.params.source;
    return {
      update(_t, inp) {
        const inlet = ideal ? set : Math.max(0, inp.values.in ?? 0);
        const out = Math.min(inlet, set);
        const r = (v) => Math.round(v * 100) / 100;
        // Segmentos quietos: el valor cambia en los pasos del compresor y no
        // se registra cada décima como un cambio de salida.
        return { outputs: { pressure: { value: r(out), rate: 0 }, inlet: { value: r(inlet), rate: 0 } } };
      },
    };
  },
};
