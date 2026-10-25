# jwsim-cli — simulador sin interfaz (G5)

`jwsim-cli` compila, ejecuta y prueba sketches del JWPLC Basic sin Electron.
Corre en Linux (GCC del sistema) y en Windows (toolchain incluido:
`node scripts/fetch-toolchain.mjs`), localmente o en GitHub Actions.

```text
node cli/jwsim-cli.mjs build  <sketch_dir> [opciones de build]
node cli/jwsim-cli.mjs run    <sketch_dir> [opciones de build] -- [opciones del runner]
node cli/jwsim-cli.mjs test   <archivo.jwtest.json|carpeta>... [opciones de build] [--record]
node cli/jwsim-cli.mjs parity [<ref>] [--package <dir>] [--update]
node cli/jwsim-cli.mjs matrix [--filter <texto>] [opciones de build]
node cli/jwsim-cli.mjs device build|test|pack <carpeta>          (G7)
node cli/jwsim-cli.mjs device install <tipo>[@versión] [--index <url|archivo>]
node cli/jwsim-cli.mjs device list [--index <url|archivo>]
```

## Opciones comunes

| Opción | Efecto |
|---|---|
| `--json` | Un único objeto JSON en stdout al terminar; los mensajes de compilación van a stderr. |
| `--report <archivo>` | Guarda el mismo objeto JSON en un archivo (con o sin `--json`). |
| `--target native\|windows` | Destino del ejecutable. `windows` desde Linux genera el `.exe` (MinGW). |
| `--package <dir>` | Usa un checkout de platform-jwplc en lugar del fijado en `package.lock` (sin verificar el commit). Es lo que usa el CI del package. |
| `--out <dir>` | Carpeta del build (`build`, `run`) o raíz de los builds de prueba (`test`). |
| `--cc gcc\|clang`, `--board <id>` | Compilador y placa (por defecto `gcc` y `jwplcbasic`). |

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | Bien: compiló, la simulación terminó normalmente, todas las pruebas pasan, sin diferencias de paridad. |
| 1 | `test`, `parity` o `matrix` con fallas (el JSON dice cuáles y por qué). |
| 2 | Uso incorrecto (comando, opción o archivo de prueba inválido). |
| 3 | El sketch no compila (`diagnostics` con archivo, línea, columna y mensaje). |
| 4 | La simulación terminó mal: `FATAL`, vigilante de bucles (el runner sale con 70), caída. |
| 5 | Entorno: falta el toolchain o el package. |

## Comandos

### build

```json
{"command":"build","sketch":"…","target":"native","package":{"ref":"v2.1.0-alpha.13","commit":"…","root":"…"},
 "ok":true,"executable":"…","libraries":["JWPLC_Display", "…"],"wall_ms":8939,"exit_code":0}
```

Con error: `"ok":false`, `error` y `diagnostics` (`file`, `line`, `column`,
`severity`, `message`; las rutas del `.ino` son las originales).

### run

Compila y ejecuta. Lo que sigue a `--` va al runner (`--until <ms>`,
`--stim <archivo>`, `--set I0_0=1@100`, `--state <dir>`, `--rtc …`,
`--no-eth`; ver `sim/runner/main.cpp`). Sin `--json` la salida del runner pasa
tal cual. Con `--json`:

```json
{"command":"run","build":{…},"run":{"args":["--until","2000"],"exit":0,"wall_ms":63,
 "result":{"t_end_ms":"2000.000","stop":"time","DI":"0b00000001","DO":"0b00000001","trace_hash":"0x…"},
 "events":[{"t":1000,"kind":"DI","name":"I0_0","v":1},{"t":1000.5,"kind":"DO","name":"Q0_0","v":1},
           {"t":1129,"kind":"UART","port":0,"text":"…"}],
 "fatal":[]},"exit_code":0}
```

### test

Corre archivos `*.jwtest.json` (esquema `schema/jwsim-test-1.json`; una
carpeta se recorre entera). Cada prueba nombra el sketch, los estímulos y lo
que se espera de una o varias corridas:

