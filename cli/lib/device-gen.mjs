// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Generador de dispositivos nuevos a partir de bloques de comportamiento
// (etapa B de docs/integration/PROPUESTA_MODELOS_PROPIOS.md). Arma una
// carpeta normal del SDK —jwsim-device.json, device.mjs, symbol.svg con los
// bornes en la grilla, device.test.mjs y README.md— que el autor puede
// seguir editando a mano. Lo usan el asistente «Nuevo dispositivo» de la app
// y `jwsim-cli device new`.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const GRID = 20;

/** Bloques de comportamiento: lo que el asistente ofrece. */
export const BEHAVIORS = [
  { id: "rele", name: "Relé o contactor", hint: "Una bobina A1-A2 que, con tensión, conmuta sus contactos NA y NC.", category: "Mando y protección", options: ["rating", "no", "nc"] },
  { id: "carga", name: "Carga", hint: "Piloto, zumbador o actuador simple entre X1 y X2: se enciende con su tensión nominal.", category: "Señalización", options: ["rating", "color"] },
  { id: "pulsador", name: "Pulsador o selector", hint: "El alumno lo acciona con la simulación en marcha y conmuta sus contactos.", category: "Mando y protección", options: ["mode", "no", "nc"] },
  { id: "sensor", name: "Sensor con umbral", hint: "Lee una salida de otro equipo (p. ej. T1.nivelPct) y cierra su contacto sobre un umbral, con histéresis.", category: "Sensores", options: ["source", "threshold", "hysteresis", "no", "nc"] },
  { id: "temporizador", name: "Temporizador a la conexión", hint: "Con la bobina A1-A2 energizada, el contacto 15-18 cierra tras el tiempo (15-16 abre).", category: "Mando y protección", options: ["rating", "delayMs"] },
  { id: "planta", name: "Equipo de planta", hint: "Una variable de 0 a 100 % que sube mientras una entrada está activa y baja si no (llenado, temperatura).", category: "Planta", options: ["source", "upPerS", "downPerS"] },
];

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const js = (v) => JSON.stringify(v);
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Valida y completa la especificación del asistente.
 * @param {Record<string, any>} s
 */
export function normalizeSpec(s) {
  const b = BEHAVIORS.find((x) => x.id === s.behavior);
  if (!b) throw new Error(`comportamiento desconocido: ${s.behavior} (${BEHAVIORS.map((x) => x.id).join(", ")})`);
  const author = String(s.author ?? "").trim().toLowerCase();
  const name = String(s.name ?? "").trim().toLowerCase();
  if (!NAME_RE.test(author)) throw new Error("autor: minúsculas, números y guiones (p. ej. «utec»)");
  if (!NAME_RE.test(name)) throw new Error("nombre: minúsculas, números y guiones (p. ej. «rele-dos-contactos»)");
  if (author === "jwsim") throw new Error("el autor «jwsim» es de la biblioteca incluida");
  const contacts = b.options.includes("no");
  const o = {
    behavior: b.id,
    author,
    name,
    type: `${author}/${name}`,
    title: String(s.title ?? "").trim() || b.name,
    description: String(s.description ?? "").trim() || b.hint,
    category: String(s.category ?? "").trim() || b.category,
    license: String(s.license ?? "").trim() || "MIT",
    rating: ["24VDC", "230VAC"].includes(s.rating) ? s.rating : "24VDC",
    color: ["verde", "rojo", "amarillo", "azul", "blanco"].includes(s.color) ? s.color : "verde",
    mode: s.mode === "toggle" ? "toggle" : "momentary",
    no: contacts ? clampInt(s.no, 0, 4, 1) : 0,
    nc: contacts ? clampInt(s.nc, 0, 4, b.id === "rele" ? 1 : 0) : 0,
    source: String(s.source ?? "").trim() || (b.id === "planta" ? "M1.running" : "T1.nivelPct"),
    threshold: num(s.threshold, 50),
    hysteresis: Math.max(0, num(s.hysteresis, 5)),
    delayMs: Math.max(1, num(s.delayMs, 3000)),
    upPerS: Math.max(0.01, num(s.upPerS, 10)),
    downPerS: Math.max(0, num(s.downPerS, 5)),
  };
  if (contacts && o.no + o.nc === 0) throw new Error("al menos un contacto (NA o NC)");
  if (["sensor", "planta"].includes(b.id) && !/^[A-Za-z][\w-]*\.[\w-]+$/.test(o.source)) throw new Error("la lectura es <equipo>.<salida>, p. ej. T1.nivelPct");
  return o;
}

