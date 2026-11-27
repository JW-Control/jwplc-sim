# Curso JWPLC Basic · Lección 40 · Un transmisor: de un número a una presión

## Qué vas a aprender

- Qué es una medida analógica y por qué llega como un número.
- A escalar: pasar el número del registro a la unidad de la máquina (bar).
- A validar: reconocer el valor con que el transmisor avisa de su propia falla.
- Por qué una alarma analógica necesita histéresis.

## Qué conectar

- PT1: transmisor de presión 0-10 bar con RS-485, en la dirección 1, alimentado con 24 V DC.
- Q0.0: lámpara H1 de falla del sensor. Q0.1: lámpara H2 de presión baja.

## Cómo probarlo

1. Sube el programa: cada segundo aparece la presión en bar.
2. Cambia la presión: el número sigue a la tubería.
3. Desconecta la sonda del transmisor: «Sensor de presión abierto» y H1 se enciende.

## Para practicar

- Bajo 2,0 bar: «Presión baja» una vez y H2 (Q0.1) encendida.
- Sobre 2,5 bar: «Presión normal» y H2 apagada. Entre los dos límites no cambia nada.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: la consola muestra la presión de **PT1**.
2. Mueve la presión en el símbolo de **PT1**: la consola la sigue.
3. Elige **Falla del sensor → Sensor abierto**: aparece el aviso y **H1** se enciende.

```text
Lección 40: transmisor de presión 0-10 bar en la dirección 1
Presión: 3.00 bar
Presión: 3.00 bar
Sensor de presión abierto
```
