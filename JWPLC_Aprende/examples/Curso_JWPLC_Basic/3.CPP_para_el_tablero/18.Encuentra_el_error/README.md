# Curso JWPLC Basic · Lección 18 · Encuentra el error: depurar un programa

## Qué vas a aprender

- Un método para buscar errores: reproducir, observar, suponer y probar.
- Mirar variables mientras el programa corre (E/S y variables, en JWPLC
  Sim) o con mensajes por el Monitor Serie (en la placa).
- Detener el programa en una línea con un breakpoint, ver sus variables y
  avanzar paso a paso.

## El caso: una empacadora con dos errores

- Cada botella que pasa por el sensor se cuenta.
- Cada 6 botellas, el empujador da un golpe de medio segundo.
- El programa compila, pero tiene DOS errores a propósito. La lección te
  guía para encontrar el primero; el segundo es tu práctica.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: sensor de botellas (PNP o un pulsador que lo simule).
- Q0.0: electroválvula del empujador.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Pasa UNA botella (un toque a I0.0): el empujador ya golpea y el
   mensaje dice «Paquete listo: 6 botellas».
3. Sigue la lección para encontrar por qué.

## Para practicar

- Corrige el segundo error: con 6 botellas, el empujador golpea una y
  otra vez hasta que pasa la séptima.
- Cuenta los paquetes y escribe «Paquetes: N» en cada golpe.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) da UN toque a **B1 Botella**: **Y1** golpea enseguida y el mensaje dice que ya hay 6 botellas.
3. En la pestaña **E/S y variables**, escribe `botellas` en **Variables del sketch** y pulsa **Agregar**. Da otro toque a **B1** y mira cuánto sube.
4. En la misma pestaña, fuerza `I0.0` a **1** (columna **Forzar**): es como dejar una botella parada frente al sensor. Mira `botellas`: no deja de subir.
5. Haz clic en el margen, a la izquierda de la línea `botellas = botellas + 1;`: aparece un punto rojo (breakpoint). El programa se detiene en esa línea y la pestaña **Depuración** muestra las variables. Pulsa **Continuar** (F8): vuelve a detenerse en la vuelta siguiente, con la misma botella. Ahí está el primer error.
6. Quita el breakpoint (otro clic en el punto rojo) y pulsa **Liberar** en `I0.0`.

```text
Lección 18: sensor de botellas I0.0, empujador Q0.0
Paquete listo: 6 botellas
```
