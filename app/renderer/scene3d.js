// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Vista 3D (G8 3D_SCENES): los equipos de planta de la escena (cinta, tanque,
// puerta, el cilindro de la electroválvula 5/2, el compresor y la unidad FR) en three.js, movidos por
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
const AIR = new Set(["jwsim/compressor", "jwsim/service-unit"]);
const CONVEYORS = new Set(["jwsim/conveyor", "jwsim/conveyor-physics"]);
const PLANT = new Set([...CONVEYORS, "jwsim/tank", "jwsim/door", "jwsim/solenoid-valve", "jwsim/solenoid-valve-2", "jwsim/building-water", "jwsim/lift", "jwsim/sand-filter", "jwsim/chlorinator", ...AIR]);
const SENSORS = new Set(["jwsim/limit-switch", "jwsim/sensor-inductive", "jwsim/sensor-photoelectric", "jwsim/sensor-cylinder"]);
/** Equipo.salida que acciona un sensor (el magnético de cilindro lo arma con su cilindro). */
const sourceOf = (s) => (s.type === "jwsim/sensor-cylinder" ? (s.params?.cylinder ? `${s.params.cylinder}.position` : "") : String(s.params?.source ?? ""));
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...extra });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, h, m, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

/** Texto en un plano siempre de frente (rótulo del equipo). */
// Lienzo a 4× (1024 × 256) con mipmaps y filtrado anisotrópico: el rótulo
// sigue nítido al acercar la cámara y no parpadea al alejarla.
function label(text) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(20,23,27,0.85)";
  g.roundRect(0, 32, 1024, 192, 40);
  g.fill();
  g.fillStyle = "#e7ebef";
  g.font = "bold 112px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 512, 132);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = V.renderer?.capabilities.getMaxAnisotropy?.() ?? 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(1.0, 0.25, 1);
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
  const beam = b.userData.beam;
  // Fotocelda: LED naranja y haz más visible al detectar (como en OIP).
  const led = beam ? 0xff5a00 : COL.on;
  b.userData.lamp.material.color.setHex(on ? led : COL.off);
  b.userData.lamp.material.emissive.setHex(on ? (beam ? 0xff5a00 : 0x1f8a46) : 0x000000);
  if (beam) beam.material.opacity = on ? 0.9 : 0.35;
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

// ---- Cinta con física (planta 3D, etapa 1). Formas propias con las medidas
// de Open Industry Project como referencia (bastidor de 0,17 m, barandas,
// fotocelda de 45 × 73 × 160 mm con el haz a 0,10 m) y sus texturas (MIT,
// app/renderer/assets/oip/LEEME.md).
const DECK_Y = 0.75; // altura de la banda
const FRAME_H = 0.17; // alto del bastidor
const GUARD_H = 0.06; // baranda sobre la banda (más baja que en OIP: se ve la caja)
const BELT_W = 0.6; // ancho de la banda
const TEX = {};
/** Textura de assets/oip, cargada una vez (color en sRGB). */
function oipTex(name, { srgb = true, repeat } = {}) {
  const key = `${name}|${repeat ?? ""}`;
  if (!TEX[key]) {
    const t = new THREE.TextureLoader().load(`assets/oip/${name}`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    TEX[key] = t;
  }
  return TEX[key];
}

/** Banda: la tela de OIP con líneas transversales tenues (se ve el avance). */
function beltTexture(L) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#2a2826";
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(L / 0.5, BELT_W / 0.5);
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 0, 0, 512, 512);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, 0, 6, 512);
    g.fillRect(256, 0, 3, 512);
    tex.needsUpdate = true;
  };
  img.src = "assets/oip/BeltFabric.jpg";
  return tex;
}

// Atlas de cartón de OIP (1024 px): zonas usadas por cara de la caja (sin la
// etiqueta con la marca de OIP). [x0, y0, x1, y1] en píxeles.
const CARDBOARD = {
  side: [[4, 4, 506, 336], [518, 4, 1020, 336]], // ±z: largo × alto, con símbolos
  top: [4, 349, 506, 676], // +y: con la cinta adhesiva
  bottom: [518, 349, 1020, 686],
  end: [346, 694, 684, 1020], // ±x: con cinta y paraguas
};
const cardboardGeo = new Map();
let cardboardMat = null;
/** Caja de cartón L × H × W con el atlas mapeado cara por cara. */
function cardboardBox(L, H, W) {
  const k = [L, H, W].join("x");
  if (!cardboardGeo.has(k)) {
    const geo = new THREE.BoxGeometry(L, H, W);
    const uv = geo.attributes.uv;
    // Orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices c/u).
    const rects = [CARDBOARD.end, CARDBOARD.end, CARDBOARD.top, CARDBOARD.bottom, CARDBOARD.side[0], CARDBOARD.side[1]];
    rects.forEach(([x0, y0, x1, y1], face) => {
      for (let i = face * 4; i < face * 4 + 4; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        uv.setXY(i, (x0 + u * (x1 - x0)) / 1024, 1 - (y1 - v * (y1 - y0)) / 1024);
      }
    });
    uv.needsUpdate = true;
    cardboardGeo.set(k, geo);
  }
  cardboardMat ??= new THREE.MeshStandardMaterial({
    map: oipTex("BoxCardboard.webp"),
    normalMap: oipTex("BoxCardboardNormal.webp", { srgb: false }),
    roughnessMap: oipTex("BoxCardboardRoughness.webp", { srgb: false }),
    roughness: 1,
    metalness: 0,
  });
  return new THREE.Mesh(cardboardGeo.get(k), cardboardMat);
}

/**
 * Fotocelda: carcasa naranja con tapa negra, ventana, LED y el haz (+z del
 * grupo, desde la cara de la lente). Origen en la cara de la lente, 20 mm
 * bajo la banda, como la monta OIP sobre el bastidor.
 */
function photoEye(range) {
  const g = new THREE.Group();
  const body = box(0.045, 0.114, 0.073, mat(0xd17f32, { metalness: 0.5, roughness: 0.36 }));
  body.position.set(0, 0.093, -0.0365);
  const cap = box(0.045, 0.01, 0.073, mat(0x0b0b0b, { roughness: 0.55, metalness: 0 }));
  cap.position.set(0, 0.155, -0.0365);
  const lens = box(0.032, 0.032, 0.004, mat(0x10161c, { roughness: 0.1, metalness: 0.3 }));
  lens.position.set(0, 0.1, 0.001);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), mat(COL.off, { emissive: 0x000000 }));
  lamp.position.set(0, 0.124, 0.002);
  const bracket = box(0.06, 0.004, 0.05, mat(0x8a9099, { metalness: 0.6, roughness: 0.4 }));
  bracket.position.set(0, 0.034, -0.03);
  const beamM = new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.35, depthWrite: false });
  const beam = cyl(0.005, range, beamM, 8);
  beam.rotation.x = Math.PI / 2;
  beam.position.set(0, 0.1, range / 2);
  g.add(body, cap, lens, lamp, bracket, beam);
  g.userData.lamp = lamp;
  g.userData.beam = beam;
  return g;
}

