<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-7/41-control-on-off.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 41: Control on-off: el hidroneumático

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** la lección [40](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/40-leer-un-transmisor/)

Muchos edificios tienen un **hidroneumático**: una bomba y un tanque con aire a presión. La bomba llena el tanque; los departamentos gastan; la presión baja y la bomba vuelve a arrancar.

Tradicionalmente eso lo hace un **presostato**, un interruptor que se abre y se cierra con la presión. Con un transmisor y el JWPLC se hace lo mismo, pero con los límites en el programa y con la medida a la vista.

## Dos límites

| Presión | La bomba |
|---|---|
| Menos de 3,0 bar | Arranca |
| 5,0 bar o más | Para |
| Entre las dos | Sigue como estaba |

Es la histéresis de la lección 40 aplicada a una salida. Con un solo límite, la bomba arrancaría y pararía varias veces por segundo alrededor de él, y un motor se quema con tantos arranques.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- El transmisor de presión de la lección 40.
- Una bomba con contactor de bobina 24 V DC, guardamotor y su tanque hidroneumático.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, en cadena, como en la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/).
2. **`Q0.0`**: bobina del contactor KM1 de la bomba.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 7.Analogicas_y_control → 41.Control_on_off. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 7, lección 41. Los equipos ya vienen cableados en el **Esquema**; la presión del transmisor y el consumo del edificio se cambian en su símbolo.

## Cómo funciona el programa

### Medir en una línea

```cpp
sensorBien = JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros) && registros[0] != SENSOR_ABIERTO;
```

La medida es buena si el transmisor respondió **y** no mandó el valor de falla. Con `&&`, si la lectura falla ni siquiera se mira el registro.

### Decidir con la histéresis

```cpp
if (presion < ARRANCA_BAJO)
    bomba = true;
if (presion >= PARA_EN)
    bomba = false;
```

Las dos condiciones no se tocan: entre 3,0 y 5,0 bar ninguna se cumple y `bomba` conserva su valor. Es el enclavamiento de la [lección 08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/), con la presión en lugar de los pulsadores.

### Sin medida, sin bomba

Si el sensor falla, la bomba para. Sin saber la presión, la bomba podría seguir hasta reventar una tubería. En la lección 45 verás que en otras máquinas la falla segura es otra.

## Súbelo y pruébalo

1. Sube el programa con el tanque descargado: la bomba arranca bajo 3,0 bar.
2. Espera: al llegar a 5,0 bar, la bomba para.
3. Abre grifos: la presión baja y la bomba arranca otra vez en 3,0 bar.

```text
Lección 41: control on-off, bomba KM1 en Q0.0, arranca < 3,0 bar, para en 5,0 bar
Bomba en marcha a 2.50 bar
Bomba parada a 5.01 bar
```

## Si algo no funciona

- **«Sin respuesta del transmisor»:** revisa A y B, la dirección y la velocidad (9600, 8N1), como en la Unidad 6.
- **La bomba arranca y para seguido:** los límites están muy juntos, o el tanque hidroneumático perdió su aire.

## Para practicar

- **Tiempo mínimo de marcha:** una vez que arranca, la bomba trabaja al menos 10 s aunque la presión llegue a 5,0 bar. Guarda `arranque = millis()` al arrancar y, al parar, escribe «Bomba parada tras N s».

## Resumen

- El control on-off con histéresis es un presostato hecho programa.
- Dos límites separados evitan los arranques seguidos.
- Sin medida, la bomba no trabaja a ciegas.

En la siguiente lección, [Rampas](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/42-rampas/), aprendes a llevar una velocidad de a poco a su valor.
