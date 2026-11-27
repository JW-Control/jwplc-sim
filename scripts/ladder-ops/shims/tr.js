// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto mínimo para empaquetar ladder-utils del OpenPLC Editor sin React.
export const tr = (s, v) => (v ? String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => v[k]) : s)
