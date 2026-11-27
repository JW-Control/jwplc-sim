# Curso JWPLC Basic · Lección 34 · Escribir un registro: la consigna del horno

## Qué vas a aprender

- La diferencia entre registros input (solo lectura) y holding (lectura y escritura).
- A escribir un registro con la función 06: `writeSingleRegisterSync()`.
- A leer un holding con la función 03: `readHoldingRegistersSync()`.
- A ajustar localmente y enviar solo al confirmar.

## Qué conectar

- El bus de la lección 33: A con A, B con B, controlador en la dirección 1, 9600 8N1.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie.
2. UP: la consigna sube a 45 °C, todavía sin enviar.
3. OK: «Consigna enviada: 45 °C» y el controlador la muestra en su pantalla.

## Para practicar

- Al arrancar, lee la consigna que ya tiene el controlador (holding 0) y empieza desde ella: «Consigna actual: 35 °C».
- Después de enviar, lee de vuelta el holding 0 y escribe «Consigna confirmada: N °C».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**.
2. **UP** (flecha arriba) sube la consigna; **OK** (Enter) la envía.
3. En la pestaña **Esquema**, la pantalla de **TC1** muestra la consigna nueva (SV).

```text
Lección 34: escribir la consigna, UP/DOWN cambian, OK envía
Consigna: 40 °C
Temperatura: 25.0 °C
Consigna: 45 °C (OK para enviar)
Consigna enviada: 45 °C
```
