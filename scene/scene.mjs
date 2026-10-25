// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Motor de escena: dispositivos, cableado y netlist en tiempo virtual
// (ARCHITECTURE §4.1 y §6.6). No conoce el runner: la co-simulación
// (cli/lib/cosim.mjs, app) le pasa las salidas de la placa y toma de aquí
// las entradas y el próximo evento propio de la escena.
//
// Evaluación en un instante t: con los contactos actuales se resuelve la
// netlist; cada dispositivo recibe sus cargas energizadas, enlaces
// mecánicos, acciones del usuario y señales de la placa, y devuelve sus
// contactos y salidas. Si algo cambió se vuelve a resolver (punto fijo, como
// el ciclo de un relé con retardo 0). Sin convergencia en 50 vueltas es una
// oscilación (p. ej. un relé que se corta a sí mismo sin retardo).
//
// Determinismo: sin reloj de pared ni aleatorios; los dispositivos se
// evalúan en el orden de la escena.

import { crc16 } from "./modbus.mjs";
import { analyze, solve } from "./netlist.mjs";
import { Registry } from "./devices/index.mjs";

const MAX_ITER = 50;

// Bornes renombrados entre versiones de un tipo: escenas guardadas antes del
// cambio se leen con los nombres nuevos (la app hace lo mismo al abrirlas).
const RENAMED = {
  // Fuente 24 VDC 1.x (L+/M) → 2.0 (Mean Well: +V1 +V2 −V1 −V2).
  "jwsim/power-24vdc": { "L+": "+V1", M: "-V1" },
};

/**
 * Escena con los nombres de bornes vigentes (no modifica la original).
 * @param {SceneSpec} spec
 * @returns {SceneSpec}
 */
export function migrateScene(spec) {
  const map = new Map();
  for (const d of spec.devices ?? []) if (RENAMED[d.type]) map.set(d.id, RENAMED[d.type]);
  if (!map.size) return spec;
  const end = (e) => {
    const i = e.indexOf(".");
    const ren = map.get(e.slice(0, i))?.[e.slice(i + 1)];
    return ren ? `${e.slice(0, i)}.${ren}` : e;
  };
  return {
    ...spec,
    devices: (spec.devices ?? []).map((d) => (RENAMED[d.type] && d.version && Number(String(d.version).split(".")[0]) < 2 ? { ...d, version: undefined } : d)),
    wiring: (spec.wiring ?? []).map((w) => ({ ...w, from: end(w.from), to: end(w.to) })),
  };
}
const MAX_EVENTS = 20000;

/**
 * @typedef {import("../sdk/jwsim-device.js").DeviceDefinition} DeviceDefinition
 * @typedef {import("../sdk/jwsim-device.js").DeviceStep} DeviceStep
 * @typedef {{ id: string, type: string, version?: string, params?: Record<string, unknown>, x?: number, y?: number }} DeviceSpec
 * @typedef {{ devices: DeviceSpec[], wiring: { from: string, to: string }[] }} SceneSpec
 * @typedef {{ t: bigint, kind: "fault" | "output" | "action" | "signal" | "rearm" | "inject" | "clear", device?: string, key?: string, value?: unknown, message?: string, type?: string }} SceneEvent
 * @typedef {{ kind: "stuck", device: string, value?: boolean }
 *   | { kind: "welded", device: string }
 *   | { kind: "burnt", device: string }
 *   | { kind: "open", wire: string }} InjectedFault
 */

/**
 * Clave de una falla inyectada: "stuck:B0", "welded:KM1", "burnt:H1",
 * "open:A.x B.y" (los extremos del cable en orden alfabético).
 * @param {InjectedFault} f
 */
export function faultKey(f) {
  if (f.kind === "open") return `open:${wireKey(f.wire)}`;
  return `${f.kind}:${f.device}`;
}

/** Cable por sus extremos ("PS1.+V1 KM1.13"), sin importar el orden. */
function wireKey(w) {
  const ends = String(w).trim().split(/\s+/);
  if (ends.length !== 2) throw new Error(`cable "${w}": se esperan sus dos extremos separados por un espacio`);
  return ends.sort().join(" ");
}

