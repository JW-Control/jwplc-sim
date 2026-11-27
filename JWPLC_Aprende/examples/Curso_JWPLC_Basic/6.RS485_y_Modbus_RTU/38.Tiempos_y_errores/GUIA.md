<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/38-tiempos-y-errores.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 38: Tiempos y errores: cuando un equipo no responde

**Nivel:** intermedio · **Tiempo:** unos 45 minutos · **Necesitas:** la lección [37](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/37-varios-equipos-en-el-bus/)

Un cable se suelta, un equipo se apaga, entra ruido. En el bus, tarde o temprano una pregunta se queda sin respuesta. El maestro no espera para siempre: espera un **timeout** (aquí 300 ms) y da la pregunta por fallida.

Con las funciones **Sync** de las lecciones anteriores, el `loop()` se queda parado esperando. Con el cable cortado, cada pregunta cuesta el timeout entero y la máquina se pone lenta: los pulsadores responden tarde.

## La API cooperativa

Un PLC de verdad no se detiene a esperar. El package trae la versión **cooperativa**:

| Función | Qué hace |
|---|---|
| `requestReadInputRegisters(..., timeoutMs)` | Lanza la pregunta y vuelve enseguida |
| `task()` | En cada vuelta del `loop()`, atiende el bus un paso |
| `masterBusy()` | ¿Hay una pregunta en curso? |
| `masterDone()` / `masterSucceeded()` | ¿Terminó? ¿Salió bien? |
| `clearMasterResult()` | Libera el resultado para la pregunta siguiente |

## Lo que necesitas

- El montaje de la lección 33.
- Un contactor para la resistencia del horno y una lámpara de alarma.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.
3. **`Q0.0`** contactor KM1 de la resistencia. **`Q0.1`** lámpara de alarma H1.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 38.Tiempos_y_errores. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 38. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Preguntar solo con el bus libre

```cpp
if (!JWPLC_ModbusRTU.masterBusy() && !JWPLC_ModbusRTU.masterDone() && millis() - ultimaPregunta >= CADA_MS)
```

Una pregunta a la vez: si hay una en curso, o un resultado sin leer, se espera la vuelta siguiente.

### El resultado

Cuando `masterDone()` da `true`, `masterSucceeded()` dice si llegó la respuesta. Si llegó, se actualiza la temperatura y se pone `fallasSeguidas` en cero. Si no, se suma una falla y `lastErrorString()` dice el motivo («Timeout»). Siempre se termina con `clearMasterResult()`.

### El problema que queda

El control usa `temperatura`, **la última conocida**. Con el cable cortado, el programa sigue prendiendo la resistencia con un dato viejo: el horno puede pasarse sin que nadie lo sepa. Por eso en la práctica decides la **falla segura**: con 3 fallas seguidas (no con una, que puede ser ruido), la resistencia se apaga y se avisa.

## Súbelo y pruébalo

1. Sube el programa: la resistencia prende bajo 38 °C y se apaga en 40 °C.
2. Suelta el cable A del bus: cada medio segundo aparece «TC1 no responde» con el motivo.
3. Fíjate que los pulsadores y el resto del programa siguen rápidos.

```text
Lección 38: control por el bus, resistencia Q0.0, alarma Q0.1
Resistencia encendida a 30.0 °C
TC1 no responde (1): Timeout
TC1 no responde (2): Timeout
TC1 no responde (3): Timeout
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **No llegan más respuestas después de la primera:** falta `clearMasterResult()`; sin él, el resultado queda ocupado y no se pregunta otra vez.

## Para practicar

- **Falla de comunicación:** con 3 fallas seguidas, «Falla de comunicación con TC1» una vez, la resistencia apagada y H1 (`Q0.1`) encendida.
- **Recuperación:** con la primera respuesta buena, «Comunicación recuperada», H1 apagada y el control vuelve.

## Resumen

- Una pregunta sin respuesta falla al vencer el timeout.
- La API cooperativa (`request…`, `task()`, `masterDone()`) no detiene el `loop()`.
- Se cuentan fallas seguidas para separar ruido de un equipo perdido.
- Sin datos, la máquina va a su estado seguro.

En la siguiente lección, [Proyecto: el extractor de un horno](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/39-proyecto-extractor-por-modbus/), juntas todo: tres equipos, turnos y falla segura.
