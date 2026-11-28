<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-8/51-alarmas-y-tendencia.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 51: Alarmas y tendencia en el panel web

**Nivel:** intermedio · **Tiempo:** unos 45 minutos · **Necesitas:** la lección [50](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/50-consignas-desde-el-celular/)

A veces una caja se traba frente al sensor y la banda sigue empujando. Nadie se entera hasta que se arma un atasco. Con una **alarma** en el panel, el supervisor ve el problema en el celular apenas pasa, sabe qué es y deja constancia de que lo vio.

## Alarmas: el programa dice cuándo, el panel hace el resto

```cpp
JWPLC_Web.addAlarm("atasco", "Caja atascada frente a B1", WEB_ALARMA_ALTA);   // en setup()
JWPLC_Web.setAlarm("atasco", atasco);                                        // en loop()
```

El programa solo dice si la alarma está activa. El panel le pone el texto y la prioridad (`WEB_ALARMA_BAJA`, `MEDIA` o `ALTA`), la muestra en la pestaña **Alarmas** y guarda en el historial cuándo se activó, quién la reconoció y cuándo se fue.

**Reconocer** una alarma no la apaga: deja dicho «la vi, me encargo». La alarma se va cuando el programa la apaga, porque la causa desapareció.

## La tendencia

```cpp
JWPLC_Web.publish("cajas", cajas).trend();
JWPLC_Web.trendEvery(5);
```

`trend()` guarda la variable en la tendencia: 120 puntos, uno cada `trendEvery()` segundos. Con 5 s son los últimos 10 minutos. La pestaña **Tendencias** la dibuja y la descarga en CSV para abrirla en una planilla.

## Lo que necesitas

- El tablero de la lección 49 (B1, S1, S2 y KM1).
- Un piloto rojo H1 de falla.
- Para la práctica, el contacto 95-96 del relé térmico F1 del motor.

## Conexiones

1. **`I0.0`**: sensor B1; **`I0.1`**: S1 (NA); **`I0.2`**: S2 (NC).
2. **`I0.3`**: contacto 95-96 del térmico F1 (NC), para la práctica.
3. **`Q0.0`**: contactor KM1; **`Q0.1`**: piloto H1.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 8.Ethernet_y_Modbus_TCP → 51.Alarmas_y_tendencia. Necesita el package 2.1.0-alpha.19 o posterior, que trae la librería JWPLC_Web.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> En JWPLC Sim: **Aprender**, Unidad 8, lección 51. Para el atasco, deja el sensor B1 accionado más de 3 s y reconoce la alarma en la pestaña Alarmas del panel.

## Cómo funciona el programa

### Detectar el atasco

```cpp
if (sensor && !sensorAntes)
    tapadoDesde = millis();
bool atascoAhora = sensor && millis() - tapadoDesde > 3000;
```

Cada caja tapa el sensor un instante. Si queda tapado más de 3 s seguidos, la caja no avanzó: es un atasco. El flanco de subida marca cuándo empezó a taparse.

### Parar con la falla

```cpp
if (!digitalRead(I0_2) || atasco)
    banda = false;
```

Con el atasco la banda para y no arranca hasta que se destape el sensor. El piloto H1 se enciende mientras dure.

## Súbelo y pruébalo

1. Entra al panel y arranca con S1.
2. Tapa el sensor B1 con la mano más de 3 s: la banda para, H1 se enciende y en el panel aparece la alarma.
3. En **Alarmas**, reconócela: queda tu usuario. Destapa B1 y arranca otra vez.
4. En **Tendencias**, mira la curva de las cajas.

```text
Lección 51: alarma de atasco y tendencia en el panel web
Panel web: http://192.168.1.50/
Caja 1
Alarma: caja atascada
```

## Si algo no funciona

- **La alarma no aparece:** `addAlarm()` va en `setup()` y el id de `setAlarm()` tiene que ser el mismo.
- **La alarma no se va al reconocerla:** es lo esperado. Se va cuando el programa la apaga.
- **La tendencia está vacía:** espera unos segundos; guarda un punto cada `trendEvery()`.

## Para practicar

- **Alarma del térmico:** declara la alarma «termico» («Térmico del motor disparado», prioridad alta). Con el contacto 95-96 de F1 abierto (`I0.3` en 0), enciéndela con `setAlarm()`, para la banda y enciende H1, igual que con el atasco.

## Resumen

- `addAlarm()` declara una alarma con texto y prioridad; `setAlarm()` la enciende o la apaga desde el `loop()`.
- El operador reconoce la alarma en el panel; el historial guarda quién y cuándo.
- `trend()` guarda una variable en la tendencia del panel, con descarga en CSV.

Con esta lección termina la Unidad 8. En la [Unidad 9](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/52-parada-de-emergencia/) empieza el oficio industrial: parada de emergencia, realimentación del contactor y mantenimiento.
