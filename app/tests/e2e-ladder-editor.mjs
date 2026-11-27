// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Editor Ladder del Sim (ladder-edit.js + app/lib/ladder-edit.mjs, Electron +
// Playwright), sobre la lección IEC 03 en LD:
//   MODO_EDICION       ✎ Editar muestra la caja de elementos
//   PLACEHOLDERS       al elegir un contacto aparecen los rombos del editor
//   CONTACTO_NC        un contacto NC antes de la bobina, con variable nueva
//                      PARO AT %IX0.5 declarada en la cabecera VAR
//   PELDANO_TON        peldaño nuevo con contacto, TON (instancia y PT) y bobina
//   (con una rama en paralelo bajo el contacto: MARCHA OR H2)
//   COMENTARIO         el comentario del peldaño se edita en su cabecera
//   BORRAR_DESHACER    Supr borra el elemento y Ctrl+Z lo devuelve
//   BACKPLANE          ⊞ Backplane: alias SENSOR en la bornera I0.6, guardado en
//                      devices/configuration.json (io-mapping) como el editor
//   CONTACTO_ALIAS     un contacto SENSOR queda AT SENSOR y muestra %IX0.6
//   TABLA_VARIABLES    pestaña Variables del panel de abajo: agrega CUENTA :
//                      INT y renombra PARADA → PARO_NC (también en el Ladder)
//   GUARDA_Y_COMPILA   se guarda el .ld en disco y la cadena de OpenPLC lo
//                      compila (ST con NOT(PARO) y el TON)
// Capturas (claro y oscuro) en build/gates/ladder-editor/.
//   cd app && xvfb-run -a node tests/e2e-ladder-editor.mjs
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "ladder-editor");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-ws-"));
const userData = mkdtempSync(join(tmpdir(), "jwsim-ud-"));
const criteria = {};
const errors = [];

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${userData}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WARMUP: "0", JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") } });
const win = await app.firstWindow();
win.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
win.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
await win.setViewportSize?.({ width: 1680, height: 1000 }).catch(() => {});
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
const t = (fn, a) => win.evaluate(fn, a);
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(150);
  }
  return null;
};
const shot = async (name) => {
  await win.screenshot({ path: join(OUT, name) });
};
const body = () => t(() => window.jwsimTest.ldText());
const nodesOf = (text) => JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).rungs.flatMap((r) => r.nodes);
// Rombo a la izquierda del elemento id (misma fila), o el primero si no hay id.
const clickPh = async ({ rung, leftOf, parallel = false, last = false }) => {
  const p = await until(
    () =>
      t(
        ({ rung, leftOf, parallel, last }) => {
          const sec = rung === "last" ? [...document.querySelectorAll("#plc-diagram-body .ld-rung")].pop() : document.querySelectorAll("#plc-diagram-body .ld-rung")[rung];
          const phs = [...sec.querySelectorAll(".ld-ph")].filter((p) => p.classList.contains("ld-ph-par") === parallel);
          if (!phs.length) return null;
          const box = (e) => e.getBoundingClientRect();
          let pick = last ? phs.at(-1) : phs[0];
          if (leftOf) {
            const el = sec.querySelector(leftOf).getBoundingClientRect();
            const row = phs.filter((p) => Math.abs(box(p).top + box(p).height / 2 - (el.top + el.height / 2)) < 12 && box(p).right <= el.left + 2);
            pick = row.sort((a, b) => box(b).left - box(a).left)[0];
          }
          if (!pick) return null;
          const b = box(pick);
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        },
        { rung, leftOf, parallel, last },
      ),
    5000,
  );
  if (!p) throw new Error(`sin placeholder en el peldaño ${rung}`);
  await win.mouse.click(p.x, p.y);
};
const popFill = async (value, extra) => {
  await win.waitForSelector("#ld-pop:not([hidden]) #ld-pop-name");
  await win.fill("#ld-pop-name", value);
  if (extra) await extra();
  await win.click('#ld-pop [data-pop="ok"]');
  await until(() => t(() => document.getElementById("ld-pop").hidden), 2000);
};

