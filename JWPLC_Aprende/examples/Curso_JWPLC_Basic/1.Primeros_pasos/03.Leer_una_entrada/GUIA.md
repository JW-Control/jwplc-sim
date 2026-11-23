<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 03: Leer una entrada

**Nivel:** iniciación · **Tiempo:** unos 15 minutos · **Necesitas:** las lecciones [01](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/01-hola-jwplc/) y [02](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/02-encender-un-rele/)

Un PLC existe para reaccionar a lo que pasa en la máquina: una puerta que se cierra, una pieza que llega, un operario que aprieta un botón. Todo eso le llega por sus **entradas**. En la lección 02 el JWPLC Basic encendía un relé por su cuenta; ahora va a **escuchar** a un pulsador o a un sensor y a actuar según lo que reciba.

Al terminar sabrás qué es una entrada digital, cómo se conecta un pulsador o un sensor PNP a los bornes del equipo y cómo leerla desde tu programa.

## ¿Qué es una entrada digital?

Una entrada digital solo distingue **dos estados**: hay señal o no hay señal. No le importa si llegan 22 o 24 voltios; le importa si la tensión pasa de cierto límite.

El equipo compara la tensión que llega al borne con dos valores:

| Tensión en el borne | Lo que lee el programa |
|---|---|
| 4 V o más | `HIGH`: la entrada está **activa** |
| 2.5 V o menos | `LOW`: la entrada está **inactiva** |
| Entre 2.5 y 4 V | Zona dudosa: el resultado no es confiable |

En la práctica, una entrada del JWPLC Basic recibe **24 V** cuando está activa y **0 V** cuando no, así que la lectura siempre es clara. La zona dudosa solo aparece con un cable flojo o un sensor mal alimentado.

> [!TIP] HIGH y LOW
> Son las dos palabras que usa Arduino para «activo» e «inactivo». También verás `1` y `0`, o `true` y `false`: significan lo mismo.

## Cómo son las entradas del JWPLC Basic

El equipo tiene **8 entradas**, de `I0.0` a `I0.7`, pensadas para el mundo industrial:

- **Trabajan con 24 V DC**, la tensión de los sensores y pulsadores de tablero, no con los 3.3 V o 5 V de una placa Arduino. Así resisten mejor el ruido eléctrico de una planta.
- **Están aisladas con un optoacoplador:** la señal cruza al circuito del controlador como luz, sin conexión eléctrica directa. Un pico en el cable del sensor no llega al procesador.
- **Son de tipo sinking, para sensores PNP:** la entrada se activa cuando le **llegan +24 V**. Todas comparten un borne común, **`1M`**, que se conecta a **0 V** de la fuente.
- **Ya quedan listas al arrancar.** En un Arduino común hay que escribir `pinMode()` para decir que un pin es entrada. En el JWPLC Basic las entradas pasan por un expansor que el package configura solo, así que tu programa las lee directamente.

En el programa, la entrada `I0.0` se escribe **`I0_0`**, con guion bajo; lo mismo hasta `I0_7`.

### Pulsadores y sensores: ¿qué puedo conectar?

