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
    g2.fillText(text, c.width / 2, c.height / 2 + 2, c.width * 0.92);
    tex.needsUpdate = true;
  };
  return { plane, paint };
}

const LAMP_HEX = { verde: 0x2fd05a, rojo: 0xff3b30, amarillo: 0xffcc00, azul: 0x2f8cff, blanco: 0xf5f7fa };

// Modelos de equipos de tablero (escala ×2 del real, para que se lean desde la
// cámara de la planta): frente hacia +z, origen en el centro del equipo sobre el riel.
const PM = {
  white: mat(0xeef0f2, { roughness: 0.55 }),
  grey: mat(0xc9ced4, { roughness: 0.55 }),
  dark: mat(0x2b2f35, { roughness: 0.6 }),
  black: mat(0x16191d, { roughness: 0.5 }),
  screw: mat(0xb8c0c8, { metalness: 0.7, roughness: 0.3 }),
  green: mat(0x2fae4f, { roughness: 0.5 }),
  termGreen: mat(0x3fa35a, { roughness: 0.6 }),
  orange: mat(0xf08a24, { roughness: 0.5 }),
  red: mat(0xd8282d, { roughness: 0.5 }),
  blueBtn: mat(0x2f8be0, { roughness: 0.5 }),
};
const WIRE_HEX = { negro: 0x23272d, azul: 0x2f62d6, rojo: 0xe0392b, "marrón": 0x8a5a2b, celeste: 0x55aef0, gris: 0x8b929b };
/** Fila de tornillos en el frente de un equipo. */
function screwRow(g, xs, y, z, r = 0.006) {
  for (const x of xs) {
    const s = cyl(r, 0.006, PM.screw, 12);
    s.rotation.x = Math.PI / 2;
    s.position.set(x, y, z);
    const slot = box(r * 1.4, r * 0.35, 0.002, PM.dark);
    slot.position.set(x, y, z + 0.004);
    g.add(s, slot);
  }
}
/** Placa con texto (plano con textura de lienzo). */
function plate(w, h, text, opts) {
  const sc = screen(w, h, opts);
  sc.paint(text);
  return sc.plane;
}
/** Termomagnético o interruptor de entrada: un módulo de 0,036 por polo. */
function dinBreaker(poles, label) {
  const g = new THREE.Group();
  const w = 0.036 * poles;
  const body = box(w, 0.18, 0.06, PM.white);
  body.position.z = 0.03;
  const front = box(w - 0.004, 0.09, 0.016, PM.white);
  front.position.set(0, 0, 0.068);
  g.add(body, front);
  for (let i = 0; i < poles; i++) {
    const x = -w / 2 + 0.018 + i * 0.036;
    const lever = box(0.014, 0.03, 0.022, PM.black);
    lever.position.set(x, 0.008, 0.085);
    const win = box(0.012, 0.008, 0.002, PM.green);
    win.position.set(x, 0.034, 0.077);
    g.add(lever, win);
    if (i) {
      const sep = box(0.001, 0.18, 0.062, PM.grey);
      sep.position.set(-w / 2 + i * 0.036, 0, 0.031);
      g.add(sep);
    }
  }
  if (poles > 1) {
    const bar = box(w - 0.02, 0.006, 0.012, PM.black);
    bar.position.set(0, 0.008, 0.098);
    g.add(bar);
  }
  const xs = Array.from({ length: poles }, (_, i) => -w / 2 + 0.018 + i * 0.036);
  screwRow(g, xs, 0.075, 0.061);
  screwRow(g, xs, -0.075, 0.061);
  const lb = plate(Math.min(w - 0.006, 0.06), 0.014, label, { bg: "#eef0f2", fg: "#1e2226", font: "bold 64px sans-serif" });
  lb.position.set(0, -0.032, 0.0765);
  g.add(lb);
  return { group: g, w, h: 0.18, top: xs, bottom: xs };
}
function dinContactor(overload) {
  const g = new THREE.Group();
  const w = 0.09;
  const body = box(w, 0.16, 0.08, PM.grey);
  body.position.z = 0.04;
  const face = box(w - 0.012, 0.07, 0.02, PM.white);
  face.position.set(0, 0, 0.09);
  const win = box(0.03, 0.016, 0.004, PM.green);
  win.position.set(0, 0.012, 0.101);
  const coil = plate(0.04, 0.012, "24VDC", { bg: "#ffffff", fg: "#1e2226", font: "bold 60px sans-serif" });
  coil.position.set(0, -0.016, 0.1005);
  g.add(body, face, win, coil);
  const xs = [-0.03, 0, 0.03];
  screwRow(g, xs, 0.066, 0.081);
  screwRow(g, xs, -0.066, 0.081);
  let h = 0.16;
  if (overload) {
    const ob = box(w, 0.1, 0.075, PM.grey);
    ob.position.set(0, -0.13, 0.0375);
    const dial = cyl(0.012, 0.006, PM.blueBtn, 16);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(-0.025, -0.12, 0.078);
    const stop = box(0.014, 0.014, 0.006, PM.red);
    stop.position.set(0.01, -0.12, 0.078);
    const rst = cyl(0.007, 0.006, PM.blueBtn, 12);
    rst.rotation.x = Math.PI / 2;
    rst.position.set(0.03, -0.12, 0.078);
    g.add(ob, dial, stop, rst);
    screwRow(g, xs, -0.165, 0.076);
    h = 0.26;
  }
  // Con térmico, el contactor sigue sobre el riel y el térmico cuelga debajo.
  return { group: g, w, h, top: xs, bottom: xs, up: 0.08, down: overload ? 0.18 : 0.08 };
}
function dinPsu() {
  const g = new THREE.Group();
  const w = 0.08;
  const body = box(w, 0.18, 0.1, mat(0xd8dce0, { metalness: 0.3, roughness: 0.4 }));
  body.position.z = 0.05;
  g.add(body);
  for (let i = 0; i < 7; i++) {
    const v = box(w - 0.02, 0.003, 0.002, PM.dark);
    v.position.set(0, -0.05 + i * 0.012, 0.101);
    g.add(v);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), mat(0x22d33a, { emissive: 0x1f8a46 }));
  led.position.set(-0.025, 0.045, 0.102);
  const lb = plate(0.05, 0.016, "24 V", { bg: "#d8dce0", fg: "#1e2226", font: "bold 72px sans-serif" });
  lb.position.set(0.008, 0.045, 0.1015);
  g.add(led, lb);
  const xs = [-0.027, -0.009, 0.009, 0.027];
  screwRow(g, xs, 0.08, 0.101, 0.005);
  screwRow(g, xs.slice(1), -0.08, 0.101, 0.005);
  return { group: g, w, h: 0.18, top: xs, bottom: xs.slice(1) };
}
/** JWPLC Basic: cuerpo negro, borneras verdes arriba y abajo, pantalla y teclado. */
function plcBasic() {
  const g = new THREE.Group();
  const w = 0.3;
  const h = 0.2;
  const body = box(w, h, 0.07, PM.black);
  body.position.z = 0.035;
  g.add(body);
  for (const y of [h / 2 - 0.014, -h / 2 + 0.014]) {
    const strip = box(w - 0.03, 0.022, 0.02, PM.termGreen);
    strip.position.set(0, y, 0.075);
    g.add(strip);
    for (let i = 0; i < 14; i++) {
      const hole = box(0.008, 0.008, 0.002, PM.dark);
      hole.position.set(-w / 2 + 0.03 + i * 0.0185, y, 0.0855);
      g.add(hole);
    }
  }
  const sc = screen(0.1, 0.055, { bg: "#0b1a10", fg: "#7dff9a", font: "bold 64px monospace" });
  sc.plane.position.set(-0.06, 0.01, 0.0705);
  const logo = plate(0.06, 0.03, "JW", { bg: "#16191d", fg: "#ffffff", font: "bold 150px sans-serif" });
  logo.position.set(-0.06, -0.045, 0.0705);
  g.add(sc.plane, logo);
  // cruz de flechas, X roja y OK verde
  for (const [dx, dy] of [[0, 0.022], [0, -0.022], [-0.022, 0], [0.022, 0]]) {
    const k = box(0.016, 0.016, 0.006, mat(0x3a4048));
    k.position.set(0.07 + dx, 0.005 + dy, 0.073);
    g.add(k);
  }
  const x = box(0.016, 0.016, 0.006, PM.red);
  x.position.set(0.035, -0.035, 0.073);
  const ok = box(0.016, 0.016, 0.006, PM.green);
  ok.position.set(0.105, -0.035, 0.073);
  g.add(x, ok);
  const xs = Array.from({ length: 6 }, (_, i) => -0.1 + i * 0.04);
  return { group: g, w, h, top: xs, bottom: xs, screen: sc };
}
/** Variador: cuerpo gris oscuro, rejilla arriba, teclado con pantalla roja y tapa de bornes. */
function vfdModel() {
  const g = new THREE.Group();
  const w = 0.15;
  const h = 0.3;
  const body = box(w, h, 0.13, mat(0x4b4e52, { roughness: 0.55 }));
  body.position.z = 0.065;
  g.add(body);
  for (let i = 0; i < 6; i++) {
    const v = box(0.014, 0.006, 0.002, PM.dark);
    v.position.set(-0.05 + i * 0.02, h / 2 - 0.02, 0.131);
    g.add(v);
  }
  const pad = box(0.12, 0.1, 0.006, mat(0x23262a));
  pad.position.set(0, 0.04, 0.133);
  const sc = screen(0.07, 0.022, { bg: "#140303", fg: "#ff3b30", font: "bold 80px monospace" });
  sc.plane.position.set(-0.012, 0.068, 0.1365);
  const knob = cyl(0.012, 0.01, mat(0x3a4048), 16);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.04, 0.068, 0.138);
  const run = box(0.022, 0.012, 0.005, PM.green);
  run.position.set(-0.03, 0.03, 0.137);
  const stop = box(0.022, 0.012, 0.005, PM.red);
  stop.position.set(-0.03, 0.012, 0.137);
  const ent = box(0.022, 0.012, 0.005, PM.blueBtn);
  ent.position.set(0.035, 0.012, 0.137);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), mat(COL.off, { emissive: 0x000000 }));
  led.position.set(-0.052, 0.068, 0.137);
  const cover = box(0.13, 0.09, 0.008, mat(0x5b5f64));
  cover.position.set(0, -0.09, 0.134);
  const lb = plate(0.07, 0.016, "JW variador", { bg: "#4b4e52", fg: "#ffffff", font: "bold 52px sans-serif" });
  lb.position.set(0, -0.03, 0.1315);
  g.add(pad, sc.plane, knob, run, stop, ent, led, cover, lb);
  const xs = [-0.045, -0.015, 0.015, 0.045];
  return { group: g, w, h, top: xs.slice(0, 3), bottom: xs, screen: sc, led };
}
function dinRelay() {
  const g = new THREE.Group();
  const w = 0.036;
  const body = box(w, 0.18, 0.07, PM.white);
  body.position.z = 0.035;
  const dial = cyl(0.01, 0.006, mat(0xfbfbfc), 16);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, 0, 0.073);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), mat(0xffae00));
  led.position.set(0, 0.04, 0.071);
  g.add(body, dial, led);
  const xs = [-0.01, 0.01];
  screwRow(g, xs, 0.075, 0.071, 0.005);
  screwRow(g, xs, -0.075, 0.071, 0.005);
  return { group: g, w, h: 0.18, top: xs, bottom: xs };
}

