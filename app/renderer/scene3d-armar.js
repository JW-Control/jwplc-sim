// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Planta 3D armable (modo «Armar»): catálogo de piezas por categorías, piezas
// de ambiente sin E/S (plataforma, escalera, baranda, cerco, pisos…) y
// edición de la planta con el mouse: arrastrar para mover sobre una rejilla
// de 0,5 m (o 0,25 m), R para girar 90°, Supr para quitar.
//
// Dónde queda cada cosa (todo en la escena, se deshace con Ctrl+Z):
//   - equipo con E/S → su p3 { x, z, r } en scene.devices (crear uno aquí lo
//     crea también en el esquema, sin cablear);
//   - tablero → scene.plant3d.panel;
//   - piezas de ambiente → scene.plant3d.pieces[] { id, kind, x, z, r, params }.
// scene3d.js dibuja la planta (rebuild) y marca cada grupo movible con
// userData.arm = { kind: "dev" | "panel" | "piece", id }.
import * as THREE from "three";

const deg = (r) => THREE.MathUtils.degToRad(r ?? 0);

/**
 * Huella del grupo sobre el piso (caja en coordenadas del mundo), sin los
 * rótulos: es lo que se alinea a la rejilla, no el origen del modelo (que en
 * unos equipos es una esquina y en otros el centro).
 */
export function footprint(g) {
  const bb = new THREE.Box3();
  g.updateMatrixWorld(true);
  // Solo el cuerpo del equipo: lo que tenía al alinearse la primera vez. Los
  // sensores y balizas que se le pegan después sobresalen sin correrlo.
  if (!g.userData.body) g.userData.body = [...g.children];
  for (const c of g.userData.body) c.traverse((o) => {
    if (o.userData?.isLabel || o.isSprite || !o.isMesh) return;
    let p = o.parent;
    while (p && p !== g) {
      if (p.userData?.isLabel) return;
      p = p.parent;
    }
    bb.expandByObject(o, false);
  });
  return bb;
}

/**
 * Lleva la huella del grupo a la rejilla: su esquina de menor x y menor z
 * cae en una línea. mode "ceil" solo corre hacia +x/+z (acomodo automático,
 * para no pisar al vecino); "round" va a la línea más cercana.
 * Devuelve cuánto se corrió { dx, dz }.
 */
export function gridAlign(g, grid = 0.5, mode = "round") {
  const bb = footprint(g);
  if (bb.isEmpty()) return { dx: 0, dz: 0 };
  const f = mode === "ceil" ? Math.ceil : Math.round;
  const q = (v) => f(+(v / grid).toFixed(6)) * grid;
  const dx = q(bb.min.x) - bb.min.x;
  const dz = q(bb.min.z) - bb.min.z;
  g.position.x = +(g.position.x + dx).toFixed(6);
  g.position.z = +(g.position.z + dz).toFixed(6);
  return { dx, dz };
}

/** Piezas de ambiente: nombre, medidas por defecto (m) y qué medidas se editan. */
export const PIECES = {
  plataforma: { name: "Plataforma con columnas", params: { ancho: 2, largo: 2, alto: 1.5 } },
  escalera: { name: "Escalera", params: { ancho: 0.8, alto: 1.5 } },
  baranda: { name: "Baranda", params: { largo: 2 } },
  cerco: { name: "Cerco de malla", params: { largo: 2, alto: 2 } },
  poste: { name: "Poste de protección", params: {} },
  franja: { name: "Franja amarilla de piso", params: { largo: 2, ancho: 0.1 } },
  paso: { name: "Paso peatonal", params: { largo: 2, ancho: 1 } },
  piso: { name: "Piso epóxico", params: { ancho: 2, largo: 2 } },
  caja: { name: "Caja de cartón", params: {} },
  pallet: { name: "Pallet", params: {} },
};

