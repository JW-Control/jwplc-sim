# Curso IEC 61131-3 · Lección 14 · Sumar y restar: un estacionamiento

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Un estacionamiento tiene una barrera de entrada y otra de salida. Cada auto que entra suma uno; cada uno que sale, resta uno. Con la cuenta se calcula cuántos lugares quedan y se enciende el cartel de **lleno**. Es la cuenta más simple que sube y baja, y la base de cualquier inventario.

## Qué vas a aprender

- ADD y SUB: sumar y restar enteros (INT).
- A sumar en el flanco del evento, no mientras dure la señal.
- A calcular un valor a partir de otro (LIBRES := 5 - AUTOS) y compararlo.

## Cómo funciona el programa

El ejemplo no tiene límites: un auto que entra con el estacionamiento lleno suma igual, y una salida de más deja la cuenta en negativo. En la vida real pasa (un sensor que rebota, un operador que prueba la barrera) y la cuenta deja de representar lo que hay. La práctica agrega una comparación antes de sumar y otra antes de restar.

## Qué conectar

- %IX0.0 · S1, entra un auto
- %IX0.1 · S2, sale un auto
- %QX0.0 · H1, hay lugar
- %QX0.1 · H2, lleno

## Para practicar

- Un estacionamiento de 3 lugares cuya cuenta nunca pasa de 3 ni baja de 0, aunque las barreras se accionen de más.
- Ejecuta el ejemplo: S1 es un auto que entra y S2 uno que sale; con 5 adentro, H2 avisa lleno.
- Cambia la capacidad a 3.
- Suma solo si AUTOS < 3 y resta solo si AUTOS > 0.
- Prueba de más: entra un cuarto auto y salen más autos de los que hay; la cuenta no se sale de 0…3.

## En JWPLC Sim

1. Pulsa **Ejecutar**: H1 (verde) encendido.
2. Toca **S1** cinco veces: con el quinto auto, H2 (lleno).
3. Toca **S2**: sale un auto y vuelve el verde.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
