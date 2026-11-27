<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-5/32-proyecto-hmi-cinta-de-lotes.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 32: Proyecto: la HMI de una cinta de lotes

**Nivel:** intermedio · **Tiempo:** unos 60 minutos · **Necesitas:** las lecciones [28](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/28-paginas-y-botonera/) a [31](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/31-tendencias/)

Este proyecto cierra la unidad. La máquina es una cinta que llena lotes: arranca, cuenta piezas y para sola al completar el lote. Si en marcha pasan 20 s sin piezas, la cinta está atascada: para y salta una alarma.

La pantalla tiene tres páginas, y cada una es una lección de la unidad:

| Página | Muestra | Viene de |
|---|---|---|
| 1 · PROCESO | Cinta, lote (`7 / 10`), total y ritmo | Lecciones 26 y 27 |
| 2 · RITMO | El ritmo en una curva | Lección 31 |
| 3 · AJUSTES | Piezas por lote, guardado en la FRAM | Lecciones 22 y 29 |

LEFT y RIGHT cambian de página ([lección 28](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/28-paginas-y-botonera/)); la alarma es una ventana que se reconoce con OK ([lección 30](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/30-alarmas-en-pantalla/)).

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Pulsadores de marcha (NA) y parada (NC), un sensor inductivo PNP, el contactor del motor y una lámpara roja.

## Conexiones

1. **`1M`** al **0 V**.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC). **`I0.2`**: sensor de piezas B1.
3. **`Q0.0`**: contactor del motor de la cinta. **`Q0.1`**: lámpara de falla.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 5.Pantalla_y_HMI → 32.Proyecto_HMI_cinta_de_lotes. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 5, lección 32. La pantalla se ve en la pestaña **Placa**; la botonera también responde a las flechas, Enter y Esc del teclado.

## Cómo funciona el programa

### El loop() en partes

Con tres páginas, una edición y una alarma, el `loop()` crecería a doscientas líneas. Se parte en funciones con nombre: `leerBotonera()`, `contarRitmo()` y el bloque de la cinta. Cada una se lee sola, como las pestañas de la [lección 16](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/16-programa-en-pestanas/).

### Quién se queda con la botonera

```cpp
if (alarmaAbierta)
    return;
```

Las mismas seis teclas sirven para tres cosas, así que hay un orden: con la ventana de alarma abierta, OK es de la ventana; editando, UP, DOWN, OK y ESC son de la edición y LEFT y RIGHT no cambian de página; el resto del tiempo, LEFT y RIGHT recorren las páginas y OK en AJUSTES empieza a editar.

### El atasco

```cpp
if (cinta && millis() - ultimaPieza >= ATASCO_MS)
```

`ultimaPieza` se anota al arrancar y con cada pieza. Si pasan 20 s sin que cambie, la cinta para y se abre la ventana **A01 ATASCO**. Es el temporizador de la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/) usado como vigilante.

### Todo a la pantalla, en cada vuelta

Al final del `loop()` se escriben todos los campos de las tres páginas. El package dibuja solo los de la página visible y solo los que cambiaron, y la tendencia sigue tomando puntos aunque no se vea.

## Súbelo y pruébalo

1. Sube el programa: **PROCESO 1/3**, lote `0 / 10`.
2. Marcha y pasa diez piezas: la cinta para sola.
3. RIGHT: la curva del ritmo. RIGHT: **AJUSTES**; OK, UP y OK dejan 11 piezas por lote. Corta la energía: el ajuste sigue.
4. Marcha sin piezas: a los 20 s, **A01 ATASCO** y la lámpara parpadea. OK la reconoce.

```text
Lección 32: cinta de lotes, marcha I0.0, parada NC I0.1, sensor B1 I0.2, falla Q0.1
Lote: 10 piezas
Cinta en marcha
Lote completo: 10 piezas
Cinta en marcha
Alarma A01: atasco
A01 reconocida
```

## Si algo no funciona

- **OK al reconocer también entra a editar:** `leerBotonera()` tiene que salir apenas la ventana está abierta.
- **La alarma salta apenas arranca:** `ultimaPieza` no se anota al arrancar y quedó con la hora de la última pieza del lote anterior.
- **El lote no recupera su tamaño:** revisa la dirección y la versión de `readBlock()` y `writeBlock()`.

## Para practicar

- **Tiempo de cada lote:** al completar un lote, escribe `Lote N completo en mm:ss`, con N contando desde el encendido.
- **Reconocer para arrancar:** con la ventana A01 abierta, marcha no arranca y escribe `Reconozca la alarma A01`, como mucho una vez por segundo.

## Resumen

- Una HMI completa junta estado, tendencia, ajustes y alarmas.
- El `loop()` se parte en funciones con nombre.
- La botonera se reparte con un orden: alarma, edición, páginas.
- Un atasco se detecta por tiempo sin cambios.

Con esto termina la Unidad 5. La siguiente, **RS-485 y Modbus RTU**, conecta el JWPLC Basic con otros equipos por el bus.
