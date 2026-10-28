// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Proyectos OpenPLC (G6 LADDER_CHAIN): el proyecto del editor pasa por la
// cadena real del OpenPLC Editor fijado en editor.lock y el sketch resultante
// se compila contra la placa simulada, como un sketch Arduino más.
//
//   project.json + pous/ + devices/        (formato del editor, sin cambios)
//     -> parseProjectFiles, preprocessPous   (como el renderer del editor)
//     -> runCompilePipeline del editor        (main process): xml2st -> ST,
//        STruC++ -> C++, defines.h, esqueleto Baremetal + HAL del VPP
//     -> sketch examples/Baremetal + librería src/   (lo que recibe arduino-cli)
//     -> buildSketch con src/ como librería   (-std=gnu++17 -fno-rtti, como la
//        precompilación de OpenPLCUserLib del editor; arduino.cpp con las
//        banderas del sketch, igual que en el editor)
//
// Solo se reemplaza lo que en el editor toca el hardware o la red: instalar
// el core y las librerías (el simulador compila el package fijado) y llamar a
// arduino-cli (se devuelve el sketch para compilarlo aquí).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

import { editorPaths, resolveEditor } from "../../scripts/fetch-editor.mjs";
import { buildSketch } from "./build.mjs";

/** ¿Es un proyecto del OpenPLC Editor (project.json con un programa)? */
export function isOpenPlcProject(dir) {
  const p = join(resolve(dir), "project.json");
  if (!existsSync(p)) return false;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return j?.meta?.type === "plc-project";
  } catch {
    return false;
  }
}

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

const rd = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/**
 * Genera el sketch del proyecto con la cadena del editor.
 * @returns {{ sketchDir: string, libDir: string, md5: string, programSt: string }}
 */
