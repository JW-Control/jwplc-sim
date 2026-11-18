# Propuesta: planta 3D propia del Sim, partiendo de Open Industry Project

Propuesta del 18/11/2026, por aprobar. Rama `feature/alpha18-Planta3D`
(parte de `feature/alpha18-IntegracionOIP`).

La comunicación con Open Industry Project (OIP) ya funciona
(`OIP_CONEXION.md`). Esta propuesta va un paso más allá: tener una planta 3D
con física **dentro del propio Sim**, sin abrir OIP, y tomar a OIP como base
técnica y como referencia para validarla.

## 1. Punto de partida

| | Planta 3D del Sim (hoy) | Open Industry Project |
|---|---|---|
| Dibujo | three.js, piezas con primitivas (`app/renderer/scene3d.js`) | three.js, piezas con primitivas y modelos GLB |
| Física | No hay. La cinta mueve piezas en 1D a su velocidad (`scene/devices/plant.mjs`); al parar, la pieza para en seco | Jolt Physics: cajas con masa, fricción, inercia y colisiones |
| Sensores | La fotocelda compara la posición de la pieza con su punto | Haz (raycast) que corta la caja real |
| Equipos | Cinta, tanque, puerta, cilindro, compresor, unidad FR… | Cintas, rodillos, desviadores, robots, pórticos… |
| Unida al tablero | Sí: los equipos son los de la escena eléctrica | No: solo tags por Modbus |
| Gate | `JWSIM_G8_3D_SCENES` PASS | — |

Lo que le falta a la planta del Sim es **física**. La prueba con OIP lo
mostró: la caja siguió 160-370 ms después de parar la cinta y salió del
haz. En el Sim actual eso no pasa, porque la pieza para en seco, así que un
programa que funciona en el Sim puede fallar en la planta real (o en OIP).

### Por qué partir de OIP

- **Misma base:** los dos usan three.js, así que se pueden portar piezas
  sin cambiar de motor.
- **Licencia:** OIP es MIT, incluidos sus modelos y texturas («first-party»,
  según su `THIRD_PARTY_NOTICES.md`). El MIT se puede incorporar a un
  proyecto GPL-3.0 como el Sim, conservando el aviso de copyright
  (`LICENSES/`, `REUSE.toml`).
- **Física probada:** OIP usa Jolt Physics (MIT), que corre como WASM tanto
  en la ventana como en Node, así que también sirve en las pruebas
  automáticas.
- **Referencia:** el escenario cinta + caja + fotocelda ya corre en OIP con
  el sketch `oip_cinta`. El piloto del Sim tiene que comportarse igual.

El código legible está en GitHub
(`github.com/Open-Industry-Project/Open-Industry-Project`). Lo instalado está
compilado y minificado: no se toma código de ahí.

## 2. Opciones

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| A. Incrustar OIP | Abrir la app web de OIP dentro del Sim y unirla por el puente | Todo OIP de una vez | Dos interfaces, ~60 MB más (la app web de OIP instalada pesa 62 MB), se rompe con cada versión de OIP, la escena eléctrica y la planta siguen separadas |
| **B. Portar piezas con física** (recomendada) | Agregar Jolt a la Planta 3D del Sim y portar de OIP la cinta, la caja, la fotocelda y el pulsador | Una sola app; los equipos siguen siendo los de la escena eléctrica; crece pieza por pieza | Más trabajo por pieza |
| C. Solo modelos | Usar los GLB y texturas de OIP en la vista actual | Rápido, mejora el aspecto | No resuelve la física |

## 3. Piloto (etapa 1)

El mismo escenario de `tests/projects/oip-cinta`, pero **todo dentro del
Sim**, sin OIP y con el mismo sketch:

- cinta con superficie que arrastra (velocidad del equipo `jwsim/conveyor`);
- caja con masa y fricción que cae sobre la cinta;
- fotocelda por haz (raycast) a dos tercios del recorrido;
- pulsador de marcha en la planta.

**Dónde corre la física:** en el proceso de la escena, con el tiempo de
la simulación y no con el reloj de la PC. Así sigue funcionando a ×10 y
en las grabaciones `.stim`, y da siempre el mismo resultado. La ventana
solo dibuja lo que recibe en cada instantánea, como hoy.

**Criterios de aceptación:**

1. Con `cinta = NOT fotocelda` (sin enclavamiento), la caja sale del haz por
   inercia y la cinta vuelve a arrancar, igual que en OIP.
2. Con el sketch `oip_cinta` (enclavado), la caja queda detenida y el
   pulsador la rearma.
3. Resultado determinista: dos corridas dan las mismas posiciones.
4. Al menos 30 fps en la PC de referencia (como `JWSIM_G8_3D_SCENES`).
5. Prueba automática en Node, sin ventana, que verifica 1-3.

## 4. Etapas siguientes

- **Etapa 2.** Más piezas sobre la misma física: rodillos, desviador,
  cilindro empujador (ya existe la electroválvula 5/2) y caja de
  descarga. Las cintas de la vitrina y de los ejercicios pasan a tener
  física.
- **Etapa 3.** Colocar y mover piezas en la vista 3D (hoy la posición sale
  de la escena eléctrica).
- **Etapa 4 (evaluar).** Leer paquetes de piezas de OIP (`manifest.json` +
  `behavior.js`) para ampliar el catálogo sin portar a mano.

## 5. Decisiones a tomar

1. **Opción B** como camino (o A o C).
2. **Compatibilidad:** con física, ¿los ejercicios y la vitrina actuales
   (cinta 1D) pasan a física, o la física se activa por proyecto
   (`simulation.physics`)? Propuesta: por proyecto en la etapa 1, y migrar
   en la etapa 2.
3. **Atribución:** cómo citar a OIP en la app y en el instalador. El repo ya
   tiene `LICENSES/MIT.txt`; faltaría el aviso de copyright de OIP en
   `REUSE.toml` para los archivos portados y una línea en los créditos.
