# JWPLC Sim — Gates

Mismo estilo que los gates de las alphas del package: cada gate tiene un
identificador `JWSIM_<Gn>_<NOMBRE>`, criterios **medibles**, una forma
reproducible de verificarlo y un estado `PASS`, `FAIL` o `PENDING`. Un gate
solo pasa a `PASS` con evidencia (comando + salida o informe en
`build/gates/*.json`).

Convenciones:

- "Sketch de referencia" = sketches del package en
  `tools/build-speed-benchmark/sketches/` y ejemplos de `libraries/*/examples`
  de la versión fijada en `package.lock`.
- "Determinista" = N corridas con los mismos estímulos producen el mismo
  `trace_hash` (línea `JWSIM_RESULT` del runner).
- Tiempos "virtuales" se miden con el reloj del simulador; "de pared", con el
  reloj del host de CI de referencia: GitHub Actions `windows-latest` (x64),
  workflows `.github/workflows/g2-windows.yml`, `g3-windows.yml` y
  `g4-windows.yml`.

## Estado actual

```text
JWSIM_G0_ARCH_DOC=PASS
JWSIM_G0_LICENSE_MATRIX=PASS        (GPL-3.0-or-later adoptada; SDK MIT; materiales CC BY-SA 4.0)
JWSIM_G0_POC_IO_BASIC=PASS
JWSIM_G1_HAL_CORE=PASS              (alpha.13: 119/131 compilan, 0 fallas inesperadas)
JWSIM_G1_TCA6424A_MODEL=PASS        (14 tests, Linux y Windows)
JWSIM_G1_DETERMINISM=PASS           (5 sketches × 100 corridas; mismo hash en Windows)
JWSIM_G1_SPEED_X10=PASS             (C4 26/10: modo interactivo a ×1 = 1,000 con escena y 3 ms de latencia)
JWSIM_G1_PACKAGE_EXAMPLES_IO=PASS    (tablas de verdad; calibración 26/10 contra un JWPLC Basic real con
                                     tests/sketches/calibracion_loop: error 0,9 %, 2,3 % y 1,1 %)
JWSIM_G2_SPLIT_UI=PASS              (Windows CI: arranque 2,6 s; pestañas Sketch, Placa, Consola, Buses)
JWSIM_G2_LOCAL_COMPILE=PASS         (Windows CI: incremental 1,2 s; toolchain incluido; prototipos)
JWSIM_G2_ERROR_MAPPING=PASS         (5 errores en 2 pestañas)
JWSIM_G2_UNSUPPORTED_LIB_MSG=PASS   (10 familias; mensaje con API y gate)
JWSIM_G2_PROJECT_LINKING=PASS       (esquema jwsim-1, migración v0 → v1)
JWSIM_G2_EXTERNAL_EDIT_RELOAD=PASS  (Windows CI, alpha.13: recarga 1,63 s con la escena; sketch en C++20)
JWSIM_G3_BREAKPOINTS_STEP=PASS     (gdb -i=dap; Windows CI y Linux; E2E en Electron)
JWSIM_G3_FREEZE_TIME=PASS          (10 s detenido: millis() y tiempo virtual idénticos; sin perturbar el hash)
JWSIM_G3_WATCH_FORCE_IO=PASS       (variables en vivo, forzado de I0/Q0 con marca visual, en la grabación)
JWSIM_G3_BUS_ANALYZER=PASS         (11 capturas de referencia; I2C, SPI por CS, UART, Modbus RTU/TCP)
JWSIM_G3_RECORD_REPLAY=PASS        (CLI, protocolo y app: mismo hash)
JWSIM_G4_RTC_DS3232M=PASS          (10 tests del modelo; 03.RTC_Basic; hora fija, del host y con batería)
JWSIM_G4_NVS_PREFERENCES=PASS      (Preferences, EEPROM y los 10 ejemplos de JWPLC_LogicRuntime; H13 corregido en alpha.14)
JWSIM_G4_HAL_EXTRAS=PASS           (esp_timer, timers de FreeRTOS y de hardware, esp_restart con estado tibio)
JWSIM_G4_FRAM_PERSIST=PASS         (04.FRAM_Basic cuenta arranques; mismo hash con el mismo estado)
JWSIM_G4_SD_DATALOG=PASS           (SDHC SPI, FatFs y VFS reales; JWPLCDataLog con extracción; lector FAT32 propio)
JWSIM_G4_TFT_HMI=PASS              (4 capturas idénticas píxel a píxel; 6 botones; E2E en la app)
JWSIM_G4_RS485_MULTINODE=PASS      (3 nodos, choques, maestro externo por TCP; COM con pty)
JWSIM_G4_W5500_MODEL=PASS          (DHCP, IP fija, cable, cliente TCP, reproducción; W5500 poblado por defecto)
JWSIM_G4_MODBUS_TCP_HOST=PASS      (servidor y cliente contra el host; dos PLC en 1502/2502)
                                   (G4: Windows CI corrida 3 de g4-windows.yml con alpha.13, Linux y wine)
JWSIM_G5_HEADLESS_CLI=PASS          (build|run|test|parity|matrix, JSON y códigos de salida; Linux y Windows CI)
JWSIM_G5_RELEASE_TREE_PARITY=PASS   (core, headers -M -MG y autoload contra el registro; alpha.10 y un árbol sintético detectados)
JWSIM_G5_EXAMPLES_MATRIX=PASS       (alpha.14: 109 ejemplos, 106 compilan, corren y pasan su prueba; 3 obsoletos; artefacto)
JWSIM_G5_RELEASE_WORKFLOW=PENDING   (en espera hasta cerrar alpha.14 y alpha.15; sim-regression.yml probado: alpha.13 PASS, alpha.10 FAIL)
JWSIM_PACKAGE_SYNC_ALPHA13=PASS     (docs/reports/SYNC_ALPHA13.md)
JWSIM_PACKAGE_SYNC_ALPHA14=PASS     (docs/reports/SYNC_ALPHA14.md; tag v2.1.0-alpha.14 @ f3f47aee: paridad sin diferencias,
                                     matriz 111/111)
JWSIM_G6_*=PENDING                  (OpenPLC: después de cerrar la alpha.15 de Kenyi)
JWSIM_G7_DEVICE_LIBRARY=PASS        (18 dispositivos, 23 pruebas de comportamiento; símbolos v2 en 13 de 18; docs/reports/G7.md)
JWSIM_G7_NETLIST=PASS               (14 casos eléctricos + 3 co-simulaciones con firmware; mismo hash)
JWSIM_G7_DEVICE_SDK=PASS            (contrato TS, ABI C, plantillas, relé temporizador y generador de pulsos)
JWSIM_G7_COMMUNITY_INDEX=PASS       (índice Ed25519 con 3 paquetes; firma válida instala, 7 casos inválidos no)
                                    (G7: Linux y Windows CI, corrida 1 de g7.yml: gates y E2E de la escena PASS)
JWSIM_G8_2D_ELECTRICAL=PASS         (alcance v1, aprobado por JW Control el 27/10: mando, potencia, protección, motores
                                     1F/3F/2v, VFD-EL con AVI/ACI, potenciómetro y calibrador de lazo, neumática, inductivo,
                                     transmisor PT100 TT-510 y corriente de los motores (térmico NR2 clase 10). Fuera de la v1,
                                     con el dibujo genérico: fotoeléctrico, relé enchufable, transmisor de pH, válvula de agua
                                     del fermentador y motor genérico; motorreductor 24 VDC descartado (el Basic no tiene PWM))
JWSIM_G8_OIP_FUXA=IN_PROGRESS     (27/10: puente de E/S Modbus TCP (bornera en 127.0.0.1:5020) probado con un cliente
                                     que hace lo de OIP y FUXA: mapa, excepciones, escena y latencia ≤ 35 ms;
                                     guía en docs/integration/OIP_FUXA.md; falta la prueba con OIP y FUXA reales en taller)
JWSIM_G8_3D_SCENES=PASS             (27/10: vista 3D (three.js) con cinta, tanque, puerta y cilindro manejados por el
                                     firmware (tests/projects/planta-3d); 56 fps con render por software (SwiftShader, xvfb);
                                     app/tests/e2e-g8-3d.mjs)
JWSIM_G9_FAULT_INJECTION=PASS       (7 fallas: pegado, soldado, quemado, cable cortado, microSD, RTC sin batería, ruido RS-485;
                                     9 casos con firmware, ruido determinista, E2E en la app; scripts/gate-g9-faults.mjs)
JWSIM_G9_EXERCISES=PASS             (8 ejercicios con escena, enunciado, plantilla, solución 20/20 y rúbrica; docs/EJERCICIOS.md)
JWSIM_G9_AUTOGRADING=PASS           (jwsim-cli grade y botón Calificar; 100 corridas con la misma nota y hash; 6 errores típicos con nota parcial)
JWSIM_G10_*=PENDING
```

