# Sincronización con platform-jwplc v2.1.0-alpha.13

```text
Package: v2.1.0-alpha.12 (1011f2588fe0) → v2.1.0-alpha.13 (11237c2c8a56), sin modificaciones
Fecha: 2026-10-23 (alpha.13 validada por JW Control)
Procedimiento: ARCHITECTURE §9

JWSIM_PACKAGE_SYNC_ALPHA13=PENDING (matriz G1 y Windows CI en curso)
```

## 1. Qué trae alpha.13 que afecte al simulador

| Cambio del package | Efecto en el simulador |
|---|---|
| `JWPLC_Ethernet`: acceso seguro al W5500 (dueño del bus por tarea, sockets con "lease"), inicio sin la espera de 560 ms; `JWPLC_ModbusTCP` | Ninguno en el código: el modelo del W5500 es del chip. La placa pasa a traerlo poblado (§3). |
| `JWPLC_TFT`: el lote tiene dueño por tarea (`_batchOwner`); `begin()` borra la pantalla, envía DISPON y espera 120 ms | Corrige el hallazgo H12. El runtime arranca ~137 ms más tarde: `setup()` del sketch también. |
| Core: el puente I2C toma un mutex recursivo (`jwplcI2C_transactionBegin/End`) en cada acceso a las E/S del TCA6424A | Dos operaciones de semáforo más por `digitalWrite`/`digitalRead`: el simulador iba 2–2,6 veces más lento (§4). |
| `g_ioState.initialized` se activa recién al terminar `initPeripherals()` | Sin efecto visible en los gates. |
| `JW_FRAM`, `JW_SD`, `JWPLC_ModbusRTU`, `JWPLC_RS485` | Cambios internos; los gates pasan sin ajustes. |

Siguen en alpha.13 los hallazgos H8, H11, H13 y H14 (sus librerías no
cambiaron). H6 se cierra: los "LEDs" RUN/ERR/BUS/ETH son indicadores de la
pantalla de reposo.

## 2. Compilación

alpha.13 compila desde el código fuente sin cambios en `sim/` ni en
`sim/core-manifest.json` (no trae fuentes nuevas en `cores/jwcontrol`; la
librería Ethernet agrega `JWPLC_W5500_SafeAccess.cpp`, que se compila como
cualquier otra).

## 3. W5500 poblado por defecto

Con alpha.12 la placa no traía el W5500 salvo con `--eth`. Desde alpha.13
viene poblado, como el JWPLC Basic: `--no-eth` (o
`simulation.peripherals.ethernet.present = false` en el proyecto) lo quita.
En la CLI nadie responde en la red (el DHCP queda pendiente); en la app la
red es la del PC (ARCHITECTURE §7.4). La pantalla de reposo ahora muestra el
estado de ETH ("LNK" mientras negocia el enlace).

## 4. Velocidad

| Sketch (30 s virtuales, este host) | alpha.12 | alpha.13 antes | alpha.13 con los cambios |
|---|---|---|---|
| 02_io_basic | ×63 | ×35 | ×48 |
| start_stop_8io | ×17 | ×13 | ×20 |

Cambios en el motor, sin cambiar la traza (mismos hashes):

- `sim/` (motor, HAL, modelos, runner) se compila con `-O2`; el firmware
  sigue en `-O1` y el sketch en `-O0` (depuración).
- `S()` (el estado del planificador) es una lectura de puntero integrable
  tras la primera llamada.
- El contador de progreso del vigilante ya no usa `fetch_add`: lo escribe
  un solo hilo.

`JWSIM_G1_SPEED_X10` vuelve a pasar en este host (×48 y ×20,4; ×10 en tiempo
real con 0 % de deriva).

## 5. Expectativas que se volvieron a fijar

| Gate | Ajuste | Motivo |
|---|---|---|
| `JWSIM_G3_BUS_ANALYZER` | Capturas del firmware regrabadas; `i2c-tca6424a` hasta 1300 ms; `spi-w5500` con la detección de `w5100.cpp` contra el chip (las tramas en formato W5200 caen en un bloque reservado del W5500; MR sigue en 0, distinto de 08h) | Arranque más largo y W5500 poblado. Las filas decodificadas del resto no cambiaron. |
| `JWSIM_G4_TFT_HMI` | Botonera desde 1,5 s; referencias de la pantalla de reposo con ETH = LNK | Arranque de la TFT y W5500 poblado. Las páginas de usuario no cambiaron. |
| `JWSIM_G4_NVS_PREFERENCES` | `eeprom_write` con 9 s | El `commit` del ejemplo quedaba fuera de la ventana de 7 s. |
| `JWSIM_G4_SD_DATALOG` | El sketch de datalog informa el estado al cerrar; dos arranques de `05.microSD_Basic` con el mismo `millis()` (antes, 992 fijo) | Tiempos del arranque. |

## 6. Resultado

En curso: matriz de compilación de G1 (Linux) y corridas de Windows.

## 7. Windows

En curso: `g2-windows.yml`, `g3-windows.yml` y `g4-windows.yml` sobre `6e37224`.