function buildConveyorPhysics(p) {
  const q = { largo: 3, pieza: 0.3, sensorA: 2, sensorB: 2.7, ...p };
  const L = Math.max(0.2, Number(q.largo));
  const W = BELT_W;
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ map: oipTex("Metal.webp", { repeat: [L / 1.5, 1] }), metalness: 0.6, roughness: 0.45, color: 0xc4cad1 });
  // Bastidor: dos perfiles laterales a todo el largo, con su baranda.
  for (const z of [-W / 2 - 0.012, W / 2 + 0.012]) {
    const rail = box(L + 0.04, FRAME_H, 0.024, metal);
    rail.position.set(L / 2, DECK_Y - FRAME_H / 2, z);
    const guard = box(L, GUARD_H, 0.005, mat(0xb9c0c8, { metalness: 0.55, roughness: 0.4 }));
    guard.position.set(L / 2, DECK_Y + GUARD_H / 2, z + Math.sign(z) * 0.006);
    g.add(rail, guard);
  }
  // Banda y tambores de los extremos (radio = medio bastidor).
  const tex = beltTexture(L);
  const belt = box(L, 0.012, W, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }));
  belt.position.set(L / 2, DECK_Y - 0.006, 0);
  g.add(belt);
  const rollers = [];
  const R = FRAME_H / 2 - 0.005;
  const rollerM = new THREE.MeshStandardMaterial({ map: oipTex("RollerMetal.webp"), metalness: 0.7, roughness: 0.35 });
  for (const x of [0, L]) {
    const r = cyl(R, W, rollerM, 24);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, DECK_Y - R, 0);
    g.add(r);
    rollers.push(r);
  }
  // Patas cada ~1,5 m con travesaño.
  const n = Math.max(2, Math.ceil(L / 1.5) + 1);
  const legH = DECK_Y - FRAME_H;
  for (let i = 0; i < n; i++) {
    const x = 0.1 + (i * (L - 0.2)) / (n - 1);
    for (const z of [-W / 2 + 0.03, W / 2 - 0.03]) {
      const leg = box(0.05, legH, 0.05, metal);
      leg.position.set(x, legH / 2, z);
      g.add(leg);
    }
    const brace = box(0.04, 0.04, W - 0.06, metal);
    brace.position.set(x, 0.18, 0);
    g.add(brace);
  }
  // Tope.
  const stop = Number(q.tope ?? 0);
  if (stop > 0 && stop < L) {
    const post = box(0.04, GUARD_H + 0.08, W + 0.06, mat(COL.warn));
    post.position.set(stop + 0.02, DECK_Y + (GUARD_H + 0.08) / 2, 0);
    g.add(post);
  }
  const pieces = new THREE.Group();
  g.add(pieces);
  const len = Math.max(0.02, Number(q.pieza));
  const H = (len * 2) / 3;
  return {
    group: g,
    belt: tex,
    rollers,
    rollerR: R,
    pieces,
    L,
    W,
    len,
    sA: Number(q.sensorA),
    sB: Number(q.sensorB),
    size: [L, W],
    makePiece: () => cardboardBox(len, H, H),
    pieceY: DECK_Y + H / 2,
    // Fotocelda montada en el bastidor del lado +z, con el haz cruzando la banda.
    sensor: (key) => {
      const eye = photoEye(W + 0.06);
      eye.rotation.y = Math.PI;
      eye.position.set(key === "sensorB" ? Number(q.sensorB) : Number(q.sensorA), DECK_Y - 0.02, W / 2 + 0.02 + 0.037);
      return eye;
    },
  };
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
  // Alto: el del equipo más alto (el pozo del montacargas, el edificio).
  const tall = Math.max(2.2, V.height ?? 0);
  const fitH = (tall * 0.75) / Math.tan(halfFov);
  // Con un edificio, la cámara mira la azotea (bombas y tablero) desde arriba.
  if (V.focus) {
    const d = Math.max(fitW * 1.35, 5);
    V.controls.target.set(w / 2, V.focus - 0.4, 0);
    V.camera.position.set(w / 2 + d * 0.1, V.focus + d * 0.5, d * 0.85);
    V.controls.update();
    return;
  }
  const d = Math.max(fitW, fitH, 4);
  const cx = w / 2;
  const cy = Math.max(0.8, tall * 0.4);
  V.controls.target.set(cx, cy, 0);
  V.camera.position.set(cx, cy + d * 0.45, d * 0.9);
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
  // La cisterna que abastece a un edificio va en su azotea (la dibuja el edificio).
  const onRoof = new Set(
    spec.devices.filter((d) => d.type === "jwsim/building-water").map((d) => String(d.params?.cisterna ?? "").split(".")[0]),
  );
  const plant = spec.devices.filter((d) => PLANT.has(d.type) && !(d.type === "jwsim/tank" && onRoof.has(d.id))).sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  let x = 0;
  const huds = [];
  V.panel = null;
  // Sin edificio (que lleva el suyo en la azotea), el tablero va al inicio de la planta.
  if (plant.length && !plant.some((d) => d.type === "jwsim/building-water") && spec.devices.some((d) => d.type === "jwsim/jwplc-basic")) {
    const panel = buildPanel(spec);
    panel.group.position.set(panel.W / 2, 0, 0);
    const tag = label("Tablero");
    tag.scale.set(0.5, 0.125, 1);
    tag.position.set(0, panel.bottom + panel.H + 0.2, 0);
    panel.group.add(tag);
    V.root.add(panel.group);
    V.panel = panel;
    x = panel.W + 1.0;
  }
  for (const d of plant) {
    const p = d.params ?? {};
    const BUILD = {
      "jwsim/conveyor": buildConveyor,
      "jwsim/conveyor-physics": buildConveyorPhysics,
      "jwsim/tank": buildTank,
      "jwsim/door": buildDoor,
      "jwsim/building-water": buildBuilding,
      "jwsim/lift": buildLift,
      "jwsim/sand-filter": buildFilter,
      "jwsim/chlorinator": buildChlorinator,
      "jwsim/compressor": buildCompressor,
      "jwsim/service-unit": buildServiceUnit,
    };
    const model = (BUILD[d.type] ?? buildCylinder)(p, spec);
    if (model.panel) V.panel = model.panel;
    const [w] = model.size;
    // El tanque se dibuja centrado en su eje; el resto desde su borde izquierdo.
    model.group.position.set(d.type === "jwsim/tank" ? x + 0.6 : x, 0, 0);
    const tag = label(d.id);
    if (d.type === "jwsim/building-water") tag.scale.set(0.7, 0.175, 1);
    tag.position.set(w / 2 - (d.type === "jwsim/tank" ? 0.6 : 0), d.type === "jwsim/door" ? 2.9 : d.type === "jwsim/building-water" ? model.height + 0.2 : d.type === "jwsim/lift" ? model.tall + 0.6 : CYLINDERS.has(d.type) ? 1.85 : AIR.has(d.type) ? 1.55 : 2.2, 0);
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
      if (model.sensor) {
        const b = model.sensor(key);
        const t = label(s.id);
        t.scale.set(0.6, 0.15, 1);
        t.position.set(0, -0.1, -0.12);
        b.add(t);
        model.group.add(b);
        beacons.push({ id: s.id, b });
        continue;
      }
      const b = beacon();
      if (CONVEYORS.has(d.type)) b.position.set(key === "sensorB" ? model.sB : model.sA, 0.7, model.W / 2 + 0.25);
      else if (d.type === "jwsim/tank") b.position.set(-model.R - 0.2, 0.2 + min * model.H - 0.55, 0);
      else if (d.type === "jwsim/lift") {
        const k = key === "altura" ? Math.max(-0.4, Math.min(Number(d.params?.entrePisos ?? 3) * 5, min)) * LIFT_K : Number(key.replace(/\D/g, "") || 0) * Number(d.params?.entrePisos ?? 3) * LIFT_K;
        b.position.set(key === "altura" ? -0.35 : 1.5, Math.max(0, k), key === "altura" ? 0.6 : -0.65);
      } else if (d.type === "jwsim/door") b.position.set(key === "persona" ? 0.2 : min > 0.5 ? 2 * model.A - 0.2 : model.A - 0.2, 0, 0.35);
      else b.position.set(min > 0.5 ? 1.4 : 0.9, 0, 0.35);
      const t = label(s.id);
      t.scale.set(1, 0.25, 1);
      t.position.y = 0.8;
      b.add(t);
      model.group.add(b);
      beacons.push({ id: s.id, b });
    }
    V.objects.set(d.id, { type: d.type, model, beacons, motor: String(p.motor ?? "").split(".")[0] });
    // Cisterna en la azotea: es su propio equipo (nivel, rebalse) aunque la dibuje el edificio.
    if (model.tank) {
      const tt = label(model.tankId);
      tt.scale.set(0.6, 0.15, 1);
      tt.position.set(0, model.tank.H + 0.6, 0);
      model.tank.group.add(tt);
      V.objects.set(model.tankId, { type: "jwsim/tank", model: model.tank, beacons: [], motor: "" });
    }
    huds.push(d.id);
    x += w + 1.2;
  }
  V.extent = Math.max(2, x - 1.2);
  const roof = [...V.objects.values()].find((o) => o.model.roofY);
  V.focus = roof ? roof.model.roofY + 0.5 : null;
  V.height = Math.max(0, ...[...V.objects.values()].map((o) => o.model.height ?? 0));
  fitView();
  const empty = document.getElementById("view3d-empty");
  if (empty) empty.hidden = plant.length > 0;
}

