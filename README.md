# JWPLC Sim

Simulador de escritorio del PLC **JWPLC Basic** de JW Control: el sketch y
las librerías del package JWPLC se compilan **desde su código fuente** para
el PC contra un HAL nativo del Arduino core ESP32, con un motor de tiempo
virtual determinista y modelos de periféricos a nivel de registros.

```text
Estado: G0–G3 cerrados (G1 salvo la calibración contra placa) · en curso: G4 (periféricos)
Package fijado: platform-jwplc v2.1.0-alpha.12 (package.lock)
```

Estado detallado de cada gate en [docs/GATES.md](docs/GATES.md).

![JWPLC Sim: editor, placa y pestaña Buses](docs/img/g2.png)

## Abrir la interfaz

Requisitos:

- Node.js ≥ 22 y Git.
- GCC en el `PATH` (`gcc`, `g++`, `ar`, `nm`, `objcopy`):
  - Windows: MinGW-w64 GCC ≥ 13 con hilos POSIX, por ejemplo
    [WinLibs](https://winlibs.com/) (descomprimir y agregar `mingw64\bin`
    al `PATH`).
  - Linux: `gcc`/`g++` del sistema.

```sh
git clone https://github.com/JW-Control/jwplc-sim.git
cd jwplc-sim
node scripts/fetch-package.mjs        # descarga platform-jwplc en el tag fijado
cd app
npm install
npm start
```

Con el toolchain incluido no hace falta GCC en el `PATH`:
`node scripts/fetch-toolchain.mjs` descarga WinLibs GCC 14.3.0 (~245 MB) a
`.jwsim/toolchain/` y verifica su SHA-256.

La primera compilación de un sketch tarda ~10–15 s (core + 16 librerías del
package); un cambio posterior, menos de 1 s. Los ejemplos del package se
copian a `Documentos/JWPLC Sim/` antes de editarlos. F5 compila y ejecuta,
F6 pausa. Proyecto → Abrir/Guardar maneja archivos `.jwsim` (sketch,
vínculos a OpenPLC y HMI, escena). Si edita el sketch con el Arduino IDE, la
simulación se recarga sola.

Depuración (G3), con el gdb del toolchain (o el del sistema en Linux):

- **Breakpoints**: clic en el margen del editor o F9. F8 continúa, F10 paso
  por encima, F11 entra, Mayús+F11 sale, Ctrl+F8 interrumpe. Detenido, el
  tiempo virtual no avanza; la pestaña Depuración muestra la pila y las
  variables.
- **Observación**: E/S y variables del sketch en vivo; forzado de entradas y
  salidas (marca "F" en la placa).
- **Grabación**: toda la sesión (entradas y forzados) se guarda como `.stim`
  con su hash; Simulación → Reproducir grabación la repite y compara el hash.
- **Buses**: I2C por registro, SPI por CS (TFT, SD, FRAM, W5500), UART y
  Modbus RTU/TCP con CRC, con filtro por tipo.

Pruebas E2E de la interfaz: `cd app && npm run test:e2e` (G2) y
`npm run test:e2e:g3` (G3) (en Linux sin
pantalla, `xvfb-run -a npm run test:e2e`).

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md): capas, qué se reemplaza del core,
  formato `.jwsim`, interfaz de dispositivos, protocolo, modelo de tiempo,
  límites de fidelidad, sincronización con el package y hallazgos.
- [Gates](docs/GATES.md): G0 a G10 con criterios medibles.
- [Licencias](docs/LICENSES.md): matriz de dependencias y recomendación.
- Informes: [G0](docs/reports/G0_POC_IO_BASIC.md), [G1](docs/reports/G1.md), [G2](docs/reports/G2.md), [G3](docs/reports/G3.md).

## Prueba rápida (headless)

Requisitos: Node.js ≥ 20, git y GCC: `gcc`/`g++` en Linux, MinGW-w64 GCC
en Windows (o `x86_64-w64-mingw32-g++-posix` para compilar desde Linux con
`--target windows`; se ejecuta con wine). `--target linux-x86` (`gcc -m32`,
paquete `g++-multilib`) reproduce el modelo de datos ILP32 del ESP32.

```sh
node scripts/fetch-package.mjs        # descarga el tag fijado a .jwsim/ (no se versiona)
node cli/jwsim-cli.mjs run \
  .jwsim/package/v2.1.0-alpha.12/tools/build-speed-benchmark/sketches/02_io_basic \
  -- --until 3000 --set I0_0=1@1000 --set I0_0=0@2000
node scripts/gate-g0-poc.mjs          # gate JWSIM_G0_POC_IO_BASIC
```

Opciones del runner: `--until <ms>`, `--set SEÑAL=V@ms`, `--stim archivo`,
`--realtime <factor>`, `--seed <n>`, `--stats`, `--quiet`.
Depuración: `JWSIM_TRACE_TASK=<tarea> JWSIM_TRACE_BT=1` imprime dónde se
bloquea una tarea; `JWSIM_EXTRA_FLAGS=-fsanitize=address` compila con ASan.

## Reglas del repositorio

- El package JWPLC **no se copia ni se parchea** aquí: se descarga del tag
  fijado en `package.lock`. Lo que impida simular se documenta como punto de
  extensión para una alpha futura.
- Documentación en español.
- Commits sin líneas de coautor (`Co-Authored-By`).

## Licencias

- Código: [GPL-3.0-or-later](LICENSE).
- Interfaz del SDK de dispositivos: [MIT](LICENSES/MIT.txt).
- Documentación y materiales: [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt).

Detalle por ruta en `REUSE.toml` y en [docs/LICENSES.md](docs/LICENSES.md).
