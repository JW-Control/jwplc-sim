# Subir al JWPLC y caché de compilación

## Subir al JWPLC (C++)

El botón **⇪ Subir al JWPLC** de la barra superior compila el programa abierto
para el ESP32 real y lo carga por USB. Usa el **mismo package fijado** que el
simulador (`package.lock`), así que lo que se probó en el Sim es lo que corre
en el equipo. El JWPLC Basic v2.0 entra solo en modo de carga (RC en EN): no
hace falta apretar BOOT.

Cómo funciona (`cli/lib/esp32.mjs`):

- `arduino-cli` y `ctags` vienen en el instalador (`.jwsim/arduino-cli/`,
  `node scripts/fetch-arduino-cli.mjs`, versiones y SHA-256 en
  `third_party/arduino-cli.json`).
- El Sim usa su propio directorio de datos de arduino-cli
  (`%APPDATA%\JWPLC Sim\arduino`; en desarrollo `build/arduino`, o
  `JWSIM_ARDUINO_DATA`). No toca el Arduino15 del usuario.
- La plataforma es un enlace al árbol del package fijado:
  `packages/jwplc_sim/hardware/esp32/<versión>`, FQBN
  `jwplc_sim:esp32:jwplcbasic`.
- Herramientas (`esp-x32 2601`, `esp32-libs 3.3.8`, `esptool_py 5.2.0`): si el
  usuario ya instaló la placa JWPLC en Arduino IDE u OpenPLC Editor, se enlazan
  desde su Arduino15. Si no, el panel ofrece descargarlas una vez (unos 540 MB,
  `arduino-cli core install jwplc:esp32`).
- La carga ejecuta directo el comando de `platform.txt` (esptool), resuelto por
  `arduino-cli compile --show-properties=expanded`. Así no depende del
  descubrimiento de puertos de arduino-cli, que se descarga de internet.
- Los proyectos IEC todavía se cargan desde el OpenPLC Editor.

Desde la línea de comandos (PowerShell, en la carpeta del repo):

```powershell
node cli/jwsim-cli.mjs subir JWPLC_Aprende\extras\retos\01-marcha-parada\solucion\marcha_parada
node cli/jwsim-cli.mjs subir JWPLC_Aprende\extras\retos\01-marcha-parada\solucion\marcha_parada --port COM5
```

Sin `--port` solo compila. Con `--tools` descarga las herramientas si faltan.
Prueba automática: `app/tests/e2e-subir-jwplc.mjs` (compila y comprueba el
error de carga sin equipo).

## Caché de compilación en el instalador

La primera compilación del simulador compila una vez todo el package (core, 17
librerías y el motor): unos 35 s en Linux y más de 2 min en Windows. El
instalador ya la trae hecha:

- `cli/lib/build.mjs` calcula la clave de cada objeto con las rutas de la app
  como `${ROOT}`, y guarda sus dependencias en `<objeto>.deps` con la misma
  forma: la caché se puede copiar a otra carpeta o PC.
- `node scripts/cache-seed.mjs` compila `scripts/cache-seed/semilla` y deja los
  objetos en `build/cache-seed/`. `scripts/dist.mjs` lo corre con el toolchain
  del instalador y lo lleva a `resources/cache-seed` (`JWSIM_CACHE_SEED`).
  `JWSIM_DIST_SIN_CACHE=1` lo omite.
- Los objetos de la semilla se usan si su clave coincide y sus dependencias
  existen; no se comparan fechas porque viajan en el mismo instalador.
- La semilla trae también la lista de librerías que arrastra
  `#include <Arduino.h>`: si el sketch no pide otra, no se preprocesan las
  fuentes de las librerías una por una.
- Al abrir la app se precalienta el compilador en segundo plano (el header
  precompilado, unos segundos). Las compilaciones del usuario esperan a que
  termine. `JWSIM_WARMUP=0` lo apaga.
- El package se compila con `-g1`; el sketch y el motor (`sim/`) siguen con
  `-g` para el depurador.
- En Windows, tras una compilación de más de 20 s (o desde Herramientas ▸
  Acelerar la compilación), la app ofrece excluir sus carpetas de caché y de
  compilación de Windows Defender. Pide permiso de administrador.

Medido en la app armada para Linux con datos vacíos: precalentado 5,6 s y
primera compilación de una lección 1,0 s (antes 34 s). Prueba:
`node scripts/dist.mjs --dir` y luego `app/tests/e2e-cache-instalador.mjs`.