/** Manómetro de frente: esfera blanca y aguja que gira con la presión. */
function gauge(r) {
  const g = new THREE.Group();
  const rim = cyl(r, 0.03, mat(0x2a2e33, { metalness: 0.6 }), 32);
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 32), mat(0xf4f5f6, { roughness: 0.4 }));
  face.position.z = 0.017;
  const needle = new THREE.Group();
  const n = box(0.012, r * 0.75, 0.006, mat(0xd8282d));
  n.position.y = (r * 0.75) / 2;
  needle.add(n);
  needle.position.z = 0.022;
  g.add(rim, face, needle);
  g.userData.needle = needle;
  return g;
}
/** Aguja a 0..max bar sobre un arco de ±130°. */
const needleTo = (gg, bar, max) => (gg.userData.needle.rotation.z = THREE.MathUtils.degToRad(130 - (Math.max(0, Math.min(max, bar)) / max) * 260));

/** Compresor de pistón sobre tanque horizontal, con motor, volante y presostato. */
function buildCompressor() {
  const g = new THREE.Group();
  const red = mat(0xc8312f, { metalness: 0.3, roughness: 0.45 });
  const tank = cyl(0.32, 1.5, red, 32);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0.85, 0.42, 0);
  const capL = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red);
  capL.rotation.z = Math.PI / 2;
  capL.position.set(0.1, 0.42, 0);
  const capR = capL.clone();
  capR.rotation.z = -Math.PI / 2;
  capR.position.x = 1.6;
  for (const x of [0.35, 1.35]) {
    const foot = box(0.08, 0.14, 0.5, mat(COL.post));
    foot.position.set(x, 0.07, 0);
    g.add(foot);
  }
  const plate = box(1.0, 0.04, 0.5, mat(0x3a4048));
  plate.position.set(0.85, 0.76, 0);
  const motor = cyl(0.14, 0.38, mat(0x2f6fb5, { metalness: 0.35 }), 24);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0.5, 0.92, 0.05);
  const pump = box(0.26, 0.3, 0.26, mat(0xa8b0b8, { metalness: 0.55, roughness: 0.35 }));
  pump.position.set(1.1, 0.93, 0.05);
  const head = box(0.3, 0.06, 0.3, mat(0x7b8794, { metalness: 0.5 }));
  head.position.set(1.1, 1.11, 0.05);
  const wheel = new THREE.Group();
  const disc = cyl(0.17, 0.03, mat(0x23272d), 28);
  disc.rotation.x = Math.PI / 2;
  const spoke = box(0.3, 0.035, 0.035, mat(0xe7ebef));
  spoke.position.z = 0.02;
  wheel.add(disc, spoke);
  wheel.position.set(0.82, 0.95, 0.24);
  const sw = box(0.12, 0.1, 0.08, mat(0x1f2328));
  sw.position.set(1.45, 0.86, 0.12);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), mat(COL.off, { emissive: 0x000000 }));
  led.position.set(1.45, 0.86, 0.17);
  const gg = gauge(0.11);
  gg.position.set(1.62, 0.72, 0.18);
  g.add(tank, capL, capR, plate, motor, pump, head, wheel, sw, led, gg);
  return { group: g, wheel, led, gauge: gg, size: [1.9, 0.7] };
}

/** Unidad de mantenimiento FR en su soporte: regulador con perilla, manómetro y vaso del filtro. */
function buildServiceUnit() {
  const g = new THREE.Group();
  const post = box(0.06, 1.2, 0.06, mat(COL.post));
  post.position.set(0.35, 0.6, -0.1);
  const pipe = cyl(0.025, 0.7, mat(0xb8c0c8, { metalness: 0.6 }), 12);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0.35, 1.0, 0);
  const bodyR = box(0.16, 0.18, 0.16, mat(0x2c3138));
  bodyR.position.set(0.35, 1.0, 0);
  const knob = cyl(0.06, 0.1, mat(0x3a7bd5), 20);
  knob.position.set(0.35, 1.14, 0);
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.045, 0.24, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.45, roughness: 0.1 }),
  );
  bowl.position.set(0.35, 0.79, 0);
  const gg = gauge(0.08);
  gg.position.set(0.35, 1.0, 0.1);
  const inner = new THREE.Group();
  inner.add(post, pipe, bodyR, knob, bowl, gg);
  inner.scale.setScalar(1.4);
  g.add(inner);
  return { group: g, gauge: gg, size: [1.0, 0.4] };
}

