<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 11: Máquina de estados: un semáforo

**Nivel:** básico · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/) a [10](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/10-contadores/)

Una lavadora industrial llena, lava, desagua, centrifuga. Un portón abre, espera, cierra. Un semáforo pasa de verde a amarillo y a rojo. Todas estas máquinas trabajan **por pasos**: en cada momento están en un paso, hacen lo propio de ese paso y, cuando se cumple una condición, pasan al siguiente.

Esa forma de pensar se llama **máquina de estados**, y es la herramienta más útil para programar secuencias. Con ella cierras la unidad 2.

## Estados y transiciones

Una máquina de estados tiene dos ingredientes:

- **Estados:** los pasos en los que puede estar la máquina. En cada momento está en **uno solo**.
- **Transiciones:** las condiciones que la hacen pasar de un estado a otro. Casi siempre son un tiempo cumplido o una señal.

Antes de escribir una línea de código conviene **dibujarla**. El semáforo de esta lección queda así:

<figure>
<svg viewBox="0 0 640 230" role="img" aria-labelledby="esquema-11" style="width: 100%; height: auto; max-width: 640px; color: var(--sl-color-white);">
<title id="esquema-11">Diagrama de estados: VERDE pasa a AMARILLO cuando hay un peatón esperando y pasaron 10 segundos, o a los 30 segundos. AMARILLO pasa a ROJO a los 3 segundos. ROJO vuelve a VERDE a los 8 segundos.</title>
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="20" y="40" width="150" height="60" rx="30"></rect>
<rect x="245" y="40" width="150" height="60" rx="30"></rect>
<rect x="470" y="40" width="150" height="60" rx="30"></rect>
<path d="M170 70 H235 M225 63 l10 7 l-10 7"></path>
<path d="M395 70 H460 M450 63 l10 7 l-10 7"></path>
<path d="M545 100 V180 H95 V110 M88 120 l7 -10 l7 10"></path>
</g>
<g fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">
<text x="70" y="76" font-weight="700">VERDE</text>
<text x="280" y="76" font-weight="700">AMARILLO</text>
<text x="522" y="76" font-weight="700">ROJO</text>
<text x="320" y="172" text-anchor="middle">8 s</text>
<text x="427" y="60" text-anchor="middle">3 s</text>
<text x="207" y="26" text-anchor="middle" font-size="13">peatón y 10 s, o 30 s</text>
</g>
<g fill="#2ca300"><circle cx="95" cy="40" r="5"></circle></g>
</svg>
<figcaption>Tres estados y tres transiciones. El punto verde marca el estado inicial.</figcaption>
</figure>

| Estado | Luces | Pasa al siguiente cuando… |
|---|---|---|
| **VERDE** | Verde para los autos | Un peatón apretó el botón y ya pasaron 10 s, **o** pasaron 30 s |
| **AMARILLO** | Amarillo para los autos | Pasaron 3 s |
| **ROJO** | Rojo para los autos, verde para los peatones | Pasaron 8 s |

El diagrama y la tabla dicen lo mismo, y el programa va a ser casi una copia de la tabla. Esa es la ventaja de este método: si la máquina hace algo raro, sabes exactamente en qué estado y qué condición revisar.

## Dos herramientas nuevas: enum y switch

- **`enum`** crea una lista de nombres. Internamente cada nombre es un número, pero en el programa se lee `VERDE` en lugar de `0`.
- **`switch`** elige qué bloque ejecutar según el valor de una variable. Es una forma ordenada de escribir muchos `if` seguidos sobre lo mismo.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador normalmente abierto: el botón del peatón.
- Opcional: cuatro lámparas para ver el semáforo; los indicadores de las salidas bastan.

## Conexiones

| Borne | Conecta |
|---|---|
| `1M` | 0 V de la fuente |
| `I0.0` | Botón del peatón, desde +24 V |
| `Q0.0` | Rojo de los autos |
| `Q0.1` | Amarillo de los autos |
| `Q0.2` | Verde de los autos |
| `Q0.3` | Verde de los peatones |

