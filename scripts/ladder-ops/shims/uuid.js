// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto mínimo para empaquetar ladder-utils del OpenPLC Editor sin React.
let n = 0;
const rnd = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const v4 = rnd;
export default { v4: rnd };
