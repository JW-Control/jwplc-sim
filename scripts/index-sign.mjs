#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Firma el índice comunitario con la clave privada Ed25519 de JW Control y
// verifica la firma con la clave pública de cli/keys/<id>.pem.
//
//   node scripts/index-sign.mjs --key <privada.pem> [--id jwcontrol-index-2026] [--index index/jwsim_index.json]
//   JWSIM_INDEX_SIGNING_KEY="<PEM>" node scripts/index-sign.mjs   (CI: secreto del repositorio)
//
// Generar un par de claves nuevo: node scripts/index-sign.mjs --keygen <dir> [--id <id>]
// (la privada queda en <dir>/<id>.key.pem con permisos 0600 y NO se versiona;
// la pública se copia a cli/keys/<id>.pem).
import { generateKeyPairSync } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { signIndex, trustedKeys, verifyIndex } from "../cli/lib/index.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const id = opt("--id", "jwcontrol-index-2026");

if (argv.includes("--keygen")) {
  const dir = resolve(opt("--keygen"));
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const priv = join(dir, `${id}.key.pem`);
  writeFileSync(priv, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(join(dir, `${id}.pem`), publicKey.export({ type: "spki", format: "pem" }));
  copyFileSync(join(dir, `${id}.pem`), join(ROOT, "cli", "keys", `${id}.pem`));
  console.log(`[index] clave privada: ${priv} (guárdela fuera del repositorio)`);
  console.log(`[index] clave pública: cli/keys/${id}.pem`);
  process.exit(0);
}

const indexFile = resolve(opt("--index", join(ROOT, "index", "jwsim_index.json")));
const pem = argv.includes("--key") ? readFileSync(resolve(opt("--key"))) : process.env.JWSIM_INDEX_SIGNING_KEY;
if (!pem) {
  console.error("falta la clave: --key <privada.pem> o JWSIM_INDEX_SIGNING_KEY");
  process.exit(2);
}
const bytes = readFileSync(indexFile);
const sig = signIndex(bytes, pem, id);
verifyIndex(bytes, sig, trustedKeys());
writeFileSync(indexFile + ".sig", sig);
console.log(`[index] ${indexFile}.sig: firmado con ${id} y verificado con cli/keys/${id}.pem`);