/** Contactos numerados como en IEC 60947: NA 13-14, 23-24…; NC 11-12, 21-22… (en ese orden). */
function contactList(o) {
  const out = [];
  let i = 1;
  for (let k = 0; k < o.no; k++, i++) out.push({ id: `${i}3-${i}4`, a: `${i}3`, b: `${i}4`, nc: false });
  for (let k = 0; k < o.nc; k++, i++) out.push({ id: `${i}1-${i}2`, a: `${i}1`, b: `${i}2`, nc: true });
  return out;
}

/** Bornes arriba y abajo según el bloque. */
export function terminalsOf(o) {
  const cs = contactList(o);
  switch (o.behavior) {
    case "rele":
      return { top: ["A1", ...cs.map((c) => c.a)], bottom: ["A2", ...cs.map((c) => c.b)], contacts: cs };
    case "carga":
      return { top: ["X1"], bottom: ["X2"], contacts: [] };
    case "pulsador":
    case "sensor":
      return { top: cs.map((c) => c.a), bottom: cs.map((c) => c.b), contacts: cs };
    case "temporizador":
      return { top: ["A1", "15"], bottom: ["A2", "16", "18"], contacts: [] };
    default:
      return { top: [], bottom: [], contacts: [] };
  }
}

/**
 * Disposición del símbolo: tamaño y posición de cada borne, siempre en la
 * grilla (x múltiplo de 20; el cable entra por y = 0 o y = alto).
 */
export function symbolLayout(o) {
  const { top, bottom } = terminalsOf(o);
  const n = Math.max(top.length, bottom.length, 1);
  const w = o.behavior === "planta" ? 160 : Math.max(80, (n + 1) * GRID * 2);
  const h = o.behavior === "planta" ? 120 : 140;
  const place = (ids) => {
    const step = 2 * GRID;
    const x0 = Math.round((w - step * (ids.length - 1)) / 2 / GRID) * GRID;
    return ids.map((id, i) => ({ id, x: x0 + i * step }));
  };
  return { w, h, top: place(top), bottom: place(bottom) };
}

