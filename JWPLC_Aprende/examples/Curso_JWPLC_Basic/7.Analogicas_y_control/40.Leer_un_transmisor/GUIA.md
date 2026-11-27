<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-7/40-leer-un-transmisor.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 40: Un transmisor: de un número a una presión

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** la lección [33](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/)

Con esta lección empieza la **Unidad 7, analógicas y control**. Hasta ahora casi todo era «sí o no»: un pulsador, un sensor, un contactor. Pero una máquina también vive de **cantidades**: cuánta presión hay en la tubería, a qué temperatura está el horno, cuánto nivel tiene el tanque.

El JWPLC Basic recibe esas medidas por el bus RS-485, de **transmisores** con salida Modbus. Un transmisor de presión, por ejemplo, convierte la presión de la tubería en un número dentro de un registro.

## Escalar y validar

Un número no es una presión todavía. Antes de usarlo hay dos pasos:

| Paso | Qué es | En este transmisor |
|---|---|---|
| **Escalar** | Pasar el número a la unidad de la máquina | Registro 0 = bar × 100: 325 es 3,25 bar |
| **Validar** | Reconocer cuándo el número no es una medida | 32767 = sensor abierto |

La hoja de datos de cada transmisor dice su escala y su valor de falla. Otros mandan décimas, o un 4-20 mA que hay que llevar a 0-100 %: la idea es la misma.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un transmisor de presión de 0 a 10 bar con RS-485 y Modbus RTU, en la dirección 1, 9600 bps, 8N1.
- Dos lámparas de 24 V DC.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, en cadena, como en la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/).
2. **`Q0.0`**: lámpara H1, falla del sensor. **`Q0.1`**: lámpara H2, presión baja (para la práctica).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 7.Analogicas_y_control → 40.Leer_un_transmisor. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 7, lección 40. Los equipos ya vienen cableados en el **Esquema**; la presión del transmisor y el consumo del edificio se cambian en su símbolo.

## Cómo funciona el programa

### Leer

```cpp
JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros)
```

Como en la lección 33: función 04, registro 0, del equipo 1. Se pregunta cada medio segundo y se escribe una línea por segundo, para que la consola se pueda leer.

### Validar antes de escalar

```cpp
sensorBien = registros[0] != SENSOR_ABIERTO;
```

32767 no es una presión: es el transmisor diciendo «mi sensor está abierto». Si se escalara igual, el programa creería que hay 327 bar. Por eso primero se valida, y solo con el sensor bien se actualiza `presion`. El aviso se escribe en el **flanco**, una vez.

### Escalar

```cpp
presion = registros[0] / 100.0;
```

El `.0` importa: `registros[0] / 100` sería una división entera y 325 daría 3, no 3,25.

## Súbelo y pruébalo

1. Sube el programa: cada segundo aparece la presión en bar.
2. Abre un grifo cerca: la presión baja.
3. Desconecta el sensor del transmisor: «Sensor de presión abierto» y H1 se enciende.

```text
Lección 40: transmisor de presión 0-10 bar en la dirección 1
Presión: 3.00 bar
Presión: 2.95 bar
Sensor de presión abierto
```

## Si algo no funciona

- **«Sin respuesta del transmisor»:** revisa A y B, la dirección y la velocidad (9600, 8N1), como en la Unidad 6.
- **La presión sale 100 veces más grande:** falta dividir entre 100; revisa la escala en la hoja de datos.
- **Sale en números enteros:** divides entre `100` en vez de `100.0`.

## Para practicar

- **Presión baja con histéresis:** bajo 2,0 bar, «Presión baja» una vez y H2 (`Q0.1`) encendida. La alarma solo se normaliza sobre 2,5 bar, con «Presión normal». Entre 2,0 y 2,5 bar no cambia nada: así no titila cuando la presión ronda el límite.

## Resumen

- Una medida analógica llega como número: hay que escalarla y validarla.
- La escala y el valor de falla vienen en la hoja de datos.
- Se valida antes de escalar.
- Una alarma analógica lleva histéresis.

En la siguiente lección, [Control on-off](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/41-control-on-off/), la presión manda la bomba.
