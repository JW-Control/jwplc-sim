// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Vista 3D (G8 3D_SCENES): los equipos de planta de la escena (cinta, tanque,
// puerta y el cilindro de la electroválvula 5/2) en three.js, movidos por
// las instantáneas de la escena. Entre instantáneas, lo que se mueve a
// velocidad conocida (piezas, nivel, puerta, vástago) se extrapola para que
// la animación sea continua. Los sensores enlazados a un equipo de planta
// (source) aparecen como balizas que se encienden al detectar; los sensores
// magnéticos de cilindro, montados sobre el tubo en su extremo.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COL = {
  frame: 0x5b6470, belt: 0x23272d, roller: 0x9aa3ad, piece: 0xf08a24, floor: 0x1b1f24, grid: 0x2c333b,
  tank: 0xb8c4d0, water: 0x2f8cff, pump: 0x3f7fbf, door: 0xc9cfd6, post: 0x4b5563, rod: 0xdfe3e8, body: 0x7b8794,
  on: 0x37d67a, off: 0x3a4048, warn: 0xffb020, person: 0xe2b48c,
};
const CYLINDERS = new Set(["jwsim/solenoid-valve", "jwsim/solenoid-valve-2"]);
const PLANT = new Set(["jwsim/conveyor", "jwsim/tank", "jwsim/door", "jwsim/solenoid-valve", "jwsim/solenoid-valve-2"]);
const SENSORS = new Set(["jwsim/limit-switch", "jwsim/sensor-inductive", "jwsim/sensor-photoelectric", "jwsim/sensor-cylinder"]);
/** Equipo.salida que acciona un sensor (el magnético de cilindro lo arma con su cilindro). */
const sourceOf = (s) => (s.type === "jwsim/sensor-cylinder" ? (s.params?.cylinder ? `${s.params.cylinder}.position` : "") : String(s.params?.source ?? ""));
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...extra });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, h, m, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

/** Texto en un plano siempre de frente (rótulo del equipo). */
function label(text) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(20,23,27,0.85)";
  g.roundRect(0, 8, 256, 48, 10);
  g.fill();
  g.fillStyle = "#e7ebef";
  g.font = "bold 28px sans-serif";
  g.textAlign = "center";
  g.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

/** Baliza de un sensor enlazado: poste y luz. */
function beacon() {
  const g = new THREE.Group();
  const post = cyl(0.03, 0.5, mat(COL.post));
  post.position.y = 0.25;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), mat(COL.off, { emissive: 0x000000 }));
  lamp.position.y = 0.55;
  g.add(post, lamp);
  g.userData.lamp = lamp;
  return g;
}
/** Sensor magnético montado en la ranura del cilindro, con su LED. */
function slotSensor() {
  const g = new THREE.Group();
  const bodyS = box(0.12, 0.035, 0.04, mat(0x1f2328));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), mat(COL.off, { emissive: 0x000000 }));
  lamp.position.set(0.04, 0.025, 0);
  const cable = cyl(0.008, 0.25, mat(0x2a2e33), 8);
  cable.rotation.z = Math.PI / 2;
  cable.position.set(-0.17, 0, 0);
  g.add(bodyS, lamp, cable);
  g.userData.lamp = lamp;
  return g;
}
function lightBeacon(b, on) {
  b.userData.lamp.material.color.setHex(on ? COL.on : COL.off);
  b.userData.lamp.material.emissive.setHex(on ? 0x1f8a46 : 0x000000);
}

