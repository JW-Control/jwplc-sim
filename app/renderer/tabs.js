// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Pestañas de la ventana: Programa · Esquema eléctrico · Planta 3D · Placa.
//
//   Programa           el editor con el panel de la simulación al lado (placa,
//                      o la escena si el proyecto la tiene, como siempre)
//   Esquema eléctrico  la escena a todo el ancho (vista "scene" de scene.js)
//   Planta 3D          la vista 3D a todo el ancho, con la mini placa
//   Placa              el JWPLC Basic a todo el ancho
//
// Las pestañas solo eligen qué se ve: la simulación es una sola y sigue
// corriendo al cambiar. scene.js avisa con onView() cuando cambia la vista
// por su cuenta (p. ej. al abrir un proyecto con escena).
(() => {
  const $ = (id) => document.getElementById(id);
  const TABS = ["program", "schematic", "plant", "board"];
  const VIEW = { schematic: "scene", plant: "3d", board: "board" };
  const KEY = "jwsim.tab";
  let tab = "program";
  let miniRaf = 0;

  const storeGet = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const storeSet = (v) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };

  function paint() {
    document.body.dataset.tab = tab;
    for (const b of document.querySelectorAll(".mtab")) {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    }
    $("mtab-sub-program").hidden = tab !== "program";
    $("mtab-sub-schematic").hidden = tab !== "schematic";
    miniPlc(tab === "plant");
  }

  async function select(next) {
    if (!TABS.includes(next)) return;
    tab = next;
    storeSet(tab);
    paint();
    const scene = window.JwsimScene;
    // Programa deja el panel derecho como estaba; si venía de una pestaña a
    // todo el ancho, vuelve a la placa salvo que el proyecto tenga escena.
    const view = VIEW[tab] ?? (scene?.view?.() === "3d" ? "board" : null);
    if (view && scene?.view?.() !== view) await scene?.setView(view);
    // El ancho cambió: Monaco y el lienzo 3D se reacomodan.
    window.dispatchEvent(new Event("resize"));
    plantHint();
  }

  // ---- mini placa (Planta 3D): copia de la TFT y de los LED en cada cuadro
  function miniPlc(on) {
    $("mini-plc").hidden = !on;
    cancelAnimationFrame(miniRaf);
    if (!on) return;
    const dst = $("mini-tft").getContext("2d");
    const leds = [...document.querySelectorAll("#mini-plc [data-led]")];
    const step = () => {
      const src = $("tft");
      if (src) dst.drawImage(src, 0, 0, 320, 170);
      for (const i of leds) i.classList.toggle("on", !!$(i.dataset.led)?.classList.contains("on"));
      miniRaf = requestAnimationFrame(step);
    };
    step();
  }

  // ---- Planta 3D vacía: botones para agregar equipos de planta
  function plantHint() {
    const add = $("view3d-add");
    if (!add) return;
    const empty = !$("view3d-empty").hidden && !!window.Jwsim3D;
    add.hidden = !(tab === "plant" && empty);
    const running = !!window.JwsimScene?.isRunning?.();
    for (const b of add.querySelectorAll("button")) {
      b.disabled = running;
      b.title = running ? "Detenga la simulación para agregar equipos" : "Agrega el equipo a la escena; se cablea en Esquema eléctrico";
    }
  }

  window.JwsimTabs = {
    onView(view) {
      // Una vista a todo el ancho elegida desde otro lado (menú, pruebas)
      // lleva a su pestaña; la escena de un proyecto se abre en Programa.
      if (tab === "program") return;
      const want = Object.entries(VIEW).find(([, v]) => v === view)?.[0];
      if (want && want !== tab) {
        tab = want;
        paint();
      }
    },
    onProgram(openplc) {
      const cpp = $("lang-cpp");
      const iec = $("lang-iec");
      cpp.classList.toggle("active", !openplc);
      cpp.setAttribute("aria-checked", String(!openplc));
      iec.classList.toggle("active", openplc);
      iec.setAttribute("aria-checked", String(openplc));
      iec.title = openplc
        ? "Proyecto del OpenPLC Editor: se edita en el editor; aquí se ven sus POU y la vista Ladder con depuración en vivo llega en la fase 4"
        : "Para un proyecto del OpenPLC Editor: Abrir… y elija su project.json";
    },
    select,
    current: () => tab,
  };

  for (const b of document.querySelectorAll(".mtab")) b.addEventListener("click", () => select(b.dataset.tab));
  $("mini-plc").addEventListener("click", () => select("board"));
  for (const b of document.querySelectorAll("#view3d-add [data-plant]"))
    b.addEventListener("click", async () => {
      await window.JwsimScene?.addPlant(b.dataset.plant);
      window.Jwsim3D?.show(true);
      plantHint();
    });
  // Ctrl+1 … Ctrl+4 (en captura: también con el foco en el editor).
  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i < 0) return;
      e.preventDefault();
      e.stopPropagation();
      select(TABS[i]);
    },
    true,
  );
  // La vista 3D se arma al mostrarse; el aviso de vacío puede cambiar después.
  new MutationObserver(plantHint).observe($("view3d-empty"), { attributes: true, attributeFilter: ["hidden"] });

  paint();
  const saved = storeGet();
  // Se espera a que scene.js y scene3d.js (módulo) estén listos.
  if (saved && saved !== "program") window.addEventListener("load", () => select(saved));
})();
