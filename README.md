# JWPLC Sim

Simulador de escritorio del PLC **JWPLC Basic** de JW Control: el sketch y
las librerías del package JWPLC se compilan **desde su código fuente** para
el PC contra un HAL nativo del Arduino core ESP32, con un motor de tiempo
virtual determinista y modelos de periféricos a nivel de registros.

```text
Estado: G0 (arquitectura + prueba técnica)
JWSIM_G0_ARCH_DOC=PASS
JWSIM_G0_LICENSE_MATRIX=PASS
JWSIM_G0_POC_IO_BASIC=PASS
Package fijado: platform-jwplc v2.1.0-alpha.12 (package.lock)
```

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md): capas, qué se reemplaza del core,
  formato `.jwsim`, interfaz de dispositivos, protocolo, modelo de tiempo,
  límites de fidelidad, sincronización con el package y hallazgos.
- [Gates](docs/GATES.md): G0 a G10 con criterios medibles.
- [Licencias](docs/LICENSES.md): matriz de dependencias y recomendación.
- [Informe de la prueba técnica G0](docs/reports/G0_POC_IO_BASIC.md).

## Prueba rápida (headless)

Requisitos: Node.js ≥ 20, git, y `gcc`/`clang` (Linux) o `zig` (Windows,
o compilación cruzada desde Linux con `--target windows` y `JWSIM_ZIG`).

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
