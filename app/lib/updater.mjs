// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Actualización desde el propio programa (electron-updater), como el OpenPLC
// Editor. Lee las Releases de GitHub de JW-Control/jwplc-sim: el workflow
// dist-windows adjunta a cada Release el instalador, latest.yml y el
// .blockmap (con él solo se bajan las partes del instalador que cambiaron).
//
// Canales: «Estable» solo ve Releases normales; «Pruebas» ve también las
// pre-releases (versiones con guion: 0.6.0-alpha.1). La preferencia se guarda
// en la configuración de la app (updateChannel).
//
// Solo actúa en la app instalada en Windows. El portable (.zip), la copia del
// repositorio (JWPLC Sim.bat) y Linux no se actualizan solos.
// JWSIM_UPDATES=0 lo apaga. JWSIM_UPDATE_FEED=<url> usa un servidor propio
// (proveedor «generic», para pruebas) en lugar de GitHub.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

const CHECK_DELAY_MS = 8000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * @param {object} o
 * @param {import("electron").App} o.app
 * @param {import("electron").Dialog} o.dialog
 * @param {() => import("electron").BrowserWindow | null} o.window
 * @param {(channel: string, payload: unknown) => void} o.forward
 * @param {(key: string) => unknown} o.readPref
 * @param {(key: string, value: unknown) => void} o.writePref
 * @param {boolean} o.portable
 * @param {() => Promise<void> | void} [o.beforeInstall]
 */
export function createUpdater({ app, dialog, window, forward, readPref, writePref, portable, beforeInstall }) {
  const feed = process.env.JWSIM_UPDATE_FEED;
  const why =
    process.env.JWSIM_UPDATES === "0"
      ? "las actualizaciones están desactivadas (JWSIM_UPDATES=0)."
      : !app.isPackaged && !feed
        ? "esta copia corre desde el repositorio (JWPLC Sim.bat): se actualiza con git pull."
        : portable
          ? "la versión portable (.zip) no se actualiza sola: descargue la nueva desde la página de Releases."
          : process.platform !== "win32" && !feed
            ? "la actualización automática es solo para la versión instalada en Windows."
            : null;

  /** @type {{state: string, version?: string, percent?: number, message?: string}} */
  let status = { state: why ? "off" : "idle" };
  const set = (s) => {
    status = s;
    forward("update:state", { ...s, current: app.getVersion() });
  };

  const channel = () => (readPref("updateChannel") === "pruebas" ? "pruebas" : "estable");
  let updater = null;
  let manual = false;

  function load() {
    if (updater || why) return updater;
    const { autoUpdater } = require("electron-updater");
    updater = autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.logger = { info: () => {}, warn: (m) => console.warn(`[update] ${m}`), error: (m) => console.error(`[update] ${m}`), debug: () => {} };
    if (feed) {
      updater.forceDevUpdateConfig = true;
      updater.setFeedURL({ provider: "generic", url: feed });
      // Sin empaquetar no hay app-update.yml: la descarga lo lee para saber
      // su carpeta de caché.
      if (!app.isPackaged) {
        const cfg = join(app.getPath("userData"), "dev-app-update.yml");
        writeFileSync(cfg, `provider: generic\nurl: ${feed}\nupdaterCacheDirName: jwplc-sim-updater-prueba\n`);
        updater.updateConfigPath = cfg;
      }
    }
    applyChannel();
    updater.on("checking-for-update", () => set({ state: "checking" }));
    updater.on("update-not-available", () => {
      set({ state: "none" });
      if (manual) info("JWPLC Sim está al día", `Tiene la versión más reciente (${app.getVersion()}, canal ${channel()}).`);
      manual = false;
    });
    updater.on("update-available", (i) => set({ state: "available", version: i.version }));
    updater.on("download-progress", (p) => set({ state: "downloading", version: status.version, percent: Math.round(p.percent) }));
    updater.on("update-downloaded", (i) => {
      set({ state: "ready", version: i.version });
      manual = false;
    });
    updater.on("error", (err) => {
      const message = String(err?.message ?? err).split("\n")[0];
      set({ state: "error", message });
      if (manual) info("No se pudo buscar actualizaciones", `${message}\n\nRevise la conexión a internet e intente de nuevo más tarde.`, "warning");
      manual = false;
    });
    return updater;
  }

  function applyChannel() {
    if (!updater) return;
    updater.allowPrerelease = channel() === "pruebas";
  }

  function info(title, detail, type = "info") {
    const w = window();
    const opts = { type, title, message: title, detail, buttons: ["Aceptar"] };
    return w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts);
  }

  async function check(isManual = false) {
    if (why) {
      if (isManual) await info("Actualizaciones", `No disponible: ${why}`);
      return status;
    }
    const u = load();
    if (status.state === "ready") {
      if (isManual) await install();
      return status;
    }
    if (status.state === "downloading" || status.state === "checking") return status;
    manual = isManual;
    try {
      await u.checkForUpdates();
    } catch {
      // El evento «error» ya avisó.
    }
    return status;
  }

  async function install() {
    if (status.state !== "ready" || !updater) return false;
    const w = window();
    const opts = {
      type: "question",
      title: "Instalar actualización",
      message: `Instalar JWPLC Sim ${status.version}`,
      detail: "JWPLC Sim se cerrará, se instalará la nueva versión y se volverá a abrir. Guarde su proyecto antes de seguir: lo que no esté guardado se pierde.\n\nSus proyectos y su avance en el curso se conservan.",
      buttons: ["Reiniciar e instalar", "Después"],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts);
    if (response !== 0) return false;
    await beforeInstall?.();
    // Silencioso y vuelve a abrir la app al terminar.
    setImmediate(() => updater.quitAndInstall(true, true));
    return true;
  }

  function setChannel(value) {
    writePref("updateChannel", value === "pruebas" ? "pruebas" : "estable");
    applyChannel();
    if (!why) check(false);
  }

  function start() {
    if (why) {
      set(status);
      return;
    }
    setTimeout(() => check(false), CHECK_DELAY_MS).unref?.();
    setInterval(() => check(false), CHECK_EVERY_MS).unref?.();
  }

  return {
    start,
    check,
    install,
    setChannel,
    channel,
    get status() {
      return { ...status, current: app.getVersion(), channel: channel(), why };
    },
  };
}
