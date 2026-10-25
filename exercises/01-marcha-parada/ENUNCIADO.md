# Ejercicio 1 · Marcha y parada con enclavamiento

**Nivel 1.** El circuito básico de cualquier tablero: un motor que arranca
con un pulsador y se detiene con otro.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | S1, pulsador NA verde | Marcha |
| I0_1 | S0, pulsador NC rojo | Parada (1 = sin pulsar) |
| Q0_0 | KM1, contactor | Motor M1 (230 VAC) |
| Q0_1 | H1, piloto verde | Motor en marcha |

## Qué debe hacer el programa

1. Al pulsar **marcha**, el motor arranca y **sigue en marcha al soltar** el
   pulsador (enclavamiento o autorretención).
2. Al pulsar **parada**, el motor se detiene.
3. Si se pulsan los dos a la vez, **gana la parada**: el motor no arranca.
4. El piloto H1 está encendido mientras el motor está en marcha.
5. La parada es un contacto **NC**: si se corta su cable, el motor también
   debe detenerse (falla segura). Piense por qué se usa NC y no NA.

## Cómo se califica

`jwsim-cli grade exercises/01-marcha-parada` (o el botón **Calificar** de
la app) corre su programa con la escena y comprueba, en instantes
precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20.
