# Curso JWPLC Basic · Lección 54 · Horómetro: el tiempo de marcha que no se pierde

## Qué vas a aprender

- Por qué el mantenimiento se programa por horas de marcha.
- A contar segundos de marcha sin perder milisegundos.
- A guardar el horómetro en la FRAM para que sobreviva a un corte.

## Qué conectar

- I0.0: marcha (NA). I0.1: parada (NC).
- Q0.0: bobina de KM1. Q0.1: lámpara H2 de mantenimiento (para la práctica).

## Cómo probarlo

1. Sube el programa y da marcha: cada 5 s aparece la marcha acumulada.
2. Apaga y enciende la placa: el horómetro sigue donde estaba.
3. Para el motor: el horómetro se detiene.

## Para practicar

- A los 20 s de marcha desde el último mantenimiento: H2 encendida y «Mantenimiento: lubricar la bomba» una vez.
- Con OK: el mantenimiento queda registrado en la FRAM, «Mantenimiento registrado» y H2 apagada.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: la consola suma la marcha.
2. Detén la simulación y vuelve a ejecutar: el horómetro sigue, porque la FRAM se guarda entre corridas.
3. Aprieta **S2**: deja de sumar.

```text
Lección 54: horómetro en FRAM, marcha I0.0, parada NC I0.1
Horómetro nuevo en 0
Motor en marcha
Marcha acumulada: 5 s
Marcha acumulada: 10 s
Motor detenido. Marcha acumulada: 12 s
```
