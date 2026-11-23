<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-1/02-encender-un-rele.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 02: Encender un relé

**Nivel:** iniciación · **Tiempo:** unos 15 minutos · **Necesitas:** la [lección 01](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/01-hola-jwplc/)

En la lección 01 el equipo hablaba con la PC. Ahora va a **actuar**: encender una lámpara, un contactor o una electroválvula. Para eso están sus **salidas**. Es el momento en que un programa deja de ser texto en una pantalla y empieza a mover una máquina.

Al terminar sabrás qué es un relé, qué puedes conectar a las salidas del JWPLC Basic y cómo encenderlas y apagarlas desde tu programa.

## ¿Qué es un relé?

Un relé es un **interruptor que se acciona eléctricamente**. Por dentro tiene una pequeña bobina: cuando el programa la energiza, un imán mueve un contacto metálico que **cierra** el circuito. Cuando la bobina se apaga, un resorte lo **abre** otra vez. Ese movimiento es el «clic» que vas a escuchar.

La gracia del relé es que separa dos mundos: el de la **señal**, de pocos voltios, que maneja el microcontrolador, y el de la **carga**, que puede ser de 220 V AC. Entre los dos no hay conexión eléctrica: solo un contacto que se abre y se cierra.

## Cómo son las salidas del JWPLC Basic

El equipo tiene **8 salidas a relé**, de `Q0.0` a `Q0.7`:

- **Cada salida tiene dos bornes: `COM` y `NO`.** `NO` significa *normalmente abierto*: en reposo, `COM` y `NO` están separados.
- **Con la salida en `HIGH` el relé cierra** y une `COM` con `NO`. Con `LOW` los separa.
- **Es un contacto seco:** el relé **no entrega voltaje**, solo deja pasar el de tu circuito. Por eso puedes manejar con él tanto 220 V AC como 24 V DC.
- **Admite hasta 5 A**, con 250 V AC o con 30 V DC.
- **Cada salida tiene un indicador en el frente** que se enciende cuando el relé está cerrado.

En el programa, la salida `Q0.0` se escribe **`Q0_0`**, con guion bajo; lo mismo hasta `Q0_7`.

> [!TIP] HIGH y LOW, otra vez
> En la [lección 03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/) verás que una entrada también se lee como `HIGH` o `LOW`. Son las dos palabras de Arduino para «encendido» y «apagado», y las usarás en todo el curso.

### ¿Qué puedo conectar a una salida?

| Carga | ¿Directo al relé? |
|---|---|
| Lámpara piloto, sirena, bocina pequeña | Sí, si consume 5 A o menos |
| Bobina de un contactor | Sí: es la forma correcta de manejar un motor |
| Electroválvula de 24 V DC o 220 V AC | Sí, dentro de los 5 A |
| Motor trifásico o monofásico | **No directo.** El relé maneja la bobina del contactor; el contactor maneja el motor |
| Algo que se enciende y apaga muchas veces por segundo | No: un relé es mecánico y se gasta. Para eso se usa una salida de estado sólido |

## Lo que necesitas

- El JWPLC Basic alimentado con 24 V DC.
- Nada más: el indicador de `Q0.0` en el frente y el «clic» del relé muestran que el programa funciona.
- Opcional: una lámpara de 220 V AC para verlo con una carga real.

## Conexiones

Para probar el programa no necesitas cablear nada. Si quieres usar una lámpara, conéctala así:

<figure>
<svg viewBox="0 0 640 250" role="img" aria-labelledby="esquema-02" style="width: 100%; height: auto; max-width: 640px; color: var(--sl-color-white);">
<title id="esquema-02">Esquema: la fase de 220 V entra al borne COM de Q0.0; del borne NO sale hacia la lámpara, y la lámpara vuelve al neutro.</title>
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="20" y="40" width="150" height="170" rx="10"></rect>
<rect x="440" y="40" width="180" height="170" rx="10"></rect>
<path d="M170 85 H440"></path>
<path d="M440 170 H340"></path>
<circle cx="310" cy="170" r="30"></circle>
<path d="M289 149 L331 191 M331 149 L289 191"></path>
<path d="M280 170 H170"></path>
</g>
<g fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">
<text x="38" y="68" font-weight="700">Red 220 V AC</text>
<text x="38" y="90">Fase (L)</text>
<text x="38" y="175">Neutro (N)</text>
<text x="458" y="68" font-weight="700">JWPLC Basic</text>
<text x="525" y="90" font-family="ui-monospace, Consolas, monospace">Q0.0 COM</text>
<text x="525" y="175" font-family="ui-monospace, Consolas, monospace">Q0.0 NO</text>
<text x="285" y="125">Lámpara</text>
</g>
<g fill="#2ca300"><circle cx="440" cy="85" r="5"></circle><circle cx="440" cy="170" r="5"></circle><circle cx="170" cy="85" r="5"></circle><circle cx="170" cy="170" r="5"></circle></g>
</svg>
<figcaption>El relé corta la fase: cuando <code>Q0.0</code> está en <code>HIGH</code>, la fase pasa de <code>COM</code> a <code>NO</code> y la lámpara enciende.</figcaption>
</figure>

