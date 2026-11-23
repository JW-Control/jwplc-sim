# Curso JWPLC Basic · Lección 11 · Máquina de estados: un semáforo

## Qué vas a aprender

- A pensar una máquina como una serie de ESTADOS (pasos) y las
  condiciones que la hacen pasar de un estado al siguiente.
- enum: una lista de nombres para los estados.
- switch: hacer una cosa distinta según el estado actual.

## El caso: semáforo de un cruce peatonal

- VERDE para los autos, como mínimo 10 segundos. Si un peatón aprieta el
  botón, al cumplirse esos 10 segundos pasa a AMARILLO. Sin peatones,
  sigue en verde hasta 30 segundos.
- AMARILLO durante 3 segundos.
- ROJO para los autos durante 8 segundos, con el verde peatonal encendido.
- Y vuelve a VERDE.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: botón del peatón.
- Q0.0 rojo, Q0.1 amarillo, Q0.2 verde de los autos.
- Q0.3 verde de los peatones.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Sin tocar nada, el semáforo cambia cada 30 segundos.
3. Aprieta el botón: después de los 10 segundos mínimos de verde, cambia.

## Para practicar

- Agrega un estado "ROJO PARPADEANDO" para los peatones: su verde
  parpadea cada medio segundo en los últimos 3 segundos.
- Que una entrada I0.1 ponga el semáforo en amarillo intermitente (modo
  noche, cada medio segundo) mientras esté activa.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. Sin tocar nada, el semáforo (**H1** a **H3** en **Esquema eléctrico**, `Q0.0` a `Q0.2` en la placa) se queda 30 s en verde, 3 s en amarillo y 8 s en rojo. Si no quieres esperar, pon la simulación a ×10 (arriba a la derecha).
3. Con el semáforo en verde, aprieta **S1 Peatón** en **Mandos** (panel **Reto**). Si el verde ya lleva 10 s, cambia enseguida; si no, cambia cuando se cumplen los 10 s.

```text
Estado: VERDE
Estado: AMARILLO
Estado: ROJO
```
