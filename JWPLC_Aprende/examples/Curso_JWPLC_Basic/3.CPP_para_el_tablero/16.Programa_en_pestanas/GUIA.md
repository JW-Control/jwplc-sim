<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/16-programa-en-pestanas.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 16: El programa en pestañas

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** las lecciones [05](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/05-las-8-entradas-y-salidas/), [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [14](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/14-temporizadores-como-clases/)

Los programas de las lecciones caben en una pantalla. El de una máquina real no: alarmas, modos, pantalla, comunicaciones, registro… Si todo va en un solo archivo de mil líneas, encontrar algo es una pesadilla, y el técnico que llega un año después a cambiar un sensor no sabe por dónde empezar.

Los PLC comerciales lo resuelven con **secciones**: una para las entradas, otra para la lógica, otra para las alarmas. En el JWPLC Basic se hace con **pestañas**: cada pestaña es un archivo de la carpeta del programa, y Arduino IDE (o JWPLC Sim) las muestra arriba del código.

## La plantilla de proyecto JWPLC

El package del JWPLC trae una plantilla que ordena cualquier proyecto siempre igual. Cada pestaña tiene **una sola responsabilidad** y siempre está en el mismo lugar:

| Pestaña | Qué va | Qué NO va |
|---|---|---|
| Principal | El orden del ciclo, nada más | Lógica, lecturas o escrituras |
| `A_Config.h` | Nombre del proyecto, tiempos y límites fijos | Variables que cambian |
| `B_Tags.h` | Qué bit usa cada equipo y las variables compartidas | Lógica |
| `C_Entradas` | Leer los bornes una vez por ciclo; invertir los NC | Decisiones |
| `D_Logica` | Decidir: enclavamientos, secuencias, temporizadores | `digitalRead()` y `digitalWrite()` |
| `E_Alarmas` | Detectar y memorizar alarmas | |
| `F_Salidas` | Escribir los bornes una vez por ciclo, al final | Decisiones |
| `G_HMI` | Pantalla y botonera | |
| `H_Comunicaciones` | Modbus RTU y TCP | |
| `I_Persistencia` | Datos que sobreviven a un corte (FRAM) | |
| `J_Diagnostico` | Mensajes por el Monitor Serie | Lógica |
| `K_Utilidades.h` | TON, TOF, Flanco (no se edita) | |

En esta lección usarás las pestañas que necesita un motor: A, B, C, D, F, J y K. Las demás llegan en las próximas unidades, cuando veas la pantalla, las alarmas y las comunicaciones.

## El ciclo de scan

Un PLC trabaja en vueltas, y cada vuelta tiene tres tiempos:

```text
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ C_Entradas   │ → │ D_Logica     │ → │ F_Salidas    │ → y otra vez
│ lee bornes   │   │ decide       │   │ escribe      │
└──────────────┘   └──────────────┘   └──────────────┘
```

Las entradas se leen **una sola vez** al principio y se guardan en variables. Toda la lógica decide con esas variables: si un sensor cambia a mitad de la vuelta, la lógica no ve dos valores distintos en la misma vuelta. Y las salidas se escriben **una sola vez** al final, con todo ya decidido.

## Archivos `.h` y `.ino`

- Las pestañas **`.ino`** se juntan en un solo programa al compilar: la principal primero y las demás en orden alfabético. Por eso las funciones de una pestaña se pueden usar en otra.
- Las pestañas **`.h`** (*header*, cabecera) guardan nombres, constantes y clases. Se traen con `#include "B_Tags.h"` y empiezan con **`#pragma once`**, que evita que se incluyan dos veces.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador NA (marcha), uno NC (paro) y el contacto auxiliar NC del relé térmico (o un pulsador NC que lo simule).
- Un contactor y una lámpara de 24 V DC.

## Conexiones

Como en la [lección 08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/#conexiones):

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: MARCHA (NA). **`I0.1`**: PARO (NC). **`I0.2`**: contacto 95-96 del térmico (NC). Todos desde **+24 V**.
3. **`Q0.0`**: bobina del contactor del motor. **`Q0.1`**: lámpara de falla.

## El programa

En Arduino IDE, una pestaña nueva se crea con el menú de la flecha a la derecha de las pestañas, **Nueva pestaña**. En JWPLC Sim, con el botón **+** de la barra de pestañas. Escribe el nombre con su extensión (`B_Tags.h`); sin extensión se crea una pestaña `.ino`.

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 16.Programa_en_pestanas, con sus ocho pestañas. Llega con la próxima versión del simulador; mientras tanto, crea las pestañas y copia cada una.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 3, lección 16. Se abre con sus pestañas y el motor ya cableado, y trae una práctica que se califica sola.

## Cómo funciona el programa

### La pestaña principal

```cpp
#include "A_Config.h"
#include "K_Utilidades.h"
#include "B_Tags.h"
```

Trae las tres cabeceras en orden: `B_Tags.h` usa la clase `Flanco` de `K_Utilidades.h`, así que va después.

```cpp
void loop()
{
    leerEntradas();       // C
    ejecutarLogica();     // D
    escribirSalidas();    // F
    diagnosticoCiclo();   // J
}
```

El `loop()` se lee como el índice de un libro: leer, decidir, escribir, avisar. Cada función vive en su pestaña, y la letra del comentario dice cuál.

### `B_Tags.h`: la tabla de E/S

```cpp
const uint8_t BIT_PB_MARCHA = 0;  // I0.0 pulsador de marcha (NA)
const uint8_t BIT_PB_PARO = 1;    // I0.1 pulsador de paro (NC)
const uint8_t BIT_TERMICO = 2;    // I0.2 contacto 95-96 del térmico (NC)
```

Es la tabla de E/S del plano eléctrico, escrita en C++. Si el electricista mueve el térmico a `I0.5`, se cambia un número aquí y el resto del programa no se toca.

```cpp
bool pbMarcha = false;
bool pbParo = false;
bool fallaTermico = false;
```

Las variables van **en positivo**: `pbParo` es `true` cuando alguien aprieta el paro, aunque el contacto sea NC. Así la lógica se lee sin pensar en el cableado.

### `C_Entradas`: leer una vez

```cpp
imagenEntradas = digitalReadBlock(I0_X);

pbMarcha = bitRead(imagenEntradas, BIT_PB_MARCHA);
pbParo = !bitRead(imagenEntradas, BIT_PB_PARO);         // NC: abierto = apretado
fallaTermico = !bitRead(imagenEntradas, BIT_TERMICO);   // NC: abierto = disparado
```

Las ocho entradas en una lectura, como en la lección 05: es la **imagen** de las entradas. `bitRead()` saca un bit por su nombre. Los contactos NC se invierten **aquí y solo aquí**.

### `D_Logica`: decidir sin tocar bornes

```cpp
motor = (pbMarcha || motor) && !pbParo && !fallaTermico;
lamparaFalla = fallaTermico;
```

La regla de la lección 08, sin `digitalRead()` ni `digitalWrite()`. Esta pestaña no sabe en qué borne está cada cosa: solo decide.

### `F_Salidas`: escribir una vez

```cpp
uint8_t nueva = 0;
bitWrite(nueva, BIT_MOTOR, motor);
bitWrite(nueva, BIT_LAMPARA_FALLA, lamparaFalla);

if (nueva != imagenSalidas)
{
    imagenSalidas = nueva;
    digitalWriteBlock(Q0_X, imagenSalidas);
}
```

Arma la imagen de las salidas con `bitWrite()` y la escribe de una vez, solo si algo cambió. `salidasApagarTodo()`, que se llama en `setup()`, garantiza que la máquina arranca con todo apagado.

### `J_Diagnostico`: avisar

Los mensajes del Monitor Serie van aparte. Fíjate en los **dos** flancos, uno para el arranque y otro para la parada: es la regla de la lección 14, un objeto por uso. Si borras esta pestaña (y sus dos llamadas), la máquina funciona igual.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. MARCHA arranca el motor y PARO lo detiene.
3. Arranca otra vez y abre el contacto del térmico: el motor se detiene y `Q0.1` enciende.

```text
Lección 16: motor en pestañas
Motor en marcha
Motor detenido
Motor en marcha
Motor detenido por el térmico
```

## Si algo no funciona

- **`'BIT_MOTOR' was not declared in this scope`:** falta un `#include` en la pestaña principal, o está en otro orden.
- **`redefinition of …`:** a una pestaña `.h` le falta `#pragma once`, o la misma variable está declarada en dos pestañas. Cada variable global va una sola vez, en `B_Tags.h`.
- **El motor arranca solo al encender:** revisa la inversión de los NC en `C_Entradas`: `pbParo` tiene que ser `true` con el contacto **abierto**.

## Para practicar

- Agrega un **arranque con aviso**: con MARCHA, una sirena en `Q0.3` suena 2 segundos y recién ahí arranca el motor. Es lo que se usa en máquinas grandes para que nadie esté cerca al arrancar.
- Agrega una lámpara de marcha en `Q0.2`.
- Pon cada cambio en su pestaña: los bits y las variables nuevas en `B_Tags.h`, el tiempo del aviso en `A_Config.h`, la decisión en `D_Logica` y las escrituras en `F_Salidas`. Pista: separa la **orden** de marcha (sellada con MARCHA y PARO) del **motor** (la orden, pasada por un TON de 2 s).

## Resumen

- Un programa grande se reparte en **pestañas**, cada una con **una sola responsabilidad** y siempre en el mismo lugar.
- El **ciclo de scan**: leer las entradas una vez, decidir, escribir las salidas una vez.
- `B_Tags.h` es la tabla de E/S: un cambio de borne se arregla en un solo lugar.
- Los NC se invierten al leer; la lógica trabaja con variables en positivo.
- Es la misma forma de la plantilla de proyecto JWPLC: tus proyectos ya pueden empezar desde ella.

En la siguiente lección, [Mensajes para el operador](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/17-mensajes-para-el-operador/), darás formato a los textos del Monitor Serie: horas, minutos y un horómetro.
