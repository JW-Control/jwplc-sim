<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 04: Variables y decisiones

**Nivel:** iniciación · **Tiempo:** unos 20 minutos · **Necesitas:** la [lección 03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/)

Una máquina casi nunca obedece a una sola señal. Una prensa baja solo si el operario tiene **las dos manos** en sus pulsadores. Un timbre suena con **cualquiera** de sus pulsadores. Una luz de «listo» está encendida mientras **no** haya nadie trabajando. Esas tres palabras, **Y**, **O** y **NO**, son la base de toda la lógica de un PLC.

Al terminar sabrás guardar «verdadero o falso» en una variable, combinar varias entradas con Y, O y NO, y escribir esas reglas en tu programa.

## Verdadero o falso: el tipo bool

En la lección 03 guardaste la lectura de una entrada en una variable `uint8_t`, un número entero. Para las entradas hay un tipo más claro: **`bool`**, que solo puede valer dos cosas:

| Valor | Significa | Equivale a |
|---|---|---|
| `true` | Verdadero, se cumple | `HIGH`, 1, entrada activa |
| `false` | Falso, no se cumple | `LOW`, 0, entrada inactiva |

Usar `bool` hace que el programa se lea como una frase: `if (manoIzquierda)` se entiende sin pensar en voltajes.

## Las tres operaciones lógicas

Cada operación se escribe con un símbolo en C++. Mira qué resultado da con dos entradas, A y B:

| A | B | A **Y** B (`A && B`) | A **O** B (`A \|\| B`) | **NO** A (`!A`) |
|---|---|---|---|---|
| suelto | suelto | no | no | sí |
| apretado | suelto | no | sí | no |
| suelto | apretado | no | sí | sí |
| apretado | apretado | **sí** | sí | no |

- **Y (`&&`):** se cumple solo si **las dos** se cumplen. Equivale a dos contactos **en serie** en un diagrama de escalera.
- **O (`||`):** se cumple si **al menos una** se cumple. Equivale a dos contactos **en paralelo**.
- **NO (`!`):** invierte el valor. Equivale a un contacto **normalmente cerrado**.

> [!TIP] Si vienes de los PLC
> Si ya programaste en escalera (Ladder), esto es lo mismo con otra escritura. Serie es `&&`, paralelo es `||`, contacto cerrado es `!`.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Dos pulsadores normalmente abiertos.

## Conexiones

<figure>
<svg viewBox="0 0 640 270" role="img" aria-labelledby="esquema-04" style="width: 100%; height: auto; max-width: 640px; color: var(--sl-color-white);">
<title id="esquema-04">Esquema: el +24 V de la fuente pasa por un pulsador hacia I0.0 y por otro pulsador hacia I0.1; el 0 V de la fuente va al común 1M.</title>
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="20" y="40" width="150" height="190" rx="10"></rect>
<rect x="440" y="40" width="180" height="190" rx="10"></rect>
<path d="M170 85 H260"></path>
<path d="M260 85 v-18 M260 67 l40 -12 M300 67 v18"></path>
<path d="M300 85 H440"></path>
<path d="M220 85 V145 H260"></path>
<path d="M260 145 v-18 M260 127 l40 -12 M300 127 v18"></path>
<path d="M300 145 H440"></path>
<path d="M170 195 H440" stroke-dasharray="6 6"></path>
</g>
<g fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">
<text x="38" y="68" font-weight="700">Fuente 24 V DC</text>
<text x="38" y="90">+24 V</text>
<text x="38" y="200">0 V</text>
<text x="458" y="68" font-weight="700">JWPLC Basic</text>
<text x="560" y="90" font-family="ui-monospace, Consolas, monospace">I0.0</text>
<text x="560" y="150" font-family="ui-monospace, Consolas, monospace">I0.1</text>
<text x="565" y="200" font-family="ui-monospace, Consolas, monospace">1M</text>
<text x="225" y="40">Mano izquierda</text>
<text x="315" y="118">Mano derecha</text>
<text x="250" y="222">común de las entradas</text>
</g>
<g fill="#2ca300"><circle cx="440" cy="85" r="5"></circle><circle cx="440" cy="145" r="5"></circle><circle cx="440" cy="195" r="5"></circle><circle cx="170" cy="85" r="5"></circle><circle cx="220" cy="85" r="4"></circle><circle cx="170" cy="195" r="5"></circle></g>
</svg>
<figcaption>Los dos pulsadores toman el +24 V de la misma fuente. El común <code>1M</code> va a 0 V.</figcaption>
</figure>

1. Conecta **`1M`** al **0 V** de la fuente.
2. Pulsador de la mano izquierda: entre **+24 V** e **`I0.0`**.
3. Pulsador de la mano derecha: entre **+24 V** e **`I0.1`**.

No hace falta cablear las salidas: los indicadores de `Q0.0` a `Q0.3` muestran el resultado de cada regla.

## El programa

El programa aplica cuatro reglas a las mismas dos entradas, cada una en un relé:

