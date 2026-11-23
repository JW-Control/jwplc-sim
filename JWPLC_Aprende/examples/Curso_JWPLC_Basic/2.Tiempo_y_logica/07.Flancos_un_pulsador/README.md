# Curso JWPLC Basic · Lección 07 · Flancos: encender y apagar con un pulsador

## Qué vas a aprender

- La diferencia entre "el pulsador ESTÁ apretado" (un estado, dura) y
  "el pulsador SE APRETÓ" (un flanco, ocurre una sola vez).
- A detectar flancos comparando la lectura de ahora con la de la vuelta
  anterior de loop().
- A hacer un telerruptor: una pulsación enciende, la siguiente apaga.

## Los dos flancos

- Flanco de subida: antes estaba inactivo y ahora está activo (se apretó).
- Flanco de bajada: antes estaba activo y ahora está inactivo (se soltó).

## Qué conectar

- Borne 1M a 0 V y un pulsador entre +24 V e I0.0.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Cada vez que aprietes el pulsador, Q0.0 cambia: se enciende o se apaga.
3. El Monitor Serie avisa solo cuando algo cambia, sin repetir mensajes.

## Para practicar

- Muestra cuántas veces se apretó el pulsador desde el arranque.
- Haz que Q0.1 cambie al SOLTAR el pulsador, en lugar de al apretarlo.
