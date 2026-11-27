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

// Si al abrir va a salir Inicio, la ventana del editor no se pinta antes: se
// oculta hasta que start.js decide (onReady). Por si algo falla, a los 15 s
// se muestra igual.
(() => {
  try {
    if (localStorage.getItem("jwsim.inicio") === "false") return;
  } catch {}
  const root = document.documentElement;
  root.classList.add("booting");
  setTimeout(() => root.classList.remove("booting"), 15000);
})();
