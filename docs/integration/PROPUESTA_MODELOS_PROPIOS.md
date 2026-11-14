# Propuesta: modelos de simulación propios (terceros)

Estado: análisis y propuesta (2026-11-14), rama `feature/alpha18-propiosModelos`.
Incluye la auditoría de la grilla (`app/tests/audit-grilla.mjs`).

## 1. Cómo funciona hoy

### 1.1 Un dispositivo es una definición + un símbolo

Cada equipo de la escena (pulsador, contactor, sensor, tanque, variador…)
es un módulo JavaScript que exporta una **definición** (contrato en
`sdk/jwsim-device.d.ts`, guía en `docs/SDK.md`):

| Parte | Qué declara | Ejemplo |
|---|---|---|
| `type`, `version`, `name`, `category` | Identidad (`autor/nombre`, semver) y lugar en la paleta | `jwsim/contactor` |
| `terminals` | Bornes que se cablean | `A1 A2 1 2 3 4 5 6 13 14` |
| `parameters`, `presets` | Lo que se configura en Propiedades | bobina 24VDC/230VAC |
| `actions` | Lo que el alumno acciona con la simulación en marcha | pulsar, girar, arrastrar |
| `electrical(p)` | El modelo eléctrico: **cargas**, **contactos** y **fuentes** entre bornes | bobina A1-A2; contacto 13-14 |
| `create(ctx).update(t, inp)` | El **comportamiento**: recibe el estado de sus cargas, acciones y lecturas y devuelve qué contactos cierra, sus salidas y cuándo vuelve a cambiar (`nextEventNs`) | bobina con tensión → cierra 13-14 |
| `links`, `reads`, `probes`, `modbus` | Acoples sin cable: enlaces mecánicos, lecturas de otro equipo, sondas, esclavo Modbus | fin de carrera accionado por el vástago |

El **dibujo** es un `.svg` aparte (contrato en `docs/SIMBOLOS.md`): bornes
marcados con `.jw-term` y partes animadas con atributos (`data-show`,
`data-text`, `data-translate`, `data-rotate`, `data-action`…). Sin `.svg`,
el equipo sale como un módulo genérico con los bornes repartidos.

### 1.2 Cómo corre la simulación (lógica interna)

En cada instante virtual (`scene/scene.mjs`, `scene/netlist.mjs`):

1. **Netlist por conectividad.** Los cables y los contactos cerrados unen
   bornes en nodos. Una carga se energiza si un extremo llega al positivo y
   el otro al retorno de la misma fuente, con la tensión adecuada (si es
   mayor, se quema; si es otra, no enciende).
2. **Punto fijo.** Se llama `update(t, inp)` de cada equipo con el estado
   de sus cargas; si alguno cambió un contacto, se vuelve a resolver la
   netlist en el mismo instante hasta que nada cambie. Por eso `update` debe
   ser idempotente en el mismo `t`.
3. **Horizonte.** Cada equipo dice cuándo cambiará solo (`nextEventNs`: fin
   de un temporizador, cruce de un nivel). La escena salta al primero, sin
   muestrear. Las magnitudes continuas se publican como segmentos
   `{ value, rate }` y los sensores enlazados conmutan en el cruce exacto.
4. **Co-simulación con el PLC.** La placa JWPLC Basic es un equipo más: lee
   `Q0_x` del firmware real (compilado y corriendo en el runner) y le
   entrega `I0_x`. El runner se detiene en cada horizonte de la escena.

Todo es determinista: misma escena y mismas acciones, misma traza. Eso
permite calificar y repetir.

### 1.3 Cómo se instala hoy un dispositivo de terceros

- **Desarrollo:** se copia `sdk/template/scene-device/`, se escribe
  `device.mts`, se compila (`tsc`) y se prueba con
  `node cli/jwsim-cli.mjs device test <carpeta>` (valida el contrato y corre
  sus `*.test.mjs` con `sdk/testing.mjs`). Ejemplo completo:
  `sdk/examples/timer-relay`.
- **Distribución:** `device pack` arma el `.tar.gz`; JW Control lo agrega al
  **índice comunitario firmado** (`index/jwsim_index.json` + firma Ed25519) y
  el usuario lo instala con `jwsim-cli device install autor/nombre`. Queda en
  `~/.jwsim/devices/<tipo>/<versión>/` y la app lo carga al iniciar
  (`registryWithInstalled`), con su `symbol.svg`.
- **Nativos (C):** para señales rápidas (trenes de pulsos, encoders) hay una
  ABI C que corre dentro del runner (`sdk/native/`).

## 2. Auditoría de la grilla (bornes alineados a la malla)

`node app/tests/audit-grilla.mjs` abre la app, toma **cada tipo de
dispositivo con cada valor de sus parámetros de lista** y revisa su
disposición real (plantilla `.svg` o dibujo en código). También revisa la
posición de los equipos en las escenas incluidas.