// ------------------------------------------------------------ modelos
function buildConveyor(p) {
  const L = Math.max(0.2, Number(p.largo ?? 2));
  const W = 0.5;
  const g = new THREE.Group();
  const frame = mat(COL.frame);
  for (const z of [-W / 2 - 0.03, W / 2 + 0.03]) {
    const rail = box(L + 0.1, 0.12, 0.05, frame);
    rail.position.set(L / 2, 0.7, z);
    g.add(rail);
  }
  for (const x of [0.1, L - 0.1]) {
    for (const z of [-W / 2, W / 2]) {
      const leg = box(0.06, 0.7, 0.06, frame);
      leg.position.set(x, 0.35, z);
      g.add(leg);
    }
  }
  // Banda con franjas que se desplazan con el avance.
  const tc = document.createElement("canvas");
  tc.width = 64;
  tc.height = 64;
  const tg = tc.getContext("2d");
  tg.fillStyle = "#23272d";
  tg.fillRect(0, 0, 64, 64);
  tg.fillStyle = "#353b43";
  tg.fillRect(0, 0, 10, 64);
  const tex = new THREE.CanvasTexture(tc);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(L / 0.2, 1);
  const belt = box(L, 0.04, W, mat(0xffffff, { map: tex }));
  belt.position.set(L / 2, 0.72, 0);
  g.add(belt);
  const rollers = [];
  for (const x of [0, L]) {
    const r = cyl(0.05, W, mat(COL.roller), 16);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 0.7, 0);
    g.add(r);
    rollers.push(r);
  }
  const pieces = new THREE.Group();
  g.add(pieces);
  return { group: g, belt: tex, rollers, pieces, L, W, len: Number(p.pieza ?? 0.2), sA: Number(p.sensorA ?? 0.4), sB: Number(p.sensorB ?? 1.7), size: [L, W] };
}

function buildTank(p) {
  const R = 0.6;
  const H = 1.6;
  const g = new THREE.Group();
  const shell = cyl(R, H, mat(COL.tank, { transparent: true, opacity: 0.28, roughness: 0.2, depthWrite: false }), 40);
  shell.position.y = H / 2 + 0.2;
  const water = cyl(R * 0.97, 1, mat(COL.water, { transparent: true, opacity: 0.85 }), 40);
  water.position.y = 0.2;
  const base = cyl(R + 0.05, 0.2, mat(COL.frame), 40);
  base.position.y = 0.1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.02, 8, 48), mat(COL.frame));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H + 0.2;
  // Bomba al costado con su caño al tanque.
  const pump = new THREE.Group();
  const housing = cyl(0.18, 0.25, mat(COL.pump), 20);
  housing.rotation.z = Math.PI / 2;
  const impeller = box(0.3, 0.04, 0.04, mat(COL.rod));
  impeller.rotation.z = Math.PI / 2;
  pump.add(housing, impeller);
  pump.position.set(R + 0.55, 0.25, 0);
  const pipe = cyl(0.04, H + 0.1, mat(COL.roller), 12);
  pipe.position.set(R + 0.3, (H + 0.3) / 2 + 0.1, 0);
  const pipeTop = cyl(0.04, 0.35, mat(COL.roller), 12);
  pipeTop.rotation.z = Math.PI / 2;
  pipeTop.position.set(R + 0.13, H + 0.3, 0);
  g.add(shell, water, base, rim, pump, pipe, pipeTop);
  return { group: g, water, impeller, H, R, size: [2 * R + 0.8, 2 * R] };
}

function buildDoor(p) {
  const A = Math.max(1, Number(p.ancho ?? 3));
  const Hd = 2.2;
  const g = new THREE.Group();
  const post = mat(COL.post);
  for (const x of [0, A]) {
    const s = box(0.12, Hd + 0.2, 0.12, post);
    s.position.set(x, (Hd + 0.2) / 2, 0);
    g.add(s);
  }
  const beam = box(2 * A + 0.3, 0.12, 0.12, post);
  beam.position.set(A, Hd + 0.26, 0);
  g.add(beam);
  const panel = box(A - 0.1, Hd, 0.06, mat(COL.door, { metalness: 0.4 }));
  panel.position.set(A / 2, Hd / 2 + 0.05, 0.12);
  g.add(panel);
  // Haz de la fotocelda y la persona.
  const ray = box(A - 0.12, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: 0xff3b26, transparent: true, opacity: 0.8 }));
  ray.position.set(A / 2, 0.6, -0.2);
  const person = new THREE.Group();
  const torso = cyl(0.18, 1.1, mat(0x3e7bd6), 16);
  torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat(COL.person));
  head.position.y = 1.65;
  person.add(torso, head);
  person.position.set(A / 2, 0, -0.5);
  g.add(ray, person);
  return { group: g, panel, ray, person, A, size: [2 * A, 1] };
}

