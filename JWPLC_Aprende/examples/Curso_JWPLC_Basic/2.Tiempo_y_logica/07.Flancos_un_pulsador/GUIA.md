<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 07: Flancos: encender y apagar con un pulsador

**Nivel:** básico · **Tiempo:** unos 20 minutos · **Necesitas:** la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/)

En el pasillo de un edificio, un solo pulsador enciende la luz y el mismo pulsador la apaga. Ese aparato se llama **telerruptor**. Parece simple, pero si lo intentas con lo que sabes hasta ahora, te vas a topar con un problema: mientras el dedo está sobre el pulsador, `loop()` da miles de vueltas, y en cada una la luz cambiaría. Al soltar, quedaría encendida o apagada al azar.

La solución es reaccionar no a que el pulsador **esté** apretado, sino al **instante** en que **se aprieta**. A ese instante se le llama **flanco**.

## Estado y flanco

| | Qué es | Cuánto dura | Ejemplo |
|---|---|---|---|
| **Estado** | Cómo está la señal | Todo el tiempo que se mantenga | «El pulsador **está** apretado» |
| **Flanco** | El cambio de la señal | Una sola vuelta de `loop()` | «El pulsador **se apretó**» |

Hay dos flancos:

- **Flanco de subida:** antes estaba inactivo y ahora está activo. El pulsador **se apretó**.
- **Flanco de bajada:** antes estaba activo y ahora está inactivo. El pulsador **se soltó**.

Para detectar un flanco, el programa necesita **memoria**: comparar la lectura de ahora con la de la vuelta anterior. Si antes estaba suelto y ahora está apretado, acaba de ocurrir un flanco de subida.

## El rebote de los contactos

Hay un detalle del mundo real. Un pulsador es mecánico: al cerrarse, sus contactos metálicos **rebotan** y se abren y cierran varias veces en pocos milisegundos, antes de quedar firmes. Tú no lo notas, pero un programa que lee miles de veces por segundo vería varias pulsaciones donde hubo una.

La solución es leer el pulsador cada **20 ms**. El rebote dura menos que eso, así que entre una lectura y otra ya terminó. A esta técnica se le llama **antirrebote**.

> [!TIP] En los PLC comerciales
> Los PLC tradicionales tienen un filtro de entrada que hace esto mismo. Aquí lo haces tú en el programa, y puedes ajustarlo: un sensor electrónico no rebota y podría leerse más seguido.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador normalmente abierto.

## Conexiones

Como en la [lección 03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/#conexiones):

1. **`1M`** al **0 V** de la fuente.
2. El pulsador, entre **+24 V** e **`I0.0`**.

## El programa

Cada pulsación en `I0.0` cambia el relé `Q0.0`: si estaba apagado lo enciende, y si estaba encendido lo apaga. El Monitor Serie avisa solo cuando algo cambia.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 2.Tiempo_y_logica → 07.Flancos_un_pulsador. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 2.Tiempo_y_logica / 07.Flancos_un_pulsador**. Para practicar con un tablero real en pantalla, prueba el caso [Alarma con reconocimiento](https://jw-control.com/casos/08-alarma/).

## Cómo funciona el programa

Vamos por partes.

### Las variables: la memoria del telerruptor

```cpp
const uint32_t ANTIRREBOTE_MS = 20;
uint32_t ultimaLectura = 0;
```

El tiempo entre lecturas y la hora de la última lectura, como en la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/).

```cpp
bool antes = false;
```

`antes` guarda la lectura de la vuelta anterior. Es la memoria que permite detectar el flanco. Empieza en `false`: al arrancar, el pulsador está suelto.

```cpp
bool luz = false;
```

`luz` es el estado del telerruptor: encendido o apagado.

### Leer solo cada 20 ms

```cpp
if (millis() - ultimaLectura < ANTIRREBOTE_MS)
{
    return;
}
ultimaLectura = millis();
```

Si todavía no pasaron 20 ms desde la última lectura, `return` **termina esta vuelta** de `loop()` en el acto. No es un `delay()`: el programa no se queda esperando, sino que salta a la vuelta siguiente. Cuando ya pasaron los 20 ms, se anota la hora y se sigue con el resto.

### El flanco de subida

```cpp
bool ahora = digitalRead(I0_0) == HIGH;
```

La lectura de esta vuelta, como un `bool`.

```cpp
if (ahora && !antes)
{
    luz = !luz;
    digitalWrite(Q0_0, luz);
```

*Ahora está apretado **y** antes **no** estaba apretado*: eso es un flanco de subida. Solo en esa vuelta se invierte `luz` y se escribe en el relé. En las vueltas siguientes, con el dedo todavía sobre el pulsador, `antes` ya vale `true` y la condición no se cumple.

```cpp
Serial.println(luz ? "encendida" : "apagada");
```

El signo `?` elige entre dos valores: si `luz` es `true`, el texto es «encendida»; si no, «apagada». Es un `if` / `else` corto, útil para mensajes.

### El flanco de bajada

```cpp
if (!ahora && antes)
{
    Serial.println("Pulsador suelto");
}
```

Lo contrario: ahora está suelto y antes estaba apretado. Aquí solo se avisa por el Monitor Serie, para que veas los dos flancos.

### Recordar para la próxima vuelta

```cpp
antes = ahora;
```

La línea más importante. Al final de cada lectura, lo de «ahora» pasa a ser lo de «antes». Si la olvidas, `antes` se queda en `false` para siempre y cada lectura con el pulsador apretado parecería un flanco nuevo.

## Súbelo y pruébalo

1. Sube el programa y abre el **Monitor Serie** a **115200 baudios**.
2. Aprieta el pulsador: `Q0.0` se enciende. Suéltalo: sigue encendido.
3. Apriétalo otra vez: `Q0.0` se apaga.
4. Mantén el pulsador apretado varios segundos: no pasa nada más, porque solo cuenta el flanco.

```text
Lección 07: cada pulsación en I0.0 cambia Q0.0
Pulsación: Q0.0 encendida
Pulsador suelto
Pulsación: Q0.0 apagada
Pulsador suelto
```

## Si algo no funciona

- **A veces una pulsación cuenta como dos:** el pulsador rebota más de 20 ms. Prueba con `ANTIRREBOTE_MS = 50`.
- **La luz parpadea mientras mantienes el pulsador:** falta `antes = ahora;` al final.
- **No responde:** revisa el cable de `1M` a 0 V.

## Para practicar

- Muestra en el Monitor Serie cuántas veces se apretó el pulsador desde el arranque.
- Haz que `Q0.1` cambie al **soltar** el pulsador, en lugar de al apretarlo.

## Resumen

- Un estado dura mientras la señal se mantenga; un flanco ocurre una sola vez, cuando la señal cambia.
- Para detectar un flanco se compara la lectura de ahora con la de la vuelta anterior, guardada en una variable.
- Los contactos mecánicos rebotan; leerlos cada 20 ms evita contar una pulsación como varias.
- `return` termina la vuelta actual de `loop()` sin detener el programa.

En la siguiente lección, [Marcha y parada de un motor](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/), usarás estas ideas en el circuito más común de la industria.
