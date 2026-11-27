<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/30-alarmas-en-pantalla.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 30: Alarmas en pantalla

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [27](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/27-campos-hmi/)

Cuando algo falla, no basta con parar: alguien tiene que **enterarse**. Una alarma de verdad tiene dos estados que se miran por separado:

- **La causa**: ¿sigue el problema? (el térmico sigue abierto).
- **El reconocimiento**: ¿alguien la vio? (apretó OK).

La lámpara de falla los muestra a los dos, como en los tableros industriales:

| Lámpara | Significa |
|---|---|
| Parpadea | Alarma nueva, nadie la reconoció |
| Fija | Reconocida, pero la causa sigue |
| Apagada | Reconocida y la causa ya pasó |

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Pulsadores de marcha (NA) y parada (NC), el contacto del relé térmico (NC), un contactor y una lámpara roja.

## Conexiones

1. **`1M`** al **0 V**.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC). **`I0.2`**: contacto 95-96 del térmico (NC).
3. **`Q0.0`**: contactor de la bomba. **`Q0.1`**: lámpara de falla.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 30.Alarmas_en_pantalla. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 30. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### Las ventanas se declaran como los campos

```cpp
const JWPLC_UIPopup VENTANAS[] = {
    JWPLC_UIPopupCrit(ALARMA_TERMICO, "TERMICO", "Bomba detenida por sobrecarga. OK para reconocer.", "A01")};
```

`JWPLC_UIPopupCrit` es una ventana roja que queda abierta hasta que alguien aprieta OK. Lleva su número, un título, el mensaje y un código (`A01`) que el operador puede buscar en el manual. Para un aviso que no es grave está `JWPLC_UIPopupWarn`, en amarillo. `setPopups(VENTANAS, n)` las entrega en `setup()`.

### Abrir en el flanco, una vez

```cpp
if (alarma && !alarmaAntes)
{
    reconocida = false;
    JWPLC_Display.showPopup(ALARMA_TERMICO);
    ventanaAbierta = true;
}
```

La ventana se abre cuando la causa **aparece**, no mientras sigue: si no, se abriría de nuevo apenas el operador la cierra.

### Reconocer es cerrar la ventana

```cpp
if (ventanaAbierta && !JWPLC_Display.popupActive())
```

OK cierra la ventana y `popupActive()` pasa a `false`. Ese cambio es el reconocimiento: el programa lo anota y la lámpara deja de parpadear.

### La lámpara

```cpp
bool parpadeo = (millis() / 500) % 2 == 0;
bool h1 = (!reconocida && parpadeo) || (reconocida && alarma);
```

`millis() / 500` cambia cada medio segundo; su resto entre 2 alterna 0 y 1: un parpadeo sin temporizador.

## Súbelo y pruébalo

1. Sube el programa y arranca la bomba.
2. Abre el térmico: la bomba para, aparece **A01 TERMICO** y la lámpara parpadea.
3. OK: la ventana se cierra y la lámpara queda fija. Cierra el térmico: se apaga.

```text
Lección 30: alarmas, marcha I0.0, parada NC I0.1, térmico NC I0.2, falla Q0.1
Bomba en marcha
Alarma A01: térmico
Bomba detenida
A01 reconocida
A01: térmico normal
```

## Si algo no funciona

- **La ventana vuelve a abrirse sola:** `showPopup()` está fuera del flanco y se llama en cada vuelta.
- **Nunca se marca reconocida:** falta comparar `ventanaAbierta` con `popupActive()`; la ventana CRIT no avisa de otra forma.
- **La lámpara no parpadea:** revisa que el parpadeo dependa de `!reconocida`.

## Para practicar

- **Reconocer para arrancar:** con una alarma sin reconocer, marcha no arranca y escribe `Reconozca la alarma A01` (como mucho una vez por segundo).
- **Marcha larga:** con la bomba más de 15 s en marcha, una ventana WARN y `Alarma A02: marcha larga`, una vez por arranque. La bomba sigue.

## Resumen

- Una alarma tiene causa y reconocimiento, y se muestran los dos.
- Las ventanas se declaran con `setPopups()` y se abren con `showPopup()` en el flanco.
- Reconocer es cerrar la ventana: `popupActive()` pasa a `false`.
- La lámpara parpadea sin reconocer, queda fija con la causa presente.

En la siguiente lección, [Tendencias](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/31-tendencias/), la pantalla mostrará cómo viene la máquina, no solo cómo está.
