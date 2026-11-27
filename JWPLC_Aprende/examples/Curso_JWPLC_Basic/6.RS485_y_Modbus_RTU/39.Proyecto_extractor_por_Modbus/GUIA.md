<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/39-proyecto-extractor-por-modbus.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 39: Proyecto: el extractor de un horno, todo por Modbus

**Nivel:** intermedio · **Tiempo:** unos 60 minutos · **Necesitas:** las lecciones [36](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus/) a [38](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/38-tiempos-y-errores/)

El proyecto de la unidad: el extractor de aire de un horno industrial. Tres equipos en el mismo bus y el JWPLC como maestro.

| Dirección | Equipo | Uso |
|---|---|---|
| 1 | VF1, variador | Mueve el motor del extractor |
| 2 | TC1, controlador | Da la temperatura del horno |
| 3 | IO1, E/S remotas | DI1 selector «Automático», DO1 lámpara de marcha |

La velocidad sigue a la temperatura: bajo 40 °C el extractor para, de 40 a 50 °C va a 30 Hz y desde 50 °C a 60 Hz.

## Turnos, como un semáforo

Con tres equipos y la API cooperativa, el bus se recorre por **turnos**: en cada turno se lanza una pregunta, se espera su resultado sin detener el `loop()` y se pasa al siguiente. Es una máquina de estados como el semáforo de la [lección 11](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados/):

`LEER_TEMPERATURA → LEER_ENTRADAS → ESCRIBIR_FRECUENCIA → ESCRIBIR_ORDEN → ESCRIBIR_SALIDAS → otra vez`

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un variador con su motor (dirección 1), un controlador de temperatura (dirección 2) y un módulo de E/S remotas (dirección 3), todos a 9600 bps, 8N1.
- Un selector de dos posiciones y una lámpara.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.
3. En el módulo: **DI1** selector «Automático», **DO1** lámpara de marcha.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 39.Proyecto_extractor_por_Modbus. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 39. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Una función por tarea

- `preguntar()` lanza la pregunta del turno actual con un `switch` y devuelve si el bus la aceptó.
- `usarRespuesta(bien)` guarda lo que llegó: la temperatura o el selector. Si no llegó, lo avisa con el número de turno.
- `decidirVelocidad()` aplica la tabla de temperaturas.
- `siguienteTurno()` decide después de leer las entradas y avanza: `(turno + 1) % 5` vuelve a 0 después del último.

### El loop(), muy corto

```cpp
JWPLC_ModbusRTU.task();
if (!preguntando)
    ...preguntar()...
else if (JWPLC_ModbusRTU.masterDone())
    ...usarRespuesta(), clearMasterResult(), siguienteTurno()...
```

Si el bus no acepta la pregunta, el turno se da por fallido y se pasa al siguiente: el ciclo nunca se queda atascado.

### Escribir siempre al variador

El variador para solo si pasa 3 s sin mensajes del maestro: es su protección por si se corta el bus. Por eso la frecuencia y la orden se escriben **en todas las vueltas** del ciclo, aunque no hayan cambiado.

## Súbelo y pruébalo

1. Sube el programa con el selector en manual: el extractor está parado.
2. Pasa a automático y calienta el horno: a 40 °C arranca a 30 Hz y desde 50 °C va a 60 Hz.
3. Suelta el cable A del controlador: la consola muestra el turno 0 sin respuesta, pero el variador y el módulo siguen contestando.

```text
Lección 39: extractor por Modbus, VF1 dir. 1, TC1 dir. 2, IO1 dir. 3
Extractor: 0 Hz (30.0 °C)
Extractor: 30 Hz (45.0 °C)
Extractor: 60 Hz (55.0 °C)
Turno 0 sin respuesta: Timeout
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **El extractor arranca y para cada pocos segundos:** el ciclo tarda más de 3 s; baja `TIMEOUT_MS` o revisa que ningún turno quede esperando.

## Para practicar

- **Falla segura:** con 3 fallas seguidas al leer TC1, «Sin temperatura: extractor al máximo» una vez, el extractor a 60 Hz y H2 (DO2) encendida. En un horno, sin saber la temperatura, ventilar es lo seguro.
- **Recuperación:** con la primera lectura buena, «Temperatura recuperada», H2 apagada y la velocidad vuelve a seguir a la temperatura.

## Resumen

- Tres equipos en un bus, cada uno con su dirección.
- Los turnos recorren el bus sin detener el `loop()`.
- Al variador se le escribe en cada ciclo para que no pare.
- La falla segura depende de la máquina.

Con esta lección terminas la **Unidad 6**. Vuelve al [temario](https://jw-control.com/wiki/curso-jwplc-basic/) para ver las unidades siguientes.
