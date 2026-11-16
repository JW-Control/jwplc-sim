# Componentes propios (editor visual, hito 1)

Un **componente propio** es un equipo de planta que hace el usuario sin
programar: sube su dibujo (SVG), ubica los bornes, arma el modelo con
bloques y, si quiere, le da un mapa Modbus RTU por RS-485. Se guarda como
datos (`component.json`), no como código, así que abrir o compartir un
componente de terceros es seguro: las expresiones pasan por un analizador
propio (`scene/expr.mjs`, sin `eval`).

En la app: **Herramientas → Editor de componentes…** (o el botón en
*Dispositivos propios*). Ejemplo completo: `sdk/examples/hidroponia-nft`
(módulo hidropónico NFT con reservorio, bombas, flotador, 4-20 mA y sensor
pH/CE/temperatura por Modbus).

## El editor

| Pestaña | Qué se hace |
| --- | --- |
| **Dibujo** | Importar el SVG del autor. Los bornes y los indicadores se arrastran sobre el lienzo y se ajustan a la grilla de 20 px (mitad de arriba = borne arriba, mitad de abajo = borne abajo). |
| **E/S** | Agregar alimentación, entradas y salidas digitales, analógicas (0-10 V, 4-20 mA, PT100), lecturas de otro equipo y controles del panel (botón, selector, deslizador). Nombres de bornes y variables se proponen solos. |
| **Modelo** | Parámetros (lo que el usuario ajusta en Propiedades), variables de estado y bloques. Cada bloque muestra su fórmula. La vista **Diagrama del modelo** dibuja entradas → bloques → salidas; un clic en un bloque lo abre. |
| **Comunicación** | Modbus RTU esclavo: dirección, baudios, demora de respuesta y tabla de registros. Ethernet (Modbus TCP) es el hito siguiente. |
| **Probar** | Banco de pruebas sin armar una escena: marcar entradas, mover analógicas, ver tendencia, variables, bornes de salida y registros (también escribirlos). Velocidad ×1, ×10, ×60. |

**Guardar y usar en el Sim** valida, escribe la carpeta en la carpeta de
dispositivos propios, la vincula y recarga la biblioteca: el componente
aparece en la paleta de la escena como cualquier otro equipo.

## Carpeta que se genera

```
<autor>-<nombre>/
  jwsim-device.json   kind "scene", entry "component.json"
  component.json      el componente (formato jwcomp/1)
  art.svg             el dibujo original del autor
  symbol.svg          generado: dibujo + bornes + indicadores (contrato de docs/SIMBOLOS.md)
  README.md           generado
```

`node cli/jwsim-cli.mjs device test <carpeta>` lo valida igual que un
equipo programado.

Sin abrir la app (por ejemplo, cuando una IA escribe el `component.json`):

```
node cli/jwsim-cli.mjs device component <carpeta> [--link] [--try escenario.json]
```

valida, regenera `symbol.svg`, el manifiesto y el README, y con `--try`
corre un escenario en el banco. El escenario es una lista de pasos; las
entradas se mantienen de un paso al siguiente:

```json
[
  { "ms": 0 },
  { "ms": 60000, "digital": { "bomba": 1 } },
  { "ms": 1000, "write": [{ "table": "holding", "reg": 0, "value": 2.2 }] }
]
```

Para que una IA arme componentes guiada, la skill
`.claude/skills/crear-componente-jwplc/SKILL.md` explica el método paso a
paso (Claude Code la carga sola al abrir este repositorio).

## Formato `jwcomp/1`

```json
{
  "format": "jwcomp/1", "type": "autor/nombre", "version": "1.0.0", "name": "…",
  "category": "Planta", "author": "…", "description": "…", "stepMs": 200,
  "parameters": [{ "id": "tau", "label": "τ", "type": "number", "default": 60, "unit": "s", "group": "Modelo" }],
  "vars": { "consigna": 25 },
  "io": [ … ], "blocks": [ … ], "modbus": { … },
  "symbol": { "width": 340, "height": 240, "pins": { "B1": { "side": "t", "x": 40 } }, "widgets": [ … ] }
}
```

Todo número de un bloque o E/S puede ser un número o el **id de un
parámetro** (`"tau1": "tauPh"`). Los parámetros `stepMs`, `address`, `baud`
y `responseMs` se agregan solos.

### E/S (`io`)

