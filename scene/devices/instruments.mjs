// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Catálogo, tanda 2: instrumentos de campo y de panel. Interruptor de nivel
// tipo pera, electrodos y relé de nivel, presostato, termostato, voltímetro
// y amperímetro.
//
// Los que siguen una magnitud de la planta (el nivel de un tanque, la
// temperatura del fermentador) la leen con enlaces: la escena calcula el
// instante exacto en que cruza cada umbral. Sin fuente, la magnitud se
// arrastra en el símbolo (acción de tipo value).

import { Delay, earliest, ms } from "../device-kit.mjs";

const RATINGS = ["24VDC", "230VAC"];
const BIG = 1e9;
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");

// ------------------------------------------------------------------ flotador tipo pera
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const floatSwitch = {
  type: "jwsim/float-switch",
  version: "1.0.0",
  name: "Interruptor de nivel tipo pera",
  category: "Sensores",
  description:
    "Interruptor de nivel de flotador tipo pera con cable de 3 hilos: BK común, BN cierra con el flotador arriba (nivel alto) y BU con el flotador abajo. Sube cuando el nivel llega a «Sube en» y baja cuando cae a «Baja en» (en el equipo real, el largo de cable libre fija esa diferencia). Con Tanque (p. ej. T1.nivel) sigue al nivel; sin él, el flotador se sube y baja con un clic.",
  parameters: [
    { id: "source", label: "Tanque (nivel)", type: "string", default: "", hint: "dispositivo.salida de 0 a 1, p. ej. T1.nivel" },
    { id: "alto", label: "Sube en", type: "number", default: 80, unit: "%" },
    { id: "bajo", label: "Baja en", type: "number", default: 20, unit: "%" },
  ],
  terminals: [
    { id: "BK", label: "BK (común)" },
    { id: "BN", label: "BN (cierra arriba)" },
    { id: "BU", label: "BU (cierra abajo)" },
  ],
  actions: [{ id: "float", label: "Flotador arriba", kind: "toggle" }],
  links: (p) =>
    p.source
      ? [
          { id: "high", source: String(p.source), min: Number(p.alto) / 100, max: BIG },
          { id: "low", source: String(p.source), min: -BIG, max: Number(p.bajo) / 100 },
        ]
      : [],
  electrical: () => ({ contacts: { "BK-BN": ["BK", "BN"], "BK-BU": ["BK", "BU"] } }),
  create(ctx) {
    let up = false;
    return {
      update(_t, inp) {
        if (ctx.params.source) {
          if (inp.links.high) up = true;
          else if (inp.links.low) up = false;
        } else up = !!inp.actions.float;
        return { contacts: { "BK-BN": up, "BK-BU": !up }, outputs: { up } };
      },
    };
  },
};

