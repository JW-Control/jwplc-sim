# Curso IEC 61131-3 · Lección 04 · Set y reset

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

El enclavamiento guarda un estado con un contacto en paralelo. La norma trae otra forma, más directa: **set** (poner en TRUE) y **reset** (poner en FALSE). Lo que se pone en set queda así hasta que algo lo resetea, aunque la condición desaparezca.

## Qué vas a aprender

- Las bobinas S (set) y R (reset) de Ladder.
- Los bloques SR y RS de FBD: cuál gana si las dos entradas están activas.
- El equivalente en ST con dos IF.
- A memorizar una falla hasta que alguien la reconozca.

## Cómo funciona el programa

El ejemplo pone KM1 en TRUE con MARCHA y lo vuelve a FALSE con PARADA o el térmico. El reset está escrito después del set, así que gana. En Ladder son dos peldaños, uno con la bobina S y otro con la R; en FBD, un bloque RS con un OR en su entrada de reset.

## Qué conectar

- %IX0.0 · S1, MARCHA (NA)
- %IX0.1 · S2, PARADA (NC)
- %IX0.2 · F1, térmico (NC)
- %QX0.0 · KM1, contactor
- %QX0.1 · H1, falla
- %QX0.2 · H2, marcha

## Para practicar

- Falla del térmico memorizada en H1 (Q0.1): tras dispararse, MARCHA no arranca hasta reconocerla con PARADA.
- Ejecuta el ejemplo: MARCHA pone KM1 y PARADA lo quita.
- Memoriza la falla: una variable FALLA que se pone con el térmico abierto.
- PARADA la reconoce (la borra) solo con el térmico ya rearmado.
- MARCHA solo arranca sin falla; H1 muestra la falla.

## En JWPLC Sim

1. Pulsa **Ejecutar**: MARCHA (S1) pone KM1 y PARADA (S2) lo quita.
2. Dispara el térmico con **F1** y suéltalo: el motor queda parado.
3. En la práctica, la falla queda encendida en H1 hasta reconocerla con PARADA.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