| Dispositivo | Cómo se conecta | ¿Sirve? |
|---|---|---|
| Pulsador, interruptor, final de carrera, contacto de relé | Entre +24 V y la entrada | Sí: es un contacto seco |
| Sensor PNP de 3 hilos (inductivo, capacitivo, fotoeléctrico) | Marrón a +24 V, azul a 0 V, negro a la entrada | Sí: entrega +24 V al detectar |
| Sensor NPN | Su salida conecta a 0 V al detectar | No directo: la entrada nunca recibe +24 V. Consúltanos |
| Señal de 220 V AC | — | **No.** Usa un relé intermedio |

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC (positivo a `L+`, negativo a `M`).
- Un pulsador normalmente abierto, o un sensor PNP de 24 V.
- Cable USB-C con datos y Arduino IDE con el package instalado ([Primeros pasos](https://jw-control.com/wiki/jwplc-basic/primeros-pasos/)).

## Conexiones

<figure>
<svg viewBox="0 0 640 250" role="img" aria-labelledby="esquema-03" style="width: 100%; height: auto; max-width: 640px; color: var(--sl-color-white);">
<title id="esquema-03">Esquema: el +24 V de la fuente pasa por el pulsador y llega a la entrada I0.0; el 0 V de la fuente va al común 1M.</title>
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="20" y="40" width="150" height="170" rx="10"></rect>
<rect x="440" y="40" width="180" height="170" rx="10"></rect>
<path d="M170 85 H260"></path>
<path d="M260 85 v-18 M260 67 l40 -12 M300 67 v18"></path>
<path d="M300 85 H440"></path>
<path d="M170 170 H440" stroke-dasharray="6 6"></path>
</g>
<g fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">
<text x="38" y="68" font-weight="700">Fuente 24 V DC</text>
<text x="38" y="90">+24 V</text>
<text x="38" y="175">0 V</text>
<text x="458" y="68" font-weight="700">JWPLC Basic</text>
<text x="560" y="90" font-family="ui-monospace, Consolas, monospace">I0.0</text>
<text x="565" y="175" font-family="ui-monospace, Consolas, monospace">1M</text>
<text x="240" y="40">Pulsador NO</text>
<text x="250" y="200">común de las entradas</text>
</g>
<g fill="#2ca300"><circle cx="440" cy="85" r="5"></circle><circle cx="440" cy="170" r="5"></circle><circle cx="170" cy="85" r="5"></circle><circle cx="170" cy="170" r="5"></circle></g>
</svg>
<figcaption>El pulsador corta o deja pasar los +24 V hacia <code>I0.0</code>. El común <code>1M</code> va siempre a 0 V.</figcaption>
</figure>

1. Conecta el borne **`1M`** al **0 V** de la fuente. Sin este cable ninguna entrada funciona.
2. Conecta un lado del pulsador al **+24 V** de la fuente y el otro al borne **`I0.0`**.
3. Si usas un sensor PNP en lugar del pulsador: **marrón** a +24 V, **azul** a 0 V y **negro** (la señal) a `I0.0`.

> [!WARNING]
> Cablea con la fuente apagada. Nunca lleves 220 V AC a una entrada: se daña.

## El programa

Este programa copia la entrada `I0.0` en el relé `Q0.0` y avisa por el Monitor Serie si la entrada está activa o no.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 1.Primeros_pasos → 03.Leer_una_entrada. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 1.Primeros_pasos / 03.Leer_una_entrada**.

## Cómo funciona el programa

Vamos por partes.

### Preparar la comunicación con la PC

```cpp
Serial.begin(115200);
Serial.println("Lección 03: aprieta el pulsador de I0.0");
```

Igual que en la [lección 01](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/01-hola-jwplc/): `setup()` abre el Monitor Serie a 115200 baudios y escribe un mensaje de bienvenida, una sola vez.

### Leer la entrada

```cpp
uint8_t estado = digitalRead(I0_0);
```

`digitalRead()` mira el borne `I0_0` en ese instante y devuelve `HIGH` si recibe 24 V o `LOW` si no. El resultado se guarda en una **variable** llamada `estado`, porque lo vamos a usar dos veces. `uint8_t` indica que guarda un número entero de 8 bits, de 0 a 255: alcanza de sobra, porque `HIGH` vale 1 y `LOW` vale 0.

### Mandar el relé según la entrada

```cpp
digitalWrite(Q0_0, estado);
```

Lo que aprendiste en la [lección 02](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/02-encender-un-rele/), pero ahora en lugar de escribir `HIGH` o `LOW` a mano, escribimos lo que leímos. Entrada activa: relé cerrado. Entrada inactiva: relé abierto. Así funciona la lógica más simple de un PLC.

### Decidir qué mensaje mostrar

```cpp
if (estado == HIGH)
{
    Serial.println("I0.0 activa");
}
else
{
    Serial.println("I0.0 inactiva");
}
```

`if` pregunta algo y, si la respuesta es sí, ejecuta el primer bloque; si no, el bloque de `else`. Fíjate en el doble igual: `==` **compara** dos valores, mientras que `=` **guarda** un valor en una variable. Confundirlos es el error más común al empezar.

### Una pausa para leer con calma

```cpp
delay(200);
```

`loop()` se repite miles de veces por segundo. Sin esta pausa, el Monitor Serie se llenaría de mensajes que no alcanzarías a leer. Con 200 ms ves unos cinco mensajes por segundo.

## Súbelo y pruébalo

1. Sube el programa con el botón **Subir**.
2. Abre **Herramientas → Monitor Serie** y elige **115200 baudios**.
3. Sin tocar nada verás `I0.0 inactiva` cada 200 ms.
4. Aprieta el pulsador (o acerca una pieza al sensor): el relé `Q0.0` hace clic, su indicador se enciende y el mensaje cambia.

```text
I0.0 inactiva
I0.0 inactiva
I0.0 activa
I0.0 activa
I0.0 inactiva
```

## Si algo no funciona

- **La entrada nunca se activa:** revisa que `1M` esté conectado a 0 V; es el olvido más común.
- **Con un sensor, su luz se enciende pero la entrada no:** probablemente es un sensor NPN. Mira la etiqueta del sensor.
- **El Monitor Serie muestra símbolos raros:** la velocidad no es 115200 baudios.
- **El relé tarda un poco en seguir al pulsador:** es la pausa de 200 ms. En la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/) verás cómo esperar sin detener el programa.

## Para practicar

- Haz lo contrario: que `Q0.0` esté cerrado mientras el pulsador **no** esté apretado. Pista: el operador `!` invierte un valor (lo verás en la [lección 04](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/)).
- Conecta un segundo pulsador a `I0.1` y haz que mande el relé `Q0.1`.

## Resumen

- Una entrada digital solo distingue dos estados: `HIGH` (activa, 24 V) y `LOW` (inactiva, 0 V).
- Las entradas del JWPLC Basic son de 24 V, aisladas, para pulsadores y sensores PNP, con el común `1M` a 0 V.
- `digitalRead(I0_0)` lee una entrada; con `if` y `else` el programa decide qué hacer.

En la siguiente lección, [Variables y decisiones](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/), combinarás varias entradas con la lógica Y, O y NO.