// Cilindro de doble efecto sobre un panel ranurado de aluminio, como en los
// módulos didácticos de electroneumática: tapas oscuras, tubo de acero,
// vástago cromado con cabeza redondeada y conectores azules.
const CYL = { y: 1.0, z: 0.1, capR: 0.075, tubeR: 0.06, rear: 0.06, front: 0.74, S: 0.5, rodOut: 0.1, headR: 0.045, K: 1.8 };
function buildCylinder(p) {
  const { y, z, S } = CYL;
  const g = new THREE.Group();
  // El cilindro, sus sensores y finales van en un grupo propio a escala K
  // (medidas de arriba en su sistema), con el eje a 1,1 m del piso.
  const c = new THREE.Group();
  c.scale.setScalar(CYL.K);
  c.position.y = 1.1 - CYL.K * y;
  const alu = mat(0xc9ced5, { metalness: 0.3, roughness: 0.45 });
  const dark = mat(0x23272d, { roughness: 0.5 });
  const blue = mat(0x1f6fd1, { roughness: 0.45 });
  const steel = mat(0xd5dbe1, { metalness: 0.35, roughness: 0.3 });
  const chrome = mat(0xf2f4f6, { metalness: 0.45, roughness: 0.15 });
  // Panel ranurado (cubre el hueco hasta el equipo vecino) y su pie.
  const PW = 3.8; // ancho del panel: cubre el equipo (2,6 m) y el hueco al vecino
  const panel = box(PW, 1.3, 0.03, alu);
  panel.position.set(1.3, 0.95, -0.04);
  g.add(panel);
  for (let i = 0; i < 12; i++) {
    const slot = box(PW, 0.012, 0.01, mat(0x8a929c));
    slot.position.set(1.3, 0.36 + i * 0.1, -0.02);
    g.add(slot);
  }
  const foot = box(PW, 0.08, 0.5, alu);
  foot.position.set(1.3, 0.04, 0.1);
  g.add(foot, c);
  // Soportes con perilla azul de fijación rápida.
  for (const x of [0.03, 0.71]) {
    const brk = box(0.07, 0.1, 0.12, dark);
    brk.position.set(x, y - 0.07, z - 0.04);
    const knob = cyl(0.028, 0.03, blue, 16);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, y - 0.12, z + 0.035);
    c.add(brk, knob);
  }
  // Tapas, tubo y conectores de aire.
  const capA = cyl(CYL.capR, CYL.rear, dark, 32);
  capA.rotation.z = Math.PI / 2;
  capA.position.set(CYL.rear / 2, y, z);
  const tube = cyl(CYL.tubeR, CYL.front - CYL.rear - 0.06, steel, 32);
  tube.rotation.z = Math.PI / 2;
  tube.position.set((CYL.rear + CYL.front - 0.06) / 2, y, z);
  const capB = cyl(CYL.capR, 0.06, dark, 32);
  capB.rotation.z = Math.PI / 2;
  capB.position.set(CYL.front - 0.03, y, z);
  const neck = cyl(0.035, 0.03, dark, 24);
  neck.rotation.z = Math.PI / 2;
  neck.position.set(CYL.front + 0.015, y, z);
  c.add(capA, tube, capB, neck);
  for (const x of [CYL.rear / 2, CYL.front - 0.03]) {
    const fit = cyl(0.014, 0.05, blue, 12);
    fit.position.set(x, y + CYL.capR + 0.02, z);
    c.add(fit);
  }
  // Vástago cromado (se escala con la carrera) y cabeza redondeada.
  const rod = cyl(0.018, 1, chrome, 20);
  rod.rotation.z = Math.PI / 2;
  const tip = new THREE.Group();
  const nut = cyl(0.03, 0.03, steel, 6);
  nut.rotation.z = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(CYL.headR, 24, 16), chrome);
  head.position.x = 0.03;
  tip.add(nut, head);
  c.add(rod, tip);
  return { group: g, cyl: c, rod, tip, S, size: [2.6, 0.4] };
}

