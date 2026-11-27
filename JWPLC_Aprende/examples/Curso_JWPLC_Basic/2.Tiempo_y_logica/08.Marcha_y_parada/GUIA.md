<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 08: Marcha y parada de un motor

**Nivel:** básico · **Tiempo:** unos 25 minutos · **Necesitas:** las lecciones [04](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/) y [07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/)

Fajas, bombas, ventiladores, molinos: casi todos arrancan igual. Un pulsador verde de **marcha**, un pulsador rojo de **parada** y un **relé térmico** que protege el motor. Aprietas marcha, sueltas, y el motor sigue andando. Aprietas parada, y se detiene. Si el motor se sobrecarga, el térmico lo detiene solo.

Es el circuito más usado en la industria, y lo vas a programar en una sola línea. En el camino aprenderás una regla de seguridad que todo técnico debe conocer: por qué las paradas se cablean **normalmente cerradas**.

## El enclavamiento: que el motor recuerde

El pulsador de marcha solo está apretado un instante. Si el motor dependiera solo de él, se detendría al soltarlo. Hace falta que el motor **recuerde** que está en marcha.

En un tablero con contactores, eso se hace con un contacto auxiliar del propio contactor, puesto en paralelo con el pulsador de marcha. Se le llama **enclavamiento**, **sello** o **autorretención**. En el programa, la memoria es una variable, y la regla queda así:

```text
motor = (marcha O motor) Y parada Y térmico
```

- **marcha O motor:** el motor arranca con el pulsador, **o** sigue en marcha si ya lo estaba. Ese «O motor» es el sello.
- **Y parada Y térmico:** además, la parada y el térmico tienen que estar dejando funcionar. Si cualquiera de los dos se abre, el motor se detiene, y como el sello depende del propio motor, ya no vuelve solo.

## ¿Por qué la parada va normalmente cerrada?

Este es el punto clave de seguridad. Compara las dos formas de cablear la parada:

| Si la parada fuera… | Al apretarla | Si un cable se corta |
|---|---|---|
| Normalmente abierta (NO) | La entrada se activa y el motor se detiene | **La entrada nunca se activa: el motor no se puede detener** |
| Normalmente cerrada (NC) | La entrada se apaga y el motor se detiene | **La entrada se apaga: el motor se detiene** |

Con la parada NC, la entrada recibe 24 V **mientras nadie la toca**. Cualquier falla del cableado (un cable suelto, un borne flojo, un conductor cortado) se ve igual que apretar la parada. La máquina queda detenida, **nunca en marcha sin control**. Lo mismo vale para el relé térmico: su contacto auxiliar NC (bornes 95-96) se abre cuando hay sobrecarga.

Por eso el programa no pregunta «¿apretaron la parada?», sino «¿la parada **está dejando** funcionar?».

> [!WARNING] El relé no maneja el motor
> Las salidas del JWPLC Basic manejan la **bobina del contactor**, nunca el motor directo. La corriente del motor pasa por el contactor. Y una parada de emergencia de verdad, en una máquina con riesgo para las personas, debe cortar la energía por hardware, además de avisar al programa.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador normalmente abierto (marcha) y uno normalmente cerrado (parada).
- Un relé térmico con su contacto auxiliar NC, o un tercer pulsador NC para simularlo.
- Opcional: un contactor y una lámpara de falla.

## Conexiones

<figure>
<svg viewBox="0 0 640 300" role="img" aria-labelledby="esquema-08" style="width: 100%; height: auto; max-width: 640px; color: var(--sl-color-white);">
<title id="esquema-08">Esquema: del +24 V salen tres ramas; el pulsador de marcha NO va a I0.0, el pulsador de parada NC va a I0.1 y el contacto 95-96 del térmico, NC, va a I0.2. El 0 V va al común 1M.</title>
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="20" y="40" width="150" height="220" rx="10"></rect>
<rect x="440" y="40" width="180" height="220" rx="10"></rect>
<path d="M170 85 H260 M260 85 v-18 M260 67 l40 -12 M300 67 v18 M300 85 H440"></path>
<path d="M220 85 V135 H260 M260 135 v-18 M300 117 v18 M300 135 H440 M256 115 L306 115"></path>
<path d="M220 135 V185 H260 M260 185 v-18 M300 167 v18 M300 185 H440 M256 165 L306 165"></path>
<path d="M170 230 H440" stroke-dasharray="6 6"></path>
</g>
<g fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">
<text x="38" y="68" font-weight="700">Fuente 24 V DC</text>
<text x="38" y="90">+24 V</text>
<text x="38" y="235">0 V</text>
<text x="458" y="68" font-weight="700">JWPLC Basic</text>
<text x="560" y="90" font-family="ui-monospace, Consolas, monospace">I0.0</text>
<text x="560" y="140" font-family="ui-monospace, Consolas, monospace">I0.1</text>
<text x="560" y="190" font-family="ui-monospace, Consolas, monospace">I0.2</text>
<text x="565" y="235" font-family="ui-monospace, Consolas, monospace">1M</text>
<text x="315" y="62">Marcha (NO)</text>
<text x="315" y="112">Parada (NC)</text>
<text x="315" y="162">Térmico (NC)</text>
</g>
<g fill="#2ca300"><circle cx="440" cy="85" r="5"></circle><circle cx="440" cy="135" r="5"></circle><circle cx="440" cy="185" r="5"></circle><circle cx="440" cy="230" r="5"></circle><circle cx="170" cy="85" r="5"></circle><circle cx="220" cy="85" r="4"></circle><circle cx="220" cy="135" r="4"></circle><circle cx="170" cy="230" r="5"></circle></g>
</svg>
<figcaption>La marcha es normalmente abierta; la parada y el térmico son normalmente cerrados, así que <code>I0.1</code> e <code>I0.2</code> están activas en reposo.</figcaption>
</figure>

