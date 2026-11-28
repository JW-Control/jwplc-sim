// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Equipos de la red Ethernet de la escena (alpha.19, curso C++ U8 e IEC U5).
// Están en la misma red que el JWPLC (subred 192.168.250.0/24, como si
// hubiera un switch); el parámetro «Cable de red conectado» simula el cable
// suelto. La red la maneja scene/network.mjs.
//
//   hmi-modbus-tcp     panel HMI/SCADA maestro Modbus TCP: pregunta al PLC
//                      (servidor en el puerto 502) y muestra valores, pilotos
//                      y mandos.
//   remote-io-tcp      E/S remotas Modbus TCP (8 DI, 8 DO a relé): el PLC es
//                      el cliente.
import { remoteIo } from "./fieldbus.mjs";

const K4 = [1, 2, 3, 4];

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const hmiModbusTcp = {
  type: "jwsim/hmi-modbus-tcp",
  version: "1.0.0",
  name: "HMI / SCADA Modbus TCP",
  category: "Comunicación",
  description:
    "Panel HMI con Ethernet, maestro Modbus TCP: se conecta al JWPLC (servidor Modbus TCP, puerto 502) y le pregunta cada «Período». Muestra los holding 0-3 del PLC como valores (V1-V4) y las bobinas 0-3 como pilotos (L1-L4). Sus botones B1-B4 escriben las bobinas 4-7 (1 mientras se pulsan) y la consigna escribe el holding 4. Se alimenta con 24 VDC; con el cable de red suelto o sin el PLC escuchando queda «sin conexión».",
  parameters: [
    { id: "ip", label: "IP del HMI", type: "string", default: "192.168.250.50" },
    { id: "plc", label: "IP del PLC", type: "string", default: "192.168.250.10" },
    { id: "port", label: "Puerto del PLC", type: "number", default: 502 },
    { id: "unit", label: "Unit ID", type: "number", default: 1 },
    { id: "pollMs", label: "Período de lectura", type: "number", default: 200, unit: "ms" },
    { id: "cable", label: "Cable de red conectado", type: "boolean", default: true },
  ],
  terminals: [{ id: "+", label: "+24 V" }, { id: "-", label: "0 V" }],
  actions: [
    ...K4.map((k) => ({ id: `b${k}`, label: `Botón B${k}`, kind: /** @type {const} */ ("momentary") })),
    { id: "consigna", label: "Consigna (holding 4)", kind: "value", min: 0, max: 1000 },
  ],
  net: (p) => ({
    role: "client",
    ip: String(p.ip),
    target: String(p.plc),
    port: Number(p.port),
    unit: Number(p.unit),
    pollMs: Number(p.pollMs),
    reads: [
      { fn: 3, start: 0, count: 4 },
      { fn: 1, start: 0, count: 4 },
    ],
  }),
  electrical: () => ({ loads: [{ id: "supply", a: "+", b: "-", rating: "24VDC", polar: true }] }),
  create({ params }) {
    let powered = false;
    let cable = params.cable !== false;
    let st = { connected: false, ok: 0, errors: 0 };
    let values = [0, 0, 0, 0];
    let lamps = [0, 0, 0, 0];
    /** Lo último escrito en cada bobina/holding (para no repetir). */
    const sent = new Map();
    let want = new Map();
    return {
      update(_t, inp) {
        powered = inp.loads.supply.on;
        cable = params.cable !== false;
        // Mandos: B1-B4 → bobinas 4-7; consigna → holding 4.
        want = new Map(K4.map((k) => [`c${3 + k}`, inp.actions[`b${k}`] ? 1 : 0]));
        if (inp.actions.consigna !== undefined) want.set("h4", Math.max(0, Math.min(65535, Math.round(Number(inp.actions.consigna)))));
        const on = powered && st.connected;
        /** @type {Record<string, unknown>} */
        const outs = { powered, connected: on, estado: !powered ? "apagado" : !cable ? "sin cable" : on ? "en línea" : "sin conexión", ok: st.ok, errores: st.errors };
        K4.forEach((k, i) => {
          outs[`v${k}`] = on ? values[i] : null;
          outs[`l${k}`] = on && !!lamps[i];
          outs[`b${k}`] = !!inp.actions[`b${k}`];
        });
        outs.consigna = want.get("h4") ?? 0;
        return { outputs: outs };
      },
      netOnline: () => powered && cable,
      netStatus(s) {
        const changed = s.connected !== st.connected;
        st = s;
        return changed;
      },
      netResult(req, vals) {
        if (!vals) return;
        if (req.fn === 3) values = vals.slice(0, 4);
        if (req.fn === 1) lamps = vals.slice(0, 4);
      },
      netWrites() {
        const out = [];
        for (const [k, v] of want) {
          if (sent.get(k) === v) continue;
          sent.set(k, v);
          const n = Number(k.slice(1));
          out.push(k[0] === "c" ? { fn: 5, start: n, value: v } : { fn: 6, start: n, value: v });
        }
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
