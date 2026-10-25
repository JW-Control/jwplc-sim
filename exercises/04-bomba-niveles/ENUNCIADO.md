# Ejercicio 4 · Llenado de tanque por niveles

**Nivel 2.** Una bomba llena un tanque entre dos niveles. Los interruptores de nivel se accionan a mano desde la escena (en la realidad son flotadores).

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | B1, interruptor de nivel bajo | Cerrado: hay agua a la altura de B1 |
| I0_1 | B2, interruptor de nivel alto | Cerrado: tanque lleno |
| Q0_0 | KM1, contactor | Bomba M1 (230 VAC) |
| Q0_1 | H1, piloto rojo | Tanque bajo |

## Qué debe hacer el programa

1. Cuando el agua baja de **B1** (B1 abierto), la bomba arranca.
2. La bomba sigue funcionando aunque el agua pase B1 y **para recién cuando llega a B2** (B2 cerrado). Entre los dos niveles mantiene lo que venía haciendo (histéresis).
3. Con el tanque lleno y vaciándose, la bomba no arranca hasta que el agua baje de B1.
4. El piloto H1 está encendido mientras el agua esté por debajo de B1.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/04-bomba-niveles` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
