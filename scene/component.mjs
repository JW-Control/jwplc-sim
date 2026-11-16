// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Componentes declarativos (.jwcomp): un componente hecho en el editor
// visual es solo datos (component.json + symbol.svg). Este intérprete los
// convierte en una definición normal del SDK (sdk/jwsim-device.d.ts), así
// que el motor de escena, las pruebas y la grabación no cambian. No ejecuta
// código del autor: las expresiones pasan por scene/expr.mjs.
//
// Formato (docs/COMPONENTES.md):
//   { "format": "jwcomp/1", "type": "autor/nombre", "version": "1.0.0", "name": "...",
//     "category": "...", "description": "...", "stepMs": 100,
//     "parameters": [ParameterSpec],          lo que se ajusta en Propiedades; un número de un
//                                             bloque puede ser el id de un parámetro ("tau")
//     "vars": { "consigna": 25 },             variables de estado (las escriben Modbus o un control)
//     "io": [ ... ],                          E/S: power, digital-in, digital-out, analog-in,
//                                             analog-out, read, control
//     "blocks": [ ... ],                      modelo: tf, integrator, expr, table, compare, limit, timer
//     "modbus": { "address": 1, "baud": 9600, "holding": [...], "input": [...], "coils": [...], "discrete": [...] } }
import { MODELS, linearModel, stepModel } from "./lti.mjs";
import { compileExpr } from "./expr.mjs";

