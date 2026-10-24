# Sincronización con platform-jwplc 2.1.0-alpha.14

```text
Package: v2.1.0-alpha.13 (11237c2c8a56) → v2.1.0-alpha.14/feature/hmi-designer (9a27b138b795), sin modificaciones
Fecha: 2026-10-24 (desarrollo de alpha.14 cerrado; publicación y documentación pendientes)
Procedimiento: ARCHITECTURE §9

JWSIM_PACKAGE_SYNC_ALPHA14=PASS
```

alpha.14 todavía no tiene tag: `package.lock` fija la rama de integración
y su commit. `scripts/fetch-package.mjs` ahora acepta una rama: si avanza
con los commits de publicación, trae igual el commit fijado (un tag que se
mueve sigue siendo un error). Cuando se publique, basta con cambiar `REF`
por el tag si su árbol coincide.

## 1. Qué trae alpha.14 que afecte al simulador

| Cambio del package | Efecto en el simulador |
|---|---|
| `JW_RS485` y `JW_ModbusRTU` nuevas, incluidas por el autoload | Compilan desde la fuente sin cambios en `sim/`. Paridad registrada (`sim/package-parity.json`). |
| Pines del Basic como constantes `JWPLC_*` en librerías y ejemplos (#148) | Sin efecto: los valores no cambian. |
| `JWPLC_Display`: HMI Designer (menú, ICON, BAR incremental, formato de valores) | Compila desde la fuente; los ejemplos del Display pasan igual. |
| `libJWPLC_TFT.a` regenerado con el DISPON diferido de alpha.13 | El simulador aplica el mismo cambio a TFT_eSPI (H3; ver §3). |
| Ejemplos corregidos con la matriz del simulador ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142)) | H11, H13, H15, H16, H17, H18 y H19 cerrados; sus pruebas pasan a esperar el comportamiento correcto. |
| `JW_MatrixButtons`: ejemplos 01–03 con el objeto global `JWPLC_Buttons`; 04 y 05 retirados | H8 cerrado: los tres compilan y tienen prueba. |
| `JW_RS485/Status` con un solo bus (Serial2, GPIO16/17) | Prueba reescrita. |
| `JWPLC_RemoteIO_Slave_RTU`: `FAILSAFE_MS` 100 → 1000 | La prueba ya estaba escrita para alpha.14. |

## 2. Resultados

Matriz de ejemplos: **109 ejemplos; 106 compilan, corren y pasan su
prueba**. Los 3 restantes son sketches obsoletos de
`tools/build-speed-benchmark` (H9).

Ethernet sin el mutex tomado por fuera (H15): el DNS ya no falla a los
40 ms sino que espera su plazo real porque nadie responde DNS en la red
simulada (~4,5 s en `Ethernet_Continuous_Stress_TFT`, ~15 s en
`Ethernet_HTTP_TFT_Diagnostics`). Con un servidor real el GET llega a
`HTTP 200` (`scripts/diag-eth-http.mjs`).

| Gate | Resultado |
|---|---|
| JWSIM_G0_POC_IO_BASIC | PASS |
| JWSIM_G1_DETERMINISM, PACKAGE_EXAMPLES_IO, HAL_CORE | PASS |
| JWSIM_G1_SPEED_X10 | PASS (02_io_basic ×47,8; start_stop_8io ×20,1, justo sobre ×20) |
| JWSIM_G2_LOCAL_COMPILE, UNSUPPORTED_LIB_MSG | PASS |
| JWSIM_G3_BUS_ANALYZER, BREAKPOINTS_STEP, FREEZE_TIME, RECORD_REPLAY | PASS |
| G4 (RTC, FRAM, NVS, SD, TFT, RS-485, W5500, Modbus TCP, HAL extras) | PASS. NVS ya no acepta la falla conocida H13: `Superblock_Redundancy` termina 51 PASS, 0 FAIL |
| JWSIM_G5_HEADLESS_CLI, RELEASE_TREE_PARITY | PASS |
| JWSIM_G7_* y E2E de la escena | PASS |

## 3. TFT_eSPI con el DISPON diferido

El `init` de TFT_eSPI 2.5.43 pinta la memoria de la pantalla de rojo y la
enciende; `JWPLC_TFT` la limpia a negro 120 ms después. Desde alpha.13 el
package compila TFT_eSPI con `JWPLC_TFT_DEFER_DISPON`: el `init` termina con
la pantalla apagada y `JWPLC_TFT` la enciende ya en negro. El simulador
compilaba el `ST7789_Init.h` original y mostraba un barrido rojo al arrancar.
`scripts/fetch-third-party.mjs` aplica ahora el mismo cambio y verifica el
SHA-256 del archivo validado en placa (`44873be8…`).

Efecto: el arranque dura lo mismo que en la placa, 120 ms menos que antes.
Las pruebas con tiempos ajustados al arranque viejo se corrigieron
(`tests/examples`, capturas de `tests/bus`).
