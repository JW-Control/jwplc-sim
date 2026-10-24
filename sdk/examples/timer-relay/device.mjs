// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: MIT
// Relé temporizador (dispositivo de escena de ejemplo del SDK, G7).
//
//   A1-A2   bobina (24 VDC o 230 VAC)
//   15-18   contacto temporizado NA, 15-16 NC (IEC 61812)
// Modos: "on-delay" (a la conexión: conmuta `timeMs` después de energizar y
// cae al desenergizar) y "off-delay" (a la desconexión: conmuta al energizar
// y cae `timeMs` después de desenergizar).
//
// Compilar: tsc -p tsconfig.json  (device.mts → device.mjs)
const ms = (v) => BigInt(Math.round(v * 1e6));
const device = {
    type: "jwcontrol/timer-relay",
    version: "1.0.1",
    name: "Relé temporizador",
    category: "Maniobra",
    description: "Temporizador a la conexión o a la desconexión con contacto conmutado 15-16-18.",
    parameters: [
        { id: "mode", label: "Modo", type: "enum", options: ["on-delay", "off-delay"], default: "on-delay" },
        { id: "timeMs", label: "Tiempo", type: "number", default: 3000, unit: "ms" },
        { id: "coil", label: "Bobina", type: "enum", options: ["24VDC", "230VAC"], default: "24VDC" },
    ],
    terminals: ["A1", "A2", "15", "16", "18"].map((id) => ({ id })),
    electrical: (p) => ({
        loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.coil), coil: true }],
        contacts: { "15-18": ["15", "18"], "15-16": ["15", "16"] },
    }),
    create(ctx) {
        const onDelay = ctx.params.mode === "on-delay";
        const delay = ms(Number(ctx.params.timeMs));
        let energized = false;
        let closed = false;
        let due;
        return {
            update(t, inp) {
                const on = inp.loads.coil.on;
                if (on !== energized) {
                    energized = on;
                    // El flanco que temporiza arranca la cuenta; el otro conmuta ya.
                    if (on === onDelay)
                        due = t + delay;
                    else {
                        due = undefined;
                        closed = on;
                    }
                }
                if (due !== undefined && t >= due) {
                    closed = energized;
                    due = undefined;
                }
                // Tiempo restante como segmento lineal: baja 1000 ms por segundo.
                const remainingMs = due === undefined ? { value: 0, rate: 0 } : { value: Number(due - t) / 1e6, rate: -1000 };
                return {
                    contacts: { "15-18": closed, "15-16": !closed },
                    outputs: { energized, closed, remainingMs },
                    nextEventNs: due,
                };
            },
        };
    },
};
export default device;
