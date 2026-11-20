# Integración de proyectos por JSON + CLI para agentes — Plan de implementación

> **Para agentes ejecutores:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Permitir que cualquier agente de IA descubra el catálogo real de dispositivos, cree o edite proyectos `.jwsim` desde una forma JSON corta con auto-layout en grilla de `20 px`, valide estructura/bornes/colisiones/enlaces 3D/netlist en milisegundos, exporte capturas PNG 2D y 3D con Playwright y vea los cambios recargados en la app abierta sin perder trabajo manual.

**Arquitectura:** Reutilizar el catálogo vivo de `scene/devices/index.mjs`, los `.svg` reales de `app/renderer/assets/`, el motor `Scene` (`scene/scene.mjs`) y `cli/lib/project.mjs` mediante cuatro módulos ESM sin dependencias externas (`cli/lib/scene-spec.mjs`, `cli/lib/scene-normalize.mjs`, `cli/lib/scene-validate.mjs` y `cli/lib/scene-oracle.mjs`) expuestos bajo el subcomando `jwsim-cli scene …`, además de vigilancia de `.jwsim` en `app/main.mjs` y la skill `.claude/skills/crear-proyecto-jwsim/SKILL.md`.

**Stack técnico:** Node ESM (`node --test`), `jwsim-cli`, `Scene` / `Registry` / `mount.mjs`, Electron + Playwright, HTML/CSS/JS en `app/renderer/`.

**Especificación:** [`docs/integration/PROPUESTA_AGENTES_JSON.md`](../../integration/PROPUESTA_AGENTES_JSON.md)

## Restricciones globales

- Todo texto visible, documentación, comentarios y commits van en **español**, conservando literales en inglés solo para identificadores de API/CLI y código.
- Grilla obligatoria de **`20 px`** (`x % 20 === 0`, `y % 20 === 0`, ancho y alto múltiplos de `20`), alineada con `app/renderer/scene-symbols.js` y `app/tests/audit-grilla.mjs`.
- Cero dependencias npm nuevas en runtime del CLI: usar únicamente módulos nativos de Node y el código existente del repositorio (`scene/`, `cli/lib/`).
- Seguridad en escritura (`scene build`): **nunca sobrescribir** un archivo `.ino` o proyecto OpenPLC existente del usuario salvo que no exista en disco y se pase `--create-ino`; escribir `.jwsim` preservando campos desconocidos mediante `cli/lib/project.mjs`.
- En Windows PowerShell usar `node`, `npm.cmd` y `npx.cmd`; commits con `--author="JW-Control <jw.control.peru@gmail.com>"` y sin `Co-Authored-By`.
- Mantener la exposición por MCP en vivo fuera del alcance de este plan (fase futura opcional).

## Puntos críticos de revisión (Review Focus)

1. **Dispositivos acoplados (`mount`) en auto-layout y colisiones:** un `overload-relay` con `mount: "KM1"` debe colocarse exactamente en `mountPos(guest, host)` (`dx: 0, dy: 340`) después de ubicar al anfitrión, reservar ese alto bajo `KM1` para no pisar la fila inferior, y quedar exento de error de colisión únicamente contra su anfitrión (siguiendo colisionando contra terceros).
2. **Bornes por variante activa:** tipos con variantes SVG (`power-24vdc` `HDR-60` sin `PE`, `contactor` `01` vs `10`, `motor-3ph` `6 cables` vs `triangulo`/`estrella`) deben validar bornes contra los `.jw-term` de la plantilla activa y sugerir el parámetro/opción que habilita el borne faltante si existe en otra variante.
3. **Aislamiento de `reads`/`links` con valores por defecto:** dispositivos como `jwsim/building-water` (`bombas: "M1, M2"`), `jwsim/lift` (`motor: "M1"`) o `jwsim/door` fallan al instanciar `new Scene(...)` solos porque su destino por defecto no existe en una escena mínima; `scene-spec.mjs` debe descubrir `outputs` sin abortar y `scene-validate.mjs` debe reportar el enlace roto antes de que `new Scene` lance una excepción cruda.
4. **Escritura externa atómica o parcial sobre `.jwsim` con la app abierta:** el vigilante en `app/main.mjs` debe ignorar ecos de `ownWrites`, aplicar debounce, tolerar JSON truncado a mitad de escritura sin romper la ventana, auto-recargar solo si escena y editor están limpios (y la simulación detenida) y ofrecer recarga no destructiva si hay cambios locales sin guardar.
5. **Idempotencia de `scene normalize` y seguridad de `--create-ino`:** ejecutar `scene normalize` dos veces seguidas debe devolver salida idéntica byte a byte sin reasignar IDs ni mover equipos que ya tienen coordenadas válidas, y `scene build --create-ino` jamás debe pisar un `.ino` ya presente.

---

### Task 1: Catálogo vivo, prefijos y paridad de layout (`cli/lib/scene-spec.mjs` + `docs/REFERENCIA_ESCENA.md`)

**Archivos:**
- Crear: `scene/layout-fallback.json` (tabla compartida de los 6 tipos sin `.svg`: dimensiones y bornes idénticos a `LAYOUT` en `app/renderer/scene-symbols.js`)
- Modificar: `app/renderer/scene-symbols.js:33-60` (sincronizado con `scene/layout-fallback.json` o validado por test)
- Crear: `cli/lib/scene-spec.mjs`
- Crear: `scripts/gen-scene-ref.mjs`
- Crear: `docs/REFERENCIA_ESCENA.md`
- Probar: `cli/tests/scene-spec.test.mjs`

