# Ejercicio 5 · Portón automático

**Nivel 2.** Un portón con motor de 24 VDC que abre y cierra invirtiendo la polaridad (como el ejercicio 2), dos finales de carrera y una barrera fotoeléctrica de seguridad. Los finales y el obstáculo se accionan desde la escena.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | S1, pulsador NA | Abrir |
| I0_1 | S2, pulsador NA | Cerrar |
| I0_2 | S0, pulsador NC | Parada (1 = sin pulsar) |
| I0_3 | B1, final de carrera NA | Portón abierto |
| I0_4 | B2, final de carrera NA | Portón cerrado |
| I0_5 | B3, sensor fotoeléctrico | Obstáculo en el paso |
| Q0_0 | KM1, contactor | Motor: abrir |
| Q0_1 | KM2, contactor | Motor: cerrar |
| Q0_2 | H1, piloto amarillo | Baliza de movimiento |

## Qué debe hacer el programa

1. **Abrir** mueve el portón hasta el final **B1**; **cerrar**, hasta **B2**. Cada final detiene el motor.
2. **Parada** detiene el portón donde esté.
3. Si la barrera **B3** detecta un obstáculo mientras el portón cierra, el portón se detiene y **vuelve a abrir**.
4. KM1 y KM2 nunca cerrados a la vez.
5. La baliza H1 está encendida mientras el portón se mueve.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/05-puerta` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba, en instantes precisos, el estado de las salidas y de los equipos. La nota va de 0 a 20; el detalle dice qué verificación falló y en qué instante.
