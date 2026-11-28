# Ejercicios y calificación automática (G9)

JWPLC Sim trae ocho ejercicios de automatización con su escena cableada,
enunciado y calificación automática. Están pensados para clases y talleres:
el alumno programa el JWPLC Basic y el simulador le dice qué está bien, qué
está mal y en qué instante.

| N.º | Ejercicio | Nivel | Qué enseña |
|---|---|---|---|
| 01 | Marcha y parada con enclavamiento | 1 | Autorretención, prioridad de la parada, por qué la parada es NC (falla segura) |
| 02 | Inversión de giro | 1 | Enclavamiento entre contactores, paso obligado por parada, cortocircuito si fallan |
| 03 | Semáforo | 1 | Tiempos con `millis()` sin bloquear el programa |
| 04 | Llenado de tanque por niveles | 2 | Histéresis entre dos sensores |
| 05 | Portón automático | 2 | Máquina de estados, finales de carrera, sensor de seguridad que invierte el movimiento |
| 06 | Arranque estrella-triángulo | 2 | Secuencia temporizada con pausa obligatoria entre contactores |
| 07 | Cinta con contador de lote | 2 | Detección de flanco y contador |
| 08 | Alarma con reconocimiento | 3 | Secuencia de alarma: bocina, parpadeo, reconocimiento y memoria |
| 10 | Secuencia electroneumática de 4 cilindros | 3 | Secuencia A+ B+ B− A− C+ D+ D− C− con finales de carrera de rodillo, vigilancia por tiempo, pausa y reset con los botones del frente; aire de un compresor con presostato y una unidad FR (vista «Neumático») |

## Uso

**En la app.** El menú **Ejercicios…** copia el ejercicio a la carpeta de
trabajo (`Ejercicios/<id>`, sin la solución) y lo abre: el sketch de
plantilla en el editor, la escena cableada y la pestaña **Ejercicio** con el
enunciado. **Calificar** guarda el sketch, lo compila, lo corre con la
escena en cada caso de la rúbrica y muestra la nota (0 a 20) con el detalle
de cada verificación: qué falló y en qué instante. Si el ejercicio ya estaba
copiado, al abrirlo de nuevo se ponen al día los archivos que el alumno no
tocó (plantilla, enunciado, rúbrica); lo que editó se conserva
(`.jwsim-ejercicio.json` guarda el hash de cada archivo copiado; prueba en
`tests/app/exercise_copy_test.mjs`).

**En la línea de comandos:**

```text
node cli/jwsim-cli.mjs grade JWPLC_Aprende/extras/retos/01-marcha-parada            # el sketch del proyecto
node cli/jwsim-cli.mjs grade JWPLC_Aprende/extras/retos/01-marcha-parada mi_sketch  # otro sketch
node cli/jwsim-cli.mjs grade JWPLC_Aprende/extras/retos/01-marcha-parada --solution # la solución de referencia
node cli/jwsim-cli.mjs grade JWPLC_Aprende/extras/retos/01-marcha-parada mi_sketch --runs 100 --json
```

Código de salida: 0 calificado (con `--runs`, misma nota en todas), 1 notas
distintas entre corridas, 3 el sketch no compila.

## Objetivos en vivo

Además de la nota, un ejercicio puede traer **objetivos en vivo** (sección
`goals` de `rubrica.json`; por ahora en los ejercicios 01 y 09). En la
pestaña **Reto** del panel derecho del esquema eléctrico (la bandera, junto a
Equipos y Propiedades; se abre sola con el ejercicio), mientras la simulación
corre y el alumno opera la escena a mano, cada objetivo muestra la lectura de sus señales, lo que se
pide y una barra que se llena mientras la condición se sostiene (en tiempo
simulado). El reto queda completo cuando se cumplen todos los obligatorios
en la misma corrida; al volver a ejecutar se reinician. No cambian la nota:
esa sigue saliendo de **Calificar**.

