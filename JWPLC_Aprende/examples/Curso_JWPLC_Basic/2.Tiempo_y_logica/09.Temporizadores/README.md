# Curso JWPLC Basic · Lección 09 · Temporizadores

## Qué vas a aprender

- Los dos temporizadores más usados en un PLC:
  Retardo a la conexión (TON): la salida se activa cuando la entrada
  lleva cierto tiempo activa. Si la entrada se suelta antes, no pasa nada.
  Retardo a la desconexión (TOF): la salida se activa con la entrada y
  se queda activa cierto tiempo después de que la entrada se apaga.
- A agrupar datos y funciones con struct: cada temporizador guarda su
  estado y sabe "ejecutarse" con temporizador.ejecutar(...).
- Son los mismos TON y TOF de la Plantilla de proyecto (K_Utilidades.h).

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador. Hay que mantenerlo apretado 3 segundos para arrancar
  (evita arranques por un toque accidental).
- I0.1: sensor de presencia de un pasillo.

## Qué hace

- Q0.0 se cierra cuando I0.0 lleva 3 segundos apretado (TON).
- Q0.1, la luz del pasillo, se enciende con la presencia y se apaga
  10 segundos después de la última detección (TOF).

## Cómo probarlo

1. Toca I0.0 un segundo: no pasa nada. Mantenlo 3 segundos: cierra Q0.0.
2. Activa I0.1 y suéltalo: la luz sigue 10 segundos y se apaga. Si lo
   activas otra vez antes, los 10 segundos empiezan de nuevo.

## Para practicar

- Cambia los tiempos: el arranque a 2 segundos y la luz del pasillo a
  5 segundos.
- Agrega un tercer temporizador: una bocina en Q0.2 que suene si la
  presencia de I0.1 dura más de 30 segundos.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**.
2. En **Mandos** (panel **Reto**) da un toque corto a **S1 Arranque**: no pasa nada. Mantenlo apretado: a los 3 s se cierra `Q0.0`; al soltar, se abre.
3. Gira **B1 Presencia** y vuelve a girarlo: `Q0.1` (pasillo) se enciende y se apaga 10 s después de que se va la presencia.
4. Vuelve a activar **B1** antes de los 10 s: la cuenta empieza de nuevo.