**Interfaces:**
- Consume: `builtinDevices`, `Registry` (`scene/devices/index.mjs`), `Scene` (`scene/scene.mjs`), `installedDevices` (`cli/lib/device.mjs`), SVGs de `app/renderer/assets/devices/*.svg` y `app/renderer/assets/jwplc-basic.svg`.
- Produce:
  - `PREFIX_BY_TYPE: Record<string, string>` (cubre los 65 tipos integrados, alineado con `app/renderer/scene.js:1608`)
  - `normalizeType(rawType: string): string` (`"contactor"` → `"jwsim/contactor"`)
  - `getDeviceLayout(type: string, params?: Record<string, unknown>, registry?: Registry): { w: number, h: number, terms: Record<string, { x: number, y: number, side: "t" | "b" }>, template: string | null }`
  - `describeCatalog({ registry }?): { total: number, categories: Array<{ name: string, devices: Array<{ type: string, name: string, prefix: string, size: { w: number, h: number }, terminals: string[], variants: string[], linkParams: string[] }> }> }`
  - `describeDevice(typeOrShort: string, { registry }?): DeviceDescriptor | null`
  - `renderReferenceMarkdown({ registry }?): string`
  - `checkReferenceFreshness(filePath?: string): { ok: boolean, expected: string, actual: string }`