```json
"goals": [
  { "id": "arranca", "description": "Pulse S1: el motor arranca y sigue en marcha al soltarlo",
    "when": { "KM1.closed": true, "M1.running": true }, "hold_ms": 2000 },
  { "id": "para", "description": "Pulse S0: el motor se detiene",
    "when": { "KM1.closed": false }, "after": "arranca", "hold_ms": 1500 },
  { "id": "nivel", "description": "Mantiene el nivel entre 60 y 80 %",
    "when": { "T1.nivelPct": [60, 80] }, "hold_ms": 5000, "extra": "merit" }
]
```

- `when`: señal → valor (igualdad; `true` = 1) o `[min, max]` (rango
  cerrado). Las claves son las de los `cases`: `I0_k`, `Q0_k` y
  `<equipo>.<salida>`.
- `hold_ms`: cuánto tiene que sostenerse (0: basta un instante).
- `after`: no empieza a contar hasta que se cumpla ese objetivo anterior.
- `extra`: `merit` o `distinction`; se muestran, pero no impiden completar.
- `console` (en lugar de `when` o junto con él): expresión regular; se
  cumple con una línea del Monitor Serie que coincide. La expresión no se
  muestra al alumno: la `description` dice qué se espera.
- `period`: una señal (`"Q0_0"`) o `{ "console": "…" }` que se repite con un
  ritmo: `cycle_ms`, `on_ms` u `off_ms` (`[min, max]`) y `cycles` (3 por
  defecto). La barra cuenta los ciclos buenos seguidos.
- `hint`: pista que el alumno puede abrir mientras no lo logra. `why`: qué
  enseña, se muestra al lograrlo.

Lógica en `app/lib/goals.mjs` (pruebas en `tests/app/goals_test.mjs`);
prueba de la interfaz en `app/tests/e2e-objetivos.mjs`.

## Centro de aprendizaje y ficha del reto

En **Proyectos** (y en Archivo → Centro de aprendizaje…) los ejercicios se
ordenan por nivel: 1 · Fundamentos, 2 · Secuencias y procesos, 3 · Alarmas
y procesos continuos. Un nivel se abre al terminar todos los retos del
anterior; dentro de un nivel abierto se hacen en cualquier orden. El
siguiente sugerido lleva «A continuación», los terminados un visto y los
bloqueados un candado. La casilla «Desbloquear todos los niveles (docente)»
o `JWSIM_UNLOCK_ALL=1` abren todo.

Un reto queda hecho al cumplir sus objetivos en vivo o al sacar 14 o más
con **Calificar** (se guarda la mejor nota). Entonces se muestra **qué
enseña** y el botón **Siguiente reto →**. El progreso se guarda en
`aprendizaje.json`, en la carpeta de datos de la app.

Al abrir un ejercicio, la pestaña **Reto** del panel derecho muestra su
ficha: el objetivo, los pasos y las señales y equipos con que se trabaja.
**Empezar** la pliega (también se pliega sola al ejecutar, para que se vean
los objetivos) y **Ver ficha del reto** la vuelve a abrir. Abajo, la pestaña
**Ejercicio** queda para Calificar y el enunciado completo. La ficha
está en el `.jwsim`:

```json
"exercise": { "level": 1, "rubric": "./rubrica.json",
  "brief": { "goal": "…", "steps": ["…"], "uses": ["I0_0 · S1, pulsador NA verde: Marcha"], "teaches": "…" } }
```

Lógica en `app/lib/learning.mjs` (pruebas en `tests/app/learning_test.mjs`);
prueba de la interfaz en `app/tests/e2e-aprender.mjs`.

## Formato

Cada ejercicio es una carpeta con un proyecto `.jwsim` (ARCHITECTURE §8):

```text
JWPLC_Aprende/extras/retos/01-marcha-parada/
  01-marcha-parada.jwsim     proyecto: escena cableada y campo "exercise"
  ENUNCIADO.md               enunciado (Markdown)
  rubrica.json               casos y verificaciones (schema/jwsim-rubric-1.json)
  sketch/marcha_parada/      plantilla para el alumno
  solucion/marcha_parada/    solución de referencia (20/20)
```