/**
 * Tablero eléctrico con la puerta abierta: en la placa de montaje los equipos
 * de la escena sobre dos rieles DIN, canaletas ranuradas con tapa, cables de
 * cada equipo a la canaleta y borneras al pie; en la puerta (con bisagras,
 * burlete y manija) los pilotos, selectores y pulsadores. Frente hacia +z,
 * origen en el centro de la base del soporte.
 */
function buildPanel(spec) {
  const g = new THREE.Group();
  const base = (t) => t.split("/").pop();
  const devs = spec.devices ?? [];
  const of = (...types) => devs.filter((d) => types.includes(base(d.type)));
  const mounted = new Set(devs.filter((d) => d.mount).map((d) => d.mount));
  const door = of("lamp", "pushbutton-lit", "selector-2", "selector-3", "selector-key", "pushbutton-no", "pushbutton-nc", "emergency-stop");
  // Modelos por fila (arriba: entrada y control; abajo: potencia).
  const vfds = [];
  const plcs = [];
  const make = (d) => {
    const t = base(d.type);
    if (t === "power-3ph" || t === "breaker" || t === "power-230vac" || t === "motor-protector") {
      const poles = t === "power-230vac" ? 2 : t === "breaker" ? Number(String(d.params?.poles ?? "1").replace(/\D/g, "") || 1) : 3;
      return dinBreaker(poles, t === "power-3ph" ? "3×380" : t === "power-230vac" ? "230 V" : t === "motor-protector" ? "QM" : "C16");
    }
    if (t === "power-24vdc") return dinPsu();
    if (t === "jwplc-basic") {
      const m = plcBasic();
      plcs.push({ id: d.id, paint: m.screen.paint });
      return m;
    }
    if (t === "vfd-el") {
      const m = vfdModel();
      vfds.push({ id: d.id, paint: m.screen.paint, led: m.led });
      return m;
    }
    if (t === "contactor") return dinContactor(mounted.has(d.id));
    return dinRelay();
  };
  const row1 = [...of("power-230vac", "power-3ph", "breaker", "motor-protector"), ...of("power-24vdc"), ...of("jwplc-basic")].map(make);
  const row2 = [...of("vfd-el"), ...of("contactor"), ...of("relay", "timer-relay", "ssr", "level-relay")].map(make);
  const gap = 0.025;
  const rowW = (r) => r.reduce((a, m) => a + m.w + gap, -gap);
  const W = Math.max(0.6, Math.min(1.6, Math.max(rowW(row1), rowW(row2)) + 0.16));
  const H = 1.15;
  const D = 0.32;
  const legH = 0.4;
  const y0 = legH;
  const body = mat(0xd5d9de, { roughness: 0.45, metalness: 0.25 });
  // Gabinete con su visera contra la lluvia (va a la intemperie en la azotea).
  for (const [w, h, d, x, y, z] of [
    [W, H, 0.02, 0, y0 + H / 2, -D / 2],
    [0.02, H, D, -W / 2, y0 + H / 2, 0],
    [0.02, H, D, W / 2, y0 + H / 2, 0],
    [W, 0.02, D, 0, y0 + H, 0],
    [W, 0.02, D, 0, y0, 0],
  ]) {
    const b = box(w, h, d, body);
    b.position.set(x, y, z);
    g.add(b);
  }
  const visor = box(W + 0.08, 0.02, D + 0.1, body);
  visor.position.set(0, y0 + H + 0.05, 0.03);
  visor.rotation.x = 0.12;
  g.add(visor);
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05])
    for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) {
      const leg = box(0.04, legH, 0.04, mat(0x5b6470));
      leg.position.set(x, legH / 2, z);
      g.add(leg);
    }
  // Placa de montaje.
  const zf = -D / 2 + 0.025;
  const plateM = box(W - 0.06, H - 0.06, 0.008, mat(0xe8dcc4, { roughness: 0.8 }));
  plateM.position.set(0, y0 + H / 2, zf - 0.004);
  g.add(plateM);
  // Canaletas ranuradas con tapa (la ranura se pinta como bandas).
  const slots = (() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 32;
    const x = c.getContext("2d");
    x.fillStyle = "#a7adb4";
    x.fillRect(0, 0, 256, 32);
    x.fillStyle = "#6c737b";
    for (let i = 0; i < 256; i += 12) x.fillRect(i, 0, 5, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const duct = (y, w) => {
    const d = box(w, 0.06, 0.06, new THREE.MeshStandardMaterial({ map: slots, roughness: 0.7 }));
    d.material.map = slots.clone();
    d.material.map.repeat.set(w * 8, 1);
    d.material.map.needsUpdate = true;
    d.position.set(0, y, zf + 0.03);
    const lid = box(w, 0.064, 0.006, mat(0xb9bfc6));
    lid.position.set(0, y, zf + 0.063);
    g.add(d, lid);
  };
  const yTop = y0 + H - 0.08;
  const yR1 = y0 + H - 0.27;
  const yMid = y0 + H - 0.46;
  const yR2 = y0 + H - 0.67;
  const yLow = y0 + 0.26;
  const yTb = y0 + 0.13;
  for (const y of [yTop, yMid, yLow]) duct(y, W - 0.1);
  const wireTo = (x, ya, yb, hex) => g.add(segment([x, ya, zf + 0.05], [x, yb, zf + 0.05], 0.0035, mat(hex)));
  const place = (row, y, upY, downY, hexes) => {
    let x = -rowW(row) / 2;
    for (const m of row) {
      const cx = x + m.w / 2;
      const yy = y + (m.dy ?? 0);
      m.group.position.set(cx, yy, zf);
      g.add(m.group);
      // Rieles DIN bajo cada equipo.
      m.top.forEach((tx, i) => wireTo(cx + tx, yy + (m.up ?? m.h / 2) - 0.005, upY - 0.03, hexes[i % hexes.length]));
      m.bottom.forEach((tx, i) => wireTo(cx + tx, yy - (m.down ?? m.h / 2) + 0.005, downY + 0.03, hexes[(i + 1) % hexes.length]));
      x += m.w + gap;
    }
    const rail = box(W - 0.12, 0.035, 0.008, mat(0xb8c0c8, { metalness: 0.7, roughness: 0.3 }));
    rail.position.set(0, y, zf + 0.004);
    g.add(rail);
  };
  place(row1, yR1, yTop, yMid, [WIRE_HEX["marrón"], WIRE_HEX.negro, WIRE_HEX.gris, WIRE_HEX.azul]);
  place(row2, yR2, yMid, yLow, [WIRE_HEX.negro, WIRE_HEX["marrón"], WIRE_HEX.gris, WIRE_HEX.azul]);
  // Borneras de salida al pie, con su cable bajando de la canaleta.
  const nTb = Math.floor((W - 0.16) / 0.014);
  for (let i = 0; i < nTb; i++) {
    const pe = i % 8 === 7;
    const tb = box(0.012, 0.07, 0.06, mat(pe ? 0x3fae49 : 0x9aa3ad));
    tb.position.set(-W / 2 + 0.09 + i * 0.014, yTb, zf + 0.03);
    g.add(tb);
    if (pe) {
      const stripe = box(0.0122, 0.015, 0.0605, mat(0xf2cf1d));
      stripe.position.copy(tb.position);
      g.add(stripe);
    }
    if (i % 2 === 0) wireTo(tb.position.x, yTb + 0.035, yLow - 0.03, [WIRE_HEX.negro, WIRE_HEX.azul, WIRE_HEX["marrón"]][i % 3]);
  }
  // Puerta con bisagras, burlete, manija y bolsillo de planos; mandos en su cara exterior.
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, y0, D / 2);
  const leaf = box(W, H, 0.022, body);
  leaf.position.set(W / 2, H / 2, 0);
  // Burlete: un marco negro alrededor de la cara interior (no toda la cara).
  for (const [gw, gh, gx, gy] of [[W - 0.04, 0.016, W / 2, 0.028], [W - 0.04, 0.016, W / 2, H - 0.028], [0.016, H - 0.04, 0.028, H / 2], [0.016, H - 0.04, W - 0.028, H / 2]]) {
    const gs = box(gw, gh, 0.006, PM.black);
    gs.position.set(gx, gy, -0.014);
    hinge.add(gs);
  }
  // Bolsillo de planos con los planos asomando.
  const pocket = box(W * 0.5, 0.2, 0.016, mat(0x9aa1a9));
  pocket.position.set(W / 2, 0.26, -0.02);
  const docs = box(W * 0.44, 0.06, 0.008, mat(0xf4f1e6));
  docs.position.set(W / 2, 0.37, -0.018);
  hinge.add(leaf, pocket, docs);
  for (const y of [0.15, H - 0.15]) {
    const hg = cyl(0.012, 0.08, PM.screw, 12);
    hg.position.set(0, y, 0);
    hinge.add(hg);
  }
  const handle = box(0.025, 0.12, 0.03, PM.black);
  handle.position.set(W - 0.06, H / 2, 0.025);
  hinge.add(handle);
  const lamps = [];
  door.forEach((d, i) => {
    const cols = Math.max(1, Math.min(4, door.length));
    const cx = ((i % cols) + 0.5) * (W / cols);
    const cy = H * 0.72 - Math.floor(i / cols) * 0.22;
    const t = base(d.type);
    const ring = cyl(0.036, 0.02, mat(0x8b929b, { metalness: 0.6, roughness: 0.3 }), 24);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, cy, 0.02);
    hinge.add(ring);
    if (t === "lamp" || t === "pushbutton-lit") {
      const hex = LAMP_HEX[d.params?.color] ?? LAMP_HEX.verde;
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hex, { emissive: 0x000000, transparent: true, opacity: 0.9 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(cx, cy, 0.03);
      hinge.add(lens);
      lamps.push({ id: d.id, lens, hex });
    } else if (t === "emergency-stop") {
      const yb = box(0.09, 0.09, 0.004, mat(0xf2cf1d));
      yb.position.set(cx, cy, 0.013);
      const mush = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PM.red);
      mush.rotation.x = Math.PI / 2;
      mush.position.set(cx, cy, 0.035);
      hinge.add(yb, mush);
    } else if (t.startsWith("selector")) {
      const knob = cyl(0.026, 0.02, PM.black, 20);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(cx, cy, 0.035);
      const bar = box(0.012, 0.045, 0.02, PM.black);
      bar.position.set(cx, cy, 0.05);
      bar.rotation.z = -0.6;
      hinge.add(knob, bar);
    } else {
      const btn = cyl(0.024, 0.02, t === "pushbutton-nc" ? PM.red : PM.green, 16);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(cx, cy, 0.035);
      hinge.add(btn);
    }
    // Por dentro de la puerta: los bloques de contacto del mando, con sus cables.
    const blk = box(0.05, 0.05, 0.04, PM.white);
    blk.position.set(cx, cy, -0.035);
    const blkScr = box(0.04, 0.008, 0.004, PM.screw);
    blkScr.position.set(cx, cy + 0.02, -0.056);
    hinge.add(blk, blkScr);
    const tag = plate(0.1, 0.024, d.params?.label ? `${d.id} ${d.params.label}` : d.id, { bg: "#f2f3f4", fg: "#1a1d21", font: "bold 44px sans-serif" });
    tag.position.set(cx, cy - 0.06, 0.012);
    hinge.add(tag);
  });
  const brand = plate(0.24, 0.05, "JW CONTROL", { bg: "#23272d", fg: "#ffffff", font: "bold 60px sans-serif" });
  brand.position.set(W / 2, H - 0.08, 0.012);
  hinge.add(brand);
  hinge.rotation.y = -1.7;
  g.add(hinge);
  const glandX = (k, n) => -W / 2 + 0.12 + (k * (W - 0.24)) / Math.max(1, n - 1);
  return { group: g, W, D, H, legH, vfds, plcs, lamps, glandX, bottom: y0 };
}

