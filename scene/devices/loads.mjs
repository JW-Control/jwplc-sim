// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Cargas: lámpara piloto, zumbador, relé, contactor, electroválvula con
// cilindro y motor. Bornes según IEC 61810/60947-4-1 (A1-A2 bobina, 1-2/3-4/
// 5-6 polos principales, 13-14 NA y 21-22 NC auxiliares).

import { Delay, Ramp, earliest, ms } from "../device-kit.mjs";

const RATINGS = ["24VDC", "230VAC"];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const lamp = {
  type: "jwsim/lamp",
  version: "1.0.0",
  name: "Lámpara piloto",
  category: "Señalización",
  description: "Piloto luminoso de 22 mm (X1-X2): metálico XB2 o monobloque AD16. Se enciende con su tensión nominal; con más tensión se quema.",
  parameters: [
    { id: "model", label: "Modelo", type: "enum", options: ["XB2", "AD16"], default: "XB2" },
    { id: "rating", label: "Tensión", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "color", label: "Color", type: "enum", options: ["verde", "rojo", "amarillo", "azul", "blanco"], default: "verde" },
    { id: "label", label: "Rótulo", type: "string", default: "" },
  ],
  terminals: [{ id: "X1" }, { id: "X2" }],
  electrical: (p) => ({ loads: [{ id: "lamp", a: "X1", b: "X2", rating: String(p.rating) }] }),
  create: () => ({ update: (_t, inp) => ({ outputs: { lit: inp.loads.lamp.on } }) }),
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const buzzer = {
  type: "jwsim/buzzer",
  version: "1.0.0",
  name: "Zumbador",
  category: "Señalización",
  description: "Zumbador de 24 VDC polarizado (+/-).",
  parameters: [{ id: "toneHz", label: "Tono", type: "number", default: 2400, unit: "Hz" }],
  terminals: [{ id: "+" }, { id: "-" }],
  electrical: () => ({ loads: [{ id: "buzzer", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create: () => ({ update: (_t, inp) => ({ outputs: { sounding: inp.loads.buzzer.on } }) }),
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const relay = {
  type: "jwsim/relay",
  version: "1.0.0",
  name: "Relé auxiliar",
  category: "Maniobra",
  description: "Relé enchufable con dos contactos conmutados (11-12-14 y 21-22-24), con tiempos de atraque y caída.",
  parameters: [
    { id: "coil", label: "Bobina", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "pullInMs", label: "Atraque", type: "number", default: 8, unit: "ms" },
    { id: "dropOutMs", label: "Caída", type: "number", default: 4, unit: "ms" },
  ],
  terminals: ["A1", "A2", "11", "12", "14", "21", "22", "24"].map((id) => ({ id })),
  electrical: (p) => ({
    loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.coil), coil: true }],
    contacts: { "11-14": ["11", "14"], "11-12": ["11", "12"], "21-24": ["21", "24"], "21-22": ["21", "22"] },
  }),
  create(ctx) {
    const k = new Delay(ms(ctx.params.pullInMs), ms(ctx.params.dropOutMs));
    return {
      update(t, inp) {
        const on = k.step(t, inp.loads.coil.on);
        return {
          contacts: { "11-14": on, "11-12": !on, "21-24": on, "21-22": !on },
          outputs: { energized: inp.loads.coil.on, closed: on },
          nextEventNs: earliest(k.next),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const contactor = {
  type: "jwsim/contactor",
  version: "1.0.0",
  name: "Contactor",
  category: "Maniobra",
  description: "Contactor de 3 polos (1-2, 3-4, 5-6) con un contacto auxiliar incorporado: 13-14 NA (aux 10, CJX2-0910) o 21-22 NC (aux 01, CJX2-0901).",
  parameters: [
    { id: "coil", label: "Bobina", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "aux", label: "Auxiliar", type: "enum", options: ["10", "01"], default: "10" },
    { id: "pullInMs", label: "Atraque", type: "number", default: 20, unit: "ms" },
    { id: "dropOutMs", label: "Caída", type: "number", default: 10, unit: "ms" },
  ],
  terminals: ["A1", "A2", "1", "2", "3", "4", "5", "6", "13", "14", "21", "22"].map((id) => ({ id })),
  electrical: (p) => ({
    loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.coil), coil: true }],
    contacts: { "1-2": ["1", "2"], "3-4": ["3", "4"], "5-6": ["5", "6"], ...(p.aux === "01" ? { "21-22": ["21", "22"] } : { "13-14": ["13", "14"] }) },
  }),
  create(ctx) {
    const k = new Delay(ms(ctx.params.pullInMs), ms(ctx.params.dropOutMs));
    const nc = ctx.params.aux === "01";
    return {
      update(t, inp) {
        const on = k.step(t, inp.loads.coil.on);
        return {
          contacts: { "1-2": on, "3-4": on, "5-6": on, ...(nc ? { "21-22": !on } : { "13-14": on }) },
          outputs: { energized: inp.loads.coil.on, closed: on },
          nextEventNs: earliest(k.next),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const solenoidValve = {
  type: "jwsim/solenoid-valve",
  version: "1.0.0",
  name: "Electroválvula 5/2 con cilindro",
  category: "Actuadores",
  description:
    "Electroválvula 5/2 monoestable (retorno por resorte) con cilindro de doble efecto. position va de 0 (adentro) a 1 (afuera) en el tiempo de carrera.",
  parameters: [
    { id: "coil", label: "Bobina", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "strokeMs", label: "Carrera de salida", type: "number", default: 500, unit: "ms" },
    { id: "returnMs", label: "Carrera de retorno", type: "number", default: 400, unit: "ms" },
  ],
  terminals: [{ id: "A1" }, { id: "A2" }],
  electrical: (p) => ({ loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.coil), coil: true }] }),
  create(ctx) {
    const pos = new Ramp(0);
    return {
      update(t, inp) {
        const on = inp.loads.coil.on;
        pos.step(t, on ? 1 : 0, 1000 / Number(on ? ctx.params.strokeMs : ctx.params.returnMs));
        const seg = pos.segment(t);
        return {
          outputs: { energized: on, position: seg, extended: seg.value >= 1 && seg.rate === 0, retracted: seg.value <= 0 && seg.rate === 0 },
          nextEventNs: earliest(pos.next),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const solenoidValve2 = {
  type: "jwsim/solenoid-valve-2",
  version: "1.0.0",
  name: "Electroválvula 5/2 biestable con cilindro",
  category: "Actuadores",
  description:
    "Electroválvula 5/2 de doble solenoide (con memoria) y cilindro de doble efecto. Un pulso en A+ (A+1/A+2) pasa la corredera a P→A y el cilindro sale; un pulso en A- (A-1/A-2) la pasa a P→B y entra. Sin bobinas, o con las dos a la vez, la corredera queda donde estaba. position va de 0 (adentro) a 1 (afuera) en el tiempo de carrera.",
  parameters: [
    { id: "coil", label: "Bobinas", type: "enum", options: RATINGS, default: "24VDC" },
    { id: "strokeMs", label: "Carrera de salida", type: "number", default: 500, unit: "ms" },
    { id: "returnMs", label: "Carrera de retorno", type: "number", default: 400, unit: "ms" },
    { id: "start", label: "Corredera al arrancar", type: "enum", options: ["adentro", "afuera"], default: "adentro" },
  ],
  terminals: [{ id: "A+1" }, { id: "A+2" }, { id: "A-1" }, { id: "A-2" }],
  electrical: (p) => ({
    loads: [
      { id: "coilPlus", a: "A+1", b: "A+2", rating: String(p.coil), coil: true },
      { id: "coilMinus", a: "A-1", b: "A-2", rating: String(p.coil), coil: true },
    ],
  }),
  create(ctx) {
    const out = ctx.params.start === "afuera";
    let spoolA = out;
    const pos = new Ramp(out ? 1 : 0);
    return {
      update(t, inp) {
        const plus = inp.loads.coilPlus.on;
        const minus = inp.loads.coilMinus.on;
        // Memoria: solo una bobina sola mueve la corredera.
        if (plus && !minus) spoolA = true;
        else if (minus && !plus) spoolA = false;
        pos.step(t, spoolA ? 1 : 0, 1000 / Number(spoolA ? ctx.params.strokeMs : ctx.params.returnMs));
        const seg = pos.segment(t);
        return {
          outputs: {
            coilPlus: plus,
            coilMinus: minus,
            spoolA,
            position: seg,
            extended: seg.value >= 1 && seg.rate === 0,
            retracted: seg.value <= 0 && seg.rate === 0,
          },
          nextEventNs: earliest(pos.next),
        };
      },
    };
  },
};

const WINDINGS = [["U1", "U2"], ["V1", "V2"], ["W1", "W2"]];
const PHASE_INDEX = { L1: 0, L2: 1, L3: 2 };
/** Chapas de la bornera de un motor trifásico según la conexión (bornes de 6 en 2 filas: U1 V1 W1 / W2 U2 V2). */
export const MOTOR_BRIDGES = {
  triangulo: { "U1-W2": ["U1", "W2"], "V1-U2": ["V1", "U2"], "W1-V2": ["W1", "V2"] },
  estrella: { "W2-U2": ["W2", "U2"], "U2-V2": ["U2", "V2"] },
  "6 cables": {},
};

/**
 * Conexión de un motor trifásico según la fase y el nodo de cada borne:
 * triángulo (cada bobinado entre dos fases distintas), estrella (U2, V2 y W2
 * puenteados y sin fase, con una fase distinta en U1, V1 y W1) o nada.
 * faltaFase: algún bobinado con tensión pero faltan fases para girar.
 */
export function motorConnection(terms) {
  const ph = (t) => terms[t]?.phase ?? null;
  const starts = WINDINGS.map(([a]) => ph(a));
  const three = new Set(starts.filter(Boolean)).size === 3;
  const delta = WINDINGS.every(([a, b]) => ph(a) && ph(b) && ph(a) !== ph(b));
  const starNet = terms.U2?.net;
  const star = !delta && WINDINGS.every(([, b]) => !ph(b) && terms[b]?.net === starNet);
  const powered = WINDINGS.some(([a, b]) => (ph(a) && ph(b) && ph(a) !== ph(b)) || (star && ph(a)));
  let connection = "";
  if (three && delta) connection = "triangulo";
  else if (three && star) connection = "estrella";
  // Secuencia en U1, V1, W1: L1-L2-L3 (o rotada) gira a derechas.
  const direction = connection ? ((PHASE_INDEX[starts[1]] - PHASE_INDEX[starts[0]] + 3) % 3 === 1 ? 1 : -1) : 0;
  return { connection, direction, faltaFase: powered && !connection };
}

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const motor3ph = {
  type: "jwsim/motor-3ph",
  version: "1.0.0",
  name: "Motor trifásico",
  category: "Actuadores",
  description:
    "Motor de inducción trifásico 220Δ/380Y (WEG W22). La bornera (U1 V1 W1 / W2 U2 V2) se arma con chapas en triángulo (la conexión de la red de 220 V) o en estrella, y entonces solo se cablean U1, V1, W1 y PE; con «6 cables» salen los seis bornes para un arranque estrella-triángulo con contactores. En estrella arranca con un tercio del par. La secuencia de fases fija el sentido (cruzar dos fases lo invierte). Con una fase cortada no arranca (falta de fase).",
  parameters: [
    { id: "bornera", label: "Bornera", type: "enum", options: ["triangulo", "estrella", "6 cables"], default: "triangulo" },
    { id: "accelMs", label: "Arranque en triángulo", type: "number", default: 500, unit: "ms" },
    { id: "stopMs", label: "Parada (inercia)", type: "number", default: 1500, unit: "ms" },
  ],
  terminals: [{ id: "U1" }, { id: "V1" }, { id: "W1" }, { id: "W2" }, { id: "U2" }, { id: "V2" }, { id: "PE", label: "PE (tierra)" }],
  electrical: (p) => ({
    phaseLoads: [{ id: "motor", terminals: ["U1", "V1", "W1", "W2", "U2", "V2"] }],
    // Chapas de la bornera: contactos siempre cerrados.
    contacts: MOTOR_BRIDGES[String(p.bornera)] ?? {},
  }),
  create(ctx) {
    const speed = new Ramp(0);
    const bridges = Object.fromEntries(Object.keys(MOTOR_BRIDGES[String(ctx.params.bornera)] ?? {}).map((k) => [k, true]));
    return {
      update(t, inp) {
        const st = inp.phases?.motor;
        const c = st && !st.damaged ? motorConnection(st.terms) : { connection: "", direction: 0, faltaFase: false };
        const goal = c.direction;
        let seg;
        if (st?.controlled && st.hz && c.connection) {
          // Alimentado por un variador: la velocidad sigue a la frecuencia
          // (60 Hz = nominal), con la rampa del variador.
          const k = c.direction / 60;
          speed.set(t, st.hz.value * k);
          seg = { value: st.hz.value * k, rate: st.hz.rate * k };
        } else {
          const cur = speed.at(t);
          const accel = Math.abs(goal) > Math.abs(cur) && Math.sign(goal) !== -Math.sign(cur);
          // En estrella cada bobinado recibe 220/√3 V: un tercio del par, arranque tres veces más lento.
          const accelMs = Number(ctx.params.accelMs) * (c.connection === "estrella" ? 3 : 1);
          speed.step(t, goal, 1000 / (accel ? accelMs : Number(ctx.params.stopMs)));
          seg = speed.segment(t);
        }
        return {
          contacts: bridges,
          outputs: {
            energized: !!c.connection || c.faltaFase,
            connection: c.connection,
            faltaFase: c.faltaFase,
            speed: seg,
            running: seg.value !== 0 || seg.rate !== 0,
            direction: goal,
          },
          nextEventNs: earliest(speed.next),
        };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const motor = {
  type: "jwsim/motor",
  version: "1.0.0",
  name: "Motor",
  category: "Actuadores",
  description:
    "Motor monofásico de 230 VAC o de 24 VDC (U1-U2). speed va de -1 a 1 con rampa de arranque y de parada; en CC el sentido sigue a la polaridad.",
  parameters: [
    { id: "rating", label: "Alimentación", type: "enum", options: ["230VAC", "24VDC"], default: "230VAC" },
    { id: "accelMs", label: "Arranque", type: "number", default: 300, unit: "ms" },
    { id: "stopMs", label: "Parada (inercia)", type: "number", default: 600, unit: "ms" },
  ],
  terminals: [{ id: "U1" }, { id: "U2" }],
  electrical: (p) => ({ loads: [{ id: "winding", a: "U1", b: "U2", rating: String(p.rating) }] }),
  create(ctx) {
    const speed = new Ramp(0);
    return {
      update(t, inp) {
        const w = inp.loads.winding;
        const goal = w.on ? (w.kind === "DC" ? w.polarity : 1) : 0;
        const cur = speed.at(t);
        // Acelera con la rampa de arranque; frena (o invierte hacia 0) con la de parada.
        const accel = Math.abs(goal) > Math.abs(cur) && Math.sign(goal) !== -Math.sign(cur);
        speed.step(t, goal, 1000 / Number(accel ? ctx.params.accelMs : ctx.params.stopMs));
        const seg = speed.segment(t);
        // direction: sentido pedido por la alimentación (1, -1 en CC invertida, 0 sin tensión).
        return { outputs: { energized: w.on, speed: seg, running: seg.value !== 0 || seg.rate !== 0, direction: goal }, nextEventNs: earliest(speed.next) };
      },
    };
  },
};
