# Ejercicio 6 · Arranque estrella-triángulo

**Nivel 2.** El arranque estrella-triángulo reduce la corriente de arranque de un motor trifásico. En la escena el circuito de potencia está simplificado (el motor gira con KM1); lo que se califica es la secuencia de los tres contactores.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | S1, pulsador NA | Marcha |
| I0_1 | S0, pulsador NC | Parada (1 = sin pulsar) |
| Q0_0 | KM1, contactor | Línea |
| Q0_1 | KM2, contactor | Estrella |
| Q0_2 | KM3, contactor | Triángulo |
| Q0_3 | H1, piloto verde | En marcha |

## Qué debe hacer el programa

1. Con **marcha** cierran **KM1 (línea) y KM2 (estrella)**.
2. A los **3 s** abre KM2 y, tras una **pausa de 100 ms**, cierra **KM3 (triángulo)**. KM1 sigue cerrado.
3. KM2 y KM3 **nunca** pueden estar cerrados a la vez, ni siquiera un instante: la pausa entre ambos es obligatoria.
4. **Parada** abre los tres contactores.
5. El piloto H1 está encendido mientras el motor está en marcha.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/06-estrella-triangulo` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
