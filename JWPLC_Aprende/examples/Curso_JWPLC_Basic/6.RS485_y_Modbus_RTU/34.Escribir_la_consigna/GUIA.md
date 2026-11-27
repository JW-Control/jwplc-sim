<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/34-escribir-la-consigna.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 34: Escribir un registro: la consigna del horno

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [33](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/)

Leer la temperatura sirve para mostrarla. Pero el operador también quiere **cambiar** a qué temperatura trabaja el horno sin abrir el tablero ni tocar el controlador.

Eso es escribir un **registro holding**: un ajuste que se lee y se escribe. La consigna del controlador (SV, *set value*) está en el holding 0, también en décimas.

| Función | Hace | En el package |
|---|---|---|
| 03 | Leer registros holding | `readHoldingRegistersSync()` |
| 06 | Escribir un registro holding | `writeSingleRegisterSync()` |

## Lo que necesitas

- El montaje de la lección 33.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 34.Escribir_la_consigna. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 34. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Ajustar sin enviar

UP y DOWN cambian la variable `consigna` de a 5 °C, entre 20 y 90 °C. Mientras tanto no sale nada por el bus: el operador elige con calma y **confirma** con OK. Es la misma idea del ajuste de parámetros de la [lección 29](https://jw-control.com/wiki/curso-jwplc-basic/unidad-5/29-ajustar-parametros/).

### Escribir con OK

```cpp
JWPLC_ModbusRTU.writeSingleRegisterSync(CONTROLADOR, 0, consigna * 10)
```

Función 06: al equipo 1, en el holding 0, el valor `consigna × 10`. Si el controlador acepta, responde con el mismo dato y la función devuelve `true`. Si no responde, se avisa: una consigna que no llegó no se da por hecha.

### Los límites en el programa

El controlador tiene sus propios límites, pero el programa también pone los suyos. Así nadie manda 900 °C por error.

## Súbelo y pruébalo

1. Sube el programa: la consigna empieza en 40 °C.
2. Aprieta UP: «Consigna: 45 °C (OK para enviar)»; el controlador todavía muestra la anterior.
3. Aprieta OK: el display del controlador cambia a 45.

```text
Lección 34: escribir la consigna, UP/DOWN cambian, OK envía
Consigna: 40 °C
Temperatura: 25.0 °C
Consigna: 45 °C (OK para enviar)
Consigna enviada: 45 °C
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **El controlador responde con error:** ese registro puede estar bloqueado en su configuración; revisa en su manual si la escritura por Modbus está permitida.

## Para practicar

- **Empezar desde la consigna real:** al arrancar, lee el holding 0 y empieza desde él: «Consigna actual: 35 °C».
- **Confirmar:** después de enviar, lee de vuelta el holding 0 y escribe «Consigna confirmada: N °C».

## Resumen

- Los registros holding se leen (03) y se escriben (06).
- Se ajusta en local y se envía al confirmar.
- Los límites van también en el programa.
- Una escritura sin respuesta no se da por hecha.

En la siguiente lección, [El módulo de E/S remotas](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/35-modulo-de-e-s-remotas/), llevas entradas y salidas hasta una máquina lejana con solo dos hilos.
