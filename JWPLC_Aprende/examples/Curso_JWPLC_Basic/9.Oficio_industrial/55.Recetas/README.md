# Curso JWPLC Basic · Lección 55 · Recetas: una máquina, varios productos

## Qué vas a aprender

- Qué es una receta y por qué evita cambiar el programa para cada producto.
- A guardar las recetas en una tabla de structs.
- A elegir receta solo con la máquina parada.

## Qué conectar

- I0.0: marcha (NA).
- Q0.0: bobina de KM1, la mezcla. Q0.1: lámpara H1, producto listo.

## Cómo probarlo

1. Sube el programa: la consola muestra la receta 1, YOGUR.
2. UP y DOWN cambian de receta.
3. Marcha: mezcla con los tiempos de la receta elegida y al final H1 se enciende.

## Para practicar

- Guarda la receta elegida en la FRAM al cambiarla.
- Al encender, recupérala: «Receta recuperada: N NOMBRE».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: la consola muestra la receta 1.
2. Usa **UP** y **DOWN** en la botonera de la **Placa** y aprieta **S1**.
3. Mira **KM1**: cierra el tiempo de mezcla de esa receta.

```text
Lección 55: recetas con UP/DOWN, marcha I0.0, mezcla KM1 Q0.0, listo H1 Q0.1
Receta 1: YOGUR · mezcla 4 s · reposo 2 s
Receta 2: CREMA · mezcla 6 s · reposo 1 s
Ciclo de CREMA
CREMA listo
```
