// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Banco de prueba del editor de componentes: corre el componente solo, sin
// escena, con las entradas que el autor mueve en el panel «Probar» (bornes
// energizados, señales analógicas, lecturas y controles) y lee sus salidas
// y registros Modbus. Mismo intérprete que la escena (scene/component.mjs).
import { buildComponent } from "../../scene/component.mjs";

const nsOf = (msv) => BigInt(Math.round(msv * 1e6));

export class ComponentBench {
  /** @param {any} spec */
  constructor(spec) {
    this.def = buildComponent(spec);
    this.spec = spec;
    this.params = Object.fromEntries((this.def.parameters ?? []).map((p) => [p.id, p.default]));
    this.inst = this.def.create({ id: "C", params: this.params });
    this.t = 0n;
    this.last = null;
  }

  /** Entradas del panel → DeviceInputs. */
  #inputs(i = {}) {
    const loads = {};
    const on = (x) => ({ on: !!x, polarity: x ? 1 : 0, source: x ? "banco" : null, volts: x ? 24 : 0, kind: x ? "DC" : null });
    loads.__power = on(i.power ?? true);
    for (const e of this.spec.io ?? []) if (e.kind === "digital-in") loads[e.var] = on(i.digital?.[e.var]);
    const values = {};
    for (const e of this.spec.io ?? []) {
      if (e.kind === "analog-in") values[e.var] = i.analog?.[e.var] === null || i.analog?.[e.var] === undefined ? NaN : Number(i.analog[e.var]);
      if (e.kind === "read") values[e.var] = Number(i.reads?.[e.var] ?? 0);
    }
    return { loads, links: {}, values, actions: { ...(i.actions ?? {}) }, signals: {}, wired: new Set(), tripped: false };
  }

  /** Avanza dtMs de tiempo virtual (pasando por cada evento propio) y devuelve el estado. */
  advance(dtMs, inputs) {
    const inp = this.#inputs(inputs);
    const target = this.t + nsOf(Math.max(0, dtMs));
    let st = this.inst.update(this.t, inp) ?? {};
    for (let guard = 0; guard < 100000; guard++) {
      const n = st.nextEventNs;
      if (n === undefined || n > target || n <= this.t) break;
      this.t = n;
      st = this.inst.update(n, inp) ?? {};
    }
    this.t = target;
    st = this.inst.update(target, inp) ?? {};
    this.last = st;
    return this.state();
  }

  state() {
    const st = this.last ?? {};
    const outputs = {};
    for (const [k, v] of Object.entries(st.outputs ?? {})) outputs[k] = v && typeof v === "object" ? v.value : v;
    const regs = [];
    const m = this.spec.modbus;
    if (m) {
      for (const table of ["holding", "input"]) {
        for (const r of m[table] ?? []) {
          const n = r.type === "int32" || r.type === "float32" ? 2 : 1;
          const words = this.inst.modbusRead?.(table, r.reg, n, this.t);
          regs.push({ table, reg: r.reg, var: r.var, type: r.type ?? "int16", write: !!r.write, words: words ?? null });
        }
      }
      for (const table of ["coils", "discrete"]) {
        for (const r of m[table] ?? []) {
          const bits = this.inst.modbusReadBits?.(table, r.bit, 1, this.t);
          regs.push({ table, reg: r.bit, var: r.var, type: "bit", write: !!r.write, words: bits ?? null });
        }
      }
    }
    return { tMs: Number(this.t) / 1e6, outputs, contacts: st.contacts ?? {}, regs };
  }

  /** Escritura Modbus del panel (valor de ingeniería): FC06/FC16 o FC05. */
  write(table, reg, value) {
    const m = this.spec.modbus ?? {};
    if (table === "coils") return this.inst.modbusWriteBits?.(reg, [Number(value) ? 1 : 0], this.t);
    const r = (m.holding ?? []).find((x) => x.reg === reg);
    if (!r) return false;
    const raw = Number(value) * Number(r.scale ?? 1);
    const dv = new DataView(new ArrayBuffer(4));
    let words;
    if (r.type === "float32" || r.type === "int32") {
      if (r.type === "float32") dv.setFloat32(0, raw);
      else dv.setInt32(0, Math.round(raw));
      words = r.swap ? [dv.getUint16(2), dv.getUint16(0)] : [dv.getUint16(0), dv.getUint16(2)];
    } else words = [Math.round(raw) & 0xffff];
    return this.inst.modbusWrite?.(reg, words, this.t);
  }
}
