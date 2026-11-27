<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-2/09-temporizadores.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 09: Temporizadores

**Nivel:** básico · **Tiempo:** unos 25 minutos · **Necesitas:** las lecciones [06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/) y [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/)

Muchas decisiones de una máquina dependen del tiempo. Un arranque que exige mantener el pulsador 3 segundos, para que un toque accidental no mueva nada. La luz de un pasillo que se queda encendida un rato después de que pasó la última persona. Un ventilador que sigue andando unos minutos después de apagar el horno.

Todos los PLC traen **temporizadores** para esto. En el JWPLC Basic los vas a escribir tú, con la técnica de `millis()` de la lección 06, y de paso aprenderás dos herramientas para ordenar programas grandes: las **funciones** y los **struct**.

## Los dos temporizadores más usados

| Temporizador | Nombre en los PLC | Qué hace |
|---|---|---|
| Retardo a la conexión | **TON** (*timer on delay*) | La salida se activa cuando la entrada **lleva** cierto tiempo activa. Si la entrada se suelta antes, no pasa nada y la cuenta vuelve a empezar |
| Retardo a la desconexión | **TOF** (*timer off delay*) | La salida se activa **con** la entrada y se queda activa cierto tiempo **después** de que la entrada se apaga |

Visto en el tiempo, con un TON de 3 s y un TOF de 10 s:

```text
TON 3 s   entrada  ___|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾|____
          salida   ___________|‾‾‾‾‾‾‾‾|____
                      <- 3 s ->

TOF 10 s  entrada  ___|‾‾‾‾|________________________
          salida   ___|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾|______
                           <---- 10 s ---->
```

## Funciones: un bloque con nombre

Ya usaste muchas funciones: `digitalRead()`, `delay()`, `Serial.println()`. Ahora vas a **escribir** las tuyas. Una función es un bloque de código con nombre que recibe datos, hace un trabajo y devuelve un resultado. Se escribe una vez y se usa las veces que haga falta.

```text
bool retardoConexion(Temporizador &t, bool entrada, uint32_t tiempoMs)
 │         │                 └── los datos que recibe, separados por comas
 │         └── su nombre
 └── el tipo de dato que devuelve
```

## struct: agrupar datos que van juntos

Cada temporizador necesita recordar dos cosas: **cuándo** empezó a contar y si su salida está **activa**. Si tienes diez temporizadores, serían veinte variables sueltas. Un **`struct`** agrupa esos datos bajo un solo nombre, como una ficha con varios campos. Después creas una ficha por cada temporizador.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Dos pulsadores normalmente abiertos (uno de ellos puede ser un sensor de presencia PNP).

## Conexiones

