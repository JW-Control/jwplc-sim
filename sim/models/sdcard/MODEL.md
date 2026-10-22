# Modelo de tarjeta microSD (modo SPI)

Tarjeta microSD del zócalo del JWPLC Basic (CS = GPIO32, detección =
GPIO39 activa en bajo, `jwplc_hardware_config.h`). Referencia: **SD
Specifications Part 1, Physical Layer Simplified Specification** (SD
Association), cap. 7 "SPI Mode". Implementación: [`sdcard.cpp`](sdcard.cpp),
interfaz [`../include/jwsim/models/sdcard.h`](../include/jwsim/models/sdcard.h).
El driver bajo prueba es `sd_diskio.cpp` de la librería `SD` (arduino-esp32)
con FatFs de ESP-IDF encima, sin modificar, más `JW_SD`/`JWPLCDataLog` del
package. Tests: [`tests/models/sdcard_test.cpp`](../../../tests/models/sdcard_test.cpp)
(una prueba por fila).

La tarjeta modelada es **SDHC** (CSD 2.0, CCS = 1, direcciones por bloque de
512 bytes), 64 MiB por defecto, como una tarjeta nueva: MBR con una partición
FAT32.

## Comportamiento modelado

| # | Comportamiento | Sección de la especificación | Estado |
|---|---|---|---|
| 1 | CRC7 de comandos y CRC16 (CCITT) de bloques de datos | 4.5, 7.2.2 | Modelado; vectores CMD0 = 95h, CMD8(1AAh) = 87h, CRC16 de 512 × FFh = 7FA1h |
| 2 | Al encender está en modo SD: solo CMD0 con CS en bajo y CRC válido la pasa a modo SPI (R1 = 01h). Respuesta tras NCR = 1 byte | 7.2.1, 7.5.1 | Modelado |
| 3 | CMD8 (SEND_IF_COND) responde R7 con eco del voltaje y del patrón; CMD0 y CMD8 verifican CRC aunque esté desactivado | 7.2.2, 7.3.2.6 | Modelado |
| 4 | ACMD41 con HCS = 1 devuelve R1 = 01h (ocupada) hasta terminar la inicialización (100 ms desde el primero) y luego 00h; CMD58 (OCR) 00FF8000h, con bits 31 (listo) y 30 (CCS) al terminar | 7.2.1, 5.1 | Modelado (tiempo: parámetro `kInitTime`) |
| 5 | Una SDHC sin HCS en ACMD41 nunca termina de inicializar | 7.2.1 | Modelado |
| 6 | En estado de reposo los comandos de datos son ilegales (R1 = 05h) | 7.3.2.1 | Modelado |
| 7 | CMD59 activa/desactiva el CRC; con CRC activo un comando con CRC incorrecto da R1 con bit 3 | 7.2.2 | Modelado |
| 8 | CMD9/CMD10: token FEh + 16 bytes + CRC16. CSD 2.0 con C_SIZE = sectores / 1024 − 1; CID con MID 4Ah, OID "JW", PNM "JWSIM" | 5.2, 5.3.3 | Modelado |
| 9 | CMD17: R1, espera de acceso (100 µs, 0xFF) y token FEh + 512 bytes + CRC16 | 7.2.3 | Modelado (`kReadLatency`) |
| 10 | CMD24: R1, token FEh + 512 + CRC16, respuesta de datos (05h aceptado, 0Bh error de CRC) y ocupado (MISO = 00h) durante la programación (500 µs) | 7.2.4, 7.3.3.1 | Modelado (`kWriteBusy`); el ocupado sigue aunque se suelte el CS |
| 11 | CMD18: bloques seguidos hasta CMD12; CMD12 lleva un byte de relleno y responde R1b (ocupado breve) | 7.2.3, 7.3.1.3 | Modelado (`kStopBusy`) |
| 12 | CMD25: bloques con token FCh, cada uno con respuesta de datos y ocupado; token FDh termina. ACMD23 se acepta; ACMD22 devuelve los bloques bien escritos | 7.2.4, 4.3.4 | Modelado |
| 13 | Dirección fuera de la capacidad: R1 con error de parámetro (40h) | 7.3.2.1 | Modelado |
| 14 | Extracción: sin tarjeta no responde (MISO en reposo); al insertarla arranca apagada (hace falta CMD0) | — | Modelado; señal `SD_CARD` de la placa (1 = insertada), GPIO39 en bajo con la tarjeta puesta |
| 15 | Formato de fábrica: MBR con partición tipo 0Ch alineada a 1 MiB; FAT32 con 32 sectores reservados, 2 FAT, clúster raíz 2, FSInfo con el conteo de libres; clúster de 512 B hasta 260 MiB, 4 KiB hasta 8 GiB, 16/32 KiB por encima (tamaños de Windows) | — | Modelado; FatFs monta el volumen sin formatear |
| 16 | No volatilidad | — | `sd.bin` en el directorio de estado (solo sectores no nulos); con `sd.img` (imagen cruda) se usa esa imagen y se actualiza en su lugar |

## No modelado

- Tarjetas SDSC (direcciones por byte, CMD16 efectivo), MMC (CMD1) y exFAT.
- Bloqueo con contraseña (CMD42), CMD6, registros SCR/SD_STATUS (ACMD51,
  ACMD13), borrado (CMD32/33/38) y protección de escritura física.
- Tiempos variables (desgaste, recolección de basura): los tiempos son
  constantes y deterministas.

## Tiempos

| Parámetro | Valor | Uso |
|---|---|---|
| `kInitTime` | 100 ms | desde el primer ACMD41 hasta que la tarjeta queda lista |
| `kReadLatency` | 100 µs | desde CMD17/CMD18 hasta el token de datos |
| `kWriteBusy` | 500 µs | programación de cada bloque escrito |
| `kStopBusy` | 10 µs | R1b de CMD12 y token de parada de CMD25 |

Valores típicos de tarjetas microSD SDHC clase 10 (la especificación da
límites: 100 ms de lectura y 250 ms de escritura como máximo); son
parámetros del modelo, no medidos en la placa.

## Persistencia e imagen

`--state <dir>` en el runner (la app lo pasa por proyecto). `sd.bin`:
`"JWSD"`, versión 1, número de sectores y la lista de sectores no nulos
(lba + 512 bytes) en orden. Para usar una imagen propia, copie un `.img`
crudo (por ejemplo, el de una tarjeta real) como `sd.img` en el directorio
de estado; tiene prioridad sobre `sd.bin`. `scripts/lib/fat.mjs` lee ambos
formatos y verifica la consistencia del FAT32 sin pasar por FatFs.

## Depuración

`JWSIM_SD_TRACE=1` imprime cada comando recibido (instante, índice,
argumento, CRC, modo y estado de reposo) en stderr.
