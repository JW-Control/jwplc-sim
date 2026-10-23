// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Utilidades de las pruebas de la escena.
import { Scene } from "../scene.mjs";

export const ms = (v) => BigInt(Math.round(v * 1e6));

/** Escena a partir de dispositivos "id:tipo[:json params]" y cables "a-b" (bornes separados por " - "). */
export function scene(devices, wiring, opts) {
  return new Scene(
    {
      devices: devices.map((d) => (typeof d === "string" ? { id: d.split(":")[0], type: `jwsim/${d.split(":")[1]}` } : d)),
      wiring: wiring.map((w) => {
        const [from, to] = w.split(/\s+-\s+/);
        return { from, to };
      }),
    },
    opts,
  );
}

/** Fallas registradas (tipo y dispositivo) hasta ahora. */
export const faults = (s) => s.events.filter((e) => e.kind === "fault").map((e) => `${e.type}:${e.device ?? ""}`);
