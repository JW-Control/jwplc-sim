# Propuesta: integración para que cualquier agente cree y edite proyectos por JSON + CLI

**Estado (2026-11-20):** propuesta de diseño pendiente de implementación.
**Referencia de origen:** arquitectura probada en `JWPLC HMI Designer` (`jwhmi`), adaptada a las piezas reales de `jwplc-sim`.
**Alcance:** creación y edición de proyectos completos (`.jwsim` + código `.ino`/OpenPLC + esquema eléctrico 2D + Planta 3D derivada) mediante JSON y `jwsim-cli`. La exposición vía **MCP en vivo** queda diferida para una fase posterior si hiciera falta operar la ventana abierta en tiempo real.

---

## 1. Objetivo

Permitir que cualquier agente de IA (Claude, Codex, Gemini o scripts externos) pueda:

1. Descubrir los dispositivos, bornes, parámetros, salidas y acciones disponibles sin cargar todo el código fuente en su contexto.
2. Escribir o editar proyectos `.jwsim` usando una **forma corta ergonómica** (sin tener que calcular manualmente coordenadas en píxeles para evitar solapamientos).
3. Validar estructural, geométrica y eléctricamente la escena en milisegundos con mensajes orientados a autocorrección (`--json`).
4. Visualizar el resultado real (PNG del **Esquema eléctrico 2D** y de la **Planta 3D**) y verificar el comportamiento con `jwsim-cli run` / `jwsim-cli test`.
5. Ver los cambios reflejados en la app abierta sin perder trabajo manual del usuario.

---

## 2. Lo que ya existe en `jwplc-sim` y se reutiliza

A diferencia de un proyecto desde cero, `jwplc-sim` ya resuelve gran parte del núcleo:

| Capacidad | Dónde vive hoy | Cómo se aprovecha |
|---|---|---|
| Formato declarativo único | `schema/jwsim-1.json`, `schema/jwsim-scene-1.json`, `cli/lib/project.mjs` (`validate`, migración v0→v1) | Mismo formato para UI, CLI, ejercicios y agentes. |
| Catálogo real en Node puro (ESM) | `scene/devices/index.mjs` (`builtinDevices`, `Registry`) y `scene/devices/*.mjs` | No hace falta duplicar un `spec.cjs`: el registro ya declara `type`, `name`, `description`, `parameters` (`default`, `options`, `unit`), `terminals`, `actions`, `signals` y `outputs`. |
| Motor eléctrico y de planta headless | `scene/scene.mjs` (`Scene`, `migrateScene`, `resolveParams`), `scene/netlist.mjs`, `scene/mount.mjs` | Permite analizar conectividad, cortos, tensiones equivocadas y enlaces mecánicos en `t = 0` sin abrir Electron. |
| Compilación, runner y co-simulación | `cli/jwsim-cli.mjs` (`build`, `run --json`, `test`, `grade`), `cli/lib/cosim.mjs` | El agente ya puede compilar el `.ino`/OpenPLC y probar la escena entera con `.jwtest.json`. |
| Planta 3D derivada | `app/renderer/scene3d.js` | **No tiene JSON separado:** se genera automáticamente desde `scene.devices` y sus `params` (`motor`, `source`, `cylinder`, `bomba`, `servicio`, etc.). |
| Oráculo gráfico y auditoría | `app/renderer/scene-symbols.js`, `app/renderer/assets/devices/*.svg`, `app/tests/audit-grilla.mjs`, `app/tests/cap-arte.mjs`, `window.jwsimTest` (`app/renderer/app.js`, `app/renderer/scene.js`) | Ya existen los tamaños reales (`viewBox`), las plantillas por parámetro y la automatización en Electron/Playwright para capturar 2D y 3D. |

### Brechas actuales que impiden al agente trabajar cómodo
1. **Sin forma corta ni auto-layout:** en `.jwsim` el agente debe calcular `x, y` en múltiplos de `20` conociendo el ancho real de cada `.svg` (desde `60 px` hasta `640 px` en `vfd-el.svg`).
2. **Sin autodescubrimiento (`describe`) ni referencia generada:** hoy un agente tiene que leer `scene/devices/*.mjs` y `docs/ARCHITECTURE.md` para saber qué bornes y parámetros tiene cada variante (p. ej. `motor-3ph` con `bornera: "6 cables"` o `power-24vdc` `HDR-60` sin `PE`).
3. **Sin validador semántico pre-simulación:** si un agente escribe `"S1.15"` o `"jwsim/motor3ph"` o coloca dos equipos encimados, se entera recién al abrir la app.
4. **Sin `preview` de 2D y 3D en `jwsim-cli`:** `cap-arte.mjs` solo sirve para ejercicios/arquitecturas ya listados, no para un `.jwsim` arbitrario en trabajo.
5. **Observador de archivos limitado al sketch:** en `app/main.mjs` (`watch:set`), la app vigila `sketch.dir` (recarga de `.ino`/OpenPLC en G2), pero no recarga automáticamente la escena cuando un agente edita el archivo `.jwsim` externo en disco.

