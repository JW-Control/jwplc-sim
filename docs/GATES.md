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
  reloj del host de CI (Windows 11 x64, 4 núcleos, de referencia).

## Estado actual

```text
JWSIM_G0_ARCH_DOC=PASS
JWSIM_G0_LICENSE_MATRIX=PASS        (GPL-3.0-or-later adoptada; SDK MIT; materiales CC BY-SA 4.0)
JWSIM_G0_POC_IO_BASIC=PASS
JWSIM_G1_*=PENDING ... JWSIM_G10_*=PENDING
```

---

## G0 — Arquitectura

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G0_ARCH_DOC` | `docs/ARCHITECTURE.md` define: capas y procesos; inventario de qué se reemplaza del core ESP32/FreeRTOS y qué depende del hardware; formato `.jwsim` v1; interfaz de dispositivos (señal, I2C, SPI, UART, GPIO); protocolo motor↔interfaz; modelo de tiempo y scan; límites de fidelidad; estrategia de sincronización con el package. | Revisión del documento. |
| `JWSIM_G0_LICENSE_MATRIX` | `docs/LICENSES.md` lista cada dependencia (package, core, librerías, terceros, Electron, toolchains, OpenPLC, QEMU) con su licencia SPDX y modo de uso (enlazada, proceso separado, herramienta), señala incompatibilidades y recomienda una licencia. | Revisión del documento; `LICENSE`, `LICENSES/` y `REUSE.toml` en el repositorio. |
| `JWSIM_G0_POC_IO_BASIC` | C1: `02_io_basic` del package **sin modificar** compila y enlaza para x86_64 contra el HAL nativo y el modelo TCA6424A. C2: cada cambio de `I0_0` sostenido ≥ 100 ms se refleja en `Q0_0` antes de 100 ms. C3: ninguna otra salida cambia. C4: 10 corridas → mismo hash. C5 (si hay `JWSIM_ZIG`): el `.exe` de Windows compila y, si hay wine, produce el mismo hash. | `node scripts/gate-g0-poc.mjs` → `JWSIM_G0_POC_IO_BASIC=PASS`, informe `build/gates/JWSIM_G0_POC_IO_BASIC.json`. |

## G1 — Motor + placa virtual

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G1_HAL_CORE` | Todos los sketches de `tools/build-speed-benchmark/sketches` y los ejemplos de `JWPLC_GlobalPeripherals` que no requieran periféricos de G4 compilan en Windows y Linux sin tocar el package. APIs no soportadas fallan con mensaje que nombra la API. Interrupciones GPIO en contexto ISR que apropia al núcleo. Vigilante que detecta bucles sin puntos de sincronización en ≤ 2 s de pared. | Matriz de compilación en CI; test de API no soportada; sketch con `while(1){}` reporta el error. |
| `JWSIM_G1_TCA6424A_MODEL` | Tests del modelo independientes del firmware: valores POR, mapa de registros, AI=0/1, polaridad, INT set/clear, RESET, escritura a Input ignorada. Puntos "verificar" de `MODEL.md` cerrados contra SCPS193 o medición en placa real. | `tests/models/tca6424a` (100 % de filas de `MODEL.md` cubiertas). |
| `JWSIM_G1_DETERMINISM` | 100 corridas de cada sketch de referencia con su `.stim` → 1 solo hash por sketch, en Windows y Linux, y el mismo hash entre ambos SO. | Script de gate; informe con la lista de hashes. |
| `JWSIM_G1_SPEED_X10` | Con `02_io_basic` y un sketch Start/Stop con 8 E/S: ejecución sostenida a ×10 del tiempo real (`--realtime 10`) sin atraso acumulado > 1 % en 60 s virtuales; sin factor, ≥ ×20. Pausar congela `millis()` (diferencia 0 entre antes y después de una pausa de 5 s de pared). | Script de rendimiento en el host de referencia. |
| `JWSIM_G1_PACKAGE_EXAMPLES_IO` | Los ejemplos de E/S del package (`01.DigitalIO_Basic`, `DigitalIO_Block*`, `JWPLC_IO_BlockMirror`, `06.Runtime_Cache_Status`) pasan una tabla de verdad de E/S definida por ejemplo. Costos del motor calibrados contra el profiler H3E.0B en un JWPLC Basic real: error de periodo de scan < 10 %. | `.stim` + resultados esperados por ejemplo; informe de calibración. |

