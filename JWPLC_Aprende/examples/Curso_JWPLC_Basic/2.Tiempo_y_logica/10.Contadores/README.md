# Curso JWPLC Basic · Lección 10 · Contadores

## Qué vas a aprender

- A contar eventos: cada pieza que pasa por un sensor suma 1.
- A comparar la cuenta con una meta y actuar al llegar.
- A juntar lo aprendido: flancos (lección 07), struct con su función
  (lección 09) y una regla de marcha (lección 08).

## El caso: llenar cajas en una cinta

- La cinta avanza y cada pieza que cae en la caja pasa frente a un sensor.
- Al llegar a 10 piezas la cinta se detiene y se enciende la lámpara
  "caja llena". El operador cambia la caja y aprieta RESET.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: sensor PNP de piezas (o un pulsador para simularlo).
- I0.1: pulsador RESET.
- Q0.0: contactor del motor de la cinta.
- Q0.1: lámpara "caja llena".

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Q0.0 está cerrado: la cinta avanza.
3. Activa I0.0 diez veces: verás la cuenta y, en la décima, la cinta se
   detiene y Q0.1 se enciende.
4. Aprieta RESET: la cuenta vuelve a 0 y la cinta arranca otra vez.

## Para practicar

- Cambia la meta a 24 piezas.
- Cuenta también las cajas llenas y muéstralas en el Monitor Serie.
