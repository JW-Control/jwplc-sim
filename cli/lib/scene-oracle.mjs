// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Oráculo visual con Electron + Playwright (PROPUESTA_AGENTES_JSON.md §4.5):
// abre el .jwsim en la app real, verifica JwsimSymbols.warnings === 0,
// inspecciona rutas de cables y exporta PNG de Esquema 2D y Planta 3D.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { ROOT } from "./build.mjs";

const APP_DIR = join(ROOT, "app");

function loadPlaywright() {
  try {
    const req = createRequire(join(APP_DIR, "package.json"));
    req("electron");
    return req("playwright");
  } catch (err) {
    const e = new Error(`para usar scene preview instala playwright y electron en app/: ${err.message}`);
    e.code = "MISSING_ORACLE_ENV";
    throw e;
  }
}

/**
 * Abre `<projectFile>` en Electron headless y captura 2D/3D + diagnóstico SVG.
 * @param {string} projectFile
 * @param {{ outDir?: string, view?: "2d" | "3d" | "both", smokeMs?: number }} [options]
 */
export async function previewSceneProject(projectFile, { outDir, view = "both", smokeMs = 0 } = {}) {
  const absFile = resolve(projectFile);
  const { _electron: electron } = loadPlaywright();
  const targetDir = resolve(outDir ?? join(ROOT, "build", "preview"));
  mkdirSync(targetDir, { recursive: true });

  const wsDir = mkdtempSync(join(tmpdir(), "jwsim-oracle-ws-"));
  const udDir = mkdtempSync(join(tmpdir(), "jwsim-oracle-ud-"));
  const env = { ...process.env, JWSIM_WORKSPACE: wsDir, JWSIM_HOME: join(ROOT, ".jwsim") };
  delete env.ELECTRON_RUN_AS_NODE;

  const consoleWarnings = [];
  const app = await electron.launch({ args: [APP_DIR, `--user-data-dir=${udDir}`], env });
  try {
    const win = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 960));
    win.on("console", (m) => {
      if (/símbolo|plantilla|contrato|parsererror/i.test(m.text())) consoleWarnings.push(m.text());
    });

    await win.waitForSelector(".monaco-editor .view-lines", { timeout: 45000 });
    await win.waitForFunction(() => window.JwsimSymbols && window.JwsimSymbols.templates.size > 0, null, { timeout: 30000 });
    await win.evaluate((f) => window.jwsimTest.openProjectFile(f), absFile);
    await win.waitForFunction(
      () => {
        const spec = window.jwsimTest?.scene?.spec?.();
        const devs = spec?.devices?.length ?? 0;
        return document.querySelectorAll("#scene-devices .dev").length >= devs;
      },
      null,
      { timeout: 15000 },
    ).catch(() => {});

    const screenshots = {};
    if (view === "2d" || view === "both") {
      await win.evaluate(() => window.JwsimTabs.select("schematic"));
      await win.click("#scene-fit").catch(() => {});
      await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await win.waitForTimeout(300);
      const p2d = join(targetDir, "schematic-2d.png");
      await win.screenshot({ path: p2d });
      screenshots.schematic = p2d;
    }

    const diag = await win.evaluate(() => ({
      warnings: [...(window.JwsimSymbols?.warnings ?? [])],
      routes: window.jwsimTest?.scene?.routes?.() ?? [],
      sceneErrors: [...document.querySelectorAll("#scene-diag li.bad")].map((li) => li.textContent.trim()).filter(Boolean),
    }));

    if (view === "3d" || view === "both") {
      await win.evaluate(() => window.JwsimTabs.select("plant"));
      await win.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
          ),
      );
      await win.waitForTimeout(500);
      const p3d = join(targetDir, "plant-3d.png");
      await win.screenshot({ path: p3d });
      screenshots.plant3d = p3d;
    }

    let smoke;
    if (Number.isFinite(smokeMs) && smokeMs > 0) {
      await win.click("#btn-run");
      let sawTransition = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const st = await win.evaluate(() => window.jwsimTest.status());
        if (st === "building") sawTransition = true;
        else if (st === "running" || st === "paused" || st === "error" || (sawTransition && st !== "building")) break;
        await win.waitForTimeout(100);
      }
      await win.waitForTimeout(smokeMs);
      const finalStatus = await win.evaluate(() => window.jwsimTest.status());
      await win.click("#btn-stop").catch(() => {});
      smoke = {
        status: finalStatus,
        ran: finalStatus === "running" || finalStatus === "paused",
      };
    }

    const allWarnings = [...new Set([...diag.warnings, ...consoleWarnings])];
    const unrouted = diag.routes.filter((r) => r.routed === false);
    const ok = allWarnings.length === 0 && diag.sceneErrors.length === 0 && unrouted.length === 0 && (!smoke || smoke.ran);
    return {
      ok,
      file: absFile,
      warnings: allWarnings,
      sceneErrors: diag.sceneErrors,
      unrouted,
      routes: diag.routes,
      screenshots,
      ...(smoke ? { smoke } : {}),
    };
  } finally {
    await app.close();
    rmSync(wsDir, { recursive: true, force: true });
    rmSync(udDir, { recursive: true, force: true });
  }
}
