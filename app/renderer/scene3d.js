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
const SENSORS = new Set(["jwsim/limit-switch", "jwsim/sensor-inductive", "jwsim/sensor-photoelectric", "jwsim/sensor-cylinder", "jwsim/sensor-capacitive", "jwsim/float-switch"]);
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

function buildTank(p, spec) {
  const R = 0.6;
  const H = 1.6;
  const g = new THREE.Group();
  // Tolva: cono hacia abajo sobre cuatro patas, con la salida al pie.
  const cone = /cono|tolva/i.test(String(p?.forma ?? ""));
  const rb = cone ? 0.14 : R;
  const shellM = mat(COL.tank, { transparent: true, opacity: 0.28, roughness: 0.2, depthWrite: false });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, rb, H, 40, 1, cone), shellM);
  shell.position.y = H / 2 + 0.2;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.97, rb * 0.97, 1, 40), mat(COL.water, { transparent: true, opacity: 0.85 }));
  water.position.y = 0.2;
  const base = cone ? new THREE.Group() : cyl(R + 0.05, 0.2, mat(COL.frame), 40);
  base.position.y = 0.1;
  if (cone) {
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(0.05, H * 0.75, 0.05, mat(COL.frame));
      leg.position.set(lx * R * 0.72, H * 0.375 - 0.1, lz * R * 0.72);
      g.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.025, 8, 40), mat(COL.frame));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = H * 0.75 + 0.2;
    const outlet = cyl(0.05, 0.25, mat(COL.roller), 14);
    outlet.position.y = 0.08;
    g.add(ring, outlet);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.02, 8, 48), mat(COL.frame));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H + 0.2;
  // Bomba al costado con su caño al tanque.
  // Electrobomba al costado (la misma de la sala de bombas) con su descarga al
  // tanque, si lo llena un motor; si lo llena otro equipo (un filtro), solo la entrada.
  const pumpId = String(p?.bomba ?? "").split(".")[0];
  const motorFed = !spec || (spec.devices ?? []).some((q) => q.id === pumpId && FIELD.motor.has(q.type));
  const ep = electroPump(pumpId || "P", 0.36);
  ep.group.visible = motorFed;
  const px = R + 0.5;
  const pz = 0.12;
  ep.group.position.set(px, 0, pz);
  ep.group.scale.setScalar(0.85);
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI / 2;
  holder.position.set(px, 0.36 * 0.85, pz - 0.02 * 0.85);
  const impeller = new THREE.Group();
  const hub = cyl(0.04, 0.05, PUMP.black, 16);
  hub.rotation.z = Math.PI / 2;
  const key = box(0.05, 0.09, 0.016, mat(0xffb020));
  impeller.add(hub, key);
  holder.add(impeller);
  const zd = pz - 0.16 * 0.85;
  const pipeM = mat(0x2f6fb5, { metalness: 0.3 });
  const pipe = run([[px, ep.dischargeY * 0.85, zd], [px, H + 0.35, zd], [R * 0.55, H + 0.35, zd], [R * 0.55, H + 0.15, zd]], 0.035, pipeM);
  const pipeTop = checkValve(0.035);
  pipeTop.position.set(px, 0.75, zd);
  holder.visible = pipe.visible = pipeTop.visible = motorFed;
  g.add(shell, water, base, rim, ep.group, holder, pipe, pipeTop);
  return { group: g, water, impeller, H, R, cone, size: [2 * R + 0.8, 2 * R] };
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
  setupPicking(canvas);
  V.ready = true;
  loadBoard();
  requestAnimationFrame(frame);
}

/**
 * Clic sobre un mando o un equipo de campo en 3D: lo acciona igual que en el
 * esquema (pulsar mientras se mantiene, alternar, o pasar a la posición
 * siguiente). Solo con la simulación en marcha; si no, el clic gira la vista.
 */
function setupPicking(canvas) {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const pick = (e) => {
    if (!V.hits?.length) return null;
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, V.camera);
    const hit = ray.intersectObjects(V.hits.map((h) => h.mesh), false)[0];
    return hit ? V.hits.find((h) => h.mesh === hit.object) : null;
  };
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons) return;
    canvas.style.cursor = window.JwsimScene?.running?.() && pick(e) ? "pointer" : "";
  });
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      const Sc = window.JwsimScene;
      if (!Sc?.running?.() || e.button !== 0) return;
      const h = pick(e);
      if (!h) return;
      const a = (Sc.actionsOf(h.id) ?? []).find((x) => x.kind !== "value");
      if (!a) return;
      e.stopImmediatePropagation();
      V.controls.enabled = false;
      const cur = Sc.actionState(h.id, a.id);
      if (a.kind === "momentary") {
        Sc.act(h.id, a.id, true);
        const up = () => {
          Sc.act(h.id, a.id, false);
          V.controls.enabled = true;
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointerup", up);
        return;
      }
      if (a.kind === "toggle") Sc.act(h.id, a.id, !cur);
      else if (a.options) {
        const i = a.options.map(Number).indexOf(Number(cur ?? a.options[0]));
        Sc.act(h.id, a.id, Number(a.options[(i + 1) % a.options.length]));
      }
      const up = () => {
        V.controls.enabled = true;
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointerup", up);
    },
    { capture: true },
  );
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
  // La fila de campo va adelante: se encuadra el medio entre ella y la planta.
  const cz = (V.zFront ?? 0) / 2;
  V.controls.target.set(cx, cy, cz);
  V.camera.position.set(cx, cy + d * 0.45, cz + d * 0.9);
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

/**
 * Tuberías de proceso del filtro de arena: bomba → entrada del filtro; salida
 * → válvula de servicio → tanque; válvula de retrolavado → desagüe; y la
 * manguera del clorador inyectando en la línea al tanque.
 */
function processPipes(plant) {
  const fieldOf = (ref) => V.field.find((f) => f.id === String(ref ?? "").split(".")[0])?.m;
  const pipeM = mat(0x2f6fb5, { metalness: 0.3 });
  for (const d of plant.filter((q) => q.type === "jwsim/sand-filter")) {
    const F = V.objects.get(d.id).model.group.position;
    const pm = fieldOf(d.params?.bomba);
    if (pm?.discharge) {
      const p0 = pm.group.position;
      const a = [p0.x + pm.discharge[0], pm.discharge[1], p0.z + pm.discharge[2]];
      V.root.add(run([a, [a[0], 2.05, a[2]], [F.x - 0.3, 2.05, a[2]], [F.x - 0.3, 2.05, 0], [F.x - 0.3, 1.85, 0]], 0.035, pipeM));
      // Succión desde el pozo de agua cruda (atrás), con su tapa de registro.
      V.root.add(run([[p0.x, 0.36, p0.z - 0.31], [p0.x, 0.36, -0.95], [p0.x, 0.05, -0.95]], 0.035, mat(0xb8c0c8, { metalness: 0.6, roughness: 0.35 })));
      const well = box(0.5, 0.06, 0.5, mat(0x8e959d, { roughness: 0.95 }));
      well.position.set(p0.x, 0.03, -0.95);
      const lid = box(0.3, 0.012, 0.3, mat(0x3a4048, { metalness: 0.4 }));
      lid.position.set(p0.x + 0.08, 0.066, -0.95);
      const tagW = label("Agua cruda");
      tagW.scale.set(0.5, 0.125, 1);
      tagW.position.set(p0.x, 0.3, -1.2);
      V.root.add(well, lid, tagW);
    }
    const y1 = fieldOf(d.params?.servicio);
    const tank = plant.find((q) => q.type === "jwsim/tank" && String(q.params?.bomba ?? "").startsWith(`${d.id}.`));
    let feed = null;
    if (y1) {
      const v = y1.group.position;
      const vz = v.z + 0.05;
      V.root.add(run([[F.x + 1.55, 0.3, 0], [F.x + 1.65, 0.3, 0], [F.x + 1.65, 0.45, 0], [F.x + 1.65, 0.45, vz], [v.x - 0.25, 0.45, vz]], 0.03, pipeM));
      if (tank) {
        const T = V.objects.get(tank.id).model.group.position;
        const up = v.x + 0.45;
        V.root.add(run([[v.x + 0.25, 0.45, vz], [up, 0.45, vz], [up, 2.0, vz], [T.x - 0.3, 2.0, vz], [T.x - 0.3, 2.0, 0], [T.x - 0.3, 1.85, 0]], 0.03, pipeM));
        feed = [up, 1.2, vz];
      }
    }
    const y2 = fieldOf(d.params?.retrolavado);
    if (y2) {
      const v = y2.group.position;
      const vz = v.z + 0.05;
      V.root.add(run([[F.x + 0.6, 0.12, 0], [F.x + 0.6, 0.12, vz - 0.25], [v.x - 0.35, 0.12, vz - 0.25], [v.x - 0.35, 0.45, vz - 0.25], [v.x - 0.35, 0.45, vz], [v.x - 0.25, 0.45, vz]], 0.03, pipeM));
      V.root.add(run([[v.x + 0.25, 0.45, vz], [v.x + 0.35, 0.45, vz], [v.x + 0.35, 0.05, vz]], 0.03, pipeM));
      const drain = box(0.22, 0.02, 0.22, mat(0x3a4048));
      drain.position.set(v.x + 0.35, 0.01, vz);
      V.root.add(drain);
    }
    const cl = plant.find((q) => q.type === "jwsim/chlorinator");
    if (cl && feed) {
      const C = V.objects.get(cl.id).model.group.position;
      V.root.add(run([[C.x + 0.43, 0.64, 0], [C.x + 0.6, 0.64, 0], [C.x + 0.6, 2.25, 0], [feed[0], 2.25, 0], [feed[0], 2.25, feed[2]], [feed[0], 2.03, feed[2]]], 0.008, mat(0xf2f4f7)));
    }
  }
}

