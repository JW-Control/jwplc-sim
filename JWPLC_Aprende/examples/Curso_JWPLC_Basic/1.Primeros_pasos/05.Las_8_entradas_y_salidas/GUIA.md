<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-1/05-las-8-entradas-y-salidas.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 05: Las 8 entradas y las 8 salidas

**Nivel:** iniciación · **Tiempo:** unos 25 minutos · **Necesitas:** las lecciones [03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/) y [04](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/)

Imagina que quieres que cada una de las 8 entradas mande el relé de su mismo número. Con lo que sabes, escribirías 16 líneas casi iguales: leer `I0_0` y escribir `Q0_0`, leer `I0_1` y escribir `Q0_1`, y así hasta la 7. Funciona, pero es largo y, si te equivocas en una línea, cuesta encontrarlo.

Los programadores tienen una regla: **si escribes lo mismo muchas veces, hay una forma mejor**. El JWPLC Basic trae dos funciones pensadas justo para esto: **`digitalReadBlock()`** y **`digitalWriteBlock()`**, que manejan las 8 entradas o los 8 relés **en una sola instrucción**. Para entenderlas necesitas tres ideas: las listas, los bits y el bucle `for`.

## Arreglos: una lista con un solo nombre

Un **arreglo** (en inglés *array*) es una lista de datos guardados uno tras otro bajo un mismo nombre. Para sacar un dato se escribe el nombre y, entre corchetes, su **posición**.

El package del JWPLC Basic ya trae las listas de las entradas y las salidas:

| En la lista | Es lo mismo que |
|---|---|
| `I0_X[0]` | `I0_0` |
| `I0_X[1]` | `I0_1` |
| … | … |
| `I0_X[7]` | `I0_7` |
| `Q0_X[0]` … `Q0_X[7]` | `Q0_0` … `Q0_7` |
| `I0_COUNT` y `Q0_COUNT` | 8: cuántas entradas y salidas hay |

> [!WARNING] Se cuenta desde 0
> La primera posición de una lista es la **0**, no la 1. Por eso las 8 entradas van de `I0_X[0]` a `I0_X[7]`. Coincide con los nombres del equipo, que también empiezan en `I0.0`.

`I0_X` es el **bloque completo** de entradas y `Q0_X` el de salidas. Esas listas son las que reciben las funciones de bloque.

## Bytes y bits: 8 interruptores en un número

Un **bit** es la unidad más pequeña de información: vale 0 o 1, apagado o encendido. Justo como una entrada digital. Un **byte** son **8 bits** juntos, y el JWPLC Basic tiene 8 entradas y 8 relés: un byte alcanza exacto para guardar el estado de todo el bloque.

En el programa, un byte se guarda en una variable **`uint8_t`**. El nombre se lee por partes:

| Parte | Significa |
|---|---|
| `u` | *unsigned*, sin signo: nunca es negativo |
| `int` | número entero |
| `8` | ocupa 8 bits |
| `_t` | es un tipo de dato |

Con 8 bits se puede contar de 0 a 255. Lo mismo vale para `uint16_t` (16 bits, de 0 a 65 535) y `uint32_t` (32 bits, hasta unos 4 300 millones), que usarás más adelante.

Cada bit del byte corresponde a una entrada: el **bit 0** es `I0.0`, el **bit 1** es `I0.1`, y así hasta el **bit 7**, que es `I0.7`. Por ejemplo, con `I0.0` e `I0.3` activas:

| Bit | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|---|---|
| Entrada | `I0.7` | `I0.6` | `I0.5` | `I0.4` | `I0.3` | `I0.2` | `I0.1` | `I0.0` |
| Valor | 0 | 0 | 0 | 0 | **1** | 0 | 0 | **1** |

En binario ese byte se escribe `0b00001001`, con el bit 7 a la izquierda y el bit 0 a la derecha, como las cifras de un número: la de menor valor va al final.

## Las funciones de bloque

| Función | Qué hace |
|---|---|
| `digitalReadBlock(I0_X)` | Lee las 8 entradas a la vez y devuelve un byte con su estado |
| `digitalWriteBlock(Q0_X, valor)` | Escribe los 8 relés a la vez: cada bit de `valor` manda el relé de su número |

Además de ahorrar líneas, tienen una ventaja: `digitalReadBlock()` consulta las 8 entradas **en el mismo instante**, en una sola lectura. Todas las decisiones del programa trabajan con la misma foto del equipo.

> [!TIP] Si vienes de los PLC
> Es lo mismo que leer la palabra de entradas de un PLC (`IB0` o `%IB0`) en lugar de cada bit `I0.0`, `I0.1`… El JWPLC Basic te deja hacer las dos cosas: `digitalRead()` para una entrada y `digitalReadBlock()` para el bloque.

## El bucle for: repetir contando

Para mostrar el byte en el Monitor Serie hay que sacar sus bits **uno por uno**. Un bucle **for** repite un bloque de instrucciones mientras una variable va contando. Tiene tres partes, separadas por `;`:

```text
for (inicio; condición; paso)
```

| Parte | En esta lección | Qué hace |
|---|---|---|
| Inicio | `uint8_t i = 0` | Crea el contador `i` y empieza en 0 |
| Condición | `i < I0_COUNT` | Sigue repitiendo mientras `i` sea menor que 8 |
| Paso | `i++` | Al terminar cada vuelta, suma 1 a `i` |

