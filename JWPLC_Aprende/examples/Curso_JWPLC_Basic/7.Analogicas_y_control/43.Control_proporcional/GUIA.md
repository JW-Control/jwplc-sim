<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-7/43-control-proporcional.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 43: Control proporcional: presión constante

**Nivel:** intermedio · **Tiempo:** unos 45 minutos · **Necesitas:** las lecciones [36](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus/) y [41](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/41-control-on-off/)

El hidroneumático de la lección 41 funciona, pero la presión sube y baja todo el tiempo entre 3 y 5 bar, y la bomba arranca muchas veces. Los equipos modernos de **presión constante** usan un variador: la bomba gira más rápido cuando se gasta más agua y más lento cuando se gasta menos, y la presión se queda quieta.

Eso es un **lazo de control**:

1. **Medir** la presión.
2. **Comparar** con la **consigna** (la presión que se quiere): `error = consigna - presión`.
3. **Actuar**: cambiar la frecuencia según el error.

## Proporcional

El control más simple es el **proporcional** (P): cuanto más falta, más rápido.

```text
frecuencia = base + KP × error
```

Con `KP = 20`, si faltan 0,5 bar, la bomba va 10 Hz por encima de la base. `KP` es la **ganancia**: más ganancia, más reacción; demasiada, y la presión oscila.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- VF1: variador en la dirección 1 con la bomba (como en la [lección 36](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus/)).
- PT1: transmisor de presión de 0 a 10 bar con RS-485, en la dirección 2, instalado en la tubería de salida.
- Un pulsador de marcha (NA) y uno de parada (NC).

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, en cadena, como en la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/).
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 7.Analogicas_y_control → 43.Control_proporcional. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 7, lección 43. Los equipos ya vienen cableados en el **Esquema**; la presión del transmisor y el consumo del edificio se cambian en su símbolo.

## Cómo funciona el programa

### Medir, calcular, actuar

Cada 500 ms, el `loop()` lee la presión, calcula la frecuencia y la escribe al variador. Medio segundo es suficiente para una red de agua; un lazo de temperatura puede ir cada varios segundos.

### Los límites

```cpp
frecuencia = constrain(frecuencia, MIN_HZ, MAX_HZ);
```

`constrain()` deja el valor dentro de 20…60 Hz. Bajo 20 Hz la bomba no levanta presión y el motor se calienta; sobre 60 Hz se sale de su potencia.

### El error de régimen

Mira la consola: la presión se estabiliza en unos 3,5 bar, no en 4,0. La bomba necesita unos 49 Hz para dar el agua que se gasta; con `base = 40`, el control P solo llega a 49 Hz si **falta** presión: `40 + 20 × 0,45 = 49`. Ese resto se llama **error de régimen**. Subir `KP` lo achica, pero la presión empieza a oscilar. En la siguiente lección, el control PI lo elimina.

## Súbelo y pruébalo

1. Sube el programa y aprieta marcha: la bomba acelera y la presión sube.
2. Espera: la presión se queda un poco bajo 4,0 bar.
3. Abre más grifos: la presión baja un poco más y la bomba acelera.

```text
Lección 43: control P de presión, consigna 4,0 bar, marcha I0.0, parada NC I0.1
Control en marcha
Presión: 2.61 bar · 60.0 Hz
Presión: 3.19 bar · 56.2 Hz
Presión: 3.52 bar · 49.6 Hz
Presión: 3.55 bar · 49.0 Hz
```

## Si algo no funciona

- **«Sin respuesta del transmisor»:** revisa A y B, la dirección y la velocidad (9600, 8N1), como en la Unidad 6.
- **La presión sube y baja sin parar:** `KP` es demasiado grande; bájalo a la mitad.
- **La bomba no arranca:** la marcha llega, pero el variador no está en modo Modbus (lección 36).

## Para practicar

- **Consigna ajustable:** UP y DOWN cambian la consigna de a 0,5 bar, entre 3,0 y 6,0 bar, con «Consigna: 4.5 bar». Comprueba que la presión sube con ella.

## Resumen

- Un lazo de control mide, compara con la consigna y actúa.
- El control P actúa en proporción al error.
- Los límites cuidan la bomba.
- El control P deja un error de régimen.

En la siguiente lección, [Control PI](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/44-control-pi/), la parte integral elimina ese error.
