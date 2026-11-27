# Curso JWPLC Basic · Lección 24 · El escaneo de E/S: las 8 entradas de una vez

## Qué vas a aprender

- Cómo lee el equipo sus entradas: una foto de las 8 juntas, en segundo plano.
- JWPLC_IO.inputs(): las 8 entradas en un byte; setOutputs(): las 8 salidas.
- Operaciones con bits: & (máscara), ^ (qué cambió) y bitRead().
- Anotar cada cambio de cualquier entrada con un solo bucle.

## Qué conectar

- Borne 1M a 0 V.
- I0.0 e I0.1: pulsadores (NA). I0.2 e I0.3: finales de carrera B1 y B2
  (NA). Todos desde +24 V.
- Q0.0 a Q0.3: lámparas. Q0.4: lámpara de error (para practicar).

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Aprieta cualquier entrada de I0.0 a I0.3: su lámpara se enciende y el
   Monitor anota el cambio y el byte completo.

## Para practicar

- Al soltar una entrada, escribe cuánto estuvo activa, con un decimal:
  «I0.1 estuvo 1.2 s». Usa un arreglo de 8 tiempos.
- B1 y B2 son finales de carrera opuestos: no pueden estar activos a la vez.
  Si pasa, enciende Q0.4 y escribe una sola vez «Error: B1 y B2 a la vez».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) mantén apretado **S1**: **H1** se enciende y el Monitor anota «I0.0 ON».
3. Aprieta varias a la vez y mira cómo cambia el byte de «Entradas».
4. En **E/S y variables** mira **entradas** y **cambios** mientras aprietas.

```text
Lección 24: entradas I0.0 a I0.3, lámparas Q0.0 a Q0.3
  2.10 s  I0.0 ON
Entradas: 00000001
  3.40 s  I0.2 ON
Entradas: 00000101
  4.02 s  I0.0 OFF
Entradas: 00000100
```
