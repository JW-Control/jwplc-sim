# Generadores del estilo v3 «tablero JW» (19/11/2026)

Estilo aprobado por JW Control el 19/11/2026: cuerpo plano gris claro, contorno
fino gris, tornillos Phillips iguales con su número de borne, franja JW con un
solo dato, sin marcas de terceros y sin degradados (todo color plano). El mando (22 mm y AD16) sigue a EduVolt en la idea, no en el dibujo: cuerpo gris con hombros, rótulos de borne en relieve y sin tornillos a la vista; el piloto es angosto con aro negro y el pulsador, ancho con marco oscuro cuadrado y aro claro. El verde JW indica «energizado». Los equipos de campo
van a escala reducida (el motor ya no es más grande que el tablero).

    python3 docs/simbolos/herramientas/v3/fam_mando.py     # 15 de mando y medición
    python3 docs/simbolos/herramientas/v3/fam_tablero.py   # 19 de riel DIN
    python3 docs/simbolos/herramientas/v3/fam_campo.py     # 21 de campo
    python3 docs/simbolos/herramientas/v3/fam_proceso.py   # 6 bloques de proceso

Escriben directo en `app/renderer/assets/devices/`. Se conservan los nombres de
borne, los `data-*` de estado y las acciones de cada equipo. Los de tablero
mantienen su tamaño y la posición de sus bornes. Los de campo se achican:

- motores: 320 × 260;
- electroválvulas: 440 × 220 y 480 × 220, con una carrera de 80 px;
- final XCKJ: 120 × 240;
- torre: 120 × 360;
- compresor: 360 × 240;
- unidad de mantenimiento: 200 × 280;
- calibrador: 200 × 300.

`vfd-el.svg` y `fermentador.svg` se editan a mano: sin logo de marca y sin degradados (cada uno pasó al color medio de su degradado).