/**
 * Catálogo del panel. type: equipo de la escena (con E/S; se crea también en
 * el esquema). piece: pieza de ambiente. soon: llega en la fase 3.
 */
export const CATALOG = [
  { cat: "Transporte", items: [{ name: "Cinta transportadora", type: "jwsim/conveyor" }, { name: "Montacargas", type: "jwsim/lift" }, { name: "Puerta automática", type: "jwsim/door" }] },
  { cat: "Fluidos", items: [{ name: "Tanque", type: "jwsim/tank" }, { name: "Filtro de arena", type: "jwsim/sand-filter" }, { name: "Dosificador de cloro", type: "jwsim/chlorinator" }, { name: "Electroválvula de agua", type: "jwsim/water-valve" }] },
  { cat: "Neumática", items: [{ name: "Cilindro con válvula 5/2 biestable", type: "jwsim/solenoid-valve-2" }, { name: "Cilindro con válvula 5/2 monoestable", type: "jwsim/solenoid-valve" }, { name: "Compresor", type: "jwsim/compressor" }, { name: "Unidad de mantenimiento FR", type: "jwsim/service-unit" }] },
  { cat: "Motores y avisos", items: [{ name: "Motor trifásico", type: "jwsim/motor-3ph" }, { name: "Sirena", type: "jwsim/buzzer" }] },
  { cat: "Sensores", items: [{ name: "Final de carrera", soon: true }, { name: "Sensor inductivo", soon: true }, { name: "Fotocelda", soon: true }, { name: "Sensor de nivel", soon: true }] },
  { cat: "Estructura", items: ["plataforma", "escalera", "baranda", "cerco", "poste"].map((k) => ({ name: PIECES[k].name, piece: k })) },
  { cat: "Ambiente", items: ["piso", "franja", "paso", "caja", "pallet"].map((k) => ({ name: PIECES[k].name, piece: k })) },
];

/** Nombres de las medidas en el panel de propiedades. */
const DIMS = { ancho: "Ancho (m)", largo: "Largo (m)", alto: "Alto (m)" };

/**
 * Dibuja una pieza de ambiente. Origen: esquina de la pieza sobre el piso
 * (x hacia la derecha, z hacia adelante), para que encaje en la rejilla.
 * h = { mat, box, cyl, meshPanel } de scene3d.js.
 */
