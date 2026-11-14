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
  { id: "planta", name: "Equipo de planta", hint: "Una variable en % movida por lo que lee: rampa (sube y baja) o un modelo de 1.er a 4.º orden u oscilatorio, con tiempo muerto.", category: "Planta", options: ["source", "modelo", "gain", "tau", "tau2", "tau3", "tau4", "wn", "zeta", "theta", "stepMs", "upPerS", "downPerS"] },
  {
    id: "termica",
    name: "Planta térmica",
    hint: "Horno o tanque calefaccionado: modelo de 1.er a 4.º orden u oscilatorio, con tiempo muerto, discretizado exacto. Resistencia (todo o nada) o consigna 0-10 V; salida PT100 y termostato.",
    category: "Planta",
    options: ["rating", "modelo", "gain", "tau", "tau2", "tau3", "tau4", "wn", "zeta", "theta", "ambient", "tmax", "stepMs", "analogIn", "pt100", "thermostat"],
  },
];

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const num = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v, d) => (v === undefined || v === "" ? d : v === true || v === "true" || v === 1 || v === "1");
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
    // Plantas: modelo (orden) y sus constantes; los valores por defecto según el bloque.
    modelo: [...(b.id === "planta" ? [RAMP] : []), ...MODELS].includes(s.modelo) ? s.modelo : b.id === "planta" ? RAMP : MODELS[0],
    tau: Math.max(0.001, num(s.tau, b.id === "planta" ? 10 : 600)),
    tau2: Math.max(0.001, num(s.tau2, b.id === "planta" ? 5 : 120)),
    tau3: Math.max(0.001, num(s.tau3, b.id === "planta" ? 3 : 60)),
    tau4: Math.max(0.001, num(s.tau4, b.id === "planta" ? 2 : 30)),
    wn: Math.max(1e-6, num(s.wn, b.id === "planta" ? 0.5 : 0.02)),
    zeta: Math.max(0, num(s.zeta, 0.3)),
    gain: num(s.gain, b.id === "planta" ? 100 : 180),
    theta: Math.max(0, num(s.theta, b.id === "planta" ? 0 : 20)),
    ambient: num(s.ambient, 25),
    tmax: num(s.tmax, 220),
    stepMs: Math.min(10000, Math.max(10, num(s.stepMs, 500))),
    analogIn: bool(s.analogIn, true),
    pt100: bool(s.pt100, true),
    thermostat: bool(s.thermostat, true),
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
    case "termica":
      // Arriba lo que entra (resistencia, consigna); abajo lo que sale (PT100, termostato).
      return {
        top: ["R1", "R2", ...(o.analogIn ? ["AI+", "AI-"] : [])],
        bottom: [...(o.pt100 ? ["PT1", "PT2", "PT3"] : []), ...(o.thermostat ? ["TS1", "TS2"] : [])],
        contacts: [],
      };
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
    case "termica":
      // Resistencia que se enciende, temperatura y aviso del termostato.
      body =
        `  <path d="M${cx - 50} ${cy - 10}l8 -8l8 16l8 -16l8 16l8 -16l8 16l8 -16l8 16l8 -16l8 16l6 -8" fill="none" stroke="#5b636c" stroke-width="2.4" data-show="!out.calentando"/>\n` +
        `  <path d="M${cx - 50} ${cy - 10}l8 -8l8 16l8 -16l8 16l8 -16l8 16l8 -16l8 16l8 -16l8 16l6 -8" fill="none" stroke="#ff5a2a" stroke-width="2.8" data-show="out.calentando"/>\n` +
        `  <text x="${cx}" y="${cy + 18}" font-size="15" font-weight="700" text-anchor="middle" fill="#1b1e22" font-family="sans-serif" data-text="out.temp:d1:°C">— °C</text>\n` +
        (o.thermostat ? `  <text x="${w - 10}" y="${cy + 18}" font-size="9" font-weight="700" text-anchor="end" fill="#d92b2b" font-family="sans-serif" data-show="out.sobretemp">SOBRETEMP.</text>\n` : "");
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

