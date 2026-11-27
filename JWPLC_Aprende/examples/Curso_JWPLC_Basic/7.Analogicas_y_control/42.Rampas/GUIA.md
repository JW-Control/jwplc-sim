<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-7/42-rampas.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 42: Rampas: llegar a la velocidad de a poco

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** la lección [36](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus/)

Pasar una bomba de 0 a 50 Hz en un instante es un golpe: el agua se acelera de golpe en la tubería (el **golpe de ariete**) y el motor pide un pico de corriente. Pararla de golpe es otro golpe.

Una **rampa** lleva un valor hacia su objetivo de a poco, a un ritmo fijo: aquí, 5 Hz por segundo. El variador tiene sus propias rampas, pero la del programa sirve para mucho más: llevar una temperatura a su consigna en una hora, abrir una válvula de a poco o cambiar la consigna de presión sin saltos.

## Un paso por ciclo

La rampa se escribe como un paso pequeño en cada ciclo:

- si `actual` está bajo el `objetivo`, sube un paso, sin pasarse;
- si está sobre, baja un paso, sin pasarse.

Con un ciclo de 200 ms y 5 Hz/s, cada paso es de 1 Hz.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- El variador con su motor de la lección 36, en la dirección 1.
- Un pulsador de marcha (NA) y uno de parada (NC).

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, en cadena, como en la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/).
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 7.Analogicas_y_control → 42.Rampas. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 7, lección 42. Los equipos ya vienen cableados en el **Esquema**; la presión del transmisor y el consumo del edificio se cambian en su símbolo.

## Cómo funciona el programa

### La rampa en una función

```cpp
void pasoDeRampa()
{
    float paso = HZ_POR_SEGUNDO * CICLO_MS / 1000.0;
    if (actual < objetivo)
        actual = min(actual + paso, objetivo);
    if (actual > objetivo)
        actual = max(actual - paso, objetivo);
}
```

`min()` y `max()` evitan pasarse: si faltan 0,4 Hz y el paso es 1 Hz, `actual` queda justo en el objetivo. La misma función sirve para subir y para bajar.

### Objetivo y valor actual

La marcha solo cambia el **objetivo** a 50 Hz; quien mueve la frecuencia es la rampa, ciclo a ciclo. Separar «a dónde voy» de «dónde estoy» es la idea de toda rampa.

### Escribir en cada ciclo

La frecuencia y la orden se escriben cada 200 ms. Además de seguir la rampa, el variador sabe así que el maestro sigue ahí (lección 39).

## Súbelo y pruébalo

1. Sube el programa y aprieta marcha: la frecuencia sube 5 Hz por segundo hasta 50 Hz.
2. Mira la consola: un aviso cada 10 Hz.
3. Aprieta parada: el variador corta enseguida, sin rampa.

```text
Lección 42: rampa de 5 Hz/s, marcha I0.0, parada NC I0.1
Marcha: rampa hacia 50 Hz
Rampa: 10 Hz
Rampa: 20 Hz
Rampa: 30 Hz
Rampa: 40 Hz
Rampa: 50 Hz
Parada
```

## Si algo no funciona

- **«Sin respuesta del transmisor»:** revisa A y B, la dirección y la velocidad (9600, 8N1), como en la Unidad 6.
- **La frecuencia sube más lenta de lo calculado:** el variador también tiene su rampa; si es más lenta que la del programa, manda la del variador.

## Para practicar

- **Rampa de bajada:** con la parada, el objetivo pasa a 0 y la frecuencia baja a 10 Hz/s. Al llegar a 0, la orden de parada al variador y «Detenido en rampa».

## Resumen

- Una rampa acerca un valor a su objetivo de a pasos, sin pasarse.
- Se separa el objetivo del valor actual.
- Sirve para frecuencia, temperatura, presión o una válvula.

En la siguiente lección, [Control proporcional](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/43-control-proporcional/), la frecuencia la decide la presión.
