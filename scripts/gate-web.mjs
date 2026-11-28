#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_WEB: panel web JWPLC_Web (alpha.19, reemplaza a JWPLC_WebScreen) a
// través del W5500 simulado y app/lib/net-bridge.mjs (puerto 80 → 127.0.0.1:1080).
//
// Parte A, ejemplo 02.Bombeo_Presion_Constante (variables, alarmas, tendencia):
//   pagina      "/" entrega el panel comprimido (gzip) con cabeceras de seguridad
//   cerrado     sin sesión la API responde 401; un POST sin X-JW responde 403
//   reclamar    el código de 6 dígitos de la consola crea el admin; un código
//               malo se rechaza y un segundo reclamo responde 409
//   usuarios    el admin crea un operador; el operador entra con el reto
//               (PBKDF2 + HMAC, la clave no viaja) y una clave mala se rechaza
//   escribir    el operador cambia la consigna dentro del rango; fuera de rango
//               o una variable de rol técnico se rechazan
//   alarmas     con consumo alto la presión cae, «baja» se activa y el operador
//               la reconoce (eventos activa + reconocida)
//   tendencia   la presión entra en la tendencia (JSON y CSV)
//   auditoria   el admin ve en Equipo quién cambió qué
// Parte B, ejemplo 04.Runtime_En_Vivo (Runtime de panel, IP fija):
//   teclas      OK, ▼ y ► desde la página ("/k") llevan el MENU a RED
//   cuadro      la pantalla que arma un cliente igual al de la página con "/f"
//               es idéntica, píxel a píxel, a la TFT simulada
//   trafico     con la pantalla quieta cada pedido pesa menos de 1 KB
import { pbkdf2Sync, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NetBridge } from "../app/lib/net-bridge.mjs";
import { RunnerProcess } from "../app/lib/sim-port.mjs";
import { buildSketch } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { printCriteria, targetArg, WINE, writeReport } from "./lib/gate-util.mjs";
import { readScreenDump } from "./lib/png.mjs";

const target = targetArg();
const { root, lock } = resolvePackageRoot();
const examples = join(root, lock.JWPLC_PACKAGE_TREE, "libraries", "JWPLC_Web", "examples");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "http://127.0.0.1:1080";
const criteria = {};

// ------------------------------------------------------------ cliente HTTP

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async req(path, body, { csrf = true } = {}) {
      const headers = {};
      if (cookie) headers.Cookie = `jw=${cookie}`;
      const o = { headers };
      if (body) {
        o.method = "POST";
        if (csrf) headers["X-JW"] = "1";
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        o.body = new URLSearchParams(body).toString();
      }
      const r = await fetch(URL + path, o);
      const set = r.headers.get("set-cookie");
      if (set) {
        const m = /jw=([^;]*)/.exec(set);
        if (m) cookie = m[1];
      }
      const buf = Buffer.from(await r.arrayBuffer());
      let json = null;
      try {
        json = JSON.parse(buf.toString("utf8"));
      } catch {}
      return { status: r.status, headers: r.headers, buf, json };
    },
  };
}

function credentials(pass) {
  const s = randomBytes(16);
  return { s: s.toString("hex"), k: pbkdf2Sync(Buffer.from(pass, "utf8"), s, 2000, 32, "sha256").toString("hex") };
}

async function login(c, user, pass) {
  const ch = await c.req(`/api/reto?u=${encodeURIComponent(user)}`);
  const key = pbkdf2Sync(Buffer.from(pass, "utf8"), Buffer.from(ch.json.sal, "hex"), ch.json.iter, 32, "sha256");
  const proof = createHmac("sha256", key).update(Buffer.from(ch.json.reto, "hex")).digest("hex");
  return c.req("/api/entrar", { u: user, r: ch.json.reto, p: proof });
}

