// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del diagrama de estados neumático y las dos barras laterales
// ajustables (tipo Altium) con el ejercicio 10 y el ejercicio 1.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = join(ROOT, "build", "gates", "state-diagram");
mkdirSync(OUT, { recursive: true });
const workspace = mkdtempSync(join(tmpdir(), "jwsim-sd-ws-"));
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

const dir10 = join(workspace, "10-secuencia-neumatica");
cpSync(join(ROOT, "JWPLC_Aprende", "extras", "retos", "10-secuencia-neumatica"), dir10, { recursive: true });
cpSync(join(dir10, "solucion", "secuencia_neumatica"), join(dir10, "sketch", "secuencia_neumatica"), { recursive: true });

const dir01 = join(workspace, "01-marcha-parada");
cpSync(join(ROOT, "JWPLC_Aprende", "extras", "retos", "01-marcha-parada"), dir01, { recursive: true });

createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: workspace, JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const userData = mkdtempSync(join(tmpdir(), "jwsim-sd-ud-"));
const app = await electron.launch({ args: [APP, `--user-data-dir=${userData}`], env });
const win = await app.firstWindow();
const t = (fn, ...a) => win.evaluate(fn, ...a);
const sleep = (ms) => win.waitForTimeout(ms);

try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await t((f) => window.jwsimTest.openProjectFile(f), join(dir10, "10-secuencia-neumatica.jwsim"));
  await sleep(1500);
  await t(() => window.JwsimTabs.select("schematic"));
  await sleep(600);

  // 1. Toggle en barra izquierda: arranca colapsado y se abre tanto en «A colores» como en «Neumático».
  const initLeft = await t(() => ({
    disabled: document.getElementById("scene-tab-states").disabled,
    collapsed: document.querySelector(".scene-main").classList.contains("left-collapsed"),
    leftW: document.getElementById("scene-left").getBoundingClientRect().width,
  }));
  await win.click("#scene-tab-states");
  await sleep(350);
  const inColor = await t(() => {
    const c = document.getElementById("sd-canvas");
    const px = c.getContext("2d").getImageData(2, 12, 1, 1).data;
    return {
      open: !document.querySelector(".scene-main").classList.contains("left-collapsed"),
      leftW: Math.round(document.getElementById("scene-left").getBoundingClientRect().width),
      colorVisible: document.getElementById("scene-pan").getBoundingClientRect().width > 200,
      sideOpen: document.getElementById("scene-side").getBoundingClientRect().width > 200,
      idleReadout: document.getElementById("sd-readout").textContent,
      visibleIds: window.JwsimStateDiag.debug().visibleIds,
      bgNotBlack: px[0] > 10 || px[1] > 10 || px[2] > 10,
    };
  });
  await win.screenshot({ path: join(OUT, "reposo-sin-correr.png") });
  await win.click("#schem-pneu");
  await sleep(350);
  const inPneu = await t(() => ({
    open: !document.querySelector(".scene-main").classList.contains("left-collapsed"),
    pneuVisible: !document.getElementById("pn-view").hidden && document.querySelectorAll("#pn-root .pn-cyl").length === 4,
    canvasW: Math.round(document.getElementById("sd-canvas").getBoundingClientRect().width),
  }));
  criteria.TOGGLE_BOTH_VIEWS = {
    ok: !initLeft.disabled && initLeft.collapsed && initLeft.leftW === 0 &&
      inColor.open && inColor.leftW > 300 && inColor.colorVisible && inColor.sideOpen &&
      inColor.bgNotBlack && /En reposo/.test(inColor.idleReadout) && inColor.visibleIds.length >= 16 &&
      inPneu.open && inPneu.pneuVisible && inPneu.canvasW > 300,
    initLeft, inColor, inPneu,
  };
  log(`TOGGLE_BOTH_VIEWS ${JSON.stringify(criteria.TOGGLE_BOTH_VIEWS)}`);

  // 2. Ambos divisores redimensionan EN VIVO durante el arrastre y persisten en localStorage.
  const lBox = await win.$eval("#scene-left-splitter", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await win.mouse.move(lBox.x, lBox.y);
  await win.mouse.down();
  await win.mouse.move(lBox.x + 80, lBox.y, { steps: 6 });
  const liveLeftW = await t(() => Math.round(document.getElementById("scene-left").getBoundingClientRect().width));
  await win.mouse.up();
  await sleep(200);
  const rBox = await win.$eval("#scene-side-splitter", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await win.mouse.move(rBox.x, rBox.y);
  await win.mouse.down();
  await win.mouse.move(rBox.x - 60, rBox.y, { steps: 6 });
  const liveRightW = await t(() => Math.round(document.getElementById("scene-side").getBoundingClientRect().width));
  await win.mouse.up();
  await sleep(200);
  const resized = await t(() => {
    const fl = document.querySelector(".scene-float").getBoundingClientRect();
    const st = document.querySelector(".scene-stage").getBoundingClientRect();
    return {
      liveLeftW: undefined,
      leftW: Math.round(document.getElementById("scene-left").getBoundingClientRect().width),
      rightW: Math.round(document.getElementById("scene-side").getBoundingClientRect().width),
      storedLeft: Number(localStorage.getItem("jwsim.sceneLeftW")),
      storedRight: Number(localStorage.getItem("jwsim.sceneSideW")),
      stageW: Math.round(st.width),
      floatInsideStage: fl.left >= st.left - 1 && fl.right <= st.right + 1,
    };
  });
  criteria.RESIZE_BOTH_SIDES = {
    ok: liveLeftW > inColor.leftW + 50 && liveRightW >= 380 &&
      resized.leftW > inColor.leftW + 50 && resized.storedLeft === resized.leftW &&
      resized.rightW >= 380 && resized.storedRight === resized.rightW &&
      resized.stageW >= 260 && resized.floatInsideStage,
    liveLeftW, liveRightW, resized,
  };
  log(`RESIZE_BOTH_SIDES ${JSON.stringify(criteria.RESIZE_BOTH_SIDES)}`);

  // Restablecer anchos con doble clic y comprobar límite de .scene-stage >= 260 px en ventana estrecha.
  await win.dblclick("#scene-left-splitter");
  await win.dblclick("#scene-side-splitter");
  await sleep(200);
  await win.setViewportSize({ width: 960, height: 700 });
  await sleep(250);
  const narrowStageW = await t(() => Math.round(document.querySelector(".scene-stage").getBoundingClientRect().width));
  await win.setViewportSize({ width: 1280, height: 720 });
  await sleep(250);
  criteria.NARROW_CLAMP = { ok: narrowStageW >= 260, narrowStageW };
  log(`NARROW_CLAMP ${JSON.stringify(criteria.NARROW_CLAMP)}`);

  // 3. Muestreo en segundo plano con el panel cerrado y desde Programa, luego abrir y verificar.
  await win.click("#scene-tab-states"); // cerrar izquierda
  await sleep(200);
  await t(() => window.JwsimTabs.select("program"));
  await sleep(200);
  await win.click("#btn-run");
  await win.waitForFunction(() => /Ejecutando/.test(document.body.innerText), null, { timeout: 120000 });
  await sleep(1800);
  await t(() => pressKey("BTN_OK", true));
  await sleep(200);
  await t(() => pressKey("BTN_OK", false));
  await sleep(2200);
  await t(() => window.JwsimTabs.select("schematic"));
  await sleep(300);
  await win.click("#scene-tab-states"); // reabrir izquierda para ver historial acumulado
  await sleep(300);
  await win.click("#schem-pneu");
  await sleep(300);
  const runningState = await t(() => ({
    dbg: window.JwsimStateDiag.debug(),
    readout: document.getElementById("sd-readout").textContent,
  }));
  await win.screenshot({ path: join(OUT, "neumatico-con-diagrama.png") });

  await win.click("#schem-color");
  await sleep(400);
  await win.screenshot({ path: join(OUT, "colores-con-diagrama.png") });

  const beforeStop = await t(() => window.JwsimStateDiag.debug());
  await win.click("#btn-stop");
  await win.waitForFunction(() => /Detenido/.test(document.getElementById("status")?.textContent ?? ""), null, { timeout: 10000 });
  await sleep(400);
  const afterStop = await t(() => window.JwsimStateDiag.debug());
  criteria.LIVE_AND_KEEP_ON_STOP = {
    ok: runningState.dbg.samples >= 10 &&
      runningState.dbg.visibleIds.includes("Y1.position") &&
      runningState.dbg.visibleIds.includes("Y4.position") &&
      !/Sin datos/.test(runningState.readout) &&
      afterStop.samples >= beforeStop.samples &&
      afterStop.lastMs >= beforeStop.lastMs,
    runningSamples: runningState.dbg.samples,
    beforeStopSamples: beforeStop.samples,
    afterStopSamples: afterStop.samples,
    readout: runningState.readout,
  };
  log(`LIVE_AND_KEEP_ON_STOP ${JSON.stringify(criteria.LIVE_AND_KEEP_ON_STOP)}`);

  // 4. Filtro + Señales, chips directos, botón × por pista, drag & drop desde el plano, congelado y Limpiar.
  await win.click("#sd-signals-btn");
  await sleep(150);
  await win.click('#sd-popover [data-preset="cyl"]');
  await sleep(150);
  const onlyCyl = await t(() => window.JwsimStateDiag.debug());
  const distinctColors = new Set(onlyCyl.trackColors.map((x) => x.color)).size;

  await win.selectOption("#sd-width", "3.2");
  await sleep(100);
  const thickWidth = await t(() => window.JwsimStateDiag.debug().lineWidth);

  // Chip directo "Bobinas": un clic activa las 4 bobinas (total 8 pistas), otro clic las oculta (vuelve a 4).
  await win.click('#sd-chips [data-kind-chip="coil"]');
  await sleep(150);
  const withCoils = await t(() => window.JwsimStateDiag.debug().visibleIds.length);
  await win.click('#sd-chips [data-kind-chip="coil"]');
  await sleep(150);

  // Clic en el botón × de la primera pista (Y1.position) en la columna izquierda (x=101 = LABEL_W 116 − 15, y=20).
  const cRect = await win.$eval("#sd-canvas", (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await win.mouse.move(cRect.x + 101, cRect.y + 20);
  await win.mouse.click(cRect.x + 101, cRect.y + 20);
  await sleep(150);
  const afterCloseX = await t(() => window.JwsimStateDiag.debug().visibleIds);

  // Arrastrar Y1 desde el esquema hacia #state-diag-pane lo vuelve a agregar sin mover Y1 en el esquema.
  await win.click("#scene-fit");
  await sleep(200);
  const dragPts = await t(() => {
    const y1Dev = window.jwsimTest.scene.spec().devices.find((d) => d.id === "Y1");
    const hit = document.querySelector('#scene-devices > g[data-id="Y1"] .dev-hit');
    const hr = hit.getBoundingClientRect();
    const pr = document.getElementById("state-diag-pane").getBoundingClientRect();
    return {
      x0: y1Dev.x,
      y0: y1Dev.y,
      fromX: hr.left + hr.width / 2,
      fromY: hr.top + hr.height / 2,
      toX: pr.left + pr.width / 2,
      toY: pr.top + pr.height / 2,
    };
  });
  await win.mouse.move(dragPts.fromX, dragPts.fromY);
  await win.mouse.down();
  await win.mouse.move(dragPts.toX, dragPts.toY, { steps: 8 });
  const dropTargetActive = await t(() => document.getElementById("state-diag-pane").classList.contains("sd-drop-target"));
  await win.mouse.up();
  await sleep(200);
  const stylePopOpenOnDrop = await t(() => !document.getElementById("sd-style-pop").hidden);
  await win.click('#sd-style-pop [data-sw-color="#e11d48"]');
  await sleep(100);
  const afterDrop = await t(() => {
    const y1Dev = window.jwsimTest.scene.spec().devices.find((d) => d.id === "Y1");
    const dbg = window.JwsimStateDiag.debug();
    return {
      visibleIds: dbg.visibleIds,
      y1Color: dbg.trackColors.find((x) => x.id === "Y1.position")?.color,
      y1X: y1Dev.x,
      y1Y: y1Dev.y,
    };
  });

  await win.click("#sd-freeze");
  await sleep(150);
  const frozen = await t(() => window.JwsimStateDiag.debug().frozen);
  await win.click("#sd-clear");
  await sleep(150);
  const cleared = await t(() => window.JwsimStateDiag.debug());
  criteria.CONTROLS = {
    ok: onlyCyl.visibleIds.length === 4 &&
      distinctColors === 4 &&
      thickWidth === 3.2 &&
      withCoils === 8 &&
      afterCloseX.length === 3 && !afterCloseX.includes("Y1.position") &&
      dropTargetActive &&
      stylePopOpenOnDrop &&
      afterDrop.visibleIds.includes("Y1.position") &&
      afterDrop.y1Color === "#e11d48" &&
      afterDrop.y1X === dragPts.x0 && afterDrop.y1Y === dragPts.y0 &&
      frozen === true && cleared.samples === 0 && cleared.frozen === false,
    onlyCyl: onlyCyl.visibleIds, distinctColors, thickWidth, withCoils, afterCloseX, dropTargetActive, stylePopOpenOnDrop, afterDrop, frozen, cleared,
  };
  log(`CONTROLS ${JSON.stringify(criteria.CONTROLS)}`);

  // 5. Proyecto sin neumática: deshabilita botón y colapsa sin borrar preferencia "states".
  await t((f) => window.jwsimTest.openProjectFile(f), join(dir01, "01-marcha-parada.jwsim"));
  await sleep(1000);
  const noPneu = await t(() => ({
    disabled: document.getElementById("scene-tab-states").disabled,
    collapsed: document.querySelector(".scene-main").classList.contains("left-collapsed"),
    pref: localStorage.getItem("jwsim.sceneLeftPane"),
  }));
  await t((f) => window.jwsimTest.openProjectFile(f), join(dir10, "10-secuencia-neumatica.jwsim"));
  await sleep(1000);
  const restored = await t(() => ({
    disabled: document.getElementById("scene-tab-states").disabled,
    collapsed: document.querySelector(".scene-main").classList.contains("left-collapsed"),
  }));
  criteria.NON_PNEUMATIC_PRESERVES_PREF = {
    ok: noPneu.disabled && noPneu.collapsed && noPneu.pref === "states" && !restored.disabled && !restored.collapsed,
    noPneu, restored,
  };
  log(`NON_PNEUMATIC_PRESERVES_PREF ${JSON.stringify(criteria.NON_PNEUMATIC_PRESERVES_PREF)}`);
} catch (e) {
  criteria.ERROR = { ok: false, error: String(e?.stack ?? e) };
  log(`ERROR ${e}`);
} finally {
  await app.close();
}

const ok = ["TOGGLE_BOTH_VIEWS", "RESIZE_BOTH_SIDES", "NARROW_CLAMP", "LIVE_AND_KEEP_ON_STOP", "CONTROLS", "NON_PNEUMATIC_PRESERVES_PREF"]
  .every((k) => criteria[k]?.ok);
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
writeFileSync(join(ROOT, "build", "gates", "JWSIM_STATE_DIAGRAM_E2E.json"), JSON.stringify({ ok, criteria }, null, 2));
console.log(`JWSIM_STATE_DIAGRAM_E2E=${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
