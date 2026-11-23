<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 06: Esperar sin detener el programa

**Nivel:** básico · **Tiempo:** unos 20 minutos · **Necesitas:** la [unidad 1](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/01-hola-jwplc/)

Al final de la lección 05 viste un problema: con `delay(500)`, un relé tardaba hasta medio segundo en seguir a su entrada. En una máquina eso no se puede aceptar. Si el operario aprieta la parada de emergencia mientras el programa está «esperando», nadie la atiende.

Esta lección es la más importante de la unidad 2: todo lo que viene después (flancos, temporizadores, contadores, máquinas de estados) se apoya en la idea que vas a aprender aquí.

## El problema con delay()

`delay()` es como un operario que pone una olla al fuego y **se queda mirándola** durante diez minutos. Mientras tanto no atiende el teléfono, no revisa la otra máquina, no ve que alguien le hace señas. Para un programa de práctica está bien; para una máquina, no.

Lo que hace un operario con experiencia es distinto: pone la olla, **mira la hora** y sigue con lo suyo. Cada tanto vuelve a mirar el reloj y se pregunta: *¿ya pasaron diez minutos?* Si pasaron, apaga el fuego. Si no, sigue con lo demás.

El programa puede trabajar igual. Para eso necesita un reloj.

## millis(): el reloj interno

`millis()` devuelve cuántos **milisegundos** pasaron desde que el equipo arrancó. Al encender vale 0; un segundo después, 1000; un minuto después, 60000. Nunca se detiene y nunca hace esperar al programa: solo informa la hora.

Con ese reloj, la receta para esperar sin detenerse siempre es la misma:

1. Anotar en una variable **cuándo** pasó lo último.
2. En cada vuelta de `loop()`, calcular cuánto tiempo pasó desde entonces: `ahora - ultimoCambio`.
3. Si ya pasó el tiempo, actuar y **anotar la hora otra vez**. Si no, seguir con lo demás.

Como `loop()` da miles de vueltas por segundo, la pregunta se hace tan seguido que la acción ocurre justo a tiempo. Y entre pregunta y pregunta, el programa atiende todo lo demás.

> [!TIP] ¿Y cuando millis() se llene?
> `millis()` se guarda en un `uint32_t`, que cuenta milisegundos hasta unos 49 días. Después vuelve a 0. No te preocupes: la resta `ahora - ultimoCambio` sigue dando el tiempo correcto incluso en ese momento, por cómo funcionan los números sin signo. Por eso siempre se compara así, con una resta.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador normalmente abierto.

## Conexiones

Como en la [lección 03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/#conexiones):

1. **`1M`** al **0 V** de la fuente.
2. El pulsador, entre **+24 V** e **`I0.0`**.

## El programa

El programa hace **dos tareas a la vez**: `Q0.0` parpadea cada medio segundo, y `Q0.1` sigue al pulsador de `I0.0` al instante, sin importar en qué momento del parpadeo lo aprietes.

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 2.Tiempo_y_logica → 06.Tiempo_sin_delay. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 2.Tiempo_y_logica / 06.Tiempo_sin_delay**. Para practicar con un tablero real en pantalla, prueba el caso [Semáforo](https://jw-control.com/casos/03-semaforo/).

## Cómo funciona el programa

Vamos por partes.

### Un valor que no cambia: const

```cpp
const uint32_t INTERVALO_MS = 500;
```

`const` indica que este valor es **fijo**: el programa no lo puede modificar por error. Se acostumbra escribir estos nombres en MAYÚSCULAS para reconocerlos de un vistazo, y agregar la unidad (`_MS`, milisegundos) para no confundirse. Si mañana quieres otro ritmo, cambias un solo número aquí arriba.

### La memoria del programa

```cpp
uint32_t ultimoCambio = 0;
```

```cpp
bool luzEncendida = false;
```

`ultimoCambio` es la hora anotada: el momento en que la luz cambió por última vez. `luzEncendida` recuerda si la luz está encendida o apagada. Las dos van fuera de `loop()` para que conserven su valor entre vueltas.

### Leer la hora

```cpp
uint32_t ahora = millis();
```

Se lee el reloj una vez al principio de la vuelta y se guarda en `ahora`.

### Tarea 1: la intermitencia

```cpp
if (ahora - ultimoCambio >= INTERVALO_MS)
{
    ultimoCambio = ahora;
    luzEncendida = !luzEncendida; // Si estaba encendida se apaga, y al revés.
    digitalWrite(Q0_0, luzEncendida);
}
```

Esta es la receta de arriba, en código. `ahora - ultimoCambio` es el tiempo que pasó desde el último cambio. Si ya llegó a 500 ms:

1. Se anota la hora nueva en `ultimoCambio`, para empezar a contar otra vez.
2. `!luzEncendida` invierte el estado, como el NO de la [lección 04](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/).
3. Se escribe el nuevo estado en el relé.

Si todavía no pasaron 500 ms, el bloque se salta y el programa sigue de largo, **sin esperar**.

### Tarea 2: el pulsador

```cpp
digitalWrite(Q0_1, digitalRead(I0_0));
```

Lee `I0_0` y escribe el resultado directo en `Q0_1`, en una sola línea. Como nadie se queda esperando en este programa, esta línea se ejecuta miles de veces por segundo: el relé sigue al pulsador sin retraso.

## Súbelo y pruébalo

1. Sube el programa: el indicador de `Q0.0` parpadea cada medio segundo.
2. Aprieta y suelta el pulsador varias veces, rápido: `Q0.1` responde en el momento, mientras `Q0.0` sigue con su ritmo.
3. Compáralo con la lección 05, donde la salida tardaba en responder.

## Si algo no funciona

- **`Q0.0` no parpadea:** revisa que `ultimoCambio = ahora;` esté dentro del `if`. Sin esa línea, después del primer cambio la luz cambiaría en cada vuelta, tan rápido que no lo verías.
- **`Q0.1` no responde:** revisa el cable de `1M` a 0 V y el pulsador en `I0.0`.
- **Usaste `uint16_t` para el tiempo:** llega solo a 65 535 ms, poco más de un minuto, y la cuenta se descontrola. Todo lo que guarde un valor de `millis()` va en `uint32_t`.

## Para practicar

- Haz que `Q0.2` parpadee a otro ritmo, cada 2 segundos, con **su propia** variable de tiempo y su propio estado. Verás dos intermitencias independientes y el pulsador respondiendo igual de rápido.
- Haz que la intermitencia de `Q0.0` funcione solo mientras el pulsador esté apretado.

## Resumen

- `delay()` detiene todo el programa: mientras espera, no lee entradas ni atiende nada.
- `millis()` da los milisegundos desde el arranque, sin detener nada.
- Para esperar sin detenerse: anota la hora, pregunta en cada vuelta si ya pasó el tiempo y, si pasó, actúa y anota otra vez.
- Las constantes `const` guardan valores fijos con un nombre claro.

En la siguiente lección, [Flancos](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/), harás que un solo pulsador encienda y apague una luz.
