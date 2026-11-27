# Curso IEC 61131-3 · Lección 10 · Etapa numerada: CASE, comparar y MOVE

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

En la lección 09 cada etapa tenía su propio bit. Otra forma, muy usada, es guardar **el número de la etapa** en una variable entera: `ETAPA = 0` parado, `1` estrella, `2` triángulo. Así nunca hay dos etapas activas a la vez y agregar una etapa es agregar un número.

El ejemplo es un **arranque estrella-triángulo**: el motor arranca en estrella (KM1 y KM2) para que la corriente de arranque sea menor y, a los 3 s, pasa a triángulo (KM1 y KM3).

## Qué vas a aprender

- A guardar la etapa en una variable INT y a cambiarla con una asignación.
- CASE en ST: solo se revisan las condiciones de la etapa actual.
- En Ladder: un bloque EQ por etapa y un MOVE para pasar a la siguiente, con EN/ENO.
- En FBD: EQ para leer la etapa y SEL para escribirla.

## Cómo funciona el programa

La parada va **después** del CASE y manda sobre todo: con S0 pulsado (S0 es NC, así que vale FALSE), `ETAPA := 0` en cualquier etapa. Las salidas se calculan al final a partir de la etapa: `KM2 := ETAPA = 1;`.

En Ladder, los bits E0 a E2 se calculan al principio de cada vuelta, así que un cambio de etapa se ve en las salidas en la vuelta siguiente, 20 ms después.

## Qué conectar

- %IX0.0 · S1, marcha
- %IX0.1 · S0, parada NC
- %QX0.0 · KM1, línea
- %QX0.1 · KM2, estrella
- %QX0.2 · KM3, triángulo
- %QX0.3 · H1, en marcha

## Para practicar

- Pausa de 100 ms con KM2 y KM3 abiertos entre estrella y triángulo, y piloto H1 (Q0.3) encendido en marcha.
- Ejecuta el ejemplo: con S1 cierran KM1 y KM2 (estrella) y a los 3 s pasa a KM3 (triángulo).
- Agrega una etapa 2, PAUSA, de 100 ms con KM2 y KM3 abiertos; el triángulo pasa a ser la etapa 3.
- Enciende H1 en cualquier etapa menos la 0.
- Comprueba que S0 detiene todo en cualquier etapa.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: cierran KM1 y KM2 (estrella).
2. A los 3 s abre KM2 y cierra KM3 (triángulo).
3. Aprieta **S0**: abren los tres contactores.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