/** Posición x de la cabeza del vástago para una posición 0..1. */
const headX = (pos) => CYL.front + 0.03 + CYL.rodOut + pos * CYL.S;

/** Final de carrera de rodillo (cuerpo negro sobre base azul) bajo el recorrido de la cabeza. */
function rollerSwitch() {
  const g = new THREE.Group();
  const base = cyl(0.045, 0.02, mat(0x1f6fd1), 24);
  base.rotation.x = Math.PI / 2;
  base.position.set(0, -0.06, -0.02);
  const body = box(0.07, 0.11, 0.06, mat(0x1b1e22, { roughness: 0.5 }));
  body.position.y = -0.055;
  const plug = box(0.05, 0.03, 0.02, mat(0xd8323a));
  plug.position.set(0, -0.06, 0.04);
  const lever = new THREE.Group();
  const arm = box(0.012, 0.05, 0.012, mat(0x9aa3ad, { metalness: 0.7 }));
  arm.position.y = 0.025;
  const roller = cyl(0.016, 0.02, mat(0x2a2e33), 16);
  roller.rotation.x = Math.PI / 2;
  roller.position.y = 0.05;
  lever.add(arm, roller);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), mat(COL.off, { emissive: 0x000000 }));
  lamp.position.set(0.022, -0.03, 0.031);
  g.add(base, body, plug, lever, lamp);
  g.userData.lamp = lamp;
  g.userData.lever = lever;
  return g;
}

// ------------------------------------------------------------ vista
const V = {
  ready: false,
  visible: false,
  objects: new Map(), // id -> { type, model, beacons }
  sig: "",
  snap: null,
  snapWall: 0,
  simRate: 1,
  frames: [],
};

function init() {
  const canvas = document.getElementById("view3d-canvas");
  try {
    V.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    V.failed = true;
    const msg = document.getElementById("view3d-empty");
    msg.textContent = "La vista 3D necesita WebGL y este equipo no lo ofrece (controlador de video o acceso remoto). La simulación sigue igual en Placa y Escena.";
    msg.hidden = false;
    return;
  }
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  V.scene = new THREE.Scene();
  V.scene.background = new THREE.Color(0x14171b);
  V.scene.fog = new THREE.Fog(0x14171b, 18, 45);
  V.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  V.camera.position.set(4, 5, 9);
  V.controls = new OrbitControls(V.camera, canvas);
  V.controls.target.set(3, 0.6, 0);
  V.controls.maxPolarAngle = Math.PI / 2 - 0.05;
  // Si el usuario giró o acercó, el encuadre automático ya no lo pisa.
  V.controls.addEventListener("start", () => (V.userMoved = true));
  V.scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x20242a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 10, 6);
  V.scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat(COL.floor));
  floor.rotation.x = -Math.PI / 2;
  V.scene.add(floor);
  const grid = new THREE.GridHelper(80, 80, COL.grid, COL.grid);
  grid.position.y = 0.002;
  V.scene.add(grid);
  V.root = new THREE.Group();
  V.scene.add(V.root);
  new ResizeObserver(resize).observe(canvas.parentElement);
  V.ready = true;
  requestAnimationFrame(frame);
}

/** Cámara que encuadra toda la planta (ancho V.extent) desde arriba y adelante. */
function fitView() {
  const w = V.extent ?? 4;
  const halfFov = THREE.MathUtils.degToRad(V.camera.fov / 2);
  const fitW = (w / 2 + 0.8) / (Math.tan(halfFov) * Math.max(0.5, V.camera.aspect));
  const fitH = 2.2 / Math.tan(halfFov);
  const d = Math.max(fitW, fitH, 4);
  const cx = w / 2;
  V.controls.target.set(cx, 0.8, 0);
  V.camera.position.set(cx, 0.8 + d * 0.45, d * 0.9);
  V.controls.update();
}

function resize() {
  const host = document.getElementById("view3d-canvas").parentElement;
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h) return;
  V.renderer.setSize(w, h, false);
  V.camera.aspect = w / h;
  V.camera.updateProjectionMatrix();
  if (!V.userMoved) fitView();
}