1. **`1M`** al **0 V** de la fuente.
2. **Marcha** (NO): entre **+24 V** e **`I0.0`**.
3. **Parada** (NC): entre **+24 V** e **`I0.1`**.
4. **Térmico**, contacto auxiliar NC **95-96**: entre **+24 V** e **`I0.2`**.
5. Salidas: la bobina del contactor (A1-A2) se alimenta a través de **`COM`** y **`NO`** de **`Q0.0`**, como la lámpara de la [lección 02](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/02-encender-un-rele/#conexiones). La lámpara de falla va igual en **`Q0.1`**.

## El programa

`Q0.0` maneja el contactor del motor según la regla de marcha y parada, y `Q0.1` enciende la lámpara de falla si el térmico se dispara. El Monitor Serie avisa cada vez que el motor arranca o se detiene.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 2.Tiempo_y_logica → 08.Marcha_y_parada. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 2.Tiempo_y_logica / 08.Marcha_y_parada**. Para practicar con un tablero real en pantalla, prueba el caso [Marcha y parada con enclavamiento](https://jw-control.com/casos/01-marcha-parada/).

## Cómo funciona el programa

Vamos por partes.

### La memoria del motor

```cpp
bool motor = false;
```

`motor` recuerda si el motor está en marcha. Va fuera de `loop()` para conservar su valor entre vueltas: es el sello. Empieza en `false`: al encender el equipo, el motor siempre arranca detenido.

### Leer las tres entradas con nombres que digan la verdad

```cpp
bool marcha = digitalRead(I0_0) == HIGH;
bool paradaSinApretar = digitalRead(I0_1) == HIGH;  // NC: activa en reposo.
bool termicoNormal = digitalRead(I0_2) == HIGH;     // NC: activo si no hay falla.
```

Fíjate en los nombres. La entrada de la parada no se llama `parada` sino `paradaSinApretar`, porque eso es lo que significa que esté activa en un contacto NC. Igual con `termicoNormal`. Un buen nombre evita confusiones al leer la regla.

### La regla de escalera

```cpp
motor = (marcha || motor) && paradaSinApretar && termicoNormal;
```

La regla de arriba, en C++: `||` es O y `&&` es Y, como en la [lección 04](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/). El valor de `motor` del lado derecho es el de la vuelta anterior; el resultado pasa a ser el nuevo valor. Así, una vez en marcha, `motor` se mantiene en `true` aunque sueltes la marcha.

### Las salidas

```cpp
digitalWrite(Q0_0, motor);
digitalWrite(Q0_1, !termicoNormal);
```

El contactor sigue a `motor`. La lámpara de falla se enciende cuando el térmico **no** está normal.

### Avisar solo cuando cambia

```cpp
bool motorAntes = motor;
```

```cpp
if (motor != motorAntes)
{
    Serial.println(motor ? "Motor en marcha" : "Motor detenido");
}
```

Antes de aplicar la regla se guarda cómo estaba el motor. Después se compara: si cambió, se avisa. Es la idea del flanco de la [lección 07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/), aplicada a una variable en lugar de a una entrada.

## Súbelo y pruébalo

1. Sube el programa y abre el **Monitor Serie** a **115200 baudios**.
2. Sin la parada ni el térmico conectados, aprieta marcha: **el motor no arranca**. Es lo correcto: el programa ve un cable cortado.
3. Con todo conectado, un toque a **marcha**: `Q0.0` se cierra y se queda cerrado al soltar.
4. Un toque a **parada**: `Q0.0` se abre.
5. Arranca otra vez y abre el contacto del térmico: `Q0.0` se abre y `Q0.1` enciende la lámpara de falla.

```text
Lección 08: marcha I0.0, parada NC I0.1, térmico NC I0.2
Motor en marcha
Motor detenido
Motor en marcha
Motor detenido
```

## Si algo no funciona

- **El motor nunca arranca:** revisa que `I0.1` e `I0.2` estén activas en reposo (sus indicadores encendidos). Si no, la parada o el térmico están cableados como NO, o falta el +24 V.
- **El motor se detiene al soltar marcha:** falta `motor` dentro del paréntesis de la regla; sin él no hay sello.
- **La lámpara de falla está siempre encendida:** el contacto del térmico está abierto o conectado a los bornes equivocados (97-98 es el NO).

## Para practicar

- Agrega una lámpara de marcha en `Q0.2`.
- Haz que, si el térmico se disparó, no se pueda volver a arrancar hasta que se apriete **parada**: un «reconocimiento» de la falla. Pista: una variable `bool` que recuerde la falla.

## Resumen

- El enclavamiento hace que el motor siga en marcha al soltar el pulsador: en el programa, es la variable `motor` dentro de su propia regla.
- La regla de marcha y parada es `motor = (marcha || motor) && parada && termico`.
- Las paradas y los térmicos se cablean normalmente cerrados: un cable cortado detiene la máquina.
- El relé del JWPLC maneja la bobina del contactor, nunca el motor directo.

En la siguiente lección, [Temporizadores](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/), harás que las salidas esperen el tiempo justo.
