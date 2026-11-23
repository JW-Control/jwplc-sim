<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-1/01-hola-jwplc.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 01: Hola, JWPLC

**Nivel:** iniciación · **Tiempo:** unos 15 minutos · **Necesitas:** el package instalado ([Primeros pasos](https://jw-control.com/wiki/jwplc-basic/primeros-pasos/))

Todo curso de programación empieza con un programa que dice «hola». Parece poco, pero comprueba que la cadena completa funciona: tu PC, el cable, Arduino IDE, el package y el equipo. Si este programa funciona, todo lo demás también puede funcionar.

Al terminar sabrás cómo está armado cualquier programa del JWPLC Basic, cómo mandar mensajes a la PC y qué es una variable.

## ¿Qué hay dentro del JWPLC Basic?

El corazón del equipo es un **microcontrolador ESP32**: una computadora diminuta en un solo chip, con su procesador, su memoria y sus conexiones. A diferencia de una PC, no tiene Windows ni aplicaciones: ejecuta **un solo programa**, el que tú le cargues, desde que se enciende hasta que se apaga.

Ese programa lo escribes en **Arduino IDE**, en lenguaje C++, y lo envías al equipo por el cable USB-C. A eso se le llama **subir** o **cargar** el programa. El programa queda guardado en el equipo: aunque lo desconectes de la PC y lo vuelvas a encender, sigue funcionando.

> [!TIP] ¿Por qué Arduino?
> Arduino es la forma más usada en el mundo de programar microcontroladores. Hay miles de ejemplos, foros y librerías. El package del JWPLC Basic agrega al Arduino IDE todo lo propio del equipo: sus entradas, sus relés, su pantalla y sus comunicaciones.

## Las dos partes de todo programa

Todo programa de Arduino tiene, como mínimo, dos bloques:

| Bloque | Cuándo se ejecuta | Para qué sirve |
|---|---|---|
| `setup()` | **Una sola vez**, al encender o reiniciar el equipo | Preparar lo que el programa necesita |
| `loop()` | **Sin parar**, una y otra vez, mientras el equipo esté encendido | Hacer el trabajo de la máquina |

Piensa en el turno de un operario: al llegar, una sola vez, se pone el uniforme y revisa la máquina (eso es `setup()`). Después repite su tarea durante todo el turno (eso es `loop()`). Un PLC trabaja igual: su ciclo se repite miles de veces por segundo.

## El Monitor Serie: la ventana para ver qué piensa el equipo

El JWPLC Basic puede enviar texto a la PC por el mismo cable USB-C con el que lo programas. En Arduino IDE ese texto se lee en el **Monitor Serie**. Es tu herramienta principal para entender qué está haciendo el programa: a lo largo del curso lo usarás para ver valores, avisos y errores.

Para que el equipo y la PC se entiendan, los dos deben usar la misma **velocidad**, medida en **baudios** (bits por segundo). En este curso siempre usamos **115200 baudios**.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC (positivo a `L+`, negativo a `M`).
- Un cable USB-C **con datos**. Algunos cables solo cargan y no sirven para programar.
- Arduino IDE con el package instalado ([Primeros pasos](https://jw-control.com/wiki/jwplc-basic/primeros-pasos/)).

## El programa

Este programa saluda una vez al arrancar y, después, muestra cada segundo cuántos segundos lleva encendido.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 1.Primeros_pasos → 01.Hola_JWPLC. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 1.Primeros_pasos / 01.Hola_JWPLC**.

## Cómo funciona el programa

Vamos por partes.

### Una caja para guardar un dato

```cpp
uint32_t segundos = 0;
```

Esta línea crea una **variable**: una caja con nombre donde el programa guarda un dato que puede cambiar. La caja se llama `segundos` y empieza con el valor `0`.

`uint32_t` es el **tipo** de la variable: dice qué clase de dato guarda. El nombre se lee por partes: `u` de *unsigned*, sin signo (nunca es negativo); `int`, número entero; `32`, ocupa 32 bits; y `_t`, es un tipo. Con 32 bits se puede contar hasta más de 4 000 millones: sirve para contar mucho tiempo sin quedarse corto.

En este curso siempre usamos tipos que dicen su tamaño: `uint8_t`, `uint16_t`, `uint32_t` (o `int8_t`, `int16_t`, `int32_t` si el número puede ser negativo). Así sabes exactamente qué cabe en cada variable, sin depender de la placa.

La variable está escrita **fuera** de `setup()` y de `loop()`. Así la pueden usar los dos bloques y conserva su valor entre una vuelta y otra.

### Preparar todo, una sola vez

```cpp
Serial.begin(115200);
```

`Serial.begin()` abre la comunicación con la PC a 115200 baudios. Va en `setup()` porque basta con hacerlo una vez.

```cpp
Serial.println("Hola, JWPLC");
Serial.println("Este mensaje sale una sola vez, desde setup().");
```

`Serial.println()` escribe un texto en el Monitor Serie y salta a la línea siguiente. El texto va entre comillas. Como está en `setup()`, este saludo aparece **una sola vez**.

### El trabajo que se repite

```cpp
Serial.print("Segundos encendido: ");
Serial.println(segundos);
```

`Serial.print()` escribe **sin** saltar de línea, así que el número queda al lado del texto. Fíjate que `segundos` va sin comillas: no queremos escribir la palabra «segundos», sino el **valor** que guarda la variable.

```cpp
delay(1000);
```

`delay()` detiene el programa la cantidad de **milisegundos** que le indiques. 1000 milisegundos son 1 segundo.

```cpp
segundos++;
```

`++` suma 1 a la variable. Es una forma corta de escribir `segundos = segundos + 1;`. Después de esta línea, `loop()` llega a su final y vuelve a empezar: escribe el nuevo valor, espera un segundo, suma 1, y así sin parar.

> [!TIP] El punto y coma
> En C++ cada instrucción termina con `;`. Olvidarlo es el error más común al empezar: Arduino IDE te avisará al compilar, normalmente señalando la línea **siguiente** a la que le falta.

## Súbelo y pruébalo

1. Conecta el equipo a la PC con el cable USB-C.
2. En **Herramientas → Placa**, elige **JWPLC Basic**; en **Herramientas → Puerto**, elige el puerto del equipo.
3. Pulsa **Subir** (el botón con la flecha). Arduino IDE compila el programa y lo envía al equipo.
4. Abre **Herramientas → Monitor Serie** y elige **115200 baudios**.

Verás el saludo una sola vez y, debajo, un número que sube cada segundo:

```text
Hola, JWPLC
Este mensaje sale una sola vez, desde setup().
Segundos encendido: 0
Segundos encendido: 1
Segundos encendido: 2
Segundos encendido: 3
```

## Si algo no funciona

- **No aparece ningún puerto:** el cable puede ser solo de carga. Prueba con otro cable USB-C con datos.
- **El Monitor Serie muestra símbolos raros:** la velocidad no es 115200 baudios.
- **No ves el saludo, solo los números:** el equipo arrancó antes de que abrieras el Monitor Serie. Reinicia el equipo con el Monitor ya abierto y lo verás.
- **Error al compilar:** revisa que la placa elegida sea JWPLC Basic y que no falte ningún `;`.

## Para practicar

- Cambia el texto del saludo y vuelve a subir el programa.
- Haz que el número suba cada medio segundo (500 milisegundos). ¿Qué pasa con el texto «Segundos encendido»? Cámbialo para que diga la verdad.

## Resumen

- El JWPLC Basic ejecuta un solo programa, que escribes en Arduino IDE y subes por USB-C.
- `setup()` se ejecuta una vez al arrancar; `loop()` se repite sin parar.
- `Serial.println()` envía texto al Monitor Serie, a 115200 baudios.
- Una variable es una caja con nombre que guarda un dato; su tipo dice qué clase de dato.

En la siguiente lección, [Encender un relé](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/02-encender-un-rele/), el equipo va a mover algo en el mundo real.
