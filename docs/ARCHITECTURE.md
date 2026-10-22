# JWPLC Sim — Arquitectura (G0)

```text
Estado: G0 — arquitectura cerrada para iniciar G1
Package de referencia: platform-jwplc v2.1.0-alpha.12 (1011f2588fe0), árbol JWPLC/2.1.0
Base del core: arduino-esp32 3.3.8 (esp32-libs 3.3.8, toolchain esp-x32 2601)
```

Este documento fija cómo se construye el simulador de escritorio del
**JWPLC Basic**. Las decisiones de alto nivel (escritorio con Electron, HAL
nativo como backend principal, modelos por registros, motor determinista,
OpenPLC como ecosistema vinculado, depuración sin JTAG, QEMU opcional y
separado, licencia libre, índice comunitario) vienen dadas y aquí solo se
concretan. Lo que la prueba técnica de G0 confirmó o corrigió está marcado
como **[G0]**.

Índice:

1. [Capas y procesos](#1-capas-y-procesos)
2. [Qué se reemplaza y qué se compila tal cual](#2-qué-se-reemplaza-y-qué-se-compila-tal-cual)
3. [Compilación nativa del sketch](#3-compilación-nativa-del-sketch)
4. [Placa virtual e interfaz de dispositivos](#4-placa-virtual-e-interfaz-de-dispositivos)
5. [Mapa de hardware del JWPLC Basic](#5-mapa-de-hardware-del-jwplc-basic)
6. [Modelo de tiempo y scan](#6-modelo-de-tiempo-y-scan)
7. [Protocolo motor ↔ interfaz](#7-protocolo-motor--interfaz)
8. [Formato de proyecto `.jwsim` v1](#8-formato-de-proyecto-jwsim-v1)
9. [Sincronización con el package](#9-sincronización-con-el-package)
10. [Límites de fidelidad](#10-límites-de-fidelidad)
11. [Hallazgos para el package (G0–G1)](#11-hallazgos-para-el-package-g0g1)
12. [Estructura del repositorio](#12-estructura-del-repositorio)

---

## 1. Capas y procesos

```text
┌──────────────────────────── Electron (escritorio) ─────────────────────────────┐
│ Renderer: Monaco · pestañas Sketch / Ladder / HMI / 2D eléctrico / 3D / Buses   │
│           tabla de observación y forzado · consola · analizador de buses        │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Main (Node): proyectos .jwsim · watcher de archivos vinculados · compilación      │
│              (jwsim-cli) · ciclo de vida de procesos · proxy DAP · COM virtuales  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Motor de escena (worker de Node): biblioteca de dispositivos industriales (TS),   │
│              netlist eléctrica, ejercicios/calificación, inyección de fallas      │
└───────────────▲──────────────────────────────────────────────▲───────────────────┘
                │ protocolo sim-port (§7)                      │ sockets / COM
┌───────────────┴──────────────── Runner de firmware (nativo, 1 por PLC) ───────────┐
│ sketch + core JWPLC + librerías del package (sin cambios)                          │
│ ─────────────────────────── API Arduino / ESP-IDF ──────────────────────────────  │
│ HAL nativo (sim/hal): GPIO, I2C, SPI (+registros GP-SPI), UART, FreeRTOS, tiempo   │
│ Motor determinista (sim/engine): núcleos virtuales, fibras, eventos, traza         │
│ Placa virtual (sim/boards/jwplcbasic) + modelos por registros (sim/models)         │
└────────────────────────────────────────────────────────────────────────────────────┘
        Modos alternativos del mismo runner de modelos (sim/models reutilizado):
        · QEMU-ESP32 (G10): proceso QEMU separado ⇄ puente por socket ⇄ modelos
        · HIL (G10): JWPLC Basic real por USB ⇄ dispositivos virtuales
```

Principios:

- **Un proceso nativo por PLC simulado.** El firmware compilado, el HAL, el
  motor y los modelos de periféricos de la placa viven en el mismo proceso
  porque cada transacción I2C/SPI necesita respuesta inmediata y determinista
  (la TFT mueve cientos de KB por refresco). Varios PLC (RS-485 multinodo,
  Modbus TCP) = varios runners coordinados por el main.
- **Dispositivos industriales fuera del runner.** Pulsadores, lámparas,
  motores, cintas, tanques… cambian a escala de milisegundos y se describen
  mejor en TypeScript; corren en el motor de escena y se sincronizan con el
  runner por horizontes (§6.6). Los dispositivos que necesitan respuesta por
  bit (encoders rápidos, PWM) se escriben como modelos nativos con el SDK.
- **El motor no depende de Electron.** `jwsim-cli` ejecuta el mismo runner en
  modo headless para CI (G5) y para los gates.
- **Un crash del firmware no tumba la interfaz**: el runner es otro proceso.

## 2. Qué se reemplaza y qué se compila tal cual

Regla **[G0]**: *se compila sin cambios todo el código del package; se
reemplazan solo las implementaciones `esp32-hal-*.c` del core y ESP-IDF*. Se
usa código real de ESP-IDF cuando es portable (FatFs) y un sustituto cuando
toca hardware. La clasificación exacta de cada fuente de `cores/jwcontrol`
está en [`sim/core-manifest.json`](../sim/core-manifest.json); un archivo
nuevo del package sin clasificar hace fallar el build.

### 2.1 Se compila tal cual (package)

| Componente | Archivos |
|---|---|
| API Arduino | `Arduino.h` (incluido el bloque JWPLC que redirige `pinMode/digitalWrite/digitalRead` y el autoload), `WString`, `Print`, `Stream`, `IPAddress`, `MacAddress`, `HardwareSerial.cpp`, `FunctionalInterrupt`, `base64`, `cbuf`, `stdlib_noniso`, `wiring_*`, `esp32-hal-periman.c` |
| Runtime JWPLC | `main.cpp` (app_main, loopTask, loop1Task, jwplcSystemTask), `jwplc_peripherals.cpp`, `peripherals_init.cpp`, `peripherals/src/jwplc_i2c_bridge.cpp`, `jwplc_spi_bus.cpp`, `peripheral-tca6424a.c` |
| Variante | `variants/jwplcbasic/pins_arduino.h`, `pins_is.h`; flags de `boards.txt` (`jwplcbasic.build.defines`) leídos en cada build |
| Librerías | las 16 que arrastra el autoload (§3.2) y cualquier otra que el sketch incluya |

### 2.2 Se reemplaza (sim/hal)

| Original | Reemplazo | Notas |
|---|---|---|
| `esp32-hal-gpio.c`, `-matrix.c`, `driver/gpio` | `gpio.cpp` | 40 GPIO como redes; ISR síncronas en G0 |
| `esp32-hal-i2c.c`, `-i2c-ng.c` | `i2c.cpp` | transacción completa → `I2CBus`; la tarea se bloquea la duración eléctrica |
| `esp32-hal-spi.c` | `spi.cpp` | byte a byte → `SPIBus`; `spi_t` conserva `volatile spi_dev_t *dev` como primer miembro |
| `soc/spi_struct.h` | modelo proxy de registros | ver §11 H2 |
| `esp32-hal-uart.c` | `uart.cpp` | UART0 → consola; UART1/2 con tiempo de carácter, UART2 al transceptor RS-485 (§7.3) |
| `esp32-hal-misc.c`, `-cpu.c`, `-psram.c`, `chip-debug-report.cpp` | `arduino_misc.cpp` | `millis/micros/delay` sobre tiempo virtual |
| `Esp.cpp` | `esp_class.cpp` | valores fijos y deterministas |
| FreeRTOS (ESP-IDF) | `freertos.cpp` + `sim/engine` | tareas, colas, semáforos, mutex recursivos, notificaciones, grupos de eventos |
| `esp_random`, `esp_log`, `esp_system`, `esp_task_wdt`… | `esp_system.cpp` | `esp_random` determinista con semilla; `esp_restart` (§7.2) |
| `esp_timer` | `esp_timer.cpp` | tarea "esp_timer" y despacho por ISR (§7.2) **[G4]** |
| timers de software de FreeRTOS | `freertos_timers.cpp` | tarea "Tmr Svc" y cola de comandos **[G4]** |
| GPTimer de ESP-IDF | `gptimer.cpp` | `esp32-hal-timer.c` del core se compila sin cambios encima **[G4]** |
| NVS de ESP-IDF (`nvs_flash`, `nvs_*`) | `nvs.cpp` | persistente en `nvs.bin`; `Preferences` y `EEPROM` se compilan tal cual **[G4]** |
| LEDC, `analogWrite`, `tone` | `ledc.cpp` | §10 |
| VFS FAT (`esp_vfs_fat_register`) y la libc de archivos del firmware | `vfs_fat.cpp`, `vfs.cpp` | `fopen("/sd/…")` → FatFs real (§7.2) **[G4]** |
| hora del sistema (`time`, `gettimeofday`, `settimeofday`) | `systime.cpp` | sigue al tiempo virtual (§7.2) **[G4]** |
| ADC, DAC, RMT, touch, sigma-delta, Bluetooth, deep sleep | `unsupported.cpp` | fallan con mensaje explícito |
| newlib (`itoa/utoa`, y en Windows `dirent`, `stat`, `mkdir(p,m)`, `fsync`) | `newlib_compat.c`, `include-win32/` | MinGW y glibc no son newlib |

### 2.3 Headers sustitutos de ESP-IDF (sim/hal/include)

`sdkconfig.h`, `soc/soc_caps.h` (subset ESP32), `freertos/{FreeRTOS,task,queue,semphr,event_groups,timers,ringbuf,portmacro}.h`,
`driver/{gpio,uart}.h`, `hal/{uart_types,cpu_hal}.h`, `esp_{err,log,timer,system,random,sleep,task_wdt,cpu,partition,rom_md5,idf_version,netif_ip_addr,vfs_fat,bit_defs}.h`,
`rom/ets_sys.h`, `soc/{gpio_reg,gpio_sig_map,rtc,uart_pins,spi_struct}.h`, `lwip/{ip_addr,netif}.h`.
Contienen **solo** lo que el código del package consume (medido en G0
compilando el cierre completo); cuando una alpha use algo nuevo, se agrega
aquí.

### 2.4 FreeRTOS usado por el package (medido en G0)

`xTaskCreatePinnedToCore/Universal`, `vTaskDelay`, `vTaskDelete`,
`vTaskSuspendAll/xTaskResumeAll`, `xTaskGetCurrentTaskHandle`, `taskYIELD`,
`xSemaphoreCreate{Mutex,RecursiveMutex,Binary}`, `xSemaphoreTake/Give(Recursive)`,
`vSemaphoreDelete`, `xQueueReceive/Reset` (HardwareSerial), `pdMS_TO_TICKS`,
`portMAX_DELAY`. Todo implementado; desde G4 también los timers de
software (`xTimerCreate`…) y `esp_timer`.

## 3. Compilación nativa del sketch

### 3.1 Flujo (`jwsim-cli build`)

1. Resolver el package fijado (`package.lock`, §9) y las dependencias de
   terceros (`third_party/sources.json`, SHA-256 por archivo).
2. Leer la placa de `boards.txt` del package (`build.defines`, `build.f_cpu`,
   `build.board`, `build.variant`): **no se copian flags**.
3. Preprocesar el `.ino`: pestañas concatenadas, `#include <Arduino.h>`,
   `#line` para mapear errores y **[G2]** prototipos automáticos
   (`cli/lib/prototypes.mjs`): las funciones globales de las pestañas reciben
   un prototipo antes de la primera definición, con `#line` a su definición.
   Se omiten, como en arduino-cli, las ya declaradas, los métodos, las
   plantillas y las que tienen argumentos por defecto.
4. Descubrir librerías como arduino-cli: preprocesar cada fuente; ante
   "No such file" buscar qué librería provee el header y agregarla.
5. Compilar core (según el manifiesto), librerías, terceros y runtime del
   simulador; empaquetar en `.a` por grupo; enlazar un ejecutable nativo.
   Recompilación incremental por dependencias (`-MMD`) y **caché de objetos
   compartida entre sketches** (`build/cache/<destino>/`), con el comando de
   compilación completo como clave.

Recompilación rápida **[G2]** (cambio en `loop()` de `02_io_basic`: de ~2 s
a ~0,4 s en Linux, ~0,6 s en el destino Windows):

- Caché del descubrimiento (`discovery.json`): las librerías dependen solo
  de las directivas del preprocesador del sketch (el package está fijado).
- Header precompilado del prefijo del `.ino` (`-include` forzados +
  `Arduino.h`, que con el autoload arrastra 16 librerías), en la caché
  compartida e indexado por flags e include path. Si GCC no puede usarlo se
  compila sin él; el resultado (hash de traza) es idéntico. En Windows, GCC
  carga el PCH en una dirección fija y a veces ASLR ya la ocupó
  (`mingw32_gt_pch_use_address … PCH allocation failure`, aleatorio por
  proceso). La causa es que `cc1`/`cc1plus` de WinLibs se enlazan con ASLR
  (`DYNAMIC_BASE`, `HIGH_ENTROPY_VA`): el toolchain incluido se corrige
  quitando esos dos bits del encabezado PE (`ensurePchFriendlyCompiler` en
  `scripts/fetch-toolchain.mjs`; no se toca el código de GCC). Como red de
  seguridad se reintenta hasta 3 veces y, si persiste, esa compilación va
  sin PCH. Medido en Windows 11: `.ino` con PCH 0,77 s, sin PCH 2,34 s.
- El `.ino.cpp` preprocesado y los `.a` solo se reescriben si cambian.

Sin red **[G2]**: con el package y los terceros ya descargados, compilar no
accede a la red (verificado en un namespace sin red). Toolchain incluido:
`scripts/fetch-toolchain.mjs` instala el GCC fijado en
`third_party/toolchain.json` (WinLibs en Windows, con SHA-256) en
`.jwsim/toolchain/`, y `cli/lib/toolchain.mjs` lo usa antes que el del `PATH`.

Paridad con `platform.txt` **[G1]**: `-DARDUINO_PARTITION_<build.partitions>`,
`build_opt.h` del sketch aplicado a todas las unidades (`"@{build.opt.path}"`)
y `-I{build.source.path}` (carpeta original del sketch, necesaria para
`#include "../otro_sketch/x.ino"`). Si la carpeta del sketch no tiene
headers, esa ruta solo se agrega a las unidades del sketch para no invalidar
la caché (el resultado es idéntico).

Librerías no soportadas **[G1]**: `sim/core-manifest.json →
unsupportedLibraries` lista las librerías del core sin sentido en el JWPLC
Basic simulado (WiFi, BLE, WebServer, Preferences, LittleFS…) con el motivo.
Si el descubrimiento llega a una de ellas, la compilación se detiene con
"la librería X (requerida por 'Y.h') no está soportada por JWPLC Sim: motivo".

Toolchains **[G1]**: siempre **GCC**, el mismo compilador que el ESP32
(`xtensa-esp32-elf-gcc`). clang rechaza código válido del package (H10), así
que no se usa.

| Destino (`--target`) | Compilador | Modelo de datos | Uso |
|---|---|---|---|
| `windows` | MinGW-w64 GCC 13 (hilos posix), estático; cruzado desde Linux con `x86_64-w64-mingw32-g++-posix` | LLP64: `int` y `long` de 32 bits, punteros de 64 | Destino principal (instalador) |
| `native` | `gcc` del sistema | Linux/macOS: LP64 (`long` de 64 bits); Windows: LLP64 | Desarrollo y CI |
| `linux-x86` | `gcc -m32`, estático | ILP32, igual que el ESP32 | Verificar código que depende de `sizeof(long) == 4` en Linux |

**[G1]** El `.exe` de Windows, el binario Linux x86_64 y el binario
`linux-x86` producen el mismo hash de traza en los sketches de referencia.

### 3.2 El autoload arrastra todo el ecosistema **[G0]**

`Arduino.h` del package, cuando se incluye desde el sketch
(`__INCLUDE_LEVEL__ <= 1`), incluye `JWPLC_Display_Auto.h`, que ancla
`JWPLC_Display` y trae `JWPLC_GlobalPeripherals`. Resultado: **hasta el
sketch más simple (`02_io_basic`, 10 líneas) enlaza 16 librerías y ~90
unidades de compilación**:

```text
JWPLC_Display, JWPLC_TFT, JWPLC_GlobalPeripherals, JW_RTC, JW_FRAM,
Adafruit_BusIO, SPI, JW_SD, SD, FS, JW_MatrixButtons, JWPLC_Ethernet,
JWPLC_RS485, JWPLC_ModbusRTU, Wire, TFT_eSPI (terceros)
```

Consecuencia de diseño: el HAL nativo no puede ser "mínimo por API usada en
el sketch"; debe soportar el arranque completo del runtime (RTC, FRAM, SD,
botonera, TFT, Ethernet) aunque los modelos de esos periféricos lleguen en G4.
Mientras un modelo no exista, la placa lo presenta como **no poblado** y el
firmware recorre sus rutas reales de "periférico ausente".

### 3.3 Overrides por unidad

`sim/core-manifest.json → flagOverrides` declara flags por archivo, siempre
con su justificación. Hoy:

- `JWPLC_TFT.cpp` y `TFT_eSPI.cpp`: `-UESP32 -UARDUINO_ARCH_ESP32` para
  usar el procesador **Generic** de TFT_eSPI (SPI.transfer + digitalWrite) en
  vez del procesador ESP32, que escribe registros GPIO/SPI por dirección
  física. El objeto `TFT_eSPI` queda encapsulado en `JWPLC_TFT.cpp` (ninguna
  otra unidad incluye `TFT_eSPI.h`), así que no hay riesgo de ODR.
- Windows: FatFs/SD/FS reciben `-include jwsim_fatfs_win32.h` para mantener
  los tipos C99 de FatFs (como en el ESP32).

### 3.4 Modelo de datos **[G1]**

El ESP32 es ILP32 (`int`, `long` y punteros de 32 bits). `millis()` y
`micros()` devuelven `unsigned long`, y el HAL los trunca a 32 bits como en
el chip, de modo que `micros()` desborda cada 2³² µs (71,6 min). El modismo
`if (micros() - last >= periodo)` con `unsigned long` depende de que la resta
también sea de 32 bits:

- Windows (LLP64) y `linux-x86` (ILP32): `long` de 32 bits, comportamiento
  idéntico al ESP32.
- Linux/macOS x86_64 (LP64): `long` de 64 bits; en el desborde la resta da
  un valor enorme y el `if` se dispara antes de tiempo. `tests/sketches/
  micros_rollover` lo muestra: en LP64 hay un tick espurio a los 4 799 969 ms
  (desborde de `micros()`); en ILP32 y en Windows el tick llega a los
  4 800 004 ms como en la placa.

Por eso el destino principal (Windows) es fiel en este punto, y en Linux se
recomienda `--target linux-x86` para pruebas largas. Lo que sigue difiriendo
en Windows es `sizeof` de punteros (`void *`, `size_t`, `intptr_t`: 8 bytes
en vez de 4), visible solo en código que mide estructuras con punteros.

### 3.5 Símbolos `weak` en Windows **[G1]**

El core y las librerías del package usan `__attribute__((weak))` y alias
weak (callbacks de `jwplc_peripherals.cpp`, `yield`, profilers H3E,
`esp32-hal-*.c`). GCC para MinGW los emite como "weak externals" de COFF y
GNU ld 2.41 y lld 18 no los resuelven si otro objeto los referencia
("undefined reference"). `cli/lib/weak-pe.mjs` recorre los objetos con `nm`
antes de enlazar y genera un objeto con un salto a la definición weak
(cuando no hay definición fuerte) o con dirección 0 (referencia weak sin
definición), que es exactamente la semántica ELF del ESP32. Si el sketch
define el símbolo, gana su definición fuerte. **[G4]** GCC lee esas
referencias por un puntero `.refptr` con reubicación de base: el ejecutable
se enlaza sin ASLR (`--disable-dynamicbase`) para que el 0 siga siendo 0.
Con ASLR, `serialEventRun()` del core llamaba a una dirección basura al
recibir por la UART (Windows nativo; bajo wine no ocurre).

GCC nombra el valor por defecto `.weak.X.<primer símbolo global del
archivo>`, y dos unidades pueden generar el mismo nombre (en
`JWPLC_LogicRuntime_UI` ambas empiezan con el `snprintf` inline de MinGW):
esos nombres se renombran con `objcopy` en una copia del objeto, sin tocar la
caché compartida.

## 4. Placa virtual e interfaz de dispositivos

Definida en [`sim/engine/include/jwsim/devices.h`](../sim/engine/include/jwsim/devices.h).

| Puerto | Tipo | Semántica |
|---|---|---|
| Señal | `Net` | Nivel lógico con varios manejadores identificados por dueño; sin manejadores → nivel de reposo (pull de la placa); con varios → AND cableado + marca de contención. Oyentes por cambio. |
| I2C | `I2CTarget` + `I2CBus` | Eventos `start(read)`, `write(byte)→ACK`, `read(ack)→byte`, `stop()`. El bus calcula la duración a la frecuencia configurada y traza cada transacción. |
| SPI | `SPITarget` + `SPIBus` | Selección por la red de CS (activa en bajo); `transfer(mosi)→miso` por byte. MISO en reposo = 0xFF. |
| UART | `Board::uart_tx` / `uart_inject` | Flujo de bytes. **[G4]** En UART1/2, `Board::uart_char` informa cada carácter con su [inicio, fin] y `uart_inject_at` entrega un byte en un instante: transceptor RS-485 y bus multinodo (§7.3). |
| GPIO | `jwsim::gpio(n)` | Red de cada GPIO del ESP32; el HAL la maneja en modo salida. |

Reglas para modelos (`sim/models/<chip>/`):

1. Se escriben **contra el datasheet**; cada uno lleva `MODEL.md` con la
   tabla comportamiento ↔ sección del datasheet y los puntos a verificar
   (ejemplo: [`sim/models/tca6424a/MODEL.md`](../sim/models/tca6424a/MODEL.md)).
2. No conocen el HAL ni el motor de tareas: solo puertos. Así el mismo
   modelo sirve en modo HAL, QEMU (detrás del puente por socket) y HIL.
3. Son deterministas: sin reloj de pared, sin aleatorios no sembrados.
4. Exponen su estado interno para la tabla de observación (G3).

Dispositivos de escena (SDK, G7), en TypeScript, con un contrato que extiende
el de la propuesta v0.1:

```ts
interface SimDevice {
  id: string; type: string; version: string;
  ports: { name: string; kind: "digital-in" | "digital-out" | "analog" | "power"; }[];
  parameters: Record<string, unknown>;
  init(ctx: DeviceContext): void;
  // Llamado al cambiar una entrada o al vencer el próximo evento propio.
  update(t_ns: bigint, inputs: Record<string, boolean | number>): DeviceStep;
  serialize(): object;
}
interface DeviceStep {
  outputs: Record<string, boolean | number>;
  nextEventNs?: bigint;   // horizonte propio (temporizadores internos, rampas)
}
```

## 5. Mapa de hardware del JWPLC Basic

Extraído del package (alpha.12). "Fuente" indica de dónde sale cada dato.

| Periférico | Conexión | Librería | Fuente | Modelo | Gate |
|---|---|---|---|---|---|
| Expansor E/S TCA6424A | I2C0 (SDA 21, SCL 22, 100 kHz) @0x22 | core `peripheral-tca6424a.c` | `peripheral-tca6424a.h`, `jwplc_i2c_bridge.cpp` | **G0 (este repo)** | G1 TCA6424A_MODEL |
| 8 DI `I0_0..I0_7` | TCA P07..P00 (`I0_k = 0x2207 − k`) | core | `pins_is.h` | placa | G1 |
| 8 DO relé `Q0_0..Q0_7` | TCA P10..P17 (`0x2208 + k`), habilitadas por `EN_IO` | core | `pins_is.h`, `peripherals_init.cpp` | placa | G1 |
| `EN_IO` | GPIO27 | core | `pins_is.h` | placa | G1 |
| RTC DS3232M | I2C0 @0x68 | `JW_RTC` | `JW_RTC.h` | **G4** `sim/models/ds3232m` | G4 RTC_DS3232M |
| FRAM | SPI (VSPI) CS GPIO13, 10 MHz, 8 KiB | `JW_FRAM` | `jwplc_spi_bus.h`, `boards.txt` | **G4** `sim/models/mb85rs64v` | G4 FRAM_PERSIST |
| microSD | SPI CS GPIO32, 20 MHz; detección GPIO39 (activo bajo) | `JW_SD`, `SD`, `FS` | `jwplc_hardware_config.h` | **G4** `sim/models/sdcard` (SDHC 64 MiB; señal `SD_CARD`) | G4 SD_DATALOG |
| TFT ST7789 170×320 BGR | SPI CS GPIO33, DC 25, RST 14, 80 MHz | `JWPLC_TFT` (TFT_eSPI 2.5.43), `JWPLC_Display` | `jwplc_spi_bus.h`, `tft_setup.h` | **G4** `sim/models/st7789` | G4 TFT_HMI |
| Ethernet W5500 | SPI CS GPIO5, 20 MHz; INTn GPIO15 | `JWPLC_Ethernet`, `JWPLC_ModbusTCP` | `jwplc_spi_bus.h`, `jwplc_hardware_config.h` | **G4** `sim/models/w5500` con `--eth` (§7.4) | G4 W5500_MODEL |
| RS-485 (MAX13487E, auto-dirección) | UART2 RX 16, TX 17 | `JWPLC_RS485`, `JWPLC_ModbusRTU` | `jwplc_hardware_config.h` | **G4** UART con tiempo de carácter, bus multinodo (§7.3) | G4 RS485_MULTINODE |
| Botonera matricial 2×3 | filas GPIO12, 2; columnas 35, 34, 36 | `JW_MatrixButtons` | `JWPLC_GlobalPeripherals.cpp` | **G4** matriz por GPIO (`BTN_*`) | G4 TFT_HMI |
| UART0 consola | TX 1, RX 3 | `HardwareSerial` | `pins_arduino.h` | consola | G1 |
| LEDs RUN/ERR/BUS/ETH | **no encontrados en el package alpha.12** | — | — | pendiente | ver §11 H6 |

Supuestos de la placa (no están en el package):

| Supuesto | Estado |
|---|---|
| Entradas no inversoras: 24 V en `I0_k` ⇒ pin del TCA en alto (el core solo invierte el orden de bits) | **Confirmado** por JW Control |
| `EN_IO` habilita los drivers de relé; no es el `RESET` del TCA6424A | **Confirmado** por JW Control |
| Pull-up externo en GPIO39 (detección SD, activo en bajo) y GPIO15 (INTn del W5500) | **Confirmado** por JW Control |
| `RESET` del TCA6424A atado a nivel alto; puerto 2 del expansor sin uso | Supuesto (sin impacto en el firmware actual) |
| Relés sin retardo mecánico (operación típica 5–10 ms) | Simplificación; parámetro de la placa en G1 |

## 6. Modelo de tiempo y scan

### 6.1 Tiempo virtual

- Unidad: nanosegundo (`uint64`). Nunca se consulta el reloj del SO.
- Dos núcleos virtuales con reloj propio `t[c]`; las tareas FreeRTOS son
  **fibras** (ucontext / Windows Fibers) ancladas a un núcleo. Sin afinidad
  ⇒ núcleo 0 (regla fija).
- Tick de 1 ms (`configTICK_RATE_HZ = 1000`); `vTaskDelay(n)` despierta en
  el tick `actual + n`, igual que FreeRTOS.

### 6.2 Puntos de sincronización

Solo se cambia de tarea en: llamadas al HAL que consumen tiempo (`jwsim_cpu`),
esperas de bus (`jwsim_wait`), primitivas FreeRTOS, `taskYIELD`/`yield`,
`delay`. El planificador siempre avanza el núcleo con la **próxima actividad
más temprana** y lo deja correr hasta su **horizonte**: el próximo evento
externo, el despertar de una tarea de mayor prioridad, el siguiente tick si
hay tareas de igual prioridad listas (rotación) o el reloj del otro núcleo
más un cuanto de 10 µs. Desfase máximo entre núcleos: un cuanto + un costo.

### 6.3 Costos

`jwsim_cost_model` asigna tiempo virtual a operaciones del HAL
(`taskYIELD` 2 µs, acceso GPIO 100 ns, `millis` 50 ns, llamada HAL 100 ns,
operación de semáforo 200 ns). Los buses cobran su duración eléctrica real
(I2C: 9 bits/byte + START/STOP a la frecuencia configurada; SPI: 8 bits/byte).
Los valores se calibran en G1 contra mediciones del JWPLC Basic real (el
package ya tiene el profiler H3E.0B en `main.cpp`, reutilizable para esto).

### 6.4 Scan: el mismo del firmware

El simulador **no impone un scan propio**: ejecuta el `main.cpp` del package.
Por eso el scan simulado es el real:

- `loopTask` (prioridad 1, núcleo 1): `loop()` + servicio Modbus TCP +
  `serialEventRun` + `taskYIELD`.
- `jwplcSystemTask` (prioridad 2, núcleo 1): lee el puerto 0 del TCA6424A
  cada 20 ms (`getJWPLCIoScanPeriod_ms`), RTC cada 1 s, Ethernet cada 1 s,
  DataLog y refresco de display; duerme 5 ms entre vueltas.
- `digitalRead(I0_x)` lee el **caché** que actualiza `jwplcSystemTask`;
  `digitalWrite(Q0_x)` escribe al TCA solo si cambia (shadow del driver).

**[G0]** Consecuencias observadas, idénticas a lo que haría el hardware:
pulsos de entrada de 3 ms se pierden; la latencia I0_0→Q0_0 en régimen es
≈7 ms; y con el W5500 ausente el sondeo Ethernet del runtime bloquea el
escaneo hasta ≈67 ms la primera vez (§11 H4).

### 6.5 Pausa, velocidad, paso, grabación

- **Pausa** = no llamar `jwsim_run()`: el tiempo virtual queda congelado
  (temporizadores, `millis()`, RTC simulado). Reanudar no produce saltos.
- **Velocidad**: `--realtime <factor>` sincroniza con el reloj de pared en
  tramos de 1 ms (×1, ×10, ×0.1); sin factor, lo más rápido posible
  (**[G0]** ≈75–95× tiempo real con `02_io_basic` en un host de 4 núcleos).
- **Paso**: `jwsim_run(until = t + Δ)` permite avanzar 1 tick, 1 scan o
  hasta un evento.
- **Grabación/reproducción**: se graban solo las **entradas** con su instante
  virtual (archivo de estímulos `.stim`, mismo formato que acepta el runner);
  reproducir = misma ejecución. La **traza** (hash FNV-1a de cambios de pin,
  transacciones de bus y bytes de UART) prueba la igualdad. **[G3]** La app
  graba la sesión interactiva (entradas, pulsos y forzados) y la reproduce
  comparando el hash (§7.1).

### 6.6 Sincronización con el motor de escena

Sincronización conservadora por horizontes (estilo co-simulación):

1. El motor de escena declara su próximo evento autónomo `h_dev`
   (temporizador de un motor, fin de carrera de una cinta) o ∞.
2. El runner corre hasta `min(h_dev, siguiente_entrada_UI)` o hasta que una
   salida de la placa cambie; en ese caso se detiene **en ese instante** y
   envía el cambio.
3. El motor de escena evalúa dispositivos en ese instante y devuelve nuevas
   entradas y su nuevo horizonte.

Las entradas del usuario (clic en un pulsador) se fechan en el próximo
límite de 1 ms virtual y se graban; así la reproducción es exacta aunque la
interacción original haya sido en tiempo real.

### 6.7 Garantías y excepciones de determinismo

Determinista: mismo binario + mismos estímulos + misma semilla ⇒ misma traza
(**[G0]** verificado en 20 corridas, y entre Linux/gcc y Windows/clang).

No garantizado (documentar al usuario y detectar cuando se pueda):

- Bucles de cómputo puro sin ningún punto de sincronización: no avanzan el
  tiempo (el ESP32 sí, por apropiación de tick). G1: vigilante de tiempo real
  que lo detecta (implementado en G1), y opción de instrumentar el sketch
  (`-fsanitize-coverage=trace-pc-guard`) para contar bloques básicos como
  costo y punto de apropiación.
- Código que depende de direcciones de memoria, memoria no inicializada o
  `std::hash` del host.
- Contextos ISR **[G1]**: una interrupción GPIO se levanta para el núcleo
  donde se instaló (`attachInterrupt`) y se ejecuta en contexto ISR (sin
  tarea; `xPortInIsrContext()` verdadero) en el instante virtual del flanco,
  antes de que la tarea en curso de ese núcleo continúe. Dentro de una
  sección crítica la ISR espera a que se libere. Una llamada FreeRTOS con
  espera dentro de una ISR es un error explícito.
- Vigilante **[G1]**: si una tarea pasa 2 s de reloj real
  (`JWSIM_WATCHDOG_MS`) sin llegar a ningún punto de sincronización, el
  runner termina con código 70 y un mensaje que nombra la tarea.

## 7. Protocolo motor ↔ interfaz

Transporte: stdio del runner (pipes anónimos), tramas
`[u32 longitud][u8 tipo][payload]`; payload JSON (UTF-8) para control y
binario para datos masivos. **[G2]** La longitud es little-endian y cuenta
el byte de tipo más el payload; tipo 1 = JSON. El runner lo activa con
`--port stdio` (`sim/runner/port.cpp`; lado Node en `app/lib/sim-port.mjs`)
y reserva stdout para las tramas: los `printf` del firmware o del HAL van a
stderr. El framebuffer de la TFT (170×320×2 B) va por
memoria compartida con un contador de versión para no copiar por el pipe.

| Dirección | Mensaje | Contenido |
|---|---|---|
| UI→runner | `hello` | versión del protocolo, versión de la UI |
| runner→UI | `hello` | protocolo, package (`ref`, `commit`), placa, lista de señales |
| UI→runner | `run` / `pause` / `step` | `until_ns`, `realtime_factor` |
| UI→runner | `set` | `{signal, value, at_ns?}` (entradas, forzado) |
| UI→runner | `force` / `unforce` | forzado de E/S y variables (G3) |
| UI→runner | `subscribe` | señales, buses, variables y periodo de muestreo |
| runner→UI | `signals` | lote de cambios `{t_ns, signal, value}` |
| runner→UI | `bus` | tramas I2C/SPI/UART decodificadas (analizador, G3) |
| runner→UI | `serial` | bytes de UART por puerto |
| runner→UI | `display` | nueva versión del framebuffer |
| runner→UI | `stopped` | motivo (`time`, `breakpoint`, `idle`, `fatal`), `t_ns`, hash |
| runner→UI | `fatal` | API no soportada, `esp_restart`, assert, crash |
| ambos | `horizon` | sincronización con el motor de escena (§6.6) |

Implementado en G2 **[G2]**: `hello` (placa y nivel de cada señal), `run`
con `speed` (1, 10 o 0 = máxima), `pause`, `set` de entradas `I0_k`,
`subscribe` (`buses`: 1/0), `quit`; del runner, `signals` (último nivel de
cada señal que cambió, cada 20 ms de pared), `serial` (texto UTF-8 sin
cortar caracteres), `bus` (transacciones I2C `[t_ns, bus, dirección,
escritos, leídos, resultado]` y bytes de UART, hasta 400 por envío; el resto
se informa como `dropped`), `status` y `stopped`. La interfaz decodifica
los registros del TCA6424A en la pestaña Buses; el analizador completo
(SPI por CS, Modbus) es G3. Un `set` se agenda como evento en el instante virtual
actual, igual que un `.stim`: una sesión interactiva es reproducible. En
pausa queda pendiente y se aplica al continuar. Si el host no alcanza la
velocidad pedida, el runner se re-sincroniza con el reloj en vez de
acumular atraso.

Reglas: versión de protocolo en `hello` con compatibilidad por versión mayor;
todo mensaje lleva `t_ns` virtual; el runner nunca bloquea esperando a la UI
salvo en `horizon`. La depuración (G3) usa DAP: el main lanza GDB/LLDB
nativo contra el runner y actúa de proxy; pausar en un breakpoint congela el
tiempo virtual porque el planificador también se detiene.

### 7.1 Depuración, forzado, grabación y analizador **[G3]**

**Depurador.** `gdb -i=dap` (DAP nativo de GDB ≥ 14, con Python; el gdb
16.3 de WinLibs y el de las distribuciones lo traen) se **adjunta** por pid
al runner ya lanzado (`app/lib/debug-session.mjs`), así el protocolo por
stdio queda intacto. La app lanza siempre el runner con `JWSIM_DEBUG=1` (en
Linux autoriza el ptrace con `PR_SET_PTRACER`, necesario con Yama) y adjunta
gdb solo cuando hace falta: breakpoints al ejecutar o puestos en caliente,
"Interrumpir" o variables en la tabla de observación. Al adjuntar envía
`{"type":"debug","attached":1}`, que suspende el vigilante de tareas
(`jwsim_watchdog_hold`); el vigilante además ignora los saltos de reloj de
pared de un proceso detenido. Las unidades del sketch se compilan con `-O0`
para que las líneas y variables coincidan con el `.ino` (el resto, `-O1`;
el hash de traza no cambia).

- *Tiempo congelado:* gdb detiene todos los hilos del runner, así que el
  planificador no avanza; al continuar, el runner detecta el atraso (> 250
  ms) y se re-sincroniza con el reloj sin "recuperar" el tiempo perdido.
- *Sin perturbación:* gdb no puede llamar funciones del firmware (`set
  may-call-functions off`): una llamada como `millis()` correría código del
  sketch y le cobraría CPU virtual. Depurar no cambia el hash de traza
  (verificado por el gate).
- *Observación en vivo:* `DebugSession.sample()` pausa el proceso un
  instante, evalúa las expresiones y continúa; el tiempo virtual no avanza
  mientras tanto.

**Forzado.** `force`/`unforce` fijan el nivel de una red (`Net::force`)
sin importar sus manejadores, como el forzado de un PLC; valen para `I0_k`
y `Q0_k`. Se aplican como eventos externos en el instante virtual actual y
quedan en la traza (registro `F`) y en la grabación (`T force NAME=V`,
`T unforce NAME`).

**Grabación.** Cada entrada aplicada vuelve como `{"type":"input","t_ns",
"stim"}`; la app acumula la sesión desde t = 0 y, al guardar, pide
`{"type":"hash"}` (respuesta con `t_ns`, `trace_hash`, `trace_events`) y
escribe el `.stim` con la cabecera `# fin t_ns=… hash=…`. Reproducir lanza
el runner con `--stim` y `run` con `until_ns`; al llegar responde
`{"type":"reached",…}` con el hash, que la app compara con el grabado.

**Analizador de buses.** Con `subscribe buses=1` el runner envía:

| Bus | Ítem |
|---|---|
| I2C | `[t_ns, "I2C0", dirección, escritos_hex, leídos_hex, resultado]` (0 OK, 1 NACK de dirección, 2 NACK de datos) |
| SPI | `[t_ns, "VSPI", chip, mosi_hex, miso_hex, [[índice, dc]...], bytes]`: una transacción por ciclo de CS (`SPIBus::name_chip`: TFT con D/C, SD, FRAM, W5500); hasta 64 bytes de muestra y el total |
| UART | `[t_ns, "UARTn TX", -1, hex, "", 0, bytes]`: fragmentos separados por 500 µs virtuales de silencio (una trama Modbus RTU por fragmento con la UART instantánea de G3) |

`app/lib/bus-decode.cjs` (el mismo en la app y en el gate) decodifica
TCA6424A y DS3232M por registro, FRAM (opcodes y dirección), SD (comandos,
ACMD, CRC7 y R1), W5500 (bloque, registro, lectura/escritura y Modbus TCP
dentro de los buffers de socket), ST7789 (comando y datos por D/C, con
estado entre transacciones) y Modbus RTU (tramas separadas por CRC-16) y
TCP (MBAP), con función, dirección, valores, excepciones y CRC. Observar
los buses no cambia la traza.

### 7.2 Periféricos, estado no volátil y reinicio **[G4]**

**Modelos.** Cada periférico de la placa es un modelo por registros,
escrito contra su hoja de datos y con un `MODEL.md` (una fila por
comportamiento, cada una con su test en `tests/models/`, sin firmware):

| Chip | Bus | Modelo |
|---|---|---|
| TCA6424A @0x22 | I2C0 | [`sim/models/tca6424a`](../sim/models/tca6424a/MODEL.md) (G1) |
| DS3232M @0x68 | I2C0 | [`sim/models/ds3232m`](../sim/models/ds3232m/MODEL.md): hora desde el tiempo virtual, 12/24 h, día de semana independiente, alarmas, temperatura, SRAM; batería: persiste |
| MB85RS64V (CS13) | VSPI | [`sim/models/mb85rs64v`](../sim/models/mb85rs64v/MODEL.md): 8 KiB, WEL, protección por bloques |
| ST7789 (CS33, D/C 25, RST 14) | VSPI | [`sim/models/st7789`](../sim/models/st7789/MODEL.md): GRAM 240×320, MADCTL, ventana; la app recibe las zonas cambiadas (trama binaria tipo 2) |
| microSD (CS32, detección GPIO39) | VSPI | [`sim/models/sdcard`](../sim/models/sdcard/MODEL.md): SDHC en modo SPI, CRC7/CRC16, tiempos de inicialización, lectura y programación; formato FAT32 de fábrica |
| MAX13487E (UART2) | UART | auto-dirección: lo que transmite la UART2 sale al bus RS-485 sin eco (§7.3) |
| W5500 (CS5, INTn GPIO15) | VSPI | [`sim/models/w5500`](../sim/models/w5500/MODEL.md): registros comunes, 8 sockets TCP/UDP con búferes de 16 KiB, comandos, plazos de ARP/TCP por RTR/RCR, interrupciones, PHY con autonegociación; la red queda detrás de un puerto (§7.4). Poblado con `--eth` |

**Directorio de estado.** `--state <dir>` (la app usa uno por proyecto o
por sketch) guarda lo no volátil: `fram.bin`, `fram-sr.bin`, `rtc.bin`,
`nvs.bin` (NVS de ESP-IDF v5 implementada en el HAL: entradas tipadas,
errores `ESP_ERR_NVS_*`, partición de 20 KiB), `sd.bin` (sectores no nulos
de la tarjeta; un `sd.img` crudo tiene prioridad). Escritura atómica, cada
segundo de pared en modo interactivo, al terminar y ante una falla del
firmware (`jwsim_set_fatal_hook`). La app copia el estado al iniciar una
sesión para que la reproducción de su grabación parta del mismo estado.

**Libc del firmware.** El firmware (sketch, core, librerías, FatFs) no usa
la libc del host para archivos ni para la hora: después de compilar cada
unidad del firmware, `objcopy --redefine-syms=sim/hal/fw-libc.syms` cambia
sus referencias a `fopen`, `fread`, `stat`, `opendir`, `unlink`, `time`,
`gettimeofday`… (y a `__imp__time64` del CRT de Windows) por las del
simulador. Como es a nivel de símbolo, los métodos C++ homónimos
(`VFSImpl::rename`) no se tocan. `sim/hal/src/vfs.cpp` resuelve las rutas
bajo un montaje de `esp_vfs_fat_register` ("/sd") contra FatFs, con la
semántica de `vfs_fat.c` (modos, `O_APPEND`, errno, `stat` de la raíz) y un
búfer stdio como el de newlib; cualquier otra ruta da ENOENT: el firmware
nunca toca el disco de la PC. `systime.cpp` da la hora del ESP32: 0 (1970)
al encender, sigue al tiempo virtual, `settimeofday` la fija y un reinicio
no la pierde. El runner fija `TZ=UTC0`, la zona del ESP32 por defecto.

**ABI.** El ESP32 (xtensa) tiene `char` sin signo; el build nativo usa
`-funsigned-char` (H14).

**Temporizadores.** `esp_timer` (tarea "esp_timer", prioridad 22, núcleo 0,
alarma por ISR, despacho ISR o tarea, periódicos sin deriva), timers de
software de FreeRTOS (tarea "Tmr Svc", prioridad 1, cola de 10 comandos,
vencimiento contado desde el tick de la llamada) y GPTimer de ESP-IDF, sobre
el que `esp32-hal-timer.c` del core (`timerBegin`, `timerAlarm`…) se compila
sin cambios: 4 timers a 80 MHz / divisor con cuenta exacta.

**Reinicio (`esp_restart`).** No se puede reiniciar el firmware dentro del
mismo proceso (sus variables globales y constructores ya corrieron). El
motor detiene la ejecución en el instante del pedido (desde una tarea o
una ISR) y el runner arranca un proceso nuevo:

1. guarda FRAM, NVS, RTC y SD (en un directorio temporal si no hay
   `--state`) y escribe `reinicio.bin`: instante del nuevo arranque (el tick
   siguiente), traza acumulada, hora del sistema, eventos del `.stim` ya
   aplicados y el estado "tibio" de lo que no es el ESP32 (registros del
   TCA6424A, GRAM y registros del ST7789, entradas y forzados);
2. en modo CLI se re-ejecuta con `--resume` (`execv` en Linux; en Windows
   lanza el proceso nuevo y devuelve su código); con `--port` informa
   `{"type":"restart"}` y sale con 75: `RunnerProcess` de la app lanza el
   nuevo, encola los comandos del intervalo, repone `run`/`subscribe` y
   vuelve a adjuntar gdb al pid nuevo;
3. el proceso nuevo arranca el firmware en ese instante con la traza
   encadenada: `millis()`, `micros()`, los ticks y `esp_timer` cuentan desde
   el nuevo arranque, `esp_reset_reason()` es `ESP_RST_SW` y las corridas
   repetidas dan el mismo hash final (también entre Linux y Windows).

EN_IO (GPIO27) no tiene pull en la placa: durante el reinicio los relés
caen, igual que en un arranque en frío; los registros del TCA6424A sí se
conservan.

**Protocolo agregado en G4.** UI→runner: `{"type":"uart","port":0,"hex":"…"}`
(texto hacia la UART desde la consola de la app; queda en la grabación como
una entrada), `rs485` y `uart_rx` (§7.3). Runner→UI: `{"type":"restart",
"boot_ns","resume","state"}` (reinicio por `esp_restart`), `uart_tx` (§7.3)
y `display` como trama binaria tipo 2 con las zonas cambiadas de la GRAM
del ST7789.

### 7.3 Bus RS-485 entre PLC simulados **[G4]**

En UART1 y UART2 cada carácter ocupa 1 + datos + paridad + parada bits a la
velocidad configurada: la escritura pasa por la FIFO de 128 bytes y el
búfer del driver, `flush()` espera el bit de parada del último y cada byte
recibido queda disponible al terminar su carácter (UART0, la consola, sigue
sin tiempo de carácter para no cambiar los tiempos de todos los sketches).

Cada PLC es un runner con su propio tiempo virtual. `app/lib/rs485-bus.mjs`
los avanza juntos en ventanas de Q ns (sincronización conservadora):
`{"type":"rs485","port":2,"on":1}` hace que el runner informe cada carácter
de UART2 con su [inicio, fin] al escribirlo (`uart_tx`; una trama larga
puede terminar varias ventanas más adelante). Cada carácter queda "en el
aire" hasta su fin y choca con cualquier otro de otro emisor que se solape
(llegan corruptos, AND de ambos, a todos). A cada nodo, salvo al emisor
(el MAX13487E no tiene eco), se le entrega con `uart_rx` en el instante
fin + Q, justo antes de correr la ventana que contiene ese instante: para
entonces ya se informó todo lo que podía chocar con él. El resultado es
determinista y conserva la separación entre caracteres; la única
diferencia con el bus real es una latencia fija Q (1 ms por defecto).

Un extremo del host conecta una herramienta externa como JW Modbus Tool:
un socket TCP con RTU crudo ("RTU over TCP") o un puerto serie (p. ej. un
par COM virtual como com0com). Lo que llega del host sale al bus a su
velocidad desde el comienzo de la ventana siguiente; con él el bus avanza
a la par del reloj de pared. CLI: `node cli/jwsim-bus.mjs <sketch>...
[--tcp puerto | --com ruta]`.

### 7.4 Ethernet: el W5500 y la red del host **[G4]**

El modelo del W5500 no abre sockets: lo que el chip envía (LISTEN,
CONNECT, SEND, SENDTO, DISCON/CLOSE) sale por `W5500::Network` y lo que
llega de la red entra con `net_*` en un instante virtual. La placa lo
puebla con `--eth` (en la app, `simulation.peripherals.ethernet.present`
del proyecto); sin él CS5 no responde y el runtime informa "No Ethernet
hardware", como alpha.12 lo esperaba. La señal `ETH_CABLE` (1 =
conectado) desconecta el cable.

- **CLI** (`--eth` sin `--port`): nadie responde en la red (el ARP vence,
  el DHCP no contesta) salvo lo que traiga el `.stim`.
- **Protocolo**: `{"type":"net","on":1}` hace que el runner informe
  `{"type":"net","op":…}`; `{"type":"net_in",…}` entra como una entrada
  más, en el instante virtual actual, y queda en la grabación como
  `T net <socket> connected|data|peer_closed|reset|timeout|udp …`. La
  sesión se reproduce por la CLI sin red con el mismo hash.
- **Puente** (`app/lib/net-bridge.mjs`, en la app y en
  `node cli/jwsim-net.mjs <sketch>`): una red virtual 192.168.250.0/24
  cuya puerta de enlace .1 es el PC. Responde DHCP (entrega .10) y DNS
  (con el DNS del host); TCP/UDP a .1 va a 127.0.0.1 y a otra IP sale por
  la red del host (`hosts` reasigna IPs, p. ej. el servidor del ejemplo
  02.ModbusTCP_Client). Un puerto en LISTEN del PLC se publica en el host
  (P + 1000 si P < 1024: Modbus TCP 502 → 1502; en 127.0.0.1 o, si se
  pide, en la LAN), y varios PLC usan desplazamientos distintos.

Con red real el tiempo virtual va a la par del reloj de pared (velocidad
×1): los paquetes del host entran en el instante virtual en que llegan.

## 8. Formato de proyecto `.jwsim` v1

JSON versionado. Un `.jwsim` **vincula** artefactos que siguen abriéndose y
editándose con su herramienta; el simulador los observa y recarga al
detectar cambios (G2 EXTERNAL_EDIT_RELOAD).

```json
{
  "$schema": "https://jw-control.github.io/jwplc-sim/schema/jwsim-1.json",
  "format": "jwsim",
  "version": 1,
  "name": "Arranque estrella-triángulo",
  "board": { "id": "jwplcbasic", "package": { "minRef": "v2.1.0-alpha.12" } },
  "program": {
    "kind": "arduino",
    "sketch": "./sketch/estrella_triangulo/estrella_triangulo.ino"
  },
  "links": {
    "openplc": "./ladder/estrella_triangulo/plc.xml",
    "hmi": "./hmi/panel.hmi"
  },
  "simulation": {
    "seed": 1,
    "realtimeFactor": 1.0,
    "costModel": "jwplcbasic-default",
    "peripherals": {
      "sd": { "present": false },
      "rtc": { "present": true, "start": "2026-01-01T08:00:00", "follow": "virtual" },
      "fram": { "present": true, "image": "./state/fram.bin" },
      "ethernet": { "present": false, "mac": "24:0A:C4:4A:57:01" }
    }
  },
  "scene": {
    "devices": [
      { "id": "S1", "type": "jwsim/pushbutton-no", "version": "1.0.0", "params": { "label": "Marcha" } },
      { "id": "KM1", "type": "jwsim/contactor", "version": "1.0.0", "params": { "coil": "24VDC" } }
    ],
    "wiring": [
      { "from": "S1.out", "to": "plc.I0_0" },
      { "from": "plc.Q0_0", "to": "KM1.coil" }
    ]
  },
  "exercise": { "file": "./exercise/rubrica.json" },
  "stimuli": ["./tests/marcha_parada.stim"]
}
```

Esquema **[G2]**: [`schema/jwsim-1.json`](../schema/jwsim-1.json) (JSON
Schema 2020-12, MIT). `cli/lib/project.mjs` valida al abrir y al guardar
(subconjunto del estándar sin dependencias; contrastado con Ajv), migra
versiones anteriores y conserva los campos desconocidos. `scene.inputMode`
(`toggle`/`push`) y `scene.inputs` (`{"I0_1": 1}`) guardan la escena mínima
de G2: modo de las entradas y su nivel inicial. La versión 0 es el borrador
previo a v1 (`{"jwsim": 0, "sketch", "openplc", "hmi", "realtime", "seed"}`)
y sirve para probar la ruta de migración.

Reglas: rutas relativas al `.jwsim`; campos desconocidos se conservan; una
versión mayor nueva implica migración explícita; `program.kind` admite
`arduino` (G1) y `openplc` (G6, que genera el C con matiec y lo compila con
el HAL `jwplcbasic.cpp` del ecosistema OpenPLC contra el mismo backend).

## 9. Sincronización con el package

- **Un solo lugar**: [`package.lock`](../package.lock)
  (`JWPLC_PACKAGE_REF`, `JWPLC_PACKAGE_COMMIT`, repo y árbol).
- **Cero copias**: `scripts/fetch-package.mjs` hace un clon superficial +
  sparse checkout del tag en `.jwsim/package/<REF>/` (ignorado por git) y
  verifica que el tag apunte al commit fijado. `JWPLC_PACKAGE_DIR` permite un
  checkout local solo si su árbol coincide con el tag.
- **Paridad estructural**: el build falla si `cores/jwcontrol` trae una
  fuente sin clasificar en `sim/core-manifest.json`.
- **Procedimiento por alpha** (13, 14, 15…):
  1. Subir `JWPLC_PACKAGE_REF` y `JWPLC_PACKAGE_COMMIT`.
  2. `node scripts/fetch-package.mjs` y compilar los ejemplos (G5
     EXAMPLES_MATRIX).
  3. Resolver headers/APIs nuevos **en `sim/hal`**, nunca en el package. Si
     algo impide simular, documentarlo como punto de extensión para una
     alpha futura (§11).
  4. Correr todos los gates ⇒ `JWSIM_PACKAGE_SYNC_ALPHAxx=PASS`.
- **W5500**: alpha.13 (publicado el 2026-10-22) cambia el acceso al
  W5500 (dueño del bus por tarea, sockets con "lease"), el inicio sin la
  espera de 560 ms y Modbus TCP; alpha.14 usará INTn y reutilización de
  FIFO. El modelo (§7.4) es del chip, no de una alpha: los gates
  W5500_MODEL y MODBUS_TCP_HOST pasan con alpha.12 y con alpha.13. La
  placa lo trae poblado solo con `--eth` mientras el package fijado sea
  alpha.12.

## 10. Límites de fidelidad

| Área | Fiel | No fiel / pendiente |
|---|---|---|
| Lógica del sketch y librerías | Mismo código fuente y mismo compilador (GCC) que el firmware; `int` y `long` de 32 bits en Windows y `linux-x86` (§3.4) | Punteros de 64 bits (`sizeof` de estructuras con punteros); `long` de 64 bits en Linux/macOS x86_64; UB del sketch puede comportarse distinto |
| Tiempo | Ticks, delays, periodos del runtime, duración de buses | Tiempo de cómputo puro (modelo de costos calibrable, no ciclo-exacto) |
| Doble núcleo | Afinidad, prioridades, apropiación en puntos de sincronización | Carreras finas entre núcleos sin puntos de sincronización |
| Interrupciones | GPIO por flanco/nivel en contexto ISR del núcleo dueño | Latencia de entrada a la ISR (0 en el modelo), anidamiento por niveles de prioridad |
| Memoria | — | Tamaño de pila/heap del ESP32, desbordes (pilas del host ≥ 256 KiB) |
| E/S digitales | Registro a registro en el TCA6424A | Tiempos eléctricos, rebotes (los agrega el dispositivo de escena) |
| TFT | (G4) comandos ST7789 y framebuffer | Tiempo de pintado: TFT_eSPI usa el procesador Generic, más lento que la ruta por registros del firmware real |
| SD | (G4) SDHC en modo SPI (comandos, CRC, R1/R7/OCR/CSD/CID), FatFs y VFS reales, detección de tarjeta | Tiempos internos fijos (inicialización 100 ms, lectura 100 µs, programación 500 µs); sin desgaste ni errores del medio; sin modo SD de 4 bits |
| NVS | (G4) formato lógico de ESP-IDF v5: entradas tipadas, espacios de nombres, errores `ESP_ERR_NVS_*` | No reproduce la disposición física de páginas de la flash ni su desgaste |
| Timers | (G4) `esp_timer`, timers de FreeRTOS y GPTimer con la cuenta exacta del divisor | Latencia de la ISR del timer (0) |
| UART / RS-485 | (G4) tiempo de carácter en UART1/2, FIFO de 128 bytes, `flush`, desborde de RX; choques entre nodos | UART0 (consola) sin tiempo de carácter; latencia fija Q entre nodos (§7.3); sin niveles eléctricos, terminación ni polarización del bus |
| W5500 | (G4) registros, 8 sockets TCP/UDP → sockets del host, plazos de ARP/TCP, INTn, PHY | MACRAW, PPPoE, multicast, ICMP; red sin pérdidas (sin retransmisiones); autonegociación de duración fija (1,5 s) |
| Registros del ESP32 | Solo los campos GP-SPI que usa el package | Cualquier otro acceso por dirección física falla (no hay MMU que lo atrape) |
| PWM (LEDC, `analogWrite`, `tone`) | Frecuencia, resolución, ciclo e inversión por pin; fin de rampa con interrupción | No se generan flancos a la frecuencia del PWM: la red digital indica "activa si ciclo > 0" y los dispositivos de escena leen el valor PWM. Las rampas aplican el ciclo final al inicio |
| Wi-Fi / BLE / ADC / LittleFS | — | No soportados (mensaje explícito al compilar o al usar la API) |

Por eso el simulador **antecede** a los gates físicos de las alphas
(`SIM_REGRESSION`), no los reemplaza.

## 11. Hallazgos para el package (G0–G4)

Puntos de extensión o defectos detectados al compilar y ejecutar el package
sin cambios. Se proponen para alphas futuras; el simulador no los parcha.

| # | Hallazgo | Impacto | Propuesta |
|---|---|---|---|
| H1 | **Uso-después-de-liberar latente** en la ruta de fallo de `SD.begin()` (librería SD heredada de arduino-esp32): `sdcard_mount` falla → `esp_vfs_fat_unregister_path()` libera el `FATFS` → `sdcard_unmount()` llama `f_mount(NULL, …)` y FatFs escribe `fs_type = 0` en memoria liberada. Detectado con AddressSanitizer. | En el ESP32 el byte cae dentro del bloque liberado (benigno hoy, frágil ante cambios de heap). En cada arranque sin tarjeta. | Llamar `f_mount(NULL, drv, 0)` **antes** de `esp_vfs_fat_unregister_path()` en `sdcard_mount` (y reportarlo a arduino-esp32). El simulador retiene el contexto para no corromper el heap del host. |
| H2 | La librería `SPI` del package accede a registros GP-SPI vía el primer miembro opaco de `spi_t` (`jwplcSpiReadBytesReuseFifoNL`). | Obliga a modelar esos registros; cualquier cambio de layout en el core rompe en silencio. | Exponer una función del HAL (`spiReadBytesReuseFifo`) en el core en vez de reinterpretar `spi_t`. El simulador la cubre con el proxy `spi_dev_t`. |
| H3 | `libJWPLC_TFT.a` contiene TFT_eSPI 2.5.43 precompilado y el package no trae su fuente (solo la licencia). | Para compilar desde fuente el simulador descarga TFT_eSPI 2.5.43 de upstream; si el `.a` usa una versión parcheada, habría divergencia. | Publicar en el repo la fuente exacta (o el parche) con que se genera `libJWPLC_TFT.a`. |
| H4 | `jwplcSystemTask` ejecuta en la misma vuelta el escaneo de E/S y servicios que pueden bloquear: reintento de montaje SD (esperas de 3×100 ms en `sdCommand`) y sondeo del W5500 (`delay(1)` en `W5100Class::softReset`). | Ante una falla (tarjeta detectada que no responde, W5500 que no responde) el escaneo de entradas se retrasa de 20 ms a 60–300 ms. Observado en G0 con la detección SD sin modelar y con el W5500 no poblado. | Separar el escaneo de E/S de los servicios bloqueantes (tarea propia o máquinas de estado no bloqueantes). |
| H5 | El autoload de `Arduino.h` enlaza 16 librerías en cualquier sketch. | Más superficie a simular y a compilar en frío. | Ninguna acción necesaria; documentado para G1/G5. |
| H6 | No se encontraron en alpha.12 definiciones de los LEDs RUN/ERR/BUS/ETH. | No se pueden modelar todavía. | Indicar pines/expansor o confirmar que son controlados por hardware. |
| H7 | El sdkconfig de `esp32-libs 3.3.8` no está en el package. | Valores como `CONFIG_FATFS_*` o `CONFIG_ARDUINO_RUNNING_CORE` se fijaron por defecto. | Verificar contra el `sdkconfig` del tool y fijarlos en `sim/hal/include/sdkconfig.h`. |
| H8 | Cuatro ejemplos de `JW_MatrixButtons` (`01_BasicPress`, `02_AxisWrapSerial`, `03_EventQueue`, `05_DirectButtons_IO35_IO34_IO39`) definen su propio `enum { BTN_LEFT, … }`, que choca con `JWPLCButtonId` de `JWPLC_GlobalPeripherals.h` (incluido por el autoload de `Arduino.h`). | No compilan con la placa `jwplcbasic`, tampoco en el Arduino IDE. | Renombrar los enumeradores de los ejemplos o poner `JWPLCButtonId` en un namespace / `enum class`. |
| H9 | Sketches de `tools/build-speed-benchmark` que usan librerías retiradas antes de alpha.12 (`08_ethernet_bridge_link`, `09_gfx_bridge_link`, `10_gfx_physical`, `16_alpha6_ethernet_nonblocking_acceptance`). | No compilan con alpha.12. | Actualizarlos a `JWPLC_TFT`/`JWPLC_Ethernet` o moverlos a un archivo histórico. |
| H10 | `LogicV2EnginePrototype.cpp:7` y `RuntimeUIV2EditSession.cpp:14` inicializan `_links{}`, un arreglo de `LogicV2InputLink`, cuyo constructor por defecto es `constexpr explicit LogicV2InputLink(uint16_t = …)`. La inicialización de copia de lista con un constructor `explicit` está prohibida (CWG 1518); GCC la acepta, clang la rechaza. | Solo compila con GCC. El simulador usa GCC en todos los destinos (§3.1). | Quitar `explicit` del constructor con argumento por defecto o declarar un constructor por defecto no explícito. |
| H11 | El ejemplo `JWPLC_LogicRuntime_V2_Engine_RAM` exige `sizeof(LogicV2EnginePrototype) <= MIN_ENGINE_STORAGE_BYTES + 64`, pero `MIN_ENGINE_STORAGE_BYTES` no cuenta `_timing[100]` ni `_startedAtMs[100]` (500 bytes). En ILP32 (como el ESP32) el motor mide 2852 bytes frente a 2324 + 64. | El ejemplo informa "56 PASS, 1 FAIL" en cualquier destino; previsiblemente también en la placa. | Incluir esos arreglos en `MIN_ENGINE_STORAGE_BYTES` o ajustar el margen. |
| H12 | **Carrera en `JWPLC_Display` al entrar al HMI de usuario** (G4, `03.Display_HMI_Pages`). `enterUserUI()` corre en `loopTask` y dibuja dentro de un lote de la TFT (`JWPLC_TFT.beginBatch()`); `jwplcSystemTask` (mayor prioridad, mismo núcleo) puede refrescar la pantalla a la vez. `_batchActive` es un indicador compartido: el `beginBatch()` del sistema devuelve verdadero dentro del lote de `loopTask` y su `endBatch()` libera los mutex que tomó `loopTask`. | En el simulador, con `CONFIG_FREERTOS_CHECK_MUTEX_GIVEN_BY_OWNER` de ESP-IDF, el firmware termina por assert ("mutex liberado por quien no es su dueño"); en la placa puede corromper el dibujo o dejar el bus SPI tomado. Se reproduce solo si OK llega en la ventana del primer refresco del sistema (~1000–1040 ms tras el arranque; 2 de 68 instantes probados). | Que el lote sea por tarea (dueño del lote) o que el refresco del sistema no entre mientras `loopTask` tiene un lote abierto. **Corregido en alpha.13** (`_batchOwner`). |
| H13 | `JWPLC_LogicRuntime_Storage_API_Superblock_Redundancy` espera `prepareBoot() == Unformatted` con las dos copias del superblock con CRC corrupto, pero `JWPLCLogicStorage::prepareBoot()` devuelve `CorruptMetadata` (el inspector ve la firma JWPLC en las copias), que es justamente lo que valida `Storage_Metadata_Diagnostic`. | El ejemplo informa "50 PASS, 1 FAIL" en cualquier destino (lógica pura, sin hardware). | Actualizar la expectativa del ejemplo a `CorruptMetadata`. |
| H14 | `sd_diskio.cpp` (librería SD) guarda respuestas en `char` y compara `resp > 0x00`: depende de que `char` no tenga signo, como en xtensa (y ARM). | Sin `-funsigned-char`, en x86 0xFF es -1 y la SD nunca se selecciona. El simulador compila con `-funsigned-char` (§7.2); en la placa no hay problema. | Usar `uint8_t` en `sd_diskio.cpp` (código heredado de arduino-esp32; también vale reportarlo allí). |
