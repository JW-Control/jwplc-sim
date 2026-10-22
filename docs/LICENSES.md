# JWPLC Sim — Matriz de licencias

```text
Gate: JWSIM_G0_LICENSE_MATRIX
Licencia del simulador: GPL-3.0-or-later (adoptada por el titular)
SDK de dispositivos: MIT · Materiales y documentación: CC BY-SA 4.0
```

> Este documento es un análisis técnico de compatibilidad, no asesoría
> legal. Las filas marcadas **verificar** deben confirmarse leyendo el texto
> de licencia de la versión exacta antes de distribuir.

## 1. Cómo se combina cada componente

Hay tres formas de uso, y la compatibilidad depende de ellas:

- **Enlazado en el runner**: se compila y enlaza dentro del ejecutable
  nativo que el usuario genera (sketch + package + HAL + modelos). Todo debe
  ser compatible con una sola licencia resultante.
- **Aplicación de escritorio**: lo que se distribuye en el instalador
  (Electron, interfaz, motor de escena, toolchain).
- **Proceso separado / herramienta**: programas independientes que se
  comunican por pipes o sockets (QEMU, GDB, editor OpenPLC). Es agregación,
  no obra combinada.

## 2. Matriz

### 2.1 Enlazado en el runner (obra combinada)

| Componente | Origen | Licencia | Compatible con GPL-3.0 | Notas |
|---|---|---|---|---|
| Package JWPLC (core `jwcontrol`, runtime, librerías JWPLC) | platform-jwplc | GPL-3.0 (archivo `LICENSE` del repo) | Sí | Define el piso: el runner resultante es GPL-3.0. |
| Base arduino-esp32 del core (`WString`, `Print`, `HardwareSerial`…) | arduino-esp32 3.3.8 | LGPL-2.1-or-later | Sí (se puede usar bajo GPL-3.0) | |
| `SPI`, `Wire` | arduino-esp32 | LGPL-2.1-or-later | Sí | La copia del package tiene cambios JWPLC. |
| `FS`, `SD` | arduino-esp32 | Apache-2.0 | Sí (no con GPL-2.0) | |
| `JWPLC_Ethernet` | derivada de Arduino Ethernet | Mixta: Apache-2.0 (`Dns`), MIT (`EthernetUdp`), resto **verificar** encabezados | Sí, si el resto es LGPL/MIT | |
| `JW_RTC` | JW Control | MIT (`LICENCE`) | Sí | |
| `JW_FRAM` | basada en Adafruit | BSD (Adafruit, `LICENCE`) | Sí | |
| `Adafruit_BusIO` | Adafruit | MIT | Sí | |
| `libb64` (core) | | Dominio público | Sí | |
| TFT_eSPI 2.5.43 | Bodmer (descargada, no versionada) | FreeBSD (BSD-2-Clause) + partes MIT (`license.txt`) | Sí | El package solo trae el `.a` y la licencia (§11 H3 de ARCHITECTURE). |
| FatFs (ESP-IDF v5.5.1) | ChaN + glue ESP-IDF | Licencia FatFs (BSD de 1 cláusula) + Apache-2.0 | Sí | Descargada, no versionada. |
| Headers sustitutos de ESP-IDF (`sim/hal/include`) | este repo | GPL-3.0-or-later | — | Declaraciones de API escritas desde cero; nombres y firmas por interoperabilidad. |
| HAL nativo, motor, modelos, placa, runner | este repo | GPL-3.0-or-later (interfaz del SDK: MIT) | — | |
| Esquema del proyecto `.jwsim` (`schema/`) | este repo | MIT | — | Para que otras herramientas lean y escriban proyectos sin restricciones. |
| libstdc++ / glibc (Linux) | GCC / GNU | GPL-3.0 + excepción de runtime / LGPL-2.1+ | Sí | Excepción de runtime de GCC; glibc enlazada dinámicamente. |
| libstdc++, libgcc, CRT y winpthreads de MinGW-w64 (Windows) | GCC / mingw-w64 | GPL-3.0 + excepción de runtime de GCC / ZPL-2.1 + dominio público / MIT + BSD-3-Clause (winpthreads) | Sí | Se enlazan estáticamente en el `.exe` del runner; la excepción de runtime permite cualquier licencia del ejecutable. Incluir avisos de mingw-w64 y winpthreads. |

### 2.2 Aplicación de escritorio

