<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 36: Un variador por Modbus: marcha y velocidad

**Nivel:** intermedio · **Tiempo:** unos 45 minutos · **Necesitas:** la lección [34](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/34-escribir-la-consigna/)

Un variador de frecuencia cambia la velocidad de un motor trifásico. Sin bus, el PLC le daría una salida por orden (marcha, sentido) y una señal analógica de 0–10 V para la velocidad. Con Modbus, el JWPLC **escribe la orden y la frecuencia en registros** del variador, por los mismos dos hilos.

## Los registros del variador

Vienen en su manual, en hexadecimal (en C++ se escriben con `0x`):

| Registro | Qué es |
|---|---|
| `2000H` | La orden: bits 1–0 = `10` marcha, `01` parada; bits 5–4 = `01` adelante |
| `2001H` | La frecuencia pedida × 100 (3000 = 30,00 Hz) |
| `2103H` | La frecuencia de salida × 100, la que tiene el motor ahora |

Antes, el variador se programa para recibir la orden y la frecuencia por Modbus, y con la misma dirección y velocidad que el maestro. Cada marca lo hace con sus parámetros: búscalos en el manual como «fuente de comando» y «fuente de frecuencia».

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un variador con RS-485 Modbus RTU, en la dirección 1, 9600 bps, 8N1, con un motor trifásico (un ventilador).
- Un pulsador de marcha (NA) y uno de parada (NC).

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.
3. **`I0.0`** marcha (NA), **`I0.1`** parada (NC).

> [!WARNING] Potencia
> La alimentación del variador (R, S) y del motor (U, V, W) es de potencia. Conéctala sin tensión y con protección, como manda el manual del variador.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 36.Un_variador_por_Modbus. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 36. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Primero la frecuencia, después la orden

```cpp
JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_FRECUENCIA, velocidad * 100);
enviarOrden(MARCHA_ADELANTE);
```

Si la orden llegara primero, el motor arrancaría hacia la frecuencia que el variador tenía de antes. Por eso se escribe primero `2001H` y después `2000H`.

### Las órdenes en binario

`0b00010010` se lee de derecha a izquierda: bits 1–0 = `10` (marcha) y bits 5–4 = `01` (adelante). `0b00000001` es parada. Escribirlas en binario deja ver cada bit como en la tabla del manual.

### La rampa

El variador no salta a 30 Hz: sube con su **rampa de aceleración**, unos segundos. Leer `2103H` cada segundo muestra cómo va subiendo. Es la frecuencia **real**, no la pedida.

## Súbelo y pruébalo

1. Sube el programa y aprieta marcha: el motor arranca y la consola muestra la frecuencia subiendo.
2. A los pocos segundos llega a 30 Hz.
3. Aprieta parada: el motor baja por la rampa de desaceleración.

```text
Lección 36: variador por Modbus, marcha I0.0, parada NC I0.1
Ventilador en marcha a 30 Hz
Frecuencia: 7.3 Hz
Frecuencia: 17.3 Hz
Frecuencia: 30.0 Hz
Ventilador detenido
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **El variador responde pero no arranca:** no está programado para tomar la orden por Modbus; revisa la fuente de comando en sus parámetros.
- **Arranca y para solo a los segundos:** muchos variadores paran si dejan de recibir mensajes un tiempo; en la [lección 39](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/39-proyecto-extractor-por-modbus/) se les escribe en cada ciclo.

## Para practicar

- **Cambiar la velocidad:** UP y DOWN cambian la velocidad de a 10 Hz, entre 10 y 60 Hz, y la envían al variador al instante: «Velocidad: 40 Hz».

## Resumen

- Al variador se le escriben la orden (`2000H`) y la frecuencia (`2001H`).
- Primero la frecuencia, después la marcha.
- Los registros del manual vienen en hexadecimal; las órdenes se leen mejor en binario.
- `2103H` da la frecuencia real durante la rampa.

En la siguiente lección, [Varios equipos en el bus](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/37-varios-equipos-en-el-bus/), pones dos esclavos en el mismo par de hilos.
