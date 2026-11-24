# Curso IEC 61131-3 · Lección 06 · Flancos: un pulsador que enciende y apaga

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Un pulsador que enciende la luz y, a la siguiente pulsación, la apaga: el **telerruptor**. Si el programa mirara solo «está apretado», la luz cambiaría en cada ciclo mientras se mantiene el dedo, decenas de veces por segundo. Lo que interesa es el **instante** en que cambia: el flanco.

## Qué vas a aprender

- Flanco de subida (R_TRIG, contacto P) y de bajada (F_TRIG, contacto N).
- Que un flanco dura un solo ciclo.
- A cambiar una salida con XOR: `H1 := H1 XOR PULSO;`.

## Cómo funciona el programa

En ST, `APRIETA(CLK := S1);` actualiza el detector y `IF APRIETA.Q THEN H1 := NOT H1; END_IF;` invierte la luz en el único ciclo del flanco. En Ladder, un contacto P de S1 da el pulso y un bloque XOR con H1 lo aplica. En FBD, un R_TRIG alimenta un XOR que vuelve a H1.

## Qué conectar

- %IX0.0 · S1, pulsador NA
- %QX0.0 · H1, piloto verde
- %QX0.1 · H2, piloto amarillo

## Para practicar

- Una segunda luz H2 (Q0.1) que cambia al SOLTAR S1 (flanco de bajada).
- Ejecuta el ejemplo: cada pulsación cambia H1.
- Mantén S1 apretado: H1 no parpadea, cambia una sola vez.
- Agrega un flanco de bajada (F_TRIG) que cambie H2 al soltar.
- Prueba varias pulsaciones.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1** varias veces: cada pulsación cambia H1.
2. Mantén S1 apretado: H1 cambia una sola vez.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