---

## G0 — Arquitectura

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G0_ARCH_DOC` | `docs/ARCHITECTURE.md` define: capas y procesos; inventario de qué se reemplaza del core ESP32/FreeRTOS y qué depende del hardware; formato `.jwsim` v1; interfaz de dispositivos (señal, I2C, SPI, UART, GPIO); protocolo motor↔interfaz; modelo de tiempo y scan; límites de fidelidad; estrategia de sincronización con el package. | Revisión del documento. |
| `JWSIM_G0_LICENSE_MATRIX` | `docs/LICENSES.md` lista cada dependencia (package, core, librerías, terceros, Electron, toolchains, OpenPLC, QEMU) con su licencia SPDX y modo de uso (enlazada, proceso separado, herramienta), señala incompatibilidades y recomienda una licencia. | Revisión del documento; `LICENSE`, `LICENSES/` y `REUSE.toml` en el repositorio. |
| `JWSIM_G0_POC_IO_BASIC` | C1: `02_io_basic` del package **sin modificar** compila y enlaza para x86_64 contra el HAL nativo y el modelo TCA6424A. C2: cada cambio de `I0_0` sostenido ≥ 100 ms se refleja en `Q0_0` antes de 100 ms. C3: ninguna otra salida cambia. C4: 10 corridas → mismo hash. C5 (si hay MinGW-w64 GCC): el `.exe` de Windows compila y, si hay wine, produce el mismo hash. | `node scripts/gate-g0-poc.mjs` → `JWSIM_G0_POC_IO_BASIC=PASS`, informe `build/gates/JWSIM_G0_POC_IO_BASIC.json`. |

## G1 — Motor + placa virtual

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G1_HAL_CORE` | C1: todos los sketches de `tools/build-speed-benchmark/sketches` y todos los ejemplos de las librerías `JW*`/`JWPLC_*` compilan sin tocar el package, o fallan con un motivo **clasificado**: obsoleto en el package (`tests/matrix-expectations.json`) o librería no soportada con mensaje explícito. 0 fallas inesperadas. C2: interrupciones GPIO en contexto ISR (apropian al núcleo dueño; `xPortInIsrContext()` verdadero). C3: un bucle sin puntos de sincronización se detiene con mensaje en ≤ 2 s de pared (código 70). C4: una API no soportada falla con un mensaje que la nombra. | `node scripts/build-matrix.mjs` y `node scripts/gate-g1-hal-core.mjs`. |
| `JWSIM_G1_TCA6424A_MODEL` | Tests del modelo independientes del firmware, uno por fila de `MODEL.md` (valores POR, mapa de registros, AI=0/1, polaridad, INT, RESET, Input de solo lectura, duración I2C), en Windows y Linux. Puntos "verificar" cerrados o documentados como sin impacto en el package. | `node scripts/test-models.mjs [--target windows]`. |
| `JWSIM_G1_DETERMINISM` | 100 corridas de cada sketch de referencia (01_empty, 02_io_basic, 03_autoload_contract, start_stop_8io, isr_gpio) con su `.stim` → un único hash por sketch; el `.exe` de Windows produce el mismo hash. | `node scripts/gate-g1-determinism.mjs` (compara Windows si hay MinGW-w64 GCC y wine). |
| `JWSIM_G1_SPEED_X10` | C1: sin factor, ≥ ×20 del tiempo real (02_io_basic y start_stop_8io, 60 s virtuales). C2: `--realtime 10` durante 60 s virtuales con atraso acumulado ≤ 1 %. C3: pausar congela `millis()` (sin saltos entre líneas consecutivas tras una pausa de 5 s de pared). C4: modo interactivo de la app (`--port stdio`) a ×1, sin escena, con escena y con 3 ms de latencia emulada por horizonte: tiempo virtual / pared = 1 ± 2 % durante 10 s. | `node scripts/gate-g1-speed.mjs`; medición suelta: `node scripts/medir-velocidad.mjs <exe> [--scene …] [--speed …] [--latencia ms]`. |
| `JWSIM_G1_PACKAGE_EXAMPLES_IO` | Tablas de verdad: `01.DigitalIO_Basic`, `DigitalIO_BlockMirror`, `JWPLC_IO_BlockMirror` (espejo DI→DO), `DigitalIO_BlockRead` y `06.Runtime_Cache_Status` (consola refleja DI), `DigitalIO_BlockWrite` (secuencia 0x88→0x11→0x00 cada 1000 ms ± 25 ms). Calibración: vueltas de `loop()` por segundo de `tests/sketches/calibracion_loop` (vacío, 5 `digitalWrite` a Q0, `JWPLC_ModbusRTU.task()`) contra la medición en un JWPLC Basic real (`tests/hardware/calibracion_loop.placa.json`) con error < 10 % en cada caso. | `node scripts/gate-g1-examples-io.mjs`. |

