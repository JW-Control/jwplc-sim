# Curso JWPLC Basic · Lección 06 · Esperar sin detener el programa

## Qué vas a aprender

- Por qué delay() es un problema en una máquina: mientras espera, el
  programa no lee entradas ni atiende nada más.
- A usar millis(), el reloj interno que cuenta los milisegundos desde que
  el equipo arrancó, para hacer varias cosas "a la vez".

## La idea

- En lugar de "esperar 500 ms", el programa pregunta en cada vuelta:
  "¿ya pasaron 500 ms desde la última vez que cambié la luz?"
- Si pasaron, actúa y anota la hora. Si no, sigue con lo demás.
- loop() da miles de vueltas por segundo, así que nada queda esperando.

## Qué conectar

- Borne 1M a 0 V y un pulsador entre +24 V e I0.0.

## Qué hace

- Q0.0 parpadea cada medio segundo, sin parar.
- Q0.1 sigue al pulsador de I0.0 al instante, aunque Q0.0 esté parpadeando.

## Cómo probarlo

1. Sube el programa y mira el parpadeo de Q0.0.
2. Aprieta y suelta el pulsador: Q0.1 responde en el momento.
3. Compáralo con la lección 05, donde la salida tardaba en responder.

## Para practicar

- Haz que Q0.2 parpadee a otro ritmo (cada 2 segundos) con su propia
  variable de tiempo: verás dos intermitencias independientes.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: `Q0.0` parpadea cada medio segundo en la placa de la derecha.
2. En **Mandos** (panel **Reto**) aprieta y suelta **S1** varias veces, rápido: `Q0.1` responde en el momento, mientras `Q0.0` sigue con su ritmo.
3. Compáralo con la lección 05, donde la salida tardaba en responder.
