// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Edición de Ladder (.ld) en el Sim con las mismas operaciones de peldaño del
// OpenPLC Editor (ladder-utils: placeholders, agregar, borrar y reacomodar),
// empaquetadas desde su código fijado en deps/ladder-ops.cjs
// (scripts/fetch-editor.mjs). Así un peldaño editado aquí queda igual que si
// se hubiera editado en el OpenPLC Editor, y lo compila la misma cadena.
//
// Los bloques salen de las mismas bibliotecas .stlib de STruC++ que carga el
// editor (stlibsToSystemLibraries), con la misma firma que guarda el editor.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { editorPaths, resolveEditor } from "../../scripts/fetch-editor.mjs";

const require = createRequire(import.meta.url);

// Bibliotecas que muestra la caja de bloques (las de oscat y softmotion son
// cientos de bloques que el curso no usa).
const LIBS = ["iec-standard-fb", "iec-std-functions", "additional-function-blocks"];

// Backplane del OpenPLC Editor (pantalla «Backplane» del VPP, layout
// module-slots): cada bornera del módulo fijo del equipo con su dirección IEC
// y un alias. Se guarda en devices/configuration.json →
// vendorScreenData["io-mapping"].entries, el mismo lugar y la misma forma que
// el editor; las variables pueden ir `AT <alias>` y la cadena lo resuelve.
const IEC_PREFIX = { digitalInput: "%IX", digitalOutput: "%QX", analogInput: "%IW", analogOutput: "%QW" };