Como en la [lección 04](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/#conexiones):

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: pulsador de arranque, entre **+24 V** y la entrada.
3. **`I0.1`**: sensor de presencia del pasillo, o un pulsador que lo simule.

## El programa

| Relé | Temporizador | Qué hace |
|---|---|---|
| `Q0.0` | TON de 3 s | Se cierra cuando `I0.0` lleva 3 segundos apretado |
| `Q0.1` | TOF de 10 s | La luz del pasillo: se enciende con la presencia y se apaga 10 segundos después de la última detección |

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 2.Tiempo_y_logica → 09.Temporizadores. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 2.Tiempo_y_logica / 09.Temporizadores**. Para practicar con un tablero real en pantalla, prueba el caso [Arranque estrella-triángulo](https://jw-control.com/casos/06-estrella-triangulo/).

## Cómo funciona el programa

Vamos por partes.

### La ficha de un temporizador

```cpp
struct Temporizador
{
    uint32_t inicio;
    bool salida;
};
```

Esto **define** el struct: dice que todo `Temporizador` tiene un campo `inicio` (la hora en que empezó a contar) y un campo `salida`. Todavía no crea ningún temporizador; solo describe cómo es la ficha.

```cpp
Temporizador arranque = {0, false};
Temporizador luzPasillo = {0, false};
```

Ahora sí se crean dos temporizadores, cada uno con sus propios datos. `{0, false}` llena los campos en orden: `inicio` en 0 y `salida` apagada. Para leer un campo se usa un punto: `arranque.salida`.

### El retardo a la conexión (TON)

```cpp
bool retardoConexion(Temporizador &t, bool entrada, uint32_t tiempoMs)
```

La función recibe el temporizador, el estado de la entrada y el tiempo en milisegundos, y devuelve un `bool`: cómo debe estar la salida.

El `&` delante de `t` es importante. Sin él, la función recibiría una **copia** del temporizador, y lo que anotara se perdería al terminar. Con `&` trabaja sobre el temporizador **original**, así que recuerda su hora de inicio entre una vuelta y otra.

```cpp
if (!entrada)
{
    // Entrada apagada: la cuenta vuelve a empezar desde ahora.
    t.inicio = millis();
    t.salida = false;
}
else if (millis() - t.inicio >= tiempoMs)
{
    t.salida = true;
}
return t.salida;
```

Mientras la entrada está apagada, el temporizador **anota la hora en cada vuelta**: la cuenta queda siempre en cero. Cuando la entrada se activa, la hora deja de actualizarse y el tiempo empieza a correr. Si llega a `tiempoMs`, la salida se activa. Si la entrada se suelta antes, se vuelve al primer caso y la cuenta se reinicia.

`else if` encadena una segunda pregunta: solo se revisa si la primera no se cumplió. `return` entrega el resultado a quien llamó a la función.

### El retardo a la desconexión (TOF)

```cpp
if (entrada)
{
    // Mientras la entrada esté activa, la salida también, y la cuenta
    // se reinicia en cada vuelta.
    t.inicio = millis();
    t.salida = true;
}
else if (millis() - t.inicio >= tiempoMs)
{
    t.salida = false;
}
```

Es el espejo del anterior. Mientras hay presencia, la salida está activa y la hora se renueva en cada vuelta. Cuando la presencia desaparece, la hora queda fija en el **último momento** en que hubo alguien, y a los 10 segundos la salida se apaga. Si alguien vuelve a pasar antes, la hora se renueva y los 10 segundos empiezan de nuevo.

### Usar las funciones

```cpp
digitalWrite(Q0_0, retardoConexion(arranque, pulsador, 3000));
digitalWrite(Q0_1, retardoDesconexion(luzPasillo, presencia, 10000));
```

Para **llamar** a una función se escribe su nombre con los datos entre paréntesis. Su resultado se escribe directo en el relé. Mira lo que ganaste: si mañana necesitas diez temporizadores, creas diez fichas y llamas a la misma función diez veces. La lógica del temporizador está escrita y probada en un solo lugar.

## Súbelo y pruébalo

1. Sube el programa.
2. Toca `I0.0` un segundo y suéltalo: no pasa nada.
3. Mantén `I0.0` apretado: a los 3 segundos se cierra `Q0.0`. Al soltar, se abre.
4. Activa `I0.1` y suéltalo: `Q0.1` se enciende y se apaga 10 segundos después.
5. Actívalo otra vez antes de que se cumplan los 10 segundos: la cuenta empieza de nuevo.

## Si algo no funciona

- **El TON se activa al instante:** revisa que en `retardoConexion` la hora se anote cuando la entrada está **apagada**.
- **Los temporizadores no recuerdan nada:** falta el `&` delante de `t`; la función está trabajando con una copia.
- **Los tiempos no coinciden:** recuerda que van en milisegundos: 3 segundos son `3000`.

## Para practicar

- Cambia los tiempos.
- Agrega un tercer temporizador: una bocina en `Q0.2` que suene si la presencia de `I0.1` dura más de 30 segundos. ¿Cuál de los dos temporizadores necesitas?

## Resumen

- TON: la salida se activa cuando la entrada lleva cierto tiempo activa. TOF: la salida se mantiene cierto tiempo después de que la entrada se apaga.
- Una función es un bloque con nombre que recibe datos y devuelve un resultado; se escribe una vez y se usa muchas.
- Un `struct` agrupa datos que van juntos; cada temporizador es una ficha con sus propios datos.
- El `&` hace que la función trabaje sobre el dato original y no sobre una copia.

En la siguiente lección, [Contadores](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/10-contadores/), contarás piezas en una cinta y la detendrás al llenar la caja.
