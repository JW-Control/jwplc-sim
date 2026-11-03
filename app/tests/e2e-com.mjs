// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba E2E del puerto COM virtual (Linux, con un par de pty en lugar de
// com0com):
//   COM_RS485  02.RS485_Echo con el RS-485 unido al pty: los bytes que manda
//              el programa externo (incluidos 0x00 y 0xFF) vuelven por el
//              mismo puerto y la consola los muestra
//   COM_USB    el USB (UART0) unido al pty: el programa externo recibe el
//              saludo del sketch
// Informe en build/gates/JWSIM_COM_E2E.json.
// En Linux sin pantalla: xvfb-run -a node app/tests/e2e-com.mjs
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { _electron as electron } from "playwright";

import { resolvePackageRoot } from "../../scripts/fetch-package.mjs";

const APP = resolve(import.meta.dirname, "..");
const ROOT = resolve(APP, "..");
mkdirSync(join(ROOT, "build", "gates"), { recursive: true });
const criteria = {};
const log = (m) => console.log(`[e2e] ${m}`);

// Par de pty: el Sim abre el esclavo; la prueba lee/escribe el maestro.
const pty = spawn("python3", [join(APP, "tests", "helpers", "pty-pair.py")], { stdio: ["pipe", "pipe", "inherit"] });
let ptyPath = null;
let received = Buffer.alloc(0);
createInterface({ input: pty.stdout }).on("line", (l) => {
  if (l.startsWith("PTY ")) ptyPath = l.slice(4);
  else if (l.startsWith("R ")) received = Buffer.concat([received, Buffer.from(l.slice(2), "hex")]);
});
const ptyWrite = (buf) => pty.stdin.write(`W ${Buffer.from(buf).toString("hex")}\n`);

const { root, lock } = resolvePackageRoot();
const examples = join(root, lock.JWPLC_PACKAGE_TREE, "libraries");

createRequire(import.meta.url)("electron");
const args = [APP, `--user-data-dir=${mkdtempSync(join(tmpdir(), "jwsim-ud-"))}`];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, env: { ...process.env, JWSIM_WORKSPACE: mkdtempSync(join(tmpdir(), "jwsim-ws-")) } });
const win = await app.firstWindow();
await win.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });
const t = (fn, ...a) => win.evaluate(fn, ...a);
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await win.waitForTimeout(50);
  }
  return null;
};
const status = () => t(() => window.jwsimTest.status());
const consoleText = () => win.$eval("#console", (e) => e.textContent);
await until(() => ptyPath, 5000);

await t((dir) => window.jwsimTest.openSketchDir(dir), join(examples, "JWPLC_RS485", "examples", "02.RS485_Echo"));
await win.waitForSelector(".tab.active:has-text('02.RS485_Echo.ino')", { timeout: 10000 });

// ---- RS-485: eco binario
log(`COM_RS485 (${ptyPath})`);
const c1 = await t(([p]) => window.jwsimTest.comConnect(p, 2), [ptyPath]);
await win.click("#btn-run");
await until(async () => (await status()) === "running", 600000);
await until(async () => /RS485 echo/.test(await consoleText()), 15000);
const sent = Buffer.from([0x00, 0xff, 0x41, 0x0a, 0x7e]);
received = Buffer.alloc(0);
ptyWrite(sent);
const echoed = await until(() => received.length >= sent.length && received, 5000);
const btnText = await win.$eval("#btn-com", (e) => e.textContent);
await win.click("#btn-stop");
await win.waitForTimeout(500);
criteria.COM_RS485 = {
  pass: !c1.error && !!echoed && echoed.subarray(0, sent.length).equals(sent) && /RS-485/.test(btnText),
  conectado: c1.current,
  enviado: sent.toString("hex"),
  recibido: received.toString("hex"),
  boton: btnText,
};

// ---- USB (UART0): saludo del sketch
log("COM_USB");
await t(() => window.jwsimTest.comConnect(null));
const c2 = await t(([p]) => window.jwsimTest.comConnect(p, 0), [ptyPath]);
received = Buffer.alloc(0);
await win.click("#btn-run");
await until(async () => (await status()) === "running", 600000);
const hello = await until(() => /RS485 echo/.test(received.toString("latin1")), 15000);
await win.click("#btn-stop");
await win.waitForTimeout(500);
criteria.COM_USB = { pass: !c2.error && !!hello, conectado: c2.current, recibido: received.toString("latin1").trim() };

await t(() => window.jwsimTest.comConnect(null));
await app.close();
pty.kill();
const pass = Object.values(criteria).every((c) => c.pass);
for (const [k, v] of Object.entries(criteria)) console.log(`${k}: ${v.pass ? "OK" : "FALLA"} ${JSON.stringify(v)}`);
writeFileSync(join(ROOT, "build", "gates", "JWSIM_COM_E2E.json"), JSON.stringify({ result: pass ? "PASS" : "FAIL", platform: process.platform, criteria }, null, 2) + "\n");
console.log(`JWSIM_COM_E2E=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
