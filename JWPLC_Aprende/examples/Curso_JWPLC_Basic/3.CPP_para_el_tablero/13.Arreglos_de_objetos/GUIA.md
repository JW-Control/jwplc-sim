<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 13: Arreglos de objetos: cuatro cintas

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** la lección [12](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/12-clases-un-motor/)

Una línea de transporte tiene cuatro cintas. El material cae en la cinta 1, pasa a la 2, a la 3 y la 4 lo descarga en una tolva. Si arrancas las cuatro a la vez, el pico de corriente de los cuatro motores se suma; y si arrancas primero la cinta 1, echa material sobre la 2 que todavía está detenida. Por eso estas líneas arrancan **escalonadas**: primero la última, y cada pocos segundos la anterior.

Con la clase de la lección 12 escribirías `cinta1`, `cinta2`, `cinta3` y `cinta4`, y cada orden cuatro veces. Hay una forma mejor: un **arreglo**.

## Un arreglo es una fila de casilleros

Un arreglo guarda varios datos del mismo tipo bajo un solo nombre, uno en cada casillero numerado. El número del casillero se llama **índice** y **empieza en 0**:

| Índice | `cintas[0]` | `cintas[1]` | `cintas[2]` | `cintas[3]` |
|---|---|---|---|---|
| Equipo | Cinta 1 | Cinta 2 | Cinta 3 | Cinta 4 |
| Relé | `Q0.0` | `Q0.1` | `Q0.2` | `Q0.3` |

`cintas[2].encender()` enciende la cinta 3. Y lo importante: el índice puede ser una **variable**. `cintas[i].encender()` enciende la cinta que diga `i`. Así una sola línea sirve para las cuatro.

## for: repetir para cada casillero

Para hacer lo mismo con todo el arreglo se usa un bucle `for`:

```cpp
for (int i = 0; i < CANTIDAD; i++)
{
    cintas[i].apagar();
}
```

```text
for (int i = 0;   i < CANTIDAD;   i++)
      │             │               └── al terminar cada vuelta, suma 1 a i
      │             └── repite mientras i sea menor que 4
      └── empieza con i en 0
```

Se ejecuta cuatro veces, con `i` valiendo 0, 1, 2 y 3. Un `for` termina enseguida: no es un `delay()`, el programa sigue corriendo.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador normalmente abierto (marcha) y uno normalmente cerrado (parada).
- Cuatro contactores con bobina de 24 V DC, o cuatro lámparas que los reemplacen.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: MARCHA (NA) y **`I0.1`**: PARADA (NC), los dos desde **+24 V**.
3. **`Q0.0`** a **`Q0.3`**: bobinas de los contactores de las cintas 1 a 4, como en la [lección 08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/#conexiones).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 13.Arreglos_de_objetos. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 3, lección 13. Trae las cuatro cintas ya cableadas y una práctica que se califica sola.

## Cómo funciona el programa

### La clase `Cinta`

Es la clase `Motor` de la lección 12, más simple: `encender()`, `apagar()`, `estaEncendida()` y `escribirSalida()`. El constructor arma el nombre con el número:

```cpp
nombre = "Cinta " + String(numero);
```

`String(numero)` convierte el número en texto para poder unirlo con `+`.

### El arreglo

```cpp
const int CANTIDAD = 4;

Cinta cintas[CANTIDAD] = {
    Cinta(Q0_0, 1),
    Cinta(Q0_1, 2),
    Cinta(Q0_2, 3),
    Cinta(Q0_3, 4),
};
```

`Cinta cintas[CANTIDAD]` crea un arreglo de cuatro cintas. Entre llaves va cada objeto con los datos de su constructor, en orden: el primero queda en `cintas[0]`. La cantidad va en una constante con nombre: si la línea crece a seis cintas, se cambia un número y se agregan dos renglones.

### La memoria de la secuencia

```cpp
bool arrancando = false;
int siguiente = 0;         // Índice de la próxima cinta que se enciende.
uint32_t ultimoPaso = 0;   // Cuándo se encendió la anterior.
```

Tres datos: si hay un arranque en curso, qué cinta toca y cuándo se encendió la anterior. Es la técnica de `millis()` de la lección 06 con un índice.

### Empezar por la última

```cpp
if (marcha && paradaSinApretar && !arrancando && !cintas[0].estaEncendida())
{
    arrancando = true;
    siguiente = CANTIDAD - 1;
    cintas[siguiente].encender();
    ultimoPaso = millis();
}
```

Con MARCHA, si no hay un arranque en curso y la línea no está ya en marcha, la secuencia empieza. `CANTIDAD - 1` es 3: el índice de la **última** cinta. Se enciende enseguida y se anota la hora.

### Un paso cada 2 segundos

```cpp
if (arrancando && millis() - ultimoPaso >= PASO_ARRANQUE_MS)
{
    siguiente = siguiente - 1;
    cintas[siguiente].encender();
    ultimoPaso = millis();
    if (siguiente == 0)
    {
        arrancando = false;  // Ya están todas.
    }
}
```

Cada 2 segundos el índice baja uno y se enciende esa cinta: 3, 2, 1, 0. Cuando llega a la primera (índice 0) la secuencia termina. La misma línea `cintas[siguiente].encender()` enciende las cuatro, cada una en su momento.

### Parar y escribir con `for`

```cpp
if (!paradaSinApretar)
{
    arrancando = false;
    for (int i = 0; i < CANTIDAD; i++)
    {
        cintas[i].apagar();
    }
}

for (int i = 0; i < CANTIDAD; i++)
{
    cintas[i].escribirSalida();
}
```

PARADA corta la secuencia y apaga las cuatro con un `for`. Al final de cada vuelta de `loop()`, otro `for` escribe los cuatro relés.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Da un toque a MARCHA: se cierra `Q0.3` y, cada 2 segundos, `Q0.2`, `Q0.1` y `Q0.0`.
3. Aprieta PARADA a mitad del arranque: todo se abre y la secuencia no sigue.
4. Arranca otra vez y espera a que estén las cuatro. Aprieta PARADA: se abren los cuatro relés.

```text
Lección 13: marcha I0.0, parada NC I0.1, cintas en Q0.0 a Q0.3
Cinta 4 encendida
Cinta 3 encendida
Cinta 2 encendida
Cinta 1 encendida
```

## Si algo no funciona

- **El programa se reinicia o hace cosas raras:** un índice fuera del arreglo. Con cuatro cintas los índices van de 0 a 3; `cintas[4]` no existe y C++ no avisa. Revisa que el `for` diga `i < CANTIDAD` y no `i <= CANTIDAD`.
- **Se encienden todas a la vez:** falta comparar con `PASO_ARRANQUE_MS` antes de bajar el índice.
- **Arranca por la cinta 1:** `siguiente` debe empezar en `CANTIDAD - 1`, no en 0.

## Para practicar

- Cambia la parada para que **vacíe** las cintas: primero la 1, que deja de recibir material, y cada segundo la siguiente hasta la 4. Es la misma secuencia del arranque, recorrida al revés.
- Enciende una lámpara en `Q0.4` mientras dure el arranque o la parada escalonada.

## Resumen

- Un **arreglo** guarda muchos objetos iguales bajo un nombre; cada uno se alcanza con su **índice**, que empieza en 0.
- El índice puede ser una variable: una línea sirve para todos los equipos.
- **`for`** repite un bloque para cada índice, sin detener el programa.
- Una secuencia escalonada es un índice que avanza cada cierto tiempo, con `millis()`.

En la siguiente lección, [Temporizadores y flancos como clases](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/14-temporizadores-como-clases/), armarás tu propia caja de herramientas de PLC.