// ---------------------------------------------------------------- dinámica lineal
// Modelos de planta con el orden a elección (también en Propiedades):
//   n.º orden:           G(s) = K·e^(−θs) / [(τ1·s + 1)…(τn·s + 1)], n = 1 … 4
//   2.º orden oscilatorio: G(s) = K·ωn²·e^(−θs) / (s² + 2ζωn·s + ωn²)
// En espacio de estados y discretizado exacto con retención de orden cero:
//   x[k+1] = Ad·x[k] + Bd·u[k − d],  [Ad Bd; 0 1] = exp([A B; 0 0]·Ts),  d = θ/Ts.
export const MODELS = ["1.er orden", "2.º orden", "3.er orden", "4.º orden", "2.º orden oscilatorio"];
export const RAMP = "Rampa (sube/baja)";

/** Código de la dinámica, común a las plantas (va arriba de la definición). */
const LTI_HELPERS = [
  `// ---- Dinámica lineal (generada): orden a elección, discretizada exacta (ZOH).`,
  `//   n.º orden:            G(s) = K·e^(−θs) / [(τ1·s + 1)…(τn·s + 1)]`,
  `//   2.º orden oscilatorio: G(s) = K·ωn²·e^(−θs) / (s² + 2ζωn·s + ωn²)`,
  `//   x[k+1] = Ad·x[k] + Bd·u[k − d],  [Ad Bd; 0 1] = exp([A B; 0 0]·Ts),  d = θ/Ts`,
  `const MODELS = ${js(MODELS)};`,
  `const mul = (X, Y) => X.map((r) => Y[0].map((_, j) => r.reduce((s, v, k) => s + v * Y[k][j], 0)));`,
  `// exp(M) por escalado y cuadrado con Taylor (exacto en doble precisión para estos tamaños).`,
  `function expm(M) {`,
  `  const norm = Math.max(...M.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)));`,
  `  const sq = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1);`,
  `  const S = M.map((r) => r.map((v) => v / 2 ** sq));`,
  `  let E = S.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));`,
  `  let term = E;`,
  `  for (let k = 1; k <= 20; k++) {`,
  `    term = mul(term, S).map((r) => r.map((v) => v / k));`,
  `    E = E.map((r, i) => r.map((v, j) => v + term[i][j]));`,
  `  }`,
  `  for (let i = 0; i < sq; i++) E = mul(E, E);`,
  `  return E;`,
  `}`,
  `// Modelo de los parámetros: matrices discretas, salida y estado inicial para y0.`,
  `function linearModel(p, Ts, y0) {`,
  `  const K = Number(p.gain);`,
  `  const tau = [p.tau1, p.tau2, p.tau3, p.tau4].map((v) => Math.max(1e-3, Number(v)));`,
  `  let A;`,
  `  let B;`,
  `  let out;`,
  `  let x0;`,
  `  if (p.modelo === "2.º orden oscilatorio") {`,
  `    const wn = Math.max(1e-6, Number(p.wn));`,
  `    const z = Math.max(0, Number(p.zeta));`,
  `    A = [[0, 1], [-wn * wn, -2 * z * wn]];`,
  `    B = [0, K * wn * wn];`,
  `    out = 0;`,
  `    x0 = [y0, 0];`,
  `  } else {`,
  `    // Etapas de primer orden en serie: x1 sigue a K·u, cada xi sigue a x(i−1); y = xn.`,
  `    const n = Math.max(1, MODELS.indexOf(p.modelo) + 1);`,
  `    A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? -1 / tau[i] : j === i - 1 ? 1 / tau[i] : 0)));`,
  `    B = Array.from({ length: n }, (_, i) => (i === 0 ? K / tau[0] : 0));`,
  `    out = n - 1;`,
  `    x0 = new Array(n).fill(y0);`,
  `  }`,
  `  const n = A.length;`,
  `  const M = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i < n ? (j < n ? A[i][j] : B[i]) : 0)).map((v) => v * Ts));`,
  `  const E = expm(M);`,
  `  return { Ad: E.slice(0, n).map((r) => r.slice(0, n)), Bd: E.slice(0, n).map((r) => r[n]), out, x0 };`,
  `}`,
  `const stepModel = (m, x, u) => m.Ad.map((r, i) => r.reduce((s, v, j) => s + v * x[j], 0) + m.Bd[i] * u);`,
  ``,
].join("\n");

