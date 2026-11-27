# Curso JWPLC Basic · Lección 25 · Proyecto: un contador de lotes con todo el equipo

## Qué vas a aprender

- Juntar en un programa la botonera, el buzzer, el reloj, la FRAM y la
  microSD.
- Repartir el trabajo en funciones con un nombre claro.
- Guardar los ajustes de la máquina para que sobrevivan a un corte.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: sensor de piezas (NA) desde +24 V.
- Q0.0: electroválvula del empujador. Q0.1: contactor de la cinta.
- Q0.2: lámpara «lote listo» (para practicar).
- Una tarjeta microSD en la ranura del equipo.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Cada pulso del sensor es una pieza; al juntar el lote, el empujador da
   un golpe de 1 segundo y el buzzer un pitido.
3. UP y DOWN cambian el tamaño del lote; ESC mantenido 2 s borra los
   contadores.
4. Corta la energía: al volver, todo sigue donde quedó.

## Para practicar

- Al completar un lote, la cinta se detiene y la lámpara de Q0.2 parpadea
  hasta que el operador aprieta OK: «Lote reconocido».
- A las 06:00:00 empieza otro turno: escribe «Cambio de turno: N lotes»,
  anótalo en la microSD y pon los lotes en 0.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. En esta práctica el reloj del Sim arranca a las **05:59:30**. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) da seis toques a **B1 Pieza**: **Y1** da su golpe y suena el pitido.
3. En la pestaña **Placa** aprieta **UP**: el lote pasa a 7 piezas.
4. Pulsa **Detener** y **Ejecutar**: el lote de 7 y las piezas siguen ahí.

```text
Lección 25: sensor I0.0, empujador Q0.0, cinta Q0.1
FRAM nueva: valores de fábrica
Lote de 6 · 0 piezas · 0 lotes
Pieza 1 de 6
Pieza 2 de 6
Pieza 3 de 6
Pieza 4 de 6
Pieza 5 de 6
Pieza 6 de 6
Lote 1 completo (6 piezas)
Lote de 7
```