- [ ] **Step 1: Escribir las pruebas unitarias que fallan en `cli/tests/scene-spec.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { builtinDevices } from "../../scene/devices/index.mjs";
import {
  PREFIX_BY_TYPE,
  normalizeType,
  getDeviceLayout,
  describeCatalog,
  describeDevice,
  checkReferenceFreshness,
} from "../lib/scene-spec.mjs";

test("cubre todos los tipos builtin con prefijo, layout múltiplo de 20 y bornes válidos", () => {
  const cat = describeCatalog();
  const flat = cat.categories.flatMap((c) => c.devices);
  assert.equal(flat.length, builtinDevices.length);
  for (const def of builtinDevices) {
    assert.ok(PREFIX_BY_TYPE[def.type.split("/")[1]], `falta prefijo para ${def.type}`);
    const lay = getDeviceLayout(def.type);
    assert.equal(lay.w % 20, 0, `${def.type} ancho ${lay.w}`);
    assert.equal(lay.h % 20, 0, `${def.type} alto ${lay.h}`);
    for (const [id, t] of Object.entries(lay.terms)) {
      assert.equal(t.x % 20, 0, `${def.type}.${id} x=${t.x}`);
    }
  }
});

test("variantes SVG resuelven bornes distintos y jwplc-basic lee sus bornes reales", () => {
  assert.equal(normalizeType("contactor"), "jwsim/contactor");
  const hdr = getDeviceLayout("jwsim/power-24vdc", { model: "HDR-60" });
  assert.equal("PE" in hdr.terms, false);
  const m6 = getDeviceLayout("jwsim/motor-3ph", { bornera: "6 cables" });
  assert.ok("W2" in m6.terms && "U2" in m6.terms && "V2" in m6.terms);
  const plc = getDeviceLayout("jwsim/jwplc-basic");
  assert.deepEqual([plc.w, plc.h], [460, 540]);
  assert.ok("24VDC" in plc.terms && "Q0_0.1" in plc.terms && "I0_0" in plc.terms);
});

test("describeDevice no falla en equipos con reads por defecto como building-water", () => {
  for (const def of builtinDevices) {
    const info = describeDevice(def.type.split("/")[1]);
    assert.ok(info, def.type);
    assert.equal(info.type, def.type);
    assert.ok(Array.isArray(info.outputs));
  }
});

test("docs/REFERENCIA_ESCENA.md coincide exactamente con renderReferenceMarkdown()", () => {
  const res = checkReferenceFreshness();
  assert.equal(res.ok, true, "ejecuta node scripts/gen-scene-ref.mjs para actualizar docs/REFERENCIA_ESCENA.md");
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla por módulo inexistente**

Correr: `node --test cli/tests/scene-spec.test.mjs`
Esperado: FAIL con `ERR_MODULE_NOT_FOUND` para `cli/lib/scene-spec.mjs`.

- [ ] **Step 3: Implementar `scene/layout-fallback.json` y `cli/lib/scene-spec.mjs`**

Puntos clave de implementación:
1. Extraer de `app/renderer/assets/devices/*.svg` el `viewBox` y los `.jw-term` (`data-term`, `cx`, `cy`, `data-side`) replicando el `templateKey` (`slug = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, "")`) de `app/renderer/scene-symbols.js:317-329`.
2. Para `jwsim/jwplc-basic`, parsear `app/renderer/assets/jwplc-basic.svg` usando `viewBox`, `data-grid` (`20 / 57`) y `.borne` (`data-senal`, `data-pos`, `data-entrada`, `<use x=...>`).
3. Para los 6 tipos sin `.svg` (`sensor-photoelectric`, `sensor-cylinder`, `conveyor`, `conveyor-physics`, `tank`, `door`) y terceros del SDK, usar las mismas fórmulas de `row()` y `scene/layout-fallback.json` que `LAYOUT` en `scene-symbols.js:25-60`.
4. En `describeDevice()`, descubrir `outputs` instanciando una micro-escena con `device.create({ id: "D1", params })` y llamando a `update(0n, ...)` o capturando `outputs` de `Scene` proveyendo stubs `M1`/`M2`/`Y1` cuando `def.reads`/`def.links` los pidan, de modo que nunca lance error en equipos con enlaces por defecto.
5. Incluir en `PREFIX_BY_TYPE` los 65 tipos (conservando los de `scene.js:1608` y agregando los nuevos de planta/proceso/RS-485: `jwplc-basic: "plc"`, `compressor: "C"`, `service-unit: "UM"`, `building-water: "RED"`, `lift: "ASC"`, `sand-filter: "FIL"`, `chlorinator: "CL"`, `chlorine-rs485: "BCL"`, `pressure-rs485: "BP"`, `pt100-rs485: "BT"`, `ph-rs485: "BPH"`, `fermentador: "FER"`, `water-valve: "YV"`, `conveyor: "CV"`, `conveyor-physics: "CV"`, `door: "P"`).

- [ ] **Step 4: Crear `scripts/gen-scene-ref.mjs` y generar `docs/REFERENCIA_ESCENA.md`**

Script mínimo que llama a `renderReferenceMarkdown()` y escribe `docs/REFERENCIA_ESCENA.md`.

- [ ] **Step 5: Ejecutar pruebas y verificar paridad**

Correr: `node scripts/gen-scene-ref.mjs; node --test cli/tests/scene-spec.test.mjs`
Esperado: PASS en todas las subpruebas (`4/4`).

- [ ] **Step 6: Commit**

```powershell
git add scene/layout-fallback.json cli/lib/scene-spec.mjs scripts/gen-scene-ref.mjs docs/REFERENCIA_ESCENA.md cli/tests/scene-spec.test.mjs
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "feat(cli): catálogo vivo scene-spec y referencia generada REFERENCIA_ESCENA"
```

---

### Task 2: Forma corta, normalizador y auto-layout en grilla (`cli/lib/scene-normalize.mjs`)

**Archivos:**
- Crear: `cli/lib/scene-normalize.mjs`
- Probar: `cli/tests/scene-normalize.test.mjs`

**Interfaces:**
- Consume: `normalizeType`, `PREFIX_BY_TYPE`, `getDeviceLayout` (`cli/lib/scene-spec.mjs`), `Registry` (`scene/devices/index.mjs`), `migrateScene` (`scene/scene.mjs`), `canMount`, `mountPos` (`scene/mount.mjs`), `SCHEMA_URL`, `CURRENT_VERSION` (`cli/lib/project.mjs`).
- Produce:
  - `parseWireShorthand(entry: string | object): { from: string, to: string, color?: string, points?: number[][], cable?: string, ref?: boolean }`
  - `normalizeScene(sceneInput: object, { registry, gutter }?): { devices: object[], wiring: object[], cables?: object[], inputMode?: string, inputs?: object }`
  - `normalizeProject(input: object, { registry, baseName, gutter }?): object` (proyecto v1 completo preservando campos desconocidos en raíz y orden de campos compatible con `cleanSpec()` + `cli/lib/project.mjs`)

- [ ] **Step 1: Escribir las pruebas unitarias que fallan en `cli/tests/scene-normalize.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../lib/project.mjs";
import { parseWireShorthand, normalizeProject } from "../lib/scene-normalize.mjs";
import { getDeviceLayout } from "../lib/scene-spec.mjs";

test("parseWireShorthand soporta flecha, guion, color, ref y cable", () => {
  assert.deepEqual(parseWireShorthand("PS1.+V1 -> KM1.A1"), { from: "PS1.+V1", to: "KM1.A1" });
  assert.deepEqual(parseWireShorthand("PS1.+V1 - KM1.A1 [rojo]"), { from: "PS1.+V1", to: "KM1.A1", color: "rojo" });
  assert.deepEqual(parseWireShorthand("VF1.U -> M1.U1 [negro, cable:W1, ref]"), {
    from: "VF1.U",
    to: "M1.U1",
    color: "negro",
    cable: "W1",
    ref: true,
  });
});

test("auto-layout ubica zonas sin solapamientos, respeta mount y ajusta a grilla de 20", () => {
  const short = {
    name: "Arranque motor",
    scene: {
      devices: [
        { type: "power-24vdc" },
        { type: "jwplc-basic" },
        { type: "pushbutton-no", params: { color: "verde" } },
        { type: "contactor" },
        { type: "overload-relay", mount: "KM1" },
        { type: "motor-3ph" },
      ],
      wiring: ["PS1.+V1 -> S1.13", "S1.14 -> plc.I0_0", "plc.Q0_0.1 -> KM1.A1"],
    },
  };
  const out = normalizeProject(short);
  assert.equal(validate(out).length, 0);
  const byId = Object.fromEntries(out.scene.devices.map((d) => [d.id, d]));
  assert.ok(byId.PS1 && byId.plc && byId.S1 && byId.KM1 && byId.F1 && byId.M1);
  assert.equal(byId.F1.x, byId.KM1.x);
  assert.equal(byId.F1.y, byId.KM1.y + 340);
  // Ningún par no acoplado se solapa y todos caen en múltiplos de 20
  for (const d of out.scene.devices) {
    assert.equal(d.x % 20, 0);
    assert.equal(d.y % 20, 0);
  }
  const boxes = out.scene.devices.map((d) => ({ ...d, ...getDeviceLayout(d.type, d.params) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.mount === b.id || b.mount === a.id) continue;
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlap, false, `solapamiento entre ${a.id} y ${b.id}`);
    }
  }
});

test("normalizeProject es idempotente y conserva campos desconocidos", () => {
  const input = {
    name: "Demo",
    customMeta: { autor: "JW" },
    scene: { devices: [{ type: "power-24vdc" }, { type: "lamp" }], wiring: ["PS1.+V1 -> H1.X1 [rojo]"] },
  };
  const once = normalizeProject(input);
  const twice = normalizeProject(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.customMeta, { autor: "JW" });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Correr: `node --test cli/tests/scene-normalize.test.mjs`
Esperado: FAIL con `ERR_MODULE_NOT_FOUND` para `cli/lib/scene-normalize.mjs`.

- [ ] **Step 3: Implementar `cli/lib/scene-normalize.mjs`**

Reglas de diseño:
1. Cabecera por defecto: `$schema: SCHEMA_URL`, `format: "jwsim"`, `version: 1`, `board: { id: "jwplcbasic" }`, `program: { kind: "arduino", sketch: "./<slug>/<slug>.ino" }` si falta `program`. Preservar campos extra en raíz y en `scene` (sin `zone`, que es directiva temporal de layout).
2. Asignación de IDs: si un dispositivo trae `id`, respetarlo; si falta, generar `plc` (primer `jwplc-basic`) o `<prefijo><n>` evitando colisión con IDs ya asignados en la escena.
3. Clasificación por zonas: `zone` explícito o inferido por categoría/tipo (`alimentacion` | `tablero` | `mando` | `campo` | `proceso`). Reservar debajo de cada posible anfitrión la altura extra de sus huéspedes `mount` antes de empaquetar columnas/filas con margen mínimo de `60 px` en múltiplos de `20`.
4. Si algunos dispositivos ya traen `(x, y)` y otros no, colocar los sin-posición buscando huecos libres que no intersecten los rectángulos ya fijados; si ambos traen coordenadas, ajustar a `Math.round(v / 20) * 20`. Posicionar los `mount` válidos al final con `mountPos(guest, host)`.
5. Cables y multipolares: aceptar shorthands en `wiring` y `cables[].wires` (opcional), preservando `points`, `color`, `cable` y `ref`. Aplicar `migrateScene()` para bornes heredados (`power-24vdc` `L+`/`M` → `+V1`/`-V1`).

- [ ] **Step 4: Ejecutar pruebas y verificar pasa**

Correr: `node --test cli/tests/scene-normalize.test.mjs`
Esperado: PASS (`3/3`).

- [ ] **Step 5: Commit**

```powershell
git add cli/lib/scene-normalize.mjs cli/tests/scene-normalize.test.mjs
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "feat(cli): normalizador JSON corto y auto-layout en grilla de 20 px"
```

---

### Task 3: Validador semántico, geométrico y eléctrico orientado a LLMs (`cli/lib/scene-validate.mjs`)

**Archivos:**
- Crear: `cli/lib/scene-validate.mjs`
- Probar: `cli/tests/scene-validate.test.mjs`

**Interfaces:**
- Consume: `validate`, `loadProject`, `resolveLinks` (`cli/lib/project.mjs`), `getDeviceLayout`, `normalizeType`, `describeDevice` (`cli/lib/scene-spec.mjs`), `Registry` (`scene/devices/index.mjs`), `Scene` (`scene/scene.mjs`), `canMount`, `mountPos` (`scene/mount.mjs`).
- Produce:
  - `validateSceneProject(input: object, { projectFile?: string, fast?: boolean, strict?: boolean, registry?: Registry }?): { ok: boolean, errors: Array<{ path: string, message: string, suggestion?: string }>, warnings: Array<{ path: string, message: string, suggestion?: string }>, stats: { devices: number, wiring: number, findings: number, faults: number } }`

- [ ] **Step 1: Escribir las pruebas unitarias que fallan en `cli/tests/scene-validate.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateSceneProject } from "../lib/scene-validate.mjs";
import { normalizeProject } from "../lib/scene-normalize.mjs";

test("detecta tipo mal escrito con sugerencia por Levenshtein o alias en español", () => {
  const doc = {
    format: "jwsim",
    version: 1,
    board: { id: "jwplcbasic" },
    program: { kind: "arduino", sketch: "./a/a.ino" },
    scene: { devices: [{ id: "M1", type: "jwsim/motor-trifasico", x: 0, y: 0 }], wiring: [] },
  };
  const r = validateSceneProject(doc);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].suggestion ?? "", /jwsim\/motor-3ph/);
});

test("detecta borne inexistente en la variante activa y sugiere parámetro o borne cercano", () => {
  const doc = normalizeProject({
    scene: {
      devices: [
        { id: "PS1", type: "power-24vdc", params: { model: "HDR-60" } },
        { id: "M1", type: "motor-3ph", params: { bornera: "triangulo" } },
      ],
      wiring: ["PS1.PE -> M1.W2"],
    },
  });
  const r = validateSceneProject(doc);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.message.includes("PE") && (e.suggestion ?? "").includes("MDR-60")));
  assert.ok(r.errors.some((e) => e.message.includes("W2") && (e.suggestion ?? "").includes("6 cables")));
});

test("detecta colisión 2D, coordenadas fuera de grilla y enlace 3D roto sin lanzar excepción", () => {
  const doc = normalizeProject({
    scene: {
      devices: [
        { id: "H1", type: "lamp", x: 10, y: 0 },
        { id: "H2", type: "lamp", x: 20, y: 0 },
        { id: "B1", type: "limit-switch", params: { source: "M99.speed" }, x: 300, y: 0 },
      ],
      wiring: [],
    },
  });
  const r = validateSceneProject(doc);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path.includes("/scene/devices/0") && /20/.test(e.message)));
  assert.ok(r.errors.some((e) => /colis|solap/i.test(e.message)));
  assert.ok(r.errors.some((e) => /M99/.test(e.message)));
});

test("detecta cortocircuito en t=0 y promueve warnings con --strict", () => {
  const shortCirc = normalizeProject({
    scene: {
      devices: [{ id: "PS1", type: "power-24vdc" }, { id: "H1", type: "lamp" }],
      wiring: ["PS1.+V1 -> PS1.-V1", "PS1.+V1 -> H1.X1"],
    },
  });
  const r1 = validateSceneProject(shortCirc);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => /cortocircuito/i.test(e.message)));

  const unpoweredOnly = normalizeProject({
    scene: {
      devices: [{ id: "PS1", type: "power-24vdc" }, { id: "H1", type: "lamp" }],
      wiring: ["PS1.+V1 -> H1.X1"],
    },
  });
  const normal = validateSceneProject(unpoweredOnly, { strict: false });
  const strict = validateSceneProject(unpoweredOnly, { strict: true });
  assert.equal(normal.ok, true);
  assert.ok(normal.warnings.length >= 1);
  assert.equal(strict.ok, false);
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Correr: `node --test cli/tests/scene-validate.test.mjs`
Esperado: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar `cli/lib/scene-validate.mjs`**

Estructura en 6 etapas acumulando `errors` y `warnings`:
1. Esquema v1: `validate(input)` de `cli/lib/project.mjs` (y validar que no falte `scene` si se valida como escena).
2. Catálogo y parámetros: IDs duplicados, tipo desconocido con tabla de alias frecuentes (`motor-trifasico`, `pulsador-na`, `pulsador-nc`, `paro-emergencia`, `fuente-24v`, `guardamotor`, `disyuntor`, `final-carrera`, `electrovalvula`, etc.) + distancia de Levenshtein contra todos los tipos; validación de `params` (`enum`, `number`, `boolean`) sugiriendo opciones válidas.
3. Bornes por variante: comparar cada extremo `dev.term` primero contra `layout.terms` (SVG/variante activa) y si no está en `layout.terms` pero sí en `def.terminals` de otra variante del mismo dispositivo, indicar exactamente qué parámetro/opción lo expone; si no existe, sugerir el borne activo más cercano por Levenshtein.
4. Grilla (`x % 20 === 0 && y % 20 === 0`), validación de `mount` (`canMount`, anfitrión inexistente) y colisiones AABB con ancho/alto real por variante (excluyendo el par anfitrión-huésped válido).
5. Enlaces de Planta 3D / sensores / proceso: recorrer `def.links?.(params)`, `def.reads?.(params)` más `params.source`, `params.cylinder`, `params.motor`, `params.bomba`, `params.bombas`, `params.agua`, `params.valvula`, `params.extraccion`, `params.cisterna`. Confirmar que el dispositivo destino existe y la salida figura en `describeDevice(target.type).outputs` (avisando si falta o sugiriendo la salida más cercana).
6. Análisis eléctrico `t = 0` (si `!opts.fast` y no hubo errores bloqueantes que impidan instanciar `new Scene`): `snap = new Scene(spec, { registry }).snapshot()`, mapear `snap.faults` → `errors`, `snap.warnings` + `snap.findings` → `warnings` (y avisar si el proyecto tiene firmware Arduino/OpenPLC cableando señales pero sin dispositivo `jwsim/jwplc-basic`). Si `opts.strict`, promover `warnings` a `errors`.

- [ ] **Step 4: Ejecutar pruebas y verificar pasa**

Correr: `node --test cli/tests/scene-validate.test.mjs`
Esperado: PASS (`4/4`).

- [ ] **Step 5: Commit**

```powershell
git add cli/lib/scene-validate.mjs cli/tests/scene-validate.test.mjs
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "feat(cli): validador semántico de escenas con Levenshtein, variantes y netlist"
```

---

### Task 4: Subcomandos CLI `scene describe|new|normalize|validate|build` (`cli/jwsim-cli.mjs`)

**Archivos:**
- Modificar: `cli/jwsim-cli.mjs:1-160, 445-466`
- Modificar: `docs/CLI.md`
- Probar: `cli/tests/scene-cli.test.mjs`

**Interfaces:**
- Consume: `describeCatalog`, `describeDevice` (`cli/lib/scene-spec.mjs`), `normalizeProject` (`cli/lib/scene-normalize.mjs`), `validateSceneProject` (`cli/lib/scene-validate.mjs`), `loadProject` (`cli/lib/project.mjs`), `EXIT` (`cli/jwsim-cli.mjs`).
- Produce:
  - `jwsim-cli scene describe [<tipo>] [--json]`
  - `jwsim-cli scene new <salida.jwsim> [--sketch <ruta>] [--template <base>] [--json]`
  - `jwsim-cli scene normalize <entrada.json> [-o <salida.jwsim>] [--json]`
  - `jwsim-cli scene validate <archivo.jwsim> [--fast] [--strict] [--json]`
  - `jwsim-cli scene build <entrada.json> --out <dir> [--create-ino] [--strict] [--json]`

- [ ] **Step 1: Escribir prueba CLI integral en `cli/tests/scene-cli.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve("cli/jwsim-cli.mjs");
const runCli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("scene describe --json lista catálogo y detalle de contactor", () => {
  const all = runCli("scene", "describe", "--json");
  assert.equal(all.status, 0);
  const j1 = JSON.parse(all.stdout);
  assert.ok(j1.ok && j1.catalog.total >= 65);

  const one = runCli("scene", "describe", "contactor", "--json");
  assert.equal(one.status, 0);
  const j2 = JSON.parse(one.stdout);
  assert.equal(j2.device.type, "jwsim/contactor");
});

test("scene new, normalize, validate y build --create-ino sin sobrescribir .ino existente", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-scene-cli-"));
  const raw = join(dir, "borrador.json");
  writeFileSync(raw, JSON.stringify({
    name: "DemoCLI",
    scene: {
      devices: [{ type: "power-24vdc" }, { type: "lamp" }],
      wiring: ["PS1.+V1 -> H1.X1", "H1.X2 -> PS1.-V1"],
    },
  }));
  const outDir = join(dir, "proj");
  const b1 = runCli("scene", "build", raw, "--out", outDir, "--create-ino", "--json");
  assert.equal(b1.status, 0);
  const j = JSON.parse(b1.stdout);
  assert.equal(j.ok, true);
  assert.ok(existsSync(j.project_file));
  assert.ok(existsSync(j.sketch_file));

  // Editar el .ino a mano y verificar que volver a correr scene build --create-ino NO lo pisa
  writeFileSync(j.sketch_file, "// codigo manual del usuario\nvoid setup(){}\nvoid loop(){}\n");
  const b2 = runCli("scene", "build", raw, "--out", outDir, "--create-ino", "--json");
  assert.equal(b2.status, 0);
  assert.match(readFileSync(j.sketch_file, "utf8"), /codigo manual del usuario/);
});

test("scene validate --strict falla con código 1 cuando hay advertencias", () => {
  const dir = mkdtempSync(join(tmpdir(), "jwsim-scene-val-"));
  const f = join(dir, "warn.jwsim");
  const norm = runCli("scene", "normalize", "-o", f, "--json", writeTmp(dir));
  void norm;
  // Prueba sobre archivo con bobina sin retorno
  writeFileSync(f, JSON.stringify({
    format: "jwsim",
    version: 1,
    board: { id: "jwplcbasic" },
    program: { kind: "arduino", sketch: "./s/s.ino" },
    scene: {
      devices: [
        { id: "PS1", type: "jwsim/power-24vdc", x: 0, y: 0 },
        { id: "H1", type: "jwsim/lamp", x: 200, y: 0 },
      ],
      wiring: [{ from: "PS1.+V1", to: "H1.X1" }],
    },
  }));
  assert.equal(runCli("scene", "validate", f, "--json").status, 0);
  assert.equal(runCli("scene", "validate", f, "--strict", "--json").status, 1);
});

function writeTmp(dir) {
  const p = join(dir, "tmp.json");
  writeFileSync(p, JSON.stringify({ scene: { devices: [{ type: "lamp" }], wiring: [] } }));
  return p;
}
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Correr: `node --test cli/tests/scene-cli.test.mjs`
Esperado: FAIL con `comando desconocido 'scene'`.

- [ ] **Step 3: Implementar los subcomandos `scene` en `cli/jwsim-cli.mjs` y actualizar `docs/CLI.md`**

Detalles críticos en `cli/jwsim-cli.mjs`:
1. Añadir a `parse(argv)` las banderas: `-o` / `--output` (`opts.outFile`), `--sketch`, `--template`, `--view`, `--strict`, `--fast`, `--create-ino`, `--smoke-ms`.
2. Añadir `cmd === "scene"` con despacho a `describe`, `new`, `normalize`, `validate`, `build` (y reservar `preview` para Task 6, devolviendo `EXIT.USAGE` descriptivo antes de Task 6).
3. En `scene build <entrada.json> --out <dir>`:
   - Resolver `<dir>`, normalizar nombre de archivo `<slug>.jwsim` y `<slug>/<slug>.ino` (si no se pasó `program.sketch` / `program.project`).
   - Validar antes de escribir; si hay `errors` (o `warnings` bajo `--strict`), devolver `EXIT.FAIL` sin corromper archivos existentes.
   - Si `--create-ino` está activo y el `.ino` **no existe**, crear el directorio y escribir plantilla mínima de `JWPLC Basic` (`#include <JWPLC.h>` / `setup()` / `loop()`); si el `.ino` (o proyecto OpenPLC) **ya existe**, no tocarlo nunca y reportar `created_ino: false`.
4. Documentar `jwsim-cli scene …` en `docs/CLI.md`.

- [ ] **Step 4: Ejecutar pruebas CLI**

Correr: `node --test cli/tests/scene-cli.test.mjs`
Esperado: PASS (`3/3`).

- [ ] **Step 5: Commit**

```powershell
git add cli/jwsim-cli.mjs cli/tests/scene-cli.test.mjs docs/CLI.md
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "feat(cli): subcomandos jwsim-cli scene describe, new, normalize, validate y build"
```

---

### Task 5: Recarga en caliente de `.jwsim` externo en la app sin pérdida de trabajo (`app/main.mjs` + `app/preload.cjs` + `app/renderer/`)

**Archivos:**
- Modificar: `app/main.mjs:122, 667-736` (vigilante del `.jwsim` abierto + registro en `ownWrites` al guardar desde `project:save`)
- Modificar: `app/preload.cjs:75-100` (`watchProject`, `onProjectChanged`)
- Modificar: `app/renderer/scene.js:3010-3030, 3120-3130` (`isDirty()` / limpiar `S.dirty` tras `load` y al guardar)
- Modificar: `app/renderer/app.js:600-625, 1375-1450, 2260-2270` (`onExternalProjectChange`, aviso no bloqueante con botón «Recargar» cuando haya cambios sin guardar o simulación en curso)
- Probar: `app/tests/e2e-project-watch.mjs`

**Interfaces:**
- Consume: `loadProject` (`cli/lib/project.mjs`), `openProject` / `ownWrites` (`app/main.mjs`).
- Produce:
  - IPC `project:watch` (`(file: string | null) => boolean`) y evento `project:changed` (`{ file, deleted?, error?, project? }`)
  - `window.JwsimScene.isDirty(): boolean` y `window.JwsimScene.markSaved(): void`

- [ ] **Step 1: Escribir prueba E2E que falla en `app/tests/e2e-project-watch.mjs`**

La prueba lanza Electron, abre un `.jwsim` temporal con `window.jwsimTest.openProjectFile(file)`:
1. **Caso limpio:** escribe una modificación válida en `file` en disco agregando una lámpara `H9`; verifica que la escena en `window.jwsimTest.scene.spec()` se actualiza automáticamente sin intervención ni diálogo modal.
2. **Caso con edición local (dirty):** mueve `H9` en la UI (deja la escena sucia), luego vuelve a editar `file` en disco; verifica que la posición local de `H9` **NO** se sobrescribe automáticamente y aparece el botón no bloqueante `#sb-project-reload` para recargar cuando el usuario decida.

- [ ] **Step 2: Ejecutar prueba E2E para verificar que falla**

Correr: `node app/tests/e2e-project-watch.mjs`
Esperado: FAIL (la escena en UI no se entera del cambio externo en `.jwsim`).

- [ ] **Step 3: Implementar vigilancia de `.jwsim` en `app/main.mjs`, `app/preload.cjs`, `app/renderer/scene.js` y `app/renderer/app.js`**

Detalles críticos:
1. En `app/main.mjs`:
   - En `project:save`: guardar `ownWrites.set(resolve(target), readFileSync(target, "utf8"))` para que el propio guardado de la app no dispare recarga externa.
   - Nuevo handler `project:watch`: cierra `projectWatcher` previo; si `file`, vigila `dirname(resolve(file))` filtrando por `basename(file)` (tolerante a escrituras atómicas por rename en Windows) con debounce `80 ms`. Si el archivo cambia y su texto difiere de `ownWrites.get(abs)`, intenta `openProject(abs)`: si el JSON está temporalmente truncado durante escritura, ignora sin emitir fatal; cuando es válido, actualiza `ownWrites` y envía `forward("project:changed", { file: abs, res })`.
2. En `app/renderer/scene.js`:
   - En `load()`: `S.dirty = false;`. Exponer `isDirty: () => !!S.dirty` y `markSaved: () => { S.dirty = false; }` en `window.JwsimScene`.
3. En `app/renderer/app.js`:
   - Al cargar un proyecto en `applyProject(res)`, invocar `api.watchProject(res.file)`; al abrir un sketch suelto en `loadSketch`, `api.watchProject(null)`.
   - Al guardar en `saveProjectFile()`, llamar `window.JwsimScene?.markSaved?.()`.
   - En `onExternalProjectChange({ file, res, error })`: si no es el proyecto activo, ignorar. Si ni el editor (`[...state.models].some(...)`) ni la escena (`window.JwsimScene?.isDirty?.()`) tienen cambios sin guardar y `!running`, llamar `applyProject(res)` silenciosamente preservando la pestaña activa (si ya estaba en `schematic` o `plant`, volver a ella o no forzar salto inesperado) y registrar `[jwsim] proyecto recargado desde disco` en consola. Si hay cambios sin guardar o simulación activa, guardar `state.pendingProjectReload = res` y renderizar en `#sb-project` un botón inline `#sb-project-reload` («El proyecto cambió en disco · Recargar»).

- [ ] **Step 4: Ejecutar prueba E2E para verificar que pasa**

Correr: `node app/tests/e2e-project-watch.mjs`
Esperado: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/main.mjs app/preload.cjs app/renderer/scene.js app/renderer/app.js app/tests/e2e-project-watch.mjs
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "feat(app): recarga en caliente de cambios externos en .jwsim sin perder ediciones"
```

---

### Task 6: Oráculo visual `cli/lib/scene-oracle.mjs` + subcomando `scene preview`

**Archivos:**
- Crear: `cli/lib/scene-oracle.mjs`
- Modificar: `cli/jwsim-cli.mjs` (conectar `scene preview <archivo.jwsim> [--out <dir>] [--view 2d|3d|both] [--smoke-ms <ms>] [--json]`)
- Modificar: `docs/CLI.md`
- Probar: `cli/tests/scene-oracle.test.mjs` (o `app/tests/e2e-scene-oracle.mjs` invocado con `node`)

**Interfaces:**
- Consume: Playwright `_electron`, `openProjectFile` (`window.jwsimTest`), `JwsimSymbols.warnings`, `JwsimTabs.select`, `Jwsim3D`, `cli/lib/scene-validate.mjs`.
- Produce:
  - `previewSceneProject(projectFile: string, { outDir?: string, view?: "2d" | "3d" | "both", smokeMs?: number }?): Promise<{ ok: boolean, file: string, warnings: string[], routes: Array<{ wire: string, routed: boolean }>, screenshots: { schematic?: string, plant3d?: string }, smoke?: { status: string, ran: boolean, error?: string } }>`

- [ ] **Step 1: Escribir prueba que falla en `app/tests/e2e-scene-oracle.mjs`**

Prueba la función `previewSceneProject()` sobre `exercises/01-marcha-parada/01-marcha-parada.jwsim` (y sobre un proyecto `.jwsim` temporal con cinta/motor generado por `scene normalize`), verificando:
- `ok === true`
- `warnings.length === 0`
- Todos los cables no-`ref` aparecen con `routed` en `routes`
- Existen los archivos PNG `schematic-2d.png` y `plant-3d.png` con tamaño > 5 KB.

- [ ] **Step 2: Ejecutar prueba para verificar que falla**

Correr: `node app/tests/e2e-scene-oracle.mjs`
Esperado: FAIL con `ERR_MODULE_NOT_FOUND` para `cli/lib/scene-oracle.mjs`.

- [ ] **Step 3: Implementar `cli/lib/scene-oracle.mjs` y conectar `scene preview` en `cli/jwsim-cli.mjs`**

Detalles clave:
1. Abrir Electron headless con `userData` y `JWSIM_WORKSPACE` temporales (patrón de `app/tests/cap-arte.mjs`), cargando el `.jwsim` con `window.jwsimTest.openProjectFile(absFile)`.
2. Si `view` es `"2d"` o `"both"`: `window.JwsimTabs.select("schematic")`, esperar render y hacer clic en `#scene-fit`, capturar `schematic-2d.png`, recolectar `window.JwsimSymbols.warnings` y `window.jwsimTest.scene.routes()`.
3. Si `view` es `"3d"` o `"both"`: `window.JwsimTabs.select("plant")`, esperar que Three.js haya poblado la escena (`requestAnimationFrame` × 3), capturar `plant-3d.png`.
4. Si `--smoke-ms <ms>`: hacer clic en `#btn-run`, esperar transición fuera de `"building"`, sostener `smokeMs`, leer consola de errores/estatus (`window.jwsimTest.status()`) y detener simulación antes de cerrar.
5. Si Playwright/Electron no están instalados o disponibles, lanzar `CliError(EXIT.ENV, ...)` con instrucción clara.
6. En `cli/jwsim-cli.mjs`, implementar `sub === "preview"` emitiendo JSON con rutas absolutas de las capturas, avisos SVG, estado de rutas y código de salida `0`/`1`/`5`.

- [ ] **Step 4: Ejecutar prueba de oráculo y CLI**

Correr: `node app/tests/e2e-scene-oracle.mjs; node cli/jwsim-cli.mjs scene preview exercises/01-marcha-parada/01-marcha-parada.jwsim --view both --json`
Esperado: `ok: true`, `warnings: []`, ambos PNG generados y exit code `0`.

- [ ] **Step 5: Commit**

```powershell
git add cli/lib/scene-oracle.mjs cli/jwsim-cli.mjs app/tests/e2e-scene-oracle.mjs docs/CLI.md
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "feat(cli): oráculo visual Playwright 2D/3D para jwsim-cli scene preview"
```

---

### Task 7: Guía para agentes, Skill y validación integral de punta a punta

**Archivos:**
- Crear: `docs/AGENTES_ESCENAS.md`
- Crear: `.claude/skills/crear-proyecto-jwsim/SKILL.md`
- Modificar: `app/tests/audit-grilla.mjs` (opcional: asegurar cero regresiones y paridad con `scene-spec`)
- Probar: `cli/tests/scene-e2e-flow.test.mjs` (flujo completo borrador JSON → `describe` → `normalize` → `validate --strict` → `build --create-ino` → `jwsim-cli run --json` / `test` → `scene preview`)

**Interfaces:**
- Consume: todos los comandos `jwsim-cli scene …` + `jwsim-cli run` / `test` y `docs/REFERENCIA_ESCENA.md`.
- Produce: documentación operativa y skill verificada de punta a punta.

- [ ] **Step 1: Crear `docs/AGENTES_ESCENAS.md` y `.claude/skills/crear-proyecto-jwsim/SKILL.md`**

Contenido de `.claude/skills/crear-proyecto-jwsim/SKILL.md`:
- Flujo de 5 pasos igual que `PROPUESTA_AGENTES_JSON.md` §4.7:
  1. Consultar `node cli/jwsim-cli.mjs scene describe <tipo> --json` y `docs/REFERENCIA_ESCENA.md`.
  2. Crear borrador JSON corto + `.ino` (cuidando I/O del `jwplc-basic`: entradas sink `24VDC` por `I0_x` con `M1` a `0V`, salidas secas `Q0_x.1` / `Q0_x.2`).
  3. Iterar `scene normalize` y `scene validate --strict --json` hasta `0` errores y `0` avisos.
  4. Correr `scene preview --view both --json` e inspeccionar visualmente ambos PNG (`schematic-2d.png` y `plant-3d.png`).
  5. Verificar funcionamiento lógico real con `jwsim-cli test <prueba>.jwtest.json` o `jwsim-cli run`.

Contenido de `docs/AGENTES_ESCENAS.md`:
- Tabla de zonas del auto-layout, convenciones de colores IEC 60445, enlaces de Planta 3D (`conveyor`, `tank`, `door`, `solenoid-valve`, `sensor-*`), acoples `mount` (`overload-relay`), referencia al flujo de autodescubrimiento sin cargar código fuente de `scene/devices/`.

- [ ] **Step 2: Escribir y correr prueba E2E de flujo completo en `cli/tests/scene-e2e-flow.test.mjs`**

Construir desde cero en un directorio temporal un borrador JSON corto (fuente 24 V + `jwplc-basic` + pulsador `S1` + contactor `KM1` + motor `M1` + lámpara `H1`) + un `.jwtest.json`, ejecutar `scene normalize` → `scene validate --strict --json` → `scene build --create-ino --json` → verificar que el proyecto resultante es válido y abrirlo con `loadProject()` (y `scene preview` + `jwsim-cli test` cuando el toolchain esté disponible).

- [ ] **Step 3: Verificación global final de todo el paquete**

Correr en orden:
1. `node --test scene/tests/devices.test.mjs`
2. `node --test cli/tests/scene-spec.test.mjs cli/tests/scene-normalize.test.mjs cli/tests/scene-validate.test.mjs cli/tests/scene-cli.test.mjs cli/tests/scene-e2e-flow.test.mjs`
3. `node app/tests/audit-grilla.mjs`
4. `node app/tests/e2e-project-watch.mjs`
5. `node app/tests/e2e-scene-oracle.mjs`
6. `node app/tests/e2e-paleta.mjs`

Esperado: todas las suites en `PASS` con `0` regresiones.

- [ ] **Step 4: Commit final de documentación y skill**

```powershell
git add docs/AGENTES_ESCENAS.md .claude/skills/crear-proyecto-jwsim/SKILL.md cli/tests/scene-e2e-flow.test.mjs
git commit --author="JW-Control <jw.control.peru@gmail.com>" -m "docs(agentes): skill crear-proyecto-jwsim, guía de escenas y prueba de flujo completo"
```