/** Parámetros con sus valores por defecto, validados contra la definición. */
export function resolveParams(def, given = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const p of def.parameters ?? []) {
    const v = p.id in given ? given[p.id] : p.default;
    if (p.type === "enum" && !p.options.includes(v)) {
      throw new Error(`${def.type}: parámetro ${p.id}=${JSON.stringify(v)} fuera de ${JSON.stringify(p.options)}`);
    }
    if (p.type === "number" && !Number.isFinite(Number(v))) throw new Error(`${def.type}: parámetro ${p.id} no es un número`);
    out[p.id] = p.type === "number" ? Number(v) : p.type === "boolean" ? !!v : v;
  }
  for (const k of Object.keys(given)) if (!(k in out)) out[k] = given[k];
  return out;
}

/** Valor de una salida (número, booleano o segmento lineal) en t. */
function valueAt(v, t0, t) {
  if (v && typeof v === "object") return v.value + (v.rate * Number(t - t0)) / 1e9;
  return Number(v ?? 0);
}

/** Intervalo [desde, hasta] (ns, bigint) en que un segmento está dentro de [min, max]. */
function rangeWindow(seg, t0, min, max) {
  const a = t0 + BigInt(Math.ceil(((min - seg.value) / seg.rate) * 1e9));
  const b = t0 + BigInt(Math.ceil(((max - seg.value) / seg.rate) * 1e9));
  const lo = a < b ? a : b;
  const hi = (a < b ? b : a) - 1n;
  return { lo, hi };
}

function stable(v) {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
}

export class Scene {
  /** @type {Map<string, any>} */
  devices = new Map();
  /** @type {[string, string][]} */
  wires = [];
  /** @type {Set<string>} */
  wired = new Set();
  /** @type {Set<string>} fuentes disparadas (se rearman con rearm()) */
  tripped = new Set();
  /** @type {Set<string>} cargas quemadas por sobretensión */
  damaged = new Set();
  /** @type {Record<string, number>} señales de la placa (Q0_x) */
  signals = {};
  /** @type {SceneEvent[]} */
  events = [];
  /** @type {import("./netlist.mjs").Finding[]} */
  warnings = [];
  /** @type {import("./netlist.mjs").Finding[]} */
  findings = [];
  /** @type {Map<string, InjectedFault & { latched?: Record<string, boolean> }>} fallas inyectadas (G9) */
  injected = new Map();
  t = 0n;
  #sent = {};
  /** @type {ReturnType<typeof solve> | null} */
  #sol = null;

