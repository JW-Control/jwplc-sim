<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-9/54-horometro-y-mantenimiento.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 54: Horómetro: el tiempo de marcha que no se pierde

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** la lección [22](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/)

Los rodamientos, los sellos y el aceite de una bomba se gastan cuando el motor **gira**, no cuando pasan los días. Por eso el mantenimiento se programa por **horas de marcha**, y el aparato que las cuenta es el **horómetro**.

El JWPLC lo hace con un contador de segundos guardado en la **FRAM** ([lección 22](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/)): un corte de luz no borra la cuenta. La FRAM aguanta billones de escrituras, así que guardar cada segundo no la gasta (una memoria flash no lo aguantaría).

> [!NOTE] Para probar en minutos
> El aviso de mantenimiento de la práctica usa 20 s. En una bomba real serían unas 2000 horas: solo cambia la constante.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un motor con contactor de bobina 24 V DC y su guardamotor.
- Un pulsador de marcha (NA) y uno de parada (NC).
- Una lámpara amarilla de 24 V DC.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).
3. **`Q0.0`**: bobina de KM1. **`Q0.1`**: lámpara H2 de mantenimiento.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 9.Oficio_industrial → 54.Horometro_y_mantenimiento. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 9, lección 54. Los equipos ya vienen cableados en el **Esquema**; las fallas (bobina cortada, contactos soldados, cable cortado) se provocan con clic derecho sobre cada equipo.

## Cómo funciona el programa

### Contar sin perder milisegundos

```cpp
if (motor && millis() - ultimoSegundo >= 1000)
{
    ultimoSegundo = ultimoSegundo + 1000;
    horas.segundos = horas.segundos + 1;
```

Se suma 1000 a `ultimoSegundo` en vez de poner `millis()`. Si el `loop()` llegó con 3 ms de atraso, ese atraso no se pierde: en un día, poner `millis()` atrasaría el horómetro varios minutos.

### Al arrancar el motor

`ultimoSegundo = millis()` cuando el motor arranca. Si no, el primer segundo contaría también el tiempo que la bomba estuvo parada.

### Guardar al momento

Cada segundo nuevo se escribe en la FRAM con `writeBlock()`. Con un corte, a lo sumo se pierde menos de un segundo.

## Súbelo y pruébalo

1. Sube el programa y da marcha: cada 5 s aparece la marcha acumulada.
2. Apaga y enciende la placa: el horómetro sigue donde estaba.
3. Para el motor: el horómetro se detiene.

```text
Lección 54: horómetro en FRAM, marcha I0.0, parada NC I0.1
Horómetro nuevo en 0
Motor en marcha
Marcha acumulada: 5 s
Marcha acumulada: 10 s
Motor detenido. Marcha acumulada: 12 s
```

## Si algo no funciona

- **Vuelve a 0 en cada encendido:** cambiaste el `struct` sin subir `VERSION`, o `readBlock()` falla y el programa escribe 0.
- **Atrasa:** pones `ultimoSegundo = millis()` dentro del conteo.

## Para practicar

- **Aviso de mantenimiento:** suma `ultimoMantenimiento` al `struct` (y sube `VERSION`). A los 20 s de marcha desde el último mantenimiento: H2 encendida y «Mantenimiento: lubricar la bomba» una vez. Con OK: `ultimoMantenimiento = segundos`, guardado, «Mantenimiento registrado» y H2 apagada.

## Resumen

- El mantenimiento va por horas de marcha.
- El horómetro vive en la FRAM.
- Sumar 1000 no pierde los milisegundos sobrantes.

En la siguiente lección, [Recetas](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/55-recetas/), la misma máquina hace varios productos.
