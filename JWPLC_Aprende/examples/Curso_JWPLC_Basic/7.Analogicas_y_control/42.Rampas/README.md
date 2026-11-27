# Curso JWPLC Basic · Lección 42 · Rampas: llegar a la velocidad de a poco

## Qué vas a aprender

- Qué es una rampa y por qué se usa al arrancar y al parar.
- A escribir una rampa como un paso pequeño en cada ciclo, sin pasarse del objetivo.
- Que una rampa sirve para cualquier consigna: frecuencia, temperatura o presión.

## Qué conectar

- VF1: variador en la dirección 1 con su motor (lección 36).
- I0.0: pulsador de marcha (NA). I0.1: pulsador de parada (NC).

## Cómo probarlo

1. Sube el programa y aprieta marcha: la frecuencia sube 5 Hz por segundo hasta 50 Hz.
2. Mira la consola: un aviso cada 10 Hz.
3. Aprieta parada: el variador corta enseguida.

## Para practicar

- Rampa de bajada: con la parada, el objetivo pasa a 0 y la frecuencia baja a 10 Hz/s.
- Al llegar a 0: la orden de parada al variador y «Detenido en rampa».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: la frecuencia de **VF1** sube de a poco.
2. Mira el display del variador: sigue a la rampa.
3. Aprieta **S2**: el variador para.

```text
Lección 42: rampa de 5 Hz/s, marcha I0.0, parada NC I0.1
Marcha: rampa hacia 50 Hz
Rampa: 10 Hz
Rampa: 20 Hz
Rampa: 30 Hz
Rampa: 40 Hz
Rampa: 50 Hz
Parada
```