function start(exe, args) {
  const wine = exe.endsWith(".exe") && process.platform !== "win32";
  const bridge = new NetBridge({ listenPort: (p) => p + 1000 });
  const proc = new RunnerProcess();
  let consoleText = "";
  proc.on("message", (m) => {
    if (m.type === "serial" && m.port === 0) consoleText += m.text;
  });
  proc.start(exe, ["--eth", ...args], { env: { WINEDEBUG: "-all" }, launcher: wine ? WINE : undefined });
  bridge.attach(proc);
  proc.send({ type: "run", speed: 1 });
  return {
    bridge,
    proc,
    get console() {
      return consoleText;
    },
    async stop() {
      proc.send({ type: "quit" });
      await sleep(800);
      proc.stop();
      bridge.close();
    },
  };
}

async function waitPage(t0, limit = 30000) {
  while (Date.now() - t0 < limit) {
    try {
      const r = await fetch(`${URL}/`);
      if (r.ok) return { r, text: await r.text() };
    } catch {}
    await sleep(200);
  }
  return null;
}

async function waitFor(fn, ms) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return null;
}

// ------------------------------------------------------------ parte A

{
  const { exe } = await buildSketch(join(examples, "02.Bombeo_Presion_Constante"), { target, log: () => {} });
  const sim = start(exe, ["--rtc", "fijo:2026-11-28T09:00:00"]);
  const t0 = Date.now();
  try {
    const page = await waitPage(t0);
    const h = page?.r.headers;
    criteria.pagina = {
      pass: !!page && page.text.includes("JWPLC") && h.get("content-encoding") === "gzip" && /default-src 'self'/.test(h.get("content-security-policy") || "") && h.get("x-frame-options") !== null,
      bytes: page?.text.length ?? 0,
      listo_ms: Date.now() - t0,
    };

    const admin = client();
    const st = await admin.req("/api/estado");
    const sinSesion = await admin.req("/api/defs");
    const sinCsrf = await admin.req("/api/reclamar", { c: "000000", u: "jefe" }, { csrf: false });
    criteria.cerrado = { pass: st.json?.reclamado === false && sinSesion.status === 401 && sinCsrf.status === 403, estado: st.json, defs: sinSesion.status, sin_xjw: sinCsrf.status };

    const code = await waitFor(() => /codigo (\d{6})/.exec(sim.console)?.[1], 5000);
    const malo = code === "000000" ? "111111" : "000000";
    const crA = credentials("clave-del-jefe-123");
    const rMalo = await admin.req("/api/reclamar", { c: malo, u: "jefe", ...crA });
    const rBueno = await admin.req("/api/reclamar", { c: code, u: "jefe", ...crA });
    const rOtro = await client().req("/api/reclamar", { c: code, u: "intruso", ...credentials("otra-clave-123") });
    const defs = await admin.req("/api/defs");
    criteria.reclamar = {
      pass: !!code && rMalo.status === 403 && rBueno.status === 200 && !!admin.cookie && rOtro.status === 409 && defs.json?.vars?.length === 6 && defs.json?.alarmas?.length === 2 && defs.json?.rol === "admin",
      codigo: code,
      malo: rMalo.status,
      bueno: rBueno.status,
      segundo: rOtro.status,
      variables: defs.json?.vars?.length,
    };

    const crO = credentials("clave-operador-1");
    const creado = await admin.req("/api/usuarios/crear", { u: "operador1", rol: "operador", ...crO });
    const op = client();
    const lMalo = await login(op, "operador1", "clave-equivocada");
    const lBueno = await login(op, "operador1", "clave-operador-1");
    const verUsuarios = await op.req("/api/usuarios");
    criteria.usuarios = { pass: creado.status === 200 && lMalo.status === 403 && lBueno.status === 200 && lBueno.json?.rol === "operador" && verUsuarios.status === 403, crear: creado.status, clave_mala: lMalo.status, entrar: lBueno.status, operador_ve_usuarios: verUsuarios.status };

    const wOk = await op.req("/api/escribir", { id: "consigna", v: "4.2" });
    const wFuera = await op.req("/api/escribir", { id: "consigna", v: "9" });
    const wRol = await op.req("/api/escribir", { id: "consumo", v: "1" });
    await sleep(300);
    const vivo = await op.req("/api/vivo");
    criteria.escribir = { pass: wOk.status === 200 && wFuera.status === 400 && wRol.status === 403 && Math.abs((vivo.json?.v?.consigna ?? 0) - 4.2) < 0.01, ok: wOk.status, fuera_rango: wFuera.status, rol_tecnico: wRol.status, consigna: vivo.json?.v?.consigna };

    // El admin sube el consumo al máximo: la presión cae bajo 1 bar.
    const wAdmin = await admin.req("/api/escribir", { id: "consumo", v: "1" });
    const activa = await waitFor(async () => {
      const v = await op.req("/api/vivo");
      return v.json?.a?.baja?.activa ? v.json : null;
    }, 20000);
    const ack = await op.req("/api/reconocer", { id: "baja" });
    const tras = await op.req("/api/vivo");
    const ev = await op.req("/api/eventos");
    const tipos = (ev.json?.eventos || []).filter((e) => e.alarma === "baja").map((e) => e.tipo);
    criteria.alarmas = {
      pass: wAdmin.status === 200 && !!activa && ack.status === 200 && tras.json?.a?.baja?.reconocida === true && tras.json?.a?.baja?.por === "operador1" && tipos.includes("activa") && tipos.includes("reconocida"),
      presion: activa?.v?.presion,
      reconocer: ack.status,
      eventos: tipos,
    };

    await waitFor(async () => ((await op.req("/api/tendencia")).json?.series?.presion?.length ?? 0) >= 2, 15000);
    const tr = await op.req("/api/tendencia");
    const csv = await op.req("/api/tendencia.csv");
    const lineas = csv.buf.toString("utf8").trim().split(/\r?\n/);
    criteria.tendencia = { pass: (tr.json?.series?.presion?.length ?? 0) >= 2 && tr.json?.paso === 5 && lineas[0] === "segundos_atras;presion" && lineas.length >= 3, puntos: tr.json?.series?.presion?.length, cabecera_csv: lineas[0] };

    const eqOp = await op.req("/api/equipo");
    const eqAdmin = await admin.req("/api/equipo");
    const aud = (eqAdmin.json?.auditoria || []).map((a) => `${a.por}: ${a.texto}`);
    criteria.auditoria = {
      pass: eqOp.json && !("auditoria" in eqOp.json) && aud.some((t) => /^operador1: consigna: .* -> 4\.2/.test(t)) && aud.some((t) => /^jefe: reclamó/.test(t)) && aud.some((t) => /ingreso fallido/.test(t)),
      ultimas: aud.slice(0, 6),
    };
  } catch (e) {
    criteria.error_a = { pass: false, error: e.stack || e.message };
  }
  await sim.stop();
}

