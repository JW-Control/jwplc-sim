// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Dinámica lineal de las plantas (la misma matemática que genera «Nuevo
// dispositivo» en cli/lib/device-gen.mjs, aquí como módulo para los
// componentes declarativos de scene/component.mjs):
//   n.º orden:             G(s) = K·e^(−θs) / [(τ1·s + 1)…(τn·s + 1)], n = 1 … 4
//   2.º orden oscilatorio:  G(s) = K·ωn²·e^(−θs) / (s² + 2ζωn·s + ωn²)
// En espacio de estados y discretizado exacto con retención de orden cero:
//   x[k+1] = Ad·x[k] + Bd·u[k − d],  [Ad Bd; 0 1] = exp([A B; 0 0]·Ts),  d = θ/Ts.

export const MODELS = ["1.er orden", "2.º orden", "3.er orden", "4.º orden", "2.º orden oscilatorio"];

/** @param {number[][]} X @param {number[][]} Y */
const mul = (X, Y) => X.map((r) => Y[0].map((_, j) => r.reduce((s, v, k) => s + v * Y[k][j], 0)));

/** exp(M) por escalado y cuadrado con Taylor (exacto en doble precisión para estos tamaños). @param {number[][]} M */
export function expm(M) {
  const norm = Math.max(...M.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)));
  const sq = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1);
  const S = M.map((r) => r.map((v) => v / 2 ** sq));
  let E = S.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
  let term = E;
  for (let k = 1; k <= 20; k++) {
    term = mul(term, S).map((r) => r.map((v) => v / k));
    E = E.map((r, i) => r.map((v, j) => v + term[i][j]));
  }
  for (let i = 0; i < sq; i++) E = mul(E, E);
  return E;
}

/**
 * Modelo discreto. `order`: 1 a 4, u "osc" (2.º orden oscilatorio).
 * @param {{ order: number | "osc", K: number, tau?: number[], wn?: number, zeta?: number }} o
 * @param {number} Ts paso en segundos
 * @param {number} y0 salida inicial (en equilibrio)
 */
export function linearModel(o, Ts, y0 = 0) {
  const K = Number(o.K);
  /** @type {number[][]} */ let A;
  /** @type {number[]} */ let B;
  let out;
  /** @type {number[]} */ let x0;
  if (o.order === "osc") {
    const wn = Math.max(1e-6, Number(o.wn));
    const z = Math.max(0, Number(o.zeta));
    A = [[0, 1], [-wn * wn, -2 * z * wn]];
    B = [0, K * wn * wn];
    out = 0;
    // En equilibrio con y0: x = [y0, 0] (la entrada u = y0/K lo sostiene).
    x0 = [y0, 0];
  } else {
    // Etapas de primer orden en serie: x1 sigue a K·u, cada xi sigue a x(i−1); y = xn.
    const n = Math.min(4, Math.max(1, Math.round(Number(o.order) || 1)));
    const tau = [0, 1, 2, 3].map((i) => Math.max(1e-3, Number(o.tau?.[i] ?? o.tau?.[0] ?? 1)));
    A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? -1 / tau[i] : j === i - 1 ? 1 / tau[i] : 0)));
    B = Array.from({ length: n }, (_, i) => (i === 0 ? K / tau[0] : 0));
    out = n - 1;
    x0 = new Array(n).fill(y0);
  }
  const n = A.length;
  const M = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i < n ? (j < n ? A[i][j] : B[i]) : 0) * Ts));
  const E = expm(M);
  return { Ad: E.slice(0, n).map((r) => r.slice(0, n)), Bd: E.slice(0, n).map((r) => r[n]), out, x0 };
}

/** Un paso: x[k+1] = Ad·x + Bd·u. @param {{ Ad: number[][], Bd: number[] }} m @param {number[]} x @param {number} u */
export const stepModel = (m, x, u) => m.Ad.map((r, i) => r.reduce((s, v, j) => s + v * x[j], 0) + m.Bd[i] * u);
