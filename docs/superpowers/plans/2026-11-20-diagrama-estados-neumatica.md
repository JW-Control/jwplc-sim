# Diagrama de Estados Neumático y Paneles Tipo Altium — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar un diagrama de estados en vivo estilo FluidSIM (`<canvas>`) dentro de una barra lateral izquierda acoplada y redimensionable, haciendo también redimensionable la barra lateral derecha, visible tanto en «A colores» como en «Neumático».

**Architecture:** Un núcleo UMD sin dependencias DOM (`app/lib/state-diagram-core.cjs`) extrae señales de cilindros, bobinas, sensores y presión desde la escena y gestiona el búfer temporal con conservación al detener. La interfaz (`app/renderer/state-diagram.js`) dibuja las pistas sobre `<canvas>` en el panel izquierdo (`#scene-left`) mientras `app/renderer/app.js` y `style.css` organizan `.scene-main` en dos barras laterales ajustables alrededor de `.scene-stage`.

**Tech Stack:** Electron 44, Vanilla JS (classic scripts + `.cjs` UMD), HTML/CSS Grid, Canvas 2D, Node `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-diagrama-estados-neumatica-design.md`

## Global Constraints
- Idioma español en todo (interfaz, comentarios, docstrings, pruebas nuevas y commits como `JW-Control <jw.control.peru@gmail.com>`).
- Windows PowerShell: usar `node` explícito, nunca `npm`/`npx` a secas.
- Preservar todos los selectores e IDs que validan los E2E existentes (`#scene-side`, `#scene-tab-add`, `#scene-tab-props`, `#scene-tab-reto`, `.scene-main[data-pane]`, `#pn-view`, `#schem-pneu`, `#schem-color`).
- Sin cambios a la física ni nuevos dispositivos en `scene/devices/`.
- Conservar el historial al detener (`running === false`); solo reiniciar en transición `false → true`, `t_ms < lastT` en marcha, cambio de proyecto o clic en `Limpiar`.

## Review Focus
- `■ Detener` dispara `analyze()` con `running = false` y `t_ms = 0`: el búfer NO debe borrarse ni registrar ese frame estático.
- Escenas sin electroválvulas: `#scene-tab-states` queda deshabilitado y `#scene-left` colapsado **sin sobrescribir** `jwsim.sceneLeftPane` en `localStorage`.
- Arrastre de cualquiera de los dos divisores o cambio de tamaño de ventana: ambos paneles deben acotarse para garantizar `>= 260 px` en `.scene-stage` (sin romper `width: 0` al colapsar).
- `.scene-float` (herramientas arriba a la izquierda de `#scene-pan`) debe quedar anclada a `.scene-stage`, nunca montada sobre `#scene-left` ni `#scene-left-bar`.
- El muestreo corre en segundo plano aunque `#scene-left` esté cerrado o el usuario esté en otra pestaña (`Programa` / `Planta 3D`), mostrando la traza completa al abrir el panel.

---

### Task 1: Núcleo de extracción de señales y grabador temporal (`app/lib/state-diagram-core.cjs`)

**Files:**
- Create: `app/lib/state-diagram-core.cjs`
- Test: `app/tests/state-diagram.test.mjs`

**Interfaces:**
- Produces: `window.JwsimStateDiagCore` / `module.exports`:
  - `extractChannels(spec)` → `{ groups: Array<{ id, label, valveType, channels: ChannelDef[] }>, channels: ChannelDef[], hasPneumatics: boolean }`
  - `ChannelDef`: `{ id, groupId, kind: 'cyl'|'coil'|'sensor'|'pressure', label, shortLabel, deviceId, key, unit, min, max, threshold? }`
  - `createRecorder(maxPoints = 24000)` → `{ push(snap, running), reset(), onProjectReset(), samples(), lastTimeMs(), valueAt(ch, tMs), windowBounds(windowMs, panEndMs, frozen) }`

- [ ] **Step 1: Escribir prueba unitaria fallida para `extractChannels` y `createRecorder`**

