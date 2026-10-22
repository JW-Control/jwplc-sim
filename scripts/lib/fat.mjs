// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Lector FAT32 independiente de FatFs para verificar la imagen de la microSD
// simulada (gate JWSIM_G4_SD_DATALOG): MBR, sector de arranque, FAT,
// directorios con nombres largos (LFN) y contenido de archivos, más una
// verificación de consistencia al estilo fsck (cadenas de clústeres contra
// tamaños, clústeres compartidos o perdidos, contador libre de FSInfo).
import { readFileSync } from "node:fs";

const SECTOR = 512;

// sd.bin del simulador ("JWSD" v1: sectores no nulos) o imagen cruda .img.
export function loadSdImage(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 4).toString("latin1") !== "JWSD") return { sectors: buf.length / SECTOR, read: (lba) => buf.subarray(lba * SECTOR, (lba + 1) * SECTOR) };
  if (buf.readUInt32LE(4) !== 1) throw new Error("sd.bin: versión desconocida");
  const sectors = buf.readUInt32LE(8);
  const n = buf.readUInt32LE(12);
  const map = new Map();
  for (let i = 0, off = 16; i < n; i++, off += 4 + SECTOR) map.set(buf.readUInt32LE(off), buf.subarray(off + 4, off + 4 + SECTOR));
  const zero = Buffer.alloc(SECTOR);
  return { sectors, read: (lba) => map.get(lba) ?? zero };
}

