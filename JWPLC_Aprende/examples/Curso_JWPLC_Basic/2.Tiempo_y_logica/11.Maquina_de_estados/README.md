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