/** Parámetros del modelo (grupo «Modelo» en Propiedades). */
function modelParams(o, { ramp = false, gainLabel, gainUnit, group = "02 Modelo" }) {
  const g = js(group);
  return [
    `    { id: "modelo", label: "Modelo (orden)", type: "enum", options: ${js(ramp ? [RAMP, ...MODELS] : MODELS)}, default: ${js(o.modelo)}, group: ${g} },`,
    `    { id: "gain", label: ${js(gainLabel)}, type: "number", default: ${o.gain}, unit: ${js(gainUnit)}, group: ${g} },`,
    `    { id: "tau1", label: "τ1", type: "number", default: ${o.tau}, unit: "s", group: ${g}, hint: "1.er a 4.º orden" },`,
    `    { id: "tau2", label: "τ2", type: "number", default: ${o.tau2}, unit: "s", group: ${g}, hint: "2.º orden en adelante" },`,
    `    { id: "tau3", label: "τ3", type: "number", default: ${o.tau3}, unit: "s", group: ${g}, hint: "3.er orden en adelante" },`,
    `    { id: "tau4", label: "τ4", type: "number", default: ${o.tau4}, unit: "s", group: ${g}, hint: "4.º orden" },`,
    `    { id: "wn", label: "ωn (frecuencia natural)", type: "number", default: ${o.wn}, unit: "rad/s", group: ${g}, hint: "2.º orden oscilatorio" },`,
    `    { id: "zeta", label: "ζ (amortiguamiento)", type: "number", default: ${o.zeta}, group: ${g}, hint: "2.º orden oscilatorio; < 1 oscila" },`,
    `    { id: "theta", label: "θ (tiempo muerto)", type: "number", default: ${o.theta}, unit: "s", group: ${g} },`,
    `    { id: "stepMs", label: "Paso de discretización (Ts)", type: "number", default: ${o.stepMs}, unit: "ms", group: ${g} },`,
  ];
}

/**
 * Cuerpo de la planta térmica: primer orden con tiempo muerto (FOPDT),
 *   τ·dT/dt = −(T − Ta) + K·u(t − θ),
 * discretizado exacto con retención de orden cero (paso Ts):
 *   T[k+1] = Tss + (T[k] − Tss)·e^(−Ts/τ),  Tss = Ta + K·u[k − d],  d = θ/Ts.
 */