// ------------------------------------------------------------ tablero, tubos y canalizaciones
/** Velocidad de un motor (la salida puede venir como tramo { value, rate }). */
const valOf = (v) => (v && typeof v === "object" ? Number(v.value ?? 0) : Number(v ?? 0)) || 0;

/** Tramo recto de tubo (caño o canalización) entre dos puntos. */
function segment(a, b, r, m) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const c = cyl(r, len, m, 12);
  c.position.copy(va.clone().add(vb).multiplyScalar(0.5));
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return c;
}
/** Recorrido de tubo por varios puntos, con un codo en cada quiebre. */
function run(points, r, m) {
  const g = new THREE.Group();
  for (let i = 1; i < points.length; i++) g.add(segment(points[i - 1], points[i], r, m));
  for (const q of points.slice(1, -1)) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 12, 8), m);
    k.position.set(...q);
    g.add(k);
  }
  return g;
}

/** Texto pintado en un plano (pantallas y placas): devuelve el plano y su función de repintado. */
function screen(w, h, { bg = "#0b0d10", fg = "#ff3b30", font = "bold 72px monospace", px = 256 } = {}) {
  const c = document.createElement("canvas");
  c.width = px;
  c.height = Math.round((px * h) / w);
  const g2 = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  let last = null;
  const paint = (text) => {
    if (text === last) return;
    last = text;
    g2.fillStyle = bg;
    g2.fillRect(0, 0, c.width, c.height);
    g2.fillStyle = fg;
    g2.font = font;
    g2.textAlign = "center";
    g2.textBaseline = "middle";
    g2.fillText(text, c.width / 2, c.height / 2 + 2);
    tex.needsUpdate = true;
  };
  return { plane, paint };
}

const LAMP_HEX = { verde: 0x2fd05a, rojo: 0xff3b30, amarillo: 0xffcc00, azul: 0x2f8cff, blanco: 0xf5f7fa };

/**
 * Tablero eléctrico con la puerta abierta: en la placa de montaje los equipos
 * de la escena (interruptor, fuente, PLC, variadores, contactores...) sobre
 * riel DIN, canaletas y borneras; en la puerta, los pilotos, selectores y
 * pulsadores. Frente hacia +z, origen en el centro de la base.
 */
function buildPanel(spec) {
  const g = new THREE.Group();
  const base = (t) => t.split("/").pop();
  const devs = spec.devices ?? [];
  const of = (...types) => devs.filter((d) => types.includes(base(d.type)));
  const row1 = [...of("power-230vac", "power-3ph", "breaker", "motor-protector"), ...of("power-24vdc"), ...of("jwplc-basic")];
  const row2 = [...of("vfd-el"), ...of("contactor", "relay", "timer-relay", "ssr")];
  const door = of("lamp", "pushbutton-lit", "selector-2", "selector-3", "selector-key", "pushbutton-no", "pushbutton-nc", "emergency-stop");
  const W = Math.max(0.8, Math.min(1.6, 0.2 + 0.17 * Math.max(row1.length + 1, row2.length * 1.3)));
  const H = 1.0;
  const D = 0.3;
  const legH = 0.45;
  const steel = mat(0xd5d9de, { roughness: 0.5, metalness: 0.2 });
  // Gabinete: fondo, costados, techo y piso (abierto al frente) sobre su soporte.
  const y0 = legH;
  const parts = [
    [W, H, 0.02, 0, y0 + H / 2, -D / 2],
    [0.02, H, D, -W / 2, y0 + H / 2, 0],
    [0.02, H, D, W / 2, y0 + H / 2, 0],
    [W, 0.02, D, 0, y0 + H, 0],
    [W, 0.02, D, 0, y0, 0],
  ];
  for (const [w, h, d, x, y, z] of parts) {
    const b = box(w, h, d, steel);
    b.position.set(x, y, z);
    g.add(b);
  }
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const leg = box(0.05, legH, 0.05, mat(0x5b6470));
    leg.position.set(x, legH / 2, -D / 2 + 0.06);
    g.add(leg);
  }
  // Placa de montaje (naranja claro, como la galvanizada pintada) con canaletas y rieles.
  const plate = box(W - 0.08, H - 0.08, 0.01, mat(0xe9e3d6, { roughness: 0.8 }));
  plate.position.set(0, y0 + H / 2, -D / 2 + 0.02);
  g.add(plate);
  const zf = -D / 2 + 0.03;
  const duct = mat(0x9aa1a9, { roughness: 0.7 });
  for (const y of [y0 + H - 0.1, y0 + H * 0.52, y0 + 0.1]) {
    const dd = box(W - 0.12, 0.06, 0.05, duct);
    dd.position.set(0, y, zf + 0.025);
    g.add(dd);
  }
  const rows = [
    { list: row1, y: y0 + H * 0.74 },
    { list: row2, y: y0 + H * 0.3 },
  ];
  const vfds = [];
  const plcs = [];
  for (const { list, y } of rows) {
    const rail = box(W - 0.14, 0.035, 0.012, mat(0xb8c0c8, { metalness: 0.6 }));
    rail.position.set(0, y, zf + 0.006);
    g.add(rail);
    const sizes = list.map((d) => ({ "vfd-el": [0.15, 0.3], "jwplc-basic": [0.26, 0.2], "power-24vdc": [0.1, 0.16], contactor: [0.09, 0.16] })[base(d.type)] ?? [0.07, 0.15]);
    const total = sizes.reduce((a, [w]) => a + w + 0.03, -0.03);
    let x = -total / 2;
    list.forEach((d, i) => {
      const [w, h] = sizes[i];
      const t = base(d.type);
      const color = t === "jwplc-basic" ? 0x23272d : t === "vfd-el" ? 0x4b4e52 : t === "power-24vdc" ? 0xb8bec5 : 0xf1f3f5;
      const body = box(w, h, 0.09, mat(color, { roughness: 0.55 }));
      body.position.set(x + w / 2, y, zf + 0.06);
      g.add(body);
      const front = zf + 0.106;
      if (t === "vfd-el") {
        const sc = screen(0.08, 0.03);
        sc.plane.position.set(x + w / 2, y + 0.06, front);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), mat(COL.off, { emissive: 0x000000 }));
        led.position.set(x + w / 2 + 0.055, y + 0.06, front);
        const pad = box(0.1, 0.06, 0.004, mat(0x2a2e33));
        pad.position.set(x + w / 2, y - 0.01, front - 0.002);
        g.add(sc.plane, led, pad);
        vfds.push({ id: d.id, paint: sc.paint, led });
      } else if (t === "jwplc-basic") {
        const sc = screen(0.12, 0.06, { bg: "#0c2a16", fg: "#7dff9a", font: "bold 40px monospace" });
        sc.plane.position.set(x + w / 2 - 0.04, y + 0.03, front);
        const logo = screen(0.08, 0.025, { bg: "#23272d", fg: "#e7ebef", font: "bold 64px sans-serif" });
        logo.paint("JW");
        logo.plane.position.set(x + w / 2 + 0.08, y + 0.06, front);
        g.add(sc.plane, logo.plane);
        plcs.push({ id: d.id, paint: sc.paint });
      } else if (t === "contactor" || t === "relay") {
        const win = box(0.04, 0.03, 0.004, mat(0x37d67a));
        win.position.set(x + w / 2, y, front);
        g.add(win);
      } else {
        const lever = box(w * 0.5, 0.035, 0.03, mat(0x2a2e33));
        lever.position.set(x + w / 2, y + 0.01, front + 0.01);
        g.add(lever);
      }
      x += w + 0.03;
    });
  }
  // Borneras al pie.
  for (let i = 0; i < Math.floor((W - 0.2) / 0.025); i++) {
    const tb = box(0.02, 0.05, 0.05, mat(i % 6 === 5 ? 0x3fae49 : 0x9aa3ad));
    tb.position.set(-W / 2 + 0.12 + i * 0.025, y0 + 0.1, zf + 0.06);
    g.add(tb);
  }
  // Puerta abierta (bisagra a la izquierda) con los mandos de la escena.
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, y0, D / 2);
  const leaf = box(W, H, 0.02, steel);
  leaf.position.set(W / 2, H / 2, 0);
  hinge.add(leaf);
  const lamps = [];
  door.forEach((d, i) => {
    const cols = Math.max(1, Math.min(4, door.length));
    const cx = ((i % cols) + 0.5) * (W / cols);
    const cy = H * 0.7 - Math.floor(i / cols) * 0.2;
    const t = base(d.type);
    const ring = cyl(0.034, 0.02, mat(0x8b929b, { metalness: 0.5 }), 20);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, cy, 0.02);
    hinge.add(ring);
    if (t === "lamp" || t === "pushbutton-lit") {
      const hex = LAMP_HEX[d.params?.color] ?? LAMP_HEX.verde;
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hex, { emissive: 0x000000, transparent: true, opacity: 0.9 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(cx, cy, 0.03);
      hinge.add(lens);
      lamps.push({ id: d.id, lens, hex });
    } else if (t === "emergency-stop") {
      const mush = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd8282d));
      mush.rotation.x = Math.PI / 2;
      mush.position.set(cx, cy, 0.03);
      hinge.add(mush);
    } else if (t.startsWith("selector")) {
      const knob = box(0.012, 0.05, 0.02, mat(0x23272d));
      knob.position.set(cx, cy, 0.04);
      knob.rotation.z = -0.6;
      hinge.add(knob);
    } else {
      const btn = cyl(0.024, 0.02, mat(t === "pushbutton-nc" ? 0xd8282d : 0x2fae4f), 16);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(cx, cy, 0.035);
      hinge.add(btn);
    }
    const tag = screen(0.09, 0.022, { bg: "#f2f3f4", fg: "#1a1d21", font: "bold 44px sans-serif" });
    tag.paint(d.params?.label ? `${d.id} ${d.params.label}` : d.id);
    tag.plane.position.set(cx, cy - 0.055, 0.012);
    hinge.add(tag.plane);
  });
  // Placa de la marca en la puerta.
  const brand = screen(0.22, 0.045, { bg: "#23272d", fg: "#ffffff", font: "bold 60px sans-serif" });
  brand.paint("JW CONTROL");
  brand.plane.position.set(W / 2, H - 0.07, 0.012);
  hinge.add(brand.plane);
  hinge.rotation.y = -1.7;
  g.add(hinge);
  // Entrada de cables (prensaestopas) bajo el gabinete.
  const glandX = (k, n) => -W / 2 + 0.12 + (k * (W - 0.24)) / Math.max(1, n - 1);
  return { group: g, W, D, H, legH, vfds, plcs, lamps, glandX, bottom: y0 };
}

