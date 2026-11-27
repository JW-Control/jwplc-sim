# Curso IEC 61131-3 · Lección 03 · Enclavamiento: marcha y parada

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Un motor se arranca con un pulsador que se suelta enseguida, pero tiene que seguir en marcha. El truco, tan viejo como los tableros de relés, es el **enclavamiento**: un contacto del propio contactor en paralelo con el pulsador de marcha.

## Qué vas a aprender

- El circuito de marcha y parada con enclavamiento (contacto de retención).
- Por qué la parada y el térmico se cablean normalmente cerrados.
- A escribir la misma lógica en una línea de ST: `KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;`.

## Cómo funciona el programa

`KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;` se lee igual que el peldaño: «KM1 queda encendido si (se aprieta MARCHA o ya estaba encendido) y PARADA no está apretada y el térmico está bien». KM1 aparece a los dos lados: el valor de la derecha es el del ciclo anterior. En FBD es un OR que entra a un AND de tres entradas.

## Qué conectar

- %IX0.0 · S1, MARCHA (NA)
- %IX0.1 · S2, PARADA (NC)
- %IX0.2 · F1, térmico 95-96 (NC)
- %QX0.0 · KM1, contactor
- %QX0.1 · H1, falla
- %QX0.2 · H2, marcha

## Para practicar

- Piloto de marcha H2 (Q0.2) con el motor y piloto de falla H1 (Q0.1) mientras el térmico esté disparado.
- Ejecuta el ejemplo: MARCHA arranca KM1 y sigue en marcha al soltarla.
- Agrega H2 encendido mientras el motor marcha.
- Agrega H1 encendido mientras el térmico (F1) esté disparado.
- Comprueba que al rearmar el térmico el motor NO arranca solo.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1** (MARCHA): KM1 arranca y sigue al soltarlo.
2. Aprieta **S2** (PARADA): el motor para.
3. Arranca otra vez y aprieta **F1**: el térmico dispara y el motor para. Al rearmarlo, el motor **no** vuelve solo.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