Crear `app/tests/state-diagram.test.mjs` con pruebas para:
1. `extractChannels` con válvula monoestable `Y1`, biestable `Y2`, sensores `A0`/`A1` (`limit-switch`), `S1` (`sensor-cylinder`), `FR1` (`service-unit`) y `CP1` (`compressor`).
2. `createRecorder`:
   - Ignora snapshots con `running = false` (no borra la corrida previa tras `■ Detener` con `t_ms = 0`).
   - Reinicia al pasar `running: false -> true` o si `running && t_ms < lastT`.
   - Conserva puntos previos al cambiar un valor (compresión sin perder flancos ni rampas).
   - `valueAt(ch, tMs)` interpola linealmente canales `cyl`/`pressure` y mantiene escalón en `coil`/`sensor`.
   - `windowBounds` calcula `[t0, t1]` para ventana finita (`10000 ms`), `"all"`, y modo congelado.

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `node --test app/tests/state-diagram.test.mjs`  
Expected: FAIL (`Cannot find module '../lib/state-diagram-core.cjs'`).

- [ ] **Step 3: Implementar `app/lib/state-diagram-core.cjs`**

Implementar UMD (`module.exports` en Node, `root.JwsimStateDiagCore` en navegador) con `extractChannels`, `createRecorder`, `valueAt` y `windowBounds`.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `node --test app/tests/state-diagram.test.mjs`  
Expected: PASS (todas las aserciones en verde).

- [ ] **Step 5: Commit de Task 1**

```bash
git add app/lib/state-diagram-core.cjs app/tests/state-diagram.test.mjs
git commit -m "feat(neumatica): nucleo de canales e historial del diagrama de estados"
```

---

### Task 2: Layout tipo Altium con 2 barras laterales ajustables (`index.html`, `style.css`, `app.js`)

**Files:**
- Modify: `app/renderer/index.html:170-247`
- Modify: `app/renderer/style.css:1282-1315,1652-1710,2888-2890,3305-3320`
- Modify: `app/renderer/app.js:1931-1961`

**Interfaces:**
- Consumes: `window.JwsimStateDiag` (opcional hasta Task 3; si existe llama `setVisible(open)` / `resize()`).
- Produces:
  - DOM: `#scene-left-bar`, `#scene-tab-states`, `#scene-left`, `#state-diag-pane`, `#scene-left-splitter`, `.scene-stage`, `#scene-side-splitter`.
  - `window.JwsimScenePane`: `{ showProps(), setLeftAvailability(hasPneu), setLeftPane(pane, save), isLeftOpen() }`.
  - `localStorage` keys: `jwsim.sceneLeftPane`, `jwsim.sceneLeftW`, `jwsim.sceneSideW` (más `jwsim.scenePane`).

- [ ] **Step 1: Actualizar estructura DOM en `app/renderer/index.html`**

Dentro de `.scene-main`:
1. Añadir `#scene-left-bar` (`nav.side-bar.side-bar-left`) con botón `#scene-tab-states` (`class="side-tab-left"`, `data-left-pane="states"`, `aria-pressed="false"`, icono SVG de gráfica de ondas/estados).
2. Añadir `#scene-left` (`aside.scene-left`) con `<section class="left-pane" id="state-diag-pane" data-left-pane="states"></section>` y el divisor `#scene-left-splitter` (`class="scene-splitter"`, `role="separator"`, `aria-orientation="vertical"`).
3. Envolver `#scene-pan`, `#pn-view` y `.scene-float` dentro de `<div class="scene-stage">...</div>`.
4. Añadir `#scene-side-splitter` (`class="scene-splitter"`, `role="separator"`, `aria-orientation="vertical"`) justo antes de `#scene-side`.
5. Cargar `<script src="../lib/state-diagram-core.cjs"></script>` y `<script src="state-diagram.js"></script>` antes de `tabs.js`.

- [ ] **Step 2: Actualizar CSS del grid de 2 barras laterales en `app/renderer/style.css`**

