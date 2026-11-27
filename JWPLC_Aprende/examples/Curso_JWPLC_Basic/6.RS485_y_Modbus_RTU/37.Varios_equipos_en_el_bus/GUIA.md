<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/37-varios-equipos-en-el-bus.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 37: Varios equipos en el bus: un horno con ventilación

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [33](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/) y [35](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/35-modulo-de-e-s-remotas/)

La ventaja grande del bus: **varios equipos en el mismo par de hilos**. Cada uno tiene su dirección y el maestro les habla por turno, como el profesor que pasa lista.

En esta lección el horno de la lección 33 gana un ventilador de extracción:

| Dirección | Equipo | Qué hace |
|---|---|---|
| 1 | TC1, controlador de temperatura | Da la temperatura |
| 3 | IO1, módulo de E/S remotas | DO1 manda el contactor del ventilador |

> [!WARNING] Una dirección, un equipo
> Si dos equipos tienen la misma dirección, responden a la vez y las dos respuestas se mezclan en el cable. Antes de montar el bus, anota la dirección de cada equipo en el plano.

## Lo que necesitas

- El montaje de la lección 33 y el módulo de E/S remotas de la lección 35.
- Un contactor para el ventilador.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.
3. En el módulo: **DO1** contactor del ventilador.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 37.Varios_equipos_en_el_bus. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 37. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Un ciclo, dos turnos

Cada 500 ms:

1. **Turno del controlador:** leer 2 registros desde el 0 (temperatura y estado).
2. **Decidir:** el ventilador arranca a 45 °C y para a 40 °C. Es la **histéresis** que ya usaste: con un solo número el contactor tiritaría alrededor del límite.
3. **Turno del módulo:** escribir las 8 salidas.

### Un error no detiene al otro equipo

Si el controlador no responde, el `return` salta el ciclo: sin temperatura no se decide. Si el que falla es el módulo, solo se avisa «IO1 no responde» y la próxima vuelta lo intenta otra vez. Cada equipo se revisa por separado.

## Súbelo y pruébalo

1. Sube el programa con el horno frío: el ventilador está apagado.
2. Calienta sobre 45 °C: el ventilador arranca.
3. Deja enfriar bajo 40 °C: el ventilador para.

```text
Lección 37: dos equipos en el bus, TC1 dirección 1, IO1 dirección 3
Ventilador encendido a 47.0 °C
Ventilador apagado a 38.0 °C
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **Solo responde uno de los dos:** el otro tiene otra velocidad o su dirección está repetida.

## Para practicar

- **La puerta:** lee DI1 del módulo (la puerta del horno). Con la puerta abierta el ventilador para y se escribe «Puerta abierta» una vez.
- **La alarma:** con el bit de alarma del controlador, enciende la lámpara en DO2.

## Resumen

- Varios esclavos comparten el bus, cada uno con su dirección.
- El maestro les pregunta por turno, en un ciclo.
- Direcciones repetidas mezclan las respuestas.
- Cada equipo se revisa por separado.

En la siguiente lección, [Tiempos y errores](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/38-tiempos-y-errores/), ves qué pasa cuando un equipo deja de responder y cómo protegerse.
