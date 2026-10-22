# Modelo MB85RS64V

FRAM SPI de 64 Kbit (8 KiB) de Fujitsu (hoy RAMXEED), la memoria no volátil
del JWPLC Basic (CS = GPIO13, `jwplc_spi_bus.h`). Referencia: **MB85RS64V
datasheet, DS501-00015** (Fujitsu Semiconductor). Implementación:
[`mb85rs64v.cpp`](mb85rs64v.cpp), interfaz
[`../include/jwsim/models/mb85rs64v.h`](../include/jwsim/models/mb85rs64v.h).
Modelado contra el datasheet; el driver `JW_FRAM` del package es el código
bajo prueba (lo detecta por RDID).

## Comportamiento modelado

| # | Comportamiento | Sección del datasheet | Estado |
|---|---|---|---|
| 1 | RDID (9Fh) devuelve 04h (Fujitsu), 7Fh (continuación), 03h, 02h | RDID | Modelado |
| 2 | WRITE (02h) y WRSR (01h) solo escriben con WEL = 1; WREN (06h) pone WEL, WRDI (04h) lo borra | WREN / WRDI / Status Register | Modelado |
| 3 | WEL se borra al subir CS tras completar WRITE o WRSR | WEL | Modelado |
| 4 | READ (03h) y WRITE con dirección de 2 bytes (13 bits útiles); autoincremento; tras 1FFFh sigue en 0000h | READ / WRITE | Modelado |
| 5 | Protección por bloques BP1:BP0 (01 = 1800h–1FFFh, 10 = 1000h–1FFFh, 11 = todo); WPEN con /WP en bajo protege el registro de estado | Status Register / Block Protect | Modelado (/WP se asume en alto en JWPLC Basic) |
| 6 | No volatilidad: memoria y bits BP/WPEN se conservan sin alimentación | Features | Modelado como archivos `fram.bin` (8192 bytes) y `fram-sr.bin` en el directorio de estado |
| 7 | Escritura sin demora (sin ciclo de escritura ni polling de ocupado) | Features | Modelado: cada byte queda escrito al recibirse |

## No modelado

- Modo SLEEP y tiempos de recuperación; frecuencia máxima de reloj (20 MHz).
- Contenido de fábrica: el modelo arranca en 0x00 sin archivo de estado.

## Persistencia

`--state <dir>` en el runner (la app lo pasa por proyecto). El runner guarda
los cambios cada segundo de pared en modo interactivo y siempre al terminar;
la escritura es atómica (temporal + renombrar).
