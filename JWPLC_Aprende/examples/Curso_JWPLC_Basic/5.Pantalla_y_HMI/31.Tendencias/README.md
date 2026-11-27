# Curso JWPLC Basic · Lección 31 · Tendencias: el ritmo de la cinta en una gráfica

## Qué vas a aprender

- Un campo de tendencia (`JWPLC_UITrendField`) y `setTrend()`: una curva que avanza con el tiempo.
- Armar la configuración de la gráfica con nombres (`grafica.sampleIntervalMs = 1000;`) en lugar de una lista larga de números.
- Medir un ritmo con una ventana que se desliza: 6 casilleros de 5 s en un arreglo.
- Por qué una tendencia dice más que un número: cómo viene la máquina, no solo cómo está.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador de MARCHA (NA). I0.1: pulsador de PARADA (NC). I0.2: sensor de piezas al final de la cinta.
- Q0.0: contactor del motor de la cinta.

## Cómo probarlo

1. Sube el programa y arranca la cinta con MARCHA.
2. Pasa piezas frente al sensor: cada 5 s el Monitor Serie informa el ritmo y la curva sube.
3. Deja de pasar piezas: en 30 s el ritmo baja a cero y la curva lo muestra.

## Para practicar

- Con la ventana de 30 s llena y menos de 12 piezas por minuto, escribe «Ritmo bajo: N piezas/min» una vez y enciende H1 (Q0.1). Al volver a 12 o más, «Ritmo normal» y H1 apagada.
- Dibuja el mínimo como una línea roja punteada en la gráfica (`thresholdCount`, `thr1Value`).

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: **KM1** se cierra.
3. Da toques a **B1** (una pieza cada uno): cada 5 s sube el ritmo y la curva avanza un punto por segundo.

```text
Lección 31: tendencias, marcha I0.0, parada NC I0.1, sensor B1 I0.2
Cinta en marcha
Ritmo: 6 piezas/min, total 3
Ritmo: 14 piezas/min, total 7
Ritmo: 22 piezas/min, total 11
```