/** symbol.svg según el contrato de docs/SIMBOLOS.md. */
export function symbolSvg(o) {
  const L = symbolLayout(o);
  const { w, h } = L;
  const cx = w / 2;
  const cy = h / 2;
  const screw = (t, y, side) =>
    `  <circle cx="${t.x}" cy="${y}" r="7" fill="#f4f5f7" stroke="#1b1e22" stroke-width="1.2"/>\n` +
    `  <path d="M${t.x - 4} ${y}h8M${t.x} ${y - 4}v8" stroke="#1b1e22" stroke-width="1.2"/>\n` +
    `  <text x="${t.x}" y="${side === "t" ? y + 20 : y - 12}" font-size="9" text-anchor="middle" fill="#1b1e22" font-family="sans-serif">${xml(t.id)}</text>\n` +
    `  <circle class="jw-term" data-term="${xml(t.id)}" cx="${t.x}" cy="${y}" r="9"/>\n`;
  let body;
  switch (o.behavior) {
    case "rele":
    case "temporizador":
      body =
        `  <circle cx="${cx}" cy="${cy}" r="8" fill="#3a3f45" data-show="!out.energized"/>\n` +
        `  <circle cx="${cx}" cy="${cy}" r="8" fill="#2fd05a" data-show="out.energized"/>\n` +
        (o.behavior === "temporizador"
          ? `  <circle cx="${cx + 22}" cy="${cy}" r="5" fill="#3a3f45" data-show="!out.closed"/>\n  <circle cx="${cx + 22}" cy="${cy}" r="5" fill="#ffcc00" data-show="out.closed"/>\n`
          : "");
      break;
    case "carga":
      body = `  <circle cx="${cx}" cy="${cy}" r="18" fill="#2b2f35"/>\n  <circle cx="${cx}" cy="${cy}" r="14" fill="#555b63" data-show="!out.on"/>\n  <circle cx="${cx}" cy="${cy}" r="14" data-fill="param.color" data-show="out.on"/>\n`;
      break;
    case "pulsador":
      body =
        `  <g data-action="press" data-kind="${o.mode}">\n    <circle cx="${cx}" cy="${cy}" r="18" fill="#2b2f35"/>\n` +
        `    <circle cx="${cx}" cy="${cy}" r="14" fill="#2fd05a" data-show="!out.pressed"/>\n    <circle cx="${cx}" cy="${cy + 1}" r="12" fill="#1f8f3e" data-show="out.pressed"/>\n  </g>\n`;
      break;
    case "sensor":
      body =
        `  <circle cx="${cx - 24}" cy="${cy}" r="6" fill="#3a3f45" data-show="!out.active"/>\n  <circle cx="${cx - 24}" cy="${cy}" r="6" fill="#ffcc00" data-show="out.active"/>\n` +
        `  <text x="${cx + 6}" y="${cy + 4}" font-size="11" text-anchor="middle" fill="#1b1e22" font-family="sans-serif" data-text="out.value:d1:">—</text>\n`;
      break;
    default:
      body =
        `  <rect x="20" y="30" width="${w - 40}" height="14" rx="3" fill="#cfd4da" stroke="#1b1e22"/>\n` +
        `  <text x="${cx}" y="72" font-size="16" text-anchor="middle" fill="#1b1e22" font-family="sans-serif" data-text="out.valuePct:d0:%">0 %</text>\n` +
        `  <text x="${cx}" y="92" font-size="9" text-anchor="middle" fill="#5b636c" font-family="sans-serif">${xml(o.source)}</text>\n`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">\n` +
    `  <!-- Generado por «Nuevo dispositivo» (${o.behavior}). Contrato: docs/SIMBOLOS.md (bornes con cx múltiplo de 20). -->\n` +
    `  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="6" fill="#e4e7eb" stroke="#1b1e22" stroke-width="1.6"/>\n` +
    (o.behavior === "planta"
      ? `  <text x="8" y="20" font-size="9" fill="#5b636c" font-family="sans-serif">${xml(o.title)}</text>\n`
      : `  <text x="${cx}" y="${cy + 32}" font-size="9" text-anchor="middle" fill="#5b636c" font-family="sans-serif">${xml(o.title)}</text>\n`) +
    L.top.map((t) => screw(t, 12, "t")).join("") +
    L.bottom.map((t) => screw(t, h - 12, "b")).join("") +
    body +
    `</svg>\n`
  );
}

