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
  const CYL_PALETTE_DARK = ["#38bdf8", "#f472b6", "#34d399", "#fb923c", "#a78bfa", "#22d3ee"];
  const CYL_PALETTE_LIGHT = ["#0969da", "#c026d3", "#059669", "#ea580c", "#7c3aed", "#0891b2"];
  const STYLE_SWATCHES = ["#0969da", "#c026d3", "#059669", "#d97706", "#e11d48", "#7c3aed", "#0891b2", "#475569"];
  const LINE_WIDTHS = [1.5, 2.2, 3.2, 4.5];

  function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
    if (!m) return `rgba(47, 140, 255, ${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function isDarkTheme() {
    const m = document.querySelector('meta[name="color-scheme"]')?.content;
    if (m === "dark") return true;
    if (m === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  }
  let themeIsDark = isDarkTheme();
  function refreshThemeColors(forceDark) {
    const dark = typeof forceDark === "boolean" ? forceDark : isDarkTheme();
    themeIsDark = dark;
    if (dark) {
      Object.assign(COLORS, {
        bg: "#1b1f24",
        bandA: "#1b1f24",
        bandB: "#20252b",
        grid: "#2b3139",
        text: "#d7dee7",
        muted: "#8794a2",
        cyl: "#38bdf8",
        coil: "#ffb020",
        sensor: "#37d67a",
        pressure: "#55aef0",
        thresh: "#ff5d5d",
      });
    } else {
      Object.assign(COLORS, {
        bg: "#ffffff",
        bandA: "#ffffff",
        bandB: "#f1f5f9",
        grid: "#d0d7de",
        text: "#1f2328",
        muted: "#59636e",
        cyl: "#0969da",
        coil: "#d97706",
        sensor: "#1a7f37",
        pressure: "#0284c7",
        thresh: "#cf222e",
      });
    }
  }
  refreshThemeColors();
  window.addEventListener("jwsim:themechange", (e) => {
    refreshThemeColors(e?.detail?.dark);
    if (typeof scheduleDraw === "function") scheduleDraw();
  });

  const LABEL_W = 116;
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
    order: [],
    trackStyles: new Map(),
    lineWidth: 2.2,
    userCustomized: false,
    windowMs: 10000,
    frozen: false,
    panEndMs: null,
    hoverX: null,
    hoverTrackId: null,
    hoverCloseId: null,
    hoverSwatchId: null,
    swatchClick: false,
    styleTargetId: null,
    trackDrag: null,
    lastTracks: [],
    drag: null,
    raf: 0,
    dirty: true,
    running: false,
    lastSnap: null,
  };

  function defaultColorOf(ch) {
    if (ch?.kind === "cyl") {
      const pal = themeIsDark ? CYL_PALETTE_DARK : CYL_PALETTE_LIGHT;
      return pal[(ch.cylIndex ?? 0) % pal.length];
    }
    return COLORS[ch?.kind] ?? COLORS.cyl;
  }
  const colorOf = (ch) => S.trackStyles.get(ch?.id)?.color ?? defaultColorOf(ch);
  const fillOf = (ch) => hexToRgba(colorOf(ch), themeIsDark ? 0.16 : 0.14);
  const widthOf = (ch) => S.trackStyles.get(ch?.id)?.width ?? S.lineWidth;

  const spec = () => window.JwsimScene?.specForView?.() ?? { devices: [], wiring: [] };
  const visibleChannels = () => {
    const byId = new Map(S.meta.channels.map((c) => [c.id, c]));
    const ordered = [];
    const seen = new Set();
    for (const id of S.order) {
      const ch = byId.get(id);
      if (ch && S.active.has(id) && !seen.has(id)) {
        ordered.push(ch);
        seen.add(id);
      }
    }
    for (const ch of S.meta.channels) {
      if (S.active.has(ch.id) && !seen.has(ch.id)) ordered.push(ch);
    }
    return ordered;
  };

  function trackTitle(ch) {
    if (ch.kind === "cyl") {
      // Nombre del cilindro y, si difiere, el ID de su electroválvula (como en el esquema: «A · Y1»).
      const id = ch.shortLabel !== ch.deviceId ? ` · ${ch.deviceId}` : "";
      return /^Cil/i.test(ch.shortLabel) ? `${ch.shortLabel}${id}` : `Cil. ${ch.shortLabel}${id}`;
    }
    if (ch.kind === "coil") return `Bob. ${ch.shortLabel}`;
    if (ch.kind === "sensor") return `FC ${ch.shortLabel}`;
    return ch.shortLabel;
  }

  function restingValueOf(ch) {
    const out = S.lastSnap?.devices?.find((d) => d.id === ch.deviceId)?.outputs;
    if (out && ch.key in out) {
      const raw = out[ch.key];
      const n = typeof raw === "boolean" ? (raw ? 1 : 0) : Number(raw?.value ?? raw);
      if (Number.isFinite(n)) return n;
    }
    const devs = spec().devices ?? [];
    const dev = devs.find((d) => d.id === ch.deviceId);
    if (!dev) return 0;
    const p = dev.params ?? {};
    if (ch.kind === "cyl") return dev.type === "jwsim/solenoid-valve-2" && p.start === "afuera" ? 1 : 0;
    if (ch.kind === "coil") return 0;
    if (ch.kind === "pressure") return dev.type === "jwsim/service-unit" ? Number(p.setpoint ?? 6) : Number(p.start ?? 8);
    if (ch.kind === "sensor") {
      const vId = dev.type === "jwsim/sensor-cylinder" ? p.cylinder : String(p.source ?? "").replace(/\.position$/, "");
      const valve = devs.find((d) => d.id === vId);
      const pos0 = valve?.type === "jwsim/solenoid-valve-2" && valve.params?.start === "afuera" ? 1 : 0;
      if (dev.type === "jwsim/sensor-cylinder") return (p.end === "extendido" ? pos0 >= 0.95 : pos0 <= 0.05) ? 1 : 0;
      const min = Number(p.min ?? 1);
      const max = Number(p.max ?? min);
      return pos0 >= min - 1e-3 && pos0 <= max + 1e-3 ? 1 : 0;
    }
    return 0;
  }

  function applyDefaultSelection(resetSelection) {
    const allIds = new Set(S.meta.channels.map((c) => c.id));
    if (resetSelection) S.order = S.meta.channels.map((c) => c.id);
    else {
      S.order = S.order.filter((id) => allIds.has(id));
      for (const c of S.meta.channels) if (!S.order.includes(c.id)) S.order.push(c.id);
    }
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

  function renderChips() {
    const bar = $("sd-chips");
    if (!bar) return;
    const kinds = [
      ["cyl", "Cilindros"],
      ["coil", "Bobinas"],
      ["sensor", "Finales"],
      ["pressure", "Presión"],
    ];
    let html = "";
    for (const [k, lbl] of kinds) {
      const ofKind = S.meta.channels.filter((c) => c.kind === k);
      if (!ofKind.length) continue;
      const anyOn = ofKind.some((c) => S.active.has(c.id));
      html +=
        `<button type="button" class="sd-chip${anyOn ? " active" : ""}" data-kind-chip="${k}" title="Clic para mostrar u ocultar ${lbl.toLowerCase()}">` +
        `<i class="sd-dot ${k}"></i><span>${lbl}</span></button>`;
    }
    bar.innerHTML = html;
  }

  function toggleKind(kind) {
    const ofKind = S.meta.channels.filter((c) => c.kind === kind);
    if (!ofKind.length) return;
    S.userCustomized = true;
    const anyOn = ofKind.some((c) => S.active.has(c.id));
    for (const c of ofKind) {
      if (anyOn) S.active.delete(c.id);
      else S.active.add(c.id);
    }
    renderChips();
    if (!$("sd-popover")?.hidden) renderPopover();
    scheduleDraw();
  }

  function removeChannel(chId) {
    if (!S.active.has(chId)) return;
    S.userCustomized = true;
    S.active.delete(chId);
    if (S.hoverTrackId === chId) S.hoverTrackId = null;
    if (S.hoverCloseId === chId) S.hoverCloseId = null;
    renderChips();
    if (!$("sd-popover")?.hidden) renderPopover();
    scheduleDraw();
  }

  function addDevice(devId) {
    if (!Core) return [];
    const toAdd = Core.channelsForDevice(S.meta, devId, S.active);
    if (!toAdd.length) return [];
    S.userCustomized = true;
    for (const id of toAdd) {
      S.active.add(id);
      if (!S.order.includes(id)) S.order.push(id);
    }
    renderChips();
    if (!$("sd-popover")?.hidden) renderPopover();
    scheduleDraw();
    return toAdd;
  }

  function setTrackStyle(chId, patch) {
    const cur = S.trackStyles.get(chId) ?? {};
    const next = { ...cur, ...patch };
    if (next.color == null) delete next.color;
    if (next.width == null) delete next.width;
    if (!next.color && !next.width) S.trackStyles.delete(chId);
    else S.trackStyles.set(chId, next);
    if (!$("sd-popover")?.hidden) renderPopover();
    if (!$("sd-style-pop")?.hidden && S.styleTargetId === chId) renderStylePop();
    scheduleDraw();
  }

  function closeStylePop() {
    const sp = $("sd-style-pop");
    if (sp) sp.hidden = true;
    S.styleTargetId = null;
  }

  function renderStylePop() {
    const sp = $("sd-style-pop");
    if (!sp || !S.styleTargetId) return;
    const ch = S.meta.channels.find((c) => c.id === S.styleTargetId);
    if (!ch) {
      closeStylePop();
      return;
    }
    const curColor = colorOf(ch);
    const curWidth = widthOf(ch);
    const swHtml = STYLE_SWATCHES.map(
      (hex) =>
        `<button type="button" class="sd-sw${curColor.toLowerCase() === hex.toLowerCase() ? " on" : ""}" data-sw-color="${hex}" style="background:${hex}" title="${hex}"></button>`,
    ).join("");
    const wHtml = LINE_WIDTHS.map(
      (w) => `<button type="button" class="small${Math.abs(curWidth - w) < 0.05 ? " primary" : ""}" data-sw-width="${w}">${w}px</button>`,
    ).join("");
    sp.innerHTML =
      `<div class="sd-style-head"><span>${esc(trackTitle(ch))}</span><button type="button" class="small ghost" data-sw-auto title="Restablecer color y grosor">Auto</button></div>` +
      `<div class="sd-style-row"><div class="sd-swatches">${swHtml}<input type="color" class="sd-sw-pick" value="${esc(curColor)}" title="Elegir color"/></div></div>` +
      `<div class="sd-style-row sd-style-widths"><span class="muted">Grosor:</span>${wHtml}</div>`;
  }

  function openStylePop(chId, topY = 12) {
    const sp = $("sd-style-pop");
    const wrap = $("sd-wrap");
    if (!sp || !wrap) return;
    S.styleTargetId = chId;
    renderStylePop();
    const tr = S.lastTracks.find((t) => t.id === chId);
    const y = tr ? tr.y + 4 - wrap.scrollTop : topY;
    sp.style.top = `${Math.max(8, Math.min(Math.max(8, wrap.clientHeight - 110), y))}px`;
    sp.hidden = false;
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
      `<select id="sd-width" aria-label="Grosor de línea" title="Grosor de todas las líneas">` +
      `<option value="1.5">1.5 px</option><option value="2.2" selected>2.2 px</option><option value="3.2">3.2 px</option><option value="4.5">4.5 px</option>` +
      `</select>` +
      `<div class="sd-pop-wrap"><button id="sd-signals-btn" class="small" aria-haspopup="true" aria-expanded="false">+ Señales</button>` +
      `<div id="sd-popover" class="sd-popover" hidden></div></div>` +
      `</div>` +
      `<div id="sd-chips" class="sd-chips"></div>` +
      `<div id="sd-readout" class="sd-readout">Sin datos aún</div>` +
      `<div class="sd-canvas-wrap" id="sd-wrap">` +
      `<canvas id="sd-canvas"></canvas>` +
      `<div id="sd-style-pop" class="sd-style-pop" hidden></div>` +
      `<div id="sd-drop-hint" class="sd-drop-hint">Suelta aquí para agregar al Diagrama de estados</div>` +
      `<div id="sd-empty" class="sd-empty">Ejecuta la simulación para trazar las curvas de estado.</div>` +
      `</div>` +
      `<div class="sd-foot">Rueda: zoom · Clic en color: estilo · Arrastra etiqueta: ordenar · ×: quitar</div>`;

    $("sd-chips").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-kind-chip]");
      if (btn) toggleKind(btn.dataset.kindChip);
    });

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
    $("sd-width").addEventListener("change", (e) => {
      const w = Number(e.target.value);
      if (Number.isFinite(w) && w > 0) {
        S.lineWidth = w;
        for (const [id, st] of S.trackStyles.entries()) {
          if (st.width != null) setTrackStyle(id, { width: undefined });
        }
        scheduleDraw();
      }
    });

    const stylePop = $("sd-style-pop");
    stylePop.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!S.styleTargetId) return;
      const sw = e.target.closest("[data-sw-color]");
      if (sw) {
        setTrackStyle(S.styleTargetId, { color: sw.dataset.swColor });
        return;
      }
      const wb = e.target.closest("[data-sw-width]");
      if (wb) {
        setTrackStyle(S.styleTargetId, { width: Number(wb.dataset.swWidth) });
        return;
      }
      if (e.target.closest("[data-sw-auto]")) {
        S.trackStyles.delete(S.styleTargetId);
        renderStylePop();
        if (!$("sd-popover")?.hidden) renderPopover();
        scheduleDraw();
      }
    });
    stylePop.addEventListener("input", (e) => {
      if (e.target.classList?.contains("sd-sw-pick") && S.styleTargetId) {
        setTrackStyle(S.styleTargetId, { color: e.target.value });
      }
    });

    const popBtn = $("sd-signals-btn");
    const pop = $("sd-popover");
    popBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeStylePop();
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
      if (!stylePop.hidden) closeStylePop();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!pop.hidden) {
          pop.hidden = true;
          popBtn.setAttribute("aria-expanded", "false");
        }
        if (!stylePop.hidden) closeStylePop();
      }
    });

    const canvas = $("sd-canvas");
    const hitTrackAt = (x, y) => {
      if (x < 0 || x >= LABEL_W) return { trackId: null, closeId: null, swatchId: null };
      for (const tr of S.lastTracks) {
        if (y >= tr.y && y < tr.y + tr.h) {
          const onClose = x >= LABEL_W - 22 && x <= LABEL_W - 4 && y >= tr.y + 4 && y <= tr.y + 22;
          const onSwatch = x >= 2 && x <= 17 && !onClose;
          return { trackId: tr.id, closeId: onClose ? tr.id : null, swatchId: onSwatch ? tr.id : null };
        }
      }
      return { trackId: null, closeId: null, swatchId: null };
    };
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (S.trackDrag) {
        for (const tr of S.lastTracks) {
          if (y >= tr.y && y < tr.y + tr.h && tr.id !== S.trackDrag.id) {
            const visIds = visibleChannels().map((c) => c.id);
            const fromIdx = visIds.indexOf(S.trackDrag.id);
            const toIdx = visIds.indexOf(tr.id);
            if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
              visIds.splice(fromIdx, 1);
              visIds.splice(toIdx, 0, S.trackDrag.id);
              const rest = S.order.filter((id) => !visIds.includes(id));
              S.order = [...visIds, ...rest];
              scheduleDraw();
            }
            break;
          }
        }
        return;
      }
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
      const hit = hitTrackAt(x, y);
      S.hoverTrackId = hit.trackId;
      S.hoverCloseId = hit.closeId;
      S.hoverSwatchId = hit.swatchId;
      canvas.style.cursor = hit.closeId || hit.swatchId ? "pointer" : hit.trackId ? "grab" : "crosshair";
      S.hoverX = x >= LABEL_W && x <= r.width - PAD_R ? x : null;
      scheduleDraw();
    });
    canvas.addEventListener("pointerleave", () => {
      if (!S.drag && !S.trackDrag) {
        S.hoverX = null;
        S.hoverTrackId = null;
        S.hoverCloseId = null;
        S.hoverSwatchId = null;
        scheduleDraw();
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < LABEL_W) {
        const hit = hitTrackAt(x, y);
        if (hit.closeId) {
          removeChannel(hit.closeId);
          return;
        }
        if (hit.swatchId) {
          e.stopPropagation();
          openStylePop(hit.swatchId, y);
          // El «click» que sigue a este pointerdown sube al document y cerraría
          // el menú recién abierto: se marca para frenarlo en el canvas.
          S.swatchClick = true;
          return;
        }
        if (hit.trackId) {
          S.trackDrag = { id: hit.trackId };
          canvas.style.cursor = "grabbing";
          canvas.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (!(recorder?.samples().length > 1)) return;
      S.drag = { x: e.clientX, active: false, endMs: S.panEndMs ?? Math.max(0, recorder.lastTimeMs()) };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("click", (e) => {
      if (S.swatchClick) {
        S.swatchClick = false;
        e.stopPropagation();
      }
    });
    canvas.addEventListener("dblclick", (e) => {
      const r = canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      for (const tr of S.lastTracks) {
        if (y >= tr.y && y < tr.y + tr.h) {
          e.stopPropagation();
          openStylePop(tr.id, y);
          return;
        }
      }
    });
    const endDrag = () => {
      S.drag = null;
      if (S.trackDrag) {
        S.trackDrag = null;
        canvas.style.cursor = S.hoverTrackId ? "grab" : "crosshair";
        scheduleDraw();
      }
    };
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

    new ResizeObserver(() => window.JwsimStateDiag?.resize?.()).observe($("sd-wrap"));
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
          `<button type="button" class="sd-dot-btn" data-style-chid="${esc(ch.id)}" style="background:${esc(colorOf(ch))}" title="Cambiar color y grosor"></button><span>${esc(ch.label)}</span></label>`;
      }
      html += `</div>`;
    }
    pop.innerHTML = html;
    for (const db of pop.querySelectorAll("[data-style-chid]")) {
      db.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pop.hidden = true;
        popBtn?.setAttribute("aria-expanded", "false");
        openStylePop(db.dataset.styleChid);
      });
    }
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
        renderChips();
        scheduleDraw();
      });
    }
    for (const inp of pop.querySelectorAll("input[data-chid]")) {
      inp.addEventListener("change", () => {
        S.userCustomized = true;
        if (inp.checked) S.active.add(inp.dataset.chid);
        else S.active.delete(inp.dataset.chid);
        renderChips();
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
      if (S.hoverTrackId === tr.ch.id || S.trackDrag?.id === tr.ch.id) {
        ctx.fillStyle = "rgba(47, 140, 255, 0.10)";
        ctx.fillRect(0, y, LABEL_W, tr.h);
      }
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + tr.h + 0.5);
      ctx.lineTo(w, y + tr.h + 0.5);
      ctx.stroke();
      y += tr.h;
    }
    S.lastTracks = tracks.map((t) => ({ id: t.ch.id, y: t.y, h: t.h }));

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
        const color = colorOf(ch);
        const fill = fillOf(ch);
        const lw = widthOf(ch);

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
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // En reposo (antes de simular): línea base punteada en el valor inicial de cada variable.
        const v0 = restingValueOf(ch);
        const y0 = yOf(v0);
        ctx.save();
        ctx.strokeStyle = colorOf(ch);
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = widthOf(ch);
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(LABEL_W, y0);
        ctx.lineTo(LABEL_W + plotW, y0);
        ctx.stroke();
        ctx.restore();
      }

      // Etiqueta izquierda de pista + pastilla interactiva de color + valor + botón ×.
      const trColor = colorOf(ch);
      const vNow = readT != null ? Core.valueAt(samples, ch, readT) : restingValueOf(ch);
      const isHovered = S.hoverTrackId === ch.id;
      const isCloseHover = S.hoverCloseId === ch.id;
      const isSwatchHover = S.hoverSwatchId === ch.id;
      ctx.fillStyle = trColor;
      ctx.fillRect(5, ty + 6, isSwatchHover ? 8 : 5, th - 12);
      if (isSwatchHover) {
        ctx.strokeStyle = COLORS.text;
        ctx.lineWidth = 1;
        ctx.strokeRect(4.5, ty + 5.5, 9, th - 11);
      }
      ctx.font = 'bold 11px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(trackTitle(ch), 16, ty + th * 0.38, LABEL_W - (isHovered ? 35 : 21));
      ctx.font = '10px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = vNow !== undefined && (ch.kind === "cyl" || ch.kind === "pressure" || vNow >= 0.5) ? trColor : COLORS.muted;
      ctx.fillText(formatVal(ch, vNow), 16, ty + th * 0.72, LABEL_W - 21);

      // Botón × en la esquina superior derecha de la etiqueta para ocultar esa pista con un clic.
      if (isHovered) {
        const bx = LABEL_W - 13;
        const by = ty + 12;
        ctx.fillStyle = isCloseHover ? "rgba(255, 93, 93, 0.22)" : "rgba(135, 148, 162, 0.16)";
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isCloseHover ? COLORS.thresh : COLORS.muted;
        ctx.fillText("×", bx, by + 0.5);
      }

      // Punto de intersección sobre el cursor.
      if (hoverInData && vNow !== undefined) {
        ctx.fillStyle = trColor;
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
        const parts = channels.slice(0, 5).map((ch) => `${ch.shortLabel}: ${formatVal(ch, restingValueOf(ch))}`);
        const extra = channels.length > 5 ? ` (+${channels.length - 5})` : "";
        readout.textContent = `En reposo (${channels.length} var.) · ${parts.join(" · ")}${extra}`;
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
      renderChips();
      if (!$("sd-popover")?.hidden) renderPopover();
      syncControls();
      scheduleDraw();
    },
    onSnapshot(snap, running = false) {
      if (snap) S.lastSnap = snap;
      S.running = !!running;
      if (recorder?.push(snap, S.running)) scheduleDraw();
      else if (!S.running && !(recorder?.samples().length > 0)) scheduleDraw();
    },
    addDevice,
    removeChannel,
    toggleKind,
    setTrackStyle,
    onSceneDragMove(clientX, clientY, devId) {
      const host = $("state-diag-pane");
      if (!host || !S.visible || !Core) return false;
      const chs = Core.channelsForDevice(S.meta, devId, S.active);
      if (!chs.length) {
        host.classList.remove("sd-drop-target");
        return false;
      }
      const r = host.getBoundingClientRect();
      const inside = r.width > 40 && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
      host.classList.toggle("sd-drop-target", inside);
      const hint = $("sd-drop-hint");
      if (hint && inside) hint.textContent = `Suelta aquí para graficar ${devId} y elegir color`;
      return inside;
    },
    onSceneDragDrop(clientX, clientY, devId) {
      const host = $("state-diag-pane");
      if (!host) return false;
      const wasTarget = host.classList.contains("sd-drop-target");
      host.classList.remove("sd-drop-target");
      if (!S.visible || !Core) return false;
      const r = host.getBoundingClientRect();
      const inside = wasTarget || (r.width > 40 && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom);
      if (!inside) return false;
      const added = addDevice(devId);
      if (added.length) {
        // Abre el selector compacto de color y grosor sin bloquear la interfaz.
        requestAnimationFrame(() => openStylePop(added[0], 12));
        return true;
      }
      return false;
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
      trackColors: visibleChannels().map((c) => ({ id: c.id, color: colorOf(c), width: widthOf(c) })),
      lineWidth: S.lineWidth,
      frozen: S.frozen,
      windowMs: S.windowMs,
    }),
  };
})();