/** Tanque elevado de la azotea (polietileno, con tapa), para la cisterna del edificio. */
function buildRoofTank() {
  const R = 0.62;
  const H = 1.1;
  const g = new THREE.Group();
  const shell = cyl(R, H, mat(0x2b3a4a, { transparent: true, opacity: 0.35, roughness: 0.3, depthWrite: false }), 40);
  shell.position.y = H / 2 + 0.2;
  const water = cyl(R * 0.96, 1, mat(COL.water, { transparent: true, opacity: 0.85 }), 40);
  water.position.y = 0.2;
  const slab = box(1.6, 0.2, 1.6, mat(0x9aa0a6, { roughness: 0.9 }));
  slab.position.y = 0.1;
  const lid = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 5), mat(0x1f2a36));
  lid.position.y = H + 0.2 - R * Math.cos(Math.PI / 5);
  const cap = cyl(0.16, 0.06, mat(0x1f2a36), 20);
  cap.position.y = H + 0.2 + 0.12;
  for (const y of [0.2 + H * 0.33, 0.2 + H * 0.66]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.012, 8, 48), mat(0x1f2a36));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  g.add(shell, water, slab, lid, cap);
  return { group: g, water, impeller: new THREE.Object3D(), H, R, size: [2 * R, 2 * R] };
}

/**
 * Edificio con la sala de bombas en la azotea (como en los edificios de Lima):
 * tanque elevado, electrobombas con motor sobre su base, colector de succión
 * y de descarga con válvulas, hidroneumático, manómetro y transmisor; el
 * tablero con la puerta abierta y las canalizaciones hasta cada motor; la
 * bajada al edificio con una derivación por piso. La cisterna (p.cisterna) se
 * dibuja aquí; rebuild() la registra como su propio equipo.
 */
