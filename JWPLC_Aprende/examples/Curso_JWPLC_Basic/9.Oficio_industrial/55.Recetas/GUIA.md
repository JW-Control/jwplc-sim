<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-9/55-recetas.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 55: Recetas: una máquina, varios productos

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [13](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/) y [22](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/)

Una mezcladora hace yogur, crema y batido. El programa es el mismo; lo que cambia son los **números**: cuánto mezcla, cuánto reposa. Ese juego de números es una **receta**.

Sin recetas, cambiar de producto sería cambiar el programa, con el riesgo de equivocarse en cada cambio. Con recetas, el operador elige y la máquina hace lo mismo con otros números.

## Una tabla de structs

```cpp
struct Receta
{
    char nombre[10];
    unsigned long mezclaMs;
    unsigned long reposoMs;
};
```

Cada receta es un `struct` y todas juntas una tabla, como los motores de la [lección 13](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/). Agregar un producto es agregar una línea a la tabla.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- La mezcladora con su contactor de bobina 24 V DC.
- Un pulsador de marcha (NA) y una lámpara verde.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha (NA).
3. **`Q0.0`**: bobina de KM1, la mezcla. **`Q0.1`**: lámpara H1, producto listo.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 9.Oficio_industrial → 55.Recetas. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 9, lección 55. Los equipos ya vienen cableados en el **Esquema**; las fallas (bobina cortada, contactos soldados, cable cortado) se provocan con clic derecho sobre cada equipo.

## Cómo funciona el programa

### Elegir solo con la máquina parada

```cpp
bool libre = paso == PARADA || paso == LISTO;
```

UP y DOWN solo cambian la receta si la máquina no está en un ciclo: cambiar los tiempos a mitad de una mezcla daría un producto que no es ninguno.

### Dar la vuelta

`(elegida + 1) % CANTIDAD` pasa de la última a la primera. Para bajar, `(elegida + CANTIDAD - 1) % CANTIDAD` evita el número negativo.

### El ciclo

Una máquina de estados (`PARADA → MEZCLA → REPOSO → LISTO`) que lee sus tiempos de `RECETAS[elegida]`. El mismo código sirve para las tres recetas.

## Súbelo y pruébalo

1. Sube el programa: la consola muestra la receta 1, YOGUR.
2. UP y DOWN cambian de receta.
3. Marcha: mezcla con los tiempos de la receta elegida y al final H1 se enciende.

```text
Lección 55: recetas con UP/DOWN, marcha I0.0, mezcla KM1 Q0.0, listo H1 Q0.1
Receta 1: YOGUR · mezcla 4 s · reposo 2 s
Receta 2: CREMA · mezcla 6 s · reposo 1 s
Ciclo de CREMA
CREMA listo
```

## Si algo no funciona

- **UP no hace nada:** la máquina está en un ciclo; espera a que termine.
- **El nombre sale cortado:** `nombre[10]` guarda 9 letras; agranda el arreglo.

## Para practicar

- **Recordar la receta:** guarda el número de la receta en la FRAM cada vez que cambia y recupéralo al encender, con «Receta recuperada: N NOMBRE». Valida que el número leído sea menor que `CANTIDAD`.

## Resumen

- Una receta es un juego de números para el mismo programa.
- Una tabla de structs las ordena.
- La receta se cambia solo con la máquina parada.

En la siguiente lección, [Primera falla](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/56-primera-falla/), el tablero dice qué pasó primero.
