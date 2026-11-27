# Curso JWPLC Basic · Lección 37 · Varios equipos en el bus: un horno con ventilación

## Qué vas a aprender

- Que en un mismo bus RS-485 conviven varios esclavos, cada uno con su dirección.
- A preguntar por turno: primero el controlador, después el módulo de E/S.
- El cableado en cadena: A con A y B con B de un equipo al siguiente.
- Una histéresis con una medición que llega por el bus.

## Qué conectar

- El bus en cadena: JWPLC → controlador de temperatura (dirección 1) → módulo de E/S remotas (dirección 3), A con A y B con B.
- DO1 del módulo: contactor del ventilador de extracción.
- Para la práctica: DI1, el interruptor de la puerta; DO2, una lámpara de alarma.

## Cómo probarlo

1. Sube el programa y calienta la sonda del controlador.
2. A 45 °C: «Ventilador encendido a 45.0 °C» y el contactor cierra.
3. Al bajar a 40 °C: «Ventilador apagado».

## Para practicar

- Lee DI1 del módulo (la puerta): con la puerta abierta el ventilador para y se escribe «Puerta abierta» una vez.
- Con el bit de alarma del controlador, enciende la lámpara en DO2.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**. En **Mandos** (panel **Reto**), sube la temperatura de **TC1** a 47 °C: **KM1** cierra a través de **IO1**.
2. Bájala a 42 °C: el ventilador sigue (histéresis). A 40 °C se apaga.
3. En el **Esquema**, el bus sale del JWPLC, pasa por **TC1** y llega a **IO1**.

```text
Lección 37: dos equipos en el bus, TC1 dirección 1, IO1 dirección 3
Ventilador encendido a 47.0 °C
Ventilador apagado a 38.0 °C
```