/** device.mjs: la definición, con comentarios para seguir editándola. */
export function deviceModule(o) {
  const { top, bottom, contacts } = terminalsOf(o);
  const terminals = [...top, ...bottom].map((id) => ({ id }));
  const contactsDecl = Object.fromEntries(contacts.map((c) => [c.id, [c.a, c.b]]));
  const head =
    `// SPDX-License-Identifier: ${o.license}\n` +
    `// ${o.title} (${o.type}): generado por «Nuevo dispositivo» de JWPLC Sim\n` +
    `// con el bloque «${BEHAVIORS.find((b) => b.id === o.behavior).name}». Es un dispositivo normal del SDK:\n` +
    `// edítelo a gusto (contrato en docs/SDK.md) y pulse Recargar en Dispositivos propios.\n` +
    `// Regla: update(t, inp) debe dar lo mismo si se llama dos veces con el mismo t.\n\n` +
    `const ms = (v) => BigInt(Math.round(v * 1e6));\n\n`;
  const ident = `  type: ${js(o.type)},\n  version: "0.1.0",\n  name: ${js(o.title)},\n  category: ${js(o.category)},\n  description: ${js(o.description)},\n`;
  const contactsOut = (on) =>
    contacts.length ? `Object.fromEntries(${js(contacts.map((c) => [c.id, c.nc]))}.map(([id, nc]) => [id, nc ? !(${on}) : (${on})]))` : "{}";
  let body;
  switch (o.behavior) {
    case "rele":
      body =
        `  parameters: [{ id: "rating", label: "Bobina", type: "enum", options: ["24VDC", "230VAC"], default: ${js(o.rating)} }],\n` +
        `  terminals: ${js(terminals)},\n` +
        `  // Bobina A1-A2 y los contactos (todos los posibles; cuáles cierran lo dice update).\n` +
        `  electrical: (p) => ({ loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.rating), coil: true }], contacts: ${js(contactsDecl)} }),\n` +
        `  create() {\n    return {\n      update(t, inp) {\n        const on = inp.loads.coil.on;\n` +
        `        return { contacts: ${contactsOut("on")}, outputs: { energized: on } };\n      },\n    };\n  },\n`;
      break;
    case "carga":
      body =
        `  parameters: [\n    { id: "rating", label: "Tensión", type: "enum", options: ["24VDC", "230VAC"], default: ${js(o.rating)} },\n` +
        `    { id: "color", label: "Color", type: "enum", options: ["verde", "rojo", "amarillo", "azul", "blanco"], default: ${js(o.color)} },\n  ],\n` +
        `  terminals: ${js(terminals)},\n` +
        `  electrical: (p) => ({ loads: [{ id: "load", a: "X1", b: "X2", rating: String(p.rating) }] }),\n` +
        `  create() {\n    return {\n      update(t, inp) {\n        return { outputs: { on: inp.loads.load.on } };\n      },\n    };\n  },\n`;
      break;
    case "pulsador":
      body =
        `  terminals: ${js(terminals)},\n` +
        `  // ${o.mode === "toggle" ? "toggle: cada clic alterna (selector)" : "momentary: activo mientras se mantiene pulsado"}.\n` +
        `  actions: [{ id: "press", label: "Pulsar", kind: ${js(o.mode)} }],\n` +
        `  electrical: () => ({ contacts: ${js(contactsDecl)} }),\n` +
        `  create() {\n    return {\n      update(t, inp) {\n        const on = !!inp.actions.press;\n` +
        `        return { contacts: ${contactsOut("on")}, outputs: { pressed: on } };\n      },\n    };\n  },\n`;
      break;
    case "sensor":
      body =
        `  // La lectura se elige en Propiedades al colocarlo (vacía: no lee nada).\n` +
        `  parameters: [\n    { id: "source", label: "Lee", type: "string", default: "", hint: ${js(`<equipo>.<salida>, p. ej. ${o.source}`)} },\n` +
        `    { id: "threshold", label: "Umbral", type: "number", default: ${o.threshold} },\n` +
        `    { id: "hysteresis", label: "Histéresis", type: "number", default: ${o.hysteresis} },\n  ],\n` +
        `  terminals: ${js(terminals)},\n` +
        `  // Enlaces (SDK §2.3): la escena avisa en el cruce exacto del umbral, aunque la\n` +
        `  // lectura cambie de forma continua. high: llegó al umbral; low: bajó de umbral − histéresis.\n` +
        `  links: (p) =>\n    p.source\n      ? [\n          { id: "high", source: String(p.source), min: Number(p.threshold), max: 1e12 },\n` +
        `          { id: "low", source: String(p.source), min: -1e12, max: Number(p.threshold) - Number(p.hysteresis) },\n        ]\n      : [],\n` +
        `  // Valor para mostrar (se actualiza en cada evento del dispositivo).\n` +
        `  reads: (p) => (p.source ? [{ id: "value", source: String(p.source) }] : []),\n` +
        `  electrical: () => ({ contacts: ${js(contactsDecl)} }),\n` +
        `  create() {\n    let active = false;\n    return {\n      update(t, inp) {\n` +
        `        // Entre los dos enlaces mantiene el estado (histéresis).\n` +
        `        if (inp.links.high) active = true;\n        else if (inp.links.low) active = false;\n` +
        `        const v = Number(inp.values?.value ?? NaN);\n` +
        `        return { contacts: ${contactsOut("active")}, outputs: { active, value: Number.isFinite(v) ? v : null } };\n      },\n    };\n  },\n`;
      break;
    case "temporizador":
      body =
        `  parameters: [\n    { id: "rating", label: "Bobina", type: "enum", options: ["24VDC", "230VAC"], default: ${js(o.rating)} },\n` +
        `    { id: "delayMs", label: "Tiempo", type: "number", default: ${o.delayMs}, unit: "ms" },\n  ],\n` +
        `  terminals: ${js(terminals)},\n` +
        `  electrical: (p) => ({\n    loads: [{ id: "coil", a: "A1", b: "A2", rating: String(p.rating), coil: true }],\n    contacts: { "15-18": ["15", "18"], "15-16": ["15", "16"] },\n  }),\n` +
        `  create(ctx) {\n    const delay = ms(Number(ctx.params.delayMs));\n    let since; // instante en que se energizó\n    return {\n      update(t, inp) {\n` +
        `        if (!inp.loads.coil.on) {\n          since = undefined;\n          return { contacts: { "15-18": false, "15-16": true }, outputs: { energized: false, closed: false } };\n        }\n` +
        `        since ??= t;\n        const done = t - since >= delay;\n` +
        `        // Horizonte: la escena despierta al dispositivo justo al vencer el tiempo.\n` +
        `        return { contacts: { "15-18": done, "15-16": !done }, outputs: { energized: true, closed: done }, ...(done ? {} : { nextEventNs: since + delay }) };\n      },\n    };\n  },\n`;
      break;
    default:
      body =
        `  // La entrada se elige en Propiedades al colocarlo (vacía: no sube).\n` +
        `  parameters: [\n    { id: "source", label: "Entrada", type: "string", default: "", hint: ${js(`<equipo>.<salida>, p. ej. ${o.source}`)} },\n` +
        `    { id: "upPerS", label: "Sube", type: "number", default: ${o.upPerS}, unit: "%/s" },\n` +
        `    { id: "downPerS", label: "Baja", type: "number", default: ${o.downPerS}, unit: "%/s" },\n` +
        `    { id: "start", label: "Valor inicial", type: "number", default: 0, unit: "%" },\n  ],\n` +
        `  // Equipo de planta: sin bornes; lo mueve lo que lee y lo leen los sensores por sus salidas.\n` +
        `  terminals: [],\n` +
        `  reads: (p) => (p.source ? [{ id: "input", source: String(p.source) }] : []),\n` +
        `  create(ctx) {\n    // Tramo lineal: valor x0 en t0 con pendiente rate (%/s).\n    let x0 = Math.min(100, Math.max(0, Number(ctx.params.start)));\n    let t0 = 0n;\n    let rate = 0;\n` +
        `    const at = (t) => Math.min(100, Math.max(0, x0 + (rate * Number(t - t0)) / 1e9));\n` +
        `    return {\n      update(t, inp) {\n        const x = at(t);\n        const on = Number(inp.values?.input ?? 0) > 0;\n` +
        `        let r = on ? Number(ctx.params.upPerS) : -Number(ctx.params.downPerS);\n        if ((r > 0 && x >= 100) || (r < 0 && x <= 0)) r = 0;\n` +
        `        if (r !== rate) {\n          x0 = x;\n          t0 = t;\n          rate = r;\n        }\n` +
        `        // Próximo cambio solo: al llegar a 0 o a 100 %.\n` +
        `        const next = rate > 0 ? t + ms(((100 - x) / rate) * 1000) : rate < 0 ? t + ms((x / -rate) * 1000) : undefined;\n` +
        `        return { outputs: { value: { value: x / 100, rate: rate / 100 }, valuePct: { value: x, rate }, full: x >= 100, empty: x <= 0 }, ...(next !== undefined && next > t ? { nextEventNs: next } : {}) };\n      },\n    };\n  },\n`;
  }
  return `${head}const device = {\n${ident}${body}};\n\nexport default device;\n`;
}