/** Piso que nombra un pulsador de llamada («Llamar PB», «Llamar P2», «Piso 1»), o null. */
function callFloor(d) {
  if (d.type !== "jwsim/pushbutton-no") return null;
  const t = String(d.params?.label ?? "");
  if (!/llam|piso|^P\d|^PB/i.test(t)) return null;
  if (/\bPB\b|baja/i.test(t)) return 0;
  const m = t.match(/P(?:iso)?\s*(\d)/i);
  return m ? Number(m[1]) : null;
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
  V.field = [];
  V.hits = [];
  V.zFront = 0;
  // Sin edificio (que lleva el suyo en la azotea), el tablero va al inicio de la planta.
  if (!plant.some((d) => d.type === "jwsim/building-water") && spec.devices.some((d) => d.type === "jwsim/jwplc-basic")) {
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
    // Montacargas: los pulsadores de llamada van en la botonera de su piso.
    if (model.station) {
      model.calls = [];
      for (const q of spec.devices) {
        const f = callFloor(q);
        if (f == null || f >= model.n) continue;
        const c = model.station(f, q.id);
        model.calls.push({ id: q.id, btn: c.btn });
        V.hits.push({ mesh: c.btn, id: q.id });
      }
    }
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
      const min = Number(s.params.min ?? (s.params.alto != null ? Number(s.params.alto) / 100 : 1));
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
      // Un final de carrera se ve como tal (palanca con rodillo); el resto, baliza.
      const sw = s.type === "jwsim/limit-switch" && !CONVEYORS.has(d.type);
      const b = sw ? rollerSwitch() : beacon();
      if (sw) b.scale.setScalar(2.2);
      if (CONVEYORS.has(d.type)) b.position.set(key === "sensorB" ? model.sB : model.sA, 0.7, model.W / 2 + 0.25);
      else if (d.type === "jwsim/tank") b.position.set(-model.R - 0.2, 0.2 + min * model.H - 0.55, 0);
      else if (d.type === "jwsim/lift") {
        const k = key === "altura" ? Math.max(-0.4, Math.min(Number(d.params?.entrePisos ?? 3) * 5, min)) * LIFT_K : Number(key.replace(/\D/g, "") || 0) * Number(d.params?.entrePisos ?? 3) * LIFT_K;
        b.position.set(key === "altura" ? -0.35 : 1.5, Math.max(0, k), key === "altura" ? 0.6 : -0.65);
      } else if (d.type === "jwsim/door") b.position.set(key === "persona" ? 0.2 : min > 0.5 ? 2 * model.A - 0.2 : model.A - 0.2, 0, 0.35);
      else b.position.set(min > 0.5 ? 1.4 : 0.9, 0, 0.35);
      if (sw) b.position.y += 0.25;
      // En el montacargas, el final de carrera va con su ménsula al perfil del pozo.
      if (sw && d.type === "jwsim/lift") {
        const px = b.position.x < 0.55 ? 0 : 1.1;
        const len = Math.abs(b.position.x - px);
        const br = box(len, 0.03, 0.03, mat(0x5b6470, { metalness: 0.4 }));
        br.position.set((b.position.x + px) / 2, b.position.y - 0.13, b.position.z);
        model.group.add(br);
      }
      const t = label(s.id);
      t.scale.set(sw ? 0.25 : 1, sw ? 0.0625 : 0.25, 1);
      t.position.y = sw ? 0.1 : 0.8;
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
  // Campo: lo que no dibuja ninguna planta va en una fila adelante, con su
  // canalización desde el tablero.
  const plantIds = new Set(plant.map((d) => d.id));
  const drawn = new Set();
  for (const d of plant) {
    const pp = d.params ?? {};
    const keys = d.type === "jwsim/building-water" ? ["bombas"] : d.type === "jwsim/tank" && spec.devices.some((q) => q.id === String(pp.bomba ?? "").split(".")[0] && FIELD.motor.has(q.type)) ? ["bomba"] : ["motor"];
    for (const k of keys) for (const id of String(pp[k] ?? "").split(/[\s,;]+/)) if (id) drawn.add(id.split(".")[0]);
  }
  const building = plant.some((d) => d.type === "jwsim/building-water");
  const field = spec.devices.filter((d) => {
    if (!FIELD.kinds.has(d.type) || drawn.has(d.id)) return false;
    if (SENSORS.has(d.type) && plantIds.has(sourceOf(d).split(".")[0])) return false;
    if (building && (d.type === "jwsim/pressure-rs485" || d.type === "jwsim/float-switch")) return false;
    return true;
  });
  const lampsBy = (c) => spec.devices.find((d) => d.type === "jwsim/lamp" && d.params?.color === c);
  const traffic = !plant.length && ["rojo", "amarillo", "verde"].every(lampsBy);
  const items = [];
  if (traffic) items.push({ id: "semaforo", label: "Semáforo", model: buildTrafficLight(["rojo", "amarillo", "verde"].map((c) => ({ id: lampsBy(c).id, hex: LAMP_HEX[c] }))), w: 0.7 });
  const pumpIds = new Set(plant.filter((q) => q.type === "jwsim/sand-filter").map((q) => String(q.params?.bomba ?? "").split(".")[0]));
  for (const d of field) items.push({ id: d.id, label: d.id, model: buildField(d, pumpIds.has(d.id) ? "pump" : null), w: d.type === "jwsim/sensor-photoelectric" ? 1.3 : FIELD.motor.has(d.type) ? 0.8 : 0.6 });
  // Cada equipo de campo va junto a la planta con la que trabaja (la que lo
  // nombra en sus parámetros o a la que mide); el resto, en la fila de campo.
  const refs = (d) => Object.values(d.params ?? {}).filter((v) => typeof v === "string").map((v) => v.split(".")[0]);
  const hostOf = (d) => {
    const own = refs(d).find((id) => plantIds.has(id));
    if (own) return own;
    return plant.find((pd) => refs(pd).includes(d.id))?.id ?? null;
  };
  const centerOf = (id) => {
    const o = V.objects.get(id);
    const gx = o.model.group.position.x;
    return o.type === "jwsim/tank" ? gx : gx + o.model.size[0] / 2;
  };
  const hosted = new Map();
  for (const it of items) {
    const d = spec.devices.find((q) => q.id === it.id);
    const h = d && V.objects.has(hostOf(d) ?? "") ? hostOf(d) : null;
    it.host = h;
    if (h) hosted.set(h, [...(hosted.get(h) ?? []), it]);
  }
  for (const list of hosted.values()) list.forEach((it, j) => (it.slot = j - (list.length - 1) / 2));
  if (items.length) {
    const side = !plant.length && !!V.panel;
    const free = items.filter((it) => !it.host);
    const fz = side ? 0.2 : hosted.size ? 2.1 : V.panel ? 1.6 : 0;
    let fx = side ? V.panel.W + 0.5 : 0.3;
    const conduitM = mat(0x5f6670, { roughness: 0.6 });
    items.forEach((it, k) => {
      const m = it.model;
      const px = it.host ? centerOf(it.host) + it.slot * 0.65 - 0.15 : fx;
      const pz = it.host ? 1.05 : fz;
      m.group.position.set(px + 0.15, 0, pz);
      V.root.add(m.group);
      const tag = label(it.label);
      tag.scale.set(0.5, 0.125, 1);
      tag.position.set(0, it.id === "semaforo" ? 2.5 : 1.05, 0);
      m.group.add(tag);
      for (const h of m.hit ?? []) V.hits.push({ mesh: h, id: it.id });
      V.field.push({ id: it.id, m });
      // Canalización: baja del tablero, va por el piso y sube al equipo.
      if (V.panel && !building) {
        const P = V.panel;
        const gx = P.group.position.x + P.glandX(k, items.length);
        const gz = P.D / 2 - 0.08;
        const ax = px + 0.15 + m.anchor[0];
        const az = pz + m.anchor[2];
        const lane = side ? fz + 0.55 + k * 0.05 : pz - 0.4 - k * 0.04;
        V.root.add(run([[gx, P.bottom, gz], [gx, 0.03, gz], [gx, 0.03, lane], [ax, 0.03, lane], [ax, 0.03, az], [ax, m.anchor[1], az]], 0.016, conduitM));
      }
      if (!it.host) fx += it.w + 0.3;
    });
    x = Math.max(x, fx + 0.9);
    V.zFront = side ? 0.3 : free.length ? fz : 1.05;
  }
  processPipes(plant);
  for (const h of V.panel?.hits ?? []) V.hits.push(h);
  V.extent = Math.max(2, x - 1.2);
  const roof = [...V.objects.values()].find((o) => o.model.roofY);
  V.focus = roof ? roof.model.roofY + 0.5 : null;
  V.height = Math.max(0, ...[...V.objects.values()].map((o) => o.model.height ?? 0));
  fitView();
  const empty = document.getElementById("view3d-empty");
  if (empty) empty.hidden = plant.length > 0 || !!V.panel || items.length > 0;
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
/** PLC genérico mientras carga el dibujo de la placa. */
function plcPlaceholder() {
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

// JWPLC Basic en 3D: el frente es el mismo dibujo de la pestaña Placa
// (assets/jwplc-basic.svg) pintado como textura; encima van el cuerpo
// escalonado, las borneras enchufables en relieve, la TFT en vivo (copia del
// canvas de la app) y los LED de E/S.
const BOARD = { ready: false, loading: false };
function loadBoard() {
  if (BOARD.ready || BOARD.loading || !window.jwsim?.sceneBoardSvg) return;
  BOARD.loading = true;
  window.jwsim
    .sceneBoardSvg()
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const svg = doc.documentElement;
      const [vx, vy, vw, vh] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
      const bornes = [...svg.querySelectorAll(".borne")].map((b) => {
        const u = b.querySelector("use");
        const sig = b.dataset.senal;
        return {
          id: /^Q0_/.test(sig) ? `${sig}.${b.dataset.pos}` : sig,
          block: b.dataset.bloque,
          x: Number(u.getAttribute("x")) - vx,
          y: Number(u.getAttribute("y")) - vy,
          entry: Number(b.dataset.entrada) - vy,
        };
      });
      const leds = [...svg.querySelectorAll(".led-ancla")].map((c) => ({ sig: c.dataset.senal, x: Number(c.getAttribute("cx")) - vx, y: Number(c.getAttribute("cy")) - vy }));
      const t = svg.querySelector("#tft");
      const tft = { x: Number(t.getAttribute("x")) - vx, y: Number(t.getAttribute("y")) - vy, w: Number(t.getAttribute("width")), h: Number(t.getAttribute("height")) };
      const img = new Image();
      img.onload = () => {
        const k = 1.5;
        const c = document.createElement("canvas");
        c.width = Math.round(vw * k);
        c.height = Math.round(vh * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        Object.assign(BOARD, { ready: true, canvas: c, vw, vh, bornes, leds, tft });
        // Si la vista ya está armada, se rearma con el PLC fiel.
        if (V.visible) {
          V.sig = null;
          window.Jwsim3D.show(true);
        }
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    })
    .catch(() => (BOARD.loading = false));
}
/** Recorte [y1, y2] (px del dibujo) de la textura del frente, en un plano. */
function boardSlice(S, y1, y2, z) {
  const tex = new THREE.CanvasTexture(BOARD.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(1, (y2 - y1) / BOARD.vh);
  tex.offset.set(0, 1 - y2 / BOARD.vh);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.vw * S, (y2 - y1) * S), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.6 }));
  pl.position.set(0, (BOARD.vh / 2 - (y1 + y2) / 2) * S, z);
  return pl;
}
let TFT_TEX = null;
function plcBasic() {
  if (!BOARD.ready) return plcPlaceholder();
  const g = new THREE.Group();
  const w = 0.28;
  const S = w / BOARD.vw;
  const h = BOARD.vh * S;
  const X = (px) => (px - BOARD.vw / 2) * S;
  const Y = (py) => (BOARD.vh / 2 - py) * S;
  const zU = 0.062; // frente del cuerpo alto (pantalla y teclas)
  const zL = 0.044; // frente de la base (relés y RS-485)
  // Cuerpo escalonado: base con los relés y cuerpo alto con la pantalla.
  const upper = box((1690 - 449) * S, (1398 - 517) * S, zU, PM.dark);
  upper.position.z = zU / 2;
  upper.position.x = X((449 + 1690) / 2 - 421);
  upper.position.y = Y((517 + 1398) / 2 - 403);
  const lower = box((1690 - 449) * S, (1771 - 1380) * S, zL, mat(0x262a2f));
  lower.position.set(X((449 + 1690) / 2 - 421), Y((1380 + 1771) / 2 - 403), zL / 2);
  g.add(upper, lower);
  // Borneras enchufables en relieve (una caja por bloque, detrás del dibujo).
  const blocks = new Map();
  for (const b of BOARD.bornes) {
    if (b.id === "USB") continue;
    const k = blocks.get(b.block) ?? { x1: Infinity, x2: -Infinity, y: b.y };
    k.x1 = Math.min(k.x1, b.x);
    k.x2 = Math.max(k.x2, b.x);
    blocks.set(b.block, k);
  }
  for (const k of blocks.values()) {
    const top = k.y < 990;
    const zf = top ? zU : zL;
    const tb = box((k.x2 - k.x1 + 58) * S, 112 * S, zf, PM.termGreen);
    tb.position.set(X((k.x1 + k.x2) / 2), Y(k.y), zf / 2);
    g.add(tb);
  }
  // Frente: el dibujo en dos planos, uno por escalón (con un borde que los separa).
  g.add(boardSlice(S, 0, 990, zU + 0.0015), boardSlice(S, 990, BOARD.vh, zL + 0.0015));
  // TFT en vivo: copia el canvas de la app.
  const appTft = document.getElementById("tft");
  if (appTft && !TFT_TEX) {
    TFT_TEX = new THREE.CanvasTexture(appTft);
    TFT_TEX.colorSpace = THREE.SRGBColorSpace;
  }
  let tftMesh = null;
  if (TFT_TEX) {
    const t = BOARD.tft;
    const tp = tftMesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w * S, t.h * S), new THREE.MeshBasicMaterial({ map: TFT_TEX }));
    tp.position.set(X(t.x + t.w / 2), Y(t.y + t.h / 2), zU + 0.0025);
    g.add(tp);
  }
  const leds = BOARD.leds.map((l) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(12 * S, 12), new THREE.MeshBasicMaterial({ color: 0x24272b }));
    m.position.set(X(l.x), Y(l.y), (l.y < 990 ? zU : zL) + 0.0025);
    g.add(m);
    return { sig: l.sig, mesh: m };
  });
  // Bornes: el cable entra por el borde de la bornera (arriba, o abajo en relés y RS-485).
  const terms = {};
  // (el cable del RS-485 baja por delante de la base, como en la placa real).
  for (const b of BOARD.bornes) terms[b.id] = [X(b.x), Y(b.entry < b.y ? b.y - 50 : b.y + 50), b.block === "med" ? zL + 0.012 : (b.y < 990 ? zU : zL) - 0.01, b.entry < b.y];
  return { group: g, w, h, up: h / 2, down: h / 2, terms, leds, tft: !!TFT_TEX, tftMesh, top: [], bottom: [] };
}