Reemplazar la regla de `.scene-main` (y el override de línea 2889 para `data-pane="reto"`) por un grid unificado de 7 pistas con variables `--left-col`, `--left-spl`, `--side-spl`, `--side-col`, estilos para `.side-bar-left`, `.scene-left`, `.scene-stage`, `.scene-splitter` (mismo estilo visual que `.splitter`), `.scene-main.left-collapsed` y `.scene-main.side-collapsed`. Asegurar que `#scene-pan` y `.pn-view` ocupen `grid-column: 1; grid-row: 1;` dentro de `.scene-stage` y que `body[data-schem="pneu"] .scene-stage .scene-float` siga funcionando sin afectar las barras laterales.

- [ ] **Step 3: Extender `wireSceneSide()` en `app/renderer/app.js`**

1. Gestionar `#scene-left` (`setLeftPane(pane, save)`, estado inicial `"none"` si `jwsim.sceneLeftPane` no existe, `setLeftAvailability(hasPneu)` que colapsa si `!hasPneu` **sin sobrescribir** `jwsim.sceneLeftPane` y restaura la preferencia guardada cuando `hasPneu` vuelve a `true`).
2. Implementar `clampSideWidths()` (lee ancho real de `.scene-main`, conserva `>= 260 px` para `.scene-stage`, aplica `--scene-left-w` y `--scene-side-w`).
3. Cablear `#scene-left-splitter` (`260..680 px`, default `440 px`) y `#scene-side-splitter` (`240..560 px`, default `340 px` o `380 px` en `reto`) con pointer drag, doble clic para reset y `window.addEventListener("resize", clampSideWidths)`.
4. Respetar exactamente `#scene-side` / `.scene-main[data-pane]` / `#scene-tab-add` / `#scene-tab-props` / `#scene-tab-reto` para las pruebas existentes.

- [ ] **Step 4: Ejecutar pruebas E2E existentes para validar no-regresión de UI**

Run: `node app/tests/e2e-a17-ui.mjs`  
Expected: PASS (`JWSIM_A17_UI=PASS` o todos los criterios `pass: true`).

- [ ] **Step 5: Commit de Task 2**

```bash
git add app/renderer/index.html app/renderer/style.css app/renderer/app.js
git commit -m "feat(ui): dos barras laterales ajustables tipo Altium en escena"
```

---

### Task 3: UI y renderizado `<canvas>` del Diagrama de Estados (`state-diagram.js` + `scene.js` + `style.css`)

**Files:**
- Create: `app/renderer/state-diagram.js`
- Modify: `app/renderer/style.css` (estilos `.sd-*` del diagrama de estados)
- Modify: `app/renderer/scene.js:1775-1782,2712-2720,2789-2800,2915-2920`

**Interfaces:**
- Consumes: `window.JwsimStateDiagCore`, `window.JwsimScene.specForView()`, `window.JwsimScenePane.setLeftAvailability(hasPneu)`.
- Produces: `window.JwsimStateDiag`:
  - `onSpec({ resetProject }?)`
  - `onSnapshot(snap, running)`
  - `setVisible(on)`
  - `resize()`
  - `debug()` → `{ open, samples, channels, visibleIds, frozen, windowMs }`

- [ ] **Step 1: Implementar `app/renderer/state-diagram.js` y estilos `.sd-*` en `app/renderer/style.css`**

Funcionalidad completa:
1. Renderiza en `#state-diag-pane` la cabecera con: título, estado (`En vivo` / `Fijado`), botones `⏸ Fijar` / `▶ En vivo`, `↺ Limpiar`, selector de ventana (`5 s`, `10 s`, `20 s`, `60 s`, `Todo`), botón `+ Señales` con popover de checkboxes agrupados por cilindro + aire comprimido, y banda de lectura del cursor (`t = ...`).
2. Mantiene `activeIds` (por defecto cilindros + sus sensores y bobinas; actualizado al cambiar escena preservando selecciones válidas).
3. Dibuja en `<canvas>` con DPR (`devicePixelRatio`) y paleta de la app (`--panel`, `--border`, `--accent`, `--warn`, `--ok`, `#55aef0`, `--err` para umbral `1.5 bar`):
   - Rejilla temporal con marcas en segundos.
   - Pistas por señal visible: curva continua `0..1` con relleno tenue para cilindros, escalón digital para bobinas (`--warn`) y sensores (`--ok`), curva `bar` + umbral `1.5 bar` punteado para presión.
   - Crosshair vertical al mover el puntero con lectura de valores exactos en ese instante.
   - Rueda (zoom de ventana temporal) y arrastre horizontal (cambia a congelado y mueve `panEndMs` sobre el historial).
