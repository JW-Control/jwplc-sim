# Curso JWPLC Basic · Lección 05 · Las 8 entradas y las 8 salidas

## Qué vas a aprender

- Qué es un arreglo: una lista de datos con un solo nombre.
- A leer las 8 entradas y escribir los 8 relés en una sola instrucción, con
  digitalReadBlock() y digitalWriteBlock().
- Qué es un byte: 8 bits, uno por cada entrada o salida.
- A recorrer los bits con el bucle for para mostrarlos en una sola línea.

## Las listas que ya trae el JWPLC

- I0_X[0] es I0_0, I0_X[1] es I0_1 ... I0_X[7] es I0_7.
- Q0_X[0] es Q0_0 ... Q0_X[7] es Q0_7.
- I0_COUNT y Q0_COUNT valen 8: cuántas entradas y salidas hay.
- Las posiciones de una lista se cuentan desde 0, no desde 1.

## Las funciones de bloque

- digitalReadBlock(I0_X) lee las 8 entradas a la vez y devuelve un byte:
  el bit 0 es I0.0, el bit 1 es I0.1 ... el bit 7 es I0.7.
- digitalWriteBlock(Q0_X, valor) escribe los 8 relés a la vez: el bit 0
  manda Q0.0 ... el bit 7 manda Q0.7.

## Qué conectar

- Borne 1M a 0 V y pulsadores o sensores en las entradas que quieras usar.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Cada entrada activa cierra el relé de su mismo número.
3. Cada medio segundo verás una línea como "Entradas: 1 0 0 1 0 0 0 0".

## Para practicar

- Cruza las salidas: I0.0 manda Q0.7, I0.1 manda Q0.6 ... (pista: un for
  con digitalWrite(Q0_X[7 - i], ...)).
- Cuenta cuántas entradas están activas y muestra el total.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**, a la derecha) gira cualquiera de los selectores **SA1** a **SA8**: el relé de su mismo número se cierra.
3. Cada medio segundo verás una línea con el estado de las 8 entradas:

```text
Lección 05: las 8 entradas y los 8 relés en un byte
Entradas: 0 0 0 0 0 0 0 0
Entradas: 1 0 0 0 0 0 0 0
Entradas: 1 0 0 1 0 0 0 0
```