// ------------------------------------------------------------------ campo
// Equipos de campo que no son parte de una planta: motores, finales de
// carrera, sensores, sirena, válvulas, presostatos… Cada uno va sobre su
// soporte en la fila de campo, con su canalización desde el tablero, y se
// acciona con clic (como en el esquema) cuando la simulación corre.
const FIELD = {
  motor: new Set(["jwsim/motor", "jwsim/motor-1ph", "jwsim/motor-3ph"]),
  kinds: new Set(["jwsim/motor", "jwsim/motor-1ph", "jwsim/motor-3ph", "jwsim/limit-switch", "jwsim/sensor-inductive", "jwsim/sensor-photoelectric", "jwsim/sensor-capacitive", "jwsim/buzzer", "jwsim/water-valve", "jwsim/pressure-switch", "jwsim/float-switch", "jwsim/chlorine-rs485", "jwsim/pressure-rs485", "jwsim/thermostat", "jwsim/level-electrodes"]),
};
const FM = {
  post: mat(0x4b5563, { metalness: 0.4, roughness: 0.5 }),
  galv: mat(0xb8c0c8, { metalness: 0.6, roughness: 0.35 }),
  dark: mat(0x23272d, { roughness: 0.5 }),
  red: mat(0xd8282d, { roughness: 0.45 }),
  yellow: mat(0xf2cf1d, { roughness: 0.5 }),
  brass: mat(0xc9a14a, { metalness: 0.6, roughness: 0.35 }),
  grey: mat(0x9aa3ad, { roughness: 0.5 }),
  concrete: mat(0x8e959d, { roughness: 0.95 }),
};
/** Pedestal de concreto con un poste y una ménsula a la altura h. */
function fieldStand(h) {
  const g = new THREE.Group();
  const foot = box(0.26, 0.06, 0.26, FM.concrete);
  foot.position.y = 0.03;
  const post = box(0.05, h, 0.05, FM.post);
  post.position.y = h / 2 + 0.06;
  g.add(foot, post);
  return g;
}
/** LED de estado (esfera chica que se enciende). */
function statusLed(r = 0.014, hex = 0xffb020) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0x000000 }));
  m.userData.hex = hex;
  return m;
}
const setLed = (m, on) => {
  m.material.color.setHex(on ? m.userData.hex : 0x3a3a3a);
  m.material.emissive.setHex(on ? m.userData.hex : 0x000000);
};
/** Motor de campo sobre su base, con un volante pintado para ver el giro y el sentido. */
function fieldMotor(d) {
  const g = new THREE.Group();
  const three = d.type === "jwsim/motor-3ph" || (d.type === "jwsim/motor" && !/DC/i.test(String(d.params?.rating ?? "")));
  const bodyM = mat(three ? 0x2f6fb5 : 0x8b939c, { metalness: 0.35, roughness: 0.45 });
  const base = box(0.5, 0.08, 0.36, FM.concrete);
  base.position.y = 0.04;
  const bed = box(0.4, 0.04, 0.26, PUMP.base);
  bed.position.y = 0.1;
  g.add(base, bed);
  const ay = 0.27;
  const R = 0.11;
  const body = cyl(R, 0.26, bodyM, 28);
  body.rotation.z = Math.PI / 2;
  body.position.set(-0.03, ay, 0);
  g.add(body);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.5) continue;
    const fin = box(0.22, 0.022, 0.007, bodyM);
    fin.position.set(-0.03, ay + Math.sin(a) * (R + 0.008), Math.cos(a) * (R + 0.008));
    fin.rotation.x = -a;
    g.add(fin);
  }
  for (const x of [-0.08, 0.04]) {
    const foot = box(0.05, ay - R - 0.12, 0.22, bodyM);
    foot.position.set(x, (ay - R + 0.12) / 2, 0);
    g.add(foot);
  }
  const fan = cyl(R + 0.004, 0.08, FM.dark, 28);
  fan.rotation.z = Math.PI / 2;
  fan.position.set(-0.2, ay, 0);
  g.add(fan);
  const tb = box(0.1, 0.07, 0.1, mat(three ? 0x24578f : 0x6f7882));
  tb.position.set(-0.03, ay + R + 0.035, 0);
  const gland = cyl(0.014, 0.03, FM.dark, 10);
  gland.rotation.x = Math.PI / 2;
  gland.position.set(-0.03, ay + R + 0.035, -0.062);
  g.add(tb, gland);
  const np = plate(0.08, 0.04, three ? `${d.id} 3~` : `${d.id} 1~`, { bg: "#d9dde2", fg: "#1a1d21", font: "bold 40px sans-serif" });
  np.position.set(-0.03, ay, R + 0.03);
  g.add(np);
  // Eje con un volante a franjas (se ve girar y en qué sentido).
  const rotor = new THREE.Group();
  const shaft = cyl(0.015, 0.1, FM.galv, 10);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = -0.04;
  const disk = cyl(0.09, 0.03, mat(0xe8eaed), 24);
  disk.rotation.z = Math.PI / 2;
  const stripe = box(0.032, 0.17, 0.03, mat(0xf08a24));
  const dot = box(0.033, 0.03, 0.03, FM.dark);
  dot.position.y = 0.06;
  rotor.add(shaft, disk, stripe, dot);
  rotor.position.set(0.2, ay, 0);
  g.add(rotor);
  return {
    group: g,
    anchor: [-0.03, ay + R + 0.035, -0.08],
    update(o) {
      rotor.rotation.x -= valOf(o.speed) * 0.5;
    },
  };
}
/** Final de carrera de palanca con rodillo sobre su soporte; una leva lo acciona. */
function fieldLimit(d) {
  const g = fieldStand(0.55);
  const compact = d.params?.model === "compacto";
  const body = box(0.07, compact ? 0.08 : 0.12, 0.05, compact ? FM.dark : FM.galv);
  body.position.set(0, 0.5, 0.05);
  const head = cyl(0.025, 0.03, FM.dark, 16);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, compact ? 0.56 : 0.58, 0.06);
  const lever = new THREE.Group();
  const arm = box(0.012, 0.11, 0.012, FM.galv);
  arm.position.y = 0.055;
  const roller = cyl(0.02, 0.016, FM.dark, 16);
  roller.rotation.x = Math.PI / 2;
  roller.position.y = 0.11;
  lever.add(arm, roller);
  lever.position.set(0, compact ? 0.56 : 0.58, 0.085);
  const cam = box(0.16, 0.025, 0.06, FM.yellow);
  cam.position.set(0.12, 0.7, 0.085);
  const led = statusLed();
  led.position.set(0, 0.47, 0.078);
  g.add(body, head, lever, cam, led);
  return {
    group: g,
    anchor: [0, 0.44, 0.05],
    hit: [body, head, lever, cam],
    update(o) {
      const on = !!o.actuated;
      lever.rotation.z = on ? 0.5 : 0;
      cam.position.x = on ? 0.05 : 0.14;
      setLed(led, on);
    },
  };
}
/** Sensor de proximidad cilíndrico M18 (inductivo o capacitivo) mirando a su objetivo. */
function fieldProx(d) {
  const g = fieldStand(0.5);
  const cap = d.type === "jwsim/sensor-capacitive";
  const barrel = cyl(0.025, 0.12, cap ? mat(0x6f7882, { roughness: 0.4 }) : FM.brass, 18);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.05, 0.5, 0.05);
  const nuts = [0.02, 0.08].map((x) => {
    const n = cyl(0.033, 0.012, FM.galv, 6);
    n.rotation.z = Math.PI / 2;
    n.position.set(x, 0.5, 0.05);
    return n;
  });
  const face = cyl(0.023, 0.006, cap ? mat(0xf08a24) : mat(0x2f6fb5), 18);
  face.rotation.z = Math.PI / 2;
  face.position.set(0.113, 0.5, 0.05);
  const led = statusLed(0.01);
  led.position.set(-0.012, 0.5, 0.05);
  const target = box(0.04, 0.1, 0.1, cap ? mat(0x2f8cff, { transparent: true, opacity: 0.6 }) : FM.galv);
  target.position.set(0.3, 0.5, 0.05);
  g.add(barrel, ...nuts, face, led, target);
  return {
    group: g,
    anchor: [-0.03, 0.5, 0.05],
    hit: [barrel, face, target],
    update(o) {
      const on = !!o.detecting;
      setLed(led, on);
      target.position.x = on ? 0.15 : 0.3;
    },
  };
}
/** Fotocélula con reflector enfrente y el haz visible. */
function fieldPhoto() {
  const g = fieldStand(0.5);
  const body = box(0.05, 0.08, 0.04, mat(0x2b2f35));
  body.position.set(0.03, 0.5, 0.05);
  const lens = box(0.004, 0.05, 0.03, mat(0x161a1f, { metalness: 0.3 }));
  lens.position.set(0.057, 0.5, 0.05);
  const led = statusLed(0.008);
  led.position.set(0.03, 0.545, 0.05);
  const post2 = fieldStand(0.5);
  post2.position.x = 0.9;
  const refl = box(0.01, 0.06, 0.06, mat(0xd8282d, { roughness: 0.2 }));
  refl.position.set(0.875, 0.5, 0.05);
  const beam = cyl(0.004, 0.81, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55 }), 6);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0.465, 0.5, 0.05);
  const person = new THREE.Group();
  const torso = cyl(0.09, 0.5, mat(0x2f6fb5), 14);
  torso.position.y = 0.55;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), mat(COL.person));
  headM.position.y = 0.92;
  person.add(torso, headM);
  person.position.set(0.45, 0, 0.05);
  g.add(body, lens, led, post2, refl, beam, person);
  return {
    group: g,
    anchor: [-0.03, 0.5, 0.05],
    hit: [body, refl, torso],
    update(o) {
      const on = !!o.detecting;
      setLed(led, on);
      person.visible = on;
      beam.scale.y = on ? 0.5 : 1;
      beam.position.x = on ? 0.26 : 0.465;
    },
  };
}
/** Sirena de pared: caja, cono rojo y destello mientras suena. */
function fieldBuzzer() {
  const g = new THREE.Group();
  const wall = box(0.5, 0.9, 0.06, mat(0xd9dee4, { roughness: 0.9 }));
  wall.position.set(0, 0.75, -0.06);
  const bx = box(0.16, 0.16, 0.08, FM.red);
  bx.position.set(0, 0.85, 0.01);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.12, 20, 1, true), mat(0xb51e22, { side: THREE.DoubleSide }));
  horn.rotation.x = Math.PI / 2;
  horn.position.set(0, 0.85, 0.11);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a2a2a, emissive: 0x000000, transparent: true, opacity: 0.9 }));
  strobe.position.set(0, 0.94, 0.01);
  g.add(wall, bx, horn, strobe);
  let t = 0;
  return {
    group: g,
    anchor: [0, 0.77, 0.0],
    update(o) {
      const on = !!o.sounding;
      t += 0.2;
      const blink = on && Math.sin(t * 2) > 0;
      strobe.material.emissive.setHex(blink ? 0xff2a2a : 0x000000);
      horn.scale.setScalar(on ? 1 + 0.06 * Math.sin(t * 6) : 1);
    },
  };
}
/** Electroválvula de agua en un tramo de tubería (cuerpo de bronce y bobina). */
function fieldWaterValve() {
  const g = fieldStand(0.35);
  const pipe = cyl(0.03, 0.5, mat(0x2f6fb5, { metalness: 0.3 }), 14);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 0.45, 0.05);
  const bodyV = box(0.1, 0.07, 0.07, FM.brass);
  bodyV.position.set(0, 0.45, 0.05);
  const coil = cyl(0.03, 0.07, FM.dark, 16);
  coil.position.set(0, 0.52, 0.05);
  const led = statusLed(0.01, 0x39e46a);
  led.position.set(0.03, 0.54, 0.08);
  const flow = cyl(0.012, 0.18, new THREE.MeshBasicMaterial({ color: 0x55aef0, transparent: true, opacity: 0.8 }), 8);
  flow.position.set(0.25, 0.36, 0.05);
  g.add(pipe, bodyV, coil, led, flow);
  return {
    group: g,
    anchor: [0, 0.56, 0.0],
    update(o) {
      const open = !!o.open;
      setLed(led, open);
      flow.visible = open;
    },
  };
}
/** Presostato / termostato / instrumento genérico sobre un tramo de tubería. */
function fieldInstrument(d) {
  const g = fieldStand(0.4);
  const pipe = cyl(0.03, 0.4, mat(0x2f6fb5, { metalness: 0.3 }), 14);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 0.45, 0.05);
  const stem = cyl(0.01, 0.08, FM.galv, 8);
  stem.position.set(0, 0.52, 0.05);
  const head = box(0.1, 0.12, 0.07, d.type === "jwsim/pressure-switch" ? mat(0x2b2f35) : mat(0xe7ebef));
  head.position.set(0, 0.62, 0.05);
  const sc = screen(0.07, 0.03, { bg: "#0b1a10", fg: "#7dff9a", font: "bold 80px monospace" });
  sc.plane.position.set(0, 0.64, 0.0855);
  const led = statusLed(0.009);
  led.position.set(0.035, 0.585, 0.087);
  g.add(pipe, stem, head, sc.plane, led);
  const q = { "jwsim/pressure-switch": "presion", "jwsim/thermostat": "temperatura", "jwsim/chlorine-rs485": "cloro", "jwsim/pressure-rs485": "presion" }[d.type];
  return {
    group: g,
    anchor: [0, 0.62, 0.0],
    hit: [head],
    update(o) {
      const v = o[q];
      sc.paint(v == null ? "---" : typeof v === "number" ? v.toFixed(v < 10 ? 2 : 1) : String(v));
      setLed(led, !!(o.closed ?? o.powered));
    },
  };
}
/** Flotador colgado de su cable en una cámara (pozo) abierta. */
function fieldFloat() {
  const g = new THREE.Group();
  const sump = cyl(0.25, 0.5, mat(0x9aa0a6, { transparent: true, opacity: 0.35, depthWrite: false }), 24, true);
  sump.position.y = 0.25;
  const water = cyl(0.23, 0.3, mat(COL.water, { transparent: true, opacity: 0.7 }), 24);
  water.position.y = 0.15;
  const arm = box(0.4, 0.03, 0.03, FM.post);
  arm.position.set(0, 0.62, 0);
  const fl = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.08, 6, 12), mat(0xe7ebef));
  g.add(sump, water, arm, fl);
  return {
    group: g,
    anchor: [-0.2, 0.62, 0],
    hit: [fl, sump],
    update(o) {
      const up = !!o.up;
      fl.position.set(0.05, up ? 0.42 : 0.2, 0);
      fl.rotation.z = up ? 1.2 : 0.2;
      water.scale.y = up ? 2.2 : 1;
      water.position.y = up ? 0.33 : 0.15;
    },
  };
}
/** Electrobomba de campo (la de la sala de bombas) para un motor que mueve agua. */
function fieldPump(d) {
  const ep = electroPump(d.id, 0.36);
  const rotor = new THREE.Group();
  const hub = cyl(0.045, 0.06, PUMP.black, 16);
  hub.rotation.x = Math.PI / 2;
  const key = box(0.11, 0.018, 0.07, mat(0xffb020));
  rotor.add(hub, key);
  rotor.position.set(0, 0.36, -0.02);
  ep.group.add(rotor);
  return {
    group: ep.group,
    anchor: ep.gland,
    discharge: [0, ep.dischargeY, -0.16],
    update(o) {
      rotor.rotation.z += valOf(o.speed) * 0.6;
    },
  };
}
function buildField(d, role) {
  if (role === "pump") return fieldPump(d);
  const t = d.type;
  if (FIELD.motor.has(t)) return fieldMotor(d);
  if (t === "jwsim/limit-switch") return fieldLimit(d);
  if (t === "jwsim/sensor-inductive" || t === "jwsim/sensor-capacitive") return fieldProx(d);
  if (t === "jwsim/sensor-photoelectric") return fieldPhoto(d);
  if (t === "jwsim/buzzer") return fieldBuzzer(d);
  if (t === "jwsim/water-valve") return fieldWaterValve(d);
  if (t === "jwsim/float-switch") return fieldFloat(d);
  return fieldInstrument(d);
}
/** Semáforo de poste para los pilotos rojo/ámbar/verde del ejercicio. */
function buildTrafficLight(ids) {
  const g = new THREE.Group();
  const post = cyl(0.04, 1.4, FM.post, 12);
  post.position.y = 0.7;
  const housing = box(0.3, 0.84, 0.22, mat(0x1d2126));
  housing.position.set(0, 1.85, 0);
  g.add(post, housing);
  const lenses = ids.map(({ id, hex }, i) => {
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 20, 1, true, 0, Math.PI), FM.dark);
    visor.rotation.x = Math.PI / 2;
    visor.rotation.y = Math.PI;
    visor.position.set(0, 2.12 - i * 0.27 + 0.03, 0.16);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0x000000 }));
    lens.position.set(0, 2.12 - i * 0.27, 0.111);
    g.add(visor, lens);
    return { id, lens, hex };
  });
  return {
    group: g,
    anchor: [0, 0.3, -0.05],
    lenses,
    update() {
      for (const l of lenses) {
        const on = !!outOf(l.id).lit;
        l.lens.material.color.setHex(on ? l.hex : 0x2a2a2a);
        l.lens.material.emissive.setHex(on ? l.hex : 0x000000);
      }
    },
  };
}