4. Llama `window.JwsimScenePane?.setLeftAvailability(meta.hasPneumatics)` en `onSpec()`.

- [ ] **Step 2: Conectar `app/renderer/scene.js` con `window.JwsimStateDiag`**

1. En `load(sc)`: `window.JwsimStateDiag?.onSpec({ resetProject: true });`
2. En `changed()` / `onSpec`: `window.JwsimStateDiag?.onSpec();`
3. En `analyze()`: `window.JwsimStateDiag?.onSnapshot(S.snap, false);`
4. En `api.onSnapshot`: `window.JwsimStateDiag?.onSnapshot(snap, S.running);`
5. En `onStatus(kind)`: si `run` cambia a `true`, notificar/permitir al siguiente snapshot limpiar el ciclo anterior.

- [ ] **Step 3: Escribir prueba E2E `app/tests/e2e-state-diagram.mjs` y ejecutarla**

Verificar con `exercises/10-secuencia-neumatica/10-secuencia-neumatica.jwsim`:
1. `#scene-tab-states` está habilitado y abre `#scene-left` tanto en **«A colores»** como en **«Neumático»**, manteniendo visibles los cilindros.
2. Arrastrar `#scene-left-splitter` y `#scene-side-splitter` cambia el ancho de ambos paneles y se guarda en `localStorage`.
3. Al ejecutar la secuencia (`#btn-run` + `BTN_OK`), se registran muestras con movimiento de los 4 cilindros (`position` variando entre `0` y `1`) y bobinas; al detener (`#btn-stop`), el historial **se conserva**.
4. El menú `+ Señales` permite ocultar/mostrar canales y `↺ Limpiar` vacía las muestras.
5. Al abrir un proyecto sin electroválvulas, `#scene-tab-states` queda deshabilitado y `#scene-left` colapsado sin borrar la preferencia guardada.

Run: `node app/tests/e2e-state-diagram.mjs`  
Expected: PASS.

- [ ] **Step 4: Correr regresiones existentes (`e2e-neumatica.mjs`, `e2e-a17-ui.mjs`, `state-diagram.test.mjs`)**

Run:
- `node --test app/tests/state-diagram.test.mjs`
- `node app/tests/e2e-neumatica.mjs`
- `node app/tests/e2e-a17-ui.mjs`
Expected: PASS en las tres.

- [ ] **Step 5: Commit de Task 3**

```bash
git add app/renderer/state-diagram.js app/renderer/style.css app/renderer/scene.js app/tests/e2e-state-diagram.mjs
git commit -m "feat(neumatica): diagrama de estados en vivo estilo FluidSIM"
```

---

### Self-Review
- **Cobertura del spec:** Barra izquierda + derecha ajustables (Task 2), preservación de `#scene-side` / `.side-bar` (Task 2), núcleo de señales/búfer/conservación al detener (Task 1), UI `<canvas>`, `+ Señales`, congelado/zoom/pan, crosshair y conexión con `scene.js` (Task 3). Sin huecos.
- **Consistencia de nombres:** `JwsimStateDiagCore` (Task 1), `JwsimScenePane.setLeftAvailability` / `JwsimScenePane.setLeftPane` (Task 2 & 3), `JwsimStateDiag.onSnapshot(snap, running)` / `onSpec` / `setVisible` / `resize` / `debug` (Task 2 & 3).
- **Review Focus cubierto:** cada punto de Review Focus tiene su prueba asignada en Task 1 (`state-diagram.test.mjs`) y Task 3 (`e2e-state-diagram.mjs`).
