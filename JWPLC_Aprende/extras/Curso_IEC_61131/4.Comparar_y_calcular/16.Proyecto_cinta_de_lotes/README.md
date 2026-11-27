# Curso IEC 61131-3 · Lección 16 · Proyecto: lotes y turno en una cinta

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

El proyecto junta la unidad: una cinta que arma **lotes**. Cada pieza suma en el lote; con el lote completo la cinta para y avisa; el operador retira la caja y empieza otro con S1. En la práctica se agrega una segunda cuenta encima de la primera: los **lotes del turno**.

## Qué vas a aprender

- A encadenar dos cuentas: piezas por lote y lotes por turno.
- A sumar en el flanco de una condición calculada (COMPLETO), no solo de una entrada.
- A ordenar el programa: contar, decidir, comparar y, al final, las salidas.

## Cómo funciona el programa

`IF F_PIEZA.Q AND KM1` cuenta solo con la cinta en marcha: una pieza que se mueve con la cinta parada no es parte del lote. `IF S1 AND COMPLETO THEN PIEZAS := 0` es el lote nuevo; en Ladder es un **MOVE** de 0 a PIEZAS, y en FBD un **SEL** que elige 0. Como COMPLETO se calcula después, en la misma vuelta ya vale FALSE y la cinta arranca.

## Qué conectar

- %IX0.0 · S1, marcha / lote nuevo
- %IX0.1 · S0, parada NC
- %IX0.2 · B1, sensor de piezas
- %QX0.0 · KM1, motor de la cinta
- %QX0.1 · H1, lote completo

## Para practicar

- Lotes de 4 piezas y un turno de 3 lotes: con el turno completo, S1 ya no empieza otro lote.
- Ejecuta el ejemplo: S1 arranca, cada toque a B1 es una pieza y con 3 la cinta para; S1 empieza otro lote.
- Cambia el lote a 4 piezas.
- Cuenta los lotes completos (LOTES, en el flanco de COMPLETO) y calcula TURNO := LOTES >= 3.
- Con el turno completo, S1 no vuelve a cero las piezas: la cinta queda parada y H1 encendido.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: la cinta marcha.
2. Toca **B1** tres veces: el lote se completa, la cinta para y H1 se enciende.
3. **S1** empieza un lote nuevo.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
