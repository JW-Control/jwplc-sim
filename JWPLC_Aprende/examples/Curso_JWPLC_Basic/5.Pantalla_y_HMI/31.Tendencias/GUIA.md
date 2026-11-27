<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/31-tendencias.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 31: Tendencias: el ritmo de la cinta en una gráfica

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [13](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/) y [27](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/27-campos-hmi/)

Un número dice cómo está la máquina **ahora**: 14 piezas por minuto. Una **tendencia** dice cómo **viene**: si hace dos minutos eran 30 y está cayendo, algo pasa en la línea aunque todavía produzca.

En esta lección la cinta del reto 07 cuenta piezas y la pantalla dibuja su ritmo como una curva que avanza un punto por segundo.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Pulsadores de marcha (NA) y parada (NC), un sensor inductivo PNP al final de la cinta y el contactor del motor.

## Conexiones

1. **`1M`** al **0 V**.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC). **`I0.2`**: sensor de piezas B1.
3. **`Q0.0`**: contactor del motor de la cinta.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 31.Tendencias. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 31. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### La gráfica con nombres

```cpp
JWPLC_UITrendConfig configurarGrafica()
{
    JWPLC_UITrendConfig grafica;
    grafica.sampleIntervalMs = 1000;    // un punto por segundo
    grafica.visibleSamples = 120;       // se ven los últimos 2 minutos
    grafica.scaleMode = 1;              // escala fija
    ...
    return grafica;
}
```

La tendencia tiene muchos ajustes: cada cuánto toma un punto, cuántos se ven, la escala, los colores, líneas de umbral. En lugar de una lista de veinte números, una función los arma con su nombre, uno por línea; lo que no se nombra queda con su valor por defecto. `JWPLC_UIRange(0, 60)` fija la escala de 0 a 60 piezas por minuto.

### setTrend en cada vuelta

```cpp
JWPLC_Display.setTrend(CAMPO_GRAFICA, (float)ritmo);
```

Se llama en cada vuelta, como `setValue()`. El package guarda un punto cada `sampleIntervalMs` y corre la curva hacia la izquierda.

### Una ventana que se desliza

El ritmo se cuenta en los últimos 30 s, partidos en 6 casilleros de 5 s (un arreglo, como en la [lección 13](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/)). Cada pieza suma en el casillero actual; cada 5 s se suman los 6, se pasa al siguiente casillero y se vacía. La suma son las piezas de 30 s; por 2, las de un minuto. Así el ritmo responde en segundos y no salta con cada pieza.

## Súbelo y pruébalo

1. Sube el programa y arranca la cinta.
2. Pasa una pieza cada 2 o 3 segundos: cada 5 s el ritmo sube y la curva lo dibuja.
3. Deja de pasar piezas: en 30 s el ritmo vuelve a cero.

```text
Lección 31: tendencias, marcha I0.0, parada NC I0.1, sensor B1 I0.2
Cinta en marcha
Ritmo: 6 piezas/min, total 3
Ritmo: 14 piezas/min, total 7
Ritmo: 22 piezas/min, total 11
```

## Si algo no funciona

- **La curva no avanza:** `setTrend()` tiene que llamarse en cada vuelta, no solo cuando cambia el ritmo.
- **La curva se sale de la gráfica:** con `scaleMode = 1` la escala es fija; ajusta `JWPLC_UIRange`.
- **El ritmo salta de a mucho:** estás contando la pieza en cada vuelta mientras el sensor la ve; cuenta el flanco de subida.

## Para practicar

- **Ritmo bajo:** con la ventana de 30 s llena y menos de 12 piezas por minuto, escribe `Ritmo bajo: N piezas/min` una vez y enciende `Q0.1`. Al volver a 12 o más, `Ritmo normal`.
- **Línea de mínimo:** dibuja el 12 como una línea roja punteada con `thresholdCount`, `thr1Value` y `thr1Color`.

## Resumen

- Una tendencia muestra cómo viene la máquina.
- La configuración se arma con nombres en una función.
- `setTrend()` en cada vuelta; el package toma los puntos.
- Un ritmo se mide en una ventana que se desliza, con un arreglo de casilleros.

En la siguiente lección, [Proyecto: la HMI de una cinta de lotes](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/32-proyecto-hmi-cinta-de-lotes/), juntarás toda la unidad en una máquina.
