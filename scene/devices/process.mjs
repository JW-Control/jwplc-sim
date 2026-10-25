// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Emulación de planta (G9): transmisores Modbus RTU en el bus RS-485 de la
// placa y el tanque fermentador como dispositivo de proceso.
//
// Transmisores: alimentación 24 VDC (+/-), bus RS-485 (A/B, cableados a
// plc.RS485_A/B) y bornes de sonda. Con sonda "cableada" miden la sonda de
// otro dispositivo cableada a esos bornes (la PT100 o el electrodo de pH de
// un tanque): si falta o se corta un cable, la ven abierta. Con sonda
// "simulada" el valor se ajusta a mano. Responden a las funciones 03 y 04 con
// la misma tabla. Sonda abierta = 32767 (7FFFh), en corto = -32768 (8000h),
// como los transmisores que marcan fuera de escala; la acción probe fuerza
// esas fallas.

import { MS } from "../device-kit.mjs";

const BAUDS = ["9600", "19200", "38400", "57600", "115200"];
const PROBE = { options: [0, 1, 2], labels: ["Normal", "Sonda abierta", "Sonda en corto"] };
const int16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff;

/**
 * Tabla de registros a partir de un mapa dirección → valor.
 * @param {Record<number, number>} map
 * @param {number} start @param {number} count
 */
function regs(map, start, count) {
  const out = [];
  for (let a = start; a < start + count; a++) {
    if (!(a in map)) return null;
    out.push(map[a]);
  }
  return out;
}

/** @type {import("../../sdk/jwsim-device.js").ParameterSpec[]} */
const BUS_PARAMS = [
  { id: "address", label: "Dirección Modbus", type: "number", default: 1, hint: "1 a 247" },
  { id: "baud", label: "Velocidad", type: "enum", options: BAUDS, default: "9600", hint: "8N1" },
  { id: "responseMs", label: "Demora de respuesta", type: "number", default: 5, unit: "ms" },
  { id: "sonda", label: "Sonda", type: "enum", options: ["cableada", "simulada"], default: "cableada", hint: "cableada: la de otro dispositivo, por sus bornes" },
];
const POWER_BUS = [{ id: "+", label: "+24 V" }, { id: "-", label: "0 V" }, { id: "A", label: "RS-485 A" }, { id: "B", label: "RS-485 B" }];