## G2 — Editor integrado

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G2_SPLIT_UI` | Electron con código (Monaco) y simulación lado a lado; pestañas Sketch, Placa, Consola, Buses; arranque en frío < 5 s. | `cd app && npm run test:e2e` (Playwright sobre Electron) → `JWSIM_G2_E2E.json`, criterio `SPLIT_UI`. |
| `JWSIM_G2_LOCAL_COMPILE` | Compilación con el toolchain incluido, sin red ni Arduino IDE; incremental de un cambio en `loop()` < 3 s en el host de referencia; prototipos automáticos como arduino-cli. | `node scripts/gate-g2-local-compile.mjs` + criterio `LOCAL_COMPILE` de la E2E; toolchain fijado en `third_party/toolchain.json`. |
| `JWSIM_G2_ERROR_MAPPING` | Errores y avisos aparecen en la línea correcta del `.ino` (y de pestañas múltiples) en el editor. | `tests/sketches/g2_errores` (5 errores en 2 pestañas), criterio `ERROR_MAPPING` de la E2E. |
| `JWSIM_G2_UNSUPPORTED_LIB_MSG` | Usar una librería o API no soportada (WiFi, BLE, ADC…) produce un mensaje en español que nombra la API/librería y el gate que la soportará (o que no está en el plan G0–G10), en compilación o al primer uso. | `node scripts/gate-g2-unsupported.mjs` sobre `tests/sketches/g2_unsupported`. |
| `JWSIM_G2_PROJECT_LINKING` | `.jwsim` v1 abre un proyecto que vincula `.ino`, proyecto OpenPLC y `.hmi`; validación por JSON Schema; migración probada de un archivo de versión anterior. | `node --test tests/build/project_test.mjs` + criterio `PROJECT_LINKING` de la E2E. |
| `JWSIM_G2_EXTERNAL_EDIT_RELOAD` | Editar el `.ino` fuera del simulador (Arduino IDE) provoca recompilación y recarga en < 2 s sin perder la escena. | Criterio `EXTERNAL_EDIT_RELOAD` de la E2E (escritura externa con una entrada activa). |

## G3 — Depuración

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G3_BREAKPOINTS_STEP` | Breakpoints, step in/over/out e inspección de variables en el `.ino` vía DAP (GDB en Windows, LLDB/GDB en Linux). | Prueba E2E con un sketch de referencia. |
| `JWSIM_G3_FREEZE_TIME` | Detenido en un breakpoint, el tiempo virtual no avanza (`millis()` idéntico antes y después de 10 s de pared). | Prueba automática. |
| `JWSIM_G3_WATCH_FORCE_IO` | Tabla de observación de E/S y variables; forzado de entradas y salidas con indicación visual; el forzado queda en la grabación. | Prueba E2E. |
| `JWSIM_G3_BUS_ANALYZER` | Captura y decodificación de I2C (por dirección/registro), SPI (por CS) y UART; decodificación Modbus RTU/TCP (función, dirección, CRC). | Capturas de referencia comparadas contra decodificación esperada. |
| `JWSIM_G3_RECORD_REPLAY` | Grabar una sesión interactiva (entradas de UI fechadas) y reproducirla da el mismo hash. | Script de gate. |