```json
{
  "$schema": "../../../schema/jwsim-test-1.json",
  "sketch": "package:libraries/JWPLC_Display/examples/01.Display_IDLE_Status",
  "until_ms": 4000,
  "stim": ["1500 BTN_OK=1", "1600 BTN_OK=0"],
  "expect": {
    "console": ["^JWPLC Basic - Display IDLE$", { "match": "^ERR = TST$", "count": 1, "after_ms": 1500 }],
    "signals": [{ "at_ms": 2000, "Q0_0": 0, "DO": "0b00000000" }]
  }
}
```

- `sketch`: `package:<ruta>` (relativa a `JWPLC/2.1.0` del package),
  `package-repo:<ruta>` (relativa a la raíz de platform-jwplc) o una ruta
  relativa al archivo de prueba.
- `stim`: líneas `.stim` (`<ms> I0_0=1`, `<ms> BTN_OK=1`,
  `<ms> uart0 "texto\n"`, `<ms> force Q0_3=1`, `<ms> net …`) o un archivo
  `.stim` relativo.
- `args`: opciones extra del runner (`--rtc fijo:2026-01-01T08:00:00`, `--no-eth`).
- `faults` (G9): fallas inyectadas, cada una con `kind`, `at_ms` (0 por
  defecto) y opcionalmente `until_ms` (se quita en ese instante):
  `sd-absent` (microSD retirada), `rtc-battery` (RTC sin batería: solo al
  arrancar), `rs485-noise` (`rate` de 0 a 1 y `seed`) y, con escena,
  `stuck` (`device`, `value`), `welded` (`device`), `burnt` (`device`) y
  `open` (`wire`: "PS1.+V1 KM1.13"). Ejemplos en `tests/faults/`
  (ARCHITECTURE §4.2).
- `runs`: varias corridas seguidas con la memoria no volátil compartida
  (FRAM, NVS, SD, RTC); por ejemplo, contar arranques.
- `expect`:
  - `exit` (0 por defecto). Con 0 además se exige la línea `JWSIM_RESULT` y
    ninguna línea `FATAL`.
  - `console`: expresiones regulares sobre las líneas de la UART; con objeto se
    filtra por `port`, `after_ms`, `before_ms` y se cuenta con `count`, `min`
    o `max`.
  - `console_absent`: expresiones que no deben aparecer.
  - `signals`: estado de la bornera en `at_ms` (`DI`/`DO` como número, `0b…`
    o `0x…`; o señales sueltas como `Q0_3`).
  - `stderr` y `stderr_absent`: expresiones sobre stderr.
  - `result`: campos de `JWSIM_RESULT` (`stop`, `DI`, `DO`, `trace_hash`).
  - `screen`: la pantalla (ST7789) en `at_ms` contra un PNG de referencia
    relativo al archivo de prueba, píxel a píxel (`max_diff` píxeles
    tolerados). `jwsim-cli test --record` graba las referencias que faltan; si
    no coincide, la captura queda en `build/tests/work/<prueba>/`.

El JSON lista cada prueba con `ok`, la etapa (`build`, `expect`, `pass`) y,
por corrida, el código de salida, `JWSIM_RESULT` y las fallas. La salida
completa de una corrida fallida queda en `build/tests/work/<prueba>/`.

**Con escena (G7).** `scene` es un archivo de escena (`.json`), un proyecto
`.jwsim` (su campo `scene`) o la escena en línea. El runner corre en modo
puerto, co-simulado con la escena por horizontes (ARCHITECTURE §6.6).

- `actions`: acciones sobre dispositivos en instantes dados, por ejemplo
  `{"at_ms": 1000, "device": "S1", "action": "press", "value": true}`.
- `expect.scene`:
  - `state`: salidas o contactos de los dispositivos en `at_ms`, por
    ejemplo `{"at_ms": 1100, "KM1.closed": true, "M1.speed": 1}`;
  - `faults`: fallas en orden, por ejemplo `["short:PS1"]`;
  - `findings`: avisos del cableado, por ejemplo `["KM1.coil"]`.
- La consola, `signals` y `JWSIM_RESULT` (con `trace_hash`) se evalúan
  igual. La consola se fecha con precisión de 5 ms. `expect.screen` no está
  disponible con escena.

