# Curso IEC 61131-3 · Lección 11 · Bloque de función propio: un motor

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Ya usaste bloques de la norma: TON, CTU, R_TRIG. Cada uno guarda sus datos y se usa con una **instancia** por equipo (`T1`, `T2`…). Con un **FUNCTION_BLOCK** propio haces lo mismo con tu lógica: la marcha y parada de un motor se escribe una vez y se usa en cada bomba. Es la misma idea que las clases de C++ (lección 12).

## Qué vas a aprender

- A escribir un FUNCTION_BLOCK con entradas (VAR_INPUT), salidas (VAR_OUTPUT) y datos internos (VAR).
- A declarar una instancia por equipo y a llamarla desde ST, Ladder y FBD.
- Que cada instancia guarda sus propios datos: detener una bomba no toca a la otra.

## Cómo funciona el programa

`BOMBA1(MARCHA := S1, PARADA := S2);` llama al bloque con los pulsadores de la bomba 1, y `BOMBA1.Q` lee su salida. En Ladder, la primera entrada (MARCHA) y la primera salida (Q) del bloque van en el riel: el contacto S1 alimenta MARCHA y Q enciende la bobina KM1; PARADA se conecta aparte, con S2.

## Qué conectar

- %IX0.0 · S1, marcha bomba 1
- %IX0.1 · S2, parada bomba 1 (NC)
- %IX0.2 · S3, marcha bomba 2
- %IX0.3 · S4, parada bomba 2 (NC)
- %QX0.0 · KM1, bomba 1
- %QX0.1 · KM2, bomba 2
- %QX0.2 · H1, bombeando

## Para practicar

- La bomba 2 (Q0.1) con otra instancia del bloque MOTOR (S3 marcha, S4 parada) y la lámpara H1 (Q0.2) encendida con cualquier bomba en marcha.
- Ejecuta el ejemplo: S1 arranca la bomba 1 y S2 la detiene; mira el bloque MOTOR en pous/function-blocks.
- Declara BOMBA2 : MOTOR y llámala con S3 y S4; su salida Q a KM2.
- Enciende H1 con BOMBA1.Q OR BOMBA2.Q.
- Arranca las dos y detenlas por separado: cada instancia es independiente.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: arranca la bomba 1. **S2** la detiene.
2. Abre `pous/function-blocks/MOTOR.st` en el panel del código para ver el bloque.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
