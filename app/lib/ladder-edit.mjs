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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { editorPaths, resolveEditor } from "../../scripts/fetch-editor.mjs";

const require = createRequire(import.meta.url);

// Bibliotecas que muestra la caja de bloques (las de oscat y softmotion son
// cientos de bloques que el curso no usa).
const LIBS = ["iec-standard-fb", "iec-std-functions", "additional-function-blocks"];

export function createLadderEditor() {
  let ops = null;
  let blocks = null;

  async function load() {
    if (ops) return ops;
    const { dir } = await resolveEditor({ fetch: false });
    const P = editorPaths(dir);
    if (!existsSync(P.ladderOps)) throw new Error("Falta la edición Ladder del editor OpenPLC. Ejecute: node scripts/fetch-editor.mjs");
    ops = require(P.ladderOps);
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

  /**
   * @param {{action: string, rung?: object, placeholder?: string (key de «placeholders»), element?: string, block?: string, ids?: string[], pou?: string}} req
   */
  async function op(req) {
    await load();
    const rung = req.rung;
    switch (req.action) {
      case "blocks":
        return { blocks };
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

  return { op };
}
