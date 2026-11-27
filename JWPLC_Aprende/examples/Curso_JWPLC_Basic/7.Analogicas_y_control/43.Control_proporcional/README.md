# Curso JWPLC Basic · Lección 43 · Control proporcional: presión constante

## Qué vas a aprender

- Qué es un lazo de control: medir, comparar con la consigna y actuar.
- El control proporcional: más error, más empuje.
- Qué es el error de régimen y por qué el control P se queda corto.

## Qué conectar

- VF1: variador en la dirección 1 con la bomba. PT1: transmisor de presión en la dirección 2.
- I0.0: marcha (NA). I0.1: parada (NC).

## Cómo probarlo

1. Sube el programa y aprieta marcha: la bomba acelera y la presión sube.
2. Espera unos segundos: la presión se queda quieta un poco bajo 4,0 bar.
3. Abre más grifos: la presión baja un poco más y la bomba acelera.

## Para practicar

- UP y DOWN cambian la consigna de a 0,5 bar, entre 3,0 y 6,0 bar: «Consigna: 4.5 bar».
- Comprueba que la presión sube con la consigna.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: la presión de **RED1** sube y se queda cerca de 3,5 bar.
2. Cambia el consumo de **RED1**: la frecuencia de **VF1** se ajusta sola.
3. Fíjate que nunca llega a 4,0 bar: ese resto es el error de régimen.

```text
Lección 43: control P de presión, consigna 4,0 bar, marcha I0.0, parada NC I0.1
Control en marcha
Presión: 2.61 bar · 60.0 Hz
Presión: 3.19 bar · 56.2 Hz
Presión: 3.52 bar · 49.6 Hz
Presión: 3.55 bar · 49.0 Hz
```
