// SPDX-FileCopyrightText: 2026 Autor
// SPDX-License-Identifier: MIT
// Plantilla de dispositivo de escena (SDK de JWPLC Sim, docs/SDK.md).
// Baliza intermitente: con X1-X2 energizado, `lit` alterna cada `periodMs`/2.
//
// Compilar: tsc -p tsconfig.json  (device.mts → device.mjs)
// Probar:   jwsim-cli device test .
const ms = (v) => BigInt(Math.round(v * 1e6));
const device = {
    type: "autor/mi-dispositivo",
    version: "0.1.0",
    name: "Mi dispositivo",
    category: "Señalización",
    parameters: [
        { id: "rating", label: "Tensión", type: "enum", options: ["24VDC", "230VAC"], default: "24VDC" },
        { id: "periodMs", label: "Período", type: "number", default: 1000, unit: "ms" },
    ],
    terminals: [{ id: "X1" }, { id: "X2" }],
    electrical: (p) => ({ loads: [{ id: "lamp", a: "X1", b: "X2", rating: String(p.rating) }] }),
    create(ctx) {
        const half = ms(Number(ctx.params.periodMs) / 2);
        let since; // instante en que se energizó
        return {
            update(t, inp) {
                if (!inp.loads.lamp.on) {
                    since = undefined;
                    return { outputs: { lit: false } };
                }
                since ??= t;
                // Fase según el tiempo transcurrido: sin estado que dependa de cuántas
                // veces la escena llame a update en el mismo instante.
                const n = (t - since) / half;
                return { outputs: { lit: n % 2n === 0n }, nextEventNs: since + (n + 1n) * half };
            },
        };
    },
};
export default device;
