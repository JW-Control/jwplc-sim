<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 19: La botonera del frente: ajustar sin la PC

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/) y [07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/)

Hasta ahora, cada vez que había que cambiar un tiempo de la máquina, cambiabas una constante y volvías a subir el programa. En una planta eso no pasa: el operador no tiene la PC, ni el código, ni permiso para tocarlo. Lo que sí tiene es el frente del equipo.

Con esta lección empieza la **Unidad 4, el equipo por dentro**: lo que el JWPLC Basic trae y un Arduino no. Lo primero, la **botonera** de seis teclas al lado de la pantalla: UP, DOWN, LEFT, RIGHT, OK y ESC.

## La botonera ya está leída

Las teclas no van a las entradas `I0.x`: tienen su propio circuito, una pequeña matriz. El package la revisa solo, en segundo plano, muchas veces por segundo, y deja el resultado en el objeto **`JWPLC_Buttons`**. Tu programa solo pregunta.

| Función | Qué responde | Cuándo usarla |
|---|---|---|
| `JWPLC_Buttons.pressed(BTN_OK)` | `true` **una vez** por cada pulsación | Contar, cambiar un valor, confirmar |
| `JWPLC_Buttons.released(BTN_OK)` | `true` una vez al **soltar** | Acciones al soltar |
| `JWPLC_Buttons.isDown(BTN_OK)` | `true` **mientras** siga apretada | Mantener apretado, combinaciones |
| `JWPLC_Buttons.clearPendingInput()` | Borra las pulsaciones pendientes | Al arrancar el programa |

`pressed()` ya hace lo que en la [lección 07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/) hacías a mano con el flanco de subida: aunque el operador deje el dedo un segundo sobre la tecla, `pressed()` es verdadero en una sola vuelta del `loop()`. Además, quita el rebote de los contactos.

Los nombres de las teclas son `BTN_UP`, `BTN_DOWN`, `BTN_LEFT`, `BTN_RIGHT`, `BTN_OK` y `BTN_ESC`.

> [!WARNING] No llames a update()
> En el JWPLC Basic la botonera se revisa sola. Si copias un ejemplo de otra placa que llama a `update()` en el `loop()`, quítalo: la revisión doble se come pulsaciones.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un contactor con bobina de 24 V DC (la bomba dosificadora), o una lámpara.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`Q0.0`**: bobina del contactor de la bomba.

La botonera no se cablea: está en el frente del equipo.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 19.La_botonera_del_frente. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 19. La botonera está en la pestaña **Placa** y también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### Descartar lo que pasó al arrancar

```cpp
JWPLC_Buttons.clearPendingInput();
```

El equipo tarda unas décimas de segundo en arrancar. Si alguien tocó una tecla en ese momento, la pulsación quedó guardada y el programa la atendería apenas empieza. `clearPendingInput()` la descarta: el programa empieza en limpio.

### Subir y bajar con límites

```cpp
if (JWPLC_Buttons.pressed(BTN_UP) && tiempoDosis < TIEMPO_MAX)
{
    tiempoDosis = tiempoDosis + 1;
    Serial.printf("Tiempo: %lu s\n", tiempoDosis);
}
```

Una pulsación, un segundo más, pero solo si todavía no llegó al máximo. El límite de abajo es igual de importante: `tiempoDosis` es `unsigned long` (sin signo), y si le restas 1 a 0 no da -1, da 4 294 967 295. Y la dosis tendría un tiempo absurdo.

### La dosis

```cpp
if (dosificando && millis() - inicioDosis >= tiempoDosis * 1000)
```

El temporizador de la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/): OK anota la hora de inicio, y la bomba para cuando pasan `tiempoDosis` segundos (por 1000, porque `millis()` cuenta milisegundos). Mientras tanto el `loop()` sigue girando, así que ESC puede cancelar en cualquier momento.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. UP dos veces: el tiempo sube a 5 s.
3. OK: la bomba se pone en marcha 5 segundos.
4. OK otra vez y, antes de que termine, ESC: la dosis se cancela.

```text
Lección 19: botonera del frente, bomba dosificadora Q0.0
Tiempo: 3 s
Tiempo: 4 s
Tiempo: 5 s
Dosificando 5 s
Dosis completa
Dosificando 5 s
Dosis cancelada
```

## Si algo no funciona

- **Una pulsación sube varias veces:** usaste `isDown()` donde iba `pressed()`. `isDown()` es verdadero en todas las vueltas del `loop()` mientras la tecla siga apretada.
- **El tiempo da un salto enorme al bajar:** falta el límite de abajo; con `unsigned long`, 0 - 1 da la vuelta al máximo.
- **El ajuste se pierde al cortar la energía:** es lo esperado por ahora. En la [lección 22](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/) lo guardarás en la FRAM.

## Para practicar

- **Aviso de límite:** al llegar a 10 s (o a 1 s), escribe **una sola vez** `Límite: 10 s` en lugar de no hacer nada. Pista: una función `cambiarTiempo(int paso)` que reciba +1 o -1, y un `bool enLimite` para no repetir el aviso.
- **Mantener apretado:** si UP o DOWN siguen apretados, después de 600 ms el tiempo cambia solo cada 200 ms, como el control remoto de un televisor. Pista: al `pressed()` anota la hora; mientras `isDown()` siga en `true` y pasen 600 ms, un paso cada 200 ms.

## Resumen

- La botonera del frente se lee con el objeto `JWPLC_Buttons`; el package la revisa solo.
- `pressed()` es **un evento**: verdadero una vez por pulsación, sin rebote y con el flanco hecho.
- `isDown()` es **un estado**: verdadero mientras la tecla siga apretada.
- `clearPendingInput()` al arrancar descarta lo que se apretó antes de tiempo.
- Todo ajuste del operador necesita límites, y con `unsigned long` el de abajo es obligatorio.

En la siguiente lección, [El buzzer](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/20-el-buzzer/), harás que la máquina avise con sonido antes de arrancar y cuando algo falla.