function buildBuilding(p, spec = { devices: [] }) {
  const g = new THREE.Group();
  const ids = String(p.bombas ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const n = Math.max(1, ids.length);
  const floors = 5;
  const FH = 0.72;
  const BH = floors * FH;
  const W = Math.max(5.6, 3.6 + 0.9 * n);
  const DP = 2.8;
  const steel = mat(0xb8c0c8, { metalness: 0.6, roughness: 0.35 });
  const pipeM = mat(0x2f6fb5, { metalness: 0.3 });
  const conduitM = mat(0x5f6670, { roughness: 0.6 });
  // Edificio: fachada con ventanas que se encienden con el consumo, ingreso y parapeto.
  const bldg = box(W, BH, DP, mat(0xd9dee4, { roughness: 0.85 }));
  bldg.position.set(W / 2, BH / 2, 0);
  g.add(bldg);
  const winM = mat(0x2a2e33, { emissive: 0x000000 });
  const cols = Math.floor((W - 0.6) / 0.62);
  for (let f = 0; f < floors; f++)
    for (let c = 0; c < cols; c++) {
      if (f === 0 && c === Math.floor(cols / 2)) continue;
      const w = box(0.34, 0.4, 0.02, winM);
      w.position.set(0.5 + c * 0.62 + 0.17, f * FH + 0.36, DP / 2 + 0.01);
      g.add(w);
    }
  const doorB = box(0.5, 0.6, 0.02, mat(0x3a4048));
  doorB.position.set(0.5 + Math.floor(cols / 2) * 0.62 + 0.17, 0.3, DP / 2 + 0.01);
  g.add(doorB);
  for (let f = 1; f < floors; f++) {
    const slabLine = box(W + 0.04, 0.05, DP + 0.04, mat(0xc4cad1));
    slabLine.position.set(W / 2, f * FH, 0);
    g.add(slabLine);
  }
  const roofM = mat(0x8e959d, { roughness: 0.95 });
  const roof = box(W, 0.04, DP, roofM);
  roof.position.set(W / 2, BH + 0.02, 0);
  g.add(roof);
  for (const [w, d, x, z] of [
    [W, 0.08, W / 2, DP / 2 - 0.04],
    [W, 0.08, W / 2, -DP / 2 + 0.04],
    [0.08, DP, 0.04, 0],
    [0.08, DP, W - 0.04, 0],
  ]) {
    const par = box(w, 0.22, d, mat(0xc4cad1));
    par.position.set(x, BH + 0.11, z);
    g.add(par);
  }
  const top = new THREE.Group();
  top.position.y = BH + 0.04;
  g.add(top);

  // Tanque elevado (cisterna) a la izquierda de la azotea.
  const tankId = String(p.cisterna ?? "").split(".")[0];
  const tankDev = (spec.devices ?? []).find((d) => d.id === tankId && d.type === "jwsim/tank");
  let tank = null;
  const tx = 1.05;
  const tz = -0.35;
  if (tankDev) {
    tank = buildRoofTank();
    tank.group.position.set(tx, 0, tz);
    top.add(tank.group);
    // Flotador colgado de su cable dentro del tanque.
    const fl = (spec.devices ?? []).find((d) => d.type === "jwsim/float-switch" && String(d.params?.source ?? "").startsWith(`${tankId}.`));
    if (fl) {
      const fy = 0.2 + tank.H * 0.45;
      const floatB = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 6, 12), mat(0xe7ebef));
      floatB.position.set(tx + 0.25, fy, tz + 0.1);
      floatB.rotation.z = 0.5;
      top.add(floatB, run([[tx + 0.25, fy + 0.08, tz + 0.1], [tx + 0.25, tank.H + 0.32, tz + 0.1]], 0.008, mat(0x23272d)));
    }
  }

  // Electrobombas sobre su base de concreto: motor (con caja de bornes y
  // ventilador), acople a la vista (gira con la velocidad) y voluta.
  const px0 = 2.35;
  const pz = 0.15;
  const skidW = 0.9 * n + 0.3;
  const skid = box(skidW, 0.12, 1.0, mat(0x9aa0a6, { roughness: 0.9 }));
  skid.position.set(px0 - 0.45 + skidW / 2, 0.06, pz);
  top.add(skid);
  const ay = 0.36; // altura del eje
  const pumps = ids.map((id, i) => {
    const x = px0 + i * 0.9;
    const base2 = box(0.36, 0.1, 0.8, mat(0x3a4048, { metalness: 0.4 }));
    base2.position.set(x, 0.17, pz);
    const motorB = cyl(0.14, 0.38, mat(0x2f6fb5, { metalness: 0.35 }), 24);
    motorB.rotation.x = Math.PI / 2;
    motorB.position.set(x, ay, pz + 0.2);
    for (let k = 0; k < 6; k++) {
      const fin = box(0.3, 0.012, 0.32, motorB.material);
      fin.position.set(x, ay, pz + 0.2);
      fin.rotation.z = (k * Math.PI) / 6;
      top.add(fin);
    }
    const fanCover = cyl(0.15, 0.08, mat(0x23272d), 24);
    fanCover.rotation.x = Math.PI / 2;
    fanCover.position.set(x, ay, pz + 0.43);
    const tbox = box(0.12, 0.08, 0.12, mat(0x2a5d9c));
    tbox.position.set(x, ay + 0.18, pz + 0.18);
    const guard = box(0.2, 0.16, 0.12, mat(0xffb020, { transparent: true, opacity: 0.35 }));
    guard.position.set(x, ay, pz - 0.02);
    const rotor = new THREE.Group();
    const shaft = cyl(0.03, 0.1, steel, 12);
    shaft.rotation.x = Math.PI / 2;
    const key = box(0.14, 0.02, 0.02, mat(0xffb020));
    rotor.add(shaft, key);
    rotor.position.set(x, ay, pz - 0.02);
    const volute = cyl(0.17, 0.12, mat(0x9aa3ad, { metalness: 0.5 }), 28);
    volute.rotation.x = Math.PI / 2;
    volute.position.set(x, ay, pz - 0.16);
    const tag = label(id);
    tag.scale.set(0.44, 0.11, 1);
    tag.position.set(x, 0.05, pz + 0.65);
    top.add(base2, motorB, fanCover, tbox, guard, rotor, volute, tag);
    // Succión desde el colector (atrás) y descarga vertical con su válvula de retención.
    top.add(run([[x, ay, pz - 0.22], [x, ay, -0.75]], 0.04, steel));
    top.add(run([[x, ay + 0.17, pz - 0.16], [x, 1.05, pz - 0.16]], 0.04, pipeM));
    const check = box(0.11, 0.12, 0.11, mat(0x8b929b, { metalness: 0.5 }));
    check.position.set(x, 0.75, pz - 0.16);
    const valve = cyl(0.05, 0.02, mat(0xd8282d), 16);
    valve.position.set(x, 0.92, pz - 0.16);
    top.add(check, valve);
    return { id, rotor, x, box: [x, ay + 0.22, pz + 0.18] };
  });
  // Colector de succión desde el pie del tanque, de descarga hasta el hidroneumático y la bajada.
  const xEnd = px0 + (n - 1) * 0.9;
  top.add(run([[tank ? tx + 0.55 : px0 - 0.4, ay, -0.75], [xEnd + 0.15, ay, -0.75]], 0.05, steel));
  const hx = xEnd + 0.75;
  const downX = W - 0.25;
  top.add(run([[px0 - 0.15, 1.05, pz - 0.16], [downX, 1.05, pz - 0.16], [downX, 1.05, DP / 2 + 0.12]], 0.05, pipeM));
  const hydro = cyl(0.17, 0.6, mat(0x3a7bd5, { metalness: 0.3, roughness: 0.4 }), 28);
  hydro.position.set(hx, 0.5, -0.6);
  const hfoot = cyl(0.12, 0.2, mat(0x3a4048), 16);
  hfoot.position.set(hx, 0.1, -0.6);
  top.add(hfoot);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hydro.material);
  dome.position.set(hx, 0.8, -0.6);
  top.add(hydro, dome, run([[hx, 0.9, -0.6], [hx, 1.05, -0.6], [hx, 1.05, pz - 0.16]], 0.03, pipeM));
  const gg = gauge(0.08);
  gg.position.set(hx - 0.25, 1.2, pz - 0.1);
  top.add(gg, run([[hx - 0.25, 1.05, pz - 0.16], [hx - 0.25, 1.12, pz - 0.16]], 0.012, steel));
  // Transmisor de presión en el colector.
  const pt = (spec.devices ?? []).find((d) => d.type === "jwsim/pressure-rs485");
  let ptPos = null;
  if (pt) {
    const tx2 = hx + 0.25;
    const body = cyl(0.035, 0.14, mat(0xb8c0c8, { metalness: 0.6 }), 16);
    body.position.set(tx2, 1.17, pz - 0.16);
    const head = cyl(0.05, 0.06, mat(0x23272d), 16);
    head.position.set(tx2, 1.27, pz - 0.16);
    const tag = label(pt.id);
    tag.scale.set(0.5, 0.125, 1);
    tag.position.set(tx2, 1.42, pz - 0.16);
    top.add(body, head, tag);
    ptPos = [tx2, 1.27, pz - 0.16];
  }
  // Bajada por la fachada con una derivación hacia cada piso.
  const front = DP / 2 + 0.12;
  g.add(run([[downX, BH + 1.09, front], [downX, 0.3, front]], 0.05, pipeM));
  for (let f = 0; f < floors; f++) g.add(run([[downX, f * FH + 0.55, front], [downX - 0.25, f * FH + 0.55, front], [downX - 0.25, f * FH + 0.55, DP / 2]], 0.025, pipeM));

  // Tablero en la azotea, adelante a la derecha, con canalizaciones a los motores.
  const panel = buildPanel(spec);
  const cx = Math.min(W - 0.3 - panel.W / 2, hx + 0.2 + panel.W / 2);
  const cz = DP / 2 - 1.05;
  panel.group.position.set(cx, 0, cz);
  top.add(panel.group);
  const yc = 0.06; // canalización apoyada en la losa
  const targets = [...pumps.map((pm) => pm.box), ...(ptPos ? [ptPos] : []), ...(tank ? [[tx + 0.25, tank.H + 0.32, tz + 0.1]] : [])];
  targets.forEach((t, k) => {
    const gx = cx + panel.glandX(k, targets.length);
    const gz = cz - panel.D / 2 + 0.08;
    const zl = gz - 0.06 - k * 0.07;
    top.add(run([[gx, panel.bottom, gz], [gx, yc, gz], [gx, yc, zl], [t[0], yc, zl], [t[0], yc, t[2]], [t[0], t[1], t[2]]], 0.022, conduitM));
  });
  const tag = label("Tablero");
  tag.scale.set(0.5, 0.125, 1);
  tag.position.set(cx, panel.bottom + panel.H + 0.2, cz);
  top.add(tag);
  const height = BH + 1.6;
  return { group: g, pumps, gauge: gg, windows: winM, pipes: pipeM, panel, tank, tankId: tankDev?.id ?? null, height, roofY: BH + 0.04, size: [W, DP] };
}