try {
  await t(() => window.openLessonById("iec-03", "LD"));
  await until(() => t(() => window.jwsimTest.fileNames().includes("pous/programs/main.ld")), 20000);
  await t(() => document.querySelector("#lesson-card button")?.click());
  await until(() => t(() => !!document.querySelector("#plc-diagram-body .ld-rung")), 10000);
  await t(() => document.querySelector("#theory-collapse, .theory-collapse, [data-collapse='theory']")?.click());

  await win.click("#ld-edit-btn");
  const tb = await until(() => t(() => !document.getElementById("ld-toolbar").hidden && document.querySelectorAll("#ld-toolbar .ld-tool").length), 3000);
  criteria.MODO_EDICION = { pass: tb >= 9, tools: tb };

  // 1) Contacto NC con variable nueva, antes de la bobina del peldaño 1.
  await win.click('#ld-toolbar [data-tool="contact:negated"]');
  const nph = await until(() => t(() => document.querySelectorAll("#plc-diagram-body .ld-ph").length), 5000);
  criteria.PLACEHOLDERS = { pass: nph > 4, placeholders: nph };
  await shot("01-placeholders.png");
  await clickPh({ rung: 0, leftOf: ".ld-coil" });
  await popFill("PARO", () => win.selectOption("#ld-pop-loc", "%IX0.5"));
  const t1 = await body();
  criteria.CONTACTO_NC = {
    pass: /PARO AT %IX0\.5 : BOOL;/.test(t1) && nodesOf(t1).some((n) => n.type === "contact" && n.data.variant === "negated" && n.data.variable?.name === "PARO" && n.data.variable.location === "%IX0.5"),
    declared: /PARO AT %IX0\.5 : BOOL;/.test(t1),
  };

  // 2) Peldaño nuevo: contacto S1 (MARCHA) → TON (T#2s) → bobina H2.
  await win.click('#plc-diagram-body [data-act="add-rung"]');
  await until(() => t(() => document.querySelectorAll("#plc-diagram-body .ld-rung").length >= 2), 3000);
  await win.click('#ld-toolbar [data-tool="contact:default"]');
  await clickPh({ rung: "last" });
  await popFill("MARCHA");
  await win.click('#ld-toolbar [data-tool="block:"]');
  await win.waitForSelector("#ld-pop:not([hidden]) #ld-blk-q");
  await win.fill("#ld-blk-q", "TON");
  await win.click('#ld-pop [data-block$="/TON"]');
  await clickPh({ rung: "last", last: true });
  await popFill("RETARDO");
  // PT del TON.
  const pt = await t(() => {
    const sec = [...document.querySelectorAll("#plc-diagram-body .ld-rung")].pop();
    // PT: el pin de entrada (a la izquierda del bloque).
    const v = [...sec.querySelectorAll(".ld-pinvar")].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
    const b = v.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await win.mouse.click(pt.x, pt.y);
  await popFill("T#2s");
  await win.click('#ld-toolbar [data-tool="coil:default"]');
  await clickPh({ rung: "last", last: true });
  await popFill("H2");
  // Rama en paralelo bajo MARCHA (rombo de abajo): MARCHA OR H2.
  await win.click('#ld-toolbar [data-tool="contact:default"]');
  await clickPh({ rung: "last", parallel: true });
  await popFill("H2");
  const t2 = await body();
  criteria.PELDANO_TON = {
    pass: /RETARDO : TON;/.test(t2) && /"name": "T#2s"/.test(t2) && (t2.match(/"type": "block"/g) ?? []).length >= 1,
    instance: /RETARDO : TON;/.test(t2),
  };

  // 3) Comentario del peldaño nuevo.
  await t(() => [...document.querySelectorAll('#plc-diagram-body [data-act="comment"]')].pop().click());
  await win.waitForSelector(".ld-cmt-input");
  await win.fill(".ld-cmt-input", "Retardo de 2 s para el piloto");
  await win.keyboard.press("Enter");
  criteria.COMENTARIO = { pass: /"comment": "Retardo de 2 s para el piloto"/.test(await body()) };
  await t(() => document.activeElement?.blur());
  await shot("02-editado-claro.png");

  // 4) Borrar el contacto NC y deshacer.
  const before = await body();
  await t(() => {
    const el = document.querySelector('#plc-diagram-body .ld-contact[data-var="PARO"]');
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await win.keyboard.press("Delete");
  await until(async () => !/"name": "PARO"/.test((await body()).split("END_VAR")[1]), 3000);
  const gone = !/"name": "PARO"/.test((await body()).split("END_VAR")[1]);
  await win.keyboard.press("Control+z");
  await win.waitForTimeout(300);
  criteria.BORRAR_DESHACER = { pass: gone && (await body()) === before, gone };

  // Oscuro.
  await t(() => window.jwsimTest.setTheme("dark"));
  await win.waitForTimeout(300);
  await t(() => {
    const el = document.querySelector('#plc-diagram-body .ld-contact[data-var="PARO"]');
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await win.waitForTimeout(200);
  await shot("03-propiedades-oscuro.png");
  await win.keyboard.press("Escape");
  await t(() => window.jwsimTest.setTheme("light"));

  // 5) Backplane: alias de la bornera I0.6 y un contacto que lo usa.
  await win.click("#ld-bp-btn");
  await win.waitForSelector('#ld-bp:not([hidden]) input[data-ch="I0_6"]');
  await win.fill('#ld-bp input[data-ch="I0_6"]', "SENSOR");
  await shot("05-backplane.png");
  await win.click("#ld-bp-save");
  await until(() => t(() => document.getElementById("ld-bp").hidden), 3000);
  const dir0 = await t(() => window.jwsimTest.sketchDir());
  const cfg = JSON.parse(readFileSync(join(dir0, "devices", "configuration.json"), "utf8"));
  const ent = cfg.vendorScreenData?.["io-mapping"]?.entries ?? [];
  criteria.BACKPLANE = {
    pass: ent.length === 16 && ent.some((e) => e.channelName === "I0_6" && e.alias === "SENSOR" && e.iecAddress === "%IX0.6" && e.moduleId === "jwplc-basic-controller") && cfg.deviceBoard === "JWPLC BASIC [2.0.0]",
    entries: ent.length,
  };
  await win.click('#ld-toolbar [data-tool="contact:default"]');
  await clickPh({ rung: 0, leftOf: ".ld-coil" });
  await popFill("SENSOR");
  const t3 = await body();
  const addr = await t(() => [...document.querySelectorAll('#plc-diagram-body .ld-addr')].map((e) => e.lastChild.textContent));
  criteria.CONTACTO_ALIAS = { pass: /SENSOR AT SENSOR : BOOL;/.test(t3) && addr.includes("%IX0.6") && addr.includes("%IX0.5"), addr };
  await shot("06-alias-direcciones.png");

  // 6) Tabla de variables (pestaña del panel de abajo).
  await win.click("#tab-ldvars");
  await win.waitForSelector("#ld-vars:not([hidden]) table.ld-vt");
  const rows0 = await t(() => document.querySelectorAll("#ld-vars tr[data-name]").length);
  await win.click('#ld-vars [data-act="add-var"]');
  await win.waitForTimeout(200);
  await win.keyboard.type("CUENTA");
  await win.keyboard.press("Enter");
  await win.waitForTimeout(200);
  const typeIn = '#ld-vars tr[data-name="CUENTA"] [data-f="type"]';
  await win.fill(typeIn, "INT");
  await win.press(typeIn, "Enter");
  await win.waitForTimeout(200);
  const ren = '#ld-vars tr[data-name="PARADA"] [data-f="name"]';
  await win.fill(ren, "PARO_NC");
  await win.press(ren, "Enter");
  await win.waitForTimeout(300);
  const t4 = await body();
  const rows1 = await t(() => document.querySelectorAll("#ld-vars tr[data-name]").length);
  criteria.TABLA_VARIABLES = {
    pass: rows1 === rows0 + 1 && /CUENTA : INT;/.test(t4) && /PARO_NC AT %IX0\.1 : BOOL;/.test(t4) && nodesOf(t4).some((n) => n.data?.variable?.name === "PARO_NC") && !nodesOf(t4).some((n) => n.data?.variable?.name === "PARADA"),
    rows0,
    rows1,
  };
  await shot("07-tabla-variables.png");

  // 7) Guardar y compilar con la cadena del OpenPLC Editor.
  await win.click("#ld-edit-btn");
  await win.click("#btn-run");
  const ran = await until(() => t(() => ["running", "error", "idle"].includes(window.jwsimTest.status()) && window.jwsimTest.status()), 300000);
  const dir = await t(() => window.jwsimTest.sketchDir());
  const disk = readFileSync(join(dir, "pous", "programs", "main.ld"), "utf8");
  const { generateOpenPlcSketch } = await import(join(ROOT, "cli", "lib", "openplc.mjs"));
  const g = await generateOpenPlcSketch(dir, mkdtempSync(join(tmpdir(), "jwsim-ld-st-")), { log: () => {} });
  const st = g.programSt;
  criteria.GUARDA_Y_COMPILA = {
    pass: ran === "running" && disk === (await body()) && /NOT\(PARO\)/.test(st) && /PARO_NC/.test(st.split("END_VAR").pop()) && /SENSOR/.test(st.split("END_VAR").pop()) && /RETARDO\(IN := \(?(MARCHA OR H2|H2 OR MARCHA)\)?, PT := T#2s\)/.test(st) && /H2 := RETARDO\.Q/.test(st),
    status: ran,
    st: st.split("\n").filter((l) => /:=|RETARDO/.test(l)).slice(0, 8),
  };
  await win.waitForTimeout(800);
  await shot("04-en-vivo.png");
  await win.click("#btn-stop");
} catch (err) {
  errors.push(String(err.stack ?? err));
  await shot("error.png").catch(() => {});
}
criteria.SIN_ERRORES = { pass: errors.length === 0, errors };
await app.close();
let ok = true;
for (const [k, v] of Object.entries(criteria)) {
  ok &&= v.pass;
  console.log(`${v.pass ? "OK  " : "FALLA"}  ${k} ${JSON.stringify(v)}`);
}
console.log(`JWSIM_LADDER_EDITOR_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