---

## 3. Arquitectura propuesta (adaptada a `jwplc-sim`)

```text
+-----------------------------------------------------------------------+
| AGENTE (Claude, Codex, Gemini, script)                                |
| Lee: .claude/skills/crear-proyecto-jwsim/SKILL.md                     |
|      docs/AGENTES_ESCENAS.md + docs/REFERENCIA_ESCENA.md (generada)   |
+-----------------------------------+-----------------------------------+
                                    | JSON corto o .jwsim v1 + .ino
                                    v
+-----------------------------------------------------------------------+
| CLI `jwsim-cli scene ...` (cli/jwsim-cli.mjs)                         |
| Subcomandos: describe | new | normalize | validate | preview | build  |
+----+------------------------------+------------------------------+----+
     |                              |                              |
     v                              v                              v
+------------------+    +------------------------+    +-----------------+
| scene-spec.mjs   |    | scene-normalize.mjs    |    | scene-validate  |
| - Lee Registry   |--->| - Alias de tipo        |--->| - Schema v1     |
|   + .svg viewBox |    | - IDs y defaults       |    | - Levenshtein   |
| - Genera         |    | - Forma corta de cables|    | - Bornes/var.   |
|   REFERENCIA.md  |    | - Auto-layout (20 px)  |    | - Colisiones 2D |
+------------------+    +------------------------+    | - Enlaces 3D    |
                                                      | - Netlist t=0   |
                                                      +--------+--------+
                                                               |
                                                               v
+-----------------------------------------------------------------------+
| Oráculo Electron/Playwright (cli/lib/scene-oracle.mjs)                |
| - Abre el .jwsim en la app real (headless)                            |
| - Valida JwsimSymbols.warnings === 0 y rutas de cables                |
| - Exporta PNG de «Esquema eléctrico» (2D) y «Planta 3D»               |
+-----------------------------------------------------------------------+
```

---

## 4. Especificación detallada de componentes

### 4.1 Puente único `apply / serialize` y recarga en la app
- En `app/renderer/app.js` ya existen `applyProject(res)` y `saveProjectFile()`, y en `app/renderer/scene.js` existe `cleanSpec()`.
- **Qué falta:**
  1. Garantizar que el `.jwsim` serializado por CLI (`normalize` / `build`) pase exactamente por la misma estructura y orden de campos que `cleanSpec()` + `cli/lib/project.mjs`.
  2. En `app/main.mjs` (`watch:set`), cuando hay un proyecto `.jwsim` abierto, observar también cambios externos en el `.jwsim` (ignorando el eco de escrituras propias mediante el mecanismo que ya existe en `app/main.mjs`) y ofrecer recarga en la UI cuando el usuario no tenga cambios sin guardar (o un aviso no bloqueante «El proyecto cambió en disco: Recargar»).

### 4.2 Catálogo vivo desde `scene/devices/` (`cli/lib/scene-spec.mjs`)
En lugar de mantener tablas manuales paralelas:
1. Leer `builtinDevices` desde `scene/devices/index.mjs` (más `jwplc-basic`).
2. Leer `app/renderer/assets/devices/*.svg` (y sus variantes `__<valor>.svg`) extrayendo el `viewBox` (`w`, `h`) y los bornes `.jw-term` (`data-term`, `cx`, `cy`, `data-side`). Para tipos sin `.svg`, tomar las dimensiones de `LAYOUT` en `app/renderer/scene-symbols.js` (o mover esa tabla mínima a un módulo compartido ESM `scene/layout-fallback.mjs` para que Node y navegador compartan la fuente).
3. Exponer:
   - `describeCatalog()`: lista compacta de tipos por categoría (`id`, `name`, `prefix`, `size`, `terminals`, `variants`).
   - `describeDevice(type)`: ficha completa (parámetros con tipo/rango/opciones/default, bornes por variante, `actions`, `outputs`, enlaces 3D típicos).
   - Generador de `docs/REFERENCIA_ESCENA.md` (equivalente a `REFERENCIA_JWHMI.md`, verificado por test para que nunca quede desactualizado).

### 4.3 «Forma corta» + Normalizador + Auto-layout (`cli/lib/scene-normalize.mjs`)
Permitir que el agente escriba un JSON mínimo y legible, y convertirlo de forma pura e idempotente a `.jwsim` v1 válido:

