# Informe G0 — `JWSIM_G0_POC_IO_BASIC`

```text
JWSIM_G0_POC_IO_BASIC=PASS
Package: platform-jwplc v2.1.0-alpha.12 (1011f2588fe0), sin modificaciones
Sketch: tools/build-speed-benchmark/sketches/02_io_basic
Host: Linux x86_64 (gcc 13.3) y Windows x86_64 (zig 0.17 / clang + MinGW-w64, ejecutado con wine 9.0).
Desde G1 el destino Windows usa MinGW-w64 GCC (ARCHITECTURE §3.1, hallazgo H10); el hash de C5 no cambió.
```

## Objetivo

Compilar el sketch `02_io_basic` del package **sin modificarlo** para
x86_64, contra un HAL nativo y un modelo del TCA6424A, y observar en consola
las entradas y salidas digitales.

```cpp
void setup()
{
    pinMode(I0_0, INPUT);
    pinMode(Q0_0, OUTPUT);
}

void loop()
{
    digitalWrite(Q0_0, digitalRead(I0_0));
}
```

## Resultado

| Criterio | Resultado |
|---|---|
| C1 compila y enlaza x86_64 sin tocar el package | **OK** — 16 librerías del package + TFT_eSPI, ~90 unidades |
| C2 `Q0_0` sigue a `I0_0` en ≤ 100 ms | **OK** — latencias 67,0 / 6,9 / 6,9 / 6,9 ms |
| C3 ninguna otra salida cambia | **OK** |
| C4 10 corridas → mismo hash | **OK** — `0xf11d4b75d404a4a1` |
| C5 `.exe` de Windows con el mismo hash | **OK** — `0xf11d4b75d404a4a1` bajo wine |

Reproducir:

```sh
node scripts/fetch-package.mjs
node scripts/gate-g0-poc.mjs                     # C1–C4
node scripts/gate-g0-poc.mjs   # C5 (Windows) si hay MinGW-w64 GCC y wine
```

## Salida de consola

```text
$ node cli/jwsim-cli.mjs run <package>/tools/build-speed-benchmark/sketches/02_io_basic \
    -- --until 4000 --stim tests/poc/02_io_basic.stim --stats
[  1000.000 ms] DI    I0_0 = 1
[  1067.046 ms] DO    Q0_0 = 1
[  1500.000 ms] DI    I0_0 = 0
[  1506.891 ms] DO    Q0_0 = 0
[  1600.000 ms] DI    I0_1 = 1
[  1800.000 ms] DI    I0_1 = 0
[  2000.000 ms] DI    I0_0 = 1
[  2003.000 ms] DI    I0_0 = 0
[  2500.000 ms] DI    I0_0 = 1
[  2506.892 ms] DO    Q0_0 = 1
[  2550.000 ms] DI    I0_7 = 1
[  3000.000 ms] DI    I0_0 = 0
[  3006.891 ms] DO    Q0_0 = 0
[  3200.000 ms] DI    I0_7 = 0
--- estadísticas (tiempo virtual) ---
tarea              prio core cpu_virtual_ms    despachos
loopTask              1    1       3210.847         3609
loop1Task             1    0          0.000         3413
jwplcSystemTask       2    1         11.418          909
jwplcBtnScan          2    1        259.480          800
I2C0: 191 transacciones, 4 NACK, 75.010 ms de bus
VSPI: 287548 bytes (287548 sin dispositivo seleccionado)
JWSIM_RESULT t_end_ms=4000.000 stop=time DI=0b00000000 DO=0b00000000 trace_events=301449 trace_hash=0xf11d4b75d404a4a1 wall_ms=42.5
```

Lectura:

- **Todo el camino es el real**: `digitalWrite(Q0_0, …)` → macro de
  `Arduino.h` del package → `jwplc_digitalWrite` → `TCA6424A_writePin`
  (con su shadow) → `jwplcI2C_updateBit` → `i2cWriteReadNonStop`/`i2cWrite`
  del HAL nativo → bus I2C → **modelo TCA6424A** → pin P10 → placa (EN_IO) →
  `Q0_0`. La lectura de `I0_0` sale del caché que llena `jwplcSystemTask`
  cada 20 ms leyendo el puerto 0 del modelo.
- El pulso de 3 ms en 2000 ms **no aparece en `Q0_0`**: es más corto que el
  periodo de escaneo de 20 ms del runtime. Es el comportamiento esperado del
  PLC real.
- `I0_1` e `I0_7` cambian sin mover salidas.
- Latencia en régimen ≈ 6,9 ms (fase entre el estímulo y la vuelta de 20 ms
  del escaneo). La primera, 67 ms: en ese momento `jwplcSystemTask` estaba
  sondeando el W5500 (no poblado en G0) con `delay(1)` dentro de
  `W5100Class::softReset`. Ver hallazgo H4 en `ARCHITECTURE.md`.
- Las 4 NACK son las lecturas del RTC DS3232M (0x68), aún no modelado (G4).
- Los 287 548 bytes SPI sin destinatario son la inicialización y el primer
  refresco de la TFT (ST7789 no modelado todavía, G4).
- 4 s virtuales en 42 ms de pared: **≈ 94× tiempo real**.

## Arranque

El arranque completo (`app_main` → `initPeripherals` → `setup`) toma
≈ 587 ms virtuales, dominados por las esperas reales de `TFT_eSPI::init`
(reset y *sleep out* del ST7789). La traza de pilas
(`JWSIM_TRACE_TASK=loopTask JWSIM_TRACE_BT=1`) muestra la secuencia:
RTC (NACK) → TFT (esperas del controlador) → TCA6424A (test, bancos,
direcciones) → `EN_IO=1` → primer escaneo → `setup()`.

## Bloqueos encontrados y cómo se resolvieron (sin tocar el package)

| Bloqueo | Resolución |
|---|---|
| `Arduino.h` autoincluye `JWPLC_Display_Auto.h`: el sketch mínimo enlaza 16 librerías (TFT, SD, FRAM, Ethernet, RS-485, Modbus…) | El HAL soporta el arranque completo del runtime; los periféricos sin modelo se presentan como "no poblados" |
| `JWPLC_TFT` necesita TFT_eSPI y el package solo trae `libJWPLC_TFT.a` (xtensa) | TFT_eSPI 2.5.43 descargada de upstream (SHA-256 fijado) y compilada con su procesador Generic |
| La librería `SPI` lee/escribe registros GP-SPI del ESP32 por el primer miembro de `spi_t` | Modelo proxy de `spi_dev_t` en `sim/hal/include/soc/spi_struct.h` |
| `SD`/`FS` dependen de FatFs y del VFS de ESP-IDF | FatFs real de ESP-IDF v5.5.1; registro VFS nativo |
| Corrupción de heap al fallar `SD.begin()` sin tarjeta | Uso-después-de-liberar latente en la librería SD (hallazgo H1); el VFS nativo retiene el contexto |
| newlib vs glibc/MinGW (`itoa/utoa`, `limits.h`, `assert`, `dirent.d_type`, `st_blksize`, `mkdir(p,m)`, `MAX`, `strchr` const) | `newlib_compat.c`, headers sustitutos e `include-win32/` |

## Limitaciones de esta prueba

- Costos de CPU sin calibrar contra hardware (G1).
- Solo el TCA6424A está modelado; RTC, FRAM, SD, TFT, W5500 y botonera se
  presentan como ausentes o en reposo.
- Puntos del modelo TCA6424A marcados "verificar" en
  `sim/models/tca6424a/MODEL.md` (AI=0, envolvimiento con AI=1, polaridad en
  salidas): no afectan a este sketch.