| Componente | Licencia | Notas |
|---|---|---|
| Electron (Chromium + Node.js) | MIT (Electron, Node.js); BSD-3-Clause y otras (Chromium) | Distribuir `LICENSES.chromium.html` (electron-builder lo genera). |
| Monaco Editor | MIT | |
| three.js | MIT | |
| MinGW-w64 GCC 13 + binutils (toolchain incluido para compilar sketches) | GPL-3.0-or-later (GCC, binutils) + avisos mingw-w64 | Herramienta, no se enlaza en la app. Se descarga de WinLibs (versión y SHA-256 en `third_party/toolchain.json`). Única modificación local: se quitan los bits ASLR del encabezado PE de `cc1.exe`/`cc1plus.exe` para que el PCH funcione (ARCHITECTURE §3.1); al redistribuirlo, avisar de esa modificación y ofrecer las fuentes (GPL §5–6). |
| Intérprete para dispositivos de escena (si se embebe QuickJS) | MIT | Opcional (G7). |
| Playwright (solo desarrollo/CI) | Apache-2.0 | No se distribuye. |

### 2.3 Procesos separados y herramientas

| Componente | Licencia | Uso | Notas |
|---|---|---|---|
| GDB | GPL-3.0-or-later | Depurador vía DAP (G3) | Proceso separado. |
| LLDB | Apache-2.0 WITH LLVM-exception | Alternativa en Linux/macOS | |
| Editor OpenPLC (fork `JW-Control/openplc-editor`) | **verificar** (upstream GPL-3.0) | Se vincula el proyecto; se abre por separado | El botón "Simular" (G6) vive en el fork. |
| matiec (compilador IEC 61131-3) | GPL-3.0 (compilador); biblioteca de runtime **verificar** (LGPL) | Herramienta; el C que genera se enlaza en el runner | Si la biblioteca de runtime fuera GPL-3.0, sigue siendo compatible. |
| HAL OpenPLC `jwplcbasic.cpp` | **verificar** (ecosistema OpenPLC, GPL-3.0) | Enlazado en el runner en modo ladder | |
| QEMU-ESP32 (fork de espressif/qemu) | **GPL-2.0-only** (con partes GPL-2.0-or-later/BSD/MIT) | Proceso separado (G10) | **Incompatible** con GPL-3.0 en un mismo binario. Ver §3.3. |
| ROM del ESP32 para QEMU | Términos de Espressif — **verificar antes de redistribuir** | Cargada por QEMU | Decisión 7: verificar si se puede incluir en el instalador o debe descargarse. |
| FUXA | MIT | Integración por Modbus TCP (G8) | |
| Open Industry Project (Godot) | MIT | Integración (G8) | |

## 3. Análisis

### 3.1 GPL-3.0 frente a AGPL-3.0

| Criterio | GPL-3.0-or-later | AGPL-3.0-or-later |
|---|---|---|
| Compatibilidad con el package (GPL-3.0) | Sí, idéntica | Sí (GPL-3.0 §13 permite combinar con AGPL) |
| Valor de la cláusula de red | — | Solo aplica si alguien ofrece el simulador como servicio de red. El producto es **solo escritorio**, sin servidor ni WASM: la cláusula no protege nada adicional. |
| Fricción para contribuidores, autores de dispositivos y escuelas | Baja | Alta: muchas políticas institucionales y empresariales prohíben AGPL |
| Cobrar por talleres | Permitido | Permitido |
| Coherencia con el ecosistema JW Control | Igual que platform-jwplc | Distinta |

**Adoptada: GPL-3.0-or-later** para todo el código de este repositorio.
"or-later" mantiene compatibilidad con el package y con una eventual GPL-4.0.

### 3.2 Obra combinada del runner

El ejecutable que genera el usuario contiene el package (GPL-3.0) y el HAL
del simulador; por eso el HAL debe ser GPL-3.0-compatible (lo es con la
recomendación). Todas las dependencias enlazadas de §2.1 son compatibles con
GPL-3.0 (LGPL-2.1+, Apache-2.0, MIT, BSD, FatFs, dominio público). Ninguna
es GPL-2.0-only.

### 3.3 QEMU (GPL-2.0-only)

GPL-2.0-only y GPL-3.0 **no pueden combinarse en un mismo binario**. La
decisión 7 ya lo resuelve; se fija aquí:

