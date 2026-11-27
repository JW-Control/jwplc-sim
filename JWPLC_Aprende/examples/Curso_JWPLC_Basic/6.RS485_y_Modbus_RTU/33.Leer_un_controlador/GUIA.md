<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 33: El bus RS-485: leer un controlador de temperatura

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [01](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/01-hola-jwplc/) (Monitor Serie)

Hasta ahora cada señal llegaba por su propio cable: un pulsador, un borne. Pero en un tablero hay equipos que saben mucho más que «sí o no»: un controlador de temperatura conoce la temperatura, la consigna y sus alarmas. Para pedirle todo eso basta un par de hilos: el **bus RS-485**.

Con esta lección empieza la **Unidad 6, RS-485 y Modbus RTU**. El RS-485 es el cable (dos hilos, A y B, hasta unos 1000 m); **Modbus RTU** es el idioma que se habla por él, el más común en la industria.

## Maestro, esclavos y direcciones

- El JWPLC es el **maestro**: es el único que pregunta.
- Cada equipo es un **esclavo**: responde solo cuando la pregunta lleva **su dirección** (de 1 a 247).
- Lo que un equipo sabe está en **registros** numerados, que vienen en su hoja de datos (su «mapa Modbus»).

| Tipo | Función para leer | Qué guarda |
|---|---|---|
| Entrada discreta | 02 | Un bit que solo se lee (una entrada) |
| Bobina | 01 / escribir 05, 15 | Un bit que se escribe (una salida) |
| Registro input | 04 | Un número de 16 bits que solo se lee (una medida) |
| Registro holding | 03 / escribir 06, 16 | Un número de 16 bits que se lee y escribe (un ajuste) |

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un controlador de temperatura con RS-485 y Modbus RTU, configurado en la dirección 1, 9600 bps, 8N1.
- Cable trenzado de dos hilos (par de datos).

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 33.Leer_un_controlador. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 33. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Arrancar el maestro

```cpp
JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1)
```

`begin()` abre el puerto RS-485 a 9600 bps, 8 bits, sin paridad y 1 bit de parada. El controlador debe estar configurado igual: si las dos puntas no hablan a la misma velocidad, solo llega ruido. Si `begin()` falla, `lastErrorString()` dice por qué.

### Una pregunta por segundo

```cpp
JWPLC_ModbusRTU.readInputRegistersSync(CONTROLADOR, 0, 1, registros)
```

Función 04: al equipo 1, desde el registro 0, leer 1 registro. La respuesta queda en `registros[0]`. **Sync** quiere decir que la función espera la respuesta antes de seguir; tarda unos milisegundos. Se pregunta una vez por segundo porque la temperatura de un horno no cambia más rápido.

### Décimas y signo

El controlador manda la temperatura en **décimas**: 253 es 25,3 °C. Así un número entero lleva un decimal. Se copia a un `int16_t` antes de dividir: así 65 526 se lee como −10, y las temperaturas bajo cero salen bien.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200.
2. Cada segundo aparece la temperatura que muestra el controlador en su display.
3. Calienta la sonda con la mano: el número sube.

```text
Lección 33: Modbus RTU, controlador de temperatura en la dirección 1
Temperatura: 25.0 °C
Temperatura: 25.3 °C
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **La temperatura sale 10 veces más grande:** falta dividir entre 10; revisa en la hoja de datos cuántos decimales trae el registro.

## Para practicar

- **El estado del controlador:** lee 2 registros desde el 0. El segundo es el estado: escribe «Calentando» o «Resistencia apagada» cuando cambia el bit 0.
- **La alarma:** con el bit 1, escribe «Alarma de temperatura» una vez y enciende H1 (`Q0.0`).

## Resumen

- RS-485 es el cable de dos hilos; Modbus RTU, el idioma.
- El JWPLC es el maestro y pregunta; cada esclavo responde a su dirección.
- `readInputRegistersSync()` lee registros input (función 04).
- Los registros son enteros de 16 bits: las décimas y el signo se arreglan en el programa.

En la siguiente lección, [Escribir la consigna](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/34-escribir-la-consigna/), el JWPLC deja de solo mirar y cambia un ajuste del controlador.
