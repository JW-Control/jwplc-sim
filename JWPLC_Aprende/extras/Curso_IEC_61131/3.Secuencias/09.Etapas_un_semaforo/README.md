# Curso IEC 61131-3 · Lección 09 · Etapas: un semáforo

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Casi toda máquina trabaja por pasos: llenar, mezclar, vaciar; avanzar, esperar, volver. En C++ se arma con `enum` y `switch` (lección 11). En un PLC, el método clásico es el de las **etapas**: un bit por paso y una **transición** que dice cuándo se pasa al siguiente. Es la base del GRAFCET y del SFC, y se escribe igual en ST, Ladder y FBD.

## Qué vas a aprender

- A dividir un proceso en etapas, con un bit por etapa (X1, X2, X3).
- A escribir cada transición como «etapa activa Y condición».
- La ecuación de una etapa: se activa con la transición que llega y se apaga con la que sale.
- A darle a cada etapa su propio temporizador y sus propias salidas.

## Cómo funciona el programa

El programa va en cuatro bloques, siempre en el mismo orden: los **temporizadores** de cada etapa (cuentan mientras su etapa está activa), las **transiciones**, las **etapas** y las **salidas**. Como todas las transiciones se calculan antes de mover las etapas, en cada vuelta se avanza como mucho un paso.

El pedido del peatón (`PEATON`) es otro enclavamiento: S1 lo activa y T2 lo borra, cuando el semáforo ya pasó a rojo.

## Qué conectar

- %IX0.0 · S1, botón del peatón
- %IX0.1 · SA1, modo noche
- %QX0.0 · H1, rojo
- %QX0.1 · H2, amarillo
- %QX0.2 · H3, verde
- %QX0.3 · H4, verde peatonal

## Para practicar

- Verde peatonal (Q0.3) que parpadea en sus últimos 3 s y modo noche (SA1) con el amarillo intermitente.
- Ejecuta el ejemplo y aprieta el botón del peatón (S1): el verde dura al menos 10 s, luego amarillo 3 s y rojo 8 s.
- Con otro TON de 5 s en la etapa ROJO, haz parpadear el verde peatonal en los últimos 3 s.
- Con SA1 (I0.1) activo: modo noche, solo el amarillo parpadea cada medio segundo.

## En JWPLC Sim

1. Pulsa **Ejecutar**: el semáforo arranca en verde.
2. Aprieta **S1** (botón del peatón): a los 10 s de verde pasa a amarillo 3 s y a rojo 8 s, con el verde peatonal encendido.
3. Sin apretar S1, el verde dura 30 s.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
