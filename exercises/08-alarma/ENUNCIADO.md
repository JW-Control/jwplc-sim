# Ejercicio 8 · Alarma con reconocimiento

**Nivel 3.** Una alarma de proceso con la secuencia típica de reconocimiento. El presostato se acciona desde la escena.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | B1, presostato (interruptor NA) | Cerrado: presión alta (alarma) |
| I0_1 | S1, pulsador NA | Reconocer |
| Q0_0 | HA1, zumbador | Bocina |
| Q0_1 | H1, piloto rojo | Alarma |

## Qué debe hacer el programa

1. Al aparecer la alarma (B1 cerrado) suena la bocina **HA1** y el piloto **H1 parpadea** (0,5 s encendido, 0,5 s apagado).
2. **Reconocer** calla la bocina; si la alarma sigue presente, el piloto queda **fijo**.
3. Cuando la alarma desaparece **después** de reconocerla, el piloto se apaga.
4. Si la alarma desaparece **sin** reconocerla, la bocina y el parpadeo siguen hasta que se reconozca: nadie debe perderse una alarma que ya pasó.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/08-alarma` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