```json
"exercise": { "level": 1, "statement": "./ENUNCIADO.md", "rubric": "./rubrica.json", "solution": "./solucion/marcha_parada" }
```

### Rúbrica

Cada **caso** es una co-simulación del sketch con la escena: acciones sobre
los equipos (como en las pruebas `.jwtest.json`) y fallas inyectadas
(`faults`, ARCHITECTURE §4.2) en instantes dados. Los botones del frente
de la placa no son equipos de la escena: se pulsan con `stim`, líneas en el
formato `.stim` (`"stim": ["1000 BTN_OK=1", "1100 BTN_OK=0"]`, ejercicio 10).
Cada **verificación** es
una tabla de verdad temporizada sobre la traza:

| Verificación | Se cumple si… |
|---|---|
| `at_ms` + `expect` | en ese instante todas las claves tienen su valor |
| `from_ms`/`to_ms` + `always` | se cumplen durante todo el intervalo |
| `from_ms`/`to_ms` + `never` | nunca se cumplen todas a la vez (enclavamientos) |
| `from_ms`/`to_ms` + `eventually` (+ `for_ms`) | se cumplen en algún instante del intervalo (y se sostienen al menos `for_ms`) |
| `console` (+ `from_ms`/`to_ms`) | una línea de la consola coincide con la expresión regular |
| `no_faults` (+ `from_ms`/`to_ms`) | la escena no registra fallas eléctricas (cortocircuito, sobretensión) |
| `period` + `cycle_ms`/`on_ms`/`off_ms` (+ `cycles`, `from_ms`/`to_ms`) | los últimos `cycles` ciclos de la señal (o de una línea de la consola, `{ "console": "…" }`) tienen ese ritmo |
| `responds` (`{ "when", "expect" }`) + `within_ms` | cada vez que `when` pasa a cumplirse, `expect` se cumple dentro del plazo (detecta un `delay()` que bloquea) |

Las claves son señales de la placa (`Q0_0`, `I0_2`) o salidas de los equipos
de la escena (`KM1.closed`, `H1.lit`, `M1.running`, `M1.direction`,
`HA1.sounding`, `B0.detecting`). Cada verificación vale `points` (1 por
defecto); la nota es 20 × puntos obtenidos / puntos totales, con un
decimal.

Una verificación con `"prerequisite": true` es un **requisito** del caso:
si falla, las demás del caso no suman. Así un programa vacío no aprueba
"nunca arranca con los dos pulsados" sin haber arrancado nunca.

```json
{
  "name": "Prioridad de la parada",
  "until_ms": 3000,
  "actions": [{ "at_ms": 1400, "device": "S0", "action": "press", "value": true }, "…"],
  "checks": [
    { "description": "Con los dos pulsados no arranca", "points": 2, "from_ms": 1400, "to_ms": 2400, "never": { "KM1.closed": true } },
    { "description": "Sin la parada pulsada, marcha arranca (requisito)", "points": 1, "prerequisite": true, "at_ms": 2700, "expect": { "KM1.closed": true } }
  ]
}
```

### El panel web en la rúbrica (JWPLC_Web, alpha.19)

Para un programa con `JWPLC_Web`, la rúbrica puede usar un **usuario del panel**
(`scene/web-user.mjs`), que hace lo mismo que una persona con el celular, por
HTTP sobre la red de la escena: lee de la consola el código de primer ingreso,
reclama el equipo como administrador y mira `/api/vivo` cada 250 ms. Se activa
solo cuando la rúbrica nombra `WEB` (o trae `"web": { "user", "password", "pollMs" }`).