/**
 * Junta en una sola malla por material las piezas fijas de un conjunto (el
 * tablero tiene cientos: tornillos, cables, borneras…). Menos llamadas de
 * dibujo y la vista sigue fluida en equipos modestos. `skip`: objetos que se
 * mueven, cambian de color o se pueden clicar (se dejan con todo su
 * subárbol); `keepMat`: materiales que cambian en vivo (no se mezclan con
 * otros aunque se vean iguales).
 */
function bakeStatic(root, skip = [], keepMat = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skipSet = new Set();
  for (const o of skip) o?.traverse?.((q) => skipSet.add(q));
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || skipSet.has(o) || Array.isArray(o.material) || !o.visible) return;
    const g = o.geometry;
    if (!g.index || !g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
    const m = o.material;
    const key = m.map || keepMat.has(m) ? m.uuid : [m.type, m.color?.getHex(), m.emissive?.getHex(), m.roughness, m.metalness, m.transparent, m.opacity, m.side, m.depthWrite, m.alphaTest].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  const mtx = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    let nv = 0;
    let ni = 0;
    for (const o of list) {
      nv += o.geometry.attributes.position.count;
      ni += o.geometry.index.count;
    }
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v0 = 0;
    let i0 = 0;
    const nm = new THREE.Matrix3();
    const p = new THREE.Vector3();
    for (const o of list) {
      const g = o.geometry;
      mtx.multiplyMatrices(inv, o.matrixWorld);
      nm.getNormalMatrix(mtx);
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i).applyMatrix4(mtx);
        pos.set([p.x, p.y, p.z], (v0 + i) * 3);
        p.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor.set([p.x, p.y, p.z], (v0 + i) * 3);
        uv.set([U.getX(i), U.getY(i)], (v0 + i) * 2);
      }
      const I = g.index;
      for (let i = 0; i < I.count; i++) idx[i0 + i] = I.getX(i) + v0;
      v0 += P.count;
      i0 += I.count;
      o.parent.remove(o);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    root.add(new THREE.Mesh(geo, list[0].material));
  }
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
  const lift = devs.some((d) => d.type === "jwsim/lift");
  const door = of("lamp", "pushbutton-lit", "selector-2", "selector-3", "selector-key", "pushbutton-no", "pushbutton-nc", "emergency-stop").filter((d) => !(lift && callFloor(d) != null));
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
      plcs.push({ id: d.id, paint: m.screen?.paint, leds: m.leds ?? [], tft: m.tft, tftMesh: m.tftMesh });
      return m;
    }
    if (t === "vfd-el") {
      const m = vfdModel();
      vfds.push({ id: d.id, paint: m.screen.paint, led: m.led, plane: m.screen.plane });
      return m;
    }
    if (t === "contactor") return dinContactor(mounted.has(d.id));
    return dinRelay();
  };
  const withId = (d) => Object.assign(make(d), { id: d.id });
  const row1 = [...of("power-230vac", "power-3ph", "breaker", "motor-protector"), ...of("power-24vdc"), ...of("jwplc-basic")].map(withId);
  const row2 = [...of("vfd-el"), ...of("contactor"), ...of("relay", "timer-relay", "ssr", "level-relay")].map(withId);
  const gap = 0.025;
  const rowW = (r) => r.reduce((a, m) => a + m.w + gap, -gap);
  const W = Math.max(0.6, Math.min(1.7, Math.max(rowW(row1), rowW(row2)) + 0.24));
  const H = 1.25;
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
  const duct = (y, w, x = 0) => {
    const d = box(w, 0.06, 0.06, new THREE.MeshStandardMaterial({ map: slots, roughness: 0.7 }));
    d.material.map = slots.clone();
    d.material.map.repeat.set(w * 8, 1);
    d.material.map.needsUpdate = true;
    d.position.set(x, y, zf + 0.03);
    const lid = box(w, 0.064, 0.006, mat(0xb9bfc6));
    lid.position.set(x, y, zf + 0.063);
    g.add(d, lid);
  };
  const yTop = y0 + H - 0.08;
  const yR1 = y0 + H - 0.3;
  const yMid = y0 + H - 0.52;
  const yR2 = y0 + H - 0.75;
  const yLow = y0 + 0.26;
  const yTb = y0 + 0.13;
  // Canaletas horizontales y una vertical a la izquierda (la que recibe el mazo de la puerta).
  const hx1 = -W / 2 + 0.085;
  const hx2 = W / 2 - 0.05;
  for (const y of [yTop, yMid, yLow]) duct(y, hx2 - hx1, (hx1 + hx2) / 2);
  const vdX = -W / 2 + 0.058;
  const vd = box(0.045, yTop - yLow + 0.06, 0.06, mat(0xa7adb4, { roughness: 0.7 }));
  vd.position.set(vdX, (yTop + yLow) / 2, zf + 0.03);
  const vdl = box(0.049, yTop - yLow + 0.06, 0.006, mat(0xb9bfc6));
  vdl.position.set(vdX, (yTop + yLow) / 2, zf + 0.063);
  g.add(vd, vdl);
  // Equipos sobre los rieles; se anota dónde quedó cada uno para cablear.
  const at = new Map();
  const place = (row, y, upY, downY) => {
    let x = -rowW(row) / 2 + 0.035;
    for (const m of row) {
      const cx = x + m.w / 2;
      m.group.position.set(cx, y, zf);
      g.add(m.group);
      at.set(m.id, { m, cx, y, upY, downY });
      x += m.w + gap;
    }
    const rail = box(hx2 - hx1, 0.035, 0.008, mat(0xb8c0c8, { metalness: 0.7, roughness: 0.3 }));
    rail.position.set((hx1 + hx2) / 2, y, zf + 0.004);
    g.add(rail);
  };
  place(row1, yR1, yTop, yMid);
  place(row2, yR2, yMid, yLow);
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
  const doorAt = new Map();
  const hits = [];
  const controls = [];
  door.forEach((d, i) => {
    const cols = Math.max(1, Math.min(4, door.length));
    const cx = ((i % cols) + 0.5) * (W / cols);
    const cy = H * 0.72 - Math.floor(i / cols) * 0.22;
    doorAt.set(d.id, { cx, cy });
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
      if (t === "pushbutton-lit") {
        hits.push({ mesh: lens, id: d.id });
        controls.push({ id: d.id, action: "press", kind: "push", mesh: lens, z0: 0.03 });
      }
    } else if (t === "emergency-stop") {
      const yb = box(0.09, 0.09, 0.004, mat(0xf2cf1d));
      yb.position.set(cx, cy, 0.013);
      const mush = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PM.red);
      mush.rotation.x = Math.PI / 2;
      mush.position.set(cx, cy, 0.035);
      hinge.add(yb, mush);
      hits.push({ mesh: mush, id: d.id });
      controls.push({ id: d.id, action: "press", kind: "push", mesh: mush, z0: 0.035 });
    } else if (t.startsWith("selector")) {
      const knob = cyl(0.026, 0.02, PM.black, 20);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(cx, cy, 0.035);
      const bar = box(0.012, 0.045, 0.02, PM.black);
      bar.position.set(cx, cy, 0.05);
      bar.rotation.z = -0.6;
      hinge.add(knob, bar);
      hits.push({ mesh: knob, id: d.id }, { mesh: bar, id: d.id });
      controls.push({ id: d.id, action: "position", kind: "rot", mesh: bar });
    } else {
      const bc = { verde: 0x2fae4f, rojo: 0xd8282d, amarillo: 0xf2cf1d, azul: 0x2f8be0, blanco: 0xf0f2f4, negro: 0x23272d }[d.params?.color];
      const btn = cyl(0.024, 0.02, bc != null ? mat(bc, { roughness: 0.5 }) : t === "pushbutton-nc" ? PM.red : PM.green, 16);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(cx, cy, 0.035);
      hinge.add(btn);
      hits.push({ mesh: btn, id: d.id });
      controls.push({ id: d.id, action: "press", kind: "push", mesh: btn, z0: 0.035 });
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
  wirePanel();
  /**
   * Cableado real: cada cable del esquema se tiende de borne a borne. Dentro
   * del tablero sale del borne a la canaleta más cercana (por dentro de las
   * canaletas no se ve); lo que va al campo pasa por una bornera de salida
   * al pie; los mandos de la puerta llegan por un mazo con espiral por la
   * bisagra hasta la canaleta vertical.
   */
  function wirePanel() {
    const API = window.JwsimScene;
    const devOfId = new Map(devs.map((d) => [d.id, d]));
    const split = (end) => [end.slice(0, end.indexOf(".")), end.slice(end.indexOf(".") + 1)];
    const used = new Map(); // borne -> cables que ya llegan (para separarlos)
    const nth = (key) => {
      const n = used.get(key) ?? 0;
      used.set(key, n + 1);
      return n;
    };
    const wireM = new Map();
    const wm = (hex) => {
      if (!wireM.has(hex)) wireM.set(hex, mat(hex, { roughness: 0.5 }));
      return wireM.get(hex);
    };
    const R = 0.0032;
    const zIn = zf + 0.045; // los cables entran a la canaleta por su ranura
    // Borne de un equipo del riel: punto, y canaleta hacia la que sale.
    const railEnd = (end) => {
      const [id, tid] = split(end);
      const dev = devOfId.get(id);
      let a = at.get(id);
      const guest = !a && dev?.mount ? at.get(dev.mount) : null;
      if (guest) a = guest;
      if (!a) return null;
      const m = a.m;
      if (m.terms?.[tid]) {
        const [lx, ly, lz, up] = m.terms[tid];
        return { x: a.cx + lx, y: a.y + ly, z: zf + lz, toY: up ? a.upY - 0.03 : a.downY + 0.03 };
      }
      const t = API?.terminalOf?.(end);
      if (!t) return null;
      const x = a.cx - m.w / 2 + t.fx * m.w;
      // Térmico acoplado: sus bornes de entrada van por dentro del contactor.
      if (guest && t.side === "t") return { hidden: true };
      const up = guest ? false : t.side === "t";
      return { x, y: up ? a.y + (m.up ?? m.h / 2) : a.y - (m.down ?? m.h / 2), z: zf + 0.075, toY: up ? a.upY - 0.03 : a.downY + 0.03 };
    };
    const stub = (p, hex) => {
      const k = nth(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
      const x = p.x + k * 0.005;
      g.add(run([[x, p.y, p.z], [x, p.y + Math.sign(p.toY - p.y) * 0.012, p.z], [x, p.toY, zIn]], R, wm(hex)));
    };
    // Bornera de salida: una borna por cada borne de campo.
    const tbs = [];
    const tbOf = new Map();
    const tbIdx = (end) => {
      if (!tbOf.has(end)) {
        tbOf.set(end, tbs.length);
        tbs.push({ end, hexes: [] });
      }
      return tbOf.get(end);
    };
    // Mandos de la puerta: el cable sale del bloque de contactos y baja por
    // el borde de la bisagra hasta el mazo.
    const loomY = H * 0.42;
    let doorWires = 0;
    const doorEnd = (end, hex) => {
      const [id, tid] = split(end);
      const p = doorAt.get(id);
      const t = API?.terminalOf?.(end);
      const fx = t ? t.fx : 0.5;
      const up = t ? t.side === "t" : true;
      const x = p.cx - 0.022 + fx * 0.044;
      const y = p.cy + (up ? 0.026 : -0.026);
      const k = doorWires++;
      const y2 = y + (up ? 1 : -1) * (k % 4) * 0.004;
      const xe = 0.03 + (k % 6) * 0.004;
      const zb = -0.06 - (k % 3) * 0.003;
      hinge.add(run([[x, y, -0.05], [x, y2, zb], [xe, y2, zb], [xe, loomY, zb]], R * 0.85, wm(hex)));
      return id;
    };
    for (const w of spec.wiring ?? []) {
      if (!w?.from || !w?.to) continue;
      const hex = new THREE.Color(API?.wireHex?.(w) ?? "#2a2e35").getHex();
      const ends = [w.from, w.to];
      const kind = ends.map((e) => {
        const id = split(e)[0];
        if (at.has(id) || at.has(devOfId.get(id)?.mount)) return "rail";
        if (doorAt.has(id)) return "door";
        return "field";
      });
      if (kind[0] === "field" && kind[1] === "field") continue;
      ends.forEach((e, i) => {
        if (kind[i] === "rail") {
          const p = railEnd(e);
          if (p && !p.hidden) stub(p, hex);
        } else if (kind[i] === "door") doorEnd(e, hex);
        else tbs[tbIdx(e)].hexes.push(hex);
      });
    }
    // Bornera de salida al pie: del lado de adentro sube a la canaleta, del
    // lado del campo baja al prensaestopa.
    const pitch = 0.0125;
    tbs.forEach((tb, i) => {
      const x = hx1 + 0.02 + i * pitch;
      const pe = /\.(PE|GND|SH|SHIELD)$/.test(tb.end);
      const b = box(pitch * 0.9, 0.07, 0.06, mat(pe ? 0x3fae49 : 0x9aa3ad));
      b.position.set(x, yTb, zf + 0.03);
      g.add(b);
      if (pe) {
        const st = box(pitch * 0.92, 0.015, 0.0605, mat(0xf2cf1d));
        st.position.copy(b.position);
        g.add(st);
      }
      const hex = tb.hexes[0];
      g.add(run([[x, yTb + 0.035, zf + 0.05], [x, yLow - 0.03, zIn]], R, wm(hex)));
      g.add(run([[x, yTb - 0.035, zf + 0.05], [x, y0 + 0.012, zf + 0.05]], R * 1.3, wm(hex)));
    });
    const endStop = box(0.006, 0.08, 0.065, mat(0x2b2f35));
    endStop.position.set(hx1 + 0.02 - pitch, yTb, zf + 0.032);
    const endStop2 = endStop.clone();
    endStop2.position.x = hx1 + 0.02 + tbs.length * pitch;
    const tbRail = box(Math.max(0.05, tbs.length * pitch + 0.04), 0.035, 0.008, mat(0xb8c0c8, { metalness: 0.7, roughness: 0.3 }));
    tbRail.position.set(hx1 + 0.02 + (tbs.length * pitch) / 2 - pitch / 2, yTb, zf + 0.004);
    g.add(endStop, endStop2, tbRail);
    // Mazo de la puerta: manguera en espiral desde el borde de la bisagra
    // hasta la canaleta vertical.
    if (doorWires) {
      hinge.updateMatrix();
      const a = new THREE.Vector3(0.04, loomY, -0.065).applyMatrix4(hinge.matrix);
      const pts = [[a.x, a.y, a.z], [-W / 2 + 0.03, y0 + loomY, D / 2 - 0.04], [-W / 2 + 0.035, y0 + loomY, zf + 0.12], [vdX, y0 + loomY, zf + 0.07]];
      const spiral = (() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 16;
        const x = c.getContext("2d");
        x.fillStyle = "#2b2f35";
        x.fillRect(0, 0, 64, 16);
        x.strokeStyle = "#596069";
        x.lineWidth = 3;
        for (let i = -16; i < 80; i += 8) {
          x.beginPath();
          x.moveTo(i, 0);
          x.lineTo(i + 16, 16);
          x.stroke();
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 20);
        return t;
      })();
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.3);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.011, 8), new THREE.MeshStandardMaterial({ map: spiral, roughness: 0.6 })));
    }
  }
  const glandX = (k, n) => -W / 2 + 0.12 + (k * (W - 0.24)) / Math.max(1, n - 1);
  bakeStatic(g, [...lamps.map((l) => l.lens), ...hits.map((h) => h.mesh), ...controls.map((c) => c.mesh), ...vfds.flatMap((v) => [v.led, v.plane]), ...plcs.flatMap((p) => [...p.leds.map((l) => l.mesh), p.tftMesh])]);
  return { group: g, W, D, H, legH, vfds, plcs, lamps, hits, controls, glandX, bottom: y0 };
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
  bakeStatic(g, [panel.group, tank?.group, gg, ...pumps.map((pm) => pm.rotor)], new Set([winM, pipeM]));
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
  // Motor con aletas y su volante (el mismo del campo), acoplado al tambor.
  const fm = fieldMotor({ id: String(p.motor ?? "M").split(".")[0], type: "jwsim/motor-3ph" });
  const mot = fm.group;
  mot.scale.setScalar(0.75);
  mot.position.set(0.12, tall + 0.03 - 0.06, 0);
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
  // Botonera de llamada en cada piso, junto a la puerta: un pulsador por
  // piso que se acciona con clic (el que nombra ese piso en su rótulo).
  const station = (i, id) => {
    const st = new THREE.Group();
    const plateB = box(0.02, 0.2, 0.12, mat(0xc9cfd6, { metalness: 0.5, roughness: 0.3 }));
    const btn = cyl(0.03, 0.025, mat(0x2f8be0, { roughness: 0.4 }), 18);
    btn.rotation.z = Math.PI / 2;
    btn.position.x = 0.015;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 20), mat(0xb8c0c8, { metalness: 0.7 }));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = 0.012;
    const t = label(id);
    t.scale.set(0.36, 0.09, 1);
    t.position.set(0.05, 0.17, 0);
    st.add(plateB, btn, ring, t);
    st.position.set(1.22, i * H + 0.55, 0.6);
    g.add(st);
    return { btn };
  };
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
  return { group: g, cab, rope, drum, doors, extra, tall, station, n, motorRotor: fm, height: tall + 0.6, size: [2.7, 1.4] };
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
      if (m.cone) m.water.scale.x = m.water.scale.z = 0.23 + 0.77 * lvl;
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
      const sp = valOf(outOf(String(o.motor ?? "")).speed);
      m.drum.rotation.x += sp * 0.3;
      m.motorRotor?.update({ speed: sp });
      for (const c of m.calls ?? []) c.btn.position.x = window.JwsimScene?.actionState?.(c.id, "press") ? 0.004 : 0.015;
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
  for (const f of V.field ?? []) f.m.update(outOf(f.id));
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
    for (const c of V.panel.controls ?? []) {
      const on = !!window.JwsimScene?.actionState?.(c.id, c.action);
      if (c.kind === "push") c.mesh.position.z = c.z0 - (on ? 0.012 : 0);
      else c.mesh.rotation.z = on ? -0.6 : 0.6;
    }
    for (const pl of V.panel.plcs) {
      pl.paint?.(running ? "RUN" : "STOP");
      const st = V.snap?.devices.find((d) => d.id === pl.id);
      for (const l of pl.leds) {
        const on = l.sig.startsWith("Q") ? !!st?.contacts?.[l.sig] : !!st?.outputs?.[l.sig];
        l.mesh.material.color.setHex(on ? (l.sig.startsWith("Q") ? 0xff9a2e : 0x39e46a) : 0x24272b);
      }
      if (pl.tft && TFT_TEX && running) TFT_TEX.needsUpdate = true;
    }
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
  /** Para pruebas: punto de pantalla (px del cliente) de un mando o equipo clicable. */
  screenOf(id) {
    const h = V.hits?.find((q) => q.id === id);
    if (!h) return null;
    const v = new THREE.Vector3();
    h.mesh.getWorldPosition(v);
    v.project(V.camera);
    const r = V.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  },
  /** Para pruebas: llamadas de dibujo y triángulos del último cuadro. */
  stats: () => ({ calls: V.renderer?.info.render.calls, tris: V.renderer?.info.render.triangles, meshes: (() => { let n = 0; V.root?.traverse((o) => o.isMesh && n++); return n; })() }),
  /** Para pruebas: equipos de campo dibujados en 3D. */
  fieldIds: () => (V.field ?? []).map((f) => f.id),
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
