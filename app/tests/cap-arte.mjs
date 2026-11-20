import { mkdtempSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
const OUT = process.env.CAP_OUT ?? join(ROOT, "build", "cap-arte");
mkdirSync(OUT, { recursive: true });
createRequire(import.meta.url)("electron");
const env = { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "ws-")), JWSIM_HOME: join(ROOT, ".jwsim") };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ud-"))}`], env });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000));
const t = (fn, ...a) => win.evaluate(fn, ...a);
const list = process.argv.slice(2);
const logs = [];
win.on("console", (m) => { if (/símbolo|plantilla|contrato|svg/i.test(m.text())) logs.push(m.text()); });
try {
  await win.waitForSelector(".monaco-editor .view-lines", { timeout: 60000 });
  await win.waitForTimeout(1500);
  for (const which of list) {
    if (which.startsWith("arch:")) await t((id) => window.jwsimTest.pickArch(id), which.slice(5));
    else await t((id) => window.jwsimTest.pickExercise(id), which);
    await win.waitForTimeout(2500);
    await t(() => window.JwsimTabs.select("schematic"));
    await win.waitForTimeout(1500);
    await win.screenshot({ path: join(OUT, `${which.replace(":", "-")}.png`) });
    console.log("ok", which);
  }
} catch (e) { console.error(e); await win.screenshot({ path: join(OUT, `error.png`) }); }
finally { console.log("consola:", logs.slice(0, 20)); await app.close(); }