export const FORMAT = "jwcomp/1";
export const IO_KINDS = ["power", "digital-in", "digital-out", "analog-in", "analog-out", "read", "control"];
export const BLOCK_KINDS = ["tf", "integrator", "expr", "table", "compare", "limit", "timer"];
export const SIGNALS = ["0-10V", "4-20mA", "pt100"];
export const BAUDS = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
export const REG_TYPES = ["int16", "uint16", "int32", "float32"];
const DYNAMIC = new Set(["tf", "integrator"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TERM = /^[A-Za-z0-9+\-_.]{1,12}$/;

const MS = 1_000_000n;
/** @param {number} v */
const nsOf = (v) => BigInt(Math.round(v * 1e6));

/** Bornes de una E/S (en orden). */
function ioTerminals(io) {
  if (Array.isArray(io.terminals)) return io.terminals.map(String);
  return [io.a, io.b].filter((x) => x !== undefined && x !== "").map(String);
}
const ioTerminalCount = (io) => (io.kind === "read" || io.kind === "control" ? 0 : io.signal === "pt100" ? 3 : 2);

/** Bloques que no dependen del instante (todo menos tf/integrator); su orden de cálculo. */
function blockInputs(b) {
  switch (b.block) {
    case "expr":
      return compileExpr(b.expr).vars;
    case "tf":
    case "integrator":
    case "table":
    case "compare":
    case "limit":
    case "timer":
      return [b.in];
    default:
      return [];
  }
}

/**
 * Valida el componente y lo deja listo para el intérprete. Lanza con todos
 * los errores juntos; los avisos van en `warnings`.
 * @param {any} spec
 */
export function checkComponent(spec) {
  const errors = [];
  const warnings = [];
  const s = spec ?? {};
  if (s.format !== undefined && s.format !== FORMAT) errors.push(`'format' debe ser "${FORMAT}" (tiene "${s.format}")`);
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(s.type ?? "")) errors.push("'type' debe ser autor/nombre en minúsculas (p. ej. utec/tanque-nft)");
  if (/^jwsim\//.test(s.type ?? "")) errors.push("el autor «jwsim» es de la biblioteca incluida");
  if (!/^\d+\.\d+\.\d+$/.test(s.version ?? "")) errors.push("'version' debe ser x.y.z");
  if (!s.name) errors.push("falta 'name'");
  const params = Array.isArray(s.parameters) ? s.parameters : [];
  const paramIds = new Set();
  for (const p of params) {
    if (!NAME.test(p?.id ?? "")) errors.push(`parámetro «${p?.id}»: el id debe ser una palabra (letras, números y _)`);
    else if (paramIds.has(p.id)) errors.push(`parámetro «${p.id}» repetido`);
    paramIds.add(p?.id);
    if (!["number", "string", "boolean", "enum"].includes(p?.type)) errors.push(`parámetro «${p?.id}»: tipo «${p?.type}» desconocido`);
  }
  /** Número literal o id de un parámetro. */
  const numRef = (v, what) => {
    if (v === undefined || v === null || v === "") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) errors.push(`${what}: no es un número`);
      return;
    }
    if (typeof v === "string" && Number.isFinite(Number(v))) return;
    if (typeof v === "string" && paramIds.has(v)) return;
    errors.push(`${what}: «${v}» no es un número ni un parámetro`);
  };
  /** @type {Map<string, string>} variable → quién la produce */
  const producers = new Map();
  const produce = (v, who) => {
    if (!NAME.test(v ?? "")) {
      errors.push(`${who}: la variable «${v}» debe ser una palabra (letras, números y _)`);
      return;
    }
    if (paramIds.has(v)) errors.push(`${who}: «${v}» ya es un parámetro`);
    if (producers.has(v)) errors.push(`${who}: la variable «${v}» ya la produce ${producers.get(v)}`);
    producers.set(v, who);
  };
  const vars = s.vars && typeof s.vars === "object" ? s.vars : {};
  for (const [k, v] of Object.entries(vars)) {
    produce(k, `la variable de estado «${k}»`);
    numRef(v, `variable «${k}» (valor inicial)`);
  }
  const terms = new Map();
  const useTerm = (t, who) => {
    if (!TERM.test(t)) errors.push(`${who}: borne «${t}» no válido (hasta 12 letras, números, + - _ .)`);
    if (terms.has(t)) errors.push(`${who}: el borne «${t}» ya lo usa ${terms.get(t)}`);
    terms.set(t, who);
  };
  const io = Array.isArray(s.io) ? s.io : [];
  let powerCount = 0;
  io.forEach((e, i) => {
    const who = `E/S ${i + 1} (${e?.kind})`;
    if (!IO_KINDS.includes(e?.kind)) {
      errors.push(`E/S ${i + 1}: tipo «${e?.kind}» desconocido (hay: ${IO_KINDS.join(", ")})`);
      return;
    }
    if (e.kind === "power") powerCount++;
    const ts = ioTerminals(e);
    const want = ioTerminalCount(e);
    if (ts.length !== want) errors.push(`${who}: necesita ${want} bornes (tiene ${ts.length})`);
    for (const t of ts) useTerm(t, who);
    if (e.kind === "power") {
      if (e.var) produce(e.var, who);
    } else if (["digital-in", "analog-in", "read", "control"].includes(e.kind)) produce(e.var, who);
    if (["digital-in", "power"].includes(e.kind) && !/^\d+(\.\d+)?V(DC|AC)$/.test(e.rating ?? "24VDC")) errors.push(`${who}: tensión «${e.rating}» no válida (24VDC, 230VAC…)`);
    if (["analog-in", "analog-out"].includes(e.kind)) {
      if (!SIGNALS.includes(e.signal)) errors.push(`${who}: señal «${e.signal}» desconocida (hay: ${SIGNALS.join(", ")})`);
      if (e.signal !== "pt100") {
        numRef(e.min ?? 0, `${who}: mínimo`);
        numRef(e.max ?? 100, `${who}: máximo`);
      }
    }
    if (e.kind === "read" && !e.source && !e.sourceParam) errors.push(`${who}: falta 'source' (equipo.salida) o 'sourceParam'`);
    if (e.kind === "read" && e.sourceParam && !paramIds.has(e.sourceParam)) errors.push(`${who}: el parámetro «${e.sourceParam}» no existe`);
    if (e.kind === "control" && !["button", "switch", "slider"].includes(e.control)) errors.push(`${who}: control «${e.control}» desconocido (button, switch, slider)`);
  });
  if (powerCount > 1) errors.push("solo puede haber una alimentación (power)");
  const blocks = Array.isArray(s.blocks) ? s.blocks : [];
  blocks.forEach((b, i) => {
    const who = `bloque ${i + 1} (${b?.block})`;
    if (!BLOCK_KINDS.includes(b?.block)) {
      errors.push(`bloque ${i + 1}: tipo «${b?.block}» desconocido (hay: ${BLOCK_KINDS.join(", ")})`);
      return;
    }
    produce(b.out, who);
    try {
      blockInputs(b);
    } catch (err) {
      errors.push(`${who}: ${err.message}`);
    }
    if (b.block === "tf") {
      const model = b.model ?? MODELS[0];
      if (!MODELS.includes(model)) errors.push(`${who}: modelo «${model}» desconocido (hay: ${MODELS.join(", ")})`);
      for (const k of ["K", "tau1", "tau2", "tau3", "tau4", "wn", "zeta", "theta", "y0"]) numRef(b[k], `${who}: ${k}`);
    }
    if (b.block === "integrator") for (const k of ["gain", "min", "max", "y0"]) numRef(b[k], `${who}: ${k}`);
    if (b.block === "limit") for (const k of ["min", "max"]) numRef(b[k], `${who}: ${k}`);
    if (b.block === "compare") {
      numRef(b.high, `${who}: umbral alto`);
      numRef(b.low ?? b.high, `${who}: umbral bajo`);
      if (b.high === undefined) errors.push(`${who}: falta el umbral 'high'`);
    }
    if (b.block === "timer") {
      if (!["on", "off"].includes(b.mode ?? "on")) errors.push(`${who}: modo «${b.mode}» (on: a la conexión; off: a la desconexión)`);
      numRef(b.ms, `${who}: tiempo`);
    }
    if (b.block === "table") {
      const pts = b.points;
      if (!Array.isArray(pts) || pts.length < 2 || !pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
        errors.push(`${who}: 'points' debe tener al menos 2 pares [x, y]`);
      } else if (pts.some((p, k) => k > 0 && p[0] <= pts[k - 1][0])) errors.push(`${who}: las x de la tabla deben ir en aumento`);
    }
  });
  // Variables que se leen y nadie produce.
  const known = (v) => producers.has(v) || paramIds.has(v);
  const need = (v, who) => {
    if (v === undefined || v === "") errors.push(`${who}: falta la variable de entrada`);
    else if (!known(v)) errors.push(`${who}: la variable «${v}» no existe (nadie la produce)`);
  };
  blocks.forEach((b, i) => {
    if (!BLOCK_KINDS.includes(b?.block)) return;
    try {
      for (const v of blockInputs(b)) need(v, `bloque ${i + 1} (${b.block})`);
    } catch {
      // ya informado
    }
  });
  io.forEach((e, i) => {
    if (e?.kind === "digital-out" || e?.kind === "analog-out") need(e.var, `E/S ${i + 1} (${e.kind})`);
  });
  // Modbus.
  if (s.modbus) {
    const m = s.modbus;
    numRef(m.address ?? 1, "Modbus: dirección");
    const a = String(m.a ?? "A");
    const b = String(m.b ?? "B");
    useTerm(a, "Modbus (A)");
    useTerm(b, "Modbus (B)");
    for (const table of ["holding", "input"]) {
      const used = new Map();
      for (const r of m[table] ?? []) {
        const who = `Modbus ${table} ${r?.reg}`;
        if (!Number.isInteger(r?.reg) || r.reg < 0 || r.reg > 65535) errors.push(`${who}: registro fuera de 0-65535`);
        const type = r.type ?? "int16";
        if (!REG_TYPES.includes(type)) errors.push(`${who}: tipo «${type}» (hay: ${REG_TYPES.join(", ")})`);
        const words = type === "int32" || type === "float32" ? 2 : 1;
        for (let w = 0; w < words; w++) {
          if (used.has(r.reg + w)) errors.push(`${who}: se pisa con el registro ${used.get(r.reg + w)}`);
          used.set(r.reg + w, r.reg);
        }
        need(r.var, who);
        numRef(r.scale ?? 1, `${who}: escala`);
        if (r.write && table === "input") errors.push(`${who}: los input registers son de solo lectura`);
        if (r.write && !(r.var in vars)) errors.push(`${who}: solo se escriben variables de estado (decláralas en 'vars')`);
      }
    }
    for (const table of ["coils", "discrete"]) {
      const used = new Set();
      for (const r of m[table] ?? []) {
        const who = `Modbus ${table} ${r?.bit}`;
        if (!Number.isInteger(r?.bit) || r.bit < 0 || r.bit > 65535) errors.push(`${who}: bit fuera de 0-65535`);
        if (used.has(r.bit)) errors.push(`${who}: repetido`);
        used.add(r.bit);
        need(r.var, who);
        if (r.write && table === "discrete") errors.push(`${who}: las entradas discretas son de solo lectura`);
        if (r.write && !(r.var in vars)) errors.push(`${who}: solo se escriben variables de estado (decláralas en 'vars')`);
      }
    }
  }
  // Ciclos entre bloques sin memoria (tf e integrador cortan el ciclo).
  const order = [];
  if (!errors.length) {
    const algebraic = blocks.filter((b) => !DYNAMIC.has(b.block));
    const byOut = new Map(algebraic.map((b) => [b.out, b]));
    const state = new Map();
    const visit = (b, path) => {
      if (state.get(b) === 2) return;
      if (state.get(b) === 1) {
        errors.push(`ciclo entre bloques sin memoria: ${[...path, b.out].join(" → ")} (agrega una función de transferencia o un integrador en el lazo)`);
        return;
      }
      state.set(b, 1);
      for (const v of blockInputs(b)) {
        const dep = byOut.get(v);
        if (dep) visit(dep, [...path, b.out]);
      }
      state.set(b, 2);
      order.push(b);
    };
    for (const b of algebraic) visit(b, []);
  }
  if (!io.length && !s.modbus) warnings.push("no tiene E/S ni Modbus: no se puede cablear");
  const terminals = [...terms.keys()];
  if (errors.length) {
    const err = new Error(`${s.type ?? "componente"}: ${errors.join("; ")}`);
    /** @type {any} */ (err).errors = errors;
    /** @type {any} */ (err).warnings = warnings;
    throw err;
  }
  return { order, terminals, warnings };
}