/** Montacargas a escala 1:2: pozo de perfiles, cabina con su carga, losas y puertas de piso, máquina arriba. */
const LIFT_K = 0.5;
function buildLift(p) {
  const g = new THREE.Group();
  const n = Math.max(2, Math.min(6, Math.round(Number(p.pisos ?? 3))));
  const H = Math.max(0.5, Number(p.entrePisos ?? 3)) * LIFT_K;
  const top = (n - 1) * H;
  const tall = top + 1.6;
  const post = mat(0x5b6470, { metalness: 0.4 });
  for (const [x, z] of [[0, -0.55], [1.1, -0.55], [0, 0.55], [1.1, 0.55]]) {
    const pst = box(0.06, tall, 0.06, post);
    pst.position.set(x, tall / 2, z);
    g.add(pst);
  }
  // Máquina: motor y tambor sobre el pozo.
  const deck = box(1.3, 0.06, 1.3, mat(0x3a4048));
  deck.position.set(0.55, tall, 0);
  const mot = cyl(0.12, 0.34, mat(0x2f6fb5, { metalness: 0.35 }), 20);
  mot.rotation.z = Math.PI / 2;
  mot.position.set(0.3, tall + 0.16, 0);
  const drum = new THREE.Group();
  const dr = cyl(0.11, 0.3, mat(0x9aa3ad, { metalness: 0.5 }), 20);
  dr.rotation.z = Math.PI / 2;
  const mark = box(0.32, 0.02, 0.03, mat(0xffb020));
  mark.position.y = 0.11;
  drum.add(dr, mark);
  drum.position.set(0.72, tall + 0.14, 0);
  g.add(deck, mot, drum);
  // Losas y puertas de cada piso (a la derecha del pozo).
  const doors = [];
  for (let i = 0; i < n; i++) {
    const slab = box(1.4, 0.08, 1.4, mat(0x9aa3ad, { roughness: 0.9 }));
    slab.position.set(1.9, i * H - 0.04, 0);
    const door = box(0.04, 0.95, 0.9, mat(0x8a939d, { metalness: 0.3, transparent: true, opacity: 0.85 }));
    door.position.set(1.18, i * H + 0.48, 0);
    const tag = label(i === 0 ? "PB" : `P${i}`);
    tag.scale.set(0.5, 0.125, 1);
    tag.position.set(2.4, i * H + 0.3, 0.6);
    g.add(slab, door, tag);
    doors.push(door);
  }
  // Cabina con la carga.
  const cab = new THREE.Group();
  const floor = box(0.95, 0.05, 0.95, mat(0x3a4048));
  floor.position.y = 0.025;
  const roof = box(0.95, 0.04, 0.95, mat(0xc9cfd6));
  roof.position.y = 1.0;
  const back = box(0.03, 1.0, 0.95, mat(0xc9cfd6, { metalness: 0.4 }));
  back.position.set(-0.46, 0.5, 0);
  const side1 = box(0.95, 1.0, 0.03, mat(0xc9cfd6, { metalness: 0.4, transparent: true, opacity: 0.5 }));
  side1.position.set(0, 0.5, 0.46);
  const side2 = side1.clone();
  side2.position.z = -0.46;
  const crate = box(0.4, 0.32, 0.4, mat(0xa87a3c));
  crate.position.set(-0.1, 0.21, 0);
  const extra = box(0.5, 0.36, 0.5, mat(0xd8282d));
  extra.position.set(0.05, 0.55, 0.05);
  extra.visible = false;
  cab.add(floor, roof, back, side1, side2, crate, extra);
  cab.position.set(0.55, 0, 0);
  const rope = cyl(0.01, 1, mat(0x23272d), 6);
  rope.position.set(0.55, 0, 0);
  g.add(cab, rope);
  return { group: g, cab, rope, drum, doors, extra, tall, height: tall + 0.6, size: [2.7, 1.4] };
}