// Electrobomba y válvulas de la sala de bombas. Eje de la bomba a lo largo de z
// (motor hacia +z, voluta hacia −z); origen en el centro de la base, sobre la losa.
const PUMP = {
  blue: mat(0x2f6fb5, { metalness: 0.35, roughness: 0.45 }),
  blueDk: mat(0x24578f, { metalness: 0.35, roughness: 0.5 }),
  iron: mat(0x6f7882, { metalness: 0.5, roughness: 0.45 }),
  steel: mat(0xb8c0c8, { metalness: 0.6, roughness: 0.35 }),
  base: mat(0x3a4048, { metalness: 0.4, roughness: 0.55 }),
  black: mat(0x1d2126, { roughness: 0.5 }),
  guard: mat(0xffb020, { roughness: 0.5, transparent: true, opacity: 0.45 }),
  wheel: mat(0xc0282d, { roughness: 0.45 }),
  brass: mat(0xb08d3a, { metalness: 0.6, roughness: 0.35 }),
};
/** Brida: disco con pernos, perpendicular a y. */
function flange(r, t = 0.018) {
  const g = new THREE.Group();
  g.add(cyl(r, t, PUMP.iron, 24));
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const b = cyl(0.008, t + 0.016, PUMP.steel, 8);
    b.position.set(Math.cos(a) * r * 0.78, 0, Math.sin(a) * r * 0.78);
    g.add(b);
  }
  return g;
}
/** Volante de válvula (con rayos), perpendicular a y. */
function handwheel(r) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 8, 24), PUMP.wheel);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  for (let k = 0; k < 3; k++) {
    const s = box(r * 2, r * 0.12, r * 0.12, PUMP.wheel);
    s.rotation.y = (k * Math.PI) / 3;
    g.add(s);
  }
  return g;
}
/** Válvula de compuerta bridada en una tubería a lo largo de y; bonete y volante hacia +z. */
function gateValve(r) {
  const g = new THREE.Group();
  const body = cyl(r * 1.25, r * 2.6, PUMP.iron, 20);
  g.add(body);
  for (const y of [-r * 1.4, r * 1.4]) {
    const f = flange(r * 1.7);
    f.position.y = y;
    g.add(f);
  }
  const bonnet = cyl(r * 0.8, r * 2.2, PUMP.iron, 16);
  bonnet.rotation.x = Math.PI / 2;
  bonnet.position.z = r * 1.6;
  const stem = cyl(r * 0.18, r * 1.4, PUMP.brass, 8);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = r * 3.2;
  const hw = handwheel(r * 1.4);
  hw.rotation.x = Math.PI / 2;
  hw.position.z = r * 3.8;
  g.add(bonnet, stem, hw);
  return g;
}
/** Válvula de retención bridada a lo largo de y, con su tapa hacia +z. */
function checkValve(r) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.35, r * 2.8, PUMP.iron, 20));
  for (const y of [-r * 1.5, r * 1.5]) {
    const f = flange(r * 1.7);
    f.position.y = y;
    g.add(f);
  }
  const cover = cyl(r * 0.95, r * 0.5, PUMP.iron, 16);
  cover.rotation.x = Math.PI / 2;
  cover.position.z = r * 1.35;
  const arrow = box(r * 0.25, r * 1.6, 0.004, PUMP.steel);
  arrow.position.set(0, 0, r * 1.36);
  g.add(cover, arrow);
  return g;
}
/** Electrobomba monoblock sobre su bancada: motor con aletas, caja de bornes, ventilador, acople y voluta. */
function electroPump(id, ay) {
  const g = new THREE.Group();
  const bed = box(0.38, 0.06, 0.86, PUMP.base);
  bed.position.set(0, 0.15, 0);
  g.add(bed);
  for (const x of [-0.17, 0.17])
    for (const z of [-0.36, 0.36]) {
      const bolt = cyl(0.012, 0.03, PUMP.steel, 8);
      bolt.position.set(x, 0.19, z);
      g.add(bolt);
    }
  // Motor: carcasa con aletas longitudinales, tapas, patas y ventilador con rejilla.
  const mz = 0.2;
  const R = 0.13;
  const body = cyl(R, 0.32, PUMP.blue, 32);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, ay, mz);
  g.add(body);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.5) continue; // libre sobre las patas
    const fin = box(0.008, 0.026, 0.28, PUMP.blue);
    fin.position.set(Math.cos(a) * (R + 0.01), ay + Math.sin(a) * (R + 0.01), mz);
    fin.rotation.z = a - Math.PI / 2;
    g.add(fin);
  }
  for (const z of [mz - 0.17, mz + 0.17]) {
    const bell = cyl(R + 0.012, 0.03, PUMP.blueDk, 32);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, ay, z);
    g.add(bell);
  }
  for (const z of [mz - 0.1, mz + 0.1]) {
    const foot = box(0.3, 0.05, 0.06, PUMP.blueDk);
    foot.position.set(0, ay - R - 0.005, z);
    const leg = box(0.12, ay - R - 0.17, 0.06, PUMP.blueDk);
    leg.position.set(0, (ay - R + 0.18) / 2, z);
    g.add(foot, leg);
  }
  const fan = cyl(R + 0.005, 0.11, PUMP.black, 32);
  fan.rotation.x = Math.PI / 2;
  fan.position.set(0, ay, mz + 0.24);
  g.add(fan);
  for (const r of [0.04, 0.075, 0.11]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.005, 6, 28), PUMP.iron);
    ring.position.set(0, ay, mz + 0.296);
    g.add(ring);
  }
  // Caja de bornes con prensaestopa hacia el tablero, y placa de datos al costado.
  const tb = box(0.13, 0.08, 0.13, PUMP.blueDk);
  tb.position.set(0, ay + R + 0.04, mz);
  const lid = box(0.14, 0.012, 0.14, PUMP.blue);
  lid.position.set(0, ay + R + 0.086, mz);
  const gland = cyl(0.018, 0.04, PUMP.black, 12);
  gland.rotation.z = Math.PI / 2;
  gland.position.set(0.085, ay + R + 0.04, mz);
  g.add(tb, lid, gland);
  const np = plate(0.1, 0.05, `${id} 3~ 2,2 kW`, { bg: "#d9dde2", fg: "#1a1d21", font: "bold 38px sans-serif" });
  np.rotation.y = Math.PI / 2;
  np.position.set(R + 0.032, ay + 0.02, mz + 0.02);
  g.add(np);
  // Linterna con el acople a la vista y su guarda; voluta con bocas bridadas.
  const lantern = cyl(0.07, 0.12, PUMP.iron, 20);
  lantern.rotation.x = Math.PI / 2;
  lantern.position.set(0, ay, -0.02);
  const guard = box(0.17, 0.15, 0.1, PUMP.guard);
  guard.position.set(0, ay, -0.02);
  g.add(lantern, guard);
  const volute = cyl(0.17, 0.12, PUMP.iron, 32);
  volute.rotation.x = Math.PI / 2;
  volute.position.set(0, ay + 0.015, -0.16);
  const snail = cyl(0.1, 0.12, PUMP.iron, 20);
  snail.rotation.x = Math.PI / 2;
  snail.position.set(0.08, ay + 0.1, -0.16);
  const pfoot = box(0.2, ay - 0.2, 0.08, PUMP.iron);
  pfoot.position.set(0, (ay + 0.18) / 2 - 0.02, -0.16);
  g.add(volute, snail, pfoot);
  const out = cyl(0.045, 0.08, PUMP.iron, 16);
  out.position.set(0, ay + 0.2, -0.16);
  const outF = flange(0.075);
  outF.position.set(0, ay + 0.24, -0.16);
  const inl = cyl(0.05, 0.08, PUMP.iron, 16);
  inl.rotation.x = Math.PI / 2;
  inl.position.set(0, ay, -0.26);
  const inF = flange(0.08);
  inF.rotation.x = Math.PI / 2;
  inF.position.set(0, ay, -0.3);
  g.add(out, outF, inl, inF);
  return { group: g, gland: [0.105, ay + R + 0.04, mz], dischargeY: ay + 0.25, suctionZ: -0.31 };
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
    const ep = electroPump(id, ay);
    ep.group.position.set(x, 0, pz);
    top.add(ep.group);
    // Acople que gira con la velocidad: eje, cubos y chaveta.
    const rotor = new THREE.Group();
    const shaft = cyl(0.025, 0.12, steel, 12);
    shaft.rotation.x = Math.PI / 2;
    const hubs = [-0.025, 0.025].map((z) => {
      const h = cyl(0.045, 0.035, PUMP.black, 16);
      h.rotation.x = Math.PI / 2;
      h.position.z = z;
      return h;
    });
    const key = box(0.11, 0.018, 0.07, mat(0xffb020));
    rotor.add(shaft, ...hubs, key);
    rotor.position.set(x, ay, pz - 0.02);
    const tag = label(id);
    tag.scale.set(0.44, 0.11, 1);
    tag.position.set(x, 0.05, pz + 0.65);
    top.add(rotor, tag);
    // Succión desde el colector con su válvula de compuerta.
    const zs = pz + ep.suctionZ;
    top.add(run([[x, ay, zs], [x, ay, -0.75]], 0.04, steel));
    const sv = gateValve(0.04);
    sv.rotation.x = -Math.PI / 2;
    sv.position.set(x, ay, (zs - 0.75) / 2);
    // Descarga vertical: retención y compuerta bridadas.
    const zd = pz - 0.16;
    top.add(run([[x, ep.dischargeY, zd], [x, 1.05, zd]], 0.04, pipeM));
    const cv = checkValve(0.04);
    cv.position.set(x, 0.6, zd);
    const dv = gateValve(0.04);
    dv.position.set(x, 0.86, zd);
    top.add(sv, cv, dv);
    const gl = ep.gland;
    return { id, rotor, x, box: [x + gl[0] + 0.02, gl[1], pz + gl[2]] };
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
  /** Para pruebas: coloca la cámara (posición y objetivo en metros). */
  camera(pos, target) {
    if (!V.ready) return;
    V.camera.position.set(...pos);
    V.controls.target.set(...target);
    V.controls.update();
  },
  /** Para pruebas: posición del acople de cada electrobomba. */
  pumpsAt() {
    const v = new THREE.Vector3();
    return [...V.objects.values()].flatMap((o) => o.model.pumps ?? []).map((pm) => (pm.rotor.getWorldPosition(v), [v.x, v.y, v.z]));
  },
  /** Para pruebas: posición del tablero en la escena (centro de su base). */
  panelAt() {
    const g = V.panel?.group;
    if (!g) return null;
    const v = new THREE.Vector3();
    g.getWorldPosition(v);
    return [v.x, v.y, v.z, V.panel.W, V.panel.H, V.panel.bottom ?? 0];
  },
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
