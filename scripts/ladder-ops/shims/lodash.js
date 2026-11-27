// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto mínimo para empaquetar ladder-utils del OpenPLC Editor sin React.
export const toNumber = (v) => Number(v);
export const toInteger = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; };
export const cloneDeep = (v) => structuredClone(v);
export default { toNumber, toInteger, cloneDeep };
