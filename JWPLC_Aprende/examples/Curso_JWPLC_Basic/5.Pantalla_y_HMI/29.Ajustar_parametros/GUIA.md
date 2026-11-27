<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/29-ajustar-parametros.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 29: Ajustar parámetros desde el frente

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/) y [27](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/27-campos-hmi/)

En la [lección 19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/) UP y DOWN cambiaban el tiempo de la dosificadora al instante. En una máquina eso es peligroso: el operador pasa por 40 s camino a 15 s y la máquina usa 40 s justo en ese momento.

Los equipos comerciales lo resuelven con un **modo de edición**: el valor se cambia en una copia y la máquina lo usa recién cuando el operador confirma.

| Tecla | Fuera de edición | Editando |
|---|---|---|
| OK | Empieza a editar | Guarda el valor nuevo |
| UP / DOWN | Nada | Cambian la copia de a 5 s |
| ESC | Nada | Cancela: queda el valor anterior |

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador de marcha (NA), uno de parada (NC) y un contactor para la mezcladora.

## Conexiones

1. **`1M`** al **0 V**.
2. **`I0.0`**: pulsador de marcha (NA). **`I0.1`**: pulsador de parada (NC).
3. **`Q0.0`**: contactor de la mezcladora.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 29.Ajustar_parametros. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 29. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### Dos variables: la que usa la máquina y la que se edita

```cpp
unsigned long tiempo = 20;      // segundos: el que usa la máquina
unsigned long editado = 20;     // el que se está editando
```

Al apretar OK, `editado` copia a `tiempo`. UP y DOWN tocan solo `editado`. El segundo OK hace `tiempo = editado`; ESC simplemente sale y `editado` se olvida.

### Límites y pasos

```cpp
if (JWPLC_Buttons.pressed(BTN_UP) && editado + PASO <= TIEMPO_MAX)
    editado = editado + PASO;
```

Pasos de 5 s entre 5 y 60: el operador no puede poner 0 ni 3 600. Con `unsigned long`, el límite de abajo se escribe `editado >= TIEMPO_MIN + PASO`, para que la resta nunca dé la vuelta.

### Liberar ESC

```cpp
JWPLC_Display.setIdleReturnMode(IDLE_RETURN_DISABLED);
```

Por defecto ESC vuelve a la pantalla de estado. Aquí ESC cancela la edición, así que se desactiva esa vuelta.

### Mostrar que se está editando

El campo **Modo** es un campo sí/no con fondo distinto para cada estado: `FIJO` en gris y `EDITA` en negro sobre amarillo. El campo del tiempo muestra `editado` mientras se edita y `tiempo` el resto del tiempo. Abajo, una línea de ayuda dice qué hace cada tecla.

## Súbelo y pruébalo

1. Sube el programa: **Tiempo de mezcla 20**, **Modo FIJO**.
2. OK: **EDITA** en amarillo. UP una vez: 25. OK: guardado.
3. Marcha: la mezcladora trabaja 25 s y **Falta** cuenta hacia atrás.
4. OK, UP, UP y ESC: el tiempo vuelve a 25.

```text
Lección 29: ajustar desde el frente, marcha I0.0, parada NC I0.1
Tiempo: 20 s
Editando
Tiempo: 25 s
Mezclando 25 s
Mezcla terminada
```

## Si algo no funciona

- **ESC vuelve a la pantalla de estado:** falta `setIdleReturnMode(IDLE_RETURN_DISABLED)`.
- **El valor cambia aunque se cancele:** UP y DOWN están tocando `tiempo` en lugar de `editado`.
- **El ajuste se pierde al cortar la energía:** es lo esperado; la práctica lo guarda en la FRAM.

## Para practicar

- **Guardar en la FRAM:** al confirmar, guarda el tiempo con `JWPLC_FRAM.writeBlock()` ([lección 22](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/)) y recupéralo al arrancar con `Recuperado: 30 s`.
- **No editar en marcha:** con la mezcladora en marcha, OK no entra a editar y escribe `Detén la mezcladora para ajustar`.

## Resumen

- Se edita una copia; la máquina usa el valor recién al confirmar.
- Todo ajuste lleva límites y un paso fijo.
- ESC cancela, para eso se desactiva su vuelta a la pantalla de estado.
- La pantalla muestra si se está editando y qué hace cada tecla.

En la siguiente lección, [Alarmas en pantalla](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/30-alarmas-en-pantalla/), una ventana avisará al operador y esperará que la reconozca.
