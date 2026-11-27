# Curso IEC 61131-3 · Lección 07 · Contadores

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Una cinta lleva piezas a una caja; un sensor las ve pasar. Al llegar a la cantidad de la caja, la cinta para y avisa. Contar es otra de las tareas de todos los días de un PLC, y la norma trae sus contadores listos.

## Qué vas a aprender

- CTU, el contador ascendente: CU, R, PV, Q y CV.
- Que CTU cuenta flancos, no ciclos: una pieza es una sola cuenta.
- A usar la cuenta (CV) como un número entero (INT).

## Cómo funciona el programa

`PIEZAS(CU := B1, R := FALSE, PV := 10);` cuenta cada pieza que pasa por B1. `LLENA := PIEZAS.Q;` se pone en TRUE con 10; la cinta (`KM1 := NOT LLENA;`) para y H1 avisa. En el ejemplo R está fijo en FALSE: la caja nunca se vacía. En Ladder, el contacto B1 alimenta CU; PV y R son pines del bloque.

## Qué conectar

- %IX0.0 · B1, sensor de piezas
- %IX0.1 · S1, RESET
- %QX0.0 · KM1, motor de la cinta
- %QX0.1 · H1, caja llena

## Para practicar

- Cajas de 24 piezas y RESET (S1) que empieza una caja nueva.
- Ejecuta el ejemplo: cada toque a B1 es una pieza; con 10 para la cinta.
- Cambia la meta a 24 piezas (PV).
- Conecta RESET: S1 a la entrada R del contador.
- Llena una caja y empieza otra.

## En JWPLC Sim

1. Pulsa **Ejecutar**: la cinta (KM1) marcha.
2. Toca **B1** diez veces: con la décima, la cinta para y H1 se enciende.
3. En la práctica la caja es de 24 y RESET (S1) empieza otra.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
