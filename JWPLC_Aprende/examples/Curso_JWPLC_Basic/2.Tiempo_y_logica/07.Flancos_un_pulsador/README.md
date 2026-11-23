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

- Muestra en el Monitor Serie cuántas veces se apretó el pulsador desde el
  arranque, como «Pulsaciones: 3».
- Haz que Q0.1 cambie al SOLTAR el pulsador, en lugar de al apretarlo.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) aprieta **S1**: `Q0.0` se enciende. Suéltalo: sigue encendido.
3. Apriétalo otra vez: `Q0.0` se apaga.
4. Mantén **S1** apretado varios segundos: no pasa nada más, porque solo cuenta el flanco.

```text
Lección 07: cada pulsación en I0.0 cambia Q0.0
Pulsación: Q0.0 encendida
Pulsador suelto
Pulsación: Q0.0 apagada
```
