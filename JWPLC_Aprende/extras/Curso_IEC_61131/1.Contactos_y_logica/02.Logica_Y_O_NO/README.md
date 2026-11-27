# Curso IEC 61131-3 · Lección 02 · Lógica Y, O, NO

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Casi toda la lógica de un tablero se arma con tres palabras: **Y**, **O** y **NO**. Una prensa que baja solo con las dos manos del operario en los mandos (Y), una alarma que suena con cualquiera de dos sensores (O), una luz que avisa que algo NO está.

## Qué vas a aprender

- Y (AND): contactos en serie.
- O (OR): contactos en paralelo.
- NO (NOT): contacto cerrado.
- Que un bloque AND u OR de FBD admite más de dos entradas.

## Cómo funciona el programa

Cada salida tiene su propia línea (un peldaño en Ladder, una red en FBD). `H1 := SA1 AND SA2;` baja la prensa con las dos manos; `H2 := SA1 OR SA2;` se enciende con cualquiera; `H3 := NOT SA1;` está encendido mientras SA1 está suelto. Las tres se calculan en cada ciclo, una después de la otra.

## Qué conectar

- %IX0.0 · SA1, mano izquierda
- %IX0.1 · SA2, mano derecha
- %IX0.2 · SA3, tercera mano
- %QX0.0…%QX0.4 · H1…H5, pilotos

## Para practicar

- Prensa a tres manos en H1 (Q0.0) y H5 (Q0.4) encendido con SA1 activa pero SA2 inactiva.
- Ejecuta el ejemplo y prueba los selectores (en el banco son las «manos»).
- Agrega la tercera mano SA3: H1 solo con las tres.
- H5: encendido con SA1 activa y SA2 inactiva.
- Prueba todas las combinaciones.

## En JWPLC Sim

1. Pulsa **Ejecutar** y mueve los selectores **SA1** y **SA2** en **Mandos** (en el banco son las manos).
2. Con uno solo, H1 queda apagado; con los dos, se enciende. H2 se enciende con cualquiera.
3. H3 está encendido mientras SA1 está en 0.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