## G4 — Periféricos

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G4_RTC_DS3232M` | Modelo por registros (hora, alarmas, control/estado, OSF, temperatura) con `MODEL.md`; `03.RTC_Basic` del package funciona; tiempo del RTC sigue al tiempo virtual (y opción de reloj del host). | Ejemplo del package + tests del modelo. |
| `JWSIM_G4_NVS_PREFERENCES` | `Preferences` y `EEPROM` (NVS sobre flash) persistentes en el proyecto; los 10 ejemplos de `JWPLC_LogicRuntime` que hoy se rechazan por usar `Preferences` compilan y pasan su verificación. | Ejemplos de `JWPLC_LogicRuntime` + test de persistencia. |
| `JWSIM_G4_HAL_EXTRAS` | APIs del HAL que hoy fallan con mensaje explícito y el package o sketches comunes pueden usar: `esp_timer`, timers de software de FreeRTOS (`xTimerCreate`…) y `esp_restart()` (reinicio del runner conservando FRAM, SD y NVS, con el mismo hash en corridas repetidas). | Sketches de prueba por API + determinismo. |
| `JWSIM_G4_FRAM_PERSIST` | Modelo SPI FRAM (WREN/WRDI/RDSR/WRSR/READ/WRITE) de 8 KiB; contenido persistente en archivo del proyecto entre corridas; `04.FRAM_Basic` pasa. | Ejemplo + test de persistencia. |
| `JWSIM_G4_SD_DATALOG` | Tarjeta SD en modo SPI (CMD0/8/55/41/58/9/10/17/18/24/25, CRC) sobre imagen FAT; FatFs real; VFS enruta `fopen("/sd/…")` a FatFs sin tocar el disco del host; `05.microSD_Basic` y DataLog pasan; detección de tarjeta. | Ejemplos + comparación de la imagen resultante. |
| `JWSIM_G4_TFT_HMI` | Modelo ST7789 (comandos, ventana, RGB565, rotación, inversión) con framebuffer en la UI; HMI de `JWPLC_Display` visible y navegable con la botonera virtual; captura PNG comparable píxel a píxel con una referencia. | Comparación de capturas. |
| `JWSIM_G4_RS485_MULTINODE` | UART con tiempo de carácter por baudios; bus RS-485 entre varios runners y con un COM virtual del host; `JWPLC_ModbusRTU` maestro/esclavo interoperando con una herramienta externa (JW Modbus Tool). | Prueba con 3 nodos y herramienta externa. |
| `JWSIM_G4_W5500_MODEL` | **Tras publicarse alpha.13** (2026-10-22). Modelo W5500 por registros (común, 8 sockets, buffers, INTn), TCP/UDP mapeados a sockets del host; ejemplos de `JWPLC_Ethernet` pasan con el comportamiento de alpha.13/14. | Ejemplos + tests del modelo. |
| `JWSIM_G4_MODBUS_TCP_HOST` | `JWPLC_ModbusTCP` accesible desde el host (localhost/LAN) por un cliente externo; varios PLC simulados en puertos distintos. | Cliente Modbus TCP externo. |

## G5 — CI del package

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G5_HEADLESS_CLI` | `jwsim-cli build|run|test` sin Electron, con salida de máquina (JSON) y códigos de salida; ejecutable en GitHub Actions Windows y Linux. | Workflow de ejemplo. |
| `JWSIM_G5_RELEASE_TREE_PARITY` | Para un tag nuevo del package: 0 fuentes del core sin clasificar, 0 headers de ESP-IDF faltantes, misma lista de librerías del autoload que la registrada; diferencias reportadas como lista. | `jwsim-cli parity <ref>`. |
| `JWSIM_G5_EXAMPLES_MATRIX` | Matriz ejemplo × (compila, corre, pasa su `.stim`) para todos los ejemplos del package; publicada como artefacto. | Workflow. |
| `JWSIM_G5_RELEASE_WORKFLOW` | Gate `SIM_REGRESSION` en el flujo de release del package, **previo** a los gates físicos y sin reemplazarlos; bloquea la release si una regresión simulada falla. | PR en platform-jwplc (fuera de este repo, con aprobación). |

