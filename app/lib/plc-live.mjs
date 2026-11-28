// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// «Ejecutar en vivo» (alpha.19): el Sim se conecta al JWPLC Basic REAL por su
// puerto USB (COM) y muestra lo que pasa en la placa: Ladder en vivo, tabla de
// variables, bornera, esquema y planta 3D. Con un clic en una entrada del Sim
// se FUERZA la variable en el equipo real (como «Forzar» del OpenPLC Editor).
//
// Habla el protocolo del depurador del OpenPLC Editor (app/lib/plc-debug.mjs):
// el firmware Baremetal lo trae siempre activo en la UART0 (USB, 115200,
// esclavo 1). El MD5 del programa de la placa tiene que coincidir con el que
// compiló el Sim (el editor exige lo mismo).
//
// Las variables con dirección (S1 AT %IX0.0) se leen de configuration.cpp de
// la compilación: %IX0.k ↔ I0_k y %QX0.k ↔ Q0_k, las señales del Sim.
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PlcDebugLink, debugMapFor } from "./plc-debug.mjs";

/** Variables con dirección física del programa compilado: Map(NOMBRE → {loc, signal}). */
export function locatedVars(exe) {
  const out = new Map();
  if (!exe) return out;
  const f = join(dirname(dirname(exe)), "openplc", "src", "configuration.cpp");
  if (!existsSync(f)) return out;
  for (const m of readFileSync(f, "utf8").matchAll(/\/\/\s*([A-Za-z_]\w*)\s+AT\s+%([IQ])X(\d+)\.(\d+)/g)) {
    out.set(m[1].toUpperCase(), { loc: `%${m[2]}X${m[3]}.${m[4]}`, signal: `${m[2] === "I" ? "I" : "Q"}${m[3]}_${m[4]}` });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class LiveSession extends EventEmitter {
  /**
   * @param {{ops: object, exe: string, path: string, baud?: number, periodMs?: number, openPort?: Function}} o
   * openPort(path, baud) → puerto de serialport abierto (en pruebas, uno de mentira).
   */
  constructor({ ops, exe, path, baud = 115200, periodMs = 150, openPort }) {
    super();
    const mapFile = debugMapFor(exe);
    if (!mapFile) throw new Error("«Ejecutar en vivo» es para proyectos IEC (OpenPLC): compile primero el proyecto en el Sim.");
    this.path = path;
    this.baud = baud;
    this.periodMs = periodMs;
    this.openPort = openPort ?? openSerial;
    this.link = new PlcDebugLink({ ops, mapFile, timeoutMs: 800 });
    this.located = locatedVars(exe);
    this.bySignal = new Map([...this.located].map(([name, l]) => [l.signal, name]));
    this.levels = new Map();
    this.forced = new Map();
    this.port = null;
    this.timer = null;
    this.stopped = false;
    this.fails = 0;
  }

  /** Abre el puerto, comprueba el programa (MD5) y empieza a leer. */
  async start() {
    this.port = await this.openPort(this.path, this.baud);
    this.link.attachSerial(this.port);
    // Al abrir el COM la placa puede reiniciarse (DTR/RTS): se reintenta
    // el MD5 mientras arranca el firmware.
    let md5;
    let last;
    for (let i = 0; i < 12 && !this.stopped; i++) {
      try {
        md5 = await this.link.checkMd5();
        break;
      } catch (err) {
        last = err;
        await sleep(500);
      }
    }
    if (!md5) {
      await this.stop();
      throw new Error(`el JWPLC en ${this.path} no responde al depurador (${last?.message ?? "sin respuesta"}). ¿Tiene cargado un programa del OpenPLC Editor y el puerto es el correcto?`);
    }
    if (!md5.ok) {
      await this.stop();
      throw new Error(`el programa del JWPLC no es el mismo que compiló el Sim (MD5 ${md5.md5} ≠ ${md5.expected}). Súbalo desde el OpenPLC Editor o compile en el Sim el mismo proyecto.`);
    }
    this.emit("connected", { path: this.path, md5: md5.md5 });
    this.loop();
    return { md5: md5.md5, vars: this.link.vars.length, located: Object.fromEntries(this.located) };
  }

  async loop() {
    if (this.stopped) return;
    const t0 = Date.now();
    try {
      const { tick, values } = await this.link.read();
      this.fails = 0;
      const changes = [];
      for (const [name, l] of this.located) {
        if (!(name in values)) continue;
        const level = values[name] === true || values[name] === 1;
        if (this.levels.get(l.signal) !== level) {
          this.levels.set(l.signal, level);
          changes.push([l.signal, level ? 1 : 0]);
        }
      }
      this.emit("values", { tick, values, changes });
    } catch (err) {
      if (this.stopped) return;
      if (++this.fails >= 5) {
        this.emit("lost", err);
        await this.stop();
        return;
      }
    }
    this.timer = setTimeout(() => this.loop(), Math.max(0, this.periodMs - (Date.now() - t0)));
  }

  /** Clic en una entrada del Sim: fuerza la variable de esa borna en el equipo real. */
  async setSignal(signal, level) {
    const name = this.bySignal.get(signal);
    if (!name) throw new Error(`ninguna variable del programa está en ${signal.replace("_", ".")}`);
    await this.link.force(name, !!level);
    this.forced.set(name, !!level);
    return name;
  }

  /** Fuerza o libera (value null) una variable por nombre. */
  async force(name, value) {
    await this.link.force(name, value);
    if (value === null || value === undefined) this.forced.delete(String(name).toUpperCase());
    else this.forced.set(String(name).toUpperCase(), value);
  }

  /** Libera lo forzado (la placa vuelve a mandar) y cierra el puerto. */
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    for (const name of [...this.forced.keys()]) {
      try {
        await this.link.force(name, null);
      } catch {
        // la placa ya no responde: queda como estaba
      }
    }
    this.forced.clear();
    this.link.detach();
    const p = this.port;
    this.port = null;
    if (p?.isOpen) await new Promise((r) => p.close(() => r()));
    this.emit("closed");
  }
}

/** Abre el COM sin reiniciar el ESP32: DTR y RTS en reposo (EN y GPIO0 altos). */
async function openSerial(path, baudRate) {
  const { SerialPort } = await import("serialport");
  const port = new SerialPort({ path, baudRate, autoOpen: false, hupcl: false });
  await new Promise((ok, ko) => port.open((err) => (err ? ko(err) : ok())));
  await new Promise((ok) => port.set({ dtr: false, rts: false }, () => ok()));
  return port;
}