```json
{
  "sketch": "../sketches/g7_cosim",
  "scene": "../scenes/g7_cosim.scene.json",
  "until_ms": 3000,
  "actions": [{ "at_ms": 1000, "device": "S1", "action": "press", "value": true }],
  "expect": { "scene": { "state": [{ "at_ms": 1100, "KM1.closed": true }], "faults": [] } }
}
```

**Dispositivos nativos (G7).** `devices` carga bibliotecas del SDK en el
runner: `{"source": "<carpeta>", "params": {…}}` las compila desde sus
fuentes; `{"type": "autor/nombre"}` usa las instaladas del índice.

### device (G7)

SDK de dispositivos e índice comunitario ([docs/SDK.md](SDK.md)):

| Subcomando | Qué hace |
|---|---|
| `device build <carpeta>` | Nativo: compila la biblioteca (`.so`, `.dll`, `.dylib`) con el toolchain del simulador en `build/devices/<nombre>/`. De escena: valida el contrato. |
| `device test <carpeta>` | De escena: valida y corre sus `*.test.mjs` con `JWSIM_SDK` → `sdk/testing.mjs`. |
| `device pack <carpeta>` | Paquete `.tar.gz` reproducible con su SHA-256 y tamaño (para el índice). |
| `device install <tipo>[@versión]` | Instala desde el índice (`--index`, `JWSIM_INDEX` o el de GitHub). Verifica la firma Ed25519 del índice, el tamaño y el SHA-256 del paquete, las rutas del tar y el manifiesto. Si algo falla no instala nada; con `--json` el error trae `"security": true`. |
| `device list` | Dispositivos instalados en `~/.jwsim/devices` (`JWSIM_HOME`) y, con `--index`, los del índice. |

Códigos de salida: 0 bien; 1 falla (pruebas, compilación, firma o
integridad); 2 uso incorrecto.

### parity

`jwsim-cli parity [<ref>]` compara un árbol del package con el simulador (gate
`JWSIM_G5_RELEASE_TREE_PARITY`). `<ref>` es un tag o commit de platform-jwplc
(se clona en `.jwsim/package/<ref>/`); sin ref usa el fijado o `--package`.
Informa como lista:

- fuentes de `cores/jwcontrol` sin clasificar en `sim/core-manifest.json`, o
  clasificadas que ya no existen;
- headers que no se encuentran al preprocesar (`-M -MG`, con los flags reales)
  el core y todas las librerías del package salvo las no soportadas: un header
  de ESP-IDF nuevo aparece acá;
- cambios en las librerías que arrastra el autoload (sketch vacío) y en la
  lista de librerías del package, contra `sim/package-parity.json`.

`--update` registra el autoload y las librerías actuales (al sincronizar una
alpha, ARCHITECTURE §9).

### matrix

Cada ejemplo de las librerías `JW*`/`JWPLC_*` del package × (compila, corre,
pasa su prueba `tests/examples/<librería>/<ejemplo>.jwtest.json`) (gate
`JWSIM_G5_EXAMPLES_MATRIX`). Los que no compilan por un motivo ajeno al
simulador están en `tests/matrix-expectations.json`. Informe en
`build/gates/examples-matrix-<target>.{json,md}`; el workflow `g5-cli.yml` lo
publica como artefacto y `sim-regression.yml` en el resumen de la corrida.

`scripts/gen-example-tests.mjs` genera el borrador de la prueba de un
ejemplo nuevo (banner de consola); después se completa a mano con estímulos y
la reacción esperada.

## En GitHub Actions

- `.github/workflows/g5-cli.yml`: gates de G5 y matriz en `ubuntu-latest` y
  `windows-latest`.
- `.github/workflows/sim-regression.yml`: gate `SIM_REGRESSION` reutilizable
  (`workflow_call`) para el flujo de release de platform-jwplc; también a
  pedido con `package_ref`.

```yaml
jobs:
  sim-regression:
    uses: JW-Control/jwplc-sim/.github/workflows/sim-regression.yml@<ref de jwplc-sim>
  release:
    needs: sim-regression
```