/**
 * Definición del SDK a partir del componente (lanza si no es válido).
 * @param {any} spec
 * @returns {import("../sdk/jwsim-device.js").DeviceDefinition & { component: any }}
 */
export function buildComponent(spec) {
  const { order, terminals } = checkComponent(spec);
  const s = spec;
  const io = s.io ?? [];
  const blocks = s.blocks ?? [];
  const dynamic = blocks.filter((b) => DYNAMIC.has(b.block));
  const timers = blocks.filter((b) => b.block === "timer");
  const labels = new Map();
  for (const e of io) {
    const ts = ioTerminals(e);
    ts.forEach((t, k) => labels.set(t, e.labels?.[k] ?? `${e.label ?? e.var ?? e.kind}`));
  }
  if (s.modbus) {
    labels.set(String(s.modbus.a ?? "A"), "RS-485 A (D+)");
    labels.set(String(s.modbus.b ?? "B"), "RS-485 B (D−)");
  }
  // Parámetros: los del autor, más el paso del modelo y la comunicación.
  const parameters = (s.parameters ?? []).map((p) => ({ ...p }));
  const has = (id) => parameters.some((p) => p.id === id);
  if ((dynamic.length || s.stepMs !== undefined) && !has("stepMs")) {
    parameters.push({ id: "stepMs", label: "Paso del modelo (Ts)", type: "number", default: Number(s.stepMs ?? 100), unit: "ms", group: "Modelo" });
  }
  if (s.modbus) {
    const m = s.modbus;
    if (!has("address") && typeof m.address !== "string") parameters.push({ id: "address", label: "Dirección Modbus", type: "number", default: Number(m.address ?? 1), hint: "1 a 247", group: "Comunicación" });
    if (!has("baud") && typeof m.baud !== "string") parameters.push({ id: "baud", label: "Velocidad", type: "enum", options: BAUDS.map(String), default: String(m.baud ?? 9600), hint: "8N1", group: "Comunicación" });
    if (!has("responseMs") && typeof m.responseMs !== "string") parameters.push({ id: "responseMs", label: "Demora de respuesta", type: "number", default: Number(m.responseMs ?? 5), unit: "ms", group: "Comunicación" });
  }
  /** Número literal o valor del parámetro. */
  const num = (v, p, def = 0) => {
    if (v === undefined || v === null || v === "") return def;
    if (typeof v === "number") return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const x = Number(p[v]);
    return Number.isFinite(x) ? x : def;
  };
  const span = (e, p) => [num(e.min, p, 0), num(e.max, p, 100)];
  /** Variable → señal física de una salida analógica. */
  const toSignal = (e, x, p) => {
    if (e.signal === "pt100") return x;
    const [lo, hi] = span(e, p);
    const f = Math.min(1, Math.max(0, hi === lo ? 0 : (x - lo) / (hi - lo)));
    return e.signal === "0-10V" ? 10 * f : 4 + 16 * f;
  };
  /** Señal física de una entrada analógica → variable (NaN: abierta o fuera de rango del lazo). */
  const fromSignal = (e, v, p) => {
    if (!Number.isFinite(v)) return NaN;
    if (e.signal === "pt100") return v;
    const [lo, hi] = span(e, p);
    if (e.signal === "4-20mA" && v < 3.6) return NaN; // lazo abierto o roto (NAMUR NE43)
    const f = e.signal === "0-10V" ? v / 10 : (v - 4) / 16;
    return lo + (hi - lo) * f;
  };
  const aoName = (e) => `ao_${e.var}`;
  const power = io.find((e) => e.kind === "power");

  /** @type {import("../sdk/jwsim-device.js").DeviceDefinition & { component: any }} */
  const def = {
    type: s.type,
    version: s.version,
    name: s.name,
    category: s.category ?? "Componentes propios",
    description: s.description ?? "",
    parameters,
    terminals: terminals.map((id) => ({ id, label: labels.get(id) ?? id })),
    actions: io
      .filter((e) => e.kind === "control")
      .map((e) =>
        e.control === "slider"
          ? { id: e.var, label: e.label ?? e.var, kind: "value", min: Number(e.min ?? 0), max: Number(e.max ?? 100), ...(e.unit ? { unit: e.unit } : {}) }
          : { id: e.var, label: e.label ?? e.var, kind: e.control === "button" ? "momentary" : "toggle" },
      ),
    electrical: (p) => ({
      loads: io
        .filter((e) => e.kind === "power" || e.kind === "digital-in")
        .map((e) => ({ id: e.kind === "power" ? "__power" : e.var, a: ioTerminals(e)[0], b: ioTerminals(e)[1], rating: String(e.rating ?? "24VDC"), ...(String(e.rating ?? "24VDC").endsWith("DC") ? { polar: true } : {}) })),
      contacts: Object.fromEntries(io.filter((e) => e.kind === "digital-out").map((e, k) => [`do${k}_${e.var}`, /** @type {[string, string]} */ (ioTerminals(e))])),
    }),
    probes: () => io.filter((e) => e.kind === "analog-out").map((e) => ({ id: aoName(e), kind: e.signal === "pt100" ? "pt100" : e.signal, terminals: ioTerminals(e), output: aoName(e) })),
    probeInputs: () => io.filter((e) => e.kind === "analog-in").map((e) => ({ id: e.var, kind: e.signal === "pt100" ? "pt100" : e.signal, terminals: ioTerminals(e) })),
    reads: (p) =>
      io
        .filter((e) => e.kind === "read")
        .map((e) => ({ id: e.var, source: String(e.sourceParam ? (p[e.sourceParam] ?? "") : e.source) }))
        .filter((r) => /^[^.]+\.[^.]+$/.test(r.source)),
    ...(s.modbus
      ? {
          modbus: (p) => ({
            address: num(s.modbus.address ?? "address", p, Number(p.address ?? 1)),
            baud: num(s.modbus.baud ?? "baud", p, Number(p.baud ?? 9600)),
            responseMs: num(s.modbus.responseMs ?? "responseMs", p, Number(p.responseMs ?? 5)),
            a: String(s.modbus.a ?? "A"),
            b: String(s.modbus.b ?? "B"),
          }),
        }
      : {}),
    component: s,
    create(ctx) {
      const p = ctx.params;
      const Ts = Math.max(0.001, num(p.stepMs ?? s.stepMs, p, 100) / 1000);
      const STEP = nsOf(Ts * 1000);
      /** Estado de cada bloque dinámico. */
      const dyn = dynamic.map((b) => {
        const y0 = num(b.y0, p, 0);
        if (b.block === "integrator") return { b, y: y0, u: 0 };
        const model = b.model ?? MODELS[0];
        const m = linearModel(
          {
            order: model === MODELS[4] ? "osc" : MODELS.indexOf(model) + 1,
            K: num(b.K, p, 1),
            tau: [num(b.tau1, p, 1), num(b.tau2, p, num(b.tau1, p, 1)), num(b.tau3, p, num(b.tau1, p, 1)), num(b.tau4, p, num(b.tau1, p, 1))],
            wn: num(b.wn, p, 1),
            zeta: num(b.zeta, p, 0.5),
          },
          Ts,
          y0,
        );
        return { b, m, x: m.x0, u: 0, delay: new Array(Math.max(0, Math.round(num(b.theta, p, 0) / Ts))).fill(0) };
      });
      const integ = (d, y, u) => {
        const g = num(d.b.gain, p, 1);
        const lo = num(d.b.min, p, -Infinity);
        const hi = num(d.b.max, p, Infinity);
        return Math.min(hi, Math.max(lo, y + g * u * Ts));
      };
      const outOf = (d) => (d.b.block === "integrator" ? d.y : d.x[d.m.out]);
      const nextOf = (d) => (d.b.block === "integrator" ? integ(d, d.y, d.u) : stepModel(d.m, d.x, d.delay.length ? d.delay[0] : d.u)[d.m.out]);
      /** Variables de estado (Modbus y controles las cambian). */
      const state = Object.fromEntries(Object.entries(s.vars ?? {}).map(([k, v]) => [k, num(v, p, 0)]));
      /** Memoria de los comparadores y de los temporizadores. */
      const latch = new Map();
      const timerAt = new Map();
      const exprs = new Map(blocks.filter((b) => b.block === "expr").map((b) => [b, compileExpr(b.expr).fn]));
      let k = 0n;
      /** @type {Record<string, number>} */
      let last = {};
      let powered = !power;
      return {
        update(t, inp) {
          // 1) Integrar los pasos vencidos con la entrada retenida (idempotente en el mismo t).
          if (dyn.length) {
            while ((k + 1n) * STEP <= t) {
              for (const d of dyn) {
                if (d.b.block === "integrator") d.y = integ(d, d.y, d.u);
                else {
                  d.delay.push(d.u);
                  d.x = stepModel(d.m, d.x, /** @type {number} */ (d.delay.shift()));
                }
              }
              k++;
            }
          }
          // 2) Entradas: parámetros, estado, bornes, lecturas y controles.
          /** @type {Record<string, number>} */
          const v = {};
          for (const prm of parameters) if (prm.type === "number") v[prm.id] = Number(p[prm.id]);
          Object.assign(v, state);
          powered = !power || !!inp.loads.__power?.on;
          if (power?.var) v[power.var] = powered ? 1 : 0;
          for (const e of io) {
            if (e.kind === "digital-in") v[e.var] = inp.loads[e.var]?.on ? 1 : 0;
            else if (e.kind === "analog-in") v[e.var] = fromSignal(e, inp.values?.[e.var] ?? NaN, p);
            else if (e.kind === "read") {
              const x = inp.values?.[e.var];
              v[e.var] = typeof x === "number" && Number.isFinite(x) ? x : 0;
            } else if (e.kind === "control") {
              const a = inp.actions[e.var];
              v[e.var] = a === undefined ? num(e.default, p, e.control === "slider" ? num(e.min, p, 0) : 0) : Number(a);
            }
          }
          // 3) Salidas de los bloques dinámicos (valor del paso) y bloques sin memoria en orden.
          for (const d of dyn) v[d.b.out] = outOf(d);
          let wake;
          for (const b of order) {
            const x = b.block === "expr" ? 0 : Number(v[b.in] ?? 0);
            let y = 0;
            if (b.block === "expr") y = /** @type {any} */ (exprs.get(b))(v);
            else if (b.block === "limit") y = Math.min(num(b.max, p, Infinity), Math.max(num(b.min, p, -Infinity), x));
            else if (b.block === "table") {
              const pts = b.points;
              if (x <= pts[0][0]) y = pts[0][1];
              else if (x >= pts[pts.length - 1][0]) y = pts[pts.length - 1][1];
              else {
                const i = pts.findIndex((q) => q[0] >= x);
                const [x0, y0] = pts[i - 1];
                const [x1, y1] = pts[i];
                y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
              }
            } else if (b.block === "compare") {
              const hi = num(b.high, p, 0);
              const lo = num(b.low ?? b.high, p, hi);
              let on = latch.get(b) ?? false;
              if (x >= hi) on = true;
              else if (x <= lo) on = false;
              // Entre los umbrales mantiene el estado (histéresis); con low = high, conmuta en el umbral.
              if (lo === hi) on = x >= hi;
              latch.set(b, on);
              y = (b.invert ? !on : on) ? 1 : 0;
            } else if (b.block === "timer") {
              // on: sale 1 cuando la entrada lleva el tiempo en 1. off: sale 1 con la entrada y sigue el tiempo después de que cae.
              const ns = nsOf(num(b.ms, p, 1000));
              const rec = timerAt.get(b) ?? { since: undefined, fell: undefined, was: false };
              timerAt.set(b, rec);
              const inOn = x > 0.5;
              let at;
              if (b.mode === "off") {
                if (inOn) {
                  rec.was = true;
                  rec.fell = undefined;
                  y = 1;
                } else if (rec.was) {
                  rec.fell ??= t;
                  at = rec.fell + ns;
                  y = t < at ? 1 : 0;
                  if (!y) rec.was = false;
                }
              } else {
                if (!inOn) rec.since = undefined;
                else rec.since ??= t;
                if (rec.since !== undefined) {
                  at = rec.since + ns;
                  y = t >= at ? 1 : 0;
                }
              }
              if (at !== undefined && at > t) wake = wake === undefined || at < wake ? at : wake;
            }
            v[b.out] = y;
          }
          // 4) Entrada retenida para el paso siguiente y salidas como tramos hacia el próximo paso.
          /** @type {Record<string, any>} */
          const outputs = {};
          for (const d of dyn) {
            const u = Number(v[d.b.in] ?? 0);
            d.u = Number.isFinite(u) ? u : 0;
            const y = outOf(d);
            const rate = (nextOf(d) - y) / Ts;
            outputs[d.b.out] = { value: y + rate * (Number(t - k * STEP) / 1e9), rate };
          }
          for (const [name, x] of Object.entries(v)) if (!(name in outputs) && !parameters.some((q) => q.id === name)) outputs[name] = x;
          for (const e of io) if (e.kind === "analog-out") outputs[aoName(e)] = e.signal === "pt100" || powered ? toSignal(e, Number(v[e.var] ?? 0), p) : 0;
          outputs.powered = powered;
          last = v;
          /** @type {Record<string, boolean>} */
          const contacts = {};
          io.filter((e) => e.kind === "digital-out").forEach((e, i) => {
            const on = powered && Number(v[e.var] ?? 0) > num(e.threshold, p, 0.5);
            contacts[`do${i}_${e.var}`] = e.nc ? !on : on;
          });
          if (dyn.length) {
            const step = (k + 1n) * STEP;
            wake = wake === undefined || step < wake ? step : wake;
          }
          return { contacts, outputs, ...(wake !== undefined && wake > t ? { nextEventNs: wake } : {}) };
        },
        ...(s.modbus ? modbusFns(s.modbus, () => (powered ? { ...last, ...state } : undefined), state, (x) => num(x, p, 1)) : {}),
      };
    },
  };
  return def;
}