## G6 — OpenPLC

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G6_LADDER_CHAIN` | Un proyecto OpenPLC vinculado compila con la cadena real (matiec → C + HAL `jwplcbasic.cpp`) contra el backend simulado y corre con la misma placa. | Proyecto de ejemplo. |
| `JWSIM_G6_RELOAD_FROM_EDITOR` | Guardar en el editor OpenPLC recarga la simulación. | Prueba E2E. |
| `JWSIM_G6_SIMULATE_BUTTON` | Botón "Simular" en el fork `JW-Control/openplc-editor` abre el proyecto en JWPLC Sim. | PR en el fork. |

## G7 — Biblioteca industrial, netlist, SDK, índice

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G7_DEVICE_LIBRARY` | Dispositivos de la propuesta v0.1 (pulsadores NA/NC, selectores 2/3 posiciones, fin de carrera, sensores inductivo/fotoeléctrico, lámpara, zumbador, relé, contactor, electroválvula, motor) con tests de comportamiento. | Tests por dispositivo. |
| `JWSIM_G7_NETLIST` | Netlist eléctrica 24 VDC/230 VAC simplificada: alimentaciones, comunes, contactos auxiliares, detección de cortocircuito y bobina sin alimentación. | Casos de prueba eléctricos. |
| `JWSIM_G7_DEVICE_SDK` | SDK documentado (TS y nativo C ABI) con plantilla y un dispositivo de ejemplo publicado. | Revisión + ejemplo. |
| `JWSIM_G7_COMMUNITY_INDEX` | `jwsim_index.json` en GitHub con dispositivos y ejemplos firmados (mismo modelo que Boards Manager/VPP de JW Control); verificación de firma e integridad al instalar. | Instalación desde el índice con firma válida e inválida. |

