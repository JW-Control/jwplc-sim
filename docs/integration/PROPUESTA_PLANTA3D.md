# Propuesta: planta 3D con física propia del Sim, basada en Open Industry Project

Propuesta del 18/11/2026, por aprobar. Rama `feature/alpha18-Planta3D`
(parte de `feature/alpha18-IntegracionOIP`).

La comunicación con Open Industry Project (OIP) ya funciona
(`OIP_CONEXION.md`). El siguiente paso es una planta 3D con física
**dentro del propio Sim**, sin abrir OIP.

## 0. Decisiones ya tomadas

- **No se incrusta OIP.** JWPLC Sim es un producto de JW Control (quizá se
  distribuya gratis): el código de la física es propio y el Sim no depende
  de la app de OIP.
- **OIP es la referencia.** Se estudia cómo resuelve la física y se usa como
  patrón de comparación (mismo escenario, mismo sketch).
- **Crédito en el repo:** «Física de planta basada en el diseño de Open
  Industry Project (MIT, © Automation Standard LLC and Contributors)», en el
  README y en el encabezado de los archivos de física. Si en algún momento se
  copia código o un modelo de OIP, se agrega además su aviso MIT en
  `REUSE.toml` (el repo ya tiene `LICENSES/MIT.txt`).

## 1. Cómo trata OIP la física

Estudiado sobre el código fuente de OIP en GitHub
(`Open-Industry-Project/Open-Industry-Project`, commit `4202d1d` del
18/11/2026): `docs/architecture.md`, `docs/sim-clock.md`,
`docs/cargo-bodies.md`, `src/sim/` y las piezas de `examples/parts/`.

### 1.1 Motor y reloj

- **Motor:** Jolt Physics (WASM), una versión modificada por ellos
  (`1.1.1-oip.10`) con dos parches propios: fricción acoplada (una caja
  frenada contra un borde puede girar y seguir) y «superficie de rodadura»
  (solo la cara de arriba de la cinta arrastra; el costado no).
- **Paso fijo:** 60 Hz por defecto (configurable de 60 a 1000). La física es
  la dueña del reloj: el PLC escanea intercalado con los pasos, con el
  tiempo de la simulación y nunca con el de la PC. A ×2, ×4 u ×8 se dan más
  pasos del mismo tamaño, así que la física no cambia con la velocidad.
- **Determinismo:** las mismas entradas dan el mismo resultado, y sus
  pruebas automáticas corren la planta sin ventana.
- **Latencia:** un sensor que cambia en el paso N mueve un actuador en el
  paso N+1 (16,7 ms a 60 Hz).

### 1.2 La cinta: una superficie con velocidad, no rodillos

- La cinta es un cuerpo **fijo** con una «velocidad de superficie». En cada
  contacto con una caja, Jolt la arrastra como si el suelo se moviera
  (`setSurfaceVelocity`). No hay rodillos ni banda que giren.
- La caja se acopla a la cinta por **fricción de Coulomb**: si va más lenta
  que la cinta, acelera a lo sumo μ·g hasta igualarla; luego viaja pegada.
  Fricción por defecto: cinta 0,59, caja 0,5.
- **El accionamiento tiene rampa**, como un variador: la cinta de OIP trae
  2 m/s, con 0,5 s de arranque y 0,5 s de frenado. Su propia ayuda lo dice:
  *«Cargo keeps travelling while it does, so a box stopped at a photo-eye
  ends up past it.»* Esto explica lo que medimos el 18/11: la caja salió
  del haz 160-370 ms después de la orden de parar. No resbaló: la cinta
  todavía estaba frenando.
- Lo que más código les cuesta son las **uniones entre tramos**: cada tramo
  es un cuerpo aparte, y al pasar de uno a otro Jolt genera contactos
  «fantasma» que levantan la caja. Tienen filtros ajustados a mano
  (`conveyorContacts.ts`).

### 1.3 Sensores y cajas

