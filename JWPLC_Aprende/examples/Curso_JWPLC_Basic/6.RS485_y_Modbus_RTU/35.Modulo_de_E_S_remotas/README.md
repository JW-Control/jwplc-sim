# Curso JWPLC Basic · Lección 35 · El módulo de E/S remotas: 8 entradas y 8 salidas más

## Qué vas a aprender

- Para qué sirve un módulo de E/S remotas: llevar entradas y salidas lejos del tablero con dos hilos.
- A leer sus 8 entradas con la función 02 (`readDiscreteInputsSync()`) y escribir sus 8 salidas con la 15 (`writeMultipleCoilsSync()`).
- A trabajar con los 8 bits de un byte: máscaras con `&` para leer y `|` para encender.
- El ciclo de un PLC con E/S remotas: leer, decidir, escribir.

## Qué conectar

- Módulo de E/S remotas en el bus RS-485 (A con A, B con B), dirección 3, 9600 8N1, alimentado con 24 V DC.
- DI1: pulsador de marcha (NA). DI2: pulsador de parada (NC). Común DC al 0 V.
- DO1: contactor de la bomba. DO2: lámpara de marcha. Común C1 al +24 V.

## Cómo probarlo

1. Sube el programa: el JWPLC pregunta al módulo 10 veces por segundo.
2. Marcha en DI1: el contactor en DO1 cierra y la lámpara DO2 enciende.
3. Parada en DI2: los dos se apagan.

## Para practicar

- Suma el térmico de la bomba en DI3 (NC): si abre, la bomba para, no arranca y se escribe «Falla: térmico» una vez.
- Enciende una lámpara de falla en DO3 mientras dure la falla.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**. En **Mandos** (panel **Reto**), **S1** y **S2** están cableados al módulo **IO1**, no al JWPLC.
2. Toca **S1**: **KM1** cierra a través de DO1. **S2** lo detiene.
3. En la pestaña **Esquema**, el bus RS-485 une el JWPLC con **IO1**.

```text
Lección 35: E/S remotas en la dirección 3, bomba en DO1
Bomba en marcha
Bomba detenida
```