/** Prueba básica con sdk/testing.mjs (jwsim-cli device test). */
export function deviceTest(o) {
  const head =
    `// Prueba del dispositivo (jwsim-cli device test <carpeta>). Ayudas en sdk/testing.mjs.\n` +
    `import assert from "node:assert/strict";\nimport { test } from "node:test";\n\nimport device from "./device.mjs";\n\n` +
    `const { sceneWith, ms } = await import(process.env.JWSIM_SDK);\n\n`;
  const ps = o.rating === "230VAC" ? "PS:power-230vac" : "PS:power-24vdc";
  const plus = o.rating === "230VAC" ? "PS.L" : "PS.+V1";
  const minus = o.rating === "230VAC" ? "PS.N" : "PS.-V1";
  const T = o.type;
  switch (o.behavior) {
    case "rele":
    case "temporizador":
      return (
        head +
        `test("con la bobina energizada ${o.behavior === "rele" ? "conmuta" : "cierra 15-18 al vencer el tiempo"}", () => {\n` +
        `  const s = sceneWith(device, [${js(ps)}, "K1:${T}"], ["${plus} - K1.A1", "K1.A2 - ${minus}"]);\n` +
        `  s.advanceTo(ms(${o.behavior === "rele" ? 10 : o.delayMs + 10}));\n  assert.equal(s.output("K1", "energized"), true);\n` +
        (o.behavior === "temporizador" ? `  assert.equal(s.output("K1", "closed"), true);\n` : "") +
        `});\n`
      );
    case "carga":
      return head + `test("con su tensión se enciende", () => {\n  const s = sceneWith(device, [${js(ps)}, "H1:${T}"], ["${plus} - H1.X1", "H1.X2 - ${minus}"]);\n  s.advanceTo(ms(10));\n  assert.equal(s.output("H1", "on"), true);\n});\n`;
    case "pulsador":
      return head + `test("en reposo no está pulsado", () => {\n  const s = sceneWith(device, ["S1:${T}"], []);\n  s.advanceTo(ms(10));\n  assert.equal(s.output("S1", "pressed"), false);\n});\n`;
    case "sensor":
      return head + `test("sin la lectura queda inactivo", () => {\n  const s = sceneWith(device, ["B1:${T}"], []);\n  s.advanceTo(ms(10));\n  assert.equal(s.output("B1", "active"), false);\n});\n`;
    default:
      return head + `test("sin la entrada se queda en el valor inicial", () => {\n  const s = sceneWith(device, ["P1:${T}"], []);\n  s.advanceTo(ms(1000));\n  assert.equal(s.output("P1", "valuePct"), 0);\n});\n`;
  }
}

