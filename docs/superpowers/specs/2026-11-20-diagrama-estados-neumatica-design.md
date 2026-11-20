# Diseño: Diagrama de estados neumático y paneles tipo Altium en la escena

**Fecha:** 2026-11-20  
**Rama:** `feature/alpha18-revisiones`

## Intención y motivo
Integrar un **diagrama de estados en vivo estilo FluidSIM** con la estética oscura de `jwplc-sim`, que pueda verse al mismo tiempo que los cilindros tanto en **«A colores»** (`#scene-pan`) como en **«Neumático»** (`#pn-view`), sin tapar el circuito ni reemplazar al inspector de propiedades/fallas ni al panel del reto.

Para lograrlo, `.scene-main` evoluciona a una gestión **tipo Altium con dos barras laterales acopladas y redimensionables**: izquierda para el **Diagrama de estados** y derecha para **Equipos**, **Propiedades** y **Reto**.

## Objetivos y no-objetivos
- **Objetivos:**
  - Muestreo continuo de posición de cilindros (`0..1`), bobinas de electroválvulas, finales de carrera/sensores asociados y presión (bar) desde que arranca la simulación, aunque el panel esté cerrado.
  - Gráfica `<canvas>` funcional: selector `+ Señales`, ventana temporal configurable (`5 s`, `10 s`, `20 s`, `60 s`, `Todo`), modo en vivo o congelado (`⏸`) con zoom y desplazamiento horizontal sobre el historial, cursor de inspección con valores por instante y botón limpiar (`↺`).
  - Dos barras laterales ajustables en `.scene-main` con divisores arrastrables (`col-resize`), doble clic para restablecer ancho y estado persistido en `localStorage`.
  - Mantener intactos los selectores y el comportamiento que validan las pruebas E2E existentes (`#scene-side`, `#scene-tab-add`, `#scene-tab-props`, `#scene-tab-reto`, `.scene-main[data-pane]`).
- **No-objetivos (en esta entrega):**
  - No se modifican las físicas ni se agregan nuevos dispositivos neumáticos en `scene/devices/pneumatics.mjs` o `loads.mjs`.
  - No se rediseña todavía la vista 3D de laboratorio (queda como proyecto separado posterior).
  - No se implementa *drag & drop* para intercambiar paneles entre izquierda y derecha.

## Arquitectura de layout (2 barras laterales ajustables)
En [index.html](../../../app/renderer/index.html) y [style.css](../../../app/renderer/style.css), `.scene-main` pasa a un grid de hasta 7 pistas:

```text
[36px #scene-left-bar] [var(--scene-left-w) #scene-left] [5px #scene-left-splitter]
[minmax(0, 1fr) lienzo (#scene-pan / #pn-view)]
[5px #scene-side-splitter] [var(--scene-side-w) #scene-side] [36px .side-bar]
```

- **Barra izquierda (nueva):**
  - `#scene-left-bar` (`36 px`) con el botón toggle `#scene-tab-states` (`data-left-pane="states"`).
  - `#scene-left` contiene la vista del Diagrama de estados (`#state-diag-pane`). Se pliega con `.scene-main.left-collapsed` (donde el panel y su divisor ocupan `0 px` / `display: none`).
  - `#scene-left-splitter`: divisor arrastrable (`260 px` a `680 px`, predeterminado `440 px`, doble clic para restablecer). Al arrastrar o redimensionar la ventana, tanto `#scene-left` como `#scene-side` se acotan dinámicamente según el ancho real de `.scene-main` para garantizar un mínimo de `260 px` en el lienzo central.
  - **Estado inicial y escenas sin neumática:** si `jwsim.sceneLeftPane` no existe en `localStorage`, el panel izquierdo arranca plegado (`"none"`) para desplegarse como toggle con un clic en `#scene-tab-states` (y recordar esa elección). En escenas sin electroválvulas con cilindro (`!available`), `#scene-tab-states` se deshabilita con tooltip explicativo y `#scene-left` se fuerza colapsado **sin sobrescribir** la preferencia guardada en `localStorage`, restaurándose al abrir de nuevo una escena con neumática.
