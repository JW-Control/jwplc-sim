# Curso JWPLC Basic · Lección 44 · Control PI: sin error de régimen

## Qué vas a aprender

- Qué agrega la parte integral y por qué llega a la consigna.
- El anti-windup: limitar la integral para que no se pase al arrancar.
- Para qué sirve la D de un PID y por qué en agua casi no se usa.

## Qué conectar

- El montaje de la lección 43: VF1 en la dirección 1 y PT1 en la 2.
- I0.0: marcha (NA). I0.1: parada (NC).

## Cómo probarlo

1. Sube el programa y aprieta marcha: la presión sube, se pasa un poco y vuelve a 4,0 bar.
2. Abre más grifos: la presión baja un momento y vuelve a 4,0 bar.
3. Compáralo con la lección 43: ya no queda error.

## Para practicar

- Modo reposo: si la frecuencia está en el mínimo 5 s seguidos y la presión llegó a la consigna, la bomba para con «Bomba en reposo».
- En reposo, si la presión baja de 3,5 bar: «Bomba despierta» y el PI sigue.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: la presión de **RED1** llega a 4,0 bar.
2. Cambia el consumo de **RED1**: la presión vuelve a la consigna.
3. Baja el consumo a 0: la frecuencia baja hasta 20 Hz y se queda ahí, girando sin dar agua.

```text
Lección 44: control PI de presión, consigna 4,0 bar, marcha I0.0, parada NC I0.1
Control en marcha
Presión: 2.73 bar · 60.0 Hz
Presión: 4.01 bar · 59.9 Hz
Presión: 4.29 bar · 55.4 Hz
Presión: 4.11 bar · 51.6 Hz
```