/**
 * Esclavo Modbus a partir del mapa de registros. Los valores salen del
 * último update; las escrituras cambian variables de estado.
 * @param {any} m
 * @param {() => Record<string, number> | undefined} read
 * @param {Record<string, number>} state
 * @param {(x: any) => number} num
 */
function modbusFns(m, read, state, num) {
  const words = (r) => (r.type === "int32" || r.type === "float32" ? 2 : 1);
  /** Registros de una tabla: dirección → [entrada, palabra]. */
  const regMap = (table) => {
    const map = new Map();
    for (const r of m[table] ?? []) for (let w = 0; w < words(r); w++) map.set(r.reg + w, [r, w]);
    return map;
  };
  const maps = { holding: regMap("holding"), input: regMap("input") };
  const encode = (r, x) => {
    const raw = Number(x) * num(r.scale ?? 1);
    const buf = new DataView(new ArrayBuffer(4));
    switch (r.type ?? "int16") {
      case "uint16":
        return [Math.max(0, Math.min(65535, Math.round(raw)))];
      case "int32":
        buf.setInt32(0, Math.max(-2147483648, Math.min(2147483647, Math.round(raw))));
        return r.swap ? [buf.getUint16(2), buf.getUint16(0)] : [buf.getUint16(0), buf.getUint16(2)];
      case "float32":
        buf.setFloat32(0, raw);
        return r.swap ? [buf.getUint16(2), buf.getUint16(0)] : [buf.getUint16(0), buf.getUint16(2)];
      default:
        return [Math.max(-32768, Math.min(32767, Math.round(raw))) & 0xffff];
    }
  };
  const decode = (r, ws) => {
    const buf = new DataView(new ArrayBuffer(4));
    const [hi, lo] = r.swap ? [ws[1], ws[0]] : [ws[0], ws[1]];
    let raw;
    switch (r.type ?? "int16") {
      case "uint16":
        raw = ws[0];
        break;
      case "int32":
        buf.setUint16(0, hi);
        buf.setUint16(2, lo);
        raw = buf.getInt32(0);
        break;
      case "float32":
        buf.setUint16(0, hi);
        buf.setUint16(2, lo);
        raw = buf.getFloat32(0);
        break;
      default:
        raw = ws[0] >= 0x8000 ? ws[0] - 0x10000 : ws[0];
    }
    return raw / num(r.scale ?? 1);
  };
  const bits = (table) => new Map((m[table] ?? []).map((r) => [r.bit, r]));
  const bitMaps = { coils: bits("coils"), discrete: bits("discrete") };
  return {
    modbusRead(table, start, count) {
      const v = read();
      if (!v) return undefined;
      const map = maps[table];
      const out = [];
      for (let a = start; a < start + count; a++) {
        const hit = map.get(a);
        if (!hit) return null;
        out.push(encode(hit[0], v[hit[0].var] ?? 0)[hit[1]]);
      }
      return out;
    },
    modbusWrite(start, values) {
      if (!read()) return undefined;
      const map = maps.holding;
      // Todas las direcciones deben existir y ser escribibles; una de 32 bits se escribe entera.
      for (let i = 0; i < values.length; i++) {
        const hit = map.get(start + i);
        if (!hit || !hit[0].write) return false;
        if (words(hit[0]) === 2 && (start + i - hit[1] < start || start + i - hit[1] + 1 >= start + values.length)) return false;
      }
      for (let i = 0; i < values.length; ) {
        const [r, w] = map.get(start + i);
        const n = words(r);
        const x = decode(r, values.slice(i - w, i - w + n));
        if ((r.min !== undefined && x < num(r.min)) || (r.max !== undefined && x > num(r.max))) return 3;
        state[r.var] = x;
        i += n - w;
      }
      return true;
    },
    modbusReadBits(table, start, count) {
      const v = read();
      if (!v) return undefined;
      const out = [];
      for (let a = start; a < start + count; a++) {
        const r = bitMaps[table].get(a);
        if (!r) return null;
        out.push(Number(v[r.var] ?? 0) > 0.5 ? 1 : 0);
      }
      return out;
    },
    modbusWriteBits(start, list) {
      if (!read()) return undefined;
      for (let i = 0; i < list.length; i++) {
        const r = bitMaps.coils.get(start + i);
        if (!r || !r.write) return false;
      }
      list.forEach((b, i) => {
        state[bitMaps.coils.get(start + i).var] = b ? 1 : 0;
      });
      return true;
    },
  };
}

