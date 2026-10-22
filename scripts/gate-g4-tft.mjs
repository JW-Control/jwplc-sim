#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Gate JWSIM_G4_TFT_HMI: tests del modelo ST7789; el HMI de JWPLC_Display
// (03.Display_HMI_Pages del package, sin modificar) navegado con la botonera
// virtual (tests/tft/hmi_pages.stim) produce las capturas de referencia
// tests/tft/hmi_pages_<n>.png píxel a píxel; 02.Buttons_Basic informa cada
// pulsación y liberación.
//
//   node scripts/gate-g4-tft.mjs [--target windows] [--record]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSketch, ROOT } from "../cli/lib/build.mjs";
import { resolvePackageRoot } from "./fetch-package.mjs";
import { parseResult, printCriteria, runExe, targetArg, writeReport } from "./lib/gate-util.mjs";
import { decodePng, encodePng, readScreenDump } from "./lib/png.mjs";

const target = targetArg();
const record = process.argv.includes("--record");
const { root, lock } = resolvePackageRoot();
const examples = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");
const out = join(ROOT, "build", "gates", "g4", `tft-${target}`);
mkdirSync(out, { recursive: true });
const refDir = join(ROOT, "tests", "tft");
const SHOTS = [
  [1400, "reposo"],
  [2600, "pagina 0 con I0_0 = 1"],
  [3500, "pagina 1 (RTC)"],
  [4900, "vuelta a reposo"],
];

const models = spawnSync(process.execPath, [join(ROOT, "scripts", "test-models.mjs"), "--target", target], { encoding: "utf8" });
const modelLine = models.stdout.split("\n").find((l) => l.startsWith("ST7789:")) ?? "";

// HMI navegado con la botonera.
const { exe } = await buildSketch(join(examples, "JWPLC_Display", "examples", "03.Display_HMI_Pages"), { target, log: () => {} });
const args = ["--until", "5000", "--quiet", "--stim", join(refDir, "hmi_pages.stim")];
SHOTS.forEach(([t], i) => args.push("--screen-at", `${t}:${join(out, `hmi_pages_${i}.fb`)}`));
const run = runExe(exe, args);
const again = parseResult(runExe(exe, ["--until", "5000", "--quiet", "--stim", join(refDir, "hmi_pages.stim")]).stdout);
const shots = SHOTS.map(([t, what], i) => {
  const img = readScreenDump(readFileSync(join(out, `hmi_pages_${i}.fb`)));
  writeFileSync(join(out, `hmi_pages_${i}.png`), encodePng(img));
  const ref = join(refDir, `hmi_pages_${i}.png`);
  if (record) writeFileSync(ref, encodePng(img));
  if (!existsSync(ref)) return { t, what, pass: false, motivo: "falta la referencia" };
  const want = decodePng(readFileSync(ref));
  let diff = 0;
  for (let p = 0; p < want.rgb.length; p += 3) {
    if (want.rgb[p] !== img.rgb[p] || want.rgb[p + 1] !== img.rgb[p + 1] || want.rgb[p + 2] !== img.rgb[p + 2]) diff++;
  }
  return { t, what, pass: want.width === img.width && want.height === img.height && diff === 0, pixeles_distintos: diff };
});

// Botonera: PRESS y RELEASE de cada botón.
const btn = await buildSketch(join(examples, "JWPLC_GlobalPeripherals", "examples", "02.Buttons_Basic"), { target, log: () => {} });
const names = ["LEFT", "UP", "RIGHT", "ESC", "OK", "DOWN"];
const bargs = ["--until", String(1000 + names.length * 300), "--quiet"];
names.forEach((n, i) => bargs.push("--set", `BTN_${n}=1@${1000 + i * 300}`, "--set", `BTN_${n}=0@${1100 + i * 300}`));
const bout = runExe(btn.exe, [...bargs.filter((a) => a !== "--quiet")]).stdout;
const seen = names.map((n) => ({ n, press: bout.includes(`PRESS   ${n}`), release: bout.includes(`RELEASE ${n}`) }));

const criteria = {
  modelo: { pass: models.status === 0 && /0 con fallas/.test(modelLine), resumen: modelLine.trim() },
  hmi_capturas: { pass: run.status === 0 && shots.every((s) => s.pass), capturas: shots },
  determinismo: { pass: again?.trace_hash === parseResult(run.stdout)?.trace_hash, hash: again?.trace_hash },
  botonera: { pass: seen.every((s) => s.press && s.release), botones: seen },
};
const pass = printCriteria("JWSIM_G4_TFT_HMI", criteria, ` (${target})`);
writeReport(`JWSIM_G4_TFT_HMI-${target}`, { gate: "JWSIM_G4_TFT_HMI", target, result: pass ? "PASS" : "FAIL", criteria });
process.exit(pass ? 0 : 1);