function thermalBody(o, terminals) {
  const L = [];
  L.push(`  // Modelo: T = Ta + y, con y la salida de la dinámica elegida (orden 1 a 4 u oscilatorio),`);
  L.push(`  // discretizada exacta (estable con cualquier paso). Con 1.er orden: τ·dT/dt = −(T − Ta) + K·u(t − θ).`);
  L.push(`  // u va de 0 a 1: la resistencia (todo o nada)${o.analogIn ? " o la consigna de 0-10 V en AI+/AI- (si está cableada, manda ella)" : ""}.`);
  L.push(`  parameters: [`);
  L.push(`    { id: "rating", label: "Resistencia", type: "enum", options: ["24VDC", "230VAC"], default: ${js(o.rating)}, group: "01 Entradas" },`);
  L.push(...modelParams(o, { gainLabel: "K (subida a plena potencia)", gainUnit: "°C" }));
  L.push(`    { id: "ambient", label: "Ambiente (Ta)", type: "number", default: ${o.ambient}, unit: "°C", group: "02 Modelo" },`);
  L.push(`    { id: "start", label: "Temperatura inicial", type: "number", default: ${o.ambient}, unit: "°C", group: "02 Modelo" },`);
  if (o.thermostat) L.push(`    { id: "tmax", label: "Termostato de seguridad", type: "number", default: ${o.tmax}, unit: "°C", group: "03 Salidas" },`);
  L.push(`  ],`);
  L.push(`  terminals: ${js(terminals)},`);
  L.push(`  electrical: (p) => ({`);
  L.push(`    // Entrada digital: la resistencia R1-R2 (la manda un relé, contactor o SSR del tablero).`);
  L.push(`    loads: [{ id: "heater", a: "R1", b: "R2", rating: String(p.rating) }],`);
  if (o.thermostat) L.push(`    // Salida digital: termostato de seguridad TS1-TS2 (cierra en sobretemperatura).`);
  L.push(`    contacts: ${o.thermostat ? `{ TS: ["TS1", "TS2"] }` : "{}"},`);
  L.push(`  }),`);
  if (o.analogIn) {
    L.push(`  // Entrada analógica: consigna de potencia 0-10 V (calibrador, potenciómetro con fuente, módulo AO).`);
    L.push(`  probeInputs: () => [{ id: "u", kind: "0-10V", terminals: ["AI+", "AI-"] }],`);
  }
  if (o.pt100) {
    L.push(`  // Salida analógica: sonda PT100 de 3 hilos (PT1-PT2-PT3 → R1-R2-R3 del transmisor pt100-rs485).`);
    L.push(`  probes: () => [{ id: "pt", kind: "pt100", terminals: ["PT1", "PT2", "PT3"], output: "temp" }],`);
  }
  L.push(`  create(ctx) {`);
  L.push(`    const p = ctx.params;`);
  L.push(`    const Ts = Math.max(0.01, Number(p.stepMs) / 1000);`);
  L.push(`    const STEP = ms(Ts * 1000);`);
  L.push(`    const Ta = Number(p.ambient);`);
  L.push(`    const m = linearModel(p, Ts, Number(p.start) - Ta);`);
  L.push(`    let x = m.x0; // estado del modelo (y = x[m.out] = T − Ta)`);
  L.push(`    // Tiempo muerto: las entradas de los últimos d pasos.`);
  L.push(`    const delay = new Array(Math.max(0, Math.round(Number(p.theta) / Ts))).fill(0);`);
  L.push(`    let k = 0n; // pasos integrados`);
  L.push(`    let u = 0; // entrada retenida (ZOH) del paso en curso`);
  L.push(`    return {`);
  L.push(`      update(t, inp) {`);
  L.push(`        // 1) Integrar los pasos vencidos con la entrada retenida (idempotente en el mismo t).`);
  L.push(`        while ((k + 1n) * STEP <= t) {`);
  L.push(`          delay.push(u);`);
  L.push(`          x = stepModel(m, x, delay.shift());`);
  L.push(`          k++;`);
  L.push(`        }`);
  L.push(`        const T = Ta + x[m.out];`);
  L.push(`        // 2) Entrada para el paso siguiente.`);
  if (o.analogIn) {
    L.push(`        const v = inp.values?.u;`);
    L.push(`        u = Number.isFinite(v) ? Math.min(1, Math.max(0, v / 10)) : inp.loads.heater.on ? 1 : 0;`);
  } else {
    L.push(`        u = inp.loads.heater.on ? 1 : 0;`);
  }
  L.push(`        // 3) Salidas: la temperatura como segmento hacia el próximo paso (los sensores la cruzan exacto).`);
  L.push(`        const uNext = delay.length ? delay[0] : u;`);
  L.push(`        const Tnext = Ta + stepModel(m, x, uNext)[m.out];`);
  L.push(`        // Valor en este instante (puede ser a mitad de un paso): entre T[k] y T[k+1].`);
  L.push(`        const rate = (Tnext - T) / Ts;`);
  L.push(`        const Tt = T + rate * (Number(t - k * STEP) / 1e9);`);
  L.push(`        const hot = ${o.thermostat ? "Tt >= Number(p.tmax) - 1e-6" : "false"};`);
  L.push(`        return {`);
  L.push(`          contacts: ${o.thermostat ? "{ TS: hot }" : "{}"},`);
  L.push(`          outputs: { temp: { value: Tt, rate }, potencia: u, calentando: uNext > 0, sobretemp: hot },`);
  L.push(`          // Despertar en el próximo paso del modelo${o.thermostat ? " o, antes, cuando la temperatura cruce el termostato" : ""}.`);
  L.push(
    o.thermostat
      ? `          nextEventNs: ((n, c) => (c !== undefined && c > t && c < n ? c : n))((k + 1n) * STEP, rate !== 0 && (Number(p.tmax) - Tt) / rate > 0 ? t + ms(((Number(p.tmax) - Tt) / rate) * 1000) : undefined),`
      : `          nextEventNs: (k + 1n) * STEP,`,
  );
  L.push(`        };`);
  L.push(`      },`);
  L.push(`    };`);
  L.push(`  },`);
  return L.join("\n") + "\n";
}

