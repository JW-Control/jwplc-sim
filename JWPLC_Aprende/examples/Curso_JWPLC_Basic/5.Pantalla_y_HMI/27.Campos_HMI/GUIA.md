<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/27-campos-hmi.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 27: Campos HMI: el tanque en la pantalla

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [26](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/26-la-pantalla/)

Dibujar con coordenadas sirve para un recuadro, pero una pantalla de máquina tiene diez datos: calcular dónde va cada uno y cuándo repintarlo se vuelve un trabajo aparte.

Los equipos HMI comerciales lo resuelven con **campos**: dices qué dato va, en qué lugar y cómo se muestra, y el equipo lo dibuja. El package del JWPLC Basic hace lo mismo.

| Campo | Muestra | Se actualiza con |
|---|---|---|
| `JWPLC_UITextField` | Un texto | `setText(id, "texto")` |
| `JWPLC_UIBoolField` | Uno de dos textos, con su color | `setBool(id, true)` |
| `JWPLC_UIValueField` | Un número con formato | `setValue(id, 12)` |
| `JWPLC_UIBarField` | Una barra de 0 a 100 | `setBar(id, 75)` |

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un tanque con dos sensores de nivel, una bomba con contactor, una electroválvula de descarga y un selector.

## Conexiones

1. **`1M`** al **0 V**.
2. **`I0.0`**: sensor de nivel bajo B1. **`I0.1`**: sensor de nivel alto B2. **`I0.2`**: selector de habilitación.
3. **`Q0.0`**: contactor de la bomba. **`Q0.1`**: válvula de descarga. **`Q0.2`**: lámpara de nivel bajo.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 27.Campos_HMI. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 27. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### La pantalla se declara una vez

```cpp
const JWPLC_UIField CAMPOS[] = {
    JWPLC_UITextField(CAMPO_ESTADO, JWPLC_UIRect(6, 6, 200, 44), JWPLC_UIText("Estado", nullptr, 10), ARRIBA, 0, COLORES),
    ...
};
```

Cada campo lleva un número (el `enum Campo`), un rectángulo `JWPLC_UIRect(x, y, ancho, alto)`, un rótulo, un estilo, la página (0 por ahora) y sus colores. En `setup()`, `setFields(CAMPOS, n)` se la entrega al package.

### Estilo y colores

`JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_STACKED, JWPLC_UI_ALIGN_LEFT)`: valor en tamaño 2, rótulo en tamaño 1, con marco, el rótulo arriba y el valor abajo a la izquierda. `JWPLC_UIColors(rótulo, valor, fondo, marco)` reúne los cuatro colores. Definirlos una vez como constantes (`ARRIBA`, `COLORES`) deja todos los campos iguales.

### Escribir en cada vuelta

```cpp
JWPLC_Display.setText(CAMPO_ESTADO, estado);
JWPLC_Display.setBool(CAMPO_BOMBA, bomba);
JWPLC_Display.setValue(CAMPO_LLENADOS, llenados);
```

Se escriben todos los campos en cada vuelta del `loop()`. Con `USER_REFRESH_ON_DEMAND`, el package compara con lo que ya mostró y solo repinta el que cambió: no hace falta la bandera `dibujado` de la lección anterior.

## Súbelo y pruébalo

1. Sube el programa y pon el selector en habilitado.
2. Con el tanque bajo B1, la bomba arranca: **LLENANDO**, **MARCHA** en verde y la barra avanza.
3. Al llegar a B2 para: **EN NIVEL** y **Llenados** sube en 1.

```text
Lección 27: campos HMI, tanque B1 I0.0, B2 I0.1, selector I0.2
Bomba en marcha
Tanque lleno. Llenados: 1
```

## Si algo no funciona

- **No aparece ningún campo:** falta `setFields()` en `setup()` o `enterUserUI()` en el `loop()`.
- **Un campo se corta:** su rectángulo es chico para el tamaño de letra; con tamaño 2 cada letra mide 12 × 16 píxeles.
- **Un texto sale truncado:** la capacidad de `JWPLC_UIText(rótulo, unidad, capacidad)` es menor que el texto.

## Para practicar

- **Último llenado:** agrega un campo «Ultimo llenado» en segundos y escribe `Llenado en N s` al llenar.
- **Llenado lento:** si la bomba lleva 20 s en marcha sin llegar a B2, para, escribe `Falla: llenado lento` y espera que el selector pase a 0 y vuelva a 1.

## Resumen

- Los campos se declaran una vez en un arreglo y se entregan con `setFields()`.
- Texto, sí/no, número y barra se actualizan con `setText`, `setBool`, `setValue` y `setBar`.
- Se escribe en cada vuelta; el package repinta solo lo que cambió.

En la siguiente lección, [Páginas](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/28-paginas-y-botonera/), repartirás los campos en varias pantallas y la botonera las recorrerá.
