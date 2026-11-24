# Curso IEC 61131-3 · Lección 05 · Temporizadores TON y TOF

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Un arranque que espera unos segundos, una luz de pasillo que sigue encendida un rato después de que pasó la gente, una alarma si algo dura demasiado: todo eso son **temporizadores**. La norma trae los mismos en todos los PLC: TON, TOF y TP.

## Qué vas a aprender

- TON: retardo a la conexión.
- TOF: retardo a la desconexión.
- Qué es una instancia: cada temporizador tiene su nombre y su memoria.
- Las entradas IN y PT y las salidas Q y ET.
- Los tiempos en IEC: `T#3s`, `T#500ms`, `T#1m30s`.

## Cómo funciona el programa

`ARRANQUE(IN := S1, PT := T#3s);` llama al temporizador en cada ciclo con el estado de S1; `H1 := ARRANQUE.Q;` copia su salida al piloto. En Ladder el bloque va en el peldaño: la corriente del contacto entra por IN y la salida Q sigue hacia la bobina. En FBD, la variable S1 va a IN y Q a la variable H1.

## Qué conectar

- %IX0.0 · S1, arranque
- %IX0.1 · B1, presencia (selector)
- %QX0.0 · H1, arranque
- %QX0.1 · H2, luz del pasillo
- %QX0.2 · HA1, bocina

## Para practicar

- Arranque a los 2 s, luz de pasillo de 5 s y una bocina si la presencia dura más de 30 s.
- Ejecuta el ejemplo: mantén S1 3 s y activa la presencia B1.
- Cambia el arranque a 2 s y la luz del pasillo a 5 s (PT).
- Agrega un tercer temporizador: HA1 (Q0.2) suena si la presencia dura más de 30 s.
- Prueba los tres tiempos.

## En JWPLC Sim

1. Pulsa **Ejecutar** y mantén **S1** apretado: H1 se enciende a los 3 s.
2. Activa la presencia **B1**: el pasillo (H2) se enciende al instante; al quitarla, sigue 10 s más.
3. En la práctica cambias los tiempos y agregas la bocina.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