| Regla | Dónde se exige | Resultado |
|---|---|---|
| Ancho y alto del símbolo múltiplos de 20 | al cargar cada `.svg` (`registerTemplate`) y en el dibujo en código | 61 de 61 variantes |
| `x` de cada borne múltiplo de 20 | al cargar cada `.svg`; `row()` reparte sobre la grilla en el dibujo en código | 61 de 61 |
| El cable entra por el borde de arriba (`y = 0`) o de abajo (`y = alto`) | por construcción | 61 de 61 |
| Los equipos se colocan sobre la grilla | al agregar, mover, pegar y duplicar (`snap`) | 14 de 14 escenas |
| Módulo genérico de un tercero sin `.svg` | ancho `(n + 1) × 20`, bornes repartidos | en la grilla |

**JWSIM_GRILLA=PASS**: 53 tipos, 61 variantes y 14 escenas. Los bornes que
una variante no dibuja (la HDR-60 no tiene PE; el contactor 01 no tiene
13-14) están documentados en `SIMBOLOS.md` §1.1.

Hueco: la regla se aplica **en la app** al cargar el símbolo; un tercero
recién se entera al abrirlo. Propuesta: que `jwsim-cli device test` también
valide `symbol.svg` (grilla y que cada borne de la definición esté dibujado).

## 3. Qué falta para que un tercero lo use fácil

| Hueco | Hoy | Consecuencia |
|---|---|---|
| Instalar desde una carpeta | solo desde el índice firmado | para probar un modelo propio hay que publicarlo |
| Recargar sin reiniciar | el registro se arma una vez al iniciar | cada cambio exige cerrar y abrir la app |
| Gestor en la interfaz | solo por la CLI | quien no usa la terminal no puede |
| Crear desde la interfaz | no existe | hay que programar desde cero |
| 3D | solo cinta, tanque, puerta y cilindro incluidos | un equipo de planta de terceros no se ve en 3D |
| Aislamiento | el código del dispositivo corre en el proceso principal | un dispositivo malicioso tendría acceso al equipo; hoy lo evita la firma del índice |
| Validar el símbolo en `device test` | se valida al abrir en la app | el error llega tarde |

## 4. Propuesta por etapas

### Etapa A · Modo desarrollador (instalar desde carpeta)

- `jwsim-cli device link <carpeta>`: registra la carpeta como dispositivo
  local, sin firma, marcado «en desarrollo». `device unlink` lo quita.
- Ventana **Dispositivos…** en la app: lista de incluidos, instalados del
  índice y locales; **Agregar carpeta…**, **Quitar** y **Recargar** (vuelve a
  leer el módulo y el `.svg` sin reiniciar).
- `device test` valida también el símbolo: grilla, bornes dibujados y
  atributos permitidos. El mismo validador corre al agregar la carpeta y
  muestra los errores ahí.
- Aviso claro: un dispositivo local ejecuta código; solo carpetas de
  confianza.

Con esto, alguien externo copia la plantilla, la edita en VS Code y la ve en
el simulador en segundos.

### Etapa B · Nuevo dispositivo desde la interfaz

Asistente **Nuevo dispositivo** que genera la carpeta (manifiesto,
`device.mjs`, `symbol.svg`, prueba) y la agrega en modo desarrollador:

1. **Identidad:** autor, nombre, categoría de la paleta y descripción.
2. **Bornes:** lista de bornes arriba y abajo; el asistente los ubica
   **siempre en la grilla** (múltiplos de 20) y calcula el ancho.
3. **Comportamiento** a partir de bloques probados (sin escribir código):
   - contacto accionado por una bobina (relé, contactor, SSR);
   - carga (piloto, zumbador, motor simple) con su tensión nominal;
   - pulsador o selector (acción del usuario → contactos);
   - sensor con umbral sobre una lectura (`reads`) o un enlace (`links`);
   - temporizador a la conexión / desconexión (`Delay` del `device-kit`);
   - equipo de planta con una variable de estado integrada (como el tanque).
4. **Símbolo:** una caja con los bornes y rótulos, lista para reemplazar por
   un `.svg` propio con el mismo contrato.

El resultado es código normal: quien quiera más, lo edita.

### Etapa C · Editor visual de bornes y vista previa

Sobre el `.svg` del usuario, mover los bornes con imán a la grilla, ver los
estados (`data-show`, `data-translate`) con controles de prueba y guardar.
Facilita llevar un dibujo de Inkscape al contrato sin editar XML a mano.

### Etapa D · 3D por manifiesto

`model3d` en el manifiesto: un `.glb` y el mapeo de salidas a animaciones
(`out.position` → traslación de una pieza, `out.speed` → giro). La vista 3D
lo carga igual que hoy arma la cinta o el tanque.

### Etapa E · Aislamiento

Correr los dispositivos de terceros en un *worker* sin acceso a Node (solo
el contrato `update`), para poder abrir modelos de cualquiera sin riesgo.

## 5. Decisiones para JW Control

1. ¿Se permite el **modo desarrollador** (dispositivos locales sin firma)
   en la versión que usan los alumnos, o solo en una versión para docentes?
2. ¿Quién revisa y **firma** lo que entra al índice comunitario?
3. En la interfaz, ¿alcanza con **bloques de comportamiento** (etapa B) o se
   quiere también un editor de código dentro de la app?
4. Orden sugerido: **A → B → C**, y D y E después.
