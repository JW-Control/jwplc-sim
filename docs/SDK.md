# SDK de dispositivos de JWPLC Sim

Gate `JWSIM_G7_DEVICE_SDK`. Hay dos clases de dispositivo:

| Clase | Lenguaje | Dónde corre | Para qué |
|---|---|---|---|
| **De escena** | TypeScript o JavaScript (módulo ES) | Motor de escena (`scene/`), en Node | Todo lo eléctrico y mecánico de un tablero: pulsadores, relés, sensores, actuadores, temporizadores. Se cablean borne a borne en la netlist. |
| **Nativo** | C o C++ (ABI C) | Dentro del runner, junto al firmware | Lo que necesita precisión de bit: trenes de pulsos, encoders, señales rápidas en las entradas de la placa. |

Las dos clases son deterministas: corren en tiempo virtual, sin reloj de
pared ni aleatorios sin semilla. Una corrida con la misma escena y las mismas
acciones da el mismo hash de traza.

Contenido del SDK:

```text
sdk/jwsim-device.d.ts                 contrato TypeScript de los dispositivos de escena
sdk/testing.mjs                       ayudas para probar un dispositivo de escena
sdk/native/jwsim_device.h             ABI C de los dispositivos nativos (versión 1)
sdk/template/scene-device/            plantilla de escena (TypeScript)
sdk/template/native-device/           plantilla nativa (C)
sdk/examples/timer-relay/             ejemplo publicado: relé temporizador (TypeScript)
sdk/native/examples/pulse-generator/  ejemplo publicado: generador de pulsos (C)
```

## 1. Manifiesto `jwsim-device.json`

Cada dispositivo es una carpeta con un manifiesto:

```json
{
  "type": "autor/nombre",
  "version": "1.0.0",
  "kind": "scene",
  "name": "Nombre legible",
  "description": "Qué hace",
  "license": "MIT",
  "author": "Autor",
  "entry": "device.mjs",
  "sdk": 1
}
```

- `type`: `autor/nombre` en minúsculas. El autor `jwsim` es de la biblioteca
  incluida.
- `version`: semver. Una escena guarda la versión que usó; el simulador toma
  la más nueva con la misma versión mayor.
- `kind`: `scene` (con `entry`, el módulo ES), `native` (con `sources`, las
  fuentes C/C++) o `example` (con `entry`, un proyecto `.jwsim`).
- `license`: identificador SPDX, obligatorio para publicar.

## 2. Dispositivos de escena (TypeScript)

El contrato está en [`sdk/jwsim-device.d.ts`](../sdk/jwsim-device.d.ts).
Un dispositivo exporta por defecto un `DeviceDefinition`:

```ts
const device: DeviceDefinition = {
  type: "autor/mi-dispositivo",
  version: "0.1.0",
  name: "Mi dispositivo",
  parameters: [{ id: "rating", type: "enum", options: ["24VDC", "230VAC"], default: "24VDC" }],
  terminals: [{ id: "A1" }, { id: "A2" }, { id: "13" }, { id: "14" }],
  // Elementos eléctricos según los parámetros (fijos durante la simulación).
  electrical: (p) => ({
    loads: [{ id: "coil", a: "A1", b: "A2", rating: p.rating, coil: true }],
    contacts: { "13-14": ["13", "14"] },
  }),
  create(ctx) {
    return {
      // Llamado cuando cambia algo de la escena o vence nextEventNs.
      update(t, inp) {
        const on = inp.loads.coil.on;
        return { contacts: { "13-14": on }, outputs: { energized: on } };
      },
    };
  },
};
export default device;
```

### 2.1 Modelo eléctrico

