// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Comunicación con la PC: equipos que unen un puerto del JWPLC simulado con
// un puerto COM de la PC, para usar JW Modbus Tool, JW Serial u otro
// programa contra el Sim como contra la placa real.
//
//   usb-rs485  conversor USB a RS-485 (tipo ZK-U485: CH340G + MAX485) cableado
//              a RS485_A/B de la placa; su lado USB es el COM de la PC (en
//              Windows, el par com0com COM20 ↔ COM21 del instalador: el Sim
//              abre COM20 y el programa COM21). Fallas de taller: eco de lo
//              que transmite la PC, A/B invertidos y bus sin terminación.
//   usb-pc     cable USB del puerto USB-C de la placa a la PC: el Monitor
//              serie (UART0) en el COM.
//
// La escena solo describe el enlace (Scene.hostPorts); quien abre el COM y
// aplica las fallas a los bytes es la app (app/lib/host-link.mjs).

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const usbRs485 = {
  type: "jwsim/usb-rs485",
  version: "1.0.0",
  name: "Conversor USB a RS-485 (PC)",
  category: "Comunicación",
  description:
    "Conversor USB a RS-485 tipo ZK-U485 (CH340G + MAX485, semidúplex, alimentado por el USB): une el bus RS-485 del JWPLC con un puerto COM de la PC. Se cablea A con A y B con B; su lado USB es el puerto COM del parámetro (en Windows, el par com0com COM20 ↔ COM21 del instalador: el Sim abre COM20 y JW Modbus Tool u otro programa abre COM21). Fallas de taller: eco (la PC recibe de vuelta lo que transmite, como los conversores que no apagan su receptor al transmitir), A/B invertidos (también si se cruzan los cables: llega basura en ambos sentidos) y bus sin resistencia de terminación (errores de bit en la línea).",
  parameters: [
    { id: "com", label: "Puerto COM de la PC", type: "string", default: "COM20", hint: "COM20 (el otro programa abre COM21)" },
    { id: "eco", label: "Eco de lo que transmite la PC", type: "boolean", default: false },
    { id: "abInvertidos", label: "A/B invertidos", type: "boolean", default: false },
    { id: "sinTerminacion", label: "Bus sin terminación (120 Ω)", type: "boolean", default: false },
    { id: "tasaErrores", label: "Bytes con error sin terminación", type: "number", default: 2, unit: "%" },
  ],
  terminals: [
    { id: "A", label: "RS-485 A (D+)" },
    { id: "B", label: "RS-485 B (D−)" },
    { id: "GND", label: "GND (común del RS-485)" },
  ],
  hostPort: (p) => ({
    uart: 2,
    com: String(p.com ?? "").trim(),
    to: { A: "RS485_A", B: "RS485_B" },
    echo: !!p.eco,
    inverted: !!p.abInvertidos,
    errorRate: p.sinTerminacion ? Math.max(0, Math.min(100, Number(p.tasaErrores))) / 100 : 0,
  }),
  create(ctx) {
    return {
      update() {
        return { outputs: { com: ctx.params.com, eco: !!ctx.params.eco } };
      },
    };
  },
};

/** @type {import("../../sdk/jwsim-device.js").DeviceDefinition} */
export const usbPc = {
  type: "jwsim/usb-pc",
  version: "1.0.0",
  name: "Cable USB a PC",
  category: "Comunicación",
  description:
    "Cable USB del puerto USB-C del JWPLC a la PC: el Monitor serie (UART0, Serial) queda en el puerto COM del parámetro, como con la placa real. Sirve para JW Serial o para un sketch que use el USB como maestro Modbus. Se cablea su borne USB al borne USB de la placa.",
  parameters: [{ id: "com", label: "Puerto COM de la PC", type: "string", default: "COM20", hint: "COM20 (el otro programa abre COM21)" }],
  terminals: [{ id: "USB", label: "Conector USB-C" }],
  hostPort: (p) => ({ uart: 0, com: String(p.com ?? "").trim(), to: { USB: "USB" }, echo: false, inverted: false, errorRate: 0 }),
  create(ctx) {
    return {
      update() {
        return { outputs: { com: ctx.params.com } };
      },
    };
  },
};