export function buildPiece(kind, params, h) {
  const p = { ...(PIECES[kind]?.params ?? {}), ...(params ?? {}) };
  const { mat, box, cyl, meshPanel } = h;
  const g = new THREE.Group();
  const yellow = mat(0xf2b705, { metalness: 0.2, roughness: 0.55 });
  const steel = mat(0x5b6470, { metalness: 0.5, roughness: 0.45 });
  const add = (m, x, y, z) => (m.position.set(x, y, z), g.add(m), m);
  if (kind === "plataforma") {
    const W = p.ancho, L = p.largo, H = p.alto;
    add(box(W, 0.08, L, mat(0x6b737d, { metalness: 0.6, roughness: 0.35 })), W / 2, H - 0.04, L / 2);
    const nx = Math.max(1, Math.ceil(W / 3));
    const nz = Math.max(1, Math.ceil(L / 3));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) add(box(0.08, H - 0.08, 0.08, steel), 0.04 + (i * (W - 0.08)) / nx, (H - 0.08) / 2, 0.04 + (j * (L - 0.08)) / nz);
    // Vigas de borde (amarillas: borde de piso elevado).
    add(box(W, 0.06, 0.04, yellow), W / 2, H - 0.11, 0.02);
    add(box(W, 0.06, 0.04, yellow), W / 2, H - 0.11, L - 0.02);
  } else if (kind === "escalera") {
    // Sube hacia +z: un peldaño cada ~0.2 m, huella 0.25 m.
    const W = p.ancho, H = p.alto;
    const n = Math.max(2, Math.round(H / 0.2));
    const rise = H / n;
    const run = 0.25;
    for (let i = 0; i < n; i++) add(box(W, 0.04, run, mat(0x6b737d, { metalness: 0.6 })), W / 2, (i + 1) * rise - 0.02, i * run + run / 2);
    const len = Math.hypot(n * run, H);
    for (const x of [0.02, W - 0.02]) {
      const s = add(box(0.04, 0.14, len, steel), x, H / 2, (n * run) / 2);
      s.rotation.x = -Math.atan2(H, n * run);
      const rail = add(box(0.035, 0.035, len, yellow), x, H / 2 + 0.95, (n * run) / 2);
      rail.rotation.x = s.rotation.x;
      for (const t of [0.05, 0.95]) add(box(0.035, 0.95, 0.035, yellow), x, t * H + 0.475, t * n * run);
    }
  } else if (kind === "baranda") {
    const L = p.largo;
    for (const [y, th] of [[1.0, 0.04], [0.5, 0.03], [0.07, 0.14]]) add(box(L, th, 0.035, yellow), L / 2, y, 0);
    const k = Math.max(1, Math.ceil(L / 1));
    for (let i = 0; i <= k; i++) add(box(0.045, 1.02, 0.045, yellow), 0.02 + (i * (L - 0.04)) / k, 0.51, 0);
  } else if (kind === "cerco") {
    const L = p.largo, H = p.alto;
    const m = meshPanel(L - 0.06, H - 0.1, true);
    add(m, L / 2, H / 2 + 0.05, 0);
    const k = Math.max(1, Math.ceil(L / 2.5));
    for (let i = 0; i <= k; i++) add(box(0.06, H, 0.06, mat(0xe07a1f, { roughness: 0.5 })), 0.03 + (i * (L - 0.06)) / k, H / 2, 0);
    add(box(L, 0.04, 0.04, steel), L / 2, H - 0.02, 0);
  } else if (kind === "poste") {
    add(cyl(0.12, 0.02, steel, 20), 0, 0.01, 0);
    for (let i = 0; i < 6; i++) add(cyl(0.06, 0.2, mat(i % 2 ? 0x1b1e22 : 0xf2b705), 16), 0, 0.1 + i * 0.2, 0);
  } else if (kind === "franja") {
    add(box(p.largo, 0.006, p.ancho, mat(0xf2b705, { roughness: 0.7 })), p.largo / 2, 0.003, p.ancho / 2);
  } else if (kind === "paso") {
    const L = p.largo, W = p.ancho;
    const n = Math.max(2, Math.floor(L / 0.4));
    for (let i = 0; i < n; i++) add(box(L / n - 0.02, 0.006, W, mat(i % 2 ? 0xf4f5f6 : 0xf2b705, { roughness: 0.7 })), (i + 0.5) * (L / n), 0.003, W / 2);
  } else if (kind === "piso") {
    add(box(p.ancho, 0.01, p.largo, mat(0x4f8a6b, { roughness: 0.35, metalness: 0.05 })), p.ancho / 2, 0.005, p.largo / 2);
  } else if (kind === "caja") {
    add(box(0.4, 0.3, 0.3, mat(0xb98a4e, { roughness: 0.9 })), 0.2, 0.15, 0.15);
    add(box(0.41, 0.05, 0.02, mat(0xd8c49a)), 0.2, 0.28, 0.15);
  } else if (kind === "pallet") {
    const wood = mat(0xa87a3c, { roughness: 0.9 });
    for (const z of [0.05, 0.5, 0.95]) add(box(1.2, 0.1, 0.1, wood), 0.6, 0.05, z);
    for (let i = 0; i < 7; i++) add(box(0.1, 0.02, 1.0, wood), 0.06 + i * 0.18, 0.11, 0.5);
  }
  return g;
}

/**
 * Modo «Armar» sobre la vista 3D. ctx = { V, refresh() } (V: estado de
 * scene3d.js; refresh vuelve a dibujar si cambió la escena).
 */