- **Fotocelda:** no es un rayo de Jolt. Es un cálculo directo de un rayo
  contra la caja orientada de cada carga (`cargoSensing.ts`), con alcance
  máximo y opción normalmente cerrado.
- **Cajas:** cuerpos rígidos con masa, sin rebote (restitución 0) y sin
  amortiguación; los pallets usan más iteraciones del solver para no
  hundirse con mucha carga.
- **Simplificaciones que ellos mismos declaran:** los rodillos son una sola
  superficie (una caja no se traba entre rodillos) y no hay cargas blandas.

### 1.4 Cómo validan

Sus pruebas comparan la física contra fórmulas cerradas
(`physicsFidelity.test.ts`):

1. la caja alcanza la cinta acelerando a μ·g;
2. una vez alcanzada, viaja a la velocidad de la cinta sin deslizar;
3. en rampa se sostiene por debajo de atan(μ) y resbala por encima;
4. una fila de cajas se acumula contra un tope sin encimarse.

## 2. El Sim hoy

| | Planta del Sim (hoy) | OIP |
|---|---|---|
| Modelo | 1D, guiado por eventos (`scene/devices/plant.mjs`): calcula el instante exacto en que el borde de una pieza llega a un sensor | Cuerpos rígidos en 3D, paso fijo de 60 Hz |
| Cinta → pieza | Pegadas: la pieza va siempre a la velocidad de la cinta | Fricción: puede resbalar al arrancar o frenar fuerte |
| Rampa | La del motor o el variador de la escena (`M1.speed`) | Propia de la cinta (0,5 s) |
| Piezas | Todas del mismo largo, sin choques entre ellas | Cajas de distinto tamaño que chocan y se acumulan |
| Sensores | Puntos A y B a lo largo de la cinta | Haz contra la caja, en cualquier posición |
| Unida al tablero | Sí | No (solo tags) |

El Sim ya tiene lo que OIP más cuida (tiempo de simulación, determinismo,
pruebas sin ventana) y además une la planta con el tablero eléctrico. Le
falta la parte mecánica: fricción, choques entre cajas y sensores en
cualquier lugar.

## 3. Cómo lo planteamos en el Sim

**Física propia, por etapas, sin Jolt al principio.** Para cintas, cajas y
fotoceldas no hace falta un motor 3D completo: el comportamiento que OIP
valida (§1.4) se reproduce con un modelo más simple, escrito por nosotros,
que se puede probar contra las mismas fórmulas.

### Etapa 1 · Piloto: cajas con fricción sobre la cinta

Un dispositivo nuevo de escena (por ejemplo `jwsim/conveyor-fisico`), sin
cambiar la cinta actual:

- **Paso fijo** de la simulación (60 Hz por defecto, como OIP), con el
  tiempo de la escena: sigue funcionando a ×10 y en las grabaciones.
- **Cinta:** velocidad de superficie que da el motor o el variador de la
  escena, con sus rampas. Opcional: rampa propia de la cinta.
- **Cajas:** largo, ancho, masa y fricción por caja. Coulomb contra la
  cinta (aceleración máxima μ·g hacia la velocidad de la cinta).
- **Choques en la línea:** una caja no atraviesa a la de adelante ni a un
  tope; se acumulan (en 1D, a lo largo de la cinta).
- **Fin de cinta:** la caja cae (sale de la cinta y se cuenta).
- **Fotocelda por haz:** rayo contra la caja en cualquier posición, con
  alcance y NC, como la de OIP.
- **Vista 3D:** `scene3d.js` dibuja las cajas que manda la escena; no
  calcula nada.

Criterios de aceptación (prueba automática en Node, sin ventana):

1. Las fórmulas de OIP (§1.4, puntos 1, 2 y 4) se cumplen con un error
   menor al 1 %.
2. Con `cinta = NOT fotocelda` y una rampa de frenado de 0,5 s a 2 m/s, la
   caja pasa el haz: el mismo resultado que dio OIP el 18/11.
