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

## Uso

**En la app.** El menú **Ejercicios…** copia el ejercicio a la carpeta de
trabajo (`Ejercicios/<id>`, sin la solución) y lo abre: el sketch de
plantilla en el editor, la escena cableada y la pestaña **Ejercicio** con el
enunciado. **Calificar** guarda el sketch, lo compila, lo corre con la
escena en cada caso de la rúbrica y muestra la nota (0 a 20) con el detalle
de cada verificación: qué falló y en qué instante.

**En la línea de comandos:**

```text
node cli/jwsim-cli.mjs grade exercises/01-marcha-parada            # el sketch del proyecto
node cli/jwsim-cli.mjs grade exercises/01-marcha-parada mi_sketch  # otro sketch
node cli/jwsim-cli.mjs grade exercises/01-marcha-parada --solution # la solución de referencia
node cli/jwsim-cli.mjs grade exercises/01-marcha-parada mi_sketch --runs 100 --json
```

Código de salida: 0 calificado (con `--runs`, misma nota en todas), 1 notas
distintas entre corridas, 3 el sketch no compila.

## Formato

Cada ejercicio es una carpeta con un proyecto `.jwsim` (ARCHITECTURE §8):

```text
exercises/01-marcha-parada/
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
(`faults`, ARCHITECTURE §4.2) en instantes dados. Cada **verificación** es
una tabla de verdad temporizada sobre la traza:

| Verificación | Se cumple si… |
|---|---|
| `at_ms` + `expect` | en ese instante todas las claves tienen su valor |
| `from_ms`/`to_ms` + `always` | se cumplen durante todo el intervalo |
| `from_ms`/`to_ms` + `never` | nunca se cumplen todas a la vez (enclavamientos) |
| `from_ms`/`to_ms` + `eventually` (+ `for_ms`) | se cumplen en algún instante del intervalo (y se sostienen al menos `for_ms`) |
| `console` (+ `from_ms`/`to_ms`) | una línea de la consola coincide con la expresión regular |
| `no_faults` (+ `from_ms`/`to_ms`) | la escena no registra fallas eléctricas (cortocircuito, sobretensión) |

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