export function setupArmar(ctx) {
  const { V } = ctx;
  const Sc = () => window.JwsimScene;
  const canvas = V.renderer.domElement;
  const host = canvas.parentElement;
  const A = { on: false, sel: null, drag: null, armed: null, helper: null };
  V.armar = A;
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const grid = () => Number(Sc()?.specForView?.()?.plant3d?.grid ?? 0.5) || 0.5;
  const snap = (v) => Math.round(v / grid()) * grid();
  const running = () => !!Sc()?.isRunning?.();
  const setPtr = (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, V.camera);
  };
  const groundAt = (e) => {
    setPtr(e);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, p) ? p : null;
  };
  const armOf = (o) => {
    for (let q = o; q; q = q.parent) if (q.userData?.arm) return q;
    return null;
  };
  const pickArm = (e) => {
    setPtr(e);
    for (const h of ray.intersectObjects(V.root.children, true)) {
      if (h.object.userData?.isLabel) continue;
      const g = armOf(h.object);
      if (g) return g;
    }
    return null;
  };

  // ---- interfaz: botón, panel de piezas y propiedades
  const btn = document.createElement("button");
  btn.id = "view3d-armar";
  btn.type = "button";
  btn.className = "view3d-armar";
  btn.textContent = "Armar";
  btn.title = "Armar la planta: agregar piezas, mover (arrastrar), girar (R) y quitar (Supr)";
  btn.setAttribute("aria-pressed", "false");
  host.appendChild(btn);
  const panel = document.createElement("aside");
  panel.id = "view3d-build";
  panel.className = "view3d-build";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="vb-head">Piezas</div>
    <input class="vb-search" id="vb-search" type="search" placeholder="Buscar una pieza…" aria-label="Buscar una pieza">
    <select class="vb-cat" id="vb-cat" aria-label="Categoría"><option value="">Todas</option>${CATALOG.map((c) => `<option>${c.cat}</option>`).join("")}</select>
    <div class="vb-count" id="vb-count"></div>
    <div class="vb-list" id="vb-list"></div>
    <div class="vb-props" id="vb-props"></div>
    <div class="vb-foot">
      <label>Rejilla <select id="vb-grid"><option value="0.5">0,5 m</option><option value="0.25">0,25 m</option></select></label>
      <button type="button" id="vb-auto" title="Todos los equipos y el tablero vuelven a su lugar automático (las piezas de ambiente se quedan)">Acomodo automático</button>
    </div>`;
  host.appendChild(panel);
  const $ = (id) => panel.querySelector(`#${id}`);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function paintList() {
    const q = $("vb-search").value.trim().toLowerCase();
    const cat = $("vb-cat").value;
    let n = 0;
    let html = "";
    for (const c of CATALOG) {
      if (cat && c.cat !== cat) continue;
      const items = c.items.filter((it) => !q || it.name.toLowerCase().includes(q));
      if (!items.length) continue;
      html += `<div class="vb-cat-name">${esc(c.cat)}</div>`;
      for (const it of items) {
        n++;
        const key = it.type ? `type:${it.type}` : it.piece ? `piece:${it.piece}` : "";
        html += it.soon
          ? `<div class="vb-item soon" title="Llega con los anclajes de sensores">${esc(it.name)}<span>Pronto</span></div>`
          : `<div class="vb-item${A.armed === key ? " armed" : ""}" draggable="true" data-key="${esc(key)}" title="Arrastre a la planta, o clic y luego clic en el piso">${esc(it.name)}${it.type ? `<span class="vb-io">E/S</span>` : ""}</div>`;
      }
    }
    $("vb-list").innerHTML = html || `<div class="vb-empty">Nada con ese nombre.</div>`;
    $("vb-count").textContent = `${n} piezas`;
  }

  function paintProps() {
    const box = $("vb-props");
    const s = A.sel;
    if (!s) {
      box.innerHTML = `<div class="vb-hint">Arrastre una pieza para moverla. R gira 90°, Supr la quita, Esc suelta.</div>`;
      return;
    }
    const spec = Sc().specForView();
    let html = "";
    if (s.kind === "piece") {
      const pc = (spec.plant3d?.pieces ?? []).find((q) => q.id === s.id);
      if (!pc) return void (box.innerHTML = "");
      const p = { ...(PIECES[pc.kind]?.params ?? {}), ...(pc.params ?? {}) };
      html += `<div class="vb-sel">${esc(PIECES[pc.kind]?.name ?? pc.kind)} <small>${esc(pc.id)}</small></div>`;
      for (const k of Object.keys(PIECES[pc.kind]?.params ?? {}))
        html += `<label class="vb-dim">${DIMS[k]} <input type="number" step="${grid()}" min="0.1" data-dim="${k}" value="${p[k]}"></label>`;
    } else if (s.kind === "panel") {
      html += `<div class="vb-sel">Tablero</div><div class="vb-hint">Sus equipos se editan en el esquema.</div>`;
    } else {
      const d = spec.devices.find((q) => q.id === s.id);
      html += `<div class="vb-sel">${esc(s.id)} <small>${esc(d?.type?.split("/")[1] ?? "")}</small></div><div class="vb-hint">Equipo con E/S: se cablea y se configura en Esquema eléctrico.</div>`;
    }
    html += `<div class="vb-actions"><button type="button" data-act="rot">Girar 90° (R)</button>${s.kind === "panel" ? "" : `<button type="button" data-act="del">Quitar (Supr)</button>`}</div>`;
    box.innerHTML = html;
  }

  /** Con la simulación en marcha no se arma: el botón se apaga y el modo se cierra. */
  function syncRun() {
    if (A.on && running()) setOn(false);
    btn.disabled = running();
    btn.title = running() ? "Detenga la simulación para armar la planta" : "Armar la planta: agregar piezas, mover (arrastrar), girar (R) y quitar (Supr)";
  }

  function setOn(on) {
    if (on && running()) return;
    A.on = on;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    panel.hidden = !on;
    host.classList.toggle("armando", on);
    V.keepCamera = on;
    if (!on) {
      select(null);
      A.armed = null;
    }
    $("vb-grid").value = String(grid());
    paintGrid();
    paintList();
    paintProps();
  }

  /**
   * Rejilla visible mientras se arma: líneas finas cada 0,5 m (o 0,25 m) y
   * marcadas cada 2 m, que coinciden con las juntas de la losa.
   */
  function paintGrid() {
    const g = grid();
    if (A.gridMesh && (A.gridMesh.userData.step !== g || !A.on)) {
      A.gridMesh.removeFromParent();
      A.gridMesh.traverse((o) => o.geometry?.dispose());
      A.gridMesh = null;
    }
    if (!A.on || A.gridMesh) return;
    const SIZE = 40;
    const grp = new THREE.Group();
    const fine = new THREE.GridHelper(SIZE, Math.round(SIZE / g), 0x37d67a, 0x3d4650);
    fine.material.transparent = true;
    fine.material.opacity = 0.55;
    fine.material.depthWrite = false;
    const major = new THREE.GridHelper(SIZE, SIZE / 2, 0x37d67a, 0x37d67a);
    major.material.transparent = true;
    major.material.opacity = 0.45;
    major.material.depthWrite = false;
    major.position.y = 0.001;
    grp.add(fine, major);
    grp.position.y = 0.006;
    grp.renderOrder = -1;
    grp.userData.step = g;
    V.scene.add(grp);
    A.gridMesh = grp;
  }

  function select(s) {
    A.sel = s;
    if (A.helper) {
      A.helper.removeFromParent();
      A.helper = null;
    }
    const g = s ? V.armIndex?.get(`${s.kind}:${s.id}`) : null;
    if (g) {
      A.helper = new THREE.BoxHelper(g, 0x37d67a);
      A.helper.material.depthTest = false;
      A.helper.renderOrder = 10;
      V.scene.add(A.helper);
    } else if (s) A.sel = null;
    paintProps();
  }

  /** Lugar actual { x, z, r } de un grupo movible. */
  const placeOf = (g) => ({ x: +g.position.x.toFixed(3), z: +g.position.z.toFixed(3), r: (Math.round(THREE.MathUtils.radToDeg(g.rotation.y) / 90) * 90 + 360) % 360 });
  const clean = (p) => ({ x: p.x, z: p.z, ...(p.r ? { r: p.r } : {}) });

  /** Guarda en la escena el lugar de lo seleccionado (deshace con Ctrl+Z). */
  function commit(kind, id, p) {
    const sc = Sc();
    if (kind === "dev") return sc.place3d(id, clean(p));
    if (kind === "panel") return sc.editPlant3d((pl) => ({ ...pl, panel: clean(p) }));
    return sc.editPlant3d((pl) => ({ ...pl, pieces: (pl.pieces ?? []).map((q) => (q.id === id ? { ...q, ...clean(p), ...(p.r ? {} : { r: undefined }) } : q)) }));
  }

  function rotate() {
    const s = A.sel;
    const g = s && V.armIndex?.get(`${s.kind}:${s.id}`);
    if (!g || running()) return;
    // Gira sobre su lugar y vuelve a apoyar la huella en la rejilla.
    g.rotation.y += Math.PI / 2;
    gridAlign(g, grid());
    commit(s.kind, s.id, placeOf(g));
  }

  function remove() {
    const s = A.sel;
    if (!s || running() || s.kind === "panel") return;
    select(null);
    if (s.kind === "dev") Sc().removeDevice(s.id);
    else Sc().editPlant3d((pl) => ({ ...pl, pieces: (pl.pieces ?? []).filter((q) => q.id !== s.id) }));
  }

  /** Crea lo del catálogo en (x, z): un equipo (también en el esquema) o una pieza de ambiente. */
  async function create(key, x, z) {
    if (running() || !key) return;
    const [kind, what] = key.split(":");
    const p = { x: snap(x), z: snap(z) };
    if (kind === "type") {
      const id = await Sc().addPlant(what, p);
      if (id) A.pending = { kind: "dev", id };
    } else {
      const spec = Sc().specForView();
      const used = new Set((spec.plant3d?.pieces ?? []).map((q) => q.id));
      let n = 1;
      while (used.has(`A${n}`)) n++;
      const id = `A${n}`;
      Sc().editPlant3d((pl) => ({ ...pl, pieces: [...(pl.pieces ?? []), { id, kind: what, ...p }] }));
      A.pending = { kind: "piece", id };
    }
    ctx.refresh();
    if (A.pending) {
      select(A.pending);
      A.pending = null;
    }
  }

  // ---- eventos
  btn.addEventListener("click", () => setOn(!A.on));
  $("vb-search").addEventListener("input", paintList);
  $("vb-cat").addEventListener("change", paintList);
  $("vb-grid").addEventListener("change", (e) => {
    const g = Number(e.target.value);
    Sc().editPlant3d((pl) => ({ ...pl, grid: g === 0.5 ? undefined : g }));
  });
  $("vb-auto").addEventListener("click", () => {
    if (!running()) Sc().resetPlant3d();
  });
  $("vb-list").addEventListener("click", (e) => {
    const it = e.target.closest(".vb-item[data-key]");
    if (!it) return;
    A.armed = A.armed === it.dataset.key ? null : it.dataset.key;
    host.classList.toggle("poniendo", !!A.armed);
    paintList();
  });
  $("vb-list").addEventListener("dragstart", (e) => {
    const it = e.target.closest(".vb-item[data-key]");
    if (!it) return;
    e.dataTransfer.setData("text/x-jwsim-pieza", it.dataset.key);
    e.dataTransfer.effectAllowed = "copy";
  });
  canvas.addEventListener("dragover", (e) => {
    if (A.on && e.dataTransfer.types.includes("text/x-jwsim-pieza")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  canvas.addEventListener("drop", (e) => {
    const key = e.dataTransfer.getData("text/x-jwsim-pieza");
    if (!A.on || !key) return;
    e.preventDefault();
    const p = groundAt(e);
    if (p) create(key, p.x, p.z);
  });
  $("vb-props").addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "rot") rotate();
    if (a === "del") remove();
  });
  $("vb-props").addEventListener("change", (e) => {
    const k = e.target.dataset?.dim;
    const s = A.sel;
    const v = Number(e.target.value);
    if (!k || !s || s.kind !== "piece" || !(v > 0)) return;
    Sc().editPlant3d((pl) => ({ ...pl, pieces: (pl.pieces ?? []).map((q) => (q.id === s.id ? { ...q, params: { ...(q.params ?? {}), [k]: v } } : q)) }));
  });

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (!A.on || e.button !== 0 || running()) return;
      if (A.armed) {
        const p = groundAt(e);
        e.stopImmediatePropagation();
        const key = A.armed;
        A.armed = null;
        host.classList.remove("poniendo");
        paintList();
        if (p) create(key, p.x, p.z);
        return;
      }
      const g = pickArm(e);
      if (!g) {
        select(null);
        return;
      }
      e.stopImmediatePropagation();
      const { kind, id } = g.userData.arm;
      select({ kind, id });
      const p0 = groundAt(e);
      if (!p0) return;
      // Se arrastra la huella: su esquina queda sobre las líneas de la rejilla.
      const fb = footprint(g);
      A.drag = { g, kind, id, p0, x0: g.position.x, z0: g.position.z, ox: fb.min.x - g.position.x, oz: fb.min.z - g.position.z, moved: false };
      V.controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    },
    { capture: true },
  );
  canvas.addEventListener("pointermove", (e) => {
    const d = A.drag;
    if (!d) {
      if (A.on && !e.buttons) canvas.style.cursor = A.armed ? "crosshair" : pickArm(e) ? "move" : "";
      return;
    }
    const p = groundAt(e);
    if (!p) return;
    const x = +(snap(d.x0 + p.x - d.p0.x + d.ox) - d.ox).toFixed(6);
    const z = +(snap(d.z0 + p.z - d.p0.z + d.oz) - d.oz).toFixed(6);
    if (x !== d.g.position.x || z !== d.g.position.z) {
      d.g.position.x = x;
      d.g.position.z = z;
      d.moved = true;
      A.helper?.update();
    }
  });
  const end = () => {
    const d = A.drag;
    if (!d) return;
    A.drag = null;
    V.controls.enabled = true;
    if (d.moved) commit(d.kind, d.id, placeOf(d.g));
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  window.addEventListener("keydown", (e) => {
    if (!A.on || !V.visible || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") || document.activeElement?.closest?.(".monaco-editor")) return;
    if (e.key === "r" || e.key === "R") rotate();
    else if (e.key === "Delete" || e.key === "Supr") remove();
    else if (e.key === "Escape") {
      A.armed = null;
      host.classList.remove("poniendo");
      select(null);
      paintList();
    } else return;
    e.preventDefault();
  });

  return {
    setOn,
    /** Tras volver a dibujar: la selección sigue al mismo equipo o pieza. */
    afterRebuild() {
      paintGrid();
      if (A.helper) A.helper.removeFromParent();
      A.helper = null;
      if (A.sel) select(A.sel);
      syncRun();
      if (A.on) paintProps();
    },
    syncRun,
    select,
    create,
    state: () => ({ on: A.on, sel: A.sel, armed: A.armed, grid: grid(), gridShown: A.gridMesh?.userData.step ?? null }),
  };
}