/** Valor medido: el de la sonda cableada o el ajustado a mano; null si la sonda está abierta. */
function measured(params, inp, id) {
  const v = params.sonda === "simulada" ? Number(inp.actions[id] ?? params[id]) : inp.values?.[id];
  return v === undefined || Number.isNaN(v) ? null : v;
}

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const pt100Rs485 = {
  type: "jwsim/pt100-rs485",
  version: "2.0.0",
  name: "Transmisor PT100 RS-485",
  category: "Sensores",
  description:
    "Transmisor de temperatura para PT100 de 3 hilos (R1, R2 rojos; R3 blanco) con salida RS-485 Modbus RTU, 24 VDC. Registro 0 = temperatura × 10 (°C, entero con signo), funciones 03 y 04. Sonda abierta: 32767.",
  parameters: [...BUS_PARAMS, { id: "temp", label: "Temperatura (simulada)", type: "number", default: 25, unit: "°C" }],
  terminals: [...POWER_BUS, { id: "R1", label: "PT100 rojo" }, { id: "R2", label: "PT100 rojo" }, { id: "R3", label: "PT100 blanco" }],
  actions: [
    { id: "temp", label: "Temperatura (simulada)", kind: "value", min: -50, max: 200, unit: "°C" },
    { id: "probe", label: "Falla de sonda", kind: "select", ...PROBE },
  ],
  probeInputs: (p) => (p.sonda === "cableada" ? [{ id: "temp", kind: "pt100", terminals: ["R1", "R2", "R3"] }] : []),
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create(ctx) {
    let powered = false;
    let raw = 0;
    return {
      update(_t, inp) {
        const v = measured(ctx.params, inp, "temp");
        const probe = v === null ? 1 : Number(inp.actions.probe ?? 0);
        powered = inp.loads.supply.on;
        raw = probe === 1 ? 32767 : probe === 2 ? -32768 : Math.round(Number(v) * 10);
        return { outputs: { powered, temp: probe ? null : Math.round(Number(v) * 10) / 10, sonda: ["ok", "abierta", "corto"][probe], raw } };
      },
      modbusRead(_table, start, count) {
        return powered ? regs({ 0: int16(raw) }, start, count) : undefined;
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const phRs485 = {
  type: "jwsim/ph-rs485",
  version: "2.0.0",
  name: "Transmisor de pH RS-485",
  category: "Sensores",
  description:
    "Transmisor de pH con compensación de temperatura (ATC), salida RS-485 Modbus RTU, 24 VDC. Electrodo en PH (BNC) y REF; sensor de temperatura en T1-T2. Registro 0 = pH × 100; registro 1 = temperatura × 10 (°C, con signo). Funciones 03 y 04. Sonda abierta: 32767.",
  parameters: [
    ...BUS_PARAMS.map((p) => (p.id === "address" ? { ...p, default: 2 } : p)),
    { id: "ph", label: "pH (simulado)", type: "number", default: 7 },
    { id: "temp", label: "Temperatura (simulada)", type: "number", default: 25, unit: "°C" },
  ],
  terminals: [...POWER_BUS, { id: "PH", label: "Electrodo (BNC)" }, { id: "REF", label: "Referencia" }, { id: "T1", label: "ATC" }, { id: "T2", label: "ATC" }],
  actions: [
    { id: "ph", label: "pH (simulado)", kind: "value", min: 0, max: 14 },
    { id: "temp", label: "Temperatura (simulada)", kind: "value", min: -20, max: 100, unit: "°C" },
    { id: "probe", label: "Falla del electrodo", kind: "select", ...PROBE },
  ],
  probeInputs: (p) =>
    p.sonda === "cableada"
      ? [
          { id: "ph", kind: "ph", terminals: ["PH", "REF"] },
          { id: "temp", kind: "atc", terminals: ["T1", "T2"] },
        ]
      : [],
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create(ctx) {
    let powered = false;
    /** @type {Record<number, number>} */
    let map = {};
    return {
      update(_t, inp) {
        const ph = measured(ctx.params, inp, "ph");
        const temp = measured(ctx.params, inp, "temp");
        const probe = ph === null ? 1 : Number(inp.actions.probe ?? 0);
        powered = inp.loads.supply.on;
        const r0 = probe === 1 ? 32767 : probe === 2 ? -32768 : int16(Number(ph) * 100);
        map = { 0: int16(r0), 1: temp === null ? 32767 : int16(temp * 10) };
        return {
          outputs: {
            powered,
            ph: probe ? null : Math.round(Number(ph) * 100) / 100,
            temp: temp === null ? null : Math.round(temp * 10) / 10,
            sonda: ["ok", "abierta", "corto"][probe],
          },
        };
      },
      modbusRead(_table, start, count) {
        return powered ? regs(map, start, count) : undefined;
      },
    };
  },
};

// ---------------------------------------------------------------- fermentador
// Bloque de planta: tanque fermentador de café (biorreactor) con todo lo que
// trae de fábrica y sin cablear al tablero. El bloque tiene su lógica interna;
// el tablero (PLC, relés, transmisores) se cablea a sus bornes.
//
//  - Y1, electroválvula de agua caliente (bobina Y1_A1-Y1_A2, NC o NA).
//  - M1, bomba de retorno del agua a la terma; M2, bomba de recirculación de
//    mosto (bobinados M1_U1-M1_U2 y M2_U1-M2_U2).
//  - FS1, flujostato en la línea de agua (contacto FS_C-FS_NO, cierra con flujo).
//  - Sonda PT100 de 3 hilos en la masa (TT_R1, TT_R2 rojos; TT_R3 blanco) y
//    electrodo de pH con sensor de temperatura en el mosto (AT_PH, AT_REF;
//    ATC en AT_T1-AT_T2): las leen los transmisores cableados a esos bornes.
//
// Proceso:
//  - Agua caliente: terma solar de 80 L (temperatura con el ciclo del sol y
//    lo que se le saca) o fija.
//  - Serpentín: se llena con la válvula abierta y se vacía bombeando con la
//    válvula cerrada. Hay flujo con la válvula abierta y M1 bombeando. M1 en
//    marcha con el serpentín vacío trabaja en seco.
//  - Masa: se calienta con el serpentín y pierde calor hacia el ambiente. El
//    mosto sigue a la masa; más rápido con la recirculación.
//  - pH: baja con la fermentación hacia un mínimo, más rápido cerca de 30 °C.
//
// Fallas del bloque (acciones): válvula trabada, bomba que no bombea y cielo
// nublado (la terma solar casi no calienta). Tiempo real: una fermentación
// lleva horas virtuales; para probar más rápido se acorta horasFermentacion o
// se sube kCalef.

const STEP = 1000n * MS;   // integración cada 1 s virtual

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const fermenter = {
  type: "jwsim/fermentador",
  version: "2.0.0",
  name: "Tanque fermentador",
  category: "Proceso",
  description:
    "Bloque de planta: fermentador de café con serpentín de agua caliente (terma solar), electroválvula Y1, bomba de retorno M1, bomba de mosto M2, flujostato FS1, sonda PT100 de masa y electrodo de pH con temperatura de mosto. Se cablea al tablero por sus bornes. Salidas: tMasa, tMosto, ph, tTerma, serpentin (llenado 0..1), valvula, bombaRetorno, bombaMosto, flujo, bombaEnSeco.",
  parameters: [
    { id: "valvulaBobina", label: "Y1: bobina", type: "enum", options: ["24VDC", "230VAC"], default: "24VDC" },
    { id: "valvulaTipo", label: "Y1: sin tensión", type: "enum", options: ["NC", "NA"], default: "NC" },
    { id: "valvulaMs", label: "Y1: apertura", type: "number", default: 50, unit: "ms" },
    { id: "retornoV", label: "M1: alimentación", type: "enum", options: ["230VAC", "24VDC"], default: "230VAC" },
    { id: "mostoV", label: "M2: alimentación", type: "enum", options: ["230VAC", "24VDC"], default: "230VAC" },
    { id: "tAmbiente", label: "Temperatura ambiente", type: "number", default: 20, unit: "°C" },
    { id: "tInicial", label: "Temperatura inicial de la masa", type: "number", default: 20, unit: "°C" },
    { id: "terma", label: "Agua caliente", type: "enum", options: ["solar", "fija"], default: "solar" },
    { id: "tTerma", label: "Terma: inicial / fija", type: "number", default: 70, unit: "°C" },
    { id: "tTermaMax", label: "Terma: máxima al mediodía", type: "number", default: 80, unit: "°C" },
    { id: "horaInicio", label: "Hora de inicio", type: "number", default: 8, unit: "h", hint: "para el ciclo del sol" },
    { id: "phInicial", label: "pH inicial", type: "number", default: 5.2 },
    { id: "phMinimo", label: "pH al que tiende", type: "number", default: 3.4 },
    { id: "horasFermentacion", label: "Fermentación a 27 °C", type: "number", default: 36, unit: "h", hint: "hasta 0,05 del mínimo" },
    { id: "kCalef", label: "Calefacción", type: "number", default: 0.0025, unit: "1/min", hint: "por °C de diferencia" },
    { id: "kPerdida", label: "Pérdidas al ambiente", type: "number", default: 0.002, unit: "1/min" },
    { id: "llenadoS", label: "Llenado del serpentín", type: "number", default: 10, unit: "s" },
    { id: "vaciadoS", label: "Vaciado del serpentín", type: "number", default: 20, unit: "s" },
    { id: "secoS", label: "Bomba en seco tras", type: "number", default: 30, unit: "s" },
  ],
  terminals: [
    { id: "Y1_A1", label: "Y1 válvula A1" },
    { id: "Y1_A2", label: "Y1 válvula A2" },
    { id: "M1_U1", label: "M1 bomba retorno U1" },
    { id: "M1_U2", label: "M1 bomba retorno U2" },
    { id: "M2_U1", label: "M2 bomba mosto U1" },
    { id: "M2_U2", label: "M2 bomba mosto U2" },
    { id: "FS_C", label: "FS1 flujostato C" },
    { id: "FS_NO", label: "FS1 flujostato NA" },
    { id: "TT_R1", label: "PT100 masa rojo" },
    { id: "TT_R2", label: "PT100 masa rojo" },
    { id: "TT_R3", label: "PT100 masa blanco" },
    { id: "AT_PH", label: "Electrodo pH (BNC)" },
    { id: "AT_REF", label: "Electrodo pH referencia" },
    { id: "AT_T1", label: "Temperatura mosto (ATC)" },
    { id: "AT_T2", label: "Temperatura mosto (ATC)" },
  ],
  actions: [
    { id: "valvulaFalla", label: "Y1", kind: "select", options: [0, 1, 2], labels: ["Normal", "Trabada cerrada", "Trabada abierta"] },
    { id: "retornoFalla", label: "M1", kind: "select", options: [0, 1], labels: ["Normal", "No bombea"] },
    { id: "clima", label: "Cielo", kind: "select", options: [0, 1], labels: ["Despejado", "Nublado"] },
  ],
  electrical: (p) => ({
    loads: [
      { id: "valvula", a: "Y1_A1", b: "Y1_A2", rating: String(p.valvulaBobina), coil: true },
      { id: "bombaRetorno", a: "M1_U1", b: "M1_U2", rating: String(p.retornoV) },
      { id: "bombaMosto", a: "M2_U1", b: "M2_U2", rating: String(p.mostoV) },
    ],
    contacts: { FS: ["FS_C", "FS_NO"] },
  }),
  probes: () => [
    { id: "masa", kind: "pt100", terminals: ["TT_R1", "TT_R2", "TT_R3"], output: "tMasa" },
    { id: "ph", kind: "ph", terminals: ["AT_PH", "AT_REF"], output: "ph" },
    { id: "mosto", kind: "atc", terminals: ["AT_T1", "AT_T2"], output: "tMosto" },
  ],
  create(ctx) {
    const p = ctx.params;
    const st = {
      t: 0n,
      tMasa: Number(p.tInicial),
      tMosto: Number(p.tInicial),
      ph: Number(p.phInicial),
      tTerma: Number(p.tTerma),
      fill: 0,
      tCoil: Number(p.tInicial),
      dry: 0,           // s con la bomba en seco
      horas: 0,
      // Entradas del tramo: válvula abierta, M1 bombeando, M1 en marcha, M2 en marcha, nublado.
      inp: { valve: false, ret: false, retRun: false, mosto: false, cloudy: false },
    };
    const phMin = Number(p.phMinimo);
    const r0 = Math.log(Math.max(0.051, Number(p.phInicial) - phMin) / 0.05) / Math.max(0.01, Number(p.horasFermentacion));
    const g = (T) => Math.exp(-(((T - 30) / 8) ** 2)) / Math.exp(-(((27 - 30) / 8) ** 2));
    const valveDelay = BigInt(Math.round(Number(p.valvulaMs) * 1e6));
    let valveOpen = p.valvulaTipo === "NA";
    let valveTarget = valveOpen;
    /** @type {bigint | null} */
    let valveAt = null;

    // Avanza el modelo dt segundos con las entradas del tramo anterior.
    function integrate(dt) {
      const { valve, ret, retRun, mosto, cloudy } = st.inp;
      const m = dt / 60;
      const tAmb = Number(p.tAmbiente);
      // Serpentín: se llena con la válvula; se vacía bombeando con la válvula cerrada.
      if (valve) st.fill = Math.min(1, st.fill + dt / Math.max(0.1, Number(p.llenadoS)));
      else if (ret) st.fill = Math.max(0, st.fill - dt / Math.max(0.1, Number(p.vaciadoS)));
      // Agua en el serpentín: la de la terma con la válvula abierta; si no, se enfría hacia la masa.
      if (valve) st.tCoil = st.tTerma;
      else st.tCoil += (st.tMasa - st.tCoil) * (1 - Math.exp(-m / 2));
      // Masa: serpentín + pérdidas.
      const heat = Number(p.kCalef) * st.fill * (st.tCoil - st.tMasa);
      st.tMasa += (heat + Number(p.kPerdida) * (tAmb - st.tMasa)) * m;
      // Mosto: sigue a la masa (30 min; 10 con recirculación).
      st.tMosto += (st.tMasa - st.tMosto) * (1 - Math.exp(-m / (mosto ? 10 : 30)));
      // Terma solar: sol de 6 a 18 h (20 % si está nublado), pérdidas propias y lo que entrega al serpentín.
      if (p.terma === "solar") {
        const h = (Number(p.horaInicio) + st.horas) % 24;
        const sun = (h > 6 && h < 18 ? Math.sin((Math.PI * (h - 6)) / 12) : 0) * (cloudy ? 0.2 : 1);
        const kL = 0.004;
        st.tTerma += (kL * (Number(p.tTermaMax) - tAmb) * sun - kL * (st.tTerma - tAmb) - (valve ? 0.003 * (st.tTerma - st.tMasa) : 0)) * m;
      } else st.tTerma = Number(p.tTerma);
      // pH: primer orden hacia el mínimo, según la temperatura de la masa.
      st.ph = phMin + (st.ph - phMin) * Math.exp(-r0 * g(st.tMasa) * (dt / 3600));
      // Bomba en seco: en marcha sin agua que mover (serpentín vacío con la válvula cerrada, o sin bombear).
      st.dry = retRun && ((!valve && st.fill <= 0) || !ret) ? st.dry + dt : 0;
      st.horas += dt / 3600;
    }

    return {
      update(t, inp) {
        if (t > st.t) {
          // Pasos de 1 s como máximo (estable con estas constantes).
          let rest = Number(t - st.t) / 1e9;
          while (rest > 1e-9) {
            const dt = Math.min(1, rest);
            integrate(dt);
            rest -= dt;
          }
          st.t = t;
        }
        // Electroválvula: la bobina cambia el estado tras la demora de apertura.
        const coil = !!inp.loads.valvula?.on;
        const want = (p.valvulaTipo === "NA") !== coil;
        if (want !== valveTarget) {
          valveTarget = want;
          valveAt = want === valveOpen ? null : t + valveDelay;
        }
        if (valveAt !== null && t >= valveAt) {
          valveOpen = valveTarget;
          valveAt = null;
        }
        const falla = Number(inp.actions.valvulaFalla ?? 0);
        const valve = falla === 1 ? false : falla === 2 ? true : valveOpen;
        const retRun = !!inp.loads.bombaRetorno?.on;
        const ret = retRun && Number(inp.actions.retornoFalla ?? 0) !== 1;
        const mosto = !!inp.loads.bombaMosto?.on;
        st.inp = { valve, ret, retRun, mosto, cloudy: Number(inp.actions.clima ?? 0) === 1 };
        const flowing = valve && ret && st.tTerma > Number(p.tAmbiente);
        // Magnitudes continuas como segmentos (valor constante hasta el
        // próximo paso): se leen y se ven, pero no llenan el registro de
        // eventos de la escena cada segundo.
        const a = (x, d = 10) => ({ value: Math.round(x * d) / d, rate: 0 });
        const step = t + STEP - (t % STEP);
        return {
          contacts: { FS: flowing },
          outputs: {
            tMasa: a(st.tMasa),
            tMosto: a(st.tMosto),
            ph: a(st.ph, 100),
            tTerma: a(st.tTerma),
            serpentin: a(st.fill, 100),
            valvula: valve,
            bombaRetorno: retRun,
            bombaMosto: mosto,
            flujo: flowing,
            bombaEnSeco: st.dry >= Number(p.secoS),
            horas: a(st.horas, 1000),
          },
          nextEventNs: valveAt !== null && valveAt < step ? valveAt : step,
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const waterValve = {
  type: "jwsim/water-valve",
  version: "1.0.0",
  name: "Electroválvula de agua 2/2",
  category: "Actuadores",
  description: "Electroválvula 2/2 para agua, normalmente cerrada (NC) o abierta (NA). Bobina A1-A2. Salidas: energized, open.",
  parameters: [
    { id: "coil", label: "Bobina", type: "enum", options: ["24VDC", "230VAC"], default: "24VDC" },
    { id: "normal", label: "Sin tensión", type: "enum", options: ["NC", "NA"], default: "NC" },
    { id: "openMs", label: "Apertura", type: "number", default: 50, unit: "ms" },
  ],
  terminals: [{ id: "A1" }, { id: "A2" }],
  electrical: (p) => ({ loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.coil), coil: true }] }),
  create(ctx) {
    const d = BigInt(Math.round(Number(ctx.params.openMs) * 1e6));
    let target = false;
    let at = null;
    let open = ctx.params.normal === "NA";
    return {
      update(t, inp) {
        const on = inp.loads.coil.on;
        const want = (ctx.params.normal === "NA") !== on;
        if (want !== target) {
          target = want;
          at = want === open ? null : t + d;
        }
        if (at !== null && t >= at) {
          open = target;
          at = null;
        }
        return { outputs: { energized: on, open }, nextEventNs: at ?? undefined };
      },
    };
  },
};