export async function generateOpenPlcSketch(projectDir, outDir, { log = (m) => console.error(m), transpiler = "xml2st" } = {}) {
  const { dir, ready } = await resolveEditor();
  const P = editorPaths(dir);
  const e = createRequire(import.meta.url)(P.pipeline);
  const proj = resolve(projectDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 1. Proyecto en disco -> datos, como project-adapter.ts del editor.
  const files = (sub) => walk(join(proj, sub), proj).map((rel) => ({ relativePath: rel, content: rd(join(proj, rel)) }));
  const parsed = e.parseProjectFiles(
    proj,
    rd(join(proj, "project.json")),
    rd(join(proj, "devices", "configuration.json")),
    rd(join(proj, "devices", "pin-mapping.json")),
    files("pous"),
    files("devices/servers"),
    files("devices/remote"),
  );
  for (const w of parsed.warnings ?? []) log(`[openplc] aviso: ${w}`);

  // 2. Preproceso y forma IPC, como compiler-adapter.ts del editor.
  const pre = e.preprocessPous(parsed.projectData, false, (level, message) => log(`[openplc] ${message}`));
  if (pre.validationFailed) throw new Error("validación de POU fallida (ver mensajes anteriores)");
  const pd = pre.projectData;
  const ipcData = {
    dataTypes: pd.dataTypes,
    pous: pd.pous.map((pou) => ({
      type: pou.pouType,
      data: {
        name: pou.name,
        variables: pou.interface?.variables ?? [],
        ...(pou.interface?.returnType ? { returnType: pou.interface.returnType } : {}),
        body: pou.body,
        documentation: pou.documentation ?? "",
      },
    })),
    configuration: pd.configurations,
    servers: pd.servers,
    remoteDevices: pd.remoteDevices,
    libraries: pd.libraries,
    ...(pd.originalCppPous ? { originalCppPous: pd.originalCppPous } : {}),
  };

  // 3. Placa: el dispositivo del VPP (manifest, HAL y pines por defecto).
  const manifest = JSON.parse(rd(join(P.vpp, "manifest.json")));
  const dev = manifest.devices[0];
  const board = parsed.deviceConfiguration?.deviceBoard;
  if (board && board !== dev.name) log(`[openplc] aviso: el proyecto es para «${board}»; se simula ${dev.name}`);
  const pins = Array.isArray(parsed.devicePinMapping) && parsed.devicePinMapping.length ? parsed.devicePinMapping : e.buildDefaultPinMapping(dev.defaults?.pins);
  const hal = rd(join(P.vpp, dev.hal.source));

  // 4. Esqueleto del firmware y runtime de STruC++, como compiler-module.ts.
  const skeleton = {};
  for (const rel of walk(join(P.sources, "arduino"))) skeleton[`src/${rel}`] = rd(join(P.sources, "arduino", rel));
  for (const rel of walk(join(P.sources, "Baremetal"))) skeleton[`examples/Baremetal/${rel}`] = rd(join(P.sources, "Baremetal", rel));
  const runtimeHeaders = {};
  const rtDir = join(P.strucpp, "src", "runtime", "include");
  for (const rel of walk(rtDir)) runtimeHeaders[rel] = rd(join(rtDir, rel));
  const libsDir = join(P.strucpp, "libs");
  const archives = readdirSync(libsDir).filter((f) => f.endsWith(".stlib")).sort().map((f) => JSON.parse(rd(join(libsDir, f))));

  let programSt = "";
  const port = {
    async computeMd5(s) {
      return createHash("md5").update(s).digest("hex");
    },
    async transpileToSt(args) {
      const fail = (message) => ({ ok: false, errors: [{ message, line: 0, column: 0, severity: "error" }] });
      if (transpiler === "json") {
        const r = e.runJsonTranspiler(e.fromSchemaShape(args.projectData));
        if (r.programSt === null || r.errors.length) return fail(r.errors.join("\n") || "no se generó el texto estructurado");
        return { ok: true, programSt: (programSt = r.programSt) };
      }
      const xml = e.XmlGenerator(args.projectData, "old-editor");
      if (!xml.ok || !xml.data) return fail(`XML: ${xml.message}`);
      const src = join(outDir, "src");
      mkdirSync(src, { recursive: true });
      writeFileSync(join(src, "plc.xml"), xml.data);
      try {
        execFileSync(P.xml2st, ["--generate-st", join(src, "plc.xml"), "--keep-structs"], { stdio: ["ignore", "pipe", "pipe"] });
      } catch (err) {
        return fail(`xml2st: ${String(err.stderr || err.stdout || err.message).trim()}`);
      }
      return { ok: true, programSt: (programSt = rd(join(src, "program.st"))) };
    },
    async installArduinoCore() {
      return { ok: true };
    },
    async installArduinoLib() {
      return { ok: true };
    },
    async compileArduino(args) {
      for (const [rel, content] of Object.entries(args.files)) {
        const p = join(outDir, rel);
        mkdirSync(join(p, ".."), { recursive: true });
        writeFileSync(p, content);
      }
      return { ok: true };
    },
  };

  const errors = [];
  const result = await e.runCompilePipeline(
    {
      projectData: ipcData,
      boardTarget: dev.name,
      boardRuntime: "arduino",
      boardEntry: { compiler: "arduino-cli", platform: dev.target.platform, core: dev.target.core, define: dev.hal.define, vpp: manifest, capabilities: dev.capabilities },
      devicePinMapping: pins,
      isSimulator: false,
      isRuntimeV4: false,
      isRuntimeV3: false,
      compileOnly: true,
      libraryArchives: archives,
      missingLibraries: [],
      firmwareSkeleton: e.mergeStrucppRuntimeIntoSkeleton({ firmwareSkeleton: skeleton, strucppRuntimeHeaders: runtimeHeaders, boardHalContent: hal }),
      strucppRuntimeHeaders: runtimeHeaders,
      avrLibStdCppInclude: "",
      arduinoCliParallel: false,
      vendorScreenData: parsed.deviceConfiguration?.vendorScreenData,
    },
    port,
    (ev) => {
      if (ev.level === "error") errors.push(ev.message);
      log(`[openplc] ${ev.stage}: ${ev.message}`);
    },
  );
  if (!result.success) {
    const detail = (result.errors ?? []).map((x) => (x.line ? `línea ${x.line}: ${x.message}` : x.message));
    throw new Error(`la cadena del editor falló: ${[...detail, ...errors].join(" | ") || "sin detalle"}`);
  }
  const info = { editor: ready.editorRef, editorCommit: ready.editorCommit, vpp: ready.vppSha, xml2st: ready.xml2st, strucpp: ready.strucpp, transpiler, md5: result.md5 };
  writeFileSync(join(outDir, "openplc.json"), JSON.stringify(info, null, 2) + "\n");
  return { sketchDir: join(outDir, "examples", "Baremetal"), libDir: join(outDir, "src"), md5: result.md5, programSt, info };
}

/** Compila un proyecto OpenPLC contra la placa simulada (mismas opciones que buildSketch). */
export async function buildOpenPlcProject(projectDir, options = {}) {
  const log = options.log ?? ((m) => console.error(m));
  const outDir = options.outDir ?? join(resolve(projectDir), "build", "jwsim");
  const gen = await generateOpenPlcSketch(projectDir, join(outDir, "openplc"), { log, transpiler: options.transpiler });
  const r = await buildSketch(gen.sketchDir, {
    ...options,
    outDir: join(outDir, options.target ?? "native"),
    libraries: [...(options.libraries ?? []), { dir: gen.libDir, cxxflags: ["-std=gnu++17", "-fno-rtti"], cxxflagsExcept: ["arduino.cpp"] }],
    log,
  });
  return { ...r, openplc: gen.info };
}
