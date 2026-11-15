// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sonido de los elementos electromecánicos (G7): el "clic" de un relé o el
// golpe más grave de un contactor al atraer (y más suave al soltar),
// sintetizado con WebAudio (sin archivos). También el buzzer de la placa
// (GPIO26, LEDC): el runner manda cada cambio de frecuencia y ciclo con su
// instante virtual ({"type":"pwm"}) y aquí se reproduce con una onda
// cuadrada, en el mismo orden y con las mismas duraciones. Se silencia desde
// la escena o desde la placa; la preferencia queda en el navegador de la app.
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

  // ---- buzzer de la placa
  // Las notas llegan en tandas (un volcado del runner cada ~20 ms) con su
  // instante virtual t_ns. A velocidad ×1 el tiempo virtual va con el reloj:
  // cada nota se agenda en el reloj de audio con un pequeño margen, así una
  // melodía conserva sus duraciones aunque las tandas lleguen a saltos. Si el
  // agendado se atrasa o adelanta demasiado (pausa, reinicio) se recalibra.
  // En ×10 o Máx las notas se tocan al llegar (sin pretender fidelidad).
  const kLeadS = 0.08;   // margen de agendado
  const kMaxAheadS = 0.6;
  let bz = null;         // { osc, gain }
  let baseT = null;      // t_ns de referencia
  let baseA = 0;         // tiempo de audio de esa referencia
  // Volumen percibido según el ciclo: máximo al 50 %, como el piezo real.
  const level = (duty) => 0.2 * Math.sqrt(Math.min(1, 2 * Math.min(duty, 1 - duty)));

  function buzzerNode(a) {
    if (bz) return bz;
    const osc = a.createOscillator();
    osc.type = "square";
    const lp = a.createBiquadFilter();   // suaviza la cuadrada (timbre de piezo)
    lp.type = "lowpass";
    lp.frequency.value = 5000;
    const gain = a.createGain();
    gain.gain.value = 0;
    osc.connect(lp).connect(gain).connect(a.destination);
    osc.start();
    bz = { osc, gain };
    return bz;
  }

  // items: [[t_ns, pin, hz, ciclo], ...] del GPIO26; speed: 1, 10 o 0 (Máx).
  function buzzer(items, speed = 1) {
    if (!enabled || !items.length) return;
    try {
      const a = audio();
      const { osc, gain } = buzzerNode(a);
      const now = a.currentTime;
      for (const [t, , hz, duty] of items) {
        let at = now;
        if (speed === 1) {
          const mapped = baseT === null ? -1 : baseA + (t - baseT) / 1e9;
          if (mapped < now + 0.005 || mapped > now + kMaxAheadS) {
            baseT = t;
            baseA = now + kLeadS;
          }
          at = baseA + (t - baseT) / 1e9;
        }
        const g = hz > 0 ? level(duty) : 0;
        if (hz > 0) osc.frequency.setValueAtTime(hz, at);
        gain.gain.setTargetAtTime(g, at, 0.002);
      }
    } catch {
      // Sin audio disponible: se ignora.
    }
  }

  // Pausa, parada o silencio: corta el tono ya, incluido lo agendado.
  function buzzerStop() {
    baseT = null;
    if (!bz || !ctx) return;
    const t = ctx.currentTime;
    bz.gain.gain.cancelScheduledValues(t);
    bz.osc.frequency.cancelScheduledValues(t);
    bz.gain.gain.setTargetAtTime(0, t, 0.002);
  }

  const listeners = [];
  window.JwsimSound = {
    click,
    buzzer,
    buzzerStop,
    // Avisa cuando cambia la preferencia (botones de la escena y de la placa).
    onChange(fn) {
      listeners.push(fn);
    },
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = !!v;
      if (!enabled) buzzerStop();
      try {
        localStorage.setItem(KEY, enabled ? "1" : "0");
      } catch {
        // sin almacenamiento
      }
      for (const fn of listeners) fn(enabled);
    },
  };
})();
