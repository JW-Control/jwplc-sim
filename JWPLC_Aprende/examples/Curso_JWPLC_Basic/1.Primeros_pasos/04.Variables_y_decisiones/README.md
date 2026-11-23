# Curso JWPLC Basic · Lección 04 · Variables y decisiones

## Qué vas a aprender

- El tipo bool: una variable que solo vale true (verdadero) o false (falso).
- A decidir con if / else.
- Las tres operaciones lógicas de todo PLC:
  Y  (&&): se cumple solo si las dos condiciones se cumplen.
  O  (||): se cumple si al menos una se cumple.
  NO (!) : invierte: lo verdadero pasa a falso y al revés.

## Qué conectar

- Borne 1M a 0 V. Un pulsador entre +24 V e I0.0 y otro entre +24 V e I0.1.

## Qué hace cada relé

- Q0.0 = I0.0 Y I0.1   Prensa a dos manos: arranca solo con los dos apretados.
- Q0.1 = I0.0 O I0.1   Timbre con dos pulsadores: suena con cualquiera.
- Q0.2 = NO I0.0       Luz de "listo": encendida mientras I0.0 esté suelto.
- Q0.3 = I0.0 distinto de I0.1   Luz de escalera con dos interruptores:
  cambiar cualquiera de los dos la enciende o la apaga.

## Cómo probarlo

1. Sube el programa. Al inicio solo Q0.2 está cerrado.
2. Prueba las cuatro combinaciones de los pulsadores y mira los relés.

## Para practicar

- Agrega un tercer pulsador en I0.2 y haz una prensa a TRES manos.
- Q0.4: que se encienda con I0.0 apretado pero I0.1 suelto.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**. Al inicio, solo `Q0.2` está encendido.
2. En **Mandos** (panel **Reto**, a la derecha) gira los selectores **SA1** (`I0.0`) y **SA2** (`I0.1`) para probar las cuatro combinaciones, y compara los indicadores de la placa con esta tabla:

| `I0.0` | `I0.1` | `Q0.0` (Y) | `Q0.1` (O) | `Q0.2` (NO) | `Q0.3` (distinto) |
|---|---|---|---|---|---|
| suelto | suelto | apagado | apagado | **encendido** | apagado |
| activo | suelto | apagado | **encendido** | apagado | **encendido** |
| suelto | activo | apagado | **encendido** | **encendido** | **encendido** |
| activo | activo | **encendido** | **encendido** | apagado | apagado |