1. **Cabecera mínima:** si faltan `$schema`, `format`, `version`, `board` (`{ id: "jwplcbasic" }`) o `program.kind` (`"arduino"`), completarlos automáticamente.
2. **Atajos en `scene.devices`:**
   - Aceptar `type` corto sin prefijo: `"contactor"` → `"jwsim/contactor"`, `"motor-3ph"` → `"jwsim/motor-3ph"`.
   - Si omite `id`, autogenerar usando los mismos prefijos de `app/renderer/scene.js` (`S1`, `KM1`, `M1`, `PS1`, `Q1`, `F1`, `B1`, etc.).
   - Si omite `x` / `y` (o usa `zone: "alimentacion" | "mando" | "tablero" | "campo" | "proceso"`), ejecutar **auto-layout en grilla de `20 px`**:
     - Ubica `PS1` / `L1` / `Q` a la izquierda, `plc` en el centro-izquierda, riel DIN (`breaker`, `contactor`, `overload-relay`, `relay`, `timer-relay`, `vfd-el`) en fila superior, mando (`pushbutton-*`, `selector-*`, `lamp`, `stack-light`) en fila media/derecha, y campo/planta (`motor*`, `solenoid-valve*`, `tank`, `conveyor*`, `sensor-*`) abajo con márgenes mínimos de `40–60 px` calculados con el tamaño real de cada SVG.
     - Si el agente **sí** dio `x, y`, los respeta (ajustando o reportando si no son múltiplos de `20` según sea `normalize` o `validate`).
   - Soportar `mount` por ID (ej. térmico `F1` con `mount: "KM1"`).
3. **Atajos en `scene.wiring` y `scene.cables`:**
   - Aceptar tanto `{ "from": "PS1.+V1", "to": "KM1.A1", "color": "rojo" }` como cadenas cortas `"PS1.+V1 -> KM1.A1"` (o `"PS1.+V1 - KM1.A1"` como ya usan los tests de `scene/tests/`), opcionalmente con sufijo de color `"PS1.+V1 -> KM1.A1 [rojo]"`.
   - En `cables`, permitir declarar un cable multipolar con la lista de hilos o referencias (`"ref": true` automático si supera cierta distancia o el agente lo pide).

### 4.4 Validador semántico orientado a LLMs (`cli/lib/scene-validate.mjs`)
Corre en Node puro en milisegundos y devuelve `{ ok, errors: [{ path, message, suggestion? }], warnings: [{ path, message, suggestion? }] }`:

1. **Validación estructural:** reutiliza `validate()` de `cli/lib/project.mjs` contra `schema/jwsim-1.json` y `schema/jwsim-scene-1.json`.
2. **Tipos y parámetros con sugerencias:**
   - Si `type` no existe, sugiere el más cercano por distancia de Levenshtein + alias frecuentes (`"motor-trifasico"` → `"jwsim/motor-3ph"`, `"pulsador-na"` → `"jwsim/pushbutton-no"`).
   - Valida `params` contra `def.parameters` (enums, números, defaults) sugiriendo valores válidos.
3. **Validación exacta de bornes por variante:**
   - Comprueba que cada extremo `dev.borne` en `wiring` exista en el dispositivo **y** sea visible en la plantilla/variante activa (ej.: avisar si conecta `W2` en `motor-3ph` con `bornera: "triangulo"`, o `PE` en `power-24vdc` con `model: "HDR-60"`), sugiriendo el borne más parecido o el parámetro a cambiar.
4. **Grilla y colisiones 2D:**
   - Verifica `x % 20 === 0` y `y % 20 === 0` para todos los dispositivos.
   - Calcula rectángulos reales `(x, y, w, h)` usando el SVG de la variante activa y reporta solapamientos entre dispositivos (excluyendo dispositivos acoplados por `mount`).
5. **Coherencia de enlaces de Planta 3D / sensores:**
   - Verifica referencias cruzadas en parámetros de enlace: `params.motor` (`conveyor`, `conveyor-physics`, `tank`, `door`, `lift`, `sand-filter`), `params.bomba` (`tank`), `params.source` (`sensor-*`, `limit-switch`), `params.cylinder` (`sensor-cylinder`), `params.agua` (`chlorinator`), etc., comprobando que el `<id>.<salida>` exista en `scene.devices` y en `def.outputs`.
6. **Análisis eléctrico estático (`t = 0`) con `Scene`:**
   - Instancia `new Scene(spec, { registry })`, ejecuta `snapshot()` en `t = 0` y reporta `findings` (cargas sin retorno, cortocircuitos, tensiones incompatibles, falta de `plc` cuando `program` lo usa) como `warnings` o `errors` con `--strict`.