| Relé | Regla | Ejemplo real |
|---|---|---|
| `Q0.0` | `I0.0` **Y** `I0.1` | Prensa a dos manos: arranca solo con los dos pulsadores apretados |
| `Q0.1` | `I0.0` **O** `I0.1` | Timbre con dos pulsadores: suena con cualquiera |
| `Q0.2` | **NO** `I0.0` | Luz de «listo»: encendida mientras `I0.0` esté suelto |
| `Q0.3` | `I0.0` **distinto de** `I0.1` | Luz de escalera: cambiar cualquiera de los dos interruptores la enciende o la apaga |

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 1.Primeros_pasos → 04.Variables_y_decisiones. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 1.Primeros_pasos / 04.Variables_y_decisiones**. Para practicar con un tablero real en pantalla, prueba el caso [Llenado de tanque por niveles](https://jw-control.com/casos/04-bomba-niveles/).

## Cómo funciona el programa

Vamos por partes.

### Leer cada entrada una vez, con un nombre claro

```cpp
bool manoIzquierda = digitalRead(I0_0) == HIGH;
bool manoDerecha = digitalRead(I0_1) == HIGH;
```

Cada línea hace dos cosas. Primero `digitalRead()` lee la entrada, como en la lección 03. Después `== HIGH` **pregunta** si la lectura es `HIGH`; la respuesta es `true` o `false`, y se guarda en una variable `bool`.

Los nombres `manoIzquierda` y `manoDerecha` no los exige nadie: los elegimos para que el resto del programa se lea solo. Leer cada entrada **una vez** al principio de `loop()` y trabajar con esas variables es una buena costumbre: todas las reglas usan la misma foto de las entradas.

### Y, paso a paso con if / else

```cpp
if (manoIzquierda && manoDerecha)
{
    digitalWrite(Q0_0, HIGH);
}
else
{
    digitalWrite(Q0_0, LOW);
}
```

Se lee tal cual: *si mano izquierda **y** mano derecha, cierra `Q0.0`; si no, ábrelo*. Las llaves `{ }` marcan qué instrucciones van en cada caso.

### O, en una sola línea

```cpp
digitalWrite(Q0_1, manoIzquierda || manoDerecha);
```

El bloque anterior se puede abreviar. `manoIzquierda || manoDerecha` ya da `true` o `false`, y `digitalWrite()` acepta un `bool` directamente: `true` cierra el relé y `false` lo abre. Las dos formas hacen lo mismo; esta es más corta, la otra se entiende mejor al empezar.

### NO

```cpp
digitalWrite(Q0_2, !manoIzquierda);
```

`!` invierte el valor: con el pulsador suelto `manoIzquierda` es `false`, y `!manoIzquierda` es `true`. Por eso `Q0.2` está cerrado al arrancar, sin tocar nada.

### Distinto

```cpp
digitalWrite(Q0_3, manoIzquierda != manoDerecha);
```

`!=` pregunta si dos valores son **distintos**; es lo contrario de `==`. Con un pulsador apretado y el otro suelto, son distintos y `Q0.3` cierra. Con los dos iguales, abre. Es la lógica de la luz de escalera que se maneja desde arriba y desde abajo.

## Súbelo y pruébalo

1. Sube el programa. Al inicio, solo el indicador de `Q0.2` está encendido.
2. Prueba las cuatro combinaciones de los pulsadores y compara los indicadores con esta tabla:

| `I0.0` | `I0.1` | `Q0.0` (Y) | `Q0.1` (O) | `Q0.2` (NO) | `Q0.3` (distinto) |
|---|---|---|---|---|---|
| suelto | suelto | apagado | apagado | **encendido** | apagado |
| apretado | suelto | apagado | **encendido** | apagado | **encendido** |
| suelto | apretado | apagado | **encendido** | **encendido** | **encendido** |
| apretado | apretado | **encendido** | **encendido** | apagado | apagado |

## Si algo no funciona

- **Ninguna regla responde:** revisa que `1M` esté conectado a 0 V.
- **`Q0.2` no está encendido al arrancar:** el pulsador de `I0.0` puede ser normalmente cerrado. Para esta lección usa uno normalmente abierto.
- **Error al compilar en el `if`:** fíjate en los paréntesis y en que `&&` y `||` llevan dos símbolos, no uno.

## Para practicar

- Agrega un tercer pulsador en `I0.2` y haz una prensa a **tres** manos.
- `Q0.4`: que se encienda con `I0.0` apretado pero `I0.1` suelto. Pista: combina `&&` con `!`.

## Resumen

- Una variable `bool` guarda `true` o `false`; con `== HIGH` conviertes una lectura en `bool`.
- `if` / `else` elige entre dos caminos según una condición.
- Y es `&&` (contactos en serie), O es `||` (en paralelo) y NO es `!` (contacto cerrado).
- `==` pregunta si dos valores son iguales; `!=`, si son distintos.

En la siguiente lección, [Las 8 entradas y las 8 salidas](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/05-las-8-entradas-y-salidas/), manejarás todo el equipo con pocas líneas.
