# Ejercicio 10 · Secuencia electroneumática de 4 cilindros

**Nivel 3.** Una estación de montaje mueve cuatro cilindros neumáticos de doble efecto (A, B, C y D), cada uno con una electroválvula 5/2 monoestable (Y1 a Y4: con bobina sale, sin bobina vuelve). Cada cilindro lleva dos sensores magnéticos en su ranura: «0» marca el vástago adentro y «1» afuera. Los ocho sensores ocupan las ocho entradas del JWPLC Basic, así que el mando va en los botones del frente de la placa.

## Secuencia

**A+ B+ B− A− C+ D+ D− C−**, en ciclo continuo: al terminar C− vuelve a empezar con A+.

Cada paso empieza cuando el anterior llegó a su final de carrera **y** el sensor del extremo opuesto se apagó.

## Mando

| Botón | Función |
|---|---|
| OK | Arranque. Solo arranca con los cuatro cilindros en reposo (A0, B0, C0 y D0 activos). En pausa, continúa desde el mismo paso. |
| ESC | Pausa: la secuencia se detiene en el paso actual, las válvulas quedan como estaban. |
| LEFT | Reset: retrae los cuatro cilindros, borra la falla y deja la máquina lista para arrancar. |

## Pilotos

- H1 verde (Q0_4): en marcha.
- H2 amarillo (Q0_5): en pausa.
- H3 rojo (Q0_6): falla, parpadeando.

## Fallas

Si un paso no llega a su final de carrera en 3 s, la máquina se detiene en falla y no sigue con el paso siguiente. Muestre el motivo en el monitor serie con una línea `FALLA <código>`:

- `T` + el sensor que no llegó, p. ej. `FALLA TB1` (B no salió: bobina cortada, cable suelto o sin aire).
- `P` + el sensor del extremo opuesto que sigue activo, p. ej. `FALLA PA0` (sensor pegado o mal ubicado).

Opcional: muestre el mismo código en ERR de la pantalla con `JWPLC_Display.setErrCode(codigo)` y el estado de marcha con `JWPLC_Display.setRunLed(...)`.

## Para probar en el simulador

En la escena, el inspector de cada electroválvula y de cada sensor tiene sus fallas: corte la bobina de Y2 o deje pegado A0 y vea qué hace su programa. La vista 3D muestra los cuatro cilindros con sus sensores encendiéndose al llegar.
