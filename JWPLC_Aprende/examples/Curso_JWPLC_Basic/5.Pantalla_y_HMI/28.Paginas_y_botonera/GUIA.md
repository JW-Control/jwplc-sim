<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/28-paginas-y-botonera.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 28: Páginas: la botonera recorre la pantalla

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/) y [27](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/27-campos-hmi/)

En 320 × 170 píxeles caben cuatro o cinco datos legibles. Una máquina tiene más: el proceso, los contadores, la hora, los ajustes. Igual que un panel comercial, la pantalla se reparte en **páginas** y la botonera pasa de una a otra.

## Lo que necesitas

- Lo mismo que en la lección 27: el tanque con B1, B2, el selector, la bomba y la descarga.

## Conexiones

Las mismas de la [lección 27](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/27-campos-hmi/).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 28.Paginas_y_botonera. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 28. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### Cada campo dice su página

```cpp
JWPLC_UIValueField(CAMPO_LLENADOS, JWPLC_UIRect(6, 32, 308, 44), JWPLC_UIText("Llenados"),
                   JWPLC_UIValueFormat(5, 0, false, false), ARRIBA, 1, COLORES),
```

El número antes de los colores es la página: 0, 1 o 2. Dos campos de páginas distintas pueden ocupar el mismo lugar de la pantalla. `setUserPage(n)` muestra la página `n` y el package dibuja solo sus campos.

### La botonera sin pasarse

```cpp
if (JWPLC_Buttons.pressed(BTN_RIGHT) && pagina < PAGINAS - 1)
    mostrarPagina(pagina + 1);
```

`pressed()` es una vez por pulsación ([lección 19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/)). El límite evita ir a una página que no existe. El título de cada página lleva `1/3`, `2/3`, `3/3`: el operador sabe dónde está.

### Formatos que ahorran código

`JWPLC_UIDurationFormat(JWPLC_UI_DURATION_MM_SS)` muestra un número de segundos como `mm:ss`; `JWPLC_UIDateTimeFormat(JWPLC_UI_DATETIME_HH_MM_SS)` muestra la hora del RTC ([lección 21](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/)) sin que tu programa la lea.

## Súbelo y pruébalo

1. Sube el programa: la página **PROCESO 1/3**.
2. RIGHT: **CONTADORES 2/3** con los llenados y el horómetro de la bomba. RIGHT: **RELOJ 3/3**.
3. RIGHT otra vez no hace nada: es la última. LEFT vuelve.

```text
Lección 28: páginas, LEFT y RIGHT; tanque B1 I0.0, B2 I0.1, selector I0.2
Página 1
Página 2
Página 3
Página 2
```

## Si algo no funciona

- **Los campos de dos páginas se mezclan:** revisa el número de página de cada campo.
- **Una pulsación salta dos páginas:** usaste `isDown()` en lugar de `pressed()`.
- **La hora sale en cero:** el RTC no tiene hora; ajústala como en la [lección 21](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/).

## Para practicar

- **Vuelta completa:** RIGHT en la última página vuelve a la primera (pista: `%`) y el mensaje dice `Página N de 4`.
- **Página de mantenimiento:** una cuarta página donde OK pone los contadores a cero y escribe `Contadores a cero`.

## Resumen

- Cada campo lleva su página; `setUserPage()` elige cuál se ve.
- LEFT y RIGHT con `pressed()` y límites recorren las páginas.
- Los formatos de duración y de fecha y hora muestran sin cálculos.

En la siguiente lección, [Ajustar parámetros](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/29-ajustar-parametros/), el operador cambiará un tiempo desde la pantalla.