/** @param {{onWrite?: (path: string, content: string) => void}} [o] */
export function createLadderEditor({ onWrite } = {}) {
  let ops = null;
  let blocks = null;
  let vppDevice = null;

  async function load() {
    if (ops) return ops;
    const { dir } = await resolveEditor({ fetch: false });
    const P = editorPaths(dir);
    if (!existsSync(P.ladderOps)) throw new Error("Falta la edición Ladder del editor OpenPLC. Ejecute: node scripts/fetch-editor.mjs");
    ops = require(P.ladderOps);
    vppDevice = JSON.parse(readFileSync(join(P.vpp, "manifest.json"), "utf8")).devices[0];
    const libsDir = join(P.strucpp, "libs");
    const archives = readdirSync(libsDir)
      .filter((f) => LIBS.includes(f.replace(/\.stlib$/, "")))
      .map((f) => JSON.parse(readFileSync(join(libsDir, f), "utf8")));
    blocks = ops.stlibsToSystemLibraries(archives).flatMap((lib) =>
      lib.pous.map((p) => ({
        id: `system/${lib.name}/${p.name}`,
        lib: lib.name,
        // Firma del bloque como la copia el editor al colocarlo (body.tsx):
        // sin el código fuente de la biblioteca.
        variant: { name: p.name, type: p.type, variables: p.variables, documentation: p.documentation, extensible: p.extensible ?? false },
      })),
    );
    return ops;
  }

  const isPh = (n) => n.type === "placeholder" || n.type === "parallelPlaceholder";
  // El id de un placeholder lleva un uuid nuevo en cada dibujo: se lo
  // reconoce por su tipo, el elemento al que pertenece y el lado.
  const phKey = (n) => `${n.type}|${n.data?.relatedNode?.id ?? ""}|${n.data?.position ?? ""}|${Math.round(n.position.x)},${Math.round(n.position.y)}`;
  const takeToasts = () => ops.toastLog.splice(0).map((t) => [t.title, t.description].filter(Boolean).join(": "));

  /** Rung nuevo, como startLadderRung del editor. */
  function newRung(pou) {
    const { powerRail } = ops.defaultCustomNodesStyles;
    const db = [300, 100];
    const id = `rung_${pou}_${globalThis.crypto.randomUUID()}`;
    const rails = [
      ops.nodesBuilder.powerRail({ id: `left-rail-${id}`, posX: 0, posY: db[1] / 2 - powerRail.height / 2, connector: "right", handleX: powerRail.width, handleY: db[1] / 2 }),
      ops.nodesBuilder.powerRail({ id: `right-rail-${id}`, posX: db[0], posY: db[1] / 2 - powerRail.height / 2, connector: "left", handleX: db[0] - powerRail.width, handleY: db[1] / 2 }),
    ];
    return {
      id,
      comment: "",
      defaultBounds: db,
      reactFlowViewport: db,
      nodes: rails,
      edges: [{ id: `e_${rails[0].id}_${rails[1].id}`, source: rails[0].id, target: rails[1].id, sourceHandle: rails[0].data.handles[0].id, targetHandle: rails[1].data.handles[0].id, type: "smoothstep" }],
      selectedNodes: [],
    };
  }

  /** Borneras del módulo fijo (slot 0) con su dirección IEC. */
  function channels() {
    const mod = vppDevice?.moduleSystem?.modules?.find((m) => m.fixed);
    if (!mod) return { module: null, channels: [] };
    const next = {};
    const list = (mod.addressMapping?.channels ?? []).map((c) => {
      const pre = IEC_PREFIX[c.type] ?? "%IX";
      const n = next[pre] ?? 0;
      next[pre] = n + 1;
      const iecAddress = pre.endsWith("X") ? `${pre}${Math.floor(n / 8)}.${n % 8}` : `${pre}${n}`;
      return { slot: 0, moduleId: mod.id, moduleName: mod.name, channelName: c.name, channelType: c.type, dataType: c.dataType ?? "BOOL", iecAddress, alias: "" };
    });
    return { module: { id: mod.id, name: mod.name }, channels: list };
  }

  const configPath = (dir) => join(resolve(dir), "devices", "configuration.json");
  function readConfig(dir) {
    const p = configPath(dir);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  }

  /** Backplane del proyecto: borneras + alias guardados. */
  function ioGet(dir) {
    const cfg = readConfig(dir);
    const saved = cfg.vendorScreenData?.["io-mapping"]?.entries ?? [];
    const { module, channels: list } = channels();
    for (const c of list) {
      const s = saved.find((e) => e.slot === c.slot && e.channelName === c.channelName);
      if (s) {
        c.alias = s.alias ?? "";
        if (s.iecAddress) c.iecAddress = s.iecAddress;
      }
    }
    return { board: cfg.deviceBoard ?? vppDevice?.name ?? "", module, entries: list };
  }

  /** Guarda los alias (channelName → alias) conservando el resto de la configuración. */
  function ioSet(dir, aliases) {
    const cfg = readConfig(dir);
    const cur = ioGet(dir).entries;
    const entries = cur.map((c) => ({ ...c, alias: String(aliases[c.channelName] ?? c.alias ?? "").trim() }));
    const others = (cfg.vendorScreenData?.["io-mapping"]?.entries ?? []).filter((e) => e.slot !== 0);
    cfg.vendorScreenData = { ...(cfg.vendorScreenData ?? {}), "io-mapping": { ...(cfg.vendorScreenData?.["io-mapping"] ?? {}), entries: [...entries, ...others] } };
    const text = JSON.stringify(cfg, null, 2) + "\n";
    const p = configPath(dir);
    onWrite?.(p, text);
    writeFileSync(p, text);
    return { entries };
  }

  /**
   * @param {{action: string, rung?: object, placeholder?: string (key de «placeholders»), element?: string, block?: string, ids?: string[], pou?: string}} req
   */
  async function op(req) {
    await load();
    const rung = req.rung;
    switch (req.action) {
      case "blocks":
        return { blocks };
      case "io-get":
        return ioGet(req.dir);
      case "io-set":
        return ioSet(req.dir, req.aliases ?? {});
      case "new-rung":
        return { rung: newRung(req.pou ?? "main") };
      case "placeholders":
        // Los mismos puntos donde el editor deja soltar un elemento.
        return {
          placeholders: ops
            .renderPlaceholderElements({ ...rung, nodes: rung.nodes.filter((n) => !isPh(n)) })
            .filter(isPh)
            .map((n) => ({ key: phKey(n), type: n.type, x: n.position.x, y: n.position.y, related: n.data?.relatedNode?.id ?? null })),
        };
      case "add": {
        const base = { ...rung, nodes: rung.nodes.filter((n) => !isPh(n)) };
        const nodes = ops.renderPlaceholderElements(base).map((n) => ({ ...n, selected: isPh(n) && phKey(n) === req.placeholder }));
        let blockVariant;
        if (req.element === "block") {
          blockVariant = blocks.find((b) => b.id === req.block)?.variant;
          if (!blockVariant) throw new Error(`No existe el bloque ${req.block}`);
        }
        const r = ops.addNewElement({ ...base, nodes }, { elementType: req.element, blockVariant });
        if (!r.newNode) return { rung, error: takeToasts().join(" · ") || "No se pudo colocar ahí." };
        const out = { ...rung, nodes: r.nodes.filter((n) => !isPh(n)).map((n) => ({ ...n, selected: false })), edges: r.edges };
        if (r.handleBranches) out.handleBranches = r.handleBranches;
        return { rung: out, added: r.newNode.id, warnings: takeToasts() };
      }
      case "remove": {
        const picked = rung.nodes.filter((n) => req.ids.includes(n.id));
        const r = ops.removeElements({ ...rung }, picked);
        const out = { ...rung, nodes: r.nodes.map((n) => ({ ...n, selected: false })), edges: r.edges };
        if (r.handleBranches) out.handleBranches = r.handleBranches;
        else delete out.handleBranches;
        return { rung: out, warnings: takeToasts() };
      }
      default:
        throw new Error(`acción Ladder desconocida: ${req.action}`);
    }
  }

  // Las funciones del editor empaquetadas (también las del depurador:
  // app/lib/plc-debug.mjs).
  return { op, ops: load };
}
