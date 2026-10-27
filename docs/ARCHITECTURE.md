# JWPLC Sim — Arquitectura (G0)

```text
Estado: G0 — arquitectura cerrada para iniciar G1
Package de referencia: platform-jwplc v2.1.0-alpha.13 (11237c2c8a56), árbol JWPLC/2.1.0
(hasta G4 inclusive se validó con alpha.12; sincronización en §9)
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
- **[G5]** El sketch se compila en C++20 (`-std=gnu++20`); el core y las
  librerías, en C++23 (`gnu++2b`, como `cpp_flags` del SDK). Con libstdc++ 14
  (WinLibs GCC 14.3), en C++23 `<memory>` arrastra `<ostream>` y `<format>`,
  y cada unidad instancia toda la maquinaria de `std::format` desde las
  funciones inline de `<ostream>`: 43 MB de instanciación contra 11 MB, y el
  `.ino` pasaba de ~0,4 s a 1,6 s en Windows (alpha.13 dejó la recarga de G2
  en 2,3 s). Si el sketch no compila en C++20 se repite en C++23 (los errores
  que se informan son los de esa compilación) y, si así compila, el build lo
  recuerda (`sketch-std.txt`): un sketch que use C++23 compila igual que en
  la placa (`tests/sketches/g2_cpp23`).

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

### 4.1 Escena, dispositivos y netlist **[G7]**

La escena es lo que está **fuera** de la placa: fuentes, pulsadores,
sensores, relés, contactores, actuadores y el cableado borne a borne. Corre
en Node (`scene/`, sin dependencias), en tiempo virtual, sincronizada con el
runner por horizontes (§6.6). El SDK para escribir dispositivos está en
[docs/SDK.md](SDK.md).

```text
scene/netlist.mjs        netlist por conectividad (solve, analyze)
scene/scene.mjs          motor: dispositivos, cableado, punto fijo, eventos, enlaces
scene/device-kit.mjs     Delay (retardos) y Ramp (rampas como segmentos)
scene/devices/*.mjs      biblioteca v0.1 y la placa jwsim/jwplc-basic
sdk/jwsim-device.d.ts    contrato TypeScript (DeviceDefinition)
cli/lib/cosim.mjs        co-simulación headless (jwsim-cli test con "scene")
app/lib/scene-session.mjs  co-simulación interactiva (app)
```

**Contrato** (ver [`sdk/jwsim-device.d.ts`](../sdk/jwsim-device.d.ts)). Cada
dispositivo declara bornes, parámetros, acciones del usuario y sus
elementos eléctricos: fuentes, cargas y contactos. En cada instante en que
algo cambia, `update(t, inputs)` recibe el estado de sus cargas, sus
enlaces mecánicos, sus acciones y las señales de la placa. Devuelve los
contactos cerrados, sus salidas y su próximo evento propio
(`nextEventNs`). Respecto de la propuesta v0.1, los puertos lógicos
(`digital-in/out`) pasan a ser bornes eléctricos. Así se cablea como en un
tablero (`KM1.13 → plc.I0_2`) y la netlist decide qué está energizado.

**Netlist** (`scene/netlist.mjs`). No resuelve tensiones ni corrientes:
trabaja por conectividad.

- Los cables y los contactos cerrados unen bornes en grupos
  equipotenciales (union-find).
- Cada fuente marca su positivo (`L+`, `L`) y su retorno (`M`, `N`).
- Una carga se energiza con un extremo en el positivo y el otro en el
  retorno de una misma fuente. Se verifica la tensión nominal: con más
  tensión se quema, con menos (o con otra clase de corriente) no se
  energiza. En las cargas polarizadas también se verifica la polaridad.

Fallas: cortocircuito (positivo y retorno en el mismo grupo) y cruce de
alimentaciones (el positivo de una fuente unido a otra). En ambos casos la
fuente dispara y queda sin tensión hasta rearmar. También la sobretensión,
que quema la carga.

El análisis estático une todos los contactos posibles y avisa de cada
bobina o carga que no puede energizarse con ninguna combinación ("bobina
sin alimentación"). Las entradas sin usar de la placa no avisan: el común
M1 compartido no cuenta como cableado propio.

Trifásico: la red de 220 V entre fases (`power-3ph`) marca cada fase (L1,
L2, L3) en su grupo. Dos fases distintas en un grupo son un cortocircuito
entre fases; una fase unida a otra fuente, un cruce; en ambos casos la red
dispara. Una carga de dos bornes entre dos fases recibe la tensión entre
fases (bobina de 230 VAC entre L1 y L2, como en los tableros peruanos). Las
cargas trifásicas (`phaseLoads`) reciben, por borne, la fase que llega y el
nodo: con eso el motor deduce la conexión (triángulo si cada bobinado está
entre dos fases; estrella si U2, V2 y W2 están puenteados y sin fase), el
sentido por la secuencia en U1-V1-W1 y la falta de fase. Una fuente puede
ser **controlada** por su dispositivo (`controlled`, la salida de un
variador): solo existe en el netlist mientras el dispositivo la enciende
(`DeviceStep.sources`), con su frecuencia (valor, pendiente y objetivo de
la rampa) y la secuencia invertida para el giro atrás. El motor alimentado
por ella sigue esa frecuencia (60 Hz = velocidad nominal).

Simplificaciones: dos cargas en serie no se energizan, porque el nodo
intermedio no tiene polo. No hay caídas de tensión, corrientes ni
potencias. Dos fuentes de CC con el 0 V común son válidas.

**Motor de escena** (`scene/scene.mjs`). Evalúa en el instante `t` hasta
un punto fijo: resuelve la netlist, actualiza cada dispositivo (en el orden
de la escena) y repite mientras algo cambie. Un relé que se corta a sí
mismo con retardo 0 no converge en 50 vueltas y se informa como oscilación;
con retardos reales vibra.

Las magnitudes continuas (carrera de un cilindro, velocidad de un motor)
se publican como segmentos lineales `{value, rate}`. Un enlace mecánico
(un fin de carrera en `Y1.position` entre 1 y 1) conmuta en el instante
exacto en que el valor entra en su rango: la escena calcula el cruce y lo
declara como evento.

**La placa en la escena** (`jwsim/jwplc-basic`) usa el pinout del SVG
(JW Control, 2026-10-23):

- `24VDC`/`M0`: alimentación.
- `I0_x`: entradas sink. Se activan con I0_x en el +24 V y M1 en el 0 V.
- `Q0_x.1`/`Q0_x.2`: contacto seco de cada relé de salida, con atraque de
  10 ms y caída de 5 ms. Sin 24 V en 24VDC/M0, los relés no cierran.

La escena solo maneja las entradas que tienen cable; el resto queda para los
botones de la interfaz.

**Vista en la app** (`app/renderer/scene.js`):

- **Placa:** `assets/jwplc-basic.svg`, generado por
  `docs/simbolos/herramientas/gen_jwplc_basic.py` desde el dibujo de bornes
  de la web de JW Control (`docs/simbolos/fuentes/`), con rótulos de
  serigrafía (nombre en gris sobre la caja y franja del color de la función
  en la bornera; el detalle de cada borne en su `<title>`). Los tornillos
  caen cada `data-grid` unidades (57): en la escena se dibuja a escala
  20/57, así cada borne cae en la grilla de 20 px. El SVG declara también
  por dónde entra el cable a cada borne (`data-entrada`), los LED de estado
  (`.led-ancla`), la pantalla (`#tft`) y las teclas (`.tecla`). La vista
  Placa usa el mismo dibujo: la pantalla, las teclas, las entradas (clic) y
  los LED de las salidas van encima, en esas posiciones (`app.js`,
  `placeBoard`). Los bornes de los dispositivos y sus posiciones también van
  sobre la grilla.
- **Símbolos** (`app/renderer/scene-symbols.js`): módulos con aspecto de
  equipo de tablero, con tornillos Phillips rotulados (número y función:
  1/L1, 13 NO, COM) y la cara frontal del equipo con su estado. El cable
  entra por el borde del módulo, a la altura del borne; el tornillo queda
  adentro.
- **Cables:** recorrido ortogonal con A* sobre la grilla. Esquivan las
  cajas de los dispositivos (atravesarlas solo si no hay otro camino),
  penalizan las curvas y no comparten tramos con otros cables salvo con
  los del mismo borne.
- **Puntos de doblez:** con un clic sobre el cable seleccionado se agrega
  uno; se arrastra en la grilla y la ✕ lo quita. Quedan en `points`, y
  «Recorrido automático» los borra.
- **Remate:** en cada borne asoma el casquillo del terminal. Si dos o más
  cables comparten borne (puente), entran juntos en un casquillo doble.
- **Color:** cada cable tiene el suyo (`color`, de la paleta IEC). Al
  crearlo se elige según el polo del borne: +V rojo, −V azul, L marrón,
  N celeste; el mando en negro. Con la simulación en marcha, los cables en
  el positivo de una fuente en servicio brillan.

**Biblioteca** (18 definiciones; símbolos en `docs/SIMBOLOS.md` §6):

| Tipo | Bornes | Comportamiento |
|---|---|---|
| `power-24vdc` 2.0 | +V1 +V2 −V1 −V2 (puenteados), L N PE, DCOK1-DCOK2 | Mean Well MDR-60 (por defecto, con relé DC OK), HDR-60 o NDR-120 (`model`); disparo por cortocircuito o cruce. Fuente ideal: entrega 24 V sin cablear la entrada L/N. Escenas con la 1.x (L+/M) se leen como +V1/−V1 (`migrateScene`) |
| `power-230vac` | L/N | Red con disparo por cortocircuito o cruce |
| `power-3ph` | L1/L2/L3 | Red trifásica de 220 V entre fases con interruptor tripolar; dispara por cortocircuito entre fases o cruce |
| `pushbutton-no`, `pushbutton-nc`, `pushbutton-nono`, `pushbutton-nonc` | 13-14; 11-12; 13-14 + 23-24; 13-14 + 21-22 | Contactos mientras se pulsa |
| `selector-2`, `selector-3` | 13-14/21-22, 13-14/23-24 | Posiciones 0/I e I/0/II |
| `limit-switch` | 13-14, 21-22 | A mano o por enlace mecánico |
| `sensor-inductive`, `sensor-photoelectric` | BN/BU/BK | PNP o NPN, NA o NC, tiempo de respuesta, alimentado y con polaridad |
| `lamp`, `buzzer` | X1-X2, +/- | 24 VDC o 230 VAC, modelo XB2 o AD16 (`model`); el zumbador es polarizado |
| `relay` | A1-A2, 11-12-14, 21-22-24 | Conmutados; atraque 8 ms, caída 4 ms |
| `contactor` | A1-A2, 1-2/3-4/5-6, 13-14 o 21-22 | Auxiliar 13-14 NA (`aux` 10, CJX2-0910) o 21-22 NC (`aux` 01, CJX2-0901); atraque 20 ms, caída 10 ms |
| `solenoid-valve` | A1-A2 | 5/2 monoestable con cilindro: `position` 0→1 en la carrera |
| `solenoid-valve-2` | A+1-A+2, A-1-A-2 | 5/2 biestable (doble solenoide, con memoria) con cilindro: un pulso en A+ deja la corredera en P→A (sale) y uno en A- en P→B (entra); sin bobinas o con las dos, no se mueve. Salidas `coilPlus`, `coilMinus`, `spoolA`, `position`; parámetro `start` (corredera al arrancar) |
| `motor` | U1-U2 | 230 VAC o 24 VDC (sentido por polaridad); rampas de arranque y parada |
| `overload-relay` | 1-2, 3-4, 5-6, 95-96 NC, 97-98 NO | Relé térmico CHINT NR2-25 (ficha CHINT serie NR2): mide la corriente de cada polo (`currentSensors` en 2, 4 y 6) y dispara por sobrecarga con una imagen térmica de clase 10 (θ → (I/ajuste)² con la constante `tauS` = 120 s; dispara en θ = 1,15²: 7,2 × ajuste en ~3 s, 1,5 × en menos de 2 min, 1,05 × no dispara), por falta de fase después de `tripMs` o con TEST; STOP abre 95-96 mientras se pulsa; rearme manual (H) con RESET o automático (A) tras `rearmeMs`, en los dos casos solo frío (θ ≤ 1). Salidas `corriente`, `calor` (% del disparo) y `sobrecarga` |
| `motor-2v` | 1U 1V 1W, 2U 2V 2W, PE | Trifásico de dos velocidades con bobinados independientes (lavado/centrifugado de la JWPLC Laundry): `velocidad` baja o alta, `rpm`, `conflicto` con los dos bobinados energizados (no gira, rotor bloqueado); corriente de cada bobinado (`InLow`, `InHigh`, `carga`) |
| `vfd-el` | R S, U V W, PE; MI1-MI6, DCM, +24V; RA RB RC; SG+ SG-; +10V AVI ACM | Variador Delta VFD-EL (VFD007EL21A, estructura A, entrada 1F 220 V) programable según su manual: parámetros Pr.GG.NN (`scene/devices/vfd-el.mjs`, `VFD_EL_PARAMS`, con los valores de fábrica del manual: 02.00 = AVI, 02.01 = bornes, 02.05 = bloqueo del inicio) que se editan con el teclado (MODE recorre F, H, A, U, Frd/rEu y la selección GG.NN; ENTER guarda con «End» o «Err»; ▲▼ con repetición), el inspector o Modbus (dirección GGNNH); potenciómetro (04.00/04.02); 04.04 2 o 3 cables; MI3-MI6 (04.05-04.08) multivelocidad (15), reset, inhibir rampa, rampa 2, JOG (01.13-01.15), bloque base, UP/DOWN (02.07/02.08), EF, desconexión, bloqueo y fuente de operación; 04.09 NA/NC; límites 01.05/01.07/01.08; relé 03.00; registro de fallas 06.08-06.12; Modbus 2000H-2002H, 2100H-2109H, excepciones CE02/CE03 y pérdida de comunicación CE10 (09.02/09.03). Plantillas de taller (`presets`). Lo que se programa en el equipo vuelve a la escena (`DeviceStep.params`). Corriente de salida (`currentSensors` en U V W): la del motor conectado, en la página A, la salida `corriente` y 2104H (× 10). Entrada analógica AVI con el conmutador Sw2 (parámetro `sw2`): en AVI lee 0-10 V (potenciómetro externo en 10V-AVI-ACM o una señal de tensión) y en ACI 4-20 mA; escalado 04.11-04.18, pérdida de ACI bajo 2 mA según 02.06 (falla AErr, código 32, tras 100 ms); avisos si Sw2 no coincide con la señal o con 02.00. Plantillas «Potenciómetro externo (AVI)» y «Señal 4-20 mA (ACI)» |
| `potentiometer` | 1 2 3 | Potenciómetro de panel de 22 mm, 5 kΩ lineal: sonda `pot` (3, 2 cursor, 1) con la posición de la perilla (acción `pos`, se arrastra; queda en el parámetro `posicion`). Para la referencia de un variador: 3 a 10V, 2 a AVI y 1 a ACM |
| `signal-source` | + - | Calibrador de lazo 4-20 mA / 0-10 V (parámetro `modo`), ajustable de 0 a 100 % (acción `valor`): sonda `4-20mA` o `0-10V` en + y -; salida `texto` («12.00 mA») |
| `motor-1ph` | U1 U2 PE (+ Z1 Z2) | Monofásico WEG 220 V con capacitor de arranque: principal U1-U2 y auxiliar Z1-Z2. Parámetro `bornera`: «2 cables» (auxiliar puenteado de fábrica, adelante) o «4 cables» (Z1 y Z2 al tablero, para invertir el giro). El auxiliar solo actúa bajo el 75 % de la velocidad (interruptor centrífugo): sin él el motor zumba (`bloqueado`); el sentido lo da su polaridad respecto del principal y a velocidad no se invierte. Corriente: principal 6 × In al arrancar o zumbando y auxiliar 2 × In mientras actúa (`In` 5,6 A, `carga`). `jwsim/motor` queda como motor genérico de 230 VAC o 24 VDC (U1-U2) de los ejercicios |
| `motor-3ph` | U1 V1 W1 PE (+ W2 U2 V2) | Trifásico 220Δ/380Y (WEG W22). Parámetro `bornera`: triángulo o estrella con chapas internas (contactos siempre cerrados; solo se cablean U1, V1, W1 y PE) o «6 cables» para un arranque estrella-triángulo con contactores. En el inspector se elige con un dibujo de la placa de bornes; al ocultar bornes se quitan sus cables. Salidas `connection` (en estrella, un tercio del par), `direction` por la secuencia de fases, `faltaFase` (no arranca) y `corriente` de línea (`In` 3,2 A, `carga` %): 6 × In en el arranque directo (en estrella, un tercio), 1,2 × la de régimen acelerando con variador, √3 × con una fase menos girando y la de rotor bloqueado parado; con «6 cables» en triángulo cada borne lleva la de su bobinado (línea / √3) |

### 4.2 Fallas inyectadas **[G9]**

Para enseñar diagnóstico y para probar que un programa reacciona bien, se
inyectan fallas en la escena y en la placa. Son entradas como cualquier
otra: tienen instante, quedan en la traza y una corrida con las mismas
fallas da el mismo hash.

| Falla | Dónde | Efecto | Cómo se inyecta |
|---|---|---|---|
| Sensor o mando pegado (`stuck`) | escena | Se comporta como accionado (`value` true) o en reposo, haga lo que haga el usuario o el enlace mecánico | `Scene.inject`, inspector de la escena, `faults` de una prueba |
| Relé o contactor soldado (`welded`) | escena | Los contactos se pegan en el primer cierre y no abren aunque caiga la bobina; el indicador mecánico (`closed`) los sigue | ídem |
| Carga quemada (`burnt`) | escena | Bobina, lámpara, bobinado o sensor abiertos: no conducen | ídem |
| Cable cortado (`open`) | escena | El cable sale de la netlist de la simulación (no del análisis estático: en el plano sigue estando) | ídem; inspector del cable |
| microSD retirada | placa | `SD_CARD=0`: GPIO39 en alto y la tarjeta no responde; al volver arranca apagada (hace falta CMD0) | clic en el zócalo, `T SD_CARD=0`, `faults: sd-absent` |
| RTC sin batería | placa | Al alimentar, el DS3232M no conservó nada: 2000-01-01, OSF = 1, SRAM en cero (fila 12 del MODEL.md). Un `esp_restart` no corta la alimentación | `--rtc sin-bateria`, menú Fallas de la app, `faults: rtc-battery` |
| Ruido en RS-485 | placa | Cada byte que llega a la UART 2 sale con un bit invertido con probabilidad `rate`; splitmix64 con `seed`: reproducible. `JWSIM_RESULT` informa `rs485_corrupted` | `T noise uart2 <rate> [seed]`, mensaje `noise` del puerto, menú Fallas, `faults: rs485-noise` |

En la app, con la simulación en marcha, el inspector de un equipo o de un
cable muestra los botones de falla que le corresponden; el equipo con una
falla lleva una marca roja, el cable cortado se dibuja punteado con ✂ y el
diagnóstico lista las fallas activas. El menú «Fallas» de la placa tiene el
RTC sin batería (al iniciar) y el ruido en RS-485 (en vivo). Las fallas de
la placa quedan en la grabación (`.stim`); las de la escena, como las
acciones de escena, no se graban todavía.


### 4.3 Ejercicios y calificación **[G9]**

Un ejercicio es un proyecto `.jwsim` con escena, enunciado, plantilla,
solución y una rúbrica (`schema/jwsim-rubric-1.json`). `cli/lib/grade.mjs`
co-simula el sketch con la escena en cada caso de la rúbrica (acciones y
fallas en instantes dados, como una prueba `.jwtest.json`) y evalúa cada
verificación sobre la traza: valores de las señales de la placa y de las
salidas de los equipos en un instante, durante un intervalo o en algún
instante de él, consola y fallas eléctricas. La nota (0 a 20) es
determinista. La app lo usa desde un worker (`app/lib/grade-worker.mjs`).
Detalle y formato en [EJERCICIOS.md](EJERCICIOS.md).

### 4.4 Emulación de planta: transmisores Modbus y procesos **[G9]**

Para probar el firmware de un proyecto contra la planta antes de tenerla, la
escena modela también el proceso y la instrumentación:

- **Esclavos Modbus RTU en el bus RS-485.** Los dispositivos con `modbus()`
  (SDK §2.3.2) responden al PLC, que es maestro por su UART 2. Con la escena
  activa, la co-simulación pide `{"type":"rs485","port":2,"on":1}`: el
  runner informa cada carácter transmitido (`uart_tx`, con su inicio y fin)
  y corta el horizonte en el primero (razón `uart`). `scene/modbus.mjs`
  arma la trama tras 3,5 caracteres de silencio, la escena la despacha
  (CRC, dirección, velocidad, cableado A/B, alimentación) y la respuesta
  vuelve como `uart_rx` con el instante de llegada de cada carácter. Las
  fallas de §4.2 valen: transmisor quemado o cable del bus cortado (no
  responde), sonda abierta o en corto (7FFFh / 8000h).
- **Transmisores** (2.0): `pt100-rs485` (PT100 de 3 hilos; registro 0 =
  °C × 10) y `ph-rs485` (electrodo y ATC; 0 = pH × 100, 1 = °C × 10),
  9600 8N1 por defecto. Con sonda `cableada` miden la sonda de un bloque
  cableada a sus bornes (SDK §2.3.3): un hilo cortado o cruzado es sonda
  abierta. Con sonda `simulada` el valor se ajusta a mano.
- **Bloques de planta:** `fermentador` (2.0) trae de fábrica la electroválvula
  Y1, las bombas M1 (retorno) y M2 (mosto), el flujostato FS1, la PT100 de la
  masa y el electrodo de pH con la temperatura del mosto, con su lógica
  interna (terma solar, llenado y vaciado del serpentín, bomba en seco,
  temperaturas, curva de pH) y sin cablear: en la escena se cablea solo el
  tablero a sus bornes. Fallas propias como acciones: válvula trabada, bomba
  que no bombea, cielo nublado. Las magnitudes continuas se publican como
  segmentos para no llenar el registro de eventos. `water-valve` sigue como
  electroválvula suelta.

Límite: la respuesta de los esclavos no queda en la grabación `.stim`; una
sesión con transmisores se reproduce con la escena, no sin ella.

Pruebas: `scene/tests/modbus.test.mjs` (tramas, excepciones, cableado,
fallas, modelo del fermentador) y `tests/plant/` con firmware real
(sensores por Modbus y lazo cerrado del fermentador). Proyecto para la app:
`tests/plant/fermentador.jwsim`.



Extraído del package (alpha.12, revisado con alpha.13). "Fuente" indica de dónde sale cada dato.

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
| Indicadores PWR/RUN/ERR/BUS/ETH | dibujados en la pantalla de reposo por el runtime (no son LEDs) | `JWPLC_Display` | render de la placa y TFT simulada | TFT | G4 TFT_HMI |

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

`jwsim_cost_model` asigna tiempo virtual a operaciones del HAL:
`taskYIELD` (y cada vuelta de `loopTask`) 5,06 µs, `millis` 1 µs,
operación de semáforo 2,7 µs, llamada de `HardwareSerial`
(available/read/write: mutex de la UART + driver) 8,8 µs, acceso GPIO
100 ns y llamada genérica al HAL 100 ns. Los buses cobran su duración
eléctrica real (I2C: 9 bits/byte + START/STOP a la frecuencia configurada;
SPI: 8 bits/byte).

Calibración (26/10/2026): `tests/sketches/calibracion_loop` cuenta las
vueltas de `loop()` por segundo con `loop()` vacío, con 5 `digitalWrite` a
Q0 y con `JWPLC_ModbusRTU.task()`. En un JWPLC Basic real dio 153,6 k,
18,2 k y 15,56 k (`tests/hardware/calibracion_loop.placa.json`); con los
costos de arriba el simulador queda a menos de 3 % en los tres casos
(criterio del gate G1_PACKAGE_EXAMPLES_IO). Antes, con costos estimados, el
simulador daba 455 k, 177 k y 176 k vueltas: ejecutaba hasta 11 veces más
vueltas de las reales y un `loop()` libre corría solo a ×15–×20. GPIO y la
llamada genérica al HAL siguen sin medición. `JWSIM_COSTS="sem_op=2700,…"`
reemplaza costos al correr, para calibrar sin recompilar.

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

### 6.6 Sincronización con el motor de escena **[G7]**

Sincronización conservadora por horizontes (estilo co-simulación):

1. El motor de escena declara su próximo evento autónomo `h_dev`
   (temporizador de un motor, fin de carrera de una cinta) o ∞.
2. El runner corre hasta `min(h_dev, siguiente_entrada_UI)` o hasta que una
   salida de la placa cambie; en ese caso se detiene **en ese instante** y
   envía el cambio.
3. El motor de escena evalúa dispositivos en ese instante y devuelve nuevas
   entradas y su nuevo horizonte.

Implementación:

- **Runner** (`sim/runner/port.cpp`). Con `{"type":"scene","watch":"Q0_0,…"}`,
  el runner solo avanza hasta el `horizon` que le da la escena. Un oyente
  en cada señal vigilada anota el cambio y pide `jwsim_request_stop()`: la
  tarea que escribió la salida se detiene en su próximo punto de
  sincronización. El runner responde `{"type":"horizon","t_ns","reason":"output",
  "changes"}` con el instante del cambio y espera. La escena responde con
  `set` y `at_ns` = ese instante.
- **CLI** (`cli/lib/cosim.mjs`). Las acciones programadas de una prueba
  también son horizontes, y la consola se fecha con precisión de 5 ms.
  Nada depende del reloj de pared: el hash de traza es el mismo con
  cualquier tamaño de horizonte (verificado en G7).
- **App** (`app/lib/scene-session.mjs`). Horizonte máximo de 10 ms
  virtuales a ×1, proporcional a la velocidad por encima (100 ms a ×10) y
  de 1 s a la máxima: cada horizonte es una ida y vuelta por la IPC de la
  app (milisegundos de pared), así que horizontes fijos de 10 ms topaban
  ×10 y la máxima en ×2–3. Un clic en un pulsador manda `yield`, que corta
  el horizonte en curso, y se aplica en ese horizonte, fechado en ese
  instante. A ×1 el runner no reancla su reloj de pared en cada horizonte:
  la demora de la escena se recupera en los tramos siguientes (antes se
  perdía y ×1 corría al 70–80 % con 2–4 ms de ida y vuelta). Las entradas
  que manda la escena pasan por
  `set`, quedan en la grabación de la sesión (G3) y la reproducción da el
  mismo hash sin la escena.
- **Dispositivos nativos** (SDK, `sim/runner/native_device.cpp`). Corren
  dentro del runner y agendan sus eventos en el planificador: no necesitan
  horizontes.

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
| UI→runner | `scene` | **[G7]** `{on, watch}`: co-simulación con la escena; el runner solo avanza hasta el horizonte |
| ambos | `horizon` | **[G7]** UI→runner `{until_ns}`; runner→UI `{t_ns, reason: output\|until, changes}` (§6.6) |
| UI→runner | `yield` | corta el horizonte en curso en el instante actual (acción del usuario en la escena, §6.6) |

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
llega de la red entra con `net_*` en un instante virtual. Desde alpha.13 la
placa lo trae poblado, como el JWPLC Basic; `--no-eth` (en la app,
`simulation.peripherals.ethernet.present = false` en el proyecto) lo quita:
CS5 no responde y el runtime informa "No Ethernet hardware". La señal `ETH_CABLE` (1 =
conectado) desconecta el cable.

- **CLI** (sin `--port`): nadie responde en la red (el ARP vence,
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
      { "id": "plc", "type": "jwsim/jwplc-basic", "x": 300, "y": 0 },
      { "id": "PS1", "type": "jwsim/power-24vdc", "params": { "model": "MDR-60" }, "x": 40, "y": 60 },
      { "id": "S1", "type": "jwsim/pushbutton-no", "version": "1.0.0", "params": { "label": "Marcha" }, "x": 300, "y": -320 },
      { "id": "KM1", "type": "jwsim/contactor", "version": "1.0.0", "params": { "coil": "24VDC", "aux": "10" }, "x": 240, "y": 620 }
    ],
    "wiring": [
      { "from": "PS1.+V1", "to": "plc.24VDC" }, { "from": "PS1.-V1", "to": "plc.M0" }, { "from": "PS1.-V1", "to": "plc.M1" },
      { "from": "PS1.+V1", "to": "S1.13" }, { "from": "S1.14", "to": "plc.I0_0" },
      { "from": "PS1.+V1", "to": "plc.Q0_0.1" }, { "from": "plc.Q0_0.2", "to": "KM1.A1" }, { "from": "KM1.A2", "to": "PS1.-V1" }
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
de G2: modo de las entradas y su nivel inicial. **[G7]** `scene.devices` y
`scene.wiring` son la escena (§4.1; esquema propio en
[`schema/jwsim-scene-1.json`](../schema/jwsim-scene-1.json)). Cada
dispositivo tiene `id`, `type` (`autor/nombre`), la `version` mínima (misma
versión mayor), `params` y su posición `x`/`y` en la vista. Cada cable une
dos bornes `<dispositivo>.<borne>`. La versión 0 es el borrador
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
  fuente sin clasificar en `sim/core-manifest.json`. **[G5]**
  `jwsim-cli parity <ref>` lo informa antes de compilar, junto con los
  headers que no se encuentran y los cambios del autoload y de la lista de
  librerías contra `sim/package-parity.json` ([CLI.md](CLI.md)).
- **Procedimiento por alpha** (13, 14, 15…):
  1. `node cli/jwsim-cli.mjs parity <tag>`: lista de lo que cambió.
  2. Subir `JWPLC_PACKAGE_REF` y `JWPLC_PACKAGE_COMMIT`;
     `node scripts/fetch-package.mjs`.
  3. Resolver headers/APIs nuevos **en `sim/hal`**, nunca en el package. Si
     algo impide simular, documentarlo como punto de extensión para una
     alpha futura (§11). Registrar el autoload con `parity --update`.
  4. `node cli/jwsim-cli.mjs matrix`: cada ejemplo compila, corre y pasa su
     prueba; un ejemplo nuevo recibe la suya (`scripts/gen-example-tests.mjs`
     y estímulos a mano).
  5. Correr todos los gates ⇒ `JWSIM_PACKAGE_SYNC_ALPHAxx=PASS`.
- **En el CI del package** (G5): `sim-regression.yml` corre la paridad, la
  matriz y las pruebas de la CLI sobre el árbol de un PR o de una release
  (propuesta en [integration/SIM_REGRESSION.md](integration/SIM_REGRESSION.md)).
- **W5500**: alpha.13 (publicado el 2026-10-22) cambia el acceso al
  W5500 (dueño del bus por tarea, sockets con "lease"), el inicio sin la
  espera de 560 ms y Modbus TCP; alpha.14 usará INTn y reutilización de
  FIFO. El modelo (§7.4) es del chip, no de una alpha: los gates
  W5500_MODEL y MODBUS_TCP_HOST pasaron con alpha.12 y con alpha.13. Desde
  la sincronización a alpha.13 la placa lo trae poblado.
- **Sincronización a alpha.13** (2026-10-23, validada por JW Control):
  compila sin cambios en el simulador. Lo que hubo que ajustar fueron
  tiempos fijados con alpha.12 (la TFT tarda ~140 ms más en iniciar),
  capturas del analizador y referencias de la pantalla de reposo (ETH ya
  no está vacío), y la velocidad: alpha.13 toma un mutex en cada acceso a
  las E/S, compensado con `-O2` para `sim/` y un `S()` integrable en el
  motor. Informe en [`docs/reports/SYNC_ALPHA13.md`](reports/SYNC_ALPHA13.md).

## 10. Límites de fidelidad

| Área | Fiel | No fiel / pendiente |
|---|---|---|
| Lógica del sketch y librerías | Mismo código fuente y mismo compilador (GCC) que el firmware; `int` y `long` de 32 bits en Windows y `linux-x86` (§3.4); package en C++23 como en la placa; sketch en C++20 con repetición en C++23 si lo necesita (§3.1) | Punteros de 64 bits (`sizeof` de estructuras con punteros); `long` de 64 bits en Linux/macOS x86_64; UB del sketch puede comportarse distinto |
| Tiempo | Ticks, delays, periodos del runtime, duración de buses | Tiempo de cómputo puro (modelo de costos calibrable, no ciclo-exacto) |
| Doble núcleo | Afinidad, prioridades, apropiación en puntos de sincronización | Carreras finas entre núcleos sin puntos de sincronización |
| Interrupciones | GPIO por flanco/nivel en contexto ISR del núcleo dueño | Latencia de entrada a la ISR (0 en el modelo), anidamiento por niveles de prioridad |
| Memoria | — | Tamaño de pila/heap del ESP32, desbordes (pilas del host ≥ 256 KiB) |
| E/S digitales | Registro a registro en el TCA6424A; el core escanea las entradas cada 20 ms (`getJWPLCIoScanPeriod_ms`), igual que en la placa | Tiempos eléctricos, rebotes (los agrega el dispositivo de escena) |
| Escena (G7) | Conectividad, polos, polaridad, tensión nominal, cortocircuitos y cruces; retardos y rampas exactos en tiempo virtual | Sin tensiones intermedias, corrientes, caídas ni potencias; dos cargas en serie no se energizan; sin rebote de contactos ni arco; los dispositivos nativos arrancan de cero tras `esp_restart()` |
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
| H3 | `libJWPLC_TFT.a` contiene TFT_eSPI 2.5.43 precompilado y el package no trae su fuente (solo la licencia). | Para compilar desde fuente el simulador descarga TFT_eSPI 2.5.43 de upstream; si el `.a` usa una versión parcheada, habría divergencia. | Publicar en el repo la fuente exacta (o el parche) con que se genera `libJWPLC_TFT.a`. **Resuelto en alpha.14**: `tools/alpha15/regenerate_libJWPLC_TFT.sh` aplica a `ST7789_Init.h` el DISPON diferido (`JWPLC_TFT_DEFER_DISPON`); el simulador aplica el mismo cambio verificado por SHA-256 (`third_party/sources.json`, `patches`). |
| H4 | `jwplcSystemTask` ejecuta en la misma vuelta el escaneo de E/S y servicios que pueden bloquear: reintento de montaje SD (esperas de 3×100 ms en `sdCommand`) y sondeo del W5500 (`delay(1)` en `W5100Class::softReset`). | Ante una falla (tarjeta detectada que no responde, W5500 que no responde) el escaneo de entradas se retrasa de 20 ms a 60–300 ms. Observado en G0 con la detección SD sin modelar y con el W5500 no poblado. | Separar el escaneo de E/S de los servicios bloqueantes (tarea propia o máquinas de estado no bloqueantes). |
| H5 | El autoload de `Arduino.h` enlaza 16 librerías en cualquier sketch. | Más superficie a simular y a compilar en frío. | Ninguna acción necesaria; documentado para G1/G5. |
| H6 | ~~No se encontraron en alpha.12 definiciones de los LEDs RUN/ERR/BUS/ETH.~~ **Resuelto**: no son LEDs; son indicadores que el runtime dibuja en la pantalla de reposo (PWR, RUN, ERR, BUS, ETH), como se ve en el render de la placa. | — | — |
| H7 | El sdkconfig de `esp32-libs 3.3.8` no está en el package. | Valores como `CONFIG_FATFS_*` o `CONFIG_ARDUINO_RUNNING_CORE` se fijaron por defecto. | Verificar contra el `sdkconfig` del tool y fijarlos en `sim/hal/include/sdkconfig.h`. |
| H8 | Cuatro ejemplos de `JW_MatrixButtons` (`01_BasicPress`, `02_AxisWrapSerial`, `03_EventQueue`, `05_DirectButtons_IO35_IO34_IO39`) definen su propio `enum { BTN_LEFT, … }`, que choca con `JWPLCButtonId` de `JWPLC_GlobalPeripherals.h` (incluido por el autoload de `Arduino.h`). | No compilan con la placa `jwplcbasic`, tampoco en el Arduino IDE. | Renombrar los enumeradores de los ejemplos o poner `JWPLCButtonId` en un namespace / `enum class`. **Corregido en alpha.14** (platform-jwplc#148): los ejemplos 01–03 usan el objeto global `JWPLC_Buttons`; 04 y 05 se retiraron. |
| H9 | Sketches de `tools/build-speed-benchmark` que usan librerías retiradas antes de alpha.12 (`08_ethernet_bridge_link`, `09_gfx_bridge_link`, `10_gfx_physical`, `16_alpha6_ethernet_nonblocking_acceptance`). | No compilan con alpha.12. | Actualizarlos a `JWPLC_TFT`/`JWPLC_Ethernet` o moverlos a un archivo histórico. |
| H10 | `LogicV2EnginePrototype.cpp:7` y `RuntimeUIV2EditSession.cpp:14` inicializan `_links{}`, un arreglo de `LogicV2InputLink`, cuyo constructor por defecto es `constexpr explicit LogicV2InputLink(uint16_t = …)`. La inicialización de copia de lista con un constructor `explicit` está prohibida (CWG 1518); GCC la acepta, clang la rechaza. | Solo compila con GCC. El simulador usa GCC en todos los destinos (§3.1). | Quitar `explicit` del constructor con argumento por defecto o declarar un constructor por defecto no explícito. |
| H11 | El ejemplo `JWPLC_LogicRuntime_V2_Engine_RAM` exige `sizeof(LogicV2EnginePrototype) <= MIN_ENGINE_STORAGE_BYTES + 64`, pero `MIN_ENGINE_STORAGE_BYTES` no cuenta `_timing[100]` ni `_startedAtMs[100]` (500 bytes). En ILP32 (como el ESP32) el motor mide 2852 bytes frente a 2324 + 64. | El ejemplo informa "56 PASS, 1 FAIL" en cualquier destino; previsiblemente también en la placa. | Incluir esos arreglos en `MIN_ENGINE_STORAGE_BYTES` o ajustar el margen. **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
| H12 | **Carrera en `JWPLC_Display` al entrar al HMI de usuario** (G4, `03.Display_HMI_Pages`). `enterUserUI()` corre en `loopTask` y dibuja dentro de un lote de la TFT (`JWPLC_TFT.beginBatch()`); `jwplcSystemTask` (mayor prioridad, mismo núcleo) puede refrescar la pantalla a la vez. `_batchActive` es un indicador compartido: el `beginBatch()` del sistema devuelve verdadero dentro del lote de `loopTask` y su `endBatch()` libera los mutex que tomó `loopTask`. | En el simulador, con `CONFIG_FREERTOS_CHECK_MUTEX_GIVEN_BY_OWNER` de ESP-IDF, el firmware termina por assert ("mutex liberado por quien no es su dueño"); en la placa puede corromper el dibujo o dejar el bus SPI tomado. Se reproduce solo si OK llega en la ventana del primer refresco del sistema (~1000–1040 ms tras el arranque; 2 de 68 instantes probados). | Que el lote sea por tarea (dueño del lote) o que el refresco del sistema no entre mientras `loopTask` tiene un lote abierto. **Corregido en alpha.13** (`_batchOwner`). |
| H13 | `JWPLC_LogicRuntime_Storage_API_Superblock_Redundancy` espera `prepareBoot() == Unformatted` con las dos copias del superblock con CRC corrupto, pero `JWPLCLogicStorage::prepareBoot()` devuelve `CorruptMetadata` (el inspector ve la firma JWPLC en las copias), que es justamente lo que valida `Storage_Metadata_Diagnostic`. | El ejemplo informa "50 PASS, 1 FAIL" en cualquier destino (lógica pura, sin hardware). | Actualizar la expectativa del ejemplo a `CorruptMetadata`. **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
| H14 | `sd_diskio.cpp` (librería SD) guarda respuestas en `char` y compara `resp > 0x00`: depende de que `char` no tenga signo, como en xtensa (y ARM). | Sin `-funsigned-char`, en x86 0xFF es -1 y la SD nunca se selecciona. El simulador compila con `-funsigned-char` (§7.2); en la placa no hay problema. | Usar `uint8_t` en `sd_diskio.cpp` (código heredado de arduino-esp32; también vale reportarlo allí). |
| H15 | **HTTP y DNS nunca funcionan en dos ejemplos de `JWPLC_Ethernet`** (G5, alpha.13). `Ethernet_HTTP_TFT_Diagnostics` y `Ethernet_Continuous_Stress_TFT` toman el bus con `jwplcSPI_acquire()` (mutex no recursivo de `xSemaphoreCreateMutex`) y, con el bus tomado, llaman a `EthernetClient::connect` / `DNSClient::getHostByName`. Esas rutas abren `BusScope(20)` (`JWPLC_W5500_SafeAccess.cpp`), que solo reconoce como dueño a quien tomó el bus por `BusScope`: vuelve a pedir el mismo mutex desde la misma tarea y falla a los 20 ms. | El DNS termina "SIN SOCKET/ENVIO" en ~40 ms y nunca llega el `HTTP 200` que prometen los README; igual en la placa (mismo código, mismo mutex). Las pruebas de la matriz fijan el comportamiento actual con expectativas que siguen valiendo si se corrige. | Que los ejemplos tomen el bus con `BusScope` (o no lo tomen alrededor de llamadas de la librería), o que `BusScope` reconozca un `jwplcSPI_acquire` previo de la misma tarea (mutex recursivo). **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
| H16 | `JWPLC_LogicRuntime_UI_Home` y `JWPLC_LogicRuntime_UI_Blocks` imprimen "Pulsa cualquier boton para entrar a USER" pero no llaman a `setIdleWakeMode()`; desde alpha.8 el valor por defecto es `IDLE_WAKE_DISABLED`, así que la botonera no saca la pantalla de IDLE. | Los botones no hacen nada en esos dos ejemplos (en el simulador y, previsiblemente, en la placa). Los dos ejemplos FBD sí lo llaman. | Agregar `JWPLC_Display.setIdleWakeMode(IDLE_WAKE_ANY_BUTTON)` en ambos o ajustar el mensaje. **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
| H17 | `JWPLC_LogicRuntime_V1_V2_Adapter_RAM` espera que el adaptador v1→v2 rechace TON ("TON queda pendiente de fase posterior"), pero `src/experimental/LogicV1ToV2Adapter.cpp` ya lo convierte (`LogicBlockType::Ton → LogicV2BlockType::Ton`), y `V1_V2_Ton_RAM` lo usa y pasa. | El ejemplo informa "1 FAIL" en cualquier destino (lógica pura). | Actualizar la expectativa del ejemplo a "TON se convierte". **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
| H18 | Los ejemplos `Block_Config`, `Strings` y `Struct_Config` de `JW_FRAM` crean `JW_FRAM fram(5)`, pero en el JWPLC Basic GPIO5 es el CS del W5500 (`JWPLC_ETH_CS`); la FRAM está en GPIO13 (`JWPLC_FRAM_CS`, como usa `Basic_RW`). | Las lecturas fallan ("Bloque invalido", textos vacíos, estructura en cero); en la placa además se escribe al W5500. Las pruebas fijan ese comportamiento y su `$comment` dice lo esperado con el pin corregido. | Usar `JW_FRAM fram(JWPLC_FRAM_CS)` (13). **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
| H19 | `ModbusRTU_Native` y `ModbusRTU_Master_Native` usan `readHoldingRegisters()` como si bloqueara, pero el motor por defecto del package es ASYNC: la llamada solo inicia la transacción y el sketch nunca llama a `task()`. | Imprimen "Read OK" con ceros y luego "Master busy" para siempre; la respuesta nunca se procesa (en el simulador y en la placa). | Seleccionar el motor bloqueante en esos ejemplos o llamar a `task()` y esperar el resultado. **Corregido en alpha.14** ([platform-jwplc#142](https://github.com/JW-Control/platform-jwplc/pull/142), ejemplos). |