La netlist trabaja por conectividad (detalle en
[ARCHITECTURE §4.1](ARCHITECTURE.md#41-escena-dispositivos-y-netlist-g7)).
Un dispositivo declara:

- **fuentes** (`sources`): un polo positivo (`L+`/`L`) y un retorno
  (`M`/`N`), en CC o CA;
- **red trifásica** (`kind: "AC3"`, `phases: { L1, L2, L3 }`, `volts` entre
  fases): marca cada fase; una carga de dos bornes entre dos fases recibe
  la tensión entre fases.
- **fuentes controladas** (`controlled: true`): solo existen mientras el
  dispositivo las enciende con `DeviceStep.sources[id] = { on, hz, reverse }`
  (salida de un variador: frecuencia como `{ value, rate, goal }` y la
  secuencia invertida para girar atrás). Ejemplo: `vfd-el` en
  `scene/devices/vfd-el.mjs`;
- **equipos programables**: `ParameterSpec.group` agrupa los parámetros en
  el inspector (plegables), `presets` ofrece plantillas de taller
  (`{ id, label, description, params, keep }`: fábrica + `params`, sin tocar
  los de `keep`) y `DeviceStep.params` devuelve los parámetros que el propio
  equipo reprogramó (teclado, Modbus) para que la app los guarde en la
  escena. Ejemplo: `vfd-el`;
- **corriente**: una carga declara en `DeviceStep.currents` la corriente (A)
  que entra por cada borne (`{ U1: 2.72, V1: 2.72, W1: 2.72 }`), y un sensor
  (polos de un térmico, salida de un variador) declara
  `currentSensors(params)`: `[{ id, terminals }]`; en `update()`,
  `inp.currents[id][borne]` trae la suma de las corrientes de las cargas
  unidas a ese borne por cables y contactos cerrados de otros equipos (no
  los del propio sensor: cada polo ve solo lo que alimenta aguas abajo). La
  corriente se evalúa por eventos: si cambia con el tiempo (rampa, pico de
  arranque), el equipo pide un evento al terminar el tramo
  (`nextEventNs`). Modelo de los motores en `motorCurrent()`
  (`scene/devices/loads.mjs`): 6 × In al arrancar o con el rotor bloqueado
  y `In · (0,4 + 0,6 · carga)` en régimen. Ejemplos: `motor-3ph`,
  `overload-relay` y `vfd-el`;
- **esclavos Modbus configurables**: `modbusWrite` puede devolver un código
  de excepción (3: valor fuera de rango) y `modbusConfig()` la dirección o la
  velocidad que el equipo cambió en marcha (teclado del variador);
- **cargas trifásicas** (`phaseLoads: [{ id, terminals }]`): en `update()`,
  `inp.phases[id].terms[borne]` da la fase que llega (`L1`/`L2`/`L3` o
  `null`) y el nodo (`net`; dos bornes puenteados comparten nodo), y
  `inp.phases[id].volts` la tensión entre fases. Ejemplo: `motor-3ph`
  (`motorConnection()` en `scene/devices/loads.mjs`).
- **cargas** (`loads`): se energizan si un extremo está en el positivo y el
  otro en el retorno de la misma fuente. `rating` es la tensión nominal
  (`24VDC`, `230VAC`). Con más tensión la carga se quema y queda fuera hasta
  rearmar la escena; con menos, o con otro tipo de corriente, no se
  energiza. `polar: true` exige la polaridad (`a` al positivo). `coil: true`
  activa el aviso de "bobina sin alimentación";
- **contactos** (`contacts`): todos los posibles, con sus dos bornes. Cuáles
  están cerrados lo dice cada `update` en `DeviceStep.contacts`.

### 2.2 `update(t, inputs)`

Entradas (`DeviceInputs`):

| Campo | Contenido |
|---|---|
| `loads` | Estado de cada carga: `on`, `polarity` (1 / -1), `volts`, `kind`, `issue` |
| `links` | Enlaces mecánicos declarados en `links(params)` (activo / inactivo) |
| `actions` | Acciones del usuario declaradas en `actions` (pulsar, posición) |
| `signals` | Señales de la placa declaradas en `signals.in` (p. ej. `Q0_0`) |
| `wired` | Bornes propios que tienen algún cable |
| `tripped` | La fuente propia disparó (cortocircuito, cruce) |

Salida (`DeviceStep`): `contacts`, `outputs` y `nextEventNs`.

Reglas:

1. **Idempotente en el mismo instante.** La escena repite `update` con el
   mismo `t` hasta que nada cambia (punto fijo). Un retardo se programa
   comparando con el instante en que cambió la entrada, no contando
   llamadas. `Delay` y `Ramp` de [`scene/device-kit.mjs`](../scene/device-kit.mjs)
   ya lo resuelven.
2. **Horizonte propio.** Si algo va a cambiar sin que cambien las entradas
   (fin de un temporizador, fin de una carrera), se devuelve ese instante en
   `nextEventNs`. La escena despierta al dispositivo exactamente ahí y, con la
   placa, el runner se detiene en ese instante (§6.6).
3. **Magnitudes continuas como segmentos.** Una posición o una velocidad que
   varía se publica como `{ value, rate }` (pendiente en unidades por
   segundo). Así los sensores enlazados (`links`) conmutan en el instante
   exacto en que el valor entra en su rango, sin muestrear.

### 2.3 Enlaces mecánicos

Un fin de carrera o un sensor puede accionarse por la salida de otro
dispositivo. `links(params)` devuelve `[{ id, source: "Y1.position", min, max }]`;
el enlace está activo mientras el valor está en `[min, max]`. Si la salida
fuente es un segmento, la escena calcula los cruces exactos.

### 2.3.1 Lecturas numéricas

`reads(params)` devuelve `[{ id, source: "FER1.tMasa" }]`: en cada `update`
el dispositivo recibe en `inputs.values[id]` el valor de esa salida (los
booleanos como 0/1; un segmento, en el instante actual). Es una lectura sin
cable: sirve para enlaces que no se cablean en la realidad. Lo que en la
planta va por cable (una sonda a su transmisor) se modela con §2.3.3.

Un equipo sin bornes (`terminals: []`) debe ir en la categoría «Planta»:
lo mueve lo que lee y actúa sobre los sensores por sus salidas (ejemplos en
`scene/devices/plant.mjs`). Una salida puede ser una lista de números
(`number[]`, p. ej. las piezas de una cinta); se informa tal cual, sin
interpolar.

### 2.3.3 Sondas por cable

Un bloque de planta declara sus elementos sensores con
`probes(params)`: `[{ id, kind, terminals, output }]` (p. ej. la PT100 de la
masa: `kind: "pt100"`, tres bornes y la salida `tMasa`). Un transmisor
declara sus entradas con `probeInputs(params)`: `[{ id, kind, terminals }]`.
En cada `update`, `inputs.values[id]` trae el valor de la sonda del mismo
`kind` cuyos bornes estén unidos por cables activos a los de la entrada,
**uno con uno y en orden**; si falta o se corta un cable (falla `open`), o
los hilos están cruzados, llega `NaN` y el transmisor la ve abierta.
Ejemplos: `jwsim/fermentador` (sondas `pt100`, `ph` y `atc`) y los
transmisores `pt100-rs485` y `ph-rs485` en `scene/devices/process.mjs`.
Las señales analógicas de campo usan el mismo mecanismo
(`scene/devices/analog.mjs`): `pot` (potenciómetro, bornes extremo-cursor-
extremo, valor 0 a 1), `0-10V` (V) y `4-20mA` (mA). La entrada AVI del
`vfd-el` declara las cuatro (`pot` en los dos sentidos, para que un
potenciómetro con los extremos cruzados gire al revés).

### 2.3.2 Esclavo Modbus RTU (bus RS-485)

`modbus(params)` devuelve `{ address, baud, responseMs }` y la instancia
implementa `modbusRead(table, start, count, t)` (`"holding"` o `"input"`;
`undefined` = no responde, `null` = excepción 02) y, si acepta escrituras,
`modbusWrite(start, values, t)`. El dispositivo tiene bornes `A` y `B`: la
escena le pasa las tramas del PLC (UART 2, maestro) solo si está cableado a
`plc.RS485_A` y `plc.RS485_B` (A con A), con la misma velocidad (8N1) y sin
falla `burnt`. Responde con su demora y el CRC; si dos responden con la
misma dirección, la escena registra un choque. Ejemplos:
`scene/devices/process.mjs` (transmisores PT100 y pH) y ARCHITECTURE §4.4.

### 2.4 Señales de la placa

`signals.in` lista las salidas del firmware que el dispositivo lee (las
recibe en `inputs.signals`); `signals.out`, las entradas de la placa que
maneja (las publica en `outputs`). La placa JWPLC Basic de la escena lee
`Q0_x` y maneja `I0_x` así.

### 2.5 Probar

```sh
tsc -p tsconfig.json                 # device.mts → device.mjs
jwsim-cli device test <carpeta>      # valida el contrato y corre *.test.mjs
```

`jwsim-cli device test` corre los `*.test.mjs` con `JWSIM_SDK` apuntando a
[`sdk/testing.mjs`](../sdk/testing.mjs):

```js
const { sceneWith, ms } = await import(process.env.JWSIM_SDK);
const s = sceneWith(device, ["PS:power-24vdc", "KT:jwcontrol/timer-relay"], ["PS.+V1 - KT.A1", "KT.A2 - PS.-V1"]);
s.advanceTo(ms(3000));
assert.equal(s.output("KT", "closed"), true);
```

Ejemplo completo: [`sdk/examples/timer-relay`](../sdk/examples/timer-relay)
(relé temporizador a la conexión y a la desconexión, IEC 61812).

## 3. Dispositivos nativos (ABI C)

La ABI está en [`sdk/native/jwsim_device.h`](../sdk/native/jwsim_device.h).
La biblioteca exporta `jwsim_device_entry()`, que devuelve la descripción:

```c
static const jwsim_device_desc DESC = {
    JWSIM_DEVICE_ABI, "autor/nombre", "1.0.0", "Nombre", create, watch, on_signal, destroy,
};
JWSIM_DEVICE_EXPORT const jwsim_device_desc *jwsim_device_entry(void) { return &DESC; }
```

| Función | Uso |
|---|---|
| `create(host, params_json)` | Crea la instancia; los parámetros llegan como JSON plano (`jwsim_param_num`, `jwsim_param_str`) |
| `watch(dev)` | Señales que vigila, separadas por comas (`"Q0_0,Q0_1"`) |
| `on_signal(dev, name, level, t)` | Cambio de una señal vigilada, en el instante virtual exacto |
| `destroy(dev)` | Libera la instancia |

Funciones del host (`jwsim_host`): `now`, `signal_get`, `signal_set` (maneja
una entrada de la placa en el instante actual, como un estímulo),
`schedule(at, fn, dev)` (llamada en un instante virtual) y `log`.

Compilar y usar:

```sh
jwsim-cli device build <carpeta>     # biblioteca .so/.dll/.dylib en build/devices/<nombre>/
<sketch> --device build/devices/<nombre>/<nombre>.so --device-params '{"hz": 100}'
```

En un `*.jwtest.json`: `"devices": [{ "source": "<carpeta>", "params": {…} }]`
(se compila desde las fuentes) o `{ "type": "autor/nombre" }` (instalado del
índice).

Ejemplo completo: [`sdk/native/examples/pulse-generator`](../sdk/native/examples/pulse-generator).
Mientras `Q0_0` está en 1 mete `hz` pulsos por segundo en `I0_7`. La prueba
[`tests/scene/g7_dispositivo_nativo.jwtest.json`](../tests/scene/g7_dispositivo_nativo.jwtest.json)
cuenta 100 flancos en 1 s.

> El core del package escanea las entradas cada 20 ms
> (`getJWPLCIoScanPeriod_ms`, función débil). Con pulsos más rápidos que el
> doble de ese período, el sketch no los ve (aliasing), igual que en la placa.
> El sketch de la prueba acorta el escaneo a 1 ms.

Limitación: tras `esp_restart()` el runner es un proceso nuevo y los
dispositivos nativos arrancan de cero.

## 4. Publicar en el índice comunitario

Gate `JWSIM_G7_COMMUNITY_INDEX`. El índice sigue el modelo del Boards
Manager de Arduino y del VPP de JW Control:

- [`index/jwsim_index.json`](../index/jwsim_index.json): por cada paquete,
  su tipo, clase, licencia y versiones. Cada versión tiene la URL del
  `.tar.gz` (relativa al índice), su `SHA-256` y su tamaño.
- `index/jwsim_index.json.sig`: firma Ed25519 de los bytes exactos del índice,
  `{"key", "algorithm": "ed25519", "signature"}`.
- Claves de confianza: [`cli/keys/*.pem`](../cli/keys), incluidas en el
  simulador (no se descargan con el índice).

Al instalar (`jwsim-cli device install autor/nombre[@versión]`) se verifica,
en orden:

1. la firma del índice con una clave de confianza;
2. el tamaño y el SHA-256 del paquete;
3. el contenido del tar: solo archivos y carpetas, sin rutas absolutas ni
   `..`;
4. que el manifiesto coincida con la entrada del índice (tipo, versión y
   clase);
5. que el dispositivo compile (nativo) o cumpla el contrato (de escena).

Si algo falla, no queda nada instalado. Lo instalado va a `~/.jwsim/devices/`
(`~/.jwsim/examples/` para los ejemplos; `JWSIM_HOME` cambia la raíz).

Publicar una versión (JW Control):

```sh
# 1. agregar la carpeta del paquete a index/sources.json
node scripts/index-build.mjs           # empaqueta en index/packages y escribe el índice
node scripts/index-sign.mjs --key <privada.pem>   # firma y verifica con cli/keys
git add index && git commit            # el índice se sirve desde GitHub (raw)
```

Una versión publicada no cambia: si el contenido cambia, `index-build`
exige subir la versión. La clave privada no se versiona. En CI va como
secreto `JWSIM_INDEX_SIGNING_KEY`. Un par nuevo se genera con
`node scripts/index-sign.mjs --keygen <carpeta> --id <id>`.

URL por defecto del índice:
`https://raw.githubusercontent.com/JW-Control/jwplc-sim/main/index/jwsim_index.json`
(`--index` o `JWSIM_INDEX` usan otro, incluso un archivo local).
