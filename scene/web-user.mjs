// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Usuario del panel web JWPLC_Web dentro de la red de la escena (alpha.19),
// para el calificador (cli/lib/cosim.mjs): hace lo que haría una persona con el
// celular, por HTTP sobre el W5500 simulado y en tiempo virtual.
//
//   1. Lee de la consola el código de primer ingreso («... codigo 123456»).
//   2. Reclama el equipo (POST /api/reclamar) y queda con la sesión del
//      administrador (cookie jw).
//   3. Mira el panel: GET /api/vivo cada pollMs. Cada variable publicada queda
//      en la traza como «WEB.<id>»; cada alarma como «WEB.alarma.<id>» (activa)
//      y «WEB.reconocida.<id>»; «WEB.sesion» vale 1 con la sesión abierta.
//   4. Las acciones de la rúbrica con device "WEB":
//        { "action": "write", "id": "meta", "value": 5 }  POST /api/escribir
//        { "action": "ack", "id": "baja" }                 POST /api/reconocer
//      La respuesta queda en «WEB.respuesta» (200, 400 fuera de rango, 403…).
//
// Una petición por conexión (el servidor responde con Connection: close): toma
// un socket del PLC en LISTEN del puerto 80, le entrega la petición y junta la
// respuesta hasta que el PLC cierra.
import { pbkdf2Sync } from "node:crypto";

// Sal fija: la corrida es determinista (misma traza, mismo hash).
const SALT = Buffer.from("4a57504c435f53696d5f7765625f7573", "hex");

/** Respuesta HTTP: estado, cookie y cuerpo JSON (si lo es). */
export function parseHttp(buf) {
  const text = buf.toString("latin1");
  const end = text.indexOf("\r\n\r\n");
  if (end < 0) return null;
  const head = text.slice(0, end).split("\r\n");
  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head[0])?.[1] ?? 0);
  let cookie = null;
  for (const h of head) {
    const m = /^set-cookie:\s*jw=([^;]*)/i.exec(h);
    if (m) cookie = m[1];
  }
  const body = buf.subarray(end + 4).toString("utf8");
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {}
  return { status, cookie, json, body };
}

export class WebUser {
  /**
   * @param {{ port?: number, user?: string, password?: string, pollMs?: number,
   *   record: (key: string, value: unknown, t: bigint) => void }} o
   */
  constructor(o) {
    this.port = o.port ?? 80;
    this.user = o.user ?? "profe";
    this.password = o.password ?? "clave-del-profe-1";
    this.pollNs = BigInt(Math.round((o.pollMs ?? 250) * 1e6));
    this.record = o.record;
    this.code = null;
    this.cookie = null;
    this.claiming = false;
    /** @type {{ method: string, path: string, body?: Record<string, string>, kind: string }[]} */
    this.queue = [];
    /** @type {{ s: number, req: any, at: bigint } | null} */
    this.inflight = null;
    this.due = 0n;
    this.serial = "";
    /** @type {Map<string, unknown>} último valor anotado por clave */
    this.last = new Map();
  }

  /** Texto de la consola del PLC (busca el código de primer ingreso). */
  onSerial(text) {
    this.serial = (this.serial + text).slice(-400);
    const m = /codigo (\d{6})/.exec(this.serial);
    if (m) this.code = m[1];
  }

  /** Acción de la rúbrica (device "WEB"). */
  act(action, a) {
    if (action === "write") this.queue.push({ method: "POST", path: "/api/escribir", body: { id: String(a.id), v: String(a.value) }, kind: "write" });
    else if (action === "ack") this.queue.push({ method: "POST", path: "/api/reconocer", body: { id: String(a.id) }, kind: "ack" });
    else throw new Error(`WEB: acción desconocida «${action}» (write, ack)`);
  }

  #note(key, value, t) {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    this.record(key, value, t);
  }

  /** Próxima petición que toca, o null. */
  next(t) {
    if (this.inflight) return null;
    if (!this.cookie) {
      if (!this.code || this.claiming) return null;
      this.claiming = true;
      const k = pbkdf2Sync(Buffer.from(this.password, "utf8"), SALT, 2000, 32, "sha256").toString("hex");
      return { method: "POST", path: "/api/reclamar", body: { c: this.code, u: this.user, s: SALT.toString("hex"), k }, kind: "claim" };
    }
    if (this.queue.length) return this.queue.shift() ?? null;
    if (t < this.due) return null;
    this.due = t + this.pollNs;
    return { method: "GET", path: "/api/vivo", kind: "live" };
  }

  /** Bytes de la petición. */
  bytes(req) {
    const lines = [`${req.method} ${req.path} HTTP/1.1`, "Host: 192.168.250.10", "Connection: close"];
    if (this.cookie) lines.push(`Cookie: jw=${this.cookie}`);
    let body = "";
    if (req.body) {
      body = new URLSearchParams(req.body).toString();
      lines.push("X-JW: 1", "Content-Type: application/x-www-form-urlencoded", `Content-Length: ${Buffer.byteLength(body)}`);
    }
    return Buffer.from(`${lines.join("\r\n")}\r\n\r\n${body}`, "utf8");
  }

  /** El PLC cerró la conexión: se interpreta la respuesta completa. */
  done(rx, req, t) {
    const r = parseHttp(Buffer.from(rx));
    if (!r) {
      if (req.kind === "claim") this.claiming = false;
      return;
    }
    if (req.kind === "claim") {
      this.claiming = false;
      // Código vencido (cambia cada 60 s): se espera el próximo de la consola.
      if (r.status === 200 && r.cookie) this.cookie = r.cookie;
      else this.code = null;
      this.#note("WEB.sesion", this.cookie ? 1 : 0, t);
      return;
    }
    if (r.status === 401) {
      this.cookie = null;
      this.#note("WEB.sesion", 0, t);
      return;
    }
    if (req.kind === "write" || req.kind === "ack") {
      this.record("WEB.respuesta", r.status, t);
      this.due = t; // mirar enseguida el efecto
      return;
    }
    if (req.kind === "live" && r.json) {
      for (const [id, v] of Object.entries(r.json.v ?? {})) this.#note(`WEB.${id}`, typeof v === "boolean" ? (v ? 1 : 0) : v, t);
      for (const [id, a] of Object.entries(r.json.a ?? {})) {
        this.#note(`WEB.alarma.${id}`, a.activa ? 1 : 0, t);
        this.#note(`WEB.reconocida.${id}`, a.reconocida ? 1 : 0, t);
      }
    }
  }
}