Así, el bloque se ejecuta 8 veces, con `i` valiendo 0, 1, 2… hasta 7: una vez por cada bit.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Pulsadores o sensores PNP en las entradas que quieras probar. Con uno solo ya se ve el efecto.

## Conexiones

Igual que en la [lección 03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/#conexiones), repetido en cada entrada que uses:

1. **`1M`** al **0 V** de la fuente: un solo cable sirve para las 8 entradas.
2. Cada pulsador, entre **+24 V** y su entrada (`I0.0` a `I0.7`).

## El programa

Cada entrada activa cierra el relé de su mismo número, y cada medio segundo el Monitor Serie muestra cómo están las 8 entradas.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 1.Primeros_pasos → 05.Las_8_entradas_y_salidas. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 1.Primeros_pasos / 05.Las_8_entradas_y_salidas**.

## Cómo funciona el programa

Vamos por partes.

### Leer las 8 entradas de una vez

```cpp
uint8_t entradas = digitalReadBlock(I0_X);
```

`digitalReadBlock()` recibe el bloque `I0_X` y devuelve un byte con el estado de las 8 entradas, que se guarda en la variable `entradas`. Con `I0.0` e `I0.3` activas, `entradas` vale `0b00001001`.

### Escribir los 8 relés de una vez

```cpp
digitalWriteBlock(Q0_X, entradas);
```

`digitalWriteBlock()` recibe el bloque `Q0_X` y el byte. El bit 0 manda `Q0.0`, el bit 1 manda `Q0.1`, y así. Como le pasamos el mismo byte que leímos, cada relé copia a la entrada de su número. Dos líneas hacen el trabajo de dieciséis.

El valor no tiene que venir de las entradas: `digitalWriteBlock(Q0_X, 0b10000001)` cerraría solo `Q0.0` y `Q0.7`, y `digitalWriteBlock(Q0_X, 0)` abriría los 8 relés.

### Mostrar el estado bit por bit

```cpp
Serial.print("Entradas: ");
for (uint8_t i = 0; i < I0_COUNT; i++)
{
    Serial.print(bitRead(entradas, i));
    Serial.print(' ');
}
Serial.println();
```

Primero se escribe «Entradas: » sin saltar de línea. Luego el bucle da 8 vueltas, y en cada una `bitRead(entradas, i)` saca el bit número `i` del byte: 1 si la entrada está activa, 0 si no. Después se escribe un espacio. Al final, `Serial.println()` sin nada adentro solo salta de línea.

Fíjate en el orden: la línea empieza por `I0.0` y termina en `I0.7`, al revés de como se escribe el byte en binario. Así es más fácil leerla de izquierda a derecha.

Y en las comillas: `' '` con comillas **simples** es un solo carácter (un espacio); `"Entradas: "` con comillas **dobles** es un texto.

### La pausa, y un problema que vas a notar

```cpp
delay(500);
```

Sin esta pausa el Monitor Serie se llenaría de líneas. Pero tiene un costo: mientras `delay()` espera, el programa **no lee nada**. Si aprietas un pulsador justo después de una lectura, el relé tarda hasta medio segundo en responder. Pruébalo: vas a notar el retraso. En la próxima unidad aprenderás a resolverlo.

## Súbelo y pruébalo

1. Sube el programa y abre el **Monitor Serie** a **115200 baudios**.
2. Activa una entrada: el relé de su mismo número se cierra.
3. Cada medio segundo verás una línea con el estado de las 8 entradas:

```text
Lección 05: las 8 entradas y los 8 relés en un byte
Entradas: 0 0 0 0 0 0 0 0
Entradas: 1 0 0 0 0 0 0 0
Entradas: 1 0 0 1 0 0 0 0
Entradas: 0 0 0 1 0 0 0 0
```

## Si algo no funciona

- **Ninguna entrada responde:** revisa que `1M` esté conectado a 0 V.
- **Error al compilar en el `for`:** las tres partes van separadas por `;`, no por `,`.
- **Error al compilar en `digitalReadBlock()`:** revisa que la placa elegida sea JWPLC Basic; estas funciones vienen con su package.
- **El relé responde tarde:** es la pausa de 500 ms; es lo esperado en esta lección.

## Para practicar

- Cruza las salidas: que `I0.0` mande `Q0.7`, `I0.1` mande `Q0.6`, y así. Aquí las funciones de bloque no sirven tal cual: usa un `for` con `digitalWrite(Q0_X[7 - i], bitRead(entradas, i))`.
- Cuenta cuántas entradas están activas y muestra el total en el Monitor Serie. Pista: una variable `uint8_t` que empieza en 0 antes del bucle y suma 1 con cada bit en 1.

## Resumen

- Un arreglo es una lista con un solo nombre; sus posiciones se cuentan desde 0. `I0_X` y `Q0_X` son los bloques de entradas y salidas.
- Un byte son 8 bits y se guarda en un `uint8_t`; cada bit es una entrada o un relé, del bit 0 (`I0.0`) al bit 7 (`I0.7`).
- `digitalReadBlock(I0_X)` lee las 8 entradas a la vez y `digitalWriteBlock(Q0_X, valor)` escribe los 8 relés a la vez.
- El bucle `for` repite un bloque mientras un contador avanza; con `bitRead()` sacas cada bit del byte.
- `delay()` detiene todo el programa, incluida la lectura de las entradas.

Con esta lección terminas la unidad 1. En la unidad 2 empiezas con [Esperar sin detener el programa](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/), la solución al retraso que acabas de ver.