// ------------------------------------------------------------------ electrodos y relé de nivel
/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const levelElectrodes = {
  type: "jwsim/level-electrodes",
  version: "1.0.0",
  name: "Electrodos de nivel",
  category: "Sensores",
  description:
    "Porta-electrodos de 3 varillas para el relé de nivel: E3 de referencia (la más larga, al fondo del tanque), E2 de nivel bajo y E1 de nivel alto. Se cablean uno a uno a E1, E2 y E3 del relé de nivel. Con Tanque (p. ej. T1.nivel) las varillas se mojan según el nivel; sin él, el nivel del agua se arrastra en el símbolo. Solo para líquidos conductores (agua, no aceite).",
  parameters: [
    { id: "source", label: "Tanque (nivel)", type: "string", default: "", hint: "dispositivo.salida de 0 a 1, p. ej. T1.nivel" },
    { id: "alto", label: "Altura de E1 (alto)", type: "number", default: 80, unit: "%" },
    { id: "bajo", label: "Altura de E2 (bajo)", type: "number", default: 20, unit: "%" },
    { id: "nivel", label: "Nivel (sin tanque)", type: "number", default: 50, unit: "%" },
  ],
  terminals: [
    { id: "E1", label: "E1 (alto)" },
    { id: "E2", label: "E2 (bajo)" },
    { id: "E3", label: "E3 (referencia)" },
  ],
  actions: [{ id: "nivel", label: "Nivel", kind: "value", min: 0, max: 100, unit: "%" }],
  links: (p) =>
    p.source
      ? [
          { id: "wet1", source: String(p.source), min: Number(p.alto) / 100, max: BIG },
          { id: "wet2", source: String(p.source), min: Number(p.bajo) / 100, max: BIG },
        ]
      : [],
  // El nivel numérico solo para dibujar el agua; las varillas siguen a los enlaces.
  reads: (p) => (p.source ? [{ id: "lvl", source: String(p.source) }] : []),
  probes: () => [{ id: "varillas", kind: "electrodos", terminals: ["E1", "E2", "E3"], output: "mojadas" }],
  create(ctx) {
    const p = ctx.params;
    return {
      update(_t, inp) {
        let wet1;
        let wet2;
        /** @type {Record<string, unknown>} */
        const extra = {};
        if (p.source) {
          wet1 = !!inp.links.wet1;
          wet2 = !!inp.links.wet2;
          const lvl = Number(inp.values.lvl);
          if (Number.isFinite(lvl)) extra.nivel = Math.round(Math.max(0, Math.min(1, lvl)) * 1000) / 10;
        } else {
          const nivel = Math.max(0, Math.min(100, Number(inp.actions.nivel ?? p.nivel) || 0));
          wet1 = nivel >= Number(p.alto);
          wet2 = nivel >= Number(p.bajo);
          extra.nivel = nivel;
        }
        // Varillas mojadas: 2 = hasta E1, 1 = hasta E2, 0 = ninguna.
        return { outputs: { mojadas: wet1 ? 2 : wet2 ? 1 : 0, wet1, wet2, ...extra } };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const levelRelay = {
  type: "jwsim/level-relay",
  version: "1.0.0",
  name: "Relé de nivel por electrodos",
  category: "Maniobra",
  description:
    "Relé de control de nivel para líquidos conductores (tipo Schneider RM4-LG01 / CHINT NJYW1): alimentación A1-A2, electrodos E1 (alto), E2 (bajo) y E3 (referencia) y un conmutado 11-12-14. Vaciado: cierra 11-14 cuando el líquido llega a E1 y abre cuando baja de E2 (bomba que vacía). Llenado: al revés, cierra 11-14 con el nivel bajo E2 y abre al llegar a E1 (bomba que llena). Un electrodo sin cablear se lee seco. LED U: alimentado; LED R: relé cerrado.",
  parameters: [
    { id: "coil", label: "Alimentación A1-A2", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "modo", label: "Función", type: "enum", options: ["llenado", "vaciado"], default: "llenado" },
    { id: "retardoMs", label: "Retardo", type: "number", default: 500, unit: "ms", hint: "evita el golpeteo con el oleaje" },
  ],
  terminals: [
    { id: "A1" }, { id: "A2" },
    { id: "E1", label: "E1 (alto)" }, { id: "E2", label: "E2 (bajo)" }, { id: "E3", label: "E3 (referencia)" },
    { id: "11", label: "11 (común)" }, { id: "12", label: "12 (NC)" }, { id: "14", label: "14 (NA)" },
  ],
  probeInputs: () => [{ id: "electrodos", kind: "electrodos", terminals: ["E1", "E2", "E3"] }],
  electrical: (p) => ({
    loads: [{ id: "supply", a: "A1", b: "A2", rating: String(p.coil) }],
    contacts: { "11-14": ["11", "14"], "11-12": ["11", "12"] },
  }),
  create(ctx) {
    const d = ms(Math.max(0, Number(ctx.params.retardoMs) || 0));
    const delay = new Delay(d, d);
    const vaciado = ctx.params.modo === "vaciado";
    let high = false; // el líquido llegó a E1 (y no bajó todavía de E2)
    return {
      update(t, inp) {
        const m = Number(inp.values.electrodos);
        const wet = Number.isFinite(m) ? m : 0;
        if (wet >= 2) high = true;
        else if (wet < 1) high = false;
        const powered = inp.loads.supply.on;
        const out = delay.step(t, powered && (vaciado ? high : !high)) && powered;
        return {
          contacts: { "11-14": out, "11-12": !out },
          outputs: { energized: powered, closed: out, nivel: wet >= 2 ? "alto" : wet >= 1 ? "medio" : "bajo" },
          nextEventNs: earliest(delay.next),
        };
      },
    };
  },
};

// ------------------------------------------------------------------ presostato y termostato
/**
 * Interruptor por umbral con diferencial (familia Danfoss KP): al subir hasta
 * Corte cierra 1-4 y abre 1-2; vuelve al bajar hasta Corte − Diferencial.
 * @param {{ type: string, name: string, description: string, q: string, label: string, unit: string, min: number, max: number, corte: number, dif: number, inicial: number, d: number }} o
 * @returns {import("../../sdk/jwsim-device.js").DeviceDefinition}
 */
function thresholdSwitch(o) {
  return {
    type: o.type,
    version: "1.0.0",
    name: o.name,
    category: "Sensores",
    description: o.description,
    parameters: [
      { id: "corte", label: "Corte (alto)", type: "number", default: o.corte, unit: o.unit },
      { id: "dif", label: "Diferencial", type: "number", default: o.dif, unit: o.unit },
      { id: "source", label: `${o.label} medida por`, type: "string", default: "", hint: "dispositivo.salida, p. ej. F1.tMasa (vacío: se arrastra en el símbolo)" },
      { id: o.q, label: `${o.label} (sin fuente)`, type: "number", default: o.inicial, unit: o.unit },
    ],
    terminals: [
      { id: "1", label: "1 (común)" },
      { id: "2", label: "2 (abre al subir)" },
      { id: "4", label: "4 (cierra al subir)" },
    ],
    actions: [{ id: o.q, label: o.label, kind: "value", min: o.min, max: o.max, unit: o.unit }],
    links: (p) =>
      p.source
        ? [
            { id: "high", source: String(p.source), min: Number(p.corte), max: BIG },
            { id: "low", source: String(p.source), min: -BIG, max: Number(p.corte) - Math.abs(Number(p.dif)) },
          ]
        : [],
    reads: (p) => (p.source ? [{ id: "pv", source: String(p.source) }] : []),
    electrical: () => ({ contacts: { "1-4": ["1", "4"], "1-2": ["1", "2"] } }),
    create(ctx) {
      const p = ctx.params;
      const corte = Number(p.corte);
      const low = corte - Math.abs(Number(p.dif));
      let on = false;
      return {
        update(_t, inp) {
          let pv;
          if (p.source) {
            if (inp.links.high) on = true;
            else if (inp.links.low) on = false;
            pv = Number(inp.values.pv);
          } else {
            pv = Math.max(o.min, Math.min(o.max, Number(inp.actions[o.q] ?? p[o.q]) || 0));
            if (pv >= corte) on = true;
            else if (pv <= low) on = false;
          }
          const ok = Number.isFinite(pv);
          return {
            contacts: { "1-4": on, "1-2": !on },
            outputs: {
              activado: on,
              ...(ok ? { [o.q]: Math.round(pv * 100) / 100 } : {}),
              texto: ok ? `${fmt(pv, o.d)} ${o.unit}` : "—",
              ajusteTxt: `${fmt(low, o.d)} – ${fmt(corte, o.d)} ${o.unit}`,
            },
          };
        },
      };
    },
  };
}

export const pressureSwitch = thresholdSwitch({
  type: "jwsim/pressure-switch",
  name: "Presostato",
  description:
    "Presostato de diferencial ajustable (tipo Danfoss KP35, -0,2 a 7,5 bar) con contacto conmutado: al subir la presión hasta Corte cierra 1-4 y abre 1-2; vuelve al bajar hasta Corte − Diferencial (p. ej. una bomba de agua que arranca a 3 bar por 1-2 y para a 4 bar). La presión se arrastra en el símbolo o se lee de otro dispositivo.",
  q: "presion",
  label: "Presión",
  unit: "bar",
  min: 0,
  max: 10,
  corte: 4,
  dif: 1,
  inicial: 0,
  d: 1,
});

export const thermostat = thresholdSwitch({
  type: "jwsim/thermostat",
  name: "Termostato",
  description:
    "Termostato de bulbo y capilar con diferencial ajustable (tipo Danfoss KP77, 20 a 60 °C) y contacto conmutado: al subir la temperatura hasta Corte cierra 1-4 (p. ej. un ventilador) y abre 1-2 (una resistencia); vuelve al bajar hasta Corte − Diferencial. La temperatura se arrastra en el símbolo o se lee de otro dispositivo (p. ej. F1.tMasa del fermentador).",
  q: "temperatura",
  label: "Temperatura",
  unit: "°C",
  min: 0,
  max: 120,
  corte: 40,
  dif: 3,
  inicial: 25,
  d: 1,
});

// ------------------------------------------------------------------ voltímetro y amperímetro
const VOLT_RANGES = { "60-500VAC": { kind: "AC", lo: 60, hi: 500 }, "6-100VDC": { kind: "DC", lo: 6, hi: 100 } };

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const voltmeter = {
  type: "jwsim/voltmeter",
  version: "1.0.0",
  name: "Voltímetro de panel",
  category: "Instrumentación",
  description:
    "Voltímetro digital de 22 mm tipo piloto (AD16-22FS, 60-500 VAC, o AD16-22DSV, 6-100 VDC) con display de 3 dígitos: mide la tensión entre 1 y 2 (en continua con signo). Fuera de rango o con el tipo de tensión equivocado muestra «---». No consume: se conecta en paralelo.",
  parameters: [{ id: "range", label: "Rango", type: "enum", options: Object.keys(VOLT_RANGES), default: "60-500VAC" }],
  terminals: [{ id: "1" }, { id: "2" }],
  electrical: () => ({ loads: [{ id: "meter", a: "1", b: "2", rating: "24VDC", meter: true }] }),
  create(ctx) {
    const r = VOLT_RANGES[String(ctx.params.range)] ?? VOLT_RANGES["60-500VAC"];
    return {
      update(_t, inp) {
        const st = inp.loads.meter;
        const volts = st?.on ? st.volts * (r.kind === "DC" ? st.polarity || 1 : 1) : 0;
        const wrongKind = st?.on && st.kind !== r.kind;
        const over = Math.abs(volts) > r.hi;
        const lcd = wrongKind || over ? "---" : r.kind === "DC" ? fmt(volts, Math.abs(volts) < 100 ? 1 : 0) : String(Math.round(volts));
        return { outputs: { volts: wrongKind ? 0 : volts, lcd, texto: lcd === "---" ? "---" : `${lcd} V`, on: !!st?.on } };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const ammeter = {
  type: "jwsim/ammeter",
  version: "1.0.0",
  name: "Amperímetro de panel",
  category: "Instrumentación",
  description:
    "Amperímetro digital de 22 mm tipo piloto con transformador de corriente incorporado (AD16-22FSA, 0-100 A): el conductor de la carga pasa por su agujero; en la escena se cablea en serie entre 1 y 2. Muestra la corriente de las cargas que la informan (motores, variador).",
  parameters: [],
  terminals: [{ id: "1", label: "1 (entra)" }, { id: "2", label: "2 (sale)" }],
  electrical: () => ({ contacts: { "1-2": ["1", "2"] } }),
  currentSensors: () => [{ id: "i", terminals: ["2"] }],
  create: () => ({
    update(_t, inp) {
      const amps = Object.values(inp.currents?.i ?? {}).map(Number);
      const I = amps.length ? Math.max(...amps) : 0;
      const lcd = I > 100 ? "---" : fmt(I, I < 10 ? 1 : 0);
      return { contacts: { "1-2": true }, outputs: { amps: Math.round(I * 100) / 100, lcd, texto: lcd === "---" ? "---" : `${lcd} A` } };
    },
  }),
};
