# Ejercicio 3 · Semáforo

**Nivel 1.** Un semáforo de una vía con tres pilotos. Es el primer ejercicio con tiempos: use `millis()`, no `delay()`, para que el programa siga atendiendo los pulsadores.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | S1, pulsador NA | Marcha |
| I0_1 | S0, pulsador NC | Parada (1 = sin pulsar) |
| Q0_0 | H1, piloto rojo | Luz roja |
| Q0_1 | H2, piloto amarillo | Luz ámbar |
| Q0_2 | H3, piloto verde | Luz verde |

## Qué debe hacer el programa

1. Con **marcha** empieza el ciclo en **verde 4 s**, luego **ámbar 1 s** y **rojo 4 s**, y vuelve a verde.
2. Nunca hay dos luces encendidas a la vez.
3. **Parada** apaga las tres luces en cualquier momento; marcha vuelve a empezar en verde.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/03-semaforo` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
