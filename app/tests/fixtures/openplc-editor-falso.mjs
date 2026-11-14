// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// OpenPLC Editor simulado para las pruebas (JWSIM_OPENPLC_EDITOR apunta a
// este script): responde como la CLI del editor real a
//   --cli create <nombre> --path <carpeta> --language <l> --time <t> --json
// con la misma estructura de archivos que crea el editor, y a
//   --open-project=<carpeta> y --jwsim-close
// dejando cada pedido en JWSIM_FAKE_EDITOR_LOG (una línea JSON por pedido).
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const log = (o) => process.env.JWSIM_FAKE_EDITOR_LOG && appendFileSync(process.env.JWSIM_FAKE_EDITOR_LOG, JSON.stringify(o) + "\n");
const flag = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes("--jwsim-close")) {
  log({ cmd: "close" });
  process.exit(0);
}
const open = argv.find((a) => a.startsWith("--open-project="));
if (open) {
  log({ cmd: "open", dir: open.slice("--open-project=".length) });
  process.exit(0);
}
if (argv[0] === "--cli" && argv[1] === "create") {
  const name = argv[2];
  const dir = join(flag("--path"), name);
  const lang = flag("--language") ?? "st";
  const time = flag("--time") ?? "T#20ms";
  log({ cmd: "create", name, lang, time, dir });
  if (existsSync(dir)) {
    console.log(JSON.stringify({ ok: false, error: { message: `${dir} already exists` } }));
    process.exit(2);
  }
  mkdirSync(join(dir, "devices"), { recursive: true });
  mkdirSync(join(dir, "pous", "programs"), { recursive: true });
  const project = {
    meta: { name, type: "plc-project" },
    data: {
      pous: [],
      dataTypes: [],
      libraries: [],
      configuration: { resource: { tasks: [{ name: "task0", triggering: "Cyclic", interval: time, priority: 1 }], instances: [{ name: "instance0", program: "main", task: "task0" }], globalVariables: [] } },
    },
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(project, null, 2));
  writeFileSync(join(dir, "devices", "configuration.json"), JSON.stringify({ deviceBoard: "OpenPLC Simulator" }, null, 2));
  writeFileSync(join(dir, "devices", "pin-mapping.json"), "{}");
  writeFileSync(join(dir, "pous", "programs", `main.${lang}`), `PROGRAM main\nEND_PROGRAM\n`);
  console.log(`Creating project "${name}"…`);
  console.log(JSON.stringify({ ok: true, name, type: "plc-project", projectPath: dir }));
  process.exit(0);
}
console.log(JSON.stringify({ ok: false, error: { message: `pedido desconocido: ${argv.join(" ")}` } }));
process.exit(2);
