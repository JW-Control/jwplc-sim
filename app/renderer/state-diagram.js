// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Diagrama de estados en vivo estilo FluidSIM (vista lateral en .scene-left):
// registra en segundo plano cilindros (0..1), bobinas, finales de carrera y
// presión (bar), y los grafica sobre <canvas> con cursor, congelado y zoom.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const Core = window.JwsimStateDiagCore;

  const COLORS = {
    cyl: "#2f8cff",
    cylFill: "rgba(47, 140, 255, 0.14)",
    coil: "#ffb020",
    coilFill: "rgba(255, 176, 32, 0.16)",
    sensor: "#37d67a",
    sensorFill: "rgba(55, 214, 122, 0.16)",
    pressure: "#55aef0",
    pressureFill: "rgba(85, 174, 240, 0.14)",
    thresh: "#ff5d5d",
    bg: "#1b1f24",
    bandA: "#1b1f24",
    bandB: "#1f242b",
    grid: "#2b3139",
    text: "#d7dee7",
    muted: "#8794a2",
  };

  const LABEL_W = 84;
  const PAD_R = 12;
  const PAD_T = 8;
  const AXIS_H = 22;
  const PRESETS = [5000, 10000, 20000, 60000, 0];

  const recorder = Core ? Core.createRecorder(24000) : null;
  const S = {
    mounted: false,
    visible: false,
    meta: { groups: [], channels: [], hasPneumatics: false },
    active: new Set(),
    userCustomized: false,
    windowMs: 10000,
    frozen: false,
    panEndMs: null,
    hoverX: null,
    drag: null,
    raf: 0,
    dirty: true,
    running: false,
  };

  const spec = () => window.JwsimScene?.specForView?.() ?? { devices: [], wiring: [] };
  const visibleChannels = () => S.meta.channels.filter((c) => S.active.has(c.id));

  function applyDefaultSelection(resetSelection) {
    const allIds = new Set(S.meta.channels.map((c) => c.id));
    if (resetSelection || !S.userCustomized) {
      S.active.clear();
      // Por defecto: cilindros + bobinas + sensores (presión opcional desde + Señales).
      for (const c of S.meta.channels) {
        if (c.kind !== "pressure") S.active.add(c.id);
      }
      S.userCustomized = false;
    } else {
      for (const id of [...S.active]) if (!allIds.has(id)) S.active.delete(id);
    }
  }

  function mount() {
    if (S.mounted) return;
    const host = $("state-diag-pane");
    if (!host) return;
    S.mounted = true;
    host.innerHTML =
      `<div class="side-title sd-head"><span>Diagrama de estados</span><span id="sd-badge" class="sd-badge live">En vivo</span></div>` +
      `<div class="sd-tools">` +
      `<button id="sd-freeze" class="small" title="Congelar la gráfica para inspeccionar sin detener el PLC">⏸ Fijar</button>` +
      `<button id="sd-clear" class="small" title="Limpiar muestras del diagrama">↺ Limpiar</button>` +
      `<select id="sd-win" aria-label="Ventana temporal" title="Ventana de tiempo visible">` +
      `<option value="5000">5 s</option><option value="10000" selected>10 s</option><option value="20000">20 s</option><option value="60000">60 s</option><option value="0">Todo</option>` +
      `</select>` +
      `<div class="sd-pop-wrap"><button id="sd-signals-btn" class="small" aria-haspopup="true" aria-expanded="false">+ Señales</button>` +
      `<div id="sd-popover" class="sd-popover" hidden></div></div>` +
      `</div>` +
      `<div id="sd-readout" class="sd-readout">Sin datos aún</div>` +
      `<div class="sd-canvas-wrap" id="sd-wrap">` +
      `<canvas id="sd-canvas"></canvas>` +
      `<div id="sd-empty" class="sd-empty">Ejecuta la simulación para trazar las curvas de estado.</div>` +
      `</div>` +
      `<div class="sd-foot">Rueda: zoom temporal · Arrastra: recorrer historial</div>`;

    $("sd-freeze").addEventListener("click", () => toggleFreeze());
    $("sd-clear").addEventListener("click", () => {
      recorder?.reset();
      S.frozen = false;
      S.panEndMs = null;
      syncControls();
      scheduleDraw();
    });
    $("sd-win").addEventListener("change", (e) => {
      const val = Number(e.target.value);
      S.windowMs = Number.isFinite(val) ? val : 10000;
      if (!S.frozen) S.panEndMs = null;
      scheduleDraw();
    });

    const popBtn = $("sd-signals-btn");
    const pop = $("sd-popover");
    popBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      pop.hidden = !open;
      popBtn.setAttribute("aria-expanded", String(open));
      if (open) renderPopover();
    });
    pop.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      if (!pop.hidden) {
        pop.hidden = true;
        popBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !pop.hidden) {
        pop.hidden = true;
        popBtn.setAttribute("aria-expanded", "false");
      }
    });

    const canvas = $("sd-canvas");
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (S.drag) {
        const dx = e.clientX - S.drag.x;
        if (!S.drag.active) {
          if (Math.abs(dx) < 4) return;
          S.drag.active = true;
          if (S.windowMs <= 0) S.windowMs = Math.max(2000, activeBounds().t1 - activeBounds().t0);
          if (!S.frozen) {
            S.frozen = true;
            S.panEndMs = Math.max(0, recorder?.lastTimeMs() ?? 0);
            syncControls();
          }
          S.drag.endMs = S.panEndMs ?? Math.max(0, recorder?.lastTimeMs() ?? 0);
        }
        const plotW = Math.max(40, r.width - LABEL_W - PAD_R);
        const span = S.windowMs > 0 ? S.windowMs : activeBounds().t1 - activeBounds().t0;
        const shift = (dx / plotW) * span;
        const total = Math.max(0, recorder?.lastTimeMs() ?? 0);
        const minEnd = Math.min(total, S.windowMs > 0 ? S.windowMs : span);
        S.panEndMs = Math.max(minEnd, Math.min(total, S.drag.endMs - shift));
        scheduleDraw();
        return;
      }
      S.hoverX = x >= LABEL_W && x <= r.width - PAD_R ? x : null;
      scheduleDraw();
    });
    canvas.addEventListener("pointerleave", () => {
      if (!S.drag) {
        S.hoverX = null;
        scheduleDraw();
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !(recorder?.samples().length > 1)) return;
      const r = canvas.getBoundingClientRect();
      if (e.clientX - r.left < LABEL_W) return;
      S.drag = { x: e.clientX, active: false, endMs: S.panEndMs ?? Math.max(0, recorder.lastTimeMs()) };
      canvas.setPointerCapture(e.pointerId);
    });
    const endDrag = () => (S.drag = null);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const total = Math.max(2000, recorder?.lastTimeMs() ?? 10000);
        const cur = S.windowMs > 0 ? S.windowMs : total;
        const next = Math.round(Math.max(2000, Math.min(120000, cur * (e.deltaY < 0 ? 0.8 : 1.25))));
        S.windowMs = next;
        syncWindowSelect();
        scheduleDraw();
      },
      { passive: false },
    );

    new ResizeObserver(() => resize()).observe($("sd-wrap"));
    syncControls();
  }

  function syncWindowSelect() {
    const sel = $("sd-win");
    if (!sel) return;
    const custom = sel.querySelector('option[data-custom="1"]');
    if (PRESETS.includes(S.windowMs)) {
      if (custom) custom.remove();
      sel.value = String(S.windowMs);
    } else {
      const opt = custom ?? document.createElement("option");
      opt.dataset.custom = "1";
      opt.value = String(S.windowMs);
      opt.textContent = `${(S.windowMs / 1000).toFixed(1).replace(/\.0$/, "")} s`;
      if (!custom) sel.insertBefore(opt, sel.lastElementChild);
      sel.value = opt.value;
    }
  }

  function toggleFreeze(force) {
    S.frozen = typeof force === "boolean" ? force : !S.frozen;
    if (S.frozen) {
      S.panEndMs = Math.max(0, recorder?.lastTimeMs() ?? 0);
    } else {
      S.panEndMs = null;
    }
    syncControls();
    scheduleDraw();
  }

  function syncControls() {
    const btn = $("sd-freeze");
    const badge = $("sd-badge");
    if (btn) {
      btn.textContent = S.frozen ? "▶ En vivo" : "⏸ Fijar";
      btn.classList.toggle("active", S.frozen);
    }
    if (badge) {
      badge.textContent = S.frozen ? "Fijado" : "En vivo";
      badge.className = `sd-badge ${S.frozen ? "frozen" : "live"}`;
    }
    syncWindowSelect();
  }

  function renderPopover() {
    const pop = $("sd-popover");
    if (!pop) return;
    if (!S.meta.groups.length) {
      pop.innerHTML = `<div class="sd-pop-empty">Agrega una electroválvula con cilindro a la escena.</div>`;
      return;
    }
    let html =
      `<div class="sd-pop-presets">` +
      `<button type="button" class="small" data-preset="all">Todo</button>` +
      `<button type="button" class="small" data-preset="cyl">Solo cilindros</button>` +
      `<button type="button" class="small" data-preset="default">Cilindros + E/S</button>` +
      `</div>`;
    for (const g of S.meta.groups) {
      html += `<div class="sd-pop-group"><div class="sd-pop-gtitle">${esc(g.label)}</div>`;
      for (const ch of g.channels) {
        const checked = S.active.has(ch.id) ? " checked" : "";
        html += `<label class="sd-pop-item"><input type="checkbox" data-chid="${esc(ch.id)}"${checked}/>` +
          `<i class="sd-dot ${esc(ch.kind)}"></i><span>${esc(ch.label)}</span></label>`;
      }
      html += `</div>`;
    }
    pop.innerHTML = html;
    for (const b of pop.querySelectorAll("[data-preset]")) {
      b.addEventListener("click", () => {
        const p = b.dataset.preset;
        S.userCustomized = true;
        S.active.clear();
        for (const c of S.meta.channels) {
          if (p === "all" || (p === "cyl" && c.kind === "cyl") || (p === "default" && c.kind !== "pressure")) {
            S.active.add(c.id);
          }
        }
        renderPopover();
        scheduleDraw();
      });
    }
    for (const inp of pop.querySelectorAll("input[data-chid]")) {
      inp.addEventListener("change", () => {
        S.userCustomized = true;
        if (inp.checked) S.active.add(inp.dataset.chid);
        else S.active.delete(inp.dataset.chid);
        scheduleDraw();
      });
    }
  }

  function activeBounds() {
    const total = Math.max(0, recorder?.lastTimeMs() ?? 0);
    const b = Core ? Core.windowBounds(total, S.windowMs, S.panEndMs, S.frozen) : { t0: 0, t1: 10000 };
    if (b.t1 <= b.t0) b.t1 = b.t0 + 1000;
    return b;
  }

  function stepMsFor(span) {
    const candidates = [500, 1000, 2000, 5000, 10000, 15000, 30000, 60000];
    for (const c of candidates) if (span / c <= 7) return c;
    return 60000;
  }

  function formatVal(ch, v) {
    if (v === undefined) return "—";
    if (ch.kind === "cyl") return `${Math.round(v * 100)}%`;
    if (ch.kind === "pressure") return `${v.toFixed(1)} bar`;
    return v >= 0.5 ? "1" : "0";
  }

  function draw() {
    S.raf = 0;
    if (!S.visible || !S.mounted) return;
    const wrap = $("sd-wrap");
    const canvas = $("sd-canvas");
    const empty = $("sd-empty");
    const readout = $("sd-readout");
    if (!wrap || !canvas) return;

    const channels = visibleChannels();
    const samples = recorder?.samples() ?? [];
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    if (wrapW <= 0 || wrapH <= 0) return;

    if (!channels.length) {
      empty.textContent = S.meta.hasPneumatics ? "Activa al menos una señal en «+ Señales»." : "La escena no tiene electroválvulas con cilindro.";
      empty.hidden = false;
    } else if (!samples.length) {
      empty.textContent = "Ejecuta la simulación para trazar las curvas de estado.";
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    // Altura por pista según tipo para mantener legibilidad incluso con 4 cilindros.
    const tracks = channels.map((ch) => ({
      ch,
      h: ch.kind === "cyl" || ch.kind === "pressure" ? 56 : 32,
    }));
    const naturalH = PAD_T + tracks.reduce((a, t) => a + t.h, 0) + AXIS_H;
    const h = Math.max(wrapH, naturalH);
    const w = wrapW;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const plotW = Math.max(40, w - LABEL_W - PAD_R);
    const { t0, t1 } = activeBounds();
    const span = Math.max(1, t1 - t0);
    const xOf = (t) => LABEL_W + ((t - t0) / span) * plotW;

    // Bandas horizontales de pistas y etiquetas izquierdas.
    let y = PAD_T;
    for (let i = 0; i < tracks.length; i++) {
      const tr = tracks[i];
      tr.y = y;
      ctx.fillStyle = i % 2 === 0 ? COLORS.bandA : COLORS.bandB;
      ctx.fillRect(0, y, w, tr.h);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + tr.h + 0.5);
      ctx.lineTo(w, y + tr.h + 0.5);
      ctx.stroke();
      y += tr.h;
    }

    // Rejilla temporal vertical y eje inferior.
    const axisY = Math.max(y, h - AXIS_H);
    const step = stepMsFor(span);
    const firstTick = Math.ceil(t0 / step) * step;
    ctx.font = '10px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = firstTick; t <= t1 + 1e-6; t += step) {
      const x = Math.round(xOf(t)) + 0.5;
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD_T);
      ctx.lineTo(x, axisY);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${(t / 1000).toFixed(step < 1000 ? 1 : 0)}s`, x, axisY + 5);
    }

    // Separador entre canaletas de etiquetas y gráfica.
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(LABEL_W + 0.5, 0);
    ctx.lineTo(LABEL_W + 0.5, axisY);
    ctx.stroke();

    // Instante inspeccionado por el cursor (o el último punto visible).
    const rawTotalT = samples.length ? samples[samples.length - 1].t : 0;
    const totalT = S.frozen && S.panEndMs != null ? Math.min(rawTotalT, S.panEndMs) : rawTotalT;
    const hoverT = S.hoverX != null && samples.length ? t0 + ((S.hoverX - LABEL_W) / plotW) * span : null;
    const hoverInData = hoverT != null && samples.length && hoverT >= samples[0].t && hoverT <= totalT;
    const readT = hoverInData ? hoverT : samples.length ? totalT : null;

    // Dibujo de cada señal dentro de su pista.
    for (const tr of tracks) {
      const { ch, y: ty, h: th } = tr;
      const top = ty + 8;
      const bot = ty + th - 8;
      const spanY = Math.max(4, bot - top);
      const yOf = (val) => {
        const norm = Math.max(0, Math.min(1, (val - ch.min) / Math.max(1e-6, ch.max - ch.min)));
        return bot - norm * spanY;
      };

      // Guías internas de referencia (0/1 o umbral 1.5 bar).
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(135, 148, 162, 0.22)";
      ctx.beginPath();
      ctx.moveTo(LABEL_W, top);
      ctx.lineTo(LABEL_W + plotW, top);
      ctx.moveTo(LABEL_W, bot);
      ctx.lineTo(LABEL_W + plotW, bot);
      ctx.stroke();
      if (ch.threshold != null) {
        const yTh = yOf(ch.threshold);
        ctx.strokeStyle = "rgba(255, 93, 93, 0.55)";
        ctx.beginPath();
        ctx.moveTo(LABEL_W, yTh);
        ctx.lineTo(LABEL_W + plotW, yTh);
        ctx.stroke();
      }
      ctx.restore();

      if (samples.length) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(LABEL_W, ty, plotW, th);
        ctx.clip();

        const digital = ch.kind === "coil" || ch.kind === "sensor";
        const color = COLORS[ch.kind];
        const fill = COLORS[`${ch.kind}Fill`];

        // Determinar rango visible en samples (recortando con exactitud en t0 y t1).
        let i0 = 0;
        while (i0 + 1 < samples.length && samples[i0 + 1].t < t0) i0++;
        let i1 = i0;
        while (i1 + 1 < samples.length && samples[i1].t <= t1) i1++;

        const pts = [];
        let lastVal;
        if (samples[i0].t < t0 && t0 <= totalT) {
          const v0 = Core.valueAt(samples, ch, t0);
          if (v0 !== undefined) {
            pts.push([xOf(t0), yOf(v0)]);
            lastVal = v0;
          }
        }
        for (let i = i0; i <= i1; i++) {
          const s = samples[i];
          if (s.t < t0 || s.t > t1) continue;
          const val = s.v[ch.id];
          if (val === undefined) continue;
          const px = xOf(s.t);
          const py = yOf(val);
          if (digital && pts.length && lastVal !== undefined) {
            pts.push([px, yOf(lastVal)]);
          }
          pts.push([px, py]);
          lastVal = val;
        }
        if (totalT > t1) {
          const v1 = Core.valueAt(samples, ch, t1);
          if (v1 !== undefined) pts.push([xOf(t1), yOf(v1)]);
        }

        if (pts.length) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], bot);
          for (const [px, py] of pts) ctx.lineTo(px, py);
          ctx.lineTo(pts[pts.length - 1][0], bot);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.9;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Etiqueta izquierda de pista + valor leído.
      const vNow = readT != null ? Core.valueAt(samples, ch, readT) : undefined;
      ctx.fillStyle = COLORS[ch.kind];
      ctx.fillRect(6, ty + 7, 3, th - 14);
      ctx.font = 'bold 11px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(ch.shortLabel, 14, ty + th * 0.38, LABEL_W - 20);
      ctx.font = '10px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = vNow !== undefined && (ch.kind === "cyl" || ch.kind === "pressure" || vNow >= 0.5) ? COLORS[ch.kind] : COLORS.muted;
      ctx.fillText(formatVal(ch, vNow), 14, ty + th * 0.72, LABEL_W - 20);

      // Punto de intersección sobre el cursor.
      if (hoverInData && vNow !== undefined) {
        ctx.fillStyle = COLORS[ch.kind];
        ctx.beginPath();
        ctx.arc(S.hoverX, yOf(vNow), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Línea vertical del cursor de inspección.
    if (hoverInData && S.hoverX != null) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(215, 222, 231, 0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(S.hoverX, PAD_T);
      ctx.lineTo(S.hoverX, axisY);
      ctx.stroke();
      ctx.restore();
    }

    // Banda superior de lectura exacta.
    if (readout) {
      if (!channels.length) {
        readout.textContent = "Sin señales visibles";
      } else if (!samples.length || readT == null) {
        readout.textContent = "Sin datos aún";
      } else {
        const parts = channels.slice(0, 6).map((ch) => `${ch.shortLabel}: ${formatVal(ch, Core.valueAt(samples, ch, readT))}`);
        const extra = channels.length > 6 ? ` (+${channels.length - 6})` : "";
        readout.textContent = `t = ${(readT / 1000).toFixed(2)} s · ${parts.join(" · ")}${extra}`;
      }
    }
  }

  function scheduleDraw() {
    if (!S.visible || S.raf) return;
    S.raf = requestAnimationFrame(draw);
  }

  window.JwsimStateDiag = {
    onSpec({ resetProject = false } = {}) {
      mount();
      S.meta = Core ? Core.extractChannels(spec()) : { groups: [], channels: [], hasPneumatics: false };
      if (resetProject) {
        recorder?.onProjectReset();
        S.frozen = false;
        S.panEndMs = null;
      }
      applyDefaultSelection(resetProject);
      window.JwsimScenePane?.setLeftAvailability?.(S.meta.hasPneumatics);
      if (!$("sd-popover")?.hidden) renderPopover();
      syncControls();
      scheduleDraw();
    },
    onSnapshot(snap, running = false) {
      S.running = !!running;
      if (recorder?.push(snap, S.running)) scheduleDraw();
    },
    setVisible(on) {
      mount();
      S.visible = !!on;
      if (S.visible) scheduleDraw();
    },
    resize() {
      if (S.visible) scheduleDraw();
    },
    debug: () => ({
      open: S.visible,
      samples: recorder?.samples().length ?? 0,
      lastMs: recorder?.lastTimeMs() ?? -1,
      channels: S.meta.channels.map((c) => c.id),
      visibleIds: visibleChannels().map((c) => c.id),
      frozen: S.frozen,
      windowMs: S.windowMs,
    }),
  };
})();