export class Fat32 {
  constructor(disk) {
    this.disk = disk;
    const mbr = disk.read(0);
    let part = 0;
    // Sin sector de arranque FAT en el sector 0: primera partición del MBR.
    if (mbr.subarray(82, 87).toString("latin1") !== "FAT32") part = mbr.readUInt32LE(446 + 8);
    const b = disk.read(part);
    if (b.readUInt16LE(510) !== 0xaa55 || b.readUInt16LE(11) !== SECTOR) throw new Error("sin sector de arranque FAT32");
    this.part = part;
    this.spc = b[13];
    this.rsvd = b.readUInt16LE(14);
    this.nfats = b[16];
    this.totSec = b.readUInt32LE(32);
    this.fatSz = b.readUInt32LE(36);
    this.rootClus = b.readUInt32LE(44);
    this.fsInfo = b.readUInt16LE(48);
    this.dataStart = part + this.rsvd + this.nfats * this.fatSz;
    this.clusters = Math.floor((this.totSec - this.rsvd - this.nfats * this.fatSz) / this.spc);
  }
  fat(c) {
    const off = c * 4;
    return this.disk.read(this.part + this.rsvd + Math.floor(off / SECTOR)).readUInt32LE(off % SECTOR) & 0x0fffffff;
  }
  chain(start) {
    const out = [];
    const seen = new Set();
    for (let c = start; c >= 2 && c < 0x0ffffff8; c = this.fat(c)) {
      if (seen.has(c) || c >= this.clusters + 2) throw new Error(`cadena inválida desde el clúster ${start}`);
      seen.add(c);
      out.push(c);
    }
    return out;
  }
  readChain(start, size = Infinity) {
    const parts = [];
    for (const c of this.chain(start)) {
      for (let s = 0; s < this.spc; s++) parts.push(this.disk.read(this.dataStart + (c - 2) * this.spc + s));
    }
    const all = Buffer.concat(parts);
    return size === Infinity ? all : all.subarray(0, size);
  }
  // Entradas de un directorio: { name, dir, size, cluster, mtime }.
  list(cluster = this.rootClus) {
    const data = this.readChain(cluster);
    const out = [];
    let lfn = [];
    for (let i = 0; i + 32 <= data.length; i += 32) {
      const e = data.subarray(i, i + 32);
      if (e[0] === 0) break;
      if (e[0] === 0xe5) {
        lfn = [];
        continue;
      }
      const attr = e[11];
      if (attr === 0x0f) {
        const chars = [];
        for (const [a, n] of [[1, 5], [14, 6], [28, 2]]) for (let k = 0; k < n; k++) chars.push(e.readUInt16LE(a + 2 * k));
        lfn.unshift(String.fromCharCode(...chars.filter((c) => c !== 0 && c !== 0xffff)));
        continue;
      }
      if (attr & 0x08) {
        lfn = [];
        continue;   // etiqueta de volumen
      }
      // NTRes (byte 12): 0x08 nombre en minúsculas, 0x10 extensión en minúsculas.
      let base = e.subarray(0, 8).toString("latin1").trimEnd();
      let ext = e.subarray(8, 11).toString("latin1").trimEnd();
      if (e[12] & 0x08) base = base.toLowerCase();
      if (e[12] & 0x10) ext = ext.toLowerCase();
      const short = ext ? `${base}.${ext}` : base;
      const name = lfn.length ? lfn.join("") : short;
      lfn = [];
      if (name === "." || name === "..") continue;
      const d = e.readUInt16LE(24);
      const t = e.readUInt16LE(22);
      out.push({
        name,
        dir: !!(attr & 0x10),
        size: e.readUInt32LE(28),
        cluster: (e.readUInt16LE(20) << 16) | e.readUInt16LE(26),
        mtime: `${1980 + (d >> 9)}-${String((d >> 5) & 15).padStart(2, "0")}-${String(d & 31).padStart(2, "0")} ${String(t >> 11).padStart(2, "0")}:${String((t >> 5) & 63).padStart(2, "0")}:${String((t & 31) * 2).padStart(2, "0")}`,
      });
    }
    return out;
  }
  // Árbol completo: ruta → entrada.
  walk(cluster = this.rootClus, prefix = "") {
    const out = new Map();
    for (const e of this.list(cluster)) {
      const path = `${prefix}/${e.name}`;
      out.set(path, e);
      if (e.dir) for (const [p, x] of this.walk(e.cluster, path)) out.set(p, x);
    }
    return out;
  }
  readFile(path) {
    const e = this.walk().get(path);
    if (!e || e.dir) return null;
    return e.size ? this.readChain(e.cluster, e.size) : Buffer.alloc(0);
  }
  // Consistencia: devuelve la lista de problemas (vacía si está sana).
  check() {
    const problems = [];
    const owner = new Map();
    const claim = (chain, who) => {
      for (const c of chain) {
        if (owner.has(c)) problems.push(`clúster ${c} compartido por ${owner.get(c)} y ${who}`);
        owner.set(c, who);
      }
    };
    claim(this.chain(this.rootClus), "/");
    const bytesPerClus = this.spc * SECTOR;
    for (const [path, e] of this.walk()) {
      if (!e.cluster) {
        if (e.size) problems.push(`${path}: tamaño ${e.size} sin clústeres`);
        continue;
      }
      const chain = this.chain(e.cluster);
      claim(chain, path);
      if (!e.dir && chain.length !== Math.ceil(e.size / bytesPerClus)) problems.push(`${path}: ${chain.length} clústeres para ${e.size} bytes`);
    }
    let free = 0;
    for (let c = 2; c < this.clusters + 2; c++) {
      const v = this.fat(c);
      if (v === 0) free++;
      else if (!owner.has(c)) problems.push(`clúster ${c} perdido (FAT=${v.toString(16)})`);
    }
    const fsi = this.disk.read(this.part + this.fsInfo);
    const fsiFree = fsi.readUInt32LE(488);
    if (fsiFree !== 0xffffffff && fsiFree !== free) problems.push(`FSInfo dice ${fsiFree} libres, la FAT ${free}`);
    // Las dos copias de la FAT deben coincidir.
    for (let s = 0; s < this.fatSz; s++) {
      if (!this.disk.read(this.part + this.rsvd + s).equals(this.disk.read(this.part + this.rsvd + this.fatSz + s))) {
        problems.push(`FAT1 y FAT2 difieren en el sector ${s}`);
        break;
      }
    }
    return { problems, free, clusters: this.clusters };
  }
}