- QEMU corre como **proceso separado**; la comunicación es por socket con un
  protocolo genérico (SPI/I2C/UART/GPIO) documentado. Eso es agregación.
- El código del puente que vive **dentro** de QEMU se publica en el fork bajo
  **GPL-2.0-or-later** (compatible con QEMU) y no incluye código de este
  repositorio.
- Los modelos de periféricos (GPL-3.0) corren en el proceso del simulador,
  **nunca** se enlazan ni se cargan dentro de QEMU (tampoco como plugins TCG).

### 3.4 SDK de dispositivos y comunidad

- Headers del SDK y plantillas: **MIT**, para que cualquiera pueda escribir
  dispositivos bajo cualquier licencia **compatible con GPL-3.0** (MIT,
  BSD, Apache-2.0, LGPL, GPL-3.0).
- Los dispositivos nativos se cargan en el proceso del runner (GPL-3.0); por
  eso el índice `jwsim_index.json` exige un identificador SPDX compatible
  con GPL-3.0 en cada entrada y rechaza el resto. Los dispositivos en
  TypeScript del motor de escena siguen la misma regla.

### 3.5 Ejemplos y materiales

- Material didáctico (enunciados, guías, imágenes, escenas 2D/3D):
  **CC BY-SA 4.0** (compatible en un sentido con GPL-3.0 desde 2015).
- Código de ejemplo que acompaña a los ejercicios: queda bajo **CC BY-SA
  4.0** como parte del material, por decisión del titular. Observación: CC
  BY-SA no está pensada para software; si en el futuro se quiere que los
  alumnos copien fragmentos sin obligaciones de atribución, se puede liberar
  ese código además bajo CC0-1.0 o MIT-0 (licencia dual).

### 3.6 Marcas

"JWPLC" y "JW Control" son marcas del titular; "Arduino", "OpenPLC",
"Espressif" y "ESP32" pertenecen a sus dueños. La GPL no otorga derechos de
marca: los forks deberán cambiar el nombre del producto. Usar esas marcas
solo de forma descriptiva ("compatible con…").

## 4. Obligaciones al distribuir el instalador

1. Incluir `LICENSE` (GPL-3.0) y un `THIRD_PARTY_NOTICES` generado a partir
   de esta matriz (Electron/Chromium, GCC/binutils/mingw-w64, Monaco, three.js).
2. Si el instalador incluye fuentes de terceros para compilar sin conexión
   (TFT_eSPI, FatFs), incluir sus licencias junto a ellas.
3. Ofrecer el código fuente correspondiente (el repositorio público basta).
4. No incluir la ROM de Espressif hasta cerrar su verificación.
5. Los `.exe` de runner que el usuario genera llevan libc++/MinGW enlazados:
   la app debe dejar disponibles esos avisos (carpeta de licencias del
   toolchain).

## 5. Decisión adoptada

```text
DECISIÓN DEL TITULAR (JW Control):
  [x] jwplc-sim bajo GPL-3.0-or-later (LICENSE en la raíz, encabezados SPDX)
  [x] SDK de dispositivos bajo MIT
  [x] Materiales didácticos y documentación bajo CC BY-SA 4.0
```

Aplicación en el repositorio (formato [REUSE](https://reuse.software)):

| Ruta | Licencia |
|---|---|
| Código (`sim/`, `cli/`, `scripts/`, `tests/`) | GPL-3.0-or-later — `LICENSE` y `LICENSES/GPL-3.0-or-later.txt` |
| Interfaz del SDK: `sim/engine/include/jwsim/devices.h`, `sim/engine/include/jwsim/engine.h` y el futuro `sdk/` | MIT — `LICENSES/MIT.txt` |
| `docs/`, `README.md`, `MODEL.md` y materiales de ejercicios | CC BY-SA 4.0 — `LICENSES/CC-BY-SA-4.0.txt` |

Cada archivo de código lleva `SPDX-FileCopyrightText` y
`SPDX-License-Identifier`; las rutas sin encabezado se declaran en
`REUSE.toml`.

Nota: un dispositivo nativo MIT se carga en el proceso del runner
(GPL-3.0-or-later). Eso es válido porque MIT es compatible; la licencia MIT
del SDK permite que los autores de dispositivos elijan cualquier licencia
compatible con GPL-3.0 (§3.4), no que se distribuyan dispositivos con
licencias incompatibles junto al simulador.
