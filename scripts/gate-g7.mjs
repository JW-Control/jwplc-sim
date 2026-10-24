#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gates G7 (docs/GATES.md): biblioteca de dispositivos, netlist, SDK e índice
// comunitario firmado. Deja el informe en build/gates/g7.json.
//
// Uso: node scripts/gate-g7.mjs [--only library|netlist|sdk|index]
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROOT } from "../cli/lib/build.mjs";
import { packDevice } from "../cli/lib/device.mjs";
import { signIndex, trustedKeys, verifyIndex } from "../cli/lib/index.mjs";
import { packTarGz } from "../cli/lib/tar.mjs";
import { compareVersions } from "../scene/devices/index.mjs";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const CLI = join(ROOT, "cli", "jwsim-cli.mjs");
const report = { host: `${process.platform}-${process.arch}`, gates: {} };

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, ...opts });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), stdout: r.stdout ?? "" };
}
const cli = (args, env = {}) => {
  const r = sh(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
  let json = null;
  try {
    json = JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    // salida sin --json
  }
  return { ...r, json };
};
const nodeTest = (file) => {
  const r = sh(process.execPath, ["--test", file]);
  const n = (k) => Number(new RegExp(`^# ${k} (\\d+)`, "m").exec(r.out)?.[1] ?? 0);
  return { ok: r.code === 0, pass: n("pass"), fail: n("fail") };
};
function tsc(args) {
  const direct = sh("tsc", args, { shell: process.platform === "win32" });
  if (direct.code !== null && !/not (found|recognized)|ENOENT/.test(direct.out)) return direct;
  return sh("npx", ["--yes", "-p", "typescript@5.9.3", "tsc", ...args], { shell: process.platform === "win32" });
}

function gate(name, fn) {
  const checks = [];
  const check = (id, ok, detail) => {
    checks.push({ id, ok: !!ok, detail });
    console.log(`  ${id}: ${ok ? "OK" : "FALLA"} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  };
  console.log(name);
  return Promise.resolve(fn(check)).then(() => {
    const ok = checks.every((c) => c.ok);
    report.gates[name] = { status: ok ? "PASS" : "FAIL", checks };
    console.log(`${name}=${ok ? "PASS" : "FAIL"}\n`);
  });
}

const V01 = ["pushbutton-no", "pushbutton-nc", "pushbutton-nono", "pushbutton-nonc", "selector-2", "selector-3", "limit-switch", "sensor-inductive",
  "sensor-photoelectric", "lamp", "buzzer", "relay", "contactor", "solenoid-valve", "motor"];

if (!only || only === "library") {
  await gate("JWSIM_G7_DEVICE_LIBRARY", (check) => {
    const r = nodeTest("scene/tests/devices.test.mjs");
    check("C1 pruebas de comportamiento", r.ok, { pass: r.pass, fail: r.fail });
    const src = readFileSync(join(ROOT, "scene/tests/devices.test.mjs"), "utf8");
    const missing = V01.filter((t) => !new RegExp(`(:|jwsim/|sensor-\\$\\{kind\\})${t.replace("sensor-inductive", "sensor-").replace("sensor-photoelectric", "sensor-")}`).test(src));
    check("C2 cada dispositivo v0.1 tiene pruebas", !missing.length, missing.length ? `sin pruebas: ${missing.join(", ")}` : `${V01.length} dispositivos`);
  });
}

if (!only || only === "netlist") {
  await gate("JWSIM_G7_NETLIST", (check) => {
    const r = nodeTest("scene/tests/netlist.test.mjs");
    check("C1 casos eléctricos", r.ok, { pass: r.pass, fail: r.fail });
    const t = cli(["test", "tests/scene/g7_marcha_ciclo.jwtest.json", "tests/scene/g7_falla_contactor.jwtest.json", "tests/scene/g7_cortocircuito.jwtest.json", "--json"]);
    check("C2 co-simulación con firmware (marcha, bobina sin alimentación, cortocircuito)", t.code === 0 && t.json?.passed === 3, t.json ? `${t.json.passed}/${t.json.total}` : t.out.slice(-400));
    const h1 = t.json?.tests?.[0]?.runs?.[0]?.result?.trace_hash;
    const again = cli(["test", "tests/scene/g7_marcha_ciclo.jwtest.json", "--json"]);
    const h2 = again.json?.tests?.[0]?.runs?.[0]?.result?.trace_hash;
    check("C3 determinismo (mismo hash de traza)", h1 && h1 === h2, `${h1} / ${h2}`);
  });
}

if (!only || only === "sdk") {
  await gate("JWSIM_G7_DEVICE_SDK", (check) => {
    const strict = ["sdk/examples/timer-relay/tsconfig.json", "sdk/template/scene-device/tsconfig.json"].map((p) => [p, tsc(["-p", p, "--noEmit"])]);
    check("C1 TypeScript estricto contra sdk/jwsim-device.d.ts (ejemplo y plantilla)", strict.every(([, r]) => r.code === 0), strict.map(([p, r]) => `${p}: ${r.code === 0 ? "OK" : r.out.slice(0, 300)}`).join("; "));
    const lib = tsc(["--noEmit", "--allowJs", "--checkJs", "--strict", "false", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--skipLibCheck", "scene/scene.mjs", "scene/devices/index.mjs"]);
    check("C2 la biblioteca incluida cumple el contrato (checkJs)", lib.code === 0, lib.code === 0 ? "18 dispositivos" : lib.out.slice(0, 400));
    const ex = cli(["device", "test", "sdk/examples/timer-relay", "--json"]);
    const tp = cli(["device", "test", "sdk/template/scene-device", "--json"]);
    check("C3 dispositivo de escena de ejemplo y plantilla: pruebas", ex.json?.tests?.ok && tp.json?.tests?.ok, `${ex.json?.type}: ${ex.json?.tests?.ok}; ${tp.json?.type}: ${tp.json?.tests?.ok}`);
    const nb = cli(["device", "build", "sdk/native/examples/pulse-generator", "--json"]);
    const nt = cli(["device", "build", "sdk/template/native-device", "--json"]);
    check("C4 nativos (ABI C) compilan con el toolchain", nb.json?.ok && nt.json?.ok, `${nb.json?.library ?? nb.out.slice(-300)}; ${nt.json?.library ?? nt.out.slice(-300)}`);
    const run = cli(["test", "tests/scene/g7_dispositivo_nativo.jwtest.json", "--json"]);
    check("C5 el runner carga el nativo (--device) y el firmware cuenta 100 flancos", run.code === 0, run.json ? `${run.json.passed}/${run.json.total}` : run.out.slice(-300));
    const doc = existsSync(join(ROOT, "docs/SDK.md")) ? readFileSync(join(ROOT, "docs/SDK.md"), "utf8") : "";
    check("C6 documentación (docs/SDK.md: contrato TS, ABI C, plantillas, publicación)", /jwsim-device\.d\.ts/.test(doc) && /jwsim_device\.h/.test(doc) && /sdk\/template/.test(doc) && /jwsim_index\.json/.test(doc), doc ? "docs/SDK.md" : "falta docs/SDK.md");
  });
}

if (!only || only === "index") {
  await gate("JWSIM_G7_COMMUNITY_INDEX", (check) => {
    const work = mkdtempSync(join(tmpdir(), "jwsim-g7-"));
    const home = (n) => join(work, `home-${n}`);
    const idxDir = join(ROOT, "index");
    try {
      // C1: el índice publicado está firmado por JW Control y cada paquete coincide.
      const bytes = readFileSync(join(idxDir, "jwsim_index.json"));
      let keyId = null;
      try {
        keyId = verifyIndex(bytes, readFileSync(join(idxDir, "jwsim_index.json.sig"), "utf8"), trustedKeys());
      } catch (err) {
        keyId = err.message;
      }
      const index = JSON.parse(bytes);
      check("C1 índice publicado firmado (Ed25519) con la clave incluida", keyId === "jwcontrol-index-2026", `${keyId}; ${index.packages.length} paquetes: ${index.packages.map((p) => `${p.type} (${p.kind})`).join(", ")}`);

      // C2: instalación desde el índice con firma válida.
      const env = { JWSIM_HOME: home("ok") };
      const ins = index.packages.map((p) => cli(["device", "install", p.type, "--index", join(idxDir, "jwsim_index.json"), "--json"], env));
      check("C2 instalación con firma válida (escena, nativo y ejemplo)", ins.every((r) => r.code === 0 && r.json?.ok), ins.map((r) => (r.json?.ok ? `${r.json.type}@${r.json.version}` : r.out.slice(-200))).join("; "));
      const test = join(work, "nativo_instalado.jwtest.json");
      writeFileSync(test, JSON.stringify({
        sketch: join(ROOT, "tests/sketches/g7_pulsos"),
        until_ms: 2400,
        devices: [{ type: "jwcontrol/pulse-generator", params: { hz: 100 } }],
        expect: { console: ["^flancos=100$"] },
      }));
      const used = cli(["test", test, "--json"], env);
      const list = cli(["device", "list", "--json"], env);
      // El de escena instalado entra al registro y funciona en una escena.
      const sceneUse = sh(process.execPath, ["--input-type=module", "-e", `
        import { registryWithInstalled } from ${JSON.stringify(new URL("../cli/lib/device.mjs", import.meta.url).href)};
        import { Scene } from ${JSON.stringify(new URL("../scene/scene.mjs", import.meta.url).href)};
        const s = new Scene({ devices: [{ id: "PS", type: "jwsim/power-24vdc" }, { id: "KT", type: "jwcontrol/timer-relay", params: { timeMs: 100 } }],
          wiring: [{ from: "PS.+V1", to: "KT.A1" }, { from: "KT.A2", to: "PS.-V1" }] }, { registry: await registryWithInstalled() });
        s.advanceTo(100_000_000n);
        console.log("closed=" + s.output("KT", "closed"));`], { env: { ...process.env, ...env } });
      check("C3 lo instalado se usa (nativo en el runner, de escena en una escena, listado)",
        used.code === 0 && /closed=true/.test(sceneUse.out) && list.json?.installed?.length === 2,
        `prueba ${used.json?.passed}/${used.json?.total}; escena ${sceneUse.out.trim().slice(-200)}; instalados ${list.json?.installed?.map((d) => d.type).join(", ")}`);

      // Copia del índice para alterarla.
      const copy = (name) => {
        const d = join(work, name);
        cpSync(idxDir, d, { recursive: true });
        return d;
      };
      const refuse = (id, dir, spec, pattern, envExtra = {}) => {
        const e = { JWSIM_HOME: home(id), ...envExtra };
        const r = cli(["device", "install", spec, "--index", join(dir, "jwsim_index.json"), "--json"], e);
        const nothing = !existsSync(home(id)) || !readdirSync(home(id), { recursive: true }).some((f) => String(f).endsWith("jwsim-device.json"));
        const ok = r.code === 1 && r.json?.ok === false && pattern.test(r.json?.error ?? "") && nothing;
        return { ok, detail: `${r.json?.error ?? r.out.slice(-200)}${nothing ? "" : " (¡quedó algo instalado!)"}` };
      };

      // C4: índice alterado (otra URL de paquete) con la firma original.
      const t1 = copy("alterado");
      const j1 = JSON.parse(readFileSync(join(t1, "jwsim_index.json"), "utf8"));
      j1.packages.find((p) => p.type === "jwcontrol/timer-relay").description += " ";
      writeFileSync(join(t1, "jwsim_index.json"), JSON.stringify(j1, null, 2) + "\n");
      let r = refuse("alterado", t1, "jwcontrol/timer-relay", /firma inválida/);
      check("C4 índice alterado: firma inválida, no instala", r.ok, r.detail);

      // C5: paquete alterado (índice y firma intactos).
      const t2 = copy("paquete");
      // El paquete que se instalaría: la versión más nueva del índice.
      const tr = JSON.parse(readFileSync(join(t2, "jwsim_index.json"), "utf8")).packages.find((p) => p.type === "jwcontrol/timer-relay");
      const pkgFile = join(t2, [...tr.versions].sort((a, b) => compareVersions(b.version, a.version))[0].url);
      const buf = readFileSync(pkgFile);
      buf[buf.length - 10] ^= 0xff;
      writeFileSync(pkgFile, buf);
      r = refuse("paquete", t2, "jwcontrol/timer-relay", /SHA-256 no coincide/);
      check("C5 paquete alterado: SHA-256 no coincide, no instala", r.ok, r.detail);

      // C6: firmado con una clave que no es de confianza.
      const t3 = copy("clave");
      const rogue = generateKeyPairSync("ed25519");
      writeFileSync(join(t3, "jwsim_index.json.sig"), signIndex(readFileSync(join(t3, "jwsim_index.json")), rogue.privateKey.export({ type: "pkcs8", format: "pem" }), "jwcontrol-index-2026"));
      const r6a = refuse("clave", t3, "jwcontrol/timer-relay", /firma inválida/);
      writeFileSync(join(t3, "jwsim_index.json.sig"), signIndex(readFileSync(join(t3, "jwsim_index.json")), rogue.privateKey.export({ type: "pkcs8", format: "pem" }), "otra-clave"));
      const r6b = refuse("clave2", t3, "jwcontrol/timer-relay", /no es de confianza/);
      check("C6 firma de otra clave (mismo id o id desconocido): no instala", r6a.ok && r6b.ok, `${r6a.detail} | ${r6b.detail}`);

      // C7: índice sin firma.
      const t4 = copy("sinfirma");
      rmSync(join(t4, "jwsim_index.json.sig"));
      r = refuse("sinfirma", t4, "jwcontrol/timer-relay", /no está firmado/);
      check("C7 índice sin firma: no instala", r.ok, r.detail);

      // C8: paquete malicioso (ruta "../") en un índice firmado con una clave de
      // prueba de confianza: la firma no basta, el contenido también se valida.
      const t5 = join(work, "malicioso");
      mkdirSync(join(t5, "packages"), { recursive: true });
      const keys = join(work, "claves-prueba");
      mkdirSync(keys);
      const test2 = generateKeyPairSync("ed25519");
      writeFileSync(join(keys, "prueba.pem"), test2.publicKey.export({ type: "spki", format: "pem" }));
      const good = packDevice(join(ROOT, "sdk/examples/timer-relay"));
      const evil = packTarGz([{ name: "jwsim-device.json", data: readFileSync(join(ROOT, "sdk/examples/timer-relay/jwsim-device.json")) }, { name: "../../fuera.txt", data: Buffer.from("x") }]);
      const sha = (b) => `SHA-256:${createHash("sha256").update(b).digest("hex")}`;
      writeFileSync(join(t5, "packages", "p.tar.gz"), evil);
      const idx = { jwsim_index: 1, name: "prueba", packages: [{ type: "jwcontrol/timer-relay", kind: "scene", name: "x", license: "MIT", versions: [{ version: "1.0.0", url: "packages/p.tar.gz", checksum: sha(evil), size: evil.length, sdk: 1 }] }] };
      const writeIdx = () => {
        const b = Buffer.from(JSON.stringify(idx, null, 2) + "\n");
        writeFileSync(join(t5, "jwsim_index.json"), b);
        writeFileSync(join(t5, "jwsim_index.json.sig"), signIndex(b, test2.privateKey.export({ type: "pkcs8", format: "pem" }), "prueba"));
      };
      writeIdx();
      const r8a = refuse("malicioso", t5, "jwcontrol/timer-relay", /ruta no permitida/, { JWSIM_TRUSTED_KEYS: keys });
      const outside = existsSync(join(work, "fuera.txt")) || existsSync(join(home("malicioso"), "fuera.txt"));
      // Manifiesto que no coincide con la entrada del índice.
      idx.packages[0].type = "jwcontrol/otro";
      writeFileSync(join(t5, "packages", "p.tar.gz"), good.archive);
      idx.packages[0].versions[0].checksum = good.checksum;
      idx.packages[0].versions[0].size = good.size;
      writeIdx();
      const r8b = refuse("manifiesto", t5, "jwcontrol/otro", /no coincide con el índice/, { JWSIM_TRUSTED_KEYS: keys });
      check("C8 contenido inseguro aun con firma válida (ruta ../, manifiesto distinto): no instala", r8a.ok && r8b.ok && !outside, `${r8a.detail} | ${r8b.detail}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
}

mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "g7.json"), JSON.stringify(report, null, 2) + "\n");
const failed = Object.entries(report.gates).filter(([, g]) => g.status !== "PASS");
console.log(Object.entries(report.gates).map(([k, g]) => `${k}=${g.status}`).join("\n"));
process.exit(failed.length ? 1 : 0);
