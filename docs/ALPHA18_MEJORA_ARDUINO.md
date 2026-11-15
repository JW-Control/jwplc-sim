# Rama `feature/alpha18-mejoraArduino` · informe de cambios

Rama creada desde `feature/alpha18-alias-openplc` con `feature/alpha17-parches` fusionada (07/11/2026). Commits como k23n0.

## Hecho

| Commit | Qué |
|---|---|
| `080ecba` | Programa: archivos adicionales del sketch (`.h`, `.c`, `.cpp`, `.ino`, `.md`, `.txt`): «+» y «×» en las pestañas, menú Archivo, cambios hechos fuera de la app. `scripts/app.mjs` quita `ELECTRON_RUN_AS_NODE` (modo desarrollo: `JWPLC Sim.bat`, sin instalador). |
| `ae6327a` | Esquema eléctrico: paleta como Fritzing (miniaturas, ficha del equipo con divisor, modelos seleccionables, doble clic para elegir, colocar o arrastrar), sin botón «Quitar»; Supr y Ctrl+X/C/V/Z/Y. |
| `929f02d` | Cableado: cables multipolares (Ctrl+G), referencias «→ destino», conexión en el tornillo verde del VFD-EL (`.jw-term-alt`), arrastrar de borne a borne, el cable en curso no se pierde al mover la vista. |
| `ce372d0` | Catálogo, tanda 1: capacitivo y material de la pieza; emergencia, pulsador luminoso, selector con llave; temporizador multifunción, SSR, baliza; termomagnético 1P/2P/3P y guardamotor NS2-25. |
| `9e39f70` | Tanda 2: flotador tipo pera, electrodos y relé de nivel, presostato, termostato, voltímetro y amperímetro (carga `meter` en el netlist). |
| `bd274b7` | Tanda 3: E/S remotas 8DI/8DO, medidor PZEM-016, controlador de temperatura RS-485; la escena atiende Modbus 01, 02, 05 y 15. |
| (sin commit) | Tanque con modelo discretizado y formas como modelos; ejercicio 9 (tolva); prueba de punta a punta del módulo de E/S con la firmware real. |

## Último bloque (sin commit al cerrar esta sesión)

- **Tanque `jwsim/tank` 1.1** (`scene/devices/plant.mjs`): balance de volumen con RK4 a paso configurable (`pasoMs`), formas como modelos en la paleta (cilindro vertical u horizontal, rectangular, cono, prisma en V, cuarto de círculo, esfera), descarga por gravedad (Torricelli) por una válvula de la escena. Los proyectos anteriores dan el mismo resultado. Dibujo: la silueta de cada forma y el agua recortada a ella (`scene-symbols.js`). Pruebas contra soluciones analíticas en `scene/tests/tanque.test.mjs`.
- **Ejercicio 9 · Nivel de una tolva con descarga por gravedad** (`exercises/09-tolva-nivel`): tolva cónica, dos capacitivos, bomba, electroválvula de descarga y selector. La solución saca 20/20; la variante sin histéresis (`tests/grading/e09_sin_histeresis`), 18/20.
- **Módulo de E/S remotas por programa**: `tests/plant/io-remotas.jwtest.json` corre el sketch `tests/sketches/io_remotas_modbus` (JWPLC_ModbusRTU: FC05, FC02, FC15, FC01) contra el módulo simulado; pasa.
- `app/tests/e2e-g9.mjs` espera 9 ejercicios.

Para cerrar el bloque: correr `node --test scene/tests/*.test.mjs` (135 pasan), `npm run test:e2e:g9` en `app/` y hacer el commit.

## Programar el módulo de E/S remotas

Dirección 3, 9600 8N1. Bobinas 0-7 = DO1-DO8, entradas discretas 0-7 = DI1-DI8 (bits empaquetados, bit 0 = DI1/DO1).

```cpp
JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1);                 // 247 = ID local del maestro
JWPLC_ModbusRTU.writeSingleCoilSync(3, 7, true);              // FC05: DO8
uint8_t di = 0;
JWPLC_ModbusRTU.readDiscreteInputsSync(3, 0, 8, &di);        // FC02: DI1..DI8
uint8_t salidas = di;
JWPLC_ModbusRTU.writeMultipleCoilsSync(3, 0, 8, &salidas);   // FC15: DO1..DO8
```

## Pendiente

- **Símbolos de las tandas 1, 2 y 3**: son propuestas sin fotos propias. Según `docs/simbolos/LINEAMIENTOS.md` hacen falta fotos de frente de los modelos que vende JW Control para dejarlos como los aprobados, uno a la vez y con su aprobación.
- **Vista 3D del tanque**: hoy dibuja siempre un cilindro; la forma y las medidas ya están en la escena para dibujarla según el modelo.
- Canaletas para el cableado (opción 3 de la propuesta de cableado).
- Push de la rama y PR, cuando lo autorice JW Control.
