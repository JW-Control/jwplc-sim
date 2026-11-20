// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Fija el esquema antes del primer pintado para evitar destellos al abrir.
(() => {
  try {
    const t = localStorage.getItem("jwsim-theme");
    const m = document.querySelector('meta[name="color-scheme"]');
    if (m && (t === "light" || t === "dark")) m.content = t;
  } catch {}
})();