/** Filtro de arena: tanque a presión con su lecho (se oscurece al colmatarse), válvulas y manómetro diferencial. */
function buildFilter() {
  const g = new THREE.Group();
  const shell = cyl(0.42, 1.5, mat(0x2f6fb5, { metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.55 }), 32);
  shell.position.set(0.6, 0.95, 0);
  const capT = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell.material);
  capT.position.set(0.6, 1.7, 0);
  const gravel = cyl(0.4, 0.25, mat(0x7f8790), 28);
  gravel.position.set(0.6, 0.33, 0);
  const bedM = mat(0xe2c98f, { roughness: 0.95 });
  const sand = cyl(0.4, 0.5, bedM, 28);
  sand.position.set(0.6, 0.71, 0);
  const anth = cyl(0.4, 0.2, mat(0x2a2e33, { roughness: 0.9 }), 28);
  anth.position.set(0.6, 1.06, 0);
  const waterM = mat(0x9cc3ee, { transparent: true, opacity: 0.45 });
  const water = cyl(0.4, 0.5, waterM, 28);
  water.position.set(0.6, 1.42, 0);
  for (const x of [0.38, 0.82]) {
    const leg = box(0.06, 0.25, 0.06, mat(COL.post));
    leg.position.set(x, 0.12, 0);
    g.add(leg);
  }
  const pipeM = mat(0x2f6fb5, { metalness: 0.3 });
  const inP = cyl(0.04, 0.6, pipeM, 12);
  inP.rotation.z = Math.PI / 2;
  inP.position.set(0.0, 1.85, 0);
  const outP = cyl(0.04, 0.7, pipeM, 12);
  outP.rotation.z = Math.PI / 2;
  outP.position.set(1.2, 0.3, 0);
  const gg = gauge(0.1);
  gg.position.set(0.6, 1.25, 0.45);
  g.add(shell, capT, gravel, sand, anth, water, inP, outP, gg);
  return { group: g, bedM, waterM, gauge: gg, height: 2.3, size: [1.6, 0.9] };
}

/** Dosificadora de cloro: tanque de hipoclorito con la bomba encima y su LED. */
function buildChlorinator() {
  const g = new THREE.Group();
  const tank = cyl(0.2, 0.55, mat(0xf4f5f6, { roughness: 0.5 }), 24);
  tank.position.set(0.3, 0.28, 0);
  const liquid = cyl(0.18, 0.5, mat(0xe8f27a, { transparent: true, opacity: 0.6 }), 24);
  liquid.position.set(0.3, 0.27, 0);
  const head = box(0.26, 0.16, 0.18, mat(0xd8282d));
  head.position.set(0.3, 0.64, 0);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), mat(COL.off, { emissive: 0x000000 }));
  led.position.set(0.38, 0.66, 0.1);
  g.add(tank, liquid, head, led);
  return { group: g, led, liquid, height: 1.2, size: [0.6, 0.4] };
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
    if (CONVEYORS.has(o.type)) {
      const v = Number(out.avance ?? 0);
      // Con física, cada caja con su velocidad (puede no ir con la cinta).
      const vs = out.velPiezas;
      m.belt.offset.x = (m.belt.offset.x - (v * (1 / 60)) / 0.2) % 1;
      for (const r of m.rollers) r.rotation.y -= (v / (m.rollerR ?? 0.05)) * (1 / 60);
      const xs = (out.piezas ?? []).map((px, i) => px + Number(vs?.[i] ?? v) * dt);
      while (m.pieces.children.length < xs.length) m.pieces.add(m.makePiece ? m.makePiece() : box(m.len, m.len * 0.8, m.len, mat(COL.piece)));
      while (m.pieces.children.length > xs.length) m.pieces.remove(m.pieces.children.at(-1));
      xs.forEach((px, i) => m.pieces.children[i].position.set(px, m.pieceY ?? 0.74 + (m.len * 0.8) / 2, 0));
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
    } else if (o.type === "jwsim/sand-filter") {
      const c = Math.max(0, Math.min(1, Number(out.colmatacion ?? 0) / 100));
      m.bedM.color.setRGB(0.886 - 0.5 * c, 0.788 - 0.5 * c, 0.561 - 0.4 * c);
      m.waterM.color.setHex(out.lavando ? 0x9a7a4a : 0x9cc3ee);
      needleTo(m.gauge, Number(out.dp ?? 0), 2);
    } else if (o.type === "jwsim/chlorinator") {
      m.led.material.color.setHex(out.dosificando ? COL.on : COL.off);
      m.led.material.emissive.setHex(out.dosificando ? 0x1f8a46 : 0x000000);
      const lv = Math.max(0.02, Number(out.tanque ?? 0) / 100);
      m.liquid.scale.y = lv;
      m.liquid.position.y = 0.02 + (0.5 * lv) / 2;
    } else if (o.type === "jwsim/lift") {
      const y = Number(out.altura ?? 0) * LIFT_K;
      m.cab.position.y = y;
      m.rope.scale.y = Math.max(0.01, m.tall - y - 1.0);
      m.rope.position.y = (m.tall + y + 1.0) / 2;
      m.drum.rotation.x += out.movimiento ? (Number(outOf(String(o.motor ?? "")).speed ?? 0) || 0) * 0.3 : 0;
      m.doors.forEach((dd, i) => {
        dd.position.z = out[`puerta${i}`] ? 0.8 : 0;
      });
      m.extra.visible = !!out.sobrecarga;
    } else if (o.type === "jwsim/building-water") {
      for (const pm of m.pumps) pm.rotor.rotation.z += valOf(outOf(pm.id).speed) * 0.6;
      needleTo(m.gauge, Number(out.presion ?? 0), 10);
      const q = Math.min(1, Number(out.qConsumo ?? 0) / 120);
      m.windows.emissive.setRGB(0.55 * q, 0.75 * q, 1.0 * q);
      m.pipes.color.setHex(Number(out.presion ?? 0) > 0.5 ? 0x1f56c8 : 0x9cc3ee);
    } else if (o.type === "jwsim/compressor") {
      needleTo(m.gauge, Number(out.pressure ?? 0), 12);
      if (out.running) m.wheel.rotation.z -= 0.5;
      m.led.material.color.setHex(out.running ? COL.on : COL.off);
      m.led.material.emissive.setHex(out.running ? 0x1f8a46 : 0x000000);
    } else if (o.type === "jwsim/service-unit") {
      needleTo(m.gauge, Number(out.pressure ?? 0), 10);
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
  // Tablero: frecuencia y LED de cada variador, pilotos de la puerta y estado del PLC.
  if (V.panel) {
    for (const v of V.panel.vfds) {
      const o = outOf(v.id);
      const hz = valOf(o.hz);
      v.paint(!o.powered ? "" : typeof o.lcd === "string" ? o.lcd : hz.toFixed(1));
      v.led.material.color.setHex(o.running ? COL.on : COL.off);
      v.led.material.emissive.setHex(o.running ? 0x1f8a46 : 0x000000);
    }
    for (const l of V.panel.lamps) l.lens.material.emissive.setHex(outOf(l.id).lit ? l.hex : 0x000000);
    for (const pl of V.panel.plcs) pl.paint(running ? "RUN" : "STOP");
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
      // El tablero muestra todos los equipos eléctricos: cualquier alta o baja rearma la planta.
      const sig = JSON.stringify(spec.devices.map((d) => (PLANT.has(d.type) || SENSORS.has(d.type) ? [d.id, d.type, d.x, d.params] : [d.id, d.type, d.params?.color, d.params?.label])));
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
