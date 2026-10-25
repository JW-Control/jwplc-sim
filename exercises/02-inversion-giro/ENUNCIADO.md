# Ejercicio 2 · Inversión de giro con enclavamiento

**Nivel 1.** Un motor de 24 VDC que gira en los dos sentidos: KM1 lo alimenta con una polaridad y KM2 con la invertida. Si los dos contactores cierran a la vez, la fuente queda en cortocircuito.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | S1, pulsador NA | Giro a la izquierda |
| I0_1 | S2, pulsador NA | Giro a la derecha |
| I0_2 | S0, pulsador NC | Parada (1 = sin pulsar) |
| Q0_0 | KM1, contactor | Motor a la izquierda |
| Q0_1 | KM2, contactor | Motor a la derecha |
| Q0_2 | H1, piloto amarillo | Motor en marcha |

## Qué debe hacer el programa

1. Con **S1** el motor gira a la izquierda (KM1) y queda enclavado; con **S2**, a la derecha (KM2).
2. **Parada** detiene el motor. Para cambiar de sentido hay que pasar por parada: con el motor girando, el pulsador del otro sentido no hace nada.
3. KM1 y KM2 **nunca** pueden estar cerrados a la vez (enclavamiento). Si se pulsan S1 y S2 juntos, no arranca ninguno.
4. El piloto H1 está encendido mientras el motor gira.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/02-inversion-giro` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
