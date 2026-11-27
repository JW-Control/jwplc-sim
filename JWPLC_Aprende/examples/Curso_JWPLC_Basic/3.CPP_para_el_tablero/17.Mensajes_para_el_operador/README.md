# Curso JWPLC Basic · Lección 17 · Mensajes para el operador: un horómetro

## Qué vas a aprender

- Serial.printf: armar un texto con números en una sola línea.
- Formatos: %lu para enteros, %02lu con ceros a la izquierda, %s para
  textos y %.1f para un decimal.
- Una función que convierte milisegundos en hh:mm:ss.
- Un horómetro: el tiempo de marcha acumulado de un motor.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: MARCHA (NA). I0.1: PARO (NC). Los dos desde +24 V.
- Q0.0: contactor del motor.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. MARCHA arranca el motor: cada 5 segundos llega un reporte con el
   tiempo de este arranque y el total.
3. PARO lo detiene y dice cuánto duró ese arranque.
4. Arranca otra vez: el total sigue sumando desde donde quedó.

## Para practicar

- Aviso de mantenimiento: al llegar a 30 segundos de marcha total (en una
  máquina real serían 500 horas), enciende una lámpara en Q0.1 y escribe
  una sola vez «Mantenimiento: 00:00:30 de marcha».
- En cada parada, escribe el porcentaje de uso desde que se encendió el
  PLC, con un decimal: «Uso: 92.3 %».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**. **S2** es NC: en reposo `I0.1` ya está activa.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: **KM1** se cierra y cada 5 segundos llega un reporte.
3. Da un toque a **S2 Paro**: el motor se detiene y el Monitor dice cuánto duró ese arranque.
4. Arranca otra vez: el total sigue desde donde quedó.

```text
Lección 17: marcha I0.0, paro NC I0.1, motor Q0.0
Arranque 1
En marcha 00:00:05 | total 00:00:05
En marcha 00:00:10 | total 00:00:10
Detenido tras 00:00:11
Arranque 2
```
