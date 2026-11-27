# Prueba de recepción del JWPLC Basic

Comprueba un JWPLC Basic recién sacado de la caja: alimentación, carga por USB,
las 8 salidas a relé y las 8 entradas.

## Qué conectar

- 24 V DC: el positivo en **L+** y el negativo en **M**.
- El cable USB-C a la PC (de datos, no solo de carga).
- Para las entradas: **1M** a 0 V y un pulsador (o un puente) de +24 V a cada borne **I0.0 … I0.7**.

## Cómo probarlo

1. Pulse **⇪ Subir al JWPLC**, elija el puerto y pulse **Compilar y subir**.
2. Al arrancar, Q0.0 a Q0.7 se encienden de a una, dos vueltas. Cada relé debe
   sonar y su LED encenderse.
3. Active cada entrada: su salida queda encendida mientras la entrada esté en 1.
4. Cuando las 8 entradas se vieron encendidas, el Monitor Serie dice
   «PRUEBA COMPLETA».

Si la pantalla muestra ERR **IO**, las E/S no arrancaron: revise los 24 V.

## En JWPLC Sim

Pulse **▶ Ejecutar**: el barrido se ve en los LED de la Placa y las entradas
se activan con los botones I0.0 … I0.7.