3. Con el sketch `oip_cinta` (enclavado), la caja queda detenida y el
   pulsador la rearma.
4. Determinista: dos corridas dan las mismas posiciones.
5. Al menos 30 fps en la vista 3D (como `JWSIM_G8_3D_SCENES`).

### Etapa 2 · Más piezas en 1D

Tope neumático (con el cilindro que ya existe), desviador a otra cinta,
cinta inclinada (Coulomb con pendiente, punto 3 de §1.4) y migración de
las cintas de la vitrina y los ejercicios a la física.

### Etapa 3 · Física 3D (evaluar)

Solo si hace falta lo que el modelo 1D no cubre: cajas que giran, empujador
lateral, robots, pallets. Ahí se evalúa Jolt (MIT, el paquete normal
`jolt-physics`, no el modificado de OIP) detrás de la misma interfaz, con
las mismas pruebas de la etapa 1.

### Estado de la etapa 1 (18/11/2026): piloto hecho

| Pieza | Archivo |
|---|---|
| Física (núcleo, sin dependencias) | `scene/physics/cargo-line.mjs` |
| Dispositivo `jwsim/conveyor-physics` («Cinta con física») | `scene/devices/conveyor-physics.mjs` |
| Esquema y vista 3D (mismo dibujo que la cinta, con su tope) | `app/renderer/scene-symbols.js`, `app/renderer/scene3d.js` |
| Proyecto piloto (JWPLC, fotocelda B1, marcha S1, KM1, M1, C1) | `tests/projects/planta3d-cinta/` |

Resultados contra los criterios:

1. Fórmulas cerradas: alcance a μ·g (en el paso esperado y con el
   recorrido v²/2μg ± 1 %), arrastre sin deslizar, deslizamiento al
   frenar en seco (v²/2μg ± 2 %), rampa (v·t/2 ± 2 %), acumulación contra
   el tope y choque que conserva el momento:
   `node --test scene/tests/conveyor-physics.test.mjs` (13 casos).
2. `cinta = NOT fotocelda` (2 m/s, parada del motor 0,5 s): la caja sale
   del haz y la cinta vuelve a arrancar, como en OIP:
   `tests/projects/planta3d-cinta/cinta-simple.jwtest.json`.
3. Enclavado: la caja queda detenida en 2,94 m (fotocelda en 2,5 m) y S1 la
   rearma: `cinta-enclavada.jwtest.json`.
   (`node cli/jwsim-cli.mjs test tests/projects/planta3d-cinta`).
4. Determinista: caso propio en las pruebas del núcleo.
5. 61 fps en la vista 3D con el piloto en marcha (PC de desarrollo).

Detalles de la integración con la escena:

- Con un motor enlazado por `M1.speed`, la cinta lee también
  `M1.running` para despertar al empezar la rampa (la escena no avisa a
  quien lee una salida en rampa), e interpola la orden en cada paso.
- Quieta (sin orden ni cajas en movimiento) no pide eventos.

Vista 3D (opción 2 aprobada): formas propias (bastidor, banda, tambores,
patas, caja, fotocelda con haz que se enciende al detectar) con las medidas
de OIP y sus texturas copiadas sin cambios (`app/renderer/assets/oip/`, MIT,
aviso en `REUSE.toml` y `docs/LICENSES.md`). La caja usa solo las zonas del
atlas sin la etiqueta de OIP. Baranda de 0,06 m (OIP: 0,15) para que se vea
la caja. 59-61 fps.

## 4. Decisiones a tomar

1. Aprobar el camino: física propia por etapas (1D primero) en vez de Jolt
   desde el inicio.
2. Cinta nueva (`jwsim/conveyor-fisico`) en paralelo a la actual, o que la
   actual gane física con un parámetro. Propuesta: en paralelo en la etapa
   1 y unificar en la etapa 2.
3. Texto y lugar del crédito a OIP (§0).