## G8 — 2D/3D e integraciones

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G8_2D_ELECTRICAL` | Vista 2D del tablero con cableado editable y estados animados. C1: los dispositivos de la biblioteca dentro del alcance acordado con JW Control tienen símbolo según `docs/simbolos/LINEAMIENTOS.md` (modelo comercial real, vista frontal, 4 px/mm; los de campo a una escala reducida fija), aprobado por JW Control. C2: cableado editable (crear, quitar, puntos de doblez, color, puentes) sin superponerse a los equipos. C3: estados legibles y animados con la simulación: cables con tensión, contactos y palancas, vástago del cilindro, giro del motor, pilotos, disparo de las protecciones. | `node scripts/export-symbols.mjs` sin `plantilla: null` fuera de los excluidos del alcance (v1: `sensor-photoelectric`, `relay`, `ph-rs485`, `water-valve`, `motor`) + E2E de la escena (`app/tests/e2e-g7.mjs`) + vistas de escala. |
| `JWSIM_G8_3D_SCENES` | Escenas 3D (three.js) de procesos: cinta, cilindro, tanque, puerta. C1: los equipos de planta (`jwsim/conveyor`, `jwsim/tank`, `jwsim/door`) y el cilindro se dibujan en 3D con los sensores enlazados. C2: con el firmware en marcha la vista sigue a la simulación. C3: ≥ 30 fps en el host de referencia. | `node --test scene/tests/plant.test.mjs` + E2E `app/tests/e2e-g8-3d.mjs` (medición de fps). |
| `JWSIM_G8_OIP_FUXA` | Puente con Open Industry Project y FUXA (Modbus TCP) documentado y probado. C1: la bornera del Basic simulado como esclavo Modbus TCP (bobinas, entradas discretas y registros; `docs/integration/OIP_FUXA.md`). C2: no escribe las entradas que maneja la escena. C3: latencia entrada → salida ≤ 100 ms a velocidad real. C4: prueba con OIP y FUXA reales registrada en `docs/reports/`. | `node scripts/gate-g8-io-bridge.mjs` (C1-C3) + prueba de taller (C4). |

## G9 — Ejercicios

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G9_EXERCISES` | Ejercicios objetivo de la propuesta (Start/Stop, inversión de giro, semáforo, bomba por niveles, puerta, estrella-triángulo, cinta, alarmas) con enunciado y escena. | Revisión + `node scripts/gate-g9-exercises.mjs` (E1–E3: los ocho en `exercises/`, proyectos y escenas válidos, plantilla con nota ≤ 2 y solución con 20/20). |
| `JWSIM_G9_AUTOGRADING` | Calificación automática por rúbrica (tablas de verdad temporizadas sobre la traza); misma nota en 100 corridas. | `node scripts/gate-g9-exercises.mjs` (A1: 100 corridas, misma nota y hash por caso; A2: errores típicos de `tests/grading` con nota parcial; A3: E2E `app/tests/e2e-g9.mjs`). |
| `JWSIM_G9_FAULT_INJECTION` | Fallas configurables: sensor pegado, cable cortado, relé soldado, tarjeta SD ausente, RTC sin batería, bus RS-485 con ruido. | Casos por falla: `node scripts/gate-g9-faults.mjs` (motor de escena, modelo del RTC, `tests/faults/` con el firmware real, determinismo del ruido y criterio `SCENE_FAULTS` de la E2E). ARCHITECTURE §4.2. |

## G10 — QEMU, GDB sobre el `.bin` real, HIL

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G10_QEMU_BRIDGE` | Fork público GPL-2.0 de QEMU-ESP32 con puente genérico SPI/I2C/UART/GPIO por socket; los modelos corren en el proceso del simulador (nunca dentro de QEMU). Términos de la ROM de Espressif verificados y documentados. | Revisión legal + `02_io_basic` compilado con el toolchain xtensa corre en QEMU con los mismos resultados de E/S que en modo HAL. |
| `JWSIM_G10_GDB_REAL_BIN` | Depuración con GDB del `.bin` real en QEMU. | E2E. |
| `JWSIM_G10_HIL_USB` | JWPLC Basic real por USB: la escena virtual maneja sus entradas/lee sus salidas con latencia documentada. | Prueba con placa real. |

## Sincronización con alphas del package

| Gate | Criterios |
|---|---|
| `JWSIM_PACKAGE_SYNC_ALPHAxx` | `package.lock` apunta al tag `v2.1.0-alpha.xx` (o, antes de publicarse, a la rama de integración y su commit); build sin cambios del package; todos los gates en `PASS` previamente siguen en `PASS` (o la regresión queda documentada como punto de extensión). |