/** Arma la planta a partir de la escena (equipos de planta en el orden de su x en 2D). */
function rebuild(spec) {
  V.root.clear();
  V.objects.clear();
  const plant = spec.devices.filter((d) => PLANT.has(d.type)).sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  let x = 0;
  const huds = [];
  for (const d of plant) {
    const p = d.params ?? {};
    const model =
      d.type === "jwsim/conveyor" ? buildConveyor(p) : d.type === "jwsim/tank" ? buildTank(p) : d.type === "jwsim/door" ? buildDoor(p) : buildCylinder(p);
    const [w] = model.size;
    // El tanque se dibuja centrado en su eje; el resto desde su borde izquierdo.
    model.group.position.set(d.type === "jwsim/tank" ? x + 0.6 : x, 0, 0);
    const tag = label(d.id);
    tag.position.set(w / 2 - (d.type === "jwsim/tank" ? 0.6 : 0), d.type === "jwsim/door" ? 2.9 : CYLINDERS.has(d.type) ? 1.85 : 2.2, 0);
    model.group.add(tag);
    V.root.add(model.group);
    // Sensores enlazados a este equipo.
    const beacons = [];
    for (const s of spec.devices.filter((q) => SENSORS.has(q.type) && sourceOf(q).startsWith(`${d.id}.`))) {
      const key = sourceOf(s).slice(d.id.length + 1);
      if (s.type === "jwsim/sensor-cylinder") {
        // Sobre el tubo (radio 0.09, eje a 0.9 m): atrás si marca retraído, adelante si extendido.
        const b = slotSensor();
        b.position.set(s.params.end === "extendido" ? CYL.front - 0.14 : CYL.rear + 0.1, CYL.y + CYL.tubeR + 0.012, CYL.z);
        const t = label(s.id);
        t.scale.set(0.42, 0.105, 1);
        t.position.y = 0.06;
        b.add(t);
        (model.cyl ?? model.group).add(b);
        beacons.push({ id: s.id, b });
        continue;
      }
      const min = Number(s.params.min ?? 1);
      if (CYLINDERS.has(d.type) && s.type === "jwsim/limit-switch") {
        // Rodillo justo bajo la cabeza del vástago en ese extremo.
        const b = rollerSwitch();
        b.position.set(headX(min > 0.5 ? 1 : 0) + 0.03, CYL.y - CYL.headR - 0.016 - 0.05, CYL.z);
        const t = label(s.id);
        t.scale.set(0.42, 0.105, 1);
        t.position.y = -0.17;
        b.add(t);
        model.cyl.add(b);
        beacons.push({ id: s.id, b });
        continue;
      }
      const b = beacon();
      if (d.type === "jwsim/conveyor") b.position.set(key === "sensorB" ? model.sB : model.sA, 0.7, model.W / 2 + 0.25);
      else if (d.type === "jwsim/tank") b.position.set(-model.R - 0.2, 0.2 + min * model.H - 0.55, 0);
      else if (d.type === "jwsim/door") b.position.set(key === "persona" ? 0.2 : min > 0.5 ? 2 * model.A - 0.2 : model.A - 0.2, 0, 0.35);
      else b.position.set(min > 0.5 ? 1.4 : 0.9, 0, 0.35);
      const t = label(s.id);
      t.scale.set(1, 0.25, 1);
      t.position.y = 0.8;
      b.add(t);
      model.group.add(b);
      beacons.push({ id: s.id, b });
    }
    V.objects.set(d.id, { type: d.type, model, beacons });
    huds.push(d.id);
    x += w + 1.2;
  }
  V.extent = Math.max(2, x - 1.2);
  fitView();
  const empty = document.getElementById("view3d-empty");
  if (empty) empty.hidden = plant.length > 0;
}

const outOf = (id) => V.snap?.devices.find((d) => d.id === id)?.outputs ?? {};

