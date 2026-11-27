# Curso IEC 61131-3 · Lección 12 · Proyecto: un portón automático

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

El proyecto de la unidad junta todo: etapas numeradas, transiciones, una parada que manda sobre todo y una seguridad que cambia el sentido. Un **portón automático** abre hasta un final de carrera, cierra hasta otro y, si la barrera ve algo mientras cierra, vuelve a abrir.

## Qué vas a aprender

- A ordenar una máquina real en etapas antes de escribir el programa.
- A escribir la seguridad (parada, obstáculo) como transiciones más.
- A garantizar que dos salidas opuestas nunca estén juntas: cada una sale de una etapa distinta.

## Cómo funciona el programa

El programa es el de la lección 10 con otras etapas. La parada va después del CASE para que mande sobre cualquier transición. En la práctica falta una transición: **CERRANDO → ABRIENDO con B3**, la barrera. Es una línea más en el CASE (un ELSIF), un peldaño más en Ladder o un SEL más en FBD.

## Qué conectar

- %IX0.0 · S1, abrir
- %IX0.1 · S2, cerrar
- %IX0.2 · S0, parada NC
- %IX0.3 · B1, abierto
- %IX0.4 · B2, cerrado
- %IX0.5 · B3, barrera
- %QX0.0 · KM1, abrir
- %QX0.1 · KM2, cerrar
- %QX0.2 · H1, baliza

## Para practicar

- Si la barrera B3 ve un obstáculo mientras el portón cierra, vuelve a abrir; y la baliza H1 (Q0.2) encendida mientras el portón se mueve.
- Ejecuta el ejemplo: S1 abre hasta B1, S2 cierra hasta B2 y S0 lo detiene donde esté.
- En la etapa CERRANDO agrega la transición a ABRIENDO con B3.
- Enciende H1 en cualquier etapa menos la 0.
- Prueba un obstáculo a mitad del cierre: KM2 abre y KM1 cierra, nunca los dos a la vez.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: el portón abre hasta B1.
2. Aprieta **S2**: cierra hasta B2. **S0** lo detiene donde esté.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