| kind | Campos | Resultado |
| --- | --- | --- |
| `power` | `a`, `b`, `rating` | Carga eléctrica; sin tensión el equipo no responde (salidas en 0, Modbus calla). |
| `digital-in` | `var`, `a`, `b`, `rating` | Bobina/entrada: `var` vale 1 con tensión. |
| `digital-out` | `var`, `a`, `b` | Contacto que cierra con `var` > 0,5. |
| `analog-in` | `var`, `signal`, `a`, `b`, `min`, `max` | Lee 0-10 V / 4-20 mA / PT100 y escala a `min…max`. Bajo 3,6 mA vale NaN (lazo abierto). |
| `analog-out` | `var`, `signal`, `a`, `b`, `min`, `max` | Transmisor: entrega `var` como 0-10 V / 4-20 mA / PT100. |
| `read` | `var`, `source` (`equipo.salida`) o `sourceParam` | Lee la salida de otro equipo de la escena. |
| `control` | `var`, `control` (`button`, `switch`, `slider`), `min`, `max`, `default` | Control en el panel del equipo. |

Entradas arriba (`t`), salidas abajo (`b`), salvo que el autor las mueva.

### Bloques (`blocks`)

Se calculan en orden de dependencias; los lazos se cortan en los bloques
dinámicos (`tf`, `integrator`).

| block | Campos | Qué hace |
| --- | --- | --- |
| `tf` | `in`, `out`, `model`, `K`, `tau1…tau4`, `wn`, `zeta`, `theta`, `y0` | Función de transferencia (1.er a 4.º orden u oscilatorio) con tiempo muerto `theta`; discretización exacta ZOH. |
| `integrator` | `in`, `out`, `gain`, `min`, `max`, `y0` | Acumula `in` por segundo, con límites (nivel de un tanque). |
| `expr` | `out`, `expr` | Fórmula: `+ - * / % ^`, comparaciones, `&& \|\| !`, `c ? a : b`, `abs sqrt exp ln log10 sin cos tan min max round floor ceil sign pow clamp`, `pi e`. |
| `table` | `in`, `out`, `points` `[[x,y],…]` | Curva por puntos con interpolación lineal. |
| `compare` | `in`, `out`, `high`, `low`, `invert` | Umbral con histéresis (flotador, termostato). |
| `limit` | `in`, `out`, `min`, `max` | Satura. |
| `timer` | `in`, `out`, `mode` (`on`/`off`), `ms` | Retardo a la conexión o a la desconexión (con tiempo exacto). |

### Modbus RTU (`modbus`)

```json
{ "address": 3, "baud": 9600, "responseMs": 5,
  "input":   [{ "reg": 0, "var": "ph", "type": "int16", "scale": 100 }],
  "holding": [{ "reg": 0, "var": "ceConsigna", "type": "uint16", "scale": 100, "write": true, "min": 0, "max": 5 }],
  "coils":   [{ "bit": 0, "var": "alarma", "write": true }],
  "discrete":[{ "bit": 0, "var": "nivelBajo" }] }
```

Tipos `int16`, `uint16`, `int32`, `float32` (32 bits ocupan dos registros;
`swap` invierte las palabras). El valor del registro es `var × scale`.
Escribir un registro con `write` cambia la variable de estado (`vars`);
un registro que no existe responde la excepción 02 y un valor fuera de
`min…max`, la 03, como un equipo real.

### Indicadores (`symbol.widgets`)

`{ "kind": "value", "var": "ph", "x": 298, "y": 60, "decimals": 2, "unit": "pH", "label": "pH" }`
o `{ "kind": "lamp", "var": "bomba", "x": 30, "y": 200, "color": "#37d67a" }`.
Se ubican arrastrándolos en la pestaña Dibujo.

## Seguridad: componente declarativo frente a equipo programado

- **Declarativo (`component.json`)**: solo datos. Se puede abrir, importar y
  compartir sin riesgo. El SVG se limpia (sin `<script>`, `on…`, enlaces
  `javascript:` ni imágenes externas).
- **Programado (`device.mjs`, docs/SDK.md)**: es JavaScript que corre en la
  PC con los permisos del usuario. Conviene vincularlo solo desde el modo
  desarrollador.

## Pruebas

- Unitarias: `node --test scene/tests/component.test.mjs`
  (modelo de 1.er orden contra la solución analítica, 4-20 mA y lazo
  abierto, temporizadores, Modbus con escalas, float32, escritura y
  excepciones, integrador y tabla).
- De punta a punta en la app: `node app/tests/e2e-componentes.mjs`
  (en Linux sin pantalla, con `xvfb-run -a`). Informe en
  `build/gates/JWSIM_COMPONENTES_E2E.json` y capturas en
  `build/gates/componentes/`.

## Lo que sigue

1. **Hito 2:** RS-485 más allá del esclavo simple (varios esclavos en un
   bus, maestro Modbus en el componente, monitor de tramas).
2. **Hito 3:** Ethernet (Modbus TCP) con el W5500 del JWPLC.
3. **Hito 4:** vista 3D del componente (modelo glTF con piezas animadas por
   variables).