// ------------------------------------------------------------ parte B

{
  const SHOT_MS = 16000;
  const fb = join(tmpdir(), `jwsim-web-${process.pid}.fb`);
  const { exe } = await buildSketch(join(examples, "04.Runtime_En_Vivo"), { target, log: () => {} });
  const sim = start(exe, ["--screen-at", `${SHOT_MS}:${fb}`, "--rtc", "fijo:2026-11-03T09:00:00"]);
  const t0 = Date.now();
  const c = client();
  const view = { W: 0, H: 0, pal: [], idx: null, ver: 0, reqs: 0, bytes: [] };
  async function poll() {
    const r = await c.req(`/f?v=${view.ver}&p=${view.pal.length}`);
    const b = r.buf;
    view.reqs++;
    view.bytes.push(b.length);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const magic = b.toString("latin1", 0, 4);
    if (magic !== "JWS2") throw new Error(`cuadro con cabecera desconocida: ${magic} (HTTP ${r.status})`);
    let o = 4;
    const nv = dv.getUint32(o, true);
    const w = dv.getUint16(o + 4, true);
    const h = dv.getUint16(o + 6, true);
    o += 8;
    if (w !== view.W || h !== view.H) {
      Object.assign(view, { W: w, H: h, idx: new Uint8Array(w * h), ver: 0 });
      return;
    }
    const from = dv.getUint16(o, true);
    const n = dv.getUint16(o + 2, true);
    o += 4;
    for (let i = 0; i < n; i++, o += 2) view.pal[from + i] = dv.getUint16(o, true);
    for (;;) {
      const y = dv.getUint16(o, true);
      o += 2;
      if (y === 0xffff) break;
      let x = dv.getUint16(o, true);
      const end = x + dv.getUint16(o + 2, true);
      o += 4;
      while (x < end) {
        const len = dv.getUint8(o) + 1;
        view.idx.fill(dv.getUint8(o + 1), y * w + x, y * w + x + len);
        x += len;
        o += 2;
      }
    }
    view.ver = nv;
  }
  async function key(b) {
    await c.req(`/k?b=${b}&d=1`);
    await sleep(150);
    await c.req(`/k?b=${b}&d=0`);
  }
  try {
    await waitPage(t0);
    const sinSesion = await c.req("/f?v=0&p=0");
    const code = await waitFor(() => /codigo (\d{6})/.exec(sim.console)?.[1], 5000);
    await c.req("/api/reclamar", { c: code, u: "jefe", ...credentials("clave-del-jefe-123") });
    criteria.pantalla_cerrada = { pass: sinSesion.status === 401 && !!c.cookie, sin_sesion: sinSesion.status };
    // Desde la página: OK abre el MENU (PROGRAMA), ▼ baja a CONFIG. y ► pasa a RED.
    const keys = [{ t: 11000, b: 4 }, { t: 12500, b: 5 }, { t: 13500, b: 2 }];
    let quietFrom = 0;
    while (Date.now() - t0 < SHOT_MS + 500) {
      const el = Date.now() - t0;
      for (const k of keys)
        if (!k.done && el >= k.t) {
          k.done = true;
          await key(k.b);
        }
      if (!quietFrom && el >= 14500) quietFrom = view.bytes.length;
      await poll();
      await sleep(60);
    }
    const quiet = view.bytes.slice(quietFrom);
    criteria.trafico = { pass: quiet.length > 3 && Math.max(...quiet) < 1024, pedidos: view.reqs, maximo_quieto: Math.max(...quiet), colores: view.pal.length };
  } catch (e) {
    criteria.error_b = { pass: false, error: e.stack || e.message };
  }
  await sim.stop();
  try {
    const s = readScreenDump(readFileSync(fb));
    let diff = 0;
    for (let i = 0; i < s.width * s.height; i++) {
      const v = view.pal[view.idx[i]] ?? 0;
      const r = (v >> 11) & 31,
        g = (v >> 5) & 63,
        b = v & 31;
      const px = [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
      if (px.some((ch, k) => Math.abs(ch - s.rgb[i * 3 + k]) > 8)) diff++;
    }
    criteria.cuadro = { pass: s.width === view.W && s.height === view.H && diff === 0, ancho: view.W, alto: view.H, pixeles_distintos: diff };
    const at = (x, y) => [s.rgb[(y * s.width + x) * 3], s.rgb[(y * s.width + x) * 3 + 1], s.rgb[(y * s.width + x) * 3 + 2]];
    const red = at(160, 120);
    criteria.teclas = { pass: red[1] > 40 && red[0] < 40, color_baldosa_red: red };
  } catch (e) {
    criteria.cuadro = { pass: false, error: e.message };
  }
}

const pass = printCriteria("JWSIM_WEB", criteria, ` (${target})`);
writeReport(`JWSIM_WEB-${target}`, { gate: "JWSIM_WEB", target, package: lock.JWPLC_PACKAGE_REF, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
