// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// tar (ustar) + gzip mínimo para los paquetes de dispositivos del índice
// comunitario (G7). Sin dependencias. Solo archivos regulares y carpetas;
// al leer se rechazan rutas absolutas, "..", enlaces y tipos especiales.
import { gunzipSync, gzipSync } from "node:zlib";

const BLOCK = 512;

function octal(n, width) {
  return n.toString(8).padStart(width - 1, "0") + "\0";
}

function header(name, size, type = "0") {
  if (Buffer.byteLength(name) > 100) throw new Error(`tar: nombre demasiado largo (${name})`);
  const h = Buffer.alloc(BLOCK);
  h.write(name, 0, 100, "utf8");
  h.write(octal(type === "5" ? 0o755 : 0o644, 8), 100);
  h.write(octal(0, 8), 108);
  h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124);
  h.write(octal(0, 12), 136); // mtime 0: paquetes reproducibles
  h.fill(" ", 148, 156);
  h.write(type, 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + " ", 148);
  return h;
}

/**
 * Empaqueta archivos en un .tar.gz reproducible (orden por nombre, mtime 0).
 * @param {{ name: string, data: Buffer }[]} files
 */
export function packTarGz(files) {
  const parts = [];
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    parts.push(header(f.name, f.data.length), f.data);
    const pad = (BLOCK - (f.data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(2 * BLOCK));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

/** Ruta segura dentro del paquete (relativa, sin "..", sin barras invertidas). */
export function safeName(name) {
  if (!name || name.startsWith("/") || name.includes("\\") || /^[A-Za-z]:/.test(name)) return false;
  return name.split("/").every((p) => p !== ".." && p !== "");
}

/**
 * Lee un .tar.gz. Lanza ante entradas peligrosas o un archivo truncado.
 * @returns {{ name: string, data: Buffer }[]}
 */
export function unpackTarGz(buf, { maxBytes = 64 * 1024 * 1024 } = {}) {
  const tar = gunzipSync(buf, { maxOutputLength: maxBytes });
  const out = [];
  for (let off = 0; off + BLOCK <= tar.length; ) {
    const h = tar.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== parseInt(h.toString("latin1", 148, 156).replace(/\0.*$/, "").trim(), 8)) throw new Error("tar: suma de control inválida");
    const cstr = (a, b) => h.toString("utf8", a, b).replace(/\0.*$/s, "");
    const prefix = cstr(345, 500);
    const name = (prefix ? `${prefix}/` : "") + cstr(0, 100);
    const size = parseInt(cstr(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    off += BLOCK;
    if (off + size > tar.length) throw new Error(`tar: ${name} truncado`);
    if (type === "5") {
      off += Math.ceil(size / BLOCK) * BLOCK;
      continue;
    }
    if (type !== "0") throw new Error(`tar: ${name}: tipo de entrada no permitido (${type})`);
    if (!safeName(name)) throw new Error(`tar: ruta no permitida: ${name}`);
    out.push({ name, data: Buffer.from(tar.subarray(off, off + size)) });
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  return out;
}