## El programa

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 2.Tiempo_y_logica → 11.Maquina_de_estados. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 2.Tiempo_y_logica / 11.Maquina_de_estados**. Para practicar con un tablero real en pantalla, prueba el caso [Portón automático](https://jw-control.com/casos/05-puerta/).

## Cómo funciona el programa

Vamos por partes.

### La lista de estados

```cpp
enum Estado
{
    VERDE,
    AMARILLO,
    ROJO
};
```

Esto crea un tipo nuevo, `Estado`, que solo puede valer `VERDE`, `AMARILLO` o `ROJO`. Es la primera columna de la tabla.

### Los tiempos

```cpp
const uint32_t VERDE_MINIMO_MS = 10000;
const uint32_t VERDE_MAXIMO_MS = 30000;
const uint32_t AMARILLO_MS = 3000;
const uint32_t ROJO_MS = 8000;
```

Todos los tiempos juntos, arriba, con nombre. Para ajustar el semáforo no hace falta buscar números perdidos en el programa.

### La memoria de la máquina

```cpp
Estado estado = VERDE;
uint32_t inicioEstado = 0;     // Momento en que se entró al estado actual.
bool peatonEsperando = false;  // Recuerda el pedido del botón.
```

Tres datos bastan para saber todo: en qué estado está, desde cuándo, y si hay un peatón esperando.

### Cambiar de estado

```cpp
void cambiarA(Estado nuevo, const char *nombre)
{
    estado = nuevo;
    inicioEstado = millis();
```

Cada cambio de estado hace siempre lo mismo: anotar el estado nuevo, anotar la hora y avisar por el Monitor Serie. Por eso va en una función. `void` significa que la función **no devuelve** nada: solo hace su trabajo. `const char *nombre` recibe un texto, el nombre del estado para el mensaje.

### Cuánto lleva en el estado

```cpp
uint32_t enEstado = millis() - inicioEstado;
```

La técnica de la lección 06: cuánto tiempo pasó desde que se entró al estado actual.

### Recordar al peatón

```cpp
if (digitalRead(I0_0) == HIGH)
{
    peatonEsperando = true;
}
```

El peatón aprieta el botón un instante y se va a esperar. El programa lo **recuerda** en `peatonEsperando` hasta atenderlo, aunque el botón ya esté suelto.

### Las transiciones, estado por estado

```cpp
switch (estado)
{
case VERDE:
    if ((peatonEsperando && enEstado >= VERDE_MINIMO_MS) || enEstado >= VERDE_MAXIMO_MS)
    {
        cambiarA(AMARILLO, "AMARILLO");
    }
    break;
```

`switch (estado)` salta al `case` del estado actual y **solo** revisa sus condiciones. En VERDE, la condición es la de la tabla: *peatón esperando y 10 s cumplidos, **o** 30 s cumplidos*. `break` termina el `switch`; sin él, el programa seguiría ejecutando el `case` siguiente.

```cpp
case AMARILLO:
    if (enEstado >= AMARILLO_MS)
    {
        peatonEsperando = false; // El pedido ya se atiende.
        cambiarA(ROJO, "ROJO");
    }
    break;
```

En AMARILLO, a los 3 s pasa a ROJO. Aquí se borra el pedido del peatón, porque en ROJO se le da paso. El `case ROJO` sigue el mismo patrón: a los 8 s, vuelve a VERDE.

### Las luces dependen solo del estado

```cpp
digitalWrite(Q0_0, estado == ROJO);
digitalWrite(Q0_1, estado == AMARILLO);
digitalWrite(Q0_2, estado == VERDE);
digitalWrite(Q0_3, estado == ROJO);
```

Las salidas se escriben **fuera** del `switch`, y cada una tiene una sola regla: el rojo se enciende si el estado es ROJO, y así. Es imposible que el verde y el rojo de los autos queden encendidos a la vez, porque la máquina solo puede estar en un estado.

## Súbelo y pruébalo

1. Sube el programa y abre el **Monitor Serie** a **115200 baudios**.
2. Sin tocar nada, el semáforo se queda 30 s en verde, 3 s en amarillo y 8 s en rojo.
3. Con el semáforo en verde, aprieta el botón del peatón. Si el verde ya lleva 10 s, cambia enseguida; si no, cambia cuando se cumplen los 10 s.

```text
Estado: VERDE
Estado: AMARILLO
Estado: ROJO
Estado: VERDE
```

## Si algo no funciona

- **El estado salta dos pasos de golpe:** falta un `break` al final de un `case`.
- **El botón del peatón no hace nada:** revisa el cable de `1M` a 0 V y que `peatonEsperando` solo se borre en AMARILLO.
- **Los tiempos de cada estado se acumulan:** `cambiarA()` debe anotar `inicioEstado = millis()` en cada cambio.
- **No ves el primer `Estado: VERDE`:** el equipo arrancó antes de abrir el Monitor Serie. Reinícialo con el Monitor abierto.

## Para practicar

- Agrega un estado **ROJO PARPADEANDO** para los peatones en los últimos 3 segundos de su verde. Dibuja primero el diagrama nuevo.
- Haz que una entrada `I0.1` ponga el semáforo en **amarillo intermitente** (modo noche) mientras esté activa. Pista: la intermitencia de la lección 06.

## Resumen

- Una máquina de estados divide el trabajo en pasos (estados) y condiciones para pasar de uno a otro (transiciones).
- Dibujar el diagrama antes de programar hace que el programa sea casi una copia de él.
- `enum` da nombres a los estados y `switch` ejecuta solo el bloque del estado actual; cada `case` termina con `break`.
- Las salidas se escriben a partir del estado, cada una con una sola regla.

Con esta lección terminas la unidad 2 y ya tienes las bases de cualquier programa de PLC. La unidad 3, **pantalla y botonera**, está en preparación: la anunciaremos en el [Blog](https://jw-control.com/blog/).
