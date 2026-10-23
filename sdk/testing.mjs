// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: MIT
// Ayudas para probar dispositivos de escena del SDK. `jwsim-cli device test`
// corre los *.test.mjs del dispositivo con JWSIM_SDK apuntando a este
// archivo:
//
//   const { sceneWith, ms } = await import(process.env.JWSIM_SDK);
//   const s = sceneWith(miDispositivo, ["PS:power-24vdc", "K:acme/mi-rele"], ["PS.L+ - K.A1", "K.A2 - PS.M"]);
//   s.advanceTo(ms(100));
//   assert.equal(s.output("K", "closed"), true);
import { Registry } from "../scene/devices/index.mjs";
import { Scene } from "../scene/scene.mjs";

export { Scene, Registry };

/** Milisegundos → ns (bigint). */
export const ms = (v) => BigInt(Math.round(v * 1e6));

/**
 * Escena con la biblioteca incluida más los dispositivos dados.
 * Dispositivos: "id:tipo" (tipo sin autor = jwsim/<tipo>) u objetos {id, type, params}.
 * Cables: "A.borne - B.borne".
 */
export function sceneWith(defs, devices, wiring = []) {
  const reg = new Registry();
  for (const d of [defs].flat()) reg.add(d);
  return new Scene(
    {
      devices: devices.map((d) => {
        if (typeof d !== "string") return d;
        const [id, type] = d.split(":");
        return { id, type: type.includes("/") ? type : `jwsim/${type}` };
      }),
      wiring: wiring.map((w) => {
        const [from, to] = w.split(/\s+-\s+/);
        return { from, to };
      }),
    },
    { registry: reg },
  );
}
