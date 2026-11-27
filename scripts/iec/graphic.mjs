// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Programas Ladder y FBD con el código del propio OpenPLC Editor (el fijado en
// editor.lock): los peldaños salen de buildRungFromSpec, los paralelos se
// agregan por el mismo camino que un clic en el editor (marcadores de
// posición + addNewElement) y el acomodo es el del editor. Así los .ld/.fbd
// de la ruta IEC se abren en el editor igual que si se hubieran dibujado a mano.
// Solo para preparar material (scripts/iec/*): la app y el CLI no lo usan.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { resolveEditor } from "../fetch-editor.mjs";

const ENTRY = `
export { buildRungFromSpec } from '@root/frontend/store/slices/ladder/utils/rung-spec'
export { addNewElement } from '@root/frontend/components/_molecules/graphical-editor/ladder/rung/ladder-utils/elements'
export { renderPlaceholderElements, removePlaceholderElements } from '@root/frontend/components/_molecules/graphical-editor/ladder/rung/ladder-utils/elements/placeholder'
export { updateDiagramElementsPosition } from '@root/frontend/components/_molecules/graphical-editor/ladder/rung/ladder-utils/elements/diagram'
export { nodesBuilder } from '@root/frontend/components/_atoms/graphical-editor/ladder/node-builders'
export * as fbdBuild from '@root/frontend/components/_atoms/graphical-editor/fbd/buildNodes'
export { stlibsToSystemLibraries } from '@root/frontend/utils/stlib-to-system-library'
`;

// Lo que el editor importa de la interfaz (React, toasts, estilos) no hace
// falta para armar nodos: se reemplaza por piezas mínimas.
const SHIMS = {
  xyflow: `export const Position = { Left: 'left', Top: 'top', Right: 'right', Bottom: 'bottom' };
export function getNodesBounds(nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const w = n.measured?.width ?? n.width ?? 0, h = n.measured?.height ?? n.height ?? 0;
    x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
    x1 = Math.max(x1, n.position.x + w); y1 = Math.max(y1, n.position.y + h);
  }
  return nodes.length ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
}
export const Handle = () => null; export const useUpdateNodeInternals = () => () => {}; export const useReactFlow = () => ({});
export const MarkerType = {}; export const ReactFlow = () => null;`,
  uuid: `export const v4 = () => require("node:crypto").randomUUID();`,
  misc: `const join = (...a) => a.flat(Infinity).filter((x) => typeof x === "string" && x).join(" ");
export const extendTailwindMerge = () => join; export const twMerge = join; export const clsx = join; export default join;
export const toast = () => {}; export const jsx = () => null; export const jsxs = () => null; export const Fragment = null;
export const createElement = () => null; export const useState = () => [null, () => {}]; export const useEffect = () => {}; export const useRef = () => ({}); export const useMemo = (f) => f(); export const useCallback = (f) => f; export const forwardRef = (f) => f; export const memo = (f) => f; export const createContext = () => ({}); export const useContext = () => ({});
export const create = () => () => ({}); export const produce = (s, f) => { f(s); return s; };`,
};

let cached = null;
/** Funciones del editor para armar diagramas (empaquetadas una vez por versión). */
export async function editorGraphic() {
  if (cached) return cached;
  const { dir } = await resolveEditor();
  const deps = join(dir, "deps");
  const out = join(deps, "graphic.cjs");
  const stamp = join(deps, "graphic.entry");
  const sig = ENTRY + JSON.stringify(SHIMS);
  if (!existsSync(out) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== sig) {
    const shim = join(deps, "graphic-shims");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shim, { recursive: true });
    for (const [k, v] of Object.entries(SHIMS)) writeFileSync(join(shim, `${k}.js`), v);
    writeFileSync(join(dir, "graphic-entry.ts"), ENTRY);
    const esbuild = createRequire(join(deps, "package.json"))("esbuild");
    await esbuild.build({
      entryPoints: [join(dir, "graphic-entry.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: out,
      tsconfig: join(dir, "tsconfig.json"),
      nodePaths: [join(deps, "node_modules")],
      alias: { lodash: "lodash-es" },
      jsx: "automatic",
      logLevel: "error",
      plugins: [
        {
          name: "shims",
          setup(b) {
            b.onResolve({ filter: /^@xyflow\/react$/ }, () => ({ path: join(shim, "xyflow.js") }));
            b.onResolve({ filter: /^uuid$/ }, () => ({ path: join(shim, "uuid.js") }));
            b.onResolve({ filter: /^(react|react-dom|react\/jsx-runtime|lucide-react|@radix-ui\/.*|zustand.*|immer|clsx|tailwind-merge|sonner|i18next|react-i18next)$/ }, () => ({ path: join(shim, "misc.js") }));
          },
        },
      ],
    });
    writeFileSync(stamp, sig);
  }
  const g = createRequire(import.meta.url)(out);
  const libs = join(deps, "node_modules", "strucpp", "libs");
  const system = g.stlibsToSystemLibraries(
    readdirSync(libs)
      .filter((f) => f.endsWith(".stlib"))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(libs, f), "utf8"))),
  );
  cached = { ...g, system };
  return cached;
}