## G2 — Editor integrado

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G2_SPLIT_UI` | Electron con código (Monaco) y simulación lado a lado; pestañas Sketch, Placa, Consola, Buses; arranque en frío < 5 s. | Prueba E2E (Playwright sobre Electron). |
| `JWSIM_G2_LOCAL_COMPILE` | Compilación con el toolchain incluido, sin red ni Arduino IDE; incremental de un cambio en `loop()` < 3 s en el host de referencia; prototipos automáticos como arduino-cli. | Script cronometrado. |
| `JWSIM_G2_ERROR_MAPPING` | Errores y avisos aparecen en la línea correcta del `.ino` (y de pestañas múltiples) en el editor. | Sketch con 5 errores sembrados en 2 pestañas. |
| `JWSIM_G2_UNSUPPORTED_LIB_MSG` | Usar una librería o API no soportada (WiFi, BLE, analogWrite…) produce un mensaje en español que nombra la API/librería y el gate que la soportará, en compilación o al primer uso. | Sketches de prueba por cada familia no soportada. |
| `JWSIM_G2_PROJECT_LINKING` | `.jwsim` v1 abre un proyecto que vincula `.ino`, proyecto OpenPLC y `.hmi`; validación por JSON Schema; migración probada de un archivo de versión anterior. | Tests del esquema. |
| `JWSIM_G2_EXTERNAL_EDIT_RELOAD` | Editar el `.ino` fuera del simulador (Arduino IDE) provoca recompilación y recarga en < 2 s sin perder la escena. | Prueba E2E con escritura externa. |

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
| `JWSIM_G4_FRAM_PERSIST` | Modelo SPI FRAM (WREN/WRDI/RDSR/WRSR/READ/WRITE) de 8 KiB; contenido persistente en archivo del proyecto entre corridas; `04.FRAM_Basic` pasa. | Ejemplo + test de persistencia. |
| `JWSIM_G4_SD_DATALOG` | Tarjeta SD en modo SPI (CMD0/8/55/41/58/9/10/17/18/24/25, CRC) sobre imagen FAT; FatFs real; VFS enruta `fopen("/sd/…")` a FatFs sin tocar el disco del host; `05.microSD_Basic` y DataLog pasan; detección de tarjeta. | Ejemplos + comparación de la imagen resultante. |
| `JWSIM_G4_TFT_HMI` | Modelo ST7789 (comandos, ventana, RGB565, rotación, inversión) con framebuffer en la UI; HMI de `JWPLC_Display` visible y navegable con la botonera virtual; captura PNG comparable píxel a píxel con una referencia. | Comparación de capturas. |
| `JWSIM_G4_RS485_MULTINODE` | UART con tiempo de carácter por baudios; bus RS-485 entre varios runners y con un COM virtual del host; `JWPLC_ModbusRTU` maestro/esclavo interoperando con una herramienta externa (JW Modbus Tool). | Prueba con 3 nodos y herramienta externa. |
| `JWSIM_G4_W5500_MODEL` | **Solo tras publicarse alpha.13.** Modelo W5500 por registros (común, 8 sockets, buffers, INTn), TCP/UDP mapeados a sockets del host; ejemplos de `JWPLC_Ethernet` pasan con el comportamiento de alpha.13/14. | Ejemplos + tests del modelo. |
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
| `JWSIM_G8_2D_ELECTRICAL` | Vista 2D del tablero con cableado editable y estados animados. | E2E. |
| `JWSIM_G8_3D_SCENES` | Escenas 3D (three.js) de procesos: cinta, cilindro, tanque, puerta. ≥ 30 fps en el host de referencia. | Medición. |
| `JWSIM_G8_OIP_FUXA` | Puente con Open Industry Project y FUXA (Modbus TCP) documentado y probado. | Prueba de integración. |

## G9 — Ejercicios

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G9_EXERCISES` | Ejercicios objetivo de la propuesta (Start/Stop, inversión de giro, semáforo, bomba por niveles, puerta, estrella-triángulo, cinta, alarmas) con enunciado y escena. | Revisión. |
| `JWSIM_G9_AUTOGRADING` | Calificación automática por rúbrica (tablas de verdad temporizadas sobre la traza); misma nota en 100 corridas. | Script. |
| `JWSIM_G9_FAULT_INJECTION` | Fallas configurables: sensor pegado, cable cortado, relé soldado, tarjeta SD ausente, RTC sin batería, bus RS-485 con ruido. | Casos por falla. |

## G10 — QEMU, GDB sobre el `.bin` real, HIL

| Gate | Criterios | Verificación |
|---|---|---|
| `JWSIM_G10_QEMU_BRIDGE` | Fork público GPL-2.0 de QEMU-ESP32 con puente genérico SPI/I2C/UART/GPIO por socket; los modelos corren en el proceso del simulador (nunca dentro de QEMU). Términos de la ROM de Espressif verificados y documentados. | Revisión legal + `02_io_basic` compilado con el toolchain xtensa corre en QEMU con los mismos resultados de E/S que en modo HAL. |
| `JWSIM_G10_GDB_REAL_BIN` | Depuración con GDB del `.bin` real en QEMU. | E2E. |
| `JWSIM_G10_HIL_USB` | JWPLC Basic real por USB: la escena virtual maneja sus entradas/lee sus salidas con latencia documentada. | Prueba con placa real. |

## Sincronización con alphas del package

| Gate | Criterios |
|---|---|
| `JWSIM_PACKAGE_SYNC_ALPHAxx` | `package.lock` apunta al tag `v2.1.0-alpha.xx`; build sin cambios del package; todos los gates en `PASS` previamente siguen en `PASS` (o la regresión queda documentada como punto de extensión). |
