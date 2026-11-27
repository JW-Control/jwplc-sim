<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/26-la-pantalla.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 26: La pantalla: el estado de la máquina a la vista

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** la lección [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/)

Hasta ahora, para saber qué hacía la máquina había que mirar el contactor o abrir el Monitor Serie. Un tablero de verdad tiene una pantalla en la puerta: el operador mira y sabe.

Con esta lección empieza la **Unidad 5, pantalla y HMI**. El JWPLC Basic trae una pantalla a color de 320 × 170 píxeles al lado de la botonera. Al encenderlo muestra su **pantalla de estado** (las entradas, las salidas, la red); tu programa puede pasar a **su propia pantalla** y dibujar lo que quiera.

## Dos funciones que llama el package

La pantalla la maneja el package. Tu programa no la refresca en el `loop()`: escribe dos funciones con nombres fijos y el package las llama cuando toca.

| Función | Cuándo la llama | Para qué |
|---|---|---|
| `jwplcUIEnter()` | Una vez, al entrar a tu pantalla | Dibujar lo que no cambia: fondo, título, líneas |
| `jwplcUIUpdate()` | Varias veces por segundo mientras se ve | Dibujar lo que cambia |

Las dos llevan `extern "C"` delante: es la forma en que el package las encuentra.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador de marcha (NA), uno de parada (NC) y un contactor con bobina de 24 V DC.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: pulsador de marcha (NA). **`I0.1`**: pulsador de parada (NC).
3. **`Q0.0`**: bobina del contactor de la bomba.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 26.La_pantalla. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 26. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### Entrar a tu pantalla

```cpp
if (!pantallaLista && JWPLC_Display.isReady())
{
    pantallaLista = true;
    JWPLC_Display.enterUserUI();
}
```

La pantalla tarda un momento en arrancar. Cuando `isReady()` responde `true`, `enterUserUI()` pasa de la pantalla de estado a la tuya, una sola vez. Con `setIdleReturnMode(IDLE_RETURN_ESC_ONLY)`, ESC vuelve a la pantalla de estado y OK trae la tuya otra vez.

### Dibujar solo cuando cambia

```cpp
if (dibujado)
    return;
dibujado = true;
```

Borrar y dibujar un recuadro de 300 × 80 lleva tiempo y se ve como un parpadeo. Por eso `jwplcUIUpdate()` dibuja solo si `dibujado` es `false`, y el `loop()` lo pone en `false` cuando el motor cambia. Es la misma idea del flanco de la [lección 07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/): actuar en el cambio, no en cada vuelta.

### Colores y texto

Los colores van en **RGB565**, el formato de la pantalla: 5 bits de rojo, 6 de verde y 5 de azul en un número de 16 bits. El package trae los básicos (`JWPLC_TFT_GREEN`, `JWPLC_TFT_RED`, `JWPLC_TFT_CYAN`…); un gris es `0x7BEF`. `setTextSize(4)` hace cada letra de 24 × 32 píxeles, y con eso se calcula dónde empieza el texto para quedar centrado.

> [!WARNING] Sin tildes
> La fuente de la pantalla no trae letras con tilde ni la ñ. Escribe «ULTIMO» o «ANO» en la pantalla; en el Monitor Serie sí puedes usar tildes.

## Súbelo y pruébalo

1. Sube el programa: tras la pantalla de estado aparece la tuya con **PARADA** en rojo.
2. Aprieta marcha: el recuadro pasa a **MARCHA** en verde.
3. Aprieta parada: vuelve a **PARADA**. ESC muestra la pantalla de estado; OK vuelve a la tuya.

```text
Lección 26: la pantalla, bomba P1 marcha I0.0, parada NC I0.1
Motor en marcha
Motor detenido
```

## Si algo no funciona

- **La pantalla parpadea:** estás dibujando el recuadro en cada llamada. Revisa que `dibujado` se ponga en `true` y que el `loop()` solo lo ponga en `false` cuando el motor cambia.
- **Queda la pantalla de estado:** falta `enterUserUI()` o se llama antes de que `isReady()` sea `true`.
- **Al volver con OK falta el título:** el título va en `jwplcUIEnter()`, que el package llama cada vez que se entra.

## Para practicar

- **Contador de arranques:** muestra `Arranques: N` debajo del recuadro y súmalo en cada arranque.
- **Falla del térmico:** con un térmico NC en `I0.2`, si abre, la bomba para, enciende `Q0.1` y el recuadro dice **FALLA** en naranja.

## Resumen

- La pantalla la maneja el package: tu programa escribe `jwplcUIEnter()` y `jwplcUIUpdate()`.
- `enterUserUI()` pasa a tu pantalla cuando `isReady()` lo permite.
- Se dibuja lo fijo al entrar y lo que cambia solo cuando cambia.
- Colores RGB565 y sin tildes en la pantalla.

En la siguiente lección, [Campos HMI](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/27-campos-hmi/), dejarás de dibujar a mano: declaras los campos y el package los dibuja.
