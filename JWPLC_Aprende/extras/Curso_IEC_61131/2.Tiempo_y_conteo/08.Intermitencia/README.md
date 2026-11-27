# Curso IEC 61131-3 · Lección 08 · Intermitencia con dos temporizadores

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Un piloto que parpadea avisa más que uno fijo. En C++ se usa `millis()`; en un PLC, dos temporizadores que se pasan la posta: uno cuenta el tiempo apagado, el otro el encendido.

## Qué vas a aprender

- A armar un generador de pulsos con dos TON en anillo.
- Que el PLC nunca se detiene a esperar: los temporizadores cuentan mientras el resto del programa sigue.
- A elegir el tiempo encendido y el apagado por separado.

## Cómo funciona el programa

Las cuatro líneas de ST son el anillo: cada TON mira la salida del otro. Como un TON solo actualiza su salida cuando se lo llama, el programa sigue corriendo todo el tiempo; por eso cualquier otra línea (como `H2 := S1;` en la práctica) responde al instante.

## Qué conectar

- %IX0.0 · S1, pulsador NA
- %QX0.0 · H1, piloto verde
- %QX0.1 · H2, piloto amarillo
- %QX0.2 · H3, piloto rojo

## Para practicar

- H3 (Q0.2) parpadea 2 s encendido y 2 s apagado, y H2 (Q0.1) sigue a S1 al instante.
- Ejecuta el ejemplo: H1 parpadea cada 500 ms.
- Arma otra intermitencia, lenta, de 2 s y 2 s para H3.
- H2 sigue a S1 sin esperar.
- Mira las tres luces a la vez: ninguna frena a las otras.

## En JWPLC Sim

1. Pulsa **Ejecutar**: H1 parpadea cada medio segundo.
2. Cuenta el ritmo: medio segundo encendido y medio segundo apagado, mientras todo lo demás sigue respondiendo.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
