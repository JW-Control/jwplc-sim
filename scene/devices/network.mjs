// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Equipos de la red Ethernet de la escena (alpha.19, curso C++ U8 e IEC U5).
// Están en la misma red que el JWPLC (subred 192.168.250.0/24, como si
// hubiera un switch); el parámetro «Cable de red conectado» simula el cable
// suelto. La red la maneja scene/network.mjs.
//
//   pc-modbus-tcp      PC con JW Modbus Tool, maestro Modbus TCP: pregunta al
//                      PLC (servidor en el puerto 502) y muestra una tabla de
//                      8 holding y 8 bobinas que se pueden escribir (como
//                      ModScan). No es un HMI de marca: es la herramienta de
//                      prueba que usa el técnico.
//   remote-io-tcp      E/S remotas Modbus TCP (8 DI, 8 DO a relé): el PLC es
//                      el cliente.
import { remoteIo } from "./fieldbus.mjs";

const K8 = [0, 1, 2, 3, 4, 5, 6, 7];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const pcModbusTcp = {
  type: "jwsim/pc-modbus-tcp",
  version: "1.0.0",
  name: "PC con JW Modbus Tool (Modbus TCP)",
  category: "Comunicación",
  description:
    "Computadora en la red del tablero con JW Modbus Tool abierto como maestro Modbus TCP: se conecta al JWPLC (servidor, puerto 502) y le pregunta cada «Período». Muestra 8 holding registers (03) y 8 bobinas (01) desde las direcciones de inicio. Arrastrar el valor de un holding lo escribe (06, 0-1000, de a 1 por píxel) y un clic en una bobina la invierte (05). Con el cable de red suelto o sin el PLC escuchando queda «sin conexión».",
  parameters: [
    { id: "ip", label: "IP de la PC", type: "string", default: "192.168.250.50" },
    { id: "plc", label: "IP del PLC", type: "string", default: "192.168.250.10" },
    { id: "port", label: "Puerto del PLC", type: "number", default: 502 },
    { id: "unit", label: "Unit ID", type: "number", default: 1 },
    { id: "hStart", label: "Holding desde", type: "number", default: 0 },
    { id: "cStart", label: "Bobinas desde", type: "number", default: 0 },
    { id: "pollMs", label: "Período de lectura", type: "number", default: 200, unit: "ms" },
    { id: "cable", label: "Cable de red conectado", type: "boolean", default: true },
  ],
  terminals: [],
  actions: [
    // Se manejan en la pantalla de la PC, no en «Mandos» (mando: false).
    ...K8.map((k) => ({ id: `h${k}`, label: `Escribir holding ${k + 1}`, kind: /** @type {const} */ ("value"), min: 0, max: 1000, mando: false })),
    ...K8.map((k) => ({ id: `c${k}`, label: `Invertir bobina ${k + 1}`, kind: /** @type {const} */ ("toggle"), mando: false })),
  ],
  net: (p) => ({
    role: "client",
    ip: String(p.ip),
    target: String(p.plc),
    port: Number(p.port),
    unit: Number(p.unit),
    pollMs: Number(p.pollMs),
    reads: [
      { fn: 3, start: Number(p.hStart) || 0, count: 8 },
      { fn: 1, start: Number(p.cStart) || 0, count: 8 },
    ],
  }),
  create({ params }) {
    const hs = Number(params.hStart) || 0;
    const cs = Number(params.cStart) || 0;
    let cable = params.cable !== false;
    let st = { connected: false, ok: 0, errors: 0 };
    let regs = K8.map(() => 0);
    let coils = K8.map(() => 0);
    /** Último valor visto de cada acción: escribe solo cuando cambia. */
    const prev = new Map();
    /** @type {{ fn: number, start: number, value: number }[]} */
    let queue = [];
    return {
      update(_t, inp) {
        cable = params.cable !== false;
        for (const k of K8) {
          const h = inp.actions[`h${k}`];
          if (h !== undefined && prev.get(`h${k}`) !== h) {
            prev.set(`h${k}`, h);
            queue.push({ fn: 6, start: hs + k, value: Math.max(0, Math.min(65535, Math.round(Number(h)))) });
          }
          const c = inp.actions[`c${k}`];
          // Al arrancar la acción viene en reposo (false): eso no es un clic.
          if (c !== undefined && prev.get(`c${k}`) !== c && (prev.has(`c${k}`) || c)) {
            prev.set(`c${k}`, c);
            queue.push({ fn: 5, start: cs + k, value: coils[k] ? 0 : 1 });
          }
        }
        const on = cable && st.connected;
        /** @type {Record<string, unknown>} */
        const outs = { connected: on, estado: !cable ? "sin cable" : on ? "en línea" : "sin conexión", ok: st.ok, errores: st.errors, ip: String(params.ip), plc: `${params.plc}:${params.port}` };
        for (const k of K8) {
          outs[`ah${k}`] = `4${String(hs + k + 1).padStart(4, "0")}`;
          outs[`ac${k}`] = `0${String(cs + k + 1).padStart(4, "0")}`;
          outs[`h${k}`] = on ? regs[k] : null;
          outs[`c${k}`] = on && !!coils[k];
        }
        return { outputs: outs };
      },
      netOnline: () => cable,
      netStatus(s) {
        const changed = s.connected !== st.connected || s.ok !== st.ok;
        st = s;
        return changed;
      },
      netResult(req, vals) {
        if (!vals) return;
        if (req.fn === 3) regs = vals.slice(0, 8);
        if (req.fn === 1) coils = vals.slice(0, 8);
      },
      netWrites() {
        const out = queue;
        queue = [];
        return out;
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const remoteIoTcp = {
  ...remoteIo,
  type: "jwsim/remote-io-tcp",
  name: "Módulo de E/S remotas Modbus TCP",
  category: "Comunicación",
  description:
    "Módulo de E/S remotas con Ethernet, servidor Modbus TCP (puerto 502): 8 entradas de 24 VDC (DI1-DI8, común DC al 0 V) y 8 salidas a relé (DO1-DO4 con C1, DO5-DO8 con C2). El JWPLC es el cliente: se conecta a su IP. Mapa: bobinas 0-7 = DO1-DO8 (01, 05, 15), entradas discretas 0-7 = DI1-DI8 (02), holding 0 = salidas como máscara de bits (03, 06, 16), input 0 = entradas (04). Sin alimentación o con el cable de red suelto no responde y los relés sueltan sin alimentación.",
  parameters: [
    { id: "ip", label: "IP del módulo", type: "string", default: "192.168.250.20" },
    { id: "port", label: "Puerto", type: "number", default: 502 },
    { id: "unit", label: "Unit ID", type: "number", default: 1 },
    { id: "cable", label: "Cable de red conectado", type: "boolean", default: true },
  ],
  terminals: remoteIo.terminals.filter((x) => x.id !== "A" && x.id !== "B"),
  modbus: (p) => ({ address: Number(p.unit), baud: 0, responseMs: 1 }),
  net: (p) => ({ role: "server", ip: String(p.ip), port: Number(p.port), unit: Number(p.unit) }),
  create(ctx) {
    const inst = remoteIo.create(ctx);
    let powered = false;
    return {
      ...inst,
      update(t, inp) {
        powered = inp.loads.supply.on;
        return inst.update(t, inp);
      },
      netOnline: () => powered && ctx.params.cable !== false,
    };
  },
};
