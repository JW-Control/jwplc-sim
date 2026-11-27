<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-7/44-control-pi.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 44: Control PI: sin error de régimen

**Nivel:** intermedio · **Tiempo:** unos 45 minutos · **Necesitas:** la lección [43](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/43-control-proporcional/)

El control P se quedaba corto porque necesitaba un error para empujar. La parte **integral** (I) resuelve eso: va **sumando** el error en el tiempo.

```text
integral   = integral + KI × error × dt
frecuencia = KP × error + integral
```

Mientras falte presión, la integral sigue creciendo y la bomba acelera. Cuando la presión llega a la consigna, el error es 0 y la integral se **queda** en la frecuencia que hacía falta. La «base» que en la lección 43 había que adivinar, el PI la encuentra solo.

## Anti-windup

Al arrancar, el error es grande durante varios segundos. Sin límite, la integral crecería muy por encima de 60 Hz (eso es el *windup*), y cuando la presión llega, tardaría mucho en bajar: la presión se pasaría de largo. Por eso la integral también se limita a 20…60 Hz.

## ¿Y la D?

Un **PID** suma una tercera parte, la **derivativa**, que frena según lo rápido que cambia el error. Sirve en procesos lentos con mucha inercia, como un horno grande. En presión de agua casi nunca se usa: la medida tiene ruido y la D lo amplifica.

## Lo que necesitas

- El montaje de la lección 43.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, en cadena, como en la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/).
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 7.Analogicas_y_control → 44.Control_PI. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 7, lección 44. Los equipos ya vienen cableados en el **Esquema**; la presión del transmisor y el consumo del edificio se cambian en su símbolo.

## Cómo funciona el programa

### El PI en una función

```cpp
float pasoPI(float error)
{
    float dt = CICLO_MS / 1000.0;
    integral = constrain(integral + KI * error * dt, MIN_HZ, MAX_HZ);
    return constrain(KP * error + integral, MIN_HZ, MAX_HZ);
}
```

`dt` es el tiempo entre dos ciclos en segundos. Con él, `KI` se lee en Hz por bar por segundo, y no cambia si un día el ciclo pasa a 250 ms.

### Empezar de abajo

Al dar marcha, `integral = MIN_HZ`: la bomba arranca desde el mínimo y el PI la lleva. Si la integral guardara el valor de la marcha anterior, el arranque sería un golpe.

### Sintonizar

`KP` y `KI` se ajustan en la máquina: primero `KP` hasta que la presión responda rápido sin oscilar; después `KI` hasta que el error se borre en pocos segundos. Si la presión se pasa mucho de la consigna, baja `KI`.

## Súbelo y pruébalo

1. Sube el programa y aprieta marcha: la presión sube, se pasa un poco y vuelve a 4,0 bar.
2. Abre más grifos: la presión baja un momento y vuelve a la consigna.
3. Compáralo con la lección 43: ya no queda error.

```text
Lección 44: control PI de presión, consigna 4,0 bar, marcha I0.0, parada NC I0.1
Control en marcha
Presión: 2.73 bar · 60.0 Hz
Presión: 4.01 bar · 59.9 Hz
Presión: 4.29 bar · 55.4 Hz
Presión: 4.11 bar · 51.6 Hz
```

## Si algo no funciona

- **«Sin respuesta del transmisor»:** revisa A y B, la dirección y la velocidad (9600, 8N1), como en la Unidad 6.
- **La presión oscila sin calmarse:** baja `KI`, y después `KP`.
- **Se pasa mucho al arrancar:** revisa que la integral tenga sus límites.

## Para practicar

- **Modo reposo:** si la frecuencia está en el mínimo 5 s seguidos y la presión llegó a la consigna, la bomba para con «Bomba en reposo» (sin consumo gira sin dar agua). En reposo, si la presión baja de 3,5 bar: «Bomba despierta» y el PI sigue.

## Resumen

- La parte integral suma el error y lo lleva a cero.
- El anti-windup limita la integral.
- `dt` hace que las ganancias no dependan del ciclo.
- La D casi no se usa en agua.

En la siguiente lección, [Proyecto: presión constante](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/45-proyecto-presion-constante/), juntas todo en un equipo completo.
