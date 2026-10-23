// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sonido de los elementos electromecánicos (G7): el "clic" de un relé o el
// golpe más grave de un contactor al atraer (y más suave al soltar),
// sintetizado con WebAudio (sin archivos). Se silencia desde la escena; la
// preferencia queda en el navegador de la app.
"use strict";

(() => {
  let ctx = null;
  let noise = null;
  const last = new Map();
  const KEY = "jwsim.sound";
  let enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== "0";
  } catch {
    // sin almacenamiento: sonido activo
  }

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Ruido blanco de 50 ms, reutilizado en cada clic.
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // kind: "relay" (clic agudo y corto) o "contactor" (golpe grave); on: atrae o suelta.
  function click(kind = "relay", on = true) {
    if (!enabled) return;
    const now = performance.now();
    // Un relé que vibra no satura: como mucho un sonido cada 25 ms por tipo.
    if (now - (last.get(kind) ?? 0) < 25) return;
    last.set(kind, now);
    try {
      const a = audio();
      const t = a.currentTime;
      const heavy = kind === "contactor";
      const src = a.createBufferSource();
      src.buffer = noise;
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = heavy ? 1400 : 3200;
      bp.Q.value = heavy ? 1.2 : 2.5;
      const g = a.createGain();
      const peak = (heavy ? 0.5 : 0.28) * (on ? 1 : 0.55);
      const dur = heavy ? 0.035 : 0.012;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(a.destination);
      src.start(t);
      src.stop(t + dur + 0.01);
      if (heavy && on) {
        // Cuerpo del golpe del contactor.
        const o = a.createOscillator();
        const og = a.createGain();
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.04);
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.25, t + 0.002);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(og).connect(a.destination);
        o.start(t);
        o.stop(t + 0.06);
      }
    } catch {
      // Sin audio disponible: se ignora.
    }
  }

  window.JwsimSound = {
    click,
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = !!v;
      try {
        localStorage.setItem(KEY, enabled ? "1" : "0");
      } catch {
        // sin almacenamiento
      }
    },
  };
})();