/**
 * Equipo de planta genérico (sin bornes): una variable en % que mueve lo que
 * lee. Modelo «Rampa»: sube y baja a velocidad fija (integrador con límites,
 * como antes). Los demás: la dinámica lineal del orden elegido, con u de 0 a 1.
 */
function plantBody(o) {
  const L = [];
  L.push(`  // La entrada se elige en Propiedades al colocarlo (vacía: no se mueve). u = valor leído (booleano: 0 o 1).`);
  L.push(`  parameters: [`);
  L.push(`    { id: "source", label: "Entrada", type: "string", default: "", hint: ${js(`<equipo>.<salida>, p. ej. ${o.source}`)}, group: "01 Entrada" },`);
  L.push(...modelParams(o, { ramp: true, gainLabel: "K (valor con la entrada a pleno)", gainUnit: "%" }));
  L.push(`    { id: "upPerS", label: "Sube (rampa)", type: "number", default: ${o.upPerS}, unit: "%/s", group: "02 Modelo", hint: "solo el modelo Rampa" },`);
  L.push(`    { id: "downPerS", label: "Baja (rampa)", type: "number", default: ${o.downPerS}, unit: "%/s", group: "02 Modelo", hint: "solo el modelo Rampa" },`);
  L.push(`    { id: "start", label: "Valor inicial", type: "number", default: 0, unit: "%", group: "02 Modelo" },`);
  L.push(`  ],`);
  L.push(`  // Equipo de planta: sin bornes; lo mueve lo que lee y lo leen los sensores por sus salidas.`);
  L.push(`  terminals: [],`);
  L.push(`  reads: (p) => (p.source ? [{ id: "input", source: String(p.source) }] : []),`);
  L.push(`  create(ctx) {`);
  L.push(`    const p = ctx.params;`);
  L.push(`    const out = (x, rate) => ({ value: { value: x / 100, rate: rate / 100 }, valuePct: { value: x, rate }, full: x >= 100, empty: x <= 0 });`);
  L.push(`    if (p.modelo === ${js(RAMP)}) {`);
  L.push(`      // Rampa: tramo lineal, valor x0 en t0 con pendiente rate (%/s), entre 0 y 100 %.`);
  L.push(`      let x0 = Math.min(100, Math.max(0, Number(p.start)));`);
  L.push(`      let t0 = 0n;`);
  L.push(`      let rate = 0;`);
  L.push(`      const at = (t) => Math.min(100, Math.max(0, x0 + (rate * Number(t - t0)) / 1e9));`);
  L.push(`      return {`);
  L.push(`        update(t, inp) {`);
  L.push(`          const x = at(t);`);
  L.push(`          const on = Number(inp.values?.input ?? 0) > 0;`);
  L.push(`          let r = on ? Number(p.upPerS) : -Number(p.downPerS);`);
  L.push(`          if ((r > 0 && x >= 100) || (r < 0 && x <= 0)) r = 0;`);
  L.push(`          if (r !== rate) {`);
  L.push(`            x0 = x;`);
  L.push(`            t0 = t;`);
  L.push(`            rate = r;`);
  L.push(`          }`);
  L.push(`          // Próximo cambio solo: al llegar a 0 o a 100 %.`);
  L.push(`          const next = rate > 0 ? t + ms(((100 - x) / rate) * 1000) : rate < 0 ? t + ms((x / -rate) * 1000) : undefined;`);
  L.push(`          return { outputs: out(x, rate), ...(next !== undefined && next > t ? { nextEventNs: next } : {}) };`);
  L.push(`        },`);
  L.push(`      };`);
  L.push(`    }`);
  L.push(`    // Dinámica lineal del orden elegido: y = x[m.out] en %, partiendo del valor inicial.`);
  L.push(`    const Ts = Math.max(0.01, Number(p.stepMs) / 1000);`);
  L.push(`    const STEP = ms(Ts * 1000);`);
  L.push(`    const m = linearModel(p, Ts, Number(p.start));`);
  L.push(`    let x = m.x0;`);
  L.push(`    const delay = new Array(Math.max(0, Math.round(Number(p.theta) / Ts))).fill(0);`);
  L.push(`    let k = 0n;`);
  L.push(`    let u = 0;`);
  L.push(`    return {`);
  L.push(`      update(t, inp) {`);
  L.push(`        while ((k + 1n) * STEP <= t) {`);
  L.push(`          delay.push(u);`);
  L.push(`          x = stepModel(m, x, delay.shift());`);
  L.push(`          k++;`);
  L.push(`        }`);
  L.push(`        const v = Number(inp.values?.input ?? 0);`);
  L.push(`        u = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;`);
  L.push(`        const y = x[m.out];`);
  L.push(`        const yNext = stepModel(m, x, delay.length ? delay[0] : u)[m.out];`);
  L.push(`        const rate = (yNext - y) / Ts;`);
  L.push(`        return { outputs: out(y + rate * (Number(t - k * STEP) / 1e9), rate), nextEventNs: (k + 1n) * STEP };`);
  L.push(`      },`);
  L.push(`    };`);
  L.push(`  },`);
  return L.join("\n") + "\n";
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
    case "termica":
      body = thermalBody(o, terminals);
      break;
    default:
      body = plantBody(o);
  }
  const helpers = ["planta", "termica"].includes(o.behavior) ? LTI_HELPERS + "\n" : "";
  return `${head}${helpers}const device = {\n${ident}${body}};\n\nexport default device;\n`;
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
    case "termica": {
      // 1.er orden: a θ + τ llega al 63,2 % de K. Otros órdenes: régimen Ta + K tras ~20 constantes de tiempo.
      const first = o.modelo === MODELS[0];
      const n = MODELS.indexOf(o.modelo) + 1;
      const slow = o.modelo === "2.º orden oscilatorio" ? 1 / Math.max(1e-6, o.zeta * o.wn) : [o.tau, o.tau2, o.tau3, o.tau4].slice(0, n).reduce((a, b) => a + b, 0);
      const t63 = Math.round((o.theta + (first ? o.tau : 20 * slow)) * 1000);
      return (
        head +
        (first
          ? `// Respuesta al escalón de un primer orden con tiempo muerto: a t = θ + τ llega al 63,2 % de K.\ntest("escalón: a θ + τ llega a Ta + 0,632·K", () => {\n`
          : `// Respuesta al escalón (${o.modelo}): tras varias constantes de tiempo llega al régimen Ta + K.\ntest("escalón: llega al régimen Ta + K", () => {\n`) +
        `  const s = sceneWith(device, [${js(ps)}, "H1:${T}"], ["${plus} - H1.R1", "H1.R2 - ${minus}"]);\n` +
        `  s.advanceTo(ms(${t63}));\n` +
        `  const T = Number(s.output("H1", "temp"));\n` +
        `  const esperado = ${o.ambient} + ${first ? 0.632 : 1} * ${o.gain};\n` +
        `  assert.ok(Math.abs(T - esperado) <= 0.02 * Math.abs(${o.gain}) + 0.01, \`T = \${T.toFixed(2)} °C; se esperaba \${esperado.toFixed(2)} °C\`);\n` +
        `});\n\n` +
        `test("sin la resistencia se queda a la temperatura ambiente", () => {\n` +
        `  const s = sceneWith(device, ["H1:${T}"], []);\n` +
        `  s.advanceTo(ms(${t63}));\n` +
        `  assert.ok(Math.abs(Number(s.output("H1", "temp")) - ${o.ambient}) < 1e-6);\n` +
        `});\n`
      );
    }
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
