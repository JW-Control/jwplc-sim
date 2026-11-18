// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Bombeo de edificio a presión constante: la red de agua del edificio con su
// tanque hidroneumático, alimentada por bombas centrífugas (motores de la
// escena), y el transmisor de presión RS-485 que la mide.
//
// Bombas: curva parabólica con las leyes de afinidad (caudal ∝ n, presión de
// cierre ∝ n²). Consumo del edificio: grifos abiertos, caudal ∝ √P. Tanque
// hidroneumático con precarga de aire (Boyle): su capacidad en L/bar baja
// con la presión; debajo de la precarga solo queda la elasticidad de la
// tubería y la presión cambia rápido.

import { BUS_PARAMS, POWER_BUS, int16, regs } from "./process.mjs";

const TICK_S = 0.1;
const SUB_S = 0.01;
const TICK_NS = 100_000_000n;
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const idList = (v) =>
  String(v ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const buildingWater = {
  type: "jwsim/building-water",
  version: "1.0.0",
  name: "Red de agua del edificio (hidroneumático)",
  category: "Planta",
  description:
    "Montante y red de un edificio con tanque hidroneumático. Las bombas (motores de la escena en «Bombas», p. ej. M1, M2) succionan de la cisterna y empujan agua con su curva: a 60 Hz dan el caudal máximo a 0 bar y nada a la presión de cierre; a menos velocidad, caudal y presión bajan según las leyes de afinidad. El consumo del edificio (grifos abiertos) se ajusta en el símbolo y crece con la presión. Sin agua en la cisterna las bombas trabajan en seco y no dan caudal. Salidas: presion (bar), qBombas y qConsumo (L/min) y reposicion (válvula de flotador de la cisterna: 1 bajo el 90 %, 0 sobre el 97 %).",
  parameters: [
    { id: "bombas", label: "Bombas", type: "string", default: "M1, M2", hint: "motores de las bombas, separados por coma" },
    { id: "qMax", label: "Caudal máximo por bomba (60 Hz)", type: "number", default: 150, unit: "L/min" },
    { id: "pCierre", label: "Presión de cierre (60 Hz)", type: "number", default: 7, unit: "bar" },
    { id: "consumo", label: "Consumo del edificio a 3,5 bar", type: "number", default: 60, unit: "L/min" },
    { id: "hidro", label: "Tanque hidroneumático", type: "number", default: 24, unit: "L" },
    { id: "precarga", label: "Precarga de aire", type: "number", default: 2, unit: "bar" },
    { id: "cisterna", label: "Nivel de la cisterna", type: "string", default: "", hint: "dispositivo.salida de 0 a 1, p. ej. T1.nivel; vacía = siempre con agua" },
    { id: "presion0", label: "Presión inicial", type: "number", default: 3, unit: "bar" },
  ],
  terminals: [],
  actions: [{ id: "consumo", label: "Consumo del edificio", kind: "value", min: 0, max: 300, unit: "L/min" }],
  reads: (p) => [
    ...idList(p.bombas).map((id) => ({ id: `n_${id}`, source: `${id}.speed` })),
    ...(p.cisterna ? [{ id: "cis", source: String(p.cisterna) }] : []),
  ],
  create(ctx) {
    const p = ctx.params;
    const pumps = idList(p.bombas);
    const qMax = Math.max(1, num(p.qMax, 150));
    const pMax = Math.max(0.5, num(p.pCierre, 7));
    const vH = Math.max(1, num(p.hidro, 24));
    const pre = Math.max(0, num(p.precarga, 2));
    let P = Math.max(0, num(p.presion0, 3));
    /** @type {bigint | null} */
    let lastT = null;
    let u = { speeds: /** @type {number[]} */ ([]), demand: num(p.consumo, 60), wet: true };
    let refill = false;
    const pumpQ = (n, bar) => {
      const s = Math.min(1.2, Math.abs(n));
      if (s < 0.05) return 0;
      const shut = pMax * s * s;
      return bar >= shut ? 0 : qMax * s * Math.sqrt(1 - bar / shut);
    };
    const flows = (bar) => {
      const qp = u.wet ? u.speeds.reduce((a, n) => a + pumpQ(n, bar), 0) : 0;
      const qd = u.demand * Math.sqrt(Math.max(0, bar) / 3.5);
      return { qp, qd };
    };
    /** Capacidad en L/bar: agua que entra al hidroneumático por bar (Boyle), o la tubería sola. */
    const cap = (bar) => (bar <= pre ? 1.5 : (vH * (1 + pre)) / ((1 + bar) * (1 + bar)));
    const advance = (sec) => {
      const n = Math.max(1, Math.ceil(sec / SUB_S));
      const h = sec / n;
      for (let i = 0; i < n; i++) {
        const { qp, qd } = flows(P);
        P = Math.max(0, Math.min(pMax * 1.5, P + ((qp - qd) / 60 / cap(P)) * h));
      }
    };
    return {
      update(t, inp) {
        if (lastT !== null && t > lastT) advance(Number(t - lastT) / 1e9);
        lastT = t;
        const level = p.cisterna ? num(inp.values.cis, 1) : 1;
        u = {
          speeds: pumps.map((id) => num(inp.values[`n_${id}`], 0)),
          demand: Math.max(0, num(inp.actions.consumo ?? p.consumo, 60)),
          wet: level > 0.02,
        };
        // En t = 0 la cisterna puede no haber publicado su nivel todavía.
        if (t > 0n && level < 0.9) refill = true;
        else if (level > 0.97) refill = false;
        const { qp, qd } = flows(P);
        const r2 = (v) => Math.round(v * 100) / 100;
        const r1 = (v) => Math.round(v * 10) / 10;
        const moving = Math.abs(qp - qd) > 0.05 || u.speeds.some((n) => Math.abs(n) > 0.01);
        return {
          outputs: {
            presion: r2(P),
            qBombas: r1(qp),
            qConsumo: r1(qd),
            consumo: u.demand,
            reposicion: refill ? 1 : 0,
            seco: !u.wet && u.speeds.some((n) => Math.abs(n) > 0.05),
            bombas: u.speeds.filter((n) => Math.abs(n) > 0.05).length,
          },
          nextEventNs: moving || P > 0.01 ? t + TICK_NS : undefined,
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const pressureRs485 = {
  type: "jwsim/pressure-rs485",
  version: "1.0.0",
  name: "Transmisor de presión RS-485 0-10 bar",
  category: "Sensores",
  description:
    "Transmisor de presión piezorresistivo de 0 a 10 bar (rosca G1/4) con salida RS-485 Modbus RTU, 12-30 VDC. De fábrica: dirección 1, 9600 bps, 8N1. Registro 0 = presión × 100 (bar), funciones 03 y 04. Con «Mide» toma la presión de otro equipo (p. ej. RED1.presion); vacío, se ajusta a mano. Sensor abierto: 32767.",
  parameters: [
    ...BUS_PARAMS.filter((q) => q.id !== "sonda"),
    { id: "source", label: "Mide", type: "string", default: "", hint: "dispositivo.salida en bar, p. ej. RED1.presion; vacío = simulada" },
    { id: "presion", label: "Presión (simulada)", type: "number", default: 3, unit: "bar" },
  ],
  terminals: POWER_BUS,
  actions: [
    { id: "presion", label: "Presión (simulada)", kind: "value", min: 0, max: 10, unit: "bar" },
    { id: "falla", label: "Falla del sensor", kind: "select", options: [0, 1], labels: ["Normal", "Sensor abierto"] },
  ],
  reads: (p) => (p.source ? [{ id: "p", source: String(p.source) }] : []),
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create(ctx) {
    let powered = false;
    let raw = 0;
    return {
      update(_t, inp) {
        const bar = ctx.params.source ? num(inp.values.p, 0) : num(inp.actions.presion ?? ctx.params.presion, 0);
        const open = Number(inp.actions.falla ?? 0) === 1;
        powered = inp.loads.supply.on;
        const v = Math.max(0, Math.min(10, bar));
        raw = open ? 32767 : Math.round(v * 100);
        return { outputs: { powered, presion: open ? null : Math.round(v * 100) / 100, sensor: open ? "abierto" : "ok", raw } };
      },
      modbusRead(_table, start, count) {
        return powered ? regs({ 0: int16(raw) }, start, count) : undefined;
      },
    };
  },
};