  /**
   * @param {SceneSpec} spec
   * @param {{ registry?: Registry }} [opts]
   */
  constructor(spec, opts = {}) {
    const registry = opts.registry ?? new Registry();
    spec = migrateScene(spec);
    this.spec = spec;
    for (const d of spec.devices ?? []) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(d.id)) throw new Error(`identificador de dispositivo inválido: ${d.id}`);
      if (this.devices.has(d.id)) throw new Error(`identificador repetido: ${d.id}`);
      const def = registry.get(d.type, d.version);
      const params = resolveParams(def, d.params);
      const el = def.electrical?.(params) ?? {};
      const inst = def.create({ id: d.id, params });
      this.devices.set(d.id, {
        id: d.id,
        def,
        params,
        el,
        inst,
        terms: new Set(def.terminals.map((x) => x.id)),
        links: def.links?.(params) ?? [],
        reads: (def.reads?.(params) ?? []).filter((r) => r.source),
        modbus: def.modbus?.(params) ?? null,
        actions: {},
        wired: new Set(),
        step: /** @type {DeviceStep} */ ({}),
        stepT: 0n,
        sig: "",
        out: {},
      });
    }
    for (const w of spec.wiring ?? []) {
      const ends = [w.from, w.to].map((e) => this.#terminal(e));
      this.wires.push([ends[0], ends[1]]);
      for (const e of ends) {
        this.wired.add(e);
        const i = e.indexOf(".");
        this.devices.get(e.slice(0, i)).wired.add(e.slice(i + 1));
      }
    }
    for (const dev of this.devices.values()) {
      for (const l of [...dev.links, ...dev.reads]) {
        const i = l.source.indexOf(".");
        if (i < 0 || !this.devices.has(l.source.slice(0, i))) throw new Error(`${dev.id}: enlace a "${l.source}" inexistente`);
      }
    }
    // Una carga se analiza si tiene cableado algún borne propio: un común
    // compartido (M1 de las entradas) no cuenta, así las entradas sin usar
    // no avisan.
    const own = new Set();
    for (const dev of this.devices.values()) {
      const uses = new Map();
      for (const l of dev.el.loads ?? []) for (const x of [l.a, l.b]) uses.set(x, (uses.get(x) ?? 0) + 1);
      for (const l of dev.el.loads ?? []) {
        if ([l.a, l.b].some((x) => uses.get(x) === 1 && dev.wired.has(x))) own.add(`${dev.id}.${l.id}`);
      }
    }
    this.findings = analyze(this.#netlist(true), this.wired, (l) => !own.has(l.id));
    this.evaluate(0n);
  }

  #terminal(end) {
    const i = String(end).indexOf(".");
    const dev = i > 0 ? this.devices.get(end.slice(0, i)) : undefined;
    if (!dev) throw new Error(`cableado: dispositivo inexistente en "${end}"`);
    if (!dev.terms.has(end.slice(i + 1))) {
      throw new Error(`cableado: ${dev.id} (${dev.def.name}) no tiene el borne "${end.slice(i + 1)}"`);
    }
    return end;
  }

  /** Netlist global con los contactos cerrados (o todos, para el análisis estático). */
  #netlist(allContacts = false) {
    /** @type {import("./netlist.mjs").Source[]} */
    const sources = [];
    /** @type {import("./netlist.mjs").Load[]} */
    const loads = [];
    /** @type {import("./netlist.mjs").Switch[]} */
    const switches = [];
    for (const dev of this.devices.values()) {
      const g = (term) => `${dev.id}.${term}`;
      for (const s of dev.el.sources ?? []) {
        sources.push({ ...s, id: s.id ? `${dev.id}.${s.id}` : dev.id, pos: g(s.pos), neg: g(s.neg) });
      }
      const burnt = !allContacts && this.injected.has(`burnt:${dev.id}`);
      for (const l of dev.el.loads ?? []) {
        const id = `${dev.id}.${l.id}`;
        if (!allContacts && (this.damaged.has(id) || burnt)) continue;
        loads.push({ ...l, id, a: g(l.a), b: g(l.b) });
      }
      for (const [cid, [a, b]] of Object.entries(dev.el.contacts ?? {})) {
        if (allContacts || dev.step.contacts?.[cid]) switches.push({ a: g(a), b: g(b) });
      }
    }
    const wires = allContacts ? this.wires : this.wires.filter(([a, b]) => !this.injected.has(`open:${[a, b].sort().join(" ")}`));
    return { wires, sources, loads, switches };
  }

  #linkValue(link, t) {
    const i = link.source.indexOf(".");
    const src = this.devices.get(link.source.slice(0, i));
    const seg = src.step.outputs?.[link.source.slice(i + 1)];
    if (seg && typeof seg === "object" && seg.rate) {
      const w = rangeWindow(seg, src.stepT, link.min, link.max);
      return t >= w.lo && t <= w.hi;
    }
    const v = valueAt(seg, src.stepT, t);
    return v >= link.min && v <= link.max;
  }

  /** Valor numérico de la salida de otro dispositivo en t (booleanos como 0/1). */
  #readValue(source, t) {
    const i = source.indexOf(".");
    const src = this.devices.get(source.slice(0, i));
    const v = src.step.outputs?.[source.slice(i + 1)];
    return typeof v === "boolean" ? (v ? 1 : 0) : valueAt(v, src.stepT, t);
  }

  /** Evalúa la escena en t hasta el punto fijo. */
  evaluate(t) {
    this.t = t;
    let sol;
    for (let iter = 0; ; iter++) {
      if (iter >= MAX_ITER) {
        this.#log({ t, kind: "fault", type: "oscillation", message: "Oscilación: la escena no se estabiliza en el mismo instante (¿un relé que se corta a sí mismo sin retardo?)" });
        break;
      }
      sol = solve(this.#netlist(), this.tripped);
      for (const f of sol.faults) {
        if (f.type === "overvoltage") this.damaged.add(f.load);
        this.#log({ t, kind: "fault", type: f.type, device: (f.load ?? f.source ?? "").split(".")[0], message: f.message });
      }
      this.tripped = sol.tripped;
      let changed = false;
      for (const dev of this.devices.values()) {
        /** @type {Record<string, any>} */
        const loads = {};
        const burnt = this.injected.has(`burnt:${dev.id}`);
        for (const l of dev.el.loads ?? []) {
          const id = `${dev.id}.${l.id}`;
          loads[l.id] = this.damaged.has(id) || burnt
            ? { on: false, polarity: 0, source: null, volts: 0, kind: null, issue: "damaged" }
            : sol.loads.get(id);
        }
        /** @type {Record<string, boolean>} */
        const links = {};
        for (const l of dev.links) links[l.id] = this.#linkValue(l, t);
        /** @type {Record<string, number>} */
        const values = {};
        for (const r of dev.reads) values[r.id] = this.#readValue(r.source, t);
        // Pegado (sensor, final de carrera, pulsador): se comporta como
        // accionado (value = true) o en reposo, haga lo que haga el usuario o
        // el enlace mecánico.
        let actions = dev.actions;
        const stuck = /** @type {{ value?: boolean } | undefined} */ (this.injected.get(`stuck:${dev.id}`));
        if (stuck) {
          const on = stuck.value !== false;
          actions = { ...dev.actions };
          for (const a of dev.def.actions ?? []) {
            if (a.kind === "momentary" || a.kind === "toggle") actions[a.id] = on;
            else if (a.kind === "value") actions[a.id] = on ? a.min ?? 0 : a.max ?? 0;
          }
          for (const k of Object.keys(links)) links[k] = on;
        }
        /** @type {Record<string, number>} */
        const signals = {};
        for (const s of dev.def.signals?.in ?? []) signals[s] = this.signals[s] ? 1 : 0;
        const tripped = (dev.el.sources ?? []).some((s) => this.tripped.has(s.id ? `${dev.id}.${s.id}` : dev.id));
        const step = dev.inst.update(t, { loads, links, values, actions, signals, wired: dev.wired, tripped }) ?? {};
        // Soldado (relé, contactor): los contactos se pegan en la primera
        // vez que cierra y ya no abren aunque la bobina caiga.
        const welded = this.injected.get(`welded:${dev.id}`);
        if (welded) {
          if (!welded.latched && step.outputs?.closed) welded.latched = { ...(step.contacts ?? {}) };
          if (welded.latched) {
            // El indicador mecánico sigue a los contactos, no a la bobina.
            step.contacts = { ...welded.latched };
            step.outputs = { ...step.outputs, closed: true };
          }
        }
        const sig = stable([step.contacts ?? {}, step.outputs ?? {}]);
        if (sig !== dev.sig) changed = true;
        dev.sig = sig;
        dev.step = step;
        dev.stepT = t;
      }
      if (!changed) break;
    }
    this.warnings = sol.warnings;
    this.#sol = sol;
    // Cambios de salidas (booleanas y numéricas, no los segmentos en movimiento).
    for (const dev of this.devices.values()) {
      for (const [k, v] of Object.entries(dev.step.outputs ?? {})) {
        if (v !== null && typeof v === "object") continue;
        if (dev.out[k] !== v) {
          if (k in dev.out || v) this.#log({ t, kind: "output", device: dev.id, key: k, value: v });
          dev.out[k] = v;
        }
      }
    }
  }

  #log(e) {
    if (this.events.length < MAX_EVENTS) this.events.push(e);
  }

  /** Próximo evento propio de la escena después de this.t (o undefined). */
  nextEvent() {
    /** @type {bigint | undefined} */
    let n;
    const consider = (x) => {
      if (x !== undefined && x > this.t && (n === undefined || x < n)) n = x;
    };
    for (const dev of this.devices.values()) {
      consider(dev.step.nextEventNs);
      for (const l of dev.links) {
        const i = l.source.indexOf(".");
        const src = this.devices.get(l.source.slice(0, i));
        const seg = src.step.outputs?.[l.source.slice(i + 1)];
        if (seg && typeof seg === "object" && seg.rate) {
          const w = rangeWindow(seg, src.stepT, l.min, l.max);
          consider(w.lo);
          consider(w.hi + 1n);
        }
      }
    }
    return n;
  }

  /** Procesa los eventos propios hasta t inclusive. */
  advanceTo(t) {
    for (let n = this.nextEvent(); n !== undefined && n <= t; n = this.nextEvent()) this.evaluate(n);
    if (t > this.t) this.t = t;
  }

  /** Salidas de la placa (Q0_x) informadas por el runner en t. */
  setSignals(changes, t) {
    if (t < this.t) t = this.t;  // nunca hacia atrás
    this.advanceTo(t);
    for (const [k, v] of Object.entries(changes)) {
      if (!!this.signals[k] !== !!v) this.#log({ t, kind: "signal", key: k, value: v ? 1 : 0 });
      this.signals[k] = v ? 1 : 0;
    }
    this.evaluate(t);
  }

  /** Acción del usuario sobre un dispositivo (pulsar, girar un selector). */
  act(id, action, value, t) {
    if (t < this.t) t = this.t;  // nunca hacia atrás
    const dev = this.devices.get(id);
    if (!dev) throw new Error(`dispositivo inexistente: ${id}`);
    if (!(dev.def.actions ?? []).some((a) => a.id === action)) throw new Error(`${id} no tiene la acción "${action}"`);
    this.advanceTo(t);
    dev.actions[action] = value;
    this.#log({ t, kind: "action", device: id, key: action, value });
    this.evaluate(t);
  }

  /**
   * Inyecta una falla (G9): sensor o mando pegado, relé soldado, carga
   * quemada (bobina o lámpara abierta) o cable cortado. Queda hasta clearFault.
   * @param {InjectedFault} fault
   * @param {bigint} t
   * @returns {string} su clave
   */
  inject(fault, t) {
    if (t < this.t) t = this.t;  // nunca hacia atrás
    const key = faultKey(fault);
    if (fault.kind === "open") {
      const k = wireKey(fault.wire);
      if (!this.wires.some(([a, b]) => [a, b].sort().join(" ") === k)) throw new Error(`no hay un cable entre ${k.replace(" ", " y ")}`);
    } else {
      const dev = this.devices.get(fault.device);
      if (!dev) throw new Error(`dispositivo inexistente: ${fault.device}`);
      const kinds = ["stuck", "welded", "burnt"];
      if (!kinds.includes(fault.kind)) throw new Error(`falla desconocida: ${fault.kind} (stuck, welded, burnt u open)`);
      if (fault.kind === "stuck" && !(dev.def.actions ?? []).some((a) => a.kind !== "select") && !dev.links.length)
        throw new Error(`${dev.id} no tiene accionamiento que se pueda pegar`);
      if (fault.kind === "welded" && !("closed" in (dev.step.outputs ?? {}))) throw new Error(`${dev.id} no tiene contactos que se puedan soldar`);
      if (fault.kind === "burnt" && !(dev.el.loads ?? []).length) throw new Error(`${dev.id} no tiene una carga que se pueda quemar`);
    }
    this.advanceTo(t);
    this.injected.set(key, { ...fault });
    this.#log({ t, kind: "inject", type: fault.kind, device: "device" in fault ? fault.device : undefined, key, value: "value" in fault ? fault.value : undefined });
    this.evaluate(t);
    return key;
  }

  /**
   * Quita una falla inyectada (por su clave o la misma falla).
   * @param {string | InjectedFault} which
   * @param {bigint} t
   */
  clearFault(which, t) {
    if (t < this.t) t = this.t;
    const key = typeof which === "string" ? which : faultKey(which);
    if (!this.injected.has(key)) return;
    this.advanceTo(t);
    this.injected.delete(key);
    this.#log({ t, kind: "clear", key });
    this.evaluate(t);
  }

  /** ¿Hay esclavos Modbus en la escena? (la co-simulación enlaza el bus RS-485) */
  hasModbus() {
    return [...this.devices.values()].some((d) => d.modbus);
  }

  /**
   * Petición Modbus RTU del PLC por el bus RS-485 en t (G9, emulación de
   * planta). Responde el esclavo con esa dirección que esté cableado a
   * plc.RS485_A/B (A con A, B con B, sin cables cortados), con la misma
   * velocidad y que no esté sin alimentación. Devuelve los bytes de la
   * respuesta (con CRC) y la demora, o null si nadie responde.
   * @param {number[]} frame trama completa con CRC
   * @param {{ t: bigint, baud: number }} o
   */
  modbusRequest(frame, o) {
    if (frame.length < 4 || crc16(frame.slice(0, -2)) !== (frame.at(-2) | (frame.at(-1) << 8))) return null;
    this.advanceTo(o.t);
    const addr = frame[0];
    const fn = frame[1];
    const net = this.#rs485Net();
    const slaves = [...this.devices.values()].filter(
      (d) =>
        d.modbus && (addr === 0 || d.modbus.address === addr) && Math.abs(d.modbus.baud - o.baud) / d.modbus.baud < 0.03 &&
        net.find(`${d.id}.A`) === net.find("A") && net.find(`${d.id}.B`) === net.find("B") && !this.injected.has(`burnt:${d.id}`),
    );
    if (!slaves.length) return null;
    const u16 = (k) => (frame[k] << 8) | frame[k + 1];
    const reply = (dev, pdu) => {
      const body = [addr, ...pdu];
      const c = crc16(body);
      return { bytes: [...body, c & 0xff, c >> 8], delayNs: BigInt(Math.round((dev.modbus.responseMs ?? 5) * 1e6)) };
    };
    const exc = (dev, code) => reply(dev, [fn | 0x80, code]);
    let out = null;
    for (const dev of slaves) {
      let r = null;
      // Escritura de registros: sin modbusWrite, función no admitida (01).
      const write = (start, vals, echo) => {
        if (!dev.inst.modbusWrite) return exc(dev, 1);
        const ok = dev.inst.modbusWrite(start, vals, o.t);
        return ok === undefined ? undefined : ok ? reply(dev, echo) : exc(dev, 2);
      };
      if ((fn === 3 || fn === 4) && frame.length === 8) {
        const count = u16(4);
        if (!dev.inst.modbusRead) r = exc(dev, 1);
        else if (count < 1 || count > 125) r = exc(dev, 3);
        else {
          const regs = dev.inst.modbusRead(fn === 3 ? "holding" : "input", u16(2), count, o.t);
          if (regs === undefined) continue;  // sin alimentación: no responde
          r = regs === null ? exc(dev, 2) : reply(dev, [fn, count * 2, ...regs.flatMap((v) => [(v >> 8) & 0xff, v & 0xff])]);
        }
      } else if (fn === 6 && frame.length === 8) {
        r = write(u16(2), [u16(4)], frame.slice(1, 6));
        if (r === undefined) continue;
      } else if (fn === 16 && frame.length >= 9 && frame.length === 9 + frame[6]) {
        r = write(u16(2), Array.from({ length: u16(4) }, (_, k) => u16(7 + 2 * k)), frame.slice(1, 6));
        if (r === undefined) continue;
      } else {
        r = exc(dev, 1);
      }
      if (addr === 0) continue;  // difusión: se aplica y nadie responde
      if (out) {
        this.#log({ t: o.t, kind: "fault", type: "modbus-collision", device: dev.id, message: `Dos esclavos responden con la dirección ${addr} en el bus RS-485` });
        return null;
      }
      out = r;
    }
    // La escritura pudo cambiar el estado de un dispositivo.
    if (fn === 6 || fn === 16) this.evaluate(o.t);
    return out;
  }

  /** Conexiones del bus RS-485: unión de bornes por los cables activos ("A"/"B" = bornes de la placa). */
  #rs485Net() {
    const parent = new Map();
    const find = (x) => {
      while (parent.has(x) && parent.get(x) !== x) x = parent.get(x);
      return x;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    const plc = [...this.devices.values()].find((d) => d.def.type === "jwsim/jwplc-basic");
    for (const [a, b] of this.wires) if (!this.injected.has(`open:${[a, b].sort().join(" ")}`)) union(a, b);
    if (plc) {
      union("A", `${plc.id}.RS485_A`);
      union("B", `${plc.id}.RS485_B`);
    }
    return { find };
  }

  /** Rearma las fuentes disparadas y repone las cargas quemadas. */
  rearm(t) {
    if (t < this.t) t = this.t;  // nunca hacia atrás
    this.advanceTo(t);
    this.tripped = new Set();
    this.damaged = new Set();
    this.#log({ t, kind: "rearm" });
    this.evaluate(t);
  }

  /** Entradas que la escena maneja en la placa (I0_x cableadas). */
  boardInputs() {
    /** @type {Record<string, number>} */
    const out = {};
    for (const dev of this.devices.values()) {
      for (const s of dev.def.signals?.out ?? []) {
        const v = dev.step.outputs?.[s];
        if (v !== undefined) out[s] = v ? 1 : 0;
      }
    }
    return out;
  }

  /** Entradas de la placa que cambiaron desde la última llamada. */
  takeInputChanges() {
    const now = this.boardInputs();
    /** @type {Record<string, number>} */
    const diff = {};
    for (const [k, v] of Object.entries(now)) if (this.#sent[k] !== v) diff[k] = v;
    this.#sent = now;
    return diff;
  }

  /** Estado observable (UI, pruebas, informe). */
  snapshot() {
    const devices = [...this.devices.values()].map((dev) => {
      /** @type {Record<string, unknown>} */
      const outputs = {};
      for (const [k, v] of Object.entries(dev.step.outputs ?? {})) {
        outputs[k] = v && typeof v === "object" ? valueAt(v, dev.stepT, this.t) : v;
      }
      return {
        id: dev.id,
        type: dev.def.type,
        outputs,
        contacts: { ...(dev.step.contacts ?? {}) },
        actions: { ...dev.actions },
        damaged: (dev.el.loads ?? []).filter((l) => this.damaged.has(`${dev.id}.${l.id}`)).map((l) => l.id),
        tripped: (dev.el.sources ?? []).some((s) => this.tripped.has(s.id ? `${dev.id}.${s.id}` : dev.id)),
        injected: ["stuck", "welded", "burnt"].filter((k) => this.injected.has(`${k}:${dev.id}`)),
      };
    });
    // Polos de alimentación de cada borne cableado ("PS1+", "L1-"): la
    // interfaz colorea los cables con tensión.
    /** @type {Record<string, string[]>} */
    const poles = {};
    if (this.#sol) for (const term of this.wired) poles[term] = this.#sol.poles(term);
    return {
      t: this.t,
      devices,
      poles,
      inputs: this.boardInputs(),
      warnings: this.warnings,
      findings: this.findings,
      faults: this.events.filter((e) => e.kind === "fault"),
      injected: [...this.injected.entries()].map(([key, f]) => ({ key, ...f, latched: undefined })),
    };
  }

  /** Salida de un dispositivo en el instante actual (para pruebas). */
  output(id, key) {
    const dev = this.devices.get(id);
    if (!dev) throw new Error(`dispositivo inexistente: ${id}`);
    const v = dev.step.outputs?.[key];
    return v && typeof v === "object" ? valueAt(v, dev.stepT, this.t) : v;
  }

  contact(id, cid) {
    return !!this.devices.get(id)?.step.contacts?.[cid];
  }
}
