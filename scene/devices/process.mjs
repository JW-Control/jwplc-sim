// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Emulación de planta (G9): transmisores Modbus RTU en el bus RS-485 de la
// placa y el tanque fermentador como dispositivo de proceso.
//
// Transmisores: alimentación 24 VDC (+/-) y bus RS-485 (A/B, cableados a
// plc.RS485_A/B). Responden a las funciones 03 y 04 con la misma tabla. El
// valor sigue la salida de otro dispositivo (parámetro source, p. ej.
// FER1.tMasa) o se ajusta a mano con su acción. La sonda puede fallar
// (acción probe): abierta = 32767 (7FFFh), en corto = -32768 (8000h), como
// los transmisores que marcan fuera de escala.

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
];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const pt100Rs485 = {
  type: "jwsim/pt100-rs485",
  version: "1.0.0",
  name: "Transmisor PT100 RS-485",
  category: "Sensores",
  description:
    "Transmisor de temperatura PT100 con salida RS-485 Modbus RTU, 24 VDC. Registro 0 = temperatura × 10 (°C, entero con signo), funciones 03 y 04. Sigue a la salida de otro dispositivo (p. ej. FER1.tMasa) o se ajusta a mano.",
  parameters: [
    ...BUS_PARAMS,
    { id: "source", label: "Mide", type: "string", default: "", hint: "dispositivo.salida, p. ej. FER1.tMasa" },
    { id: "temp", label: "Temperatura (sin Mide)", type: "number", default: 25, unit: "°C" },
  ],
  terminals: [{ id: "+", label: "+24 V" }, { id: "-", label: "0 V" }, { id: "A", label: "RS-485 A" }, { id: "B", label: "RS-485 B" }],
  actions: [
    { id: "temp", label: "Temperatura", kind: "value", min: -50, max: 200, unit: "°C" },
    { id: "probe", label: "Sonda", kind: "select", ...PROBE },
  ],
  reads: (p) => (p.source ? [{ id: "temp", source: String(p.source) }] : []),
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create(ctx) {
    let powered = false;
    let raw = 0;
    return {
      update(_t, inp) {
        const v = inp.values?.temp ?? Number(inp.actions.temp ?? ctx.params.temp);
        const probe = Number(inp.actions.probe ?? 0);
        powered = inp.loads.supply.on;
        raw = probe === 1 ? 32767 : probe === 2 ? -32768 : Math.round(v * 10);
        return { outputs: { powered, temp: Math.round(v * 10) / 10, raw } };
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
  version: "1.0.0",
  name: "Transmisor de pH RS-485",
  category: "Sensores",
  description:
    "Transmisor de pH con sensor de temperatura incorporado, salida RS-485 Modbus RTU, 24 VDC. Registro 0 = pH × 100; registro 1 = temperatura × 10 (°C, con signo). Funciones 03 y 04.",
  parameters: [
    ...BUS_PARAMS.map((p) => (p.id === "address" ? { ...p, default: 2 } : p)),
    { id: "sourcePh", label: "pH de", type: "string", default: "", hint: "p. ej. FER1.ph" },
    { id: "sourceTemp", label: "Temperatura de", type: "string", default: "", hint: "p. ej. FER1.tMosto" },
    { id: "ph", label: "pH (sin fuente)", type: "number", default: 7 },
    { id: "temp", label: "Temperatura (sin fuente)", type: "number", default: 25, unit: "°C" },
  ],
  terminals: [{ id: "+", label: "+24 V" }, { id: "-", label: "0 V" }, { id: "A", label: "RS-485 A" }, { id: "B", label: "RS-485 B" }],
  actions: [
    { id: "ph", label: "pH", kind: "value", min: 0, max: 14 },
    { id: "temp", label: "Temperatura", kind: "value", min: -20, max: 100, unit: "°C" },
    { id: "probe", label: "Sonda", kind: "select", ...PROBE },
  ],
  reads: (p) => [
    ...(p.sourcePh ? [{ id: "ph", source: String(p.sourcePh) }] : []),
    ...(p.sourceTemp ? [{ id: "temp", source: String(p.sourceTemp) }] : []),
  ],
  modbus: (p) => ({ address: Number(p.address), baud: Number(p.baud), responseMs: Number(p.responseMs) }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create(ctx) {
    let powered = false;
    /** @type {Record<number, number>} */
    let map = {};
    return {
      update(_t, inp) {
        const ph = inp.values?.ph ?? Number(inp.actions.ph ?? ctx.params.ph);
        const temp = inp.values?.temp ?? Number(inp.actions.temp ?? ctx.params.temp);
        const probe = Number(inp.actions.probe ?? 0);
        powered = inp.loads.supply.on;
        map = probe ? { 0: int16(probe === 1 ? 32767 : -32768), 1: int16(temp * 10) } : { 0: int16(ph * 100), 1: int16(temp * 10) };
        return { outputs: { powered, ph: Math.round(ph * 100) / 100, temp: Math.round(temp * 10) / 10 } };
      },
      modbusRead(_table, start, count) {
        return powered ? regs(map, start, count) : undefined;
      },
    };
  },
};

// ---------------------------------------------------------------- fermentador
// Tanque fermentador de café (biorreactor) con serpentín de agua caliente.
//
//  - Agua caliente: terma solar de 80 L (temperatura con el ciclo del sol y
//    lo que se le saca) o fija.
//  - Serpentín: se llena con la válvula de agua caliente abierta y se vacía
//    con la bomba de retorno con la válvula cerrada. Hay flujo con la válvula
//    abierta y la bomba en marcha (contacto FS1-FS2, como un flujostato). La
//    bomba con el serpentín vacío trabaja en seco.
//  - Masa: se calienta con el serpentín y pierde calor hacia el ambiente. El
//    mosto (sonda de pH) sigue a la masa; más rápido con la recirculación.
//  - pH: baja con la fermentación hacia un mínimo, más rápido cerca de 30 °C.
//
// Las válvulas y bombas son otros dispositivos de la escena (electroválvula,
// motores): el fermentador lee su estado (parámetros valvula, bombaRetorno,
// bombaMosto). Tiempo real: una fermentación lleva horas virtuales; para
// probar más rápido se acorta horasFermentacion o se sube kCalef.

const STEP = 1000n * MS;   // integración cada 1 s virtual

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const fermenter = {
  type: "jwsim/fermentador",
  version: "1.0.0",
  name: "Tanque fermentador",
  category: "Proceso",
  description:
    "Fermentador de café con serpentín de agua caliente (terma solar), bomba de retorno y recirculación de mosto. Salidas: tMasa, tMosto, ph, tTerma, serpentin (llenado 0..1), flujo, bombaEnSeco. Contacto FS1-FS2 cerrado con flujo en el serpentín.",
  parameters: [
    { id: "valvula", label: "Válvula de agua caliente", type: "string", default: "Y1.open", hint: "dispositivo.salida" },
    { id: "bombaRetorno", label: "Bomba de retorno", type: "string", default: "M1.running" },
    { id: "bombaMosto", label: "Bomba de mosto", type: "string", default: "M2.running" },
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
  terminals: [{ id: "FS1", label: "Flujostato" }, { id: "FS2", label: "Flujostato" }],
  reads: (p) =>
    [
      { id: "valvula", source: String(p.valvula ?? "") },
      { id: "bombaRetorno", source: String(p.bombaRetorno ?? "") },
      { id: "bombaMosto", source: String(p.bombaMosto ?? "") },
    ].filter((r) => r.source),
  electrical: () => ({ contacts: { FS: ["FS1", "FS2"] } }),
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
      inp: { valve: false, ret: false, mosto: false },
    };
    const phMin = Number(p.phMinimo);
    const r0 = Math.log(Math.max(0.051, Number(p.phInicial) - phMin) / 0.05) / Math.max(0.01, Number(p.horasFermentacion));
    const g = (T) => Math.exp(-(((T - 30) / 8) ** 2)) / Math.exp(-(((27 - 30) / 8) ** 2));

    // Avanza el modelo dt segundos con las entradas del tramo anterior.
    function integrate(dt) {
      const { valve, ret, mosto } = st.inp;
      const m = dt / 60;
      const tAmb = Number(p.tAmbiente);
      // Serpentín: se llena con la válvula; se vacía con la bomba y la válvula cerrada.
      if (valve) st.fill = Math.min(1, st.fill + dt / Math.max(0.1, Number(p.llenadoS)));
      else if (ret) st.fill = Math.max(0, st.fill - dt / Math.max(0.1, Number(p.vaciadoS)));
      const flowing = valve && ret && st.tTerma > tAmb;
      // Agua en el serpentín: la de la terma con la válvula abierta; si no, se enfría hacia la masa.
      if (valve) st.tCoil = st.tTerma;
      else st.tCoil += (st.tMasa - st.tCoil) * (1 - Math.exp(-m / 2));
      // Masa: serpentín + pérdidas.
      const heat = Number(p.kCalef) * st.fill * (st.tCoil - st.tMasa);
      st.tMasa += (heat + Number(p.kPerdida) * (tAmb - st.tMasa)) * m;
      // Mosto: sigue a la masa (30 min; 10 con recirculación).
      st.tMosto += (st.tMasa - st.tMosto) * (1 - Math.exp(-m / (mosto ? 10 : 30)));
      // Terma solar: sol de 6 a 18 h, pérdidas propias y lo que entrega al serpentín.
      if (p.terma === "solar") {
        const h = (Number(p.horaInicio) + st.horas) % 24;
        const sun = h > 6 && h < 18 ? Math.sin((Math.PI * (h - 6)) / 12) : 0;
        const kL = 0.004;
        st.tTerma += (kL * (Number(p.tTermaMax) - tAmb) * sun - kL * (st.tTerma - tAmb) - (valve ? 0.003 * (st.tTerma - st.tMasa) : 0)) * m;
      } else st.tTerma = Number(p.tTerma);
      // pH: primer orden hacia el mínimo, según la temperatura de la masa.
      st.ph = phMin + (st.ph - phMin) * Math.exp(-r0 * g(st.tMasa) * (dt / 3600));
      // Bomba en seco: en marcha con el serpentín vacío y la válvula cerrada.
      st.dry = ret && !valve && st.fill <= 0 ? st.dry + dt : 0;
      st.horas += dt / 3600;
      return flowing;
    }

    let flowing = false;
    return {
      update(t, inp) {
        if (t > st.t) {
          // Pasos de 1 s como máximo (estable con estas constantes).
          let rest = Number(t - st.t) / 1e9;
          while (rest > 1e-9) {
            const dt = Math.min(1, rest);
            flowing = integrate(dt);
            rest -= dt;
          }
          st.t = t;
        }
        st.inp = { valve: !!inp.values?.valvula, ret: !!inp.values?.bombaRetorno, mosto: !!inp.values?.bombaMosto };
        flowing = st.inp.valve && st.inp.ret && st.tTerma > Number(p.tAmbiente);
        // Magnitudes continuas como segmentos (valor constante hasta el
        // próximo paso): se leen y se ven, pero no llenan el registro de
        // eventos de la escena cada segundo.
        const a = (x, d = 10) => ({ value: Math.round(x * d) / d, rate: 0 });
        return {
          contacts: { FS: flowing },
          outputs: {
            tMasa: a(st.tMasa),
            tMosto: a(st.tMosto),
            ph: a(st.ph, 100),
            tTerma: a(st.tTerma),
            serpentin: a(st.fill, 100),
            flujo: flowing,
            bombaEnSeco: st.dry >= Number(p.secoS),
            horas: a(st.horas, 1000),
          },
          nextEventNs: t + STEP - (t % STEP),
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