- **Centro (`.scene-stage`):**
  - Un contenedor `.scene-stage` (`position: relative; min-width: 0; min-height: 0; display: grid`) agrupa `#scene-pan` («A colores»), `#pn-view` («Neumático») y `.scene-float` para que las herramientas flotantes queden siempre ancladas a la esquina del lienzo central y no se monten sobre la barra izquierda. Ambos comparten las dos barras laterales sin tapar el circuito.
- **Barra derecha (existente, ahora ajustable):**
  - Mantiene `#scene-side` con `Equipos` (`add`), `Propiedades` (`props`) y `Reto` (`reto`) y `.side-bar` con `#scene-tab-add`, `#scene-tab-props`, `#scene-tab-reto`.
  - Agrega `#scene-side-splitter` a la izquierda de `#scene-side`: arrastrable (`240 px` a `560 px`, doble clic restablece `340 px` o `380 px` en `reto`).
- **Persistencia (`localStorage`):**
  - `jwsim.sceneLeftPane` (`"states"` | `"none"`), `jwsim.sceneLeftW`, `jwsim.sceneSideW` (junto a la existente `jwsim.scenePane`).

> **Nota sobre `Equipos`:** se conserva en `#scene-side` (barra derecha) y no se mueve a la izquierda para que puedas tener abiertos a la vez **Diagrama de estados (izquierda) + Cilindros (centro) + Propiedades/Reto (derecha)** y para mantener compatibilidad total con las pruebas actuales (`e2e-a17-ui.mjs`, `e2e-catalogo.mjs`, `e2e-paleta.mjs`).

## Módulo del Diagrama de Estados (`app/renderer/state-diagram.js`)
Nuevo módulo IIFE expuesto como `window.JwsimStateDiag`:

1. **Autodetección de señales desde `specForView()`:**
   - Para cada válvula `jwsim/solenoid-valve` o `jwsim/solenoid-valve-2`:
     - **Cilindro** (`analog`, `0..1`): `out.position`, rotulado con la letra de sus finales (`A0/A1` → `Cilindro A`, o `v.params.label` / `v.id`).
     - **Bobinas** (`digital`): en monoestable `v.id` (`out.energized`); en biestable `${v.id}+` (`out.coilPlus`) y `${v.id}−` (`out.coilMinus`).
     - **Finales / sensores** (`digital`): `jwsim/sensor-cylinder` con `cylinder === v.id` (`out.detecting`) y `jwsim/limit-switch` con `source === "${v.id}.position"` (`out.actuated`).
   - Para cada `jwsim/service-unit` y `jwsim/compressor`:
     - **Presión** (`analog`, `bar`): `out.pressure`, escala `0..10 bar` (o hasta `pOff` si es mayor) con línea punteada de umbral mínimo en `1.5 bar` (`MIN_BAR`).

2. **Registro continuo de muestras:**
   - `scene.js` llama `window.JwsimStateDiag?.onSnapshot(snap, running)` en cada `analyze()` y en cada snapshot de simulación (`onSnapshot`), además de `onSpec()` al editar o cargar escena y `onProjectReset()` al cargar un proyecto nuevo.
   - **Conservación del historial al detener:** cuando `running === false` (incluido el `analyze()` que dispara `■ Detener` con `t_ms = 0`), **no se borra ni se registra** ese snapshot en el historial, de modo que puedas seguir inspeccionando la corrida terminada. El historial solo se reinicia automáticamente cuando `running` pasa de `false` a `true` (nuevo `▶ Ejecutar`), si estando en marcha `snap.t_ms < lastT_ms`, al cambiar de proyecto, o al pulsar `↺ Limpiar`.
   - Almacena un historial acotado (p. ej. hasta 24 000 muestras o 10 min) con compresión de tramos constantes (guarda el punto previo y el nuevo cuando cambia algún valor, preservando rampas lineales de cilindros y flancos digitales exactos).