1. Con el tablero **desenergizado**, lleva la **fase** al borne **`COM`** de `Q0.0`.
2. Del borne **`NO`** de `Q0.0`, lleva un cable a la lámpara.
3. El otro borne de la lámpara va al **neutro**.

> [!WARNING]
> Trabaja siempre con el tablero desenergizado y, si no tienes experiencia con 220 V, pide ayuda a un electricista. El relé corta la **fase**, nunca el neutro.

## El programa

Este programa enciende el relé `Q0.0` un segundo y lo apaga un segundo, sin parar: una **intermitencia**.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 1.Primeros_pasos → 02.Encender_un_rele. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 1.Primeros_pasos / 02.Encender_un_rele**.

## Cómo funciona el programa

Vamos por partes.

### Un setup() vacío

```cpp
void setup()
{
```

Esta vez `setup()` no tiene instrucciones, solo un comentario. En un Arduino común habría que escribir `pinMode()` para avisar que un pin es una salida. En el JWPLC Basic no hace falta: las salidas pasan por un expansor que el package configura solo al arrancar.

Aunque esté vacío, `setup()` tiene que existir: Arduino IDE lo exige en todo programa.

### Encender

```cpp
digitalWrite(Q0_0, HIGH); // Cierra el relé Q0.0: la lámpara enciende.
delay(1000);              // Espera 1 segundo.
```

`digitalWrite()` recibe **dos datos**, separados por una coma: qué salida (`Q0_0`) y en qué estado ponerla (`HIGH`). El relé se cierra y queda así hasta que el programa diga otra cosa. Luego `delay(1000)` espera un segundo, como en la lección 01.

Lo que va después de `//` es un **comentario**: una nota para las personas que leen el programa. El equipo lo ignora.

### Apagar

```cpp
digitalWrite(Q0_0, LOW);  // Abre el relé Q0.0: la lámpara se apaga.
delay(1000);              // Espera 1 segundo y vuelve a empezar.
```

Lo mismo, con `LOW`: el relé se abre. Después de esperar otro segundo, `loop()` termina y vuelve a empezar desde arriba. Encender, esperar, apagar, esperar: así se arma una intermitencia.

## Súbelo y pruébalo

1. Sube el programa con el botón **Subir**.
2. El indicador de `Q0.0` se enciende un segundo y se apaga un segundo. Cada cambio viene con el «clic» del relé.
3. Si conectaste la lámpara, la verás parpadear al mismo ritmo.

## Si algo no funciona

- **El indicador parpadea pero la lámpara no enciende:** revisa que la fase llegue a `COM` y que la lámpara vaya a `NO` y al neutro.
- **No pasa nada:** confirma que la subida terminó sin errores (Arduino IDE dice «Subida completada») y que el equipo tiene sus 24 V.
- **Cambiaste `Q0_0` por `Q0.0` y no compila:** en el programa se escribe con guion bajo.

## Para practicar

- Haz que esté encendido 2 segundos y apagado medio segundo.
- Agrega `Q0_1` para que se encienda justo cuando `Q0_0` se apaga, como las dos luces de un cruce ferroviario.

## Resumen

- Un relé es un interruptor accionado por el programa; separa la señal de la carga.
- Las salidas del JWPLC Basic son relés de contacto seco: `COM` y `NO`, hasta 5 A con 250 V AC o 30 V DC.
- Un motor se maneja a través de un contactor, nunca directo.
- `digitalWrite(Q0_0, HIGH)` cierra el relé y `digitalWrite(Q0_0, LOW)` lo abre.

En la siguiente lección, [Leer una entrada](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/), el equipo va a escuchar a un pulsador.
