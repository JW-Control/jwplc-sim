# Curso IEC 61131-3 · Lección 13 · Comparar números: GE, LT y EQ

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

En la lección 07 el contador decidía solo: su salida Q se activaba al llegar a PV. Pero una máquina suele tomar **varias decisiones con la misma cuenta**: avisar cuando falta poco, parar al completar, encender otra cosa a mitad de camino. Para eso se compara la cuenta con cada número que importa.

## Qué vas a aprender

- Los comparadores de la norma: EQ, NE, GT, GE, LT y LE; el resultado es un BOOL.
- A usar la cuenta (CV) de un contador en varias comparaciones.
- En Ladder, los comparadores se conectan por EN/ENO y dejan su resultado en un bit.

## Cómo funciona el programa

El contador queda con un PV alto (100): solo se usa su cuenta **CV**, que se copia a `CUENTA`. Las decisiones salen de las comparaciones. En Ladder cada comparación es un bloque **LT** o **GE** con *Execution control* (EN/ENO) en el riel, que escribe su resultado en un bit (KM1, H1). En FBD, el bloque recibe la cuenta y el número y su salida va directo a la variable.

## Qué conectar

- %IX0.0 · B1, sensor de piezas
- %IX0.1 · S1, RESET
- %QX0.0 · KM1, motor de la cinta
- %QX0.1 · H1, aviso

## Para practicar

- Cajas de 12 piezas y el aviso H1 desde la pieza 8, para que el operador prepare la caja siguiente.
- Ejecuta el ejemplo: cada toque a B1 es una pieza; con 10 la cinta para y H1 avisa.
- Cambia la meta a 12 piezas en la comparación de KM1.
- Haz que H1 encienda desde la pieza 8 (GE con 8).
- Llena una caja y vuelve a cero con S1.

## En JWPLC Sim

1. Pulsa **Ejecutar**: la cinta (KM1) marcha.
2. Toca **B1** diez veces: con la décima, la cinta para y H1 se enciende.
3. **S1** vuelve la cuenta a cero.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