/** Archivos de la carpeta del dispositivo. */
export function generateDevice(spec) {
  const o = normalizeSpec(spec);
  const manifest = { type: o.type, version: "0.1.0", kind: "scene", name: o.title, description: o.description, license: o.license, author: o.author, entry: "device.mjs", sdk: 1 };
  const readme =
    `# ${o.title}\n\n${o.description}\n\nGenerado por «Nuevo dispositivo» de JWPLC Sim (bloque: ${BEHAVIORS.find((b) => b.id === o.behavior).name}).\n\n` +
    `- \`device.mjs\`: la definición (bornes, parámetros, modelo eléctrico y comportamiento). Contrato: \`docs/SDK.md\`.\n` +
    `- \`symbol.svg\`: el dibujo. Contrato: \`docs/SIMBOLOS.md\`; los bornes (\`.jw-term\`) con \`cx\` múltiplo de 20.\n` +
    `- \`device.test.mjs\`: prueba; se corre con \`node cli/jwsim-cli.mjs device test <esta carpeta>\`.\n\n` +
    `Tras editar, en la app: Herramientas → Dispositivos propios… → Recargar.\n`;
  return {
    spec: o,
    files: {
      "jwsim-device.json": JSON.stringify(manifest, null, 2) + "\n",
      "device.mjs": deviceModule(o),
      "symbol.svg": symbolSvg(o),
      "device.test.mjs": deviceTest(o),
      "README.md": readme,
    },
  };
}

/** Escribe la carpeta <parent>/<nombre>; no pisa una carpeta con contenido. */
export function writeDevice(parent, spec) {
  const g = generateDevice(spec);
  const dir = join(parent, g.spec.name);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} ya existe y no está vacía`);
  mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(g.files)) writeFileSync(join(dir, f), text);
  return { dir, ...g };
}
