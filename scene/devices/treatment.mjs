// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Tratamiento de agua: filtro de arena con retrolavado, dosificación de
// cloro en línea y analizador de cloro residual por RS-485.
//
// Filtro: se colmata con el volumen filtrado y la turbidez de entrada; la
// presión diferencial crece con la colmatación y con el caudal al cuadrado,
// y el caudal de servicio baja. El retrolavado (agua al revés, al desagüe)
// limpia el lecho con una constante de tiempo de 8 s. Muy colmatado, el
// filtro deja pasar turbidez.
//
// Cloración: la bomba dosificadora inyecta hipoclorito en la tubería de agua
// filtrada; la concentración en la cámara de contacto sigue a dosis/caudal
// con una constante de mezcla, y sin caudal decae lentamente (demanda de
// cloro). El analizador mide a la salida de la cámara.

import { BUS_PARAMS, POWER_BUS, int16, regs } from "./process.mjs";

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const TICK_NS = 200_000_000n;
const r2 = (v) => Math.round(v * 100) / 100;

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const sandFilter = {
  type: "jwsim/sand-filter",
  version: "1.0.0",
  name: "Filtro de arena con retrolavado",
  category: "Planta",
  description:
    "Filtro a presión de arena y antracita. Lo alimenta la bomba de captación (parámetro Bomba, p. ej. M1.speed) y lo gobiernan dos válvulas: Servicio (agua filtrada al reservorio, p. ej. Y1.open) y Retrolavado (agua al revés, al desagüe, p. ej. Y2.open). Se colmata con el volumen filtrado según la turbidez de entrada (se ajusta en el símbolo o con «Colmatar»); la presión diferencial dp (bar) crece con la colmatación y acciona el presostato diferencial (source F1.dp). qServicio (L/min) y qRel (0-1, para la Bomba del reservorio) son el agua filtrada; muy colmatado deja pasar turbidez (turbidezSalida, NTU).",
  parameters: [
    { id: "bomba", label: "Bomba", type: "string", default: "", hint: "dispositivo.salida de 0 a 1, p. ej. M1.speed" },
    { id: "servicio", label: "Válvula de servicio", type: "string", default: "", hint: "p. ej. Y1.open" },
    { id: "retrolavado", label: "Válvula de retrolavado", type: "string", default: "", hint: "p. ej. Y2.open" },
    { id: "caudal", label: "Caudal de la bomba", type: "number", default: 120, unit: "L/min" },
    { id: "capacidad", label: "Volumen hasta colmatarse (a 20 NTU)", type: "number", default: 3000, unit: "L" },
    { id: "turbidez", label: "Turbidez del agua cruda", type: "number", default: 20, unit: "NTU" },
    { id: "colmatacion0", label: "Colmatación inicial", type: "number", default: 30, unit: "%" },
  ],
  terminals: [],
  actions: [
    { id: "turbidez", label: "Turbidez del agua cruda", kind: "value", min: 0, max: 200, unit: "NTU" },
    { id: "colmatar", label: "Colmatar el filtro", kind: "momentary" },
  ],
  reads: (p) => [
    ...(p.bomba ? [{ id: "bomba", source: String(p.bomba) }] : []),
    ...(p.servicio ? [{ id: "srv", source: String(p.servicio) }] : []),
    ...(p.retrolavado ? [{ id: "bw", source: String(p.retrolavado) }] : []),
  ],
  create(ctx) {
    const p = ctx.params;
    const qNom = Math.max(1, num(p.caudal, 120));
    const cap = Math.max(10, num(p.capacidad, 3000));
    let clog = Math.max(0, Math.min(1, num(p.colmatacion0, 30) / 100));
    /** @type {bigint | null} */
    let lastT = null;
    let st = { q: 0, srv: false, bw: false, ntu: num(p.turbidez, 20) };
    const flows = () => {
      if (st.q <= 0.01) return { qs: 0, qb: 0 };
      if (st.bw) return { qs: 0, qb: st.q * qNom * 1.1 };
      if (st.srv) return { qs: st.q * qNom * Math.max(0.15, 1 - 0.6 * clog * clog), qb: 0 };
      return { qs: 0, qb: 0 };
    };
    return {
      update(t, inp) {
        if (lastT !== null && t > lastT) {
          const sec = Number(t - lastT) / 1e9;
          const { qs, qb } = flows();
          if (qb > 0) clog *= Math.exp(-sec / 8);
          else if (qs > 0) clog = Math.min(1, clog + ((qs / 60) * sec * (st.ntu / 20)) / cap);
        }
        lastT = t;
        if (inp.actions.colmatar) clog = Math.max(clog, 0.95);
        st = {
          q: Math.max(0, Math.min(1, Math.abs(num(inp.values.bomba, 0)))),
          srv: p.servicio ? num(inp.values.srv, 0) > 0.5 : true,
          bw: p.retrolavado ? num(inp.values.bw, 0) > 0.5 : false,
          ntu: Math.max(0, num(inp.actions.turbidez ?? p.turbidez, 20)),
        };
        const { qs, qb } = flows();
        // Presión diferencial en servicio: la bomba empuja contra el lecho (con su velocidad al cuadrado).
        const dp = qs > 0 ? (0.15 + 1.1 * clog) * st.q * st.q : 0;
        const through = qs > 0 ? st.ntu * (0.04 + (0.9 * Math.max(0, clog - 0.85)) / 0.15) : 0;
        return {
          outputs: {
            dp: r2(dp),
            qServicio: Math.round(qs * 10) / 10,
            qRetrolavado: Math.round(qb * 10) / 10,
            qRel: r2(qs / qNom),
            colmatacion: Math.round(clog * 1000) / 10,
            turbidez: st.ntu,
            turbidezSalida: Math.round(through * 10) / 10,
            lavando: qb > 0,
            cerrado: st.q > 0.05 && qs + qb === 0,
          },
          nextEventNs: qs + qb > 0 ? t + TICK_NS : undefined,
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const chlorinator = {
  type: "jwsim/chlorinator",
  version: "1.0.0",
  name: "Bomba dosificadora de cloro",
  category: "Actuadores",
  description:
    "Bomba dosificadora de diafragma con tanque de hipoclorito de sodio, bobina de 24 VDC en A1-A2 (marcha mientras está energizada). Inyecta en la tubería de agua filtrada (parámetro Caudal de agua, p. ej. F1.qServicio): la concentración en la cámara de contacto (cloro, mg/L) va hacia dosis / caudal con la constante de mezcla y sin caudal decae por la demanda de cloro. Fallas: «sin caudal» (bomba descebada: no dosifica) y el tanque de hipoclorito que se vacía.",
  parameters: [
    { id: "agua", label: "Caudal de agua", type: "string", default: "", hint: "dispositivo.salida en L/min, p. ej. F1.qServicio" },
    { id: "dosis", label: "Dosis de la bomba", type: "number", default: 300, unit: "mg/min", hint: "cloro activo por minuto en marcha" },
    { id: "mezclaS", label: "Constante de mezcla", type: "number", default: 30, unit: "s" },
    { id: "demanda", label: "Demanda de cloro", type: "number", default: 0.1, unit: "1/min" },
    { id: "cloro0", label: "Cloro inicial", type: "number", default: 0.8, unit: "mg/L" },
    { id: "tanque", label: "Hipoclorito en el tanque", type: "number", default: 80, unit: "%" },
  ],
  terminals: [{ id: "A1" }, { id: "A2" }],
  actions: [
    { id: "falla", label: "Bomba sin caudal (descebada)", kind: "toggle" },
    { id: "rellenar", label: "Rellenar el tanque", kind: "momentary" },
  ],
  electrical: () => ({ loads: [{ id: "coil", a: "A1", b: "A2", rating: "24VDC" }] }),
  reads: (p) => (p.agua ? [{ id: "q", source: String(p.agua) }] : []),
  create(ctx) {
    const p = ctx.params;
    const dose = Math.max(0, num(p.dosis, 300));
    const tau = Math.max(1, num(p.mezclaS, 30));
    const k = Math.max(0, num(p.demanda, 0.1)) / 60;
    let c = Math.max(0, num(p.cloro0, 0.8));
    let tank = Math.max(0, Math.min(100, num(p.tanque, 80)));
    /** @type {bigint | null} */
    let lastT = null;
    let st = { on: false, q: 0, fail: false };
    return {
      update(t, inp) {
        if (lastT !== null && t > lastT) {
          const sec = Number(t - lastT) / 1e9;
          const dosing = st.on && !st.fail && tank > 0;
          if (st.q > 0.5) {
            const target = dosing ? dose / st.q : 0;
            c = target + (c - target) * Math.exp(-sec / tau);
          } else c *= Math.exp(-k * sec);
          if (dosing) tank = Math.max(0, tank - sec * 0.02);
        }
        lastT = t;
        if (inp.actions.rellenar) tank = 100;
        st = { on: !!inp.loads.coil?.on, q: Math.max(0, num(inp.values.q, 0)), fail: !!inp.actions.falla };
        const dosing = st.on && !st.fail && tank > 0;
        return {
          outputs: { cloro: r2(c), dosificando: dosing, marcha: st.on, tanque: Math.round(tank * 10) / 10, sinCaudal: st.fail },
          nextEventNs: st.q > 0.5 || c > 0.005 ? t + TICK_NS : undefined,
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const chlorineRs485 = {
  type: "jwsim/chlorine-rs485",
  version: "1.0.0",
  name: "Analizador de cloro residual RS-485",
  category: "Sensores",
  description:
    "Analizador amperométrico de cloro libre (0-5 mg/L) con celda de flujo y salida RS-485 Modbus RTU, 24 VDC. De fábrica: dirección 4, 9600 bps, 8N1. Registro 0 = cloro × 100 (mg/L), registro 1 = pH × 100; funciones 03 y 04. Mide la cámara de contacto (Mide, p. ej. CL1.cloro) o se ajusta a mano. Sin muestra (celda seca): 32767.",
  parameters: [
    ...BUS_PARAMS.filter((q) => q.id !== "sonda").map((q) => (q.id === "address" ? { ...q, default: 4 } : q)),
    { id: "source", label: "Mide", type: "string", default: "", hint: "dispositivo.salida en mg/L, p. ej. CL1.cloro; vacío = simulado" },
    { id: "cloro", label: "Cloro (simulado)", type: "number", default: 1, unit: "mg/L" },
    { id: "ph", label: "pH del agua", type: "number", default: 7.2 },
  ],
  terminals: POWER_BUS,
  actions: [
    { id: "cloro", label: "Cloro (simulado)", kind: "value", min: 0, max: 5, unit: "mg/L" },
    { id: "falla", label: "Falla de la celda", kind: "select", options: [0, 1], labels: ["Normal", "Sin muestra"] },
  ],
  reads: (p) => (p.source ? [{ id: "c", source: String(p.source) }] : []),
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create(ctx) {
    let powered = false;
    /** @type {Record<number, number>} */
    let map = {};
    return {
      update(_t, inp) {
        const c = Math.max(0, Math.min(5, ctx.params.source ? num(inp.values.c, 0) : num(inp.actions.cloro ?? ctx.params.cloro, 1)));
        const dry = Number(inp.actions.falla ?? 0) === 1;
        powered = inp.loads.supply.on;
        const ph = num(ctx.params.ph, 7.2);
        map = { 0: int16(dry ? 32767 : c * 100), 1: int16(ph * 100) };
        return { outputs: { powered, cloro: dry ? null : r2(c), ph, celda: dry ? "seca" : "ok" } };
      },
      modbusRead(_table, start, count) {
        return powered ? regs(map, start, count) : undefined;
      },
    };
  },
};