### 4.5 Oráculo visual (`cli/lib/scene-oracle.mjs`)
Reutiliza la infraestructura ya existente de Playwright + Electron en `app/tests/`:
1. Abre la app con el `.jwsim` normalizado (`openProjectFile`).
2. Verifica `window.JwsimSymbols.warnings` (0 avisos de contrato SVG) y `window.jwsimTest.scene.routes()` (cables enrutados).
3. Captura PNG de:
   - Vista **Esquema eléctrico** (`scene`, ajustada con `#scene-fit`).
   - Vista **Planta 3D** (`view("3d")`, esperando renderizado estable de Three.js).
4. Opcionalmente (`--smoke-ms <ms>`): arranca simulación / co-simulación breve y reporta si hubo errores de compilación o fallas inmediatas.

### 4.6 Subcomandos en `cli/jwsim-cli.mjs`
Agregar el grupo `scene` al CLI existente (respetando `--json`, `--strict`, `--report` y los códigos de salida documentados en `docs/CLI.md`):

```text
node cli/jwsim-cli.mjs scene describe [<tipo>] [--json]
node cli/jwsim-cli.mjs scene new <salida.jwsim> [--sketch <ruta>] [--template <base>] [--json]
node cli/jwsim-cli.mjs scene normalize <entrada.json> [-o <salida.jwsim>] [--json]
node cli/jwsim-cli.mjs scene validate <archivo.jwsim> [--fast] [--strict] [--json]
node cli/jwsim-cli.mjs scene preview <archivo.jwsim> [--out <dir>] [--view 2d|3d|both] [--json]
node cli/jwsim-cli.mjs scene build <entrada.json> --out <dir> [--create-ino] [--json]
```

**Reglas de seguridad al escribir en disco (`scene build`):**
- Nunca sobrescribir un archivo `.ino` o proyecto OpenPLC existente del usuario salvo que no exista y se pase `--create-ino`.
- Escribir el `.jwsim` normalizado preservando campos desconocidos (comportamiento que ya tiene `cli/lib/project.mjs`).

### 4.7 Documentación y Skill para agentes
- `.claude/skills/crear-proyecto-jwsim/SKILL.md`: flujo corto de 5 pasos:
  1. Consultar `jwsim-cli scene describe` según los equipos necesarios.
  2. Crear/editar el borrador JSON en forma corta + código `.ino` (o partir de `examples/` / `JWPLC_Aprende/extras/retos/`).
  3. Iterar `jwsim-cli scene normalize` + `jwsim-cli scene validate --json` hasta `0` errores y `0` avisos.
  4. Correr `jwsim-cli scene preview` y revisar visualmente las capturas PNG 2D y 3D.
  5. Verificar lógica con `jwsim-cli run --json` o `jwsim-cli test <prueba>.jwtest.json`.
- `docs/AGENTES_ESCENAS.md`: guía de diseño de tableros, reglas de cableado, enlaces 3D y errores frecuentes.
- `docs/REFERENCIA_ESCENA.md`: generada automáticamente desde `scene-spec.mjs`.

---

## 5. Plan de implementación sugerido (por fases)

1. **Fase 1 — `scene-spec.mjs` + `scene describe` + `REFERENCIA_ESCENA.md`:**
   - Extraer catálogo y dimensiones reales de `.svg` + `Registry`.
   - Test de paridad: verificar que `docs/REFERENCIA_ESCENA.md` está al día y que todos los tipos de `builtinDevices` coinciden con `app/renderer/scene-symbols.js`.
2. **Fase 2 — `scene-normalize.mjs` + `scene-validate.mjs` + CLI (`new`, `normalize`, `validate`, `build`):**
   - Implementar forma corta, auto-layout en grilla de `20 px`, Levenshtein, verificación de bornes por variante, colisiones, enlaces 3D y análisis eléctrico `t = 0`.
   - Tests unitarios con `node --test` cubriendo todos los tipos de errores y autocorrecciones.
3. **Fase 3 — `scene-oracle.mjs` (`scene preview`) + recarga en `app/main.mjs`:**
   - Captura PNG 2D y Planta 3D para un `.jwsim` arbitrario.
   - Vigilancia del `.jwsim` abierto en la app para refresco en caliente.
4. **Fase 4 — Skill y ejemplos de referencia:**
   - Crear `.claude/skills/crear-proyecto-jwsim/SKILL.md` y `docs/AGENTES_ESCENAS.md`.
   - Probar de punta a punta pidiendo a un agente crear un ejercicio nuevo desde cero usando solo la skill y `jwsim-cli`.
5. **Fase futura opcional — MCP en vivo:**
   - Si más adelante se requiere operar la ventana abierta paso a paso desde clientes externos (Claude Desktop, Cursor), exponer un servidor MCP delgado que reutilice `scene-spec`, `scene-normalize`, `scene-validate` e IPC hacia `Scene` (`addDevice`, `addWire`, `act`, `setView`).
