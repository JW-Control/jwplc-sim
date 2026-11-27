# Curso IEC 61131-3 · Lección 01 · Contactos y bobinas

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

El JWPLC Basic también se programa con los lenguajes de la norma **IEC 61131-3**, los mismos de cualquier PLC industrial: texto estructurado (**ST**), diagrama de contactos (**Ladder**, LD) y diagrama de bloques de función (**FBD**). Se escriben en el **OpenPLC Editor** y se prueban en **JWPLC Sim** con el mismo banco que la ruta en C++.

En esta lección vas a hacer el programa más corto posible: una luz que sigue a un pulsador. Lo vas a ver en los tres lenguajes, porque los tres dicen lo mismo.

## Qué vas a aprender

- Qué es una variable ubicada: `AT %IX0.0` es la entrada I0.0 y `AT %QX0.0` la salida Q0.0.
- Qué son un contacto y una bobina, y cómo se escriben en ST y FBD.
- A invertir una entrada: contacto cerrado en Ladder, `NOT` en ST, bloque NOT en FBD.

## Cómo funciona el programa

El PLC repite su ciclo sin parar (cada 20 ms en estos proyectos): lee las entradas, ejecuta el programa de arriba abajo y escribe las salidas. En cada ciclo, `H1 := S1;` copia el estado del pulsador al piloto. No hay `if` ni espera: la salida sigue a la entrada mientras el programa corre.

## Qué conectar

- %IX0.0 · S1, pulsador NA
- %IX0.1 · S2, pulsador NA
- %QX0.0 · H1, piloto verde
- %QX0.1 · H2, piloto amarillo

## Para practicar

- H1 (Q0.0) encendido mientras S1 NO esté apretado, y S2 que manda H2 (Q0.1).
- Ejecuta el ejemplo y aprieta S1: H1 sigue al pulsador.
- Invierte la lógica: H1 encendido con S1 suelto (NOT en ST, contacto cerrado en Ladder, bloque NOT en FBD).
- Agrega lo que manda H2 con S2.
- Prueba los dos pulsadores en el banco.

## En JWPLC Sim

1. Pulsa **Ejecutar**: el Sim compila el proyecto con la misma cadena que el OpenPLC Editor.
2. En **Mandos** mantén apretado **S1**: `%IX0.0` se activa y H1 se enciende. Al soltarlo, se apaga.
3. Mira la pestaña **Programa**: en ST puedes cambiar el código ahí mismo; Ladder y FBD se abren en el OpenPLC Editor.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