| En la rúbrica | Qué es |
|---|---|
| `{ "at_ms": 9000, "device": "WEB", "action": "write", "id": "meta", "value": 3 }` | cambia una variable publicada (`POST /api/escribir`) |
| `{ "at_ms": 13800, "device": "WEB", "action": "ack", "id": "atasco" }` | reconoce una alarma (`POST /api/reconocer`) |
| `WEB.<id>` | valor de la variable publicada que ve el panel |
| `WEB.alarma.<id>`, `WEB.reconocida.<id>` | alarma activa y reconocida (0 o 1) |
| `WEB.sesion` | 1 con la sesión abierta |
| `WEB.respuesta` | estado HTTP de la última escritura (200, 400 fuera de rango, 403 sin permiso) |

La red tarda unos 8 s virtuales en estar lista (DHCP): las acciones `WEB` van
desde los 9 s. Solo en el calificador: en la app el panel lo abre el
navegador de la PC por el puente de red. Ejemplos: prácticas `curso-49` a
`curso-51`.

### Consejos para escribir una rúbrica

- El firmware tarda unos 720 ms en arrancar (setup del package): las
  acciones empiezan a partir de 1 s.
- Verifique en instantes con margen: un relé de la placa tarda 10 ms y un
  contactor 20 ms en atraer.
- Para una pausa entre contactores use `eventually` con `for_ms`: los
  tiempos de atraque y caída ya dejan un hueco de unos milisegundos aunque
  el programa no haga pausa.
- Agregue errores típicos en `tests/grading/` con su ejercicio en
  `variantes.json`: el gate exige que saquen nota parcial.

## Determinismo

La traza de la co-simulación no depende del reloj ni del azar: el mismo
sketch saca la misma nota con el mismo detalle en cualquier corrida
(gate `JWSIM_G9_AUTOGRADING`: 100 corridas con el mismo resultado y el
mismo hash de traza por caso).

## Verificación

```text
node scripts/gate-g9-exercises.mjs          # JWSIM_G9_EXERCISES y JWSIM_G9_AUTOGRADING
xvfb-run -a node app/tests/e2e-g9.mjs       # la app (Linux sin pantalla)
```

Los ejercicios tienen licencia MIT (REUSE.toml) para que alumnos y docentes
copien plantillas, soluciones y rúbricas.

## Prácticas evaluadas del curso

Cada lección del Curso JWPLC Basic puede traer una práctica evaluada en
`JWPLC_Aprende/extras/practicas/curso-NN/` (hoy, las 11 lecciones de las
Unidades 1 y 2). Tiene el mismo formato que un reto, con dos diferencias:

- El `.jwsim` es un **banco** pequeño (placa, fuente y los pulsadores,
  selectores y pilotos que usa la lección) y su `exercise` trae
  `"lesson": "curso-NN"`.
- El sketch de partida (`sketch/`) es el ejemplo de la lección tal cual
  (lo comprueba `tests/app/aprende_test.mjs`). Las tareas de «Para
  practicar» son los objetivos en vivo de `rubrica.json`. Para temporizadores hay
  objetivos de retardo (`delay` + `delay_ms`): miden cuánto tarda una salida
  desde que se cumple una condición.

En la app, la lección se abre con su banco: la **guía** de la lección (su
`README.md`: qué vas a aprender, qué conectar, cómo probarlo) a la izquierda
del código en Programa y en la pestaña Teoría del esquema, y los
**objetivos** en el panel derecho. «Para practicar» no se repite en la guía:
son esos objetivos. Una lección sin práctica también muestra su guía junto
al código. La lección
queda hecha solo al cumplir sus objetivos en una corrida; Calificar sirve
para ver el detalle, pero no la marca.

La rúbrica mira E/S y consola, no el lenguaje: `jwsim-cli grade` y Calificar
aceptan también un proyecto del OpenPLC Editor (`project.json`; Ladder, ST…).
Las soluciones IEC van en `solucion/<nombre>` junto a la de C++ (por ahora
`curso-03/solucion/leer_entrada_st`, en ST).

```text
node scripts/gate-practicas.mjs                 # JWSIM_PRACTICAS
xvfb-run -a node app/tests/e2e-practicas.mjs    # la app
```