3. **Selector `+ Señales` y estado por defecto:**
   - Menú desplegable en la barra del panel con casillas por grupo (cilindro + sus bobinas + sus sensores, y aire comprimido).
   - Selección por defecto al detectar cilindros: todos los cilindros (`0..1`) + sus sensores y bobinas activos; el usuario puede activar/desactivar pistas en cualquier momento y se conserva mientras no cambien los IDs de la escena.

4. **Renderizado `<canvas>` y controles (estética de la app):**
   - Paleta de `style.css`: fondo `--panel` (`#1b1f24`), banda de pista alterna `#1e2329`, rejilla `--border` (`#2b3139`), texto `--text` / `--muted`, fuente `--mono`.
   - Colores por tipo de señal:
     - Posición de cilindro: trazo `--accent` (`#2f8cff`) con relleno suave `rgba(47, 140, 255, 0.14)`.
     - Bobinas: señal digital en `--warn` (`#ffb020`).
     - Sensores / finales de carrera: señal digital en `--ok` (`#37d67a`).
     - Presión: trazo en `#55aef0`, umbral `1.5 bar` punteado en `--err` (`#ff5d5d`).
   - **Cabecera de controles:**
     - `⏸ Fijar` / `▶ En vivo`: congela la ventana temporal para inspeccionar sin detener el PLC (al volver a `En vivo` sigue el borde derecho `t_ms`).
     - `↺ Limpiar`: borra las muestras acumuladas.
     - Selector de ventana temporal: `5 s`, `10 s`, `20 s`, `60 s`, `Todo`.
     - Botón `+ Señales`: abre el selector de canales.
   - **Interacción sobre el lienzo:**
     - **Cursor vertical (crosshair):** al mover el puntero muestra la línea vertical en ese instante `t` y los valores exactos de cada pista visible en una banda superior o etiqueta junto a cada pista.
     - **Rueda y arrastre horizontal:** al estar congelado (o al arrastrar hacia atrás en el tiempo, que pasa automáticamente a modo fijado), permite hacer zoom en la ventana temporal y recorrer todo el historial registrado.
   - Redibuja con `requestAnimationFrame` solo cuando está visible (`!collapsed`) y hay cambios o durante simulación activa.

## Cableado con módulos existentes
- [app/renderer/index.html](../../../app/renderer/index.html): agrega `#scene-left-bar`, `#scene-left`, `#scene-left-splitter`, `#scene-side-splitter` y el script `state-diagram.js`.
- [app/renderer/style.css](../../../app/renderer/style.css): estilos del grid de 2 barras laterales, divisores `#scene-left-splitter` / `#scene-side-splitter`, barra izquierda y componentes del diagrama.
- [app/renderer/app.js](../../../app/renderer/app.js): extiende `wireSceneSide()` para gestionar apertura/cierre de `#scene-left` y el arrastre/doble clic de ambos divisores (`#scene-left-splitter` y `#scene-side-splitter`).
- [app/renderer/scene.js](../../../app/renderer/scene.js): notifica `window.JwsimStateDiag?.onSnapshot(snap, { running })` y `window.JwsimStateDiag?.onSpec()` en los mismos puntos que `JwsimPneu`.

## Plan de verificación
1. Ejecutar pruebas existentes de interfaz y neumática (`node app/tests/e2e-a17-ui.mjs`, `node app/tests/e2e-neumatica.mjs`) para confirmar cero regresiones en selectores, divisores y esquema neumático.
2. Añadir una prueba E2E (o ampliar `e2e-neumatica.mjs` / crear `e2e-state-diagram.mjs`) que con `10-secuencia-neumatica.jwsim` valide:
   - Toggle de `#scene-tab-states` abriendo/cerrando `#scene-left` tanto en **«A colores»** como en **«Neumático»**.
   - Redimensionamiento de `#scene-left-splitter` y `#scene-side-splitter` con persistencia en `localStorage`.
   - Captura de datos de los 4 cilindros (`A..D`), bobinas (`Y1..Y4`) y sensores durante la secuencia en marcha, más filtro de `+ Señales` y modo congelado.
