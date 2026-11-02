// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Puerto COM virtual: une una UART del JWPLC simulado con un puerto serie del
// host, para usar el JWPLC Sim desde JW Serial u otro programa de la PC.
//
// En Windows el instalador crea un par com0com (COM20 ↔ COM21): el Sim abre
// un extremo y el programa externo el otro. En Linux sirve cualquier puerto
// (p. ej. un par de pty de socat).
//
// El runner deriva los bytes que transmite la UART ({"type":"tap"} →
// {"type":"uart_out","port","hex"}) y lo que llega del COM entra como
// {"type":"uart","port","hex"}: queda en la grabación como una entrada más.
// UART0 es el USB del JWPLC (Monitor serie); UART2 es el RS-485.
import { EventEmitter } from "node:events";

let serialMod;
async function serialport() {
  serialMod ??= import("serialport").catch(() => null);
  return serialMod;
}

// Puertos del host. [] si el módulo serialport no está disponible.
export async function listComPorts() {
  const m = await serialport();
  if (!m) return [];
  // En Linux sin udev (contenedores) la lista falla: queda vacía.
  const ports = await m.SerialPort.list().catch(() => []);
  return ports.map((p) => ({ path: p.path, label: [p.path, p.friendlyName ?? p.manufacturer].filter(Boolean).join(" · ") }));
}

export async function comAvailable() {
  return !!(await serialport());
}

export class ComBridge extends EventEmitter {
  // path: "COM20" o "/dev/pts/3"; uart: 0 (USB) o 2 (RS-485).
  constructor({ path, uart = 0, baudRate = 115200 }) {
    super();
    this.path = path;
    this.uart = uart;
    this.baudRate = baudRate;
    this.port = null;
    this.proc = null;
    this.onMessage = (m) => {
      if (m.type === "uart_out" && m.port === this.uart && this.port?.isOpen) {
        this.port.write(Buffer.from(m.hex.replaceAll(" ", ""), "hex"));
      }
    };
  }

  async open() {
    const m = await serialport();
    if (!m) throw new Error("el módulo serialport no está instalado");
    await new Promise((resolve, reject) => {
      this.port = new m.SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });
      this.port.open((err) => (err ? reject(new Error(`no se pudo abrir ${this.path}: ${err.message}`)) : resolve()));
    });
    this.port.on("data", (buf) => {
      if (this.proc) this.proc.send({ type: "uart", port: this.uart, hex: buf.toString("hex") });
    });
    this.port.on("error", (err) => this.emit("error", err));
    this.port.on("close", () => this.emit("closed"));
    return this;
  }

  // Une el puerto con el runner que está corriendo (se repite en cada arranque).
  attach(proc) {
    this.detach();
    this.proc = proc;
    proc.on("message", this.onMessage);
    proc.send({ type: "tap", port: this.uart, on: 1 });
  }

  detach() {
    if (!this.proc) return;
    this.proc.off?.("message", this.onMessage);
    this.proc = null;
  }

  async close() {
    this.detach();
    const p = this.port;
    this.port = null;
    if (p?.isOpen) await new Promise((r) => p.close(() => r()));
  }
}
