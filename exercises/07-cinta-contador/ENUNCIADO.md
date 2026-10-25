# Ejercicio 7 · Cinta transportadora con contador de lote

**Nivel 2.** Una cinta lleva piezas metálicas hasta un sensor inductivo al final. Las piezas se simulan desde la escena (arrastrando la pieza frente al sensor).

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | S1, pulsador NA | Marcha / nuevo lote |
| I0_1 | S0, pulsador NC | Parada (1 = sin pulsar) |
| I0_2 | B1, sensor inductivo | Pieza al final de la cinta |
| Q0_0 | KM1, contactor | Motor de la cinta |
| Q0_1 | H1, piloto azul | Lote completo |

## Qué debe hacer el programa

1. **Marcha** arranca la cinta (enclavada); **parada** la detiene.
2. Cada pieza que llega al sensor **B1** cuenta **una sola vez**, aunque se quede frente al sensor (cuente el flanco de subida).
3. Con **3 piezas** la cinta para y se enciende el piloto **H1 (lote completo)**.
4. Con el lote completo, **marcha** apaga H1, empieza un lote nuevo desde cero y arranca la cinta.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/07-cinta-contador` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