/**
 * Bornes del componente con el lado sugerido (entradas arriba, salidas
 * abajo), sin validar: el editor los dibuja mientras se edita.
 * @param {any} spec
 * @returns {{ id: string, side: "t" | "b", label: string, io: number }[]}
 */
export function componentTerminals(spec) {
  const out = [];
  const seen = new Set();
  const add = (id, side, label, io) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id: String(id), side, label, io });
  };
  (spec?.io ?? []).forEach((e, i) => {
    const side = e?.kind === "digital-out" || e?.kind === "analog-out" ? "b" : "t";
    for (const t of ioTerminals(e ?? {})) add(t, side, e.label ?? e.var ?? e.kind, i);
  });
  if (spec?.modbus) {
    add(String(spec.modbus.a ?? "A"), "t", "RS-485 A", -1);
    add(String(spec.modbus.b ?? "B"), "t", "RS-485 B", -1);
  }
  return out;
}

/** Variables del componente (quién las produce), sin validar: para las listas del editor. @param {any} spec */
export function componentVars(spec) {
  /** @type {{ name: string, from: string }[]} */
  const out = [];
  const add = (name, from) => name && NAME.test(name) && !out.some((v) => v.name === name) && out.push({ name, from });
  for (const p of spec?.parameters ?? []) if (p?.type === "number") add(p.id, "parámetro");
  for (const k of Object.keys(spec?.vars ?? {})) add(k, "estado");
  for (const e of spec?.io ?? []) if (["digital-in", "analog-in", "read", "control"].includes(e?.kind) || (e?.kind === "power" && e.var)) add(e.var, e.kind);
  for (const b of spec?.blocks ?? []) add(b?.out, b?.block);
  return out;
}