function frame(now) {
  requestAnimationFrame(frame);
  if (!V.visible) return;
  V.frames.push(now);
  while (V.frames.length && now - V.frames[0] > 1000) V.frames.shift();
  const running = !!window.JwsimScene?.isRunning?.();
  // Tiempo simulado desde la última instantánea (extrapolación).
  const dt = running ? Math.min(0.2, ((performance.now() - V.snapWall) / 1000) * V.simRate) : 0;
  for (const [id, o] of V.objects) {
    const out = outOf(id);
    const m = o.model;
    if (o.type === "jwsim/conveyor") {
      const v = Number(out.avance ?? 0);
      m.belt.offset.x = (m.belt.offset.x - (v * (1 / 60)) / 0.2) % 1;
      for (const r of m.rollers) r.rotation.y -= (v / 0.05) * (1 / 60);
      const xs = (out.piezas ?? []).map((px) => px + v * dt);
      while (m.pieces.children.length < xs.length) m.pieces.add(box(m.len, m.len * 0.8, m.len, mat(COL.piece)));
      while (m.pieces.children.length > xs.length) m.pieces.remove(m.pieces.children.at(-1));
      xs.forEach((px, i) => m.pieces.children[i].position.set(px, 0.74 + (m.len * 0.8) / 2, 0));
    } else if (o.type === "jwsim/tank") {
      const lvl = Math.max(0.001, Math.min(1, Number(out.nivelPct ?? 0) / 100));
      m.water.scale.y = lvl * m.H;
      m.water.position.y = 0.2 + (lvl * m.H) / 2;
      if (out.bombeando) m.impeller.rotation.x += 0.4;
      m.water.material.color.setHex(out.rebalse ? COL.warn : COL.water);
    } else if (o.type === "jwsim/door") {
      const pos = Math.max(0, Math.min(1, Number(out.posicionPct ?? 0) / 100));
      m.panel.position.x = m.A / 2 + pos * m.A;
      m.person.visible = !!out.persona;
      m.ray.material.opacity = out.persona ? 0.25 : 0.8;
    } else {
      const pos = Math.max(0, Math.min(1, Number(out.position ?? 0)));
      // Vástago desde el interior de la tapa hasta la tuerca de la cabeza.
      const x0 = CYL.front - 0.05;
      const x1 = headX(pos) - 0.03;
      m.rod.scale.y = x1 - x0;
      m.rod.position.set((x0 + x1) / 2, CYL.y, CYL.z);
      m.tip.position.set(x1, CYL.y, CYL.z);
    }
    for (const { id: sid, b } of o.beacons) {
      const so = outOf(sid);
      const on = !!(so.actuated ?? so.detecting);
      lightBeacon(b, on);
      if (b.userData.lever) b.userData.lever.rotation.z = on ? 0.45 : 0;
    }
  }
  V.controls.update();
  V.renderer.render(V.scene, V.camera);
}

window.Jwsim3D = {
  show(visible) {
    if (visible && !V.ready && !V.failed) init();
    if (V.failed) return;
    V.visible = visible;
    if (visible) {
      const spec = window.JwsimScene?.specForView?.() ?? { devices: [] };
      const sig = JSON.stringify(spec.devices.filter((d) => PLANT.has(d.type) || SENSORS.has(d.type)).map((d) => [d.id, d.type, d.x, d.params]));
      if (sig !== V.sig) {
        V.sig = sig;
        rebuild(spec);
      }
      resize();
    }
  },
  onSnapshot(snap) {
    const wall = performance.now();
    if (V.snap && snap && V.snapWall) {
      const dSim = (snap.t_ms - V.snap.t_ms) / 1000;
      const dWall = (wall - V.snapWall) / 1000;
      if (dWall > 0 && dSim >= 0) V.simRate = 0.7 * V.simRate + 0.3 * Math.min(100, dSim / dWall);
    }
    V.snap = snap;
    V.snapWall = wall;
  },
  // Para las pruebas: cuadros por segundo del último segundo y objetos dibujados.
  fps: () => V.frames.length,
  objects: () => [...V.objects.entries()].map(([id, o]) => ({ id, type: o.type, beacons: o.beacons.length })),
};
