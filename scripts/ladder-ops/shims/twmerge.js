// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto mínimo para empaquetar ladder-utils del OpenPLC Editor sin React.
export const twMerge = (...a) => a.filter(Boolean).join(" ");
export const extendTailwindMerge = () => twMerge;
