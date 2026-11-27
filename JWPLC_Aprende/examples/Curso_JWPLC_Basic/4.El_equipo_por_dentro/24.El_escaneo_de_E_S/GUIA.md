<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/24-el-escaneo-de-e-s.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 24: El escaneo de E/S: las 8 entradas de una vez

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [05](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/05-las-8-entradas-y-salidas/) y [13](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/)

En la [lección 16](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/16-programa-en-pestanas/) armaste el ciclo de un PLC: leer las entradas, decidir, escribir las salidas. Ahora toca ver cómo lo hace el equipo por dentro, y por qué conviene leer las 8 entradas **juntas**.

## Una foto de las entradas

Las entradas y salidas del JWPLC Basic no están conectadas directo al procesador: pasan por un chip **expansor de E/S**. El package lo lee en segundo plano y guarda una **foto** de las 8 entradas en el objeto **`JWPLC_IO`**.

| Función | Qué hace |
|---|---|
| `JWPLC_IO.inputs()` | Las 8 entradas en un byte (`uint8_t`) |
| `JWPLC_IO.outputs()` | Las 8 salidas, tal como están |
| `JWPLC_IO.setOutputs(bits)` | Escribe las 8 salidas de una vez |
| `JWPLC_IO.input(3)` | Solo `I0.3`, de la misma foto |

¿Por qué una foto? Con `digitalRead()` entrada por entrada, entre la primera y la última pasa un instante. Si dos sensores cambian justo en ese momento, el programa puede ver uno nuevo y otro viejo. Con la foto, **las 8 son del mismo instante**. Es lo que hace cualquier PLC al comienzo de cada ciclo.

## Un byte son 8 entradas

Lo viste en la [lección 05](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/05-las-8-entradas-y-salidas/) con `digitalReadBlock()`: un `uint8_t` tiene 8 **bits**, y cada uno es una entrada: el bit 0 es `I0.0`, el bit 1 es `I0.1`, y así hasta el bit 7. Con `I0.0` e `I0.2` activas, el byte vale:

```text
bit:      7 6 5 4 3 2 1 0
entrada:  7 6 5 4 3 2 1 0
valor:    0 0 0 0 0 1 0 1   = 5
```

Tres operaciones alcanzan para trabajar con bits:

| Operación | Qué hace | Ejemplo |
|---|---|---|
| `bitRead(x, i)` | Lee el bit `i` | `bitRead(entradas, 2)` → ¿`I0.2` activa? |
| `x & máscara` | Deja pasar solo los bits que la máscara tiene en 1 | `entradas & 0x0F` → solo `I0.0` a `I0.3` |
| `x ^ y` | Da 1 en los bits que son distintos entre `x` e `y` | `entradas ^ antes` → qué cambió |

`0x0F` es una forma corta de escribir `00001111`: cada cifra hexadecimal son 4 bits.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Dos pulsadores NA y dos finales de carrera NA (o cuatro pulsadores).
- Cinco lámparas de 24 V DC.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`** e **`I0.1`**: pulsadores (NA). **`I0.2`** e **`I0.3`**: finales de carrera B1 y B2 (NA). Todos desde **+24 V**.
3. **`Q0.0`** a **`Q0.3`**: lámparas H1 a H4. **`Q0.4`**: lámpara de error H5 (para practicar).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 24.El_escaneo_de_E_S. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 24. En **E/S y variables** puedes ver `entradas` y `cambios` mientras aprietas.

## Cómo funciona el programa

### ¿Qué cambió?

```cpp
uint8_t entradas = JWPLC_IO.inputs();
uint8_t cambios = entradas ^ entradasAntes;
```

`^` compara bit por bit: donde la entrada está igual que en la vuelta anterior da 0, y donde cambió da 1. Si `cambios` vale 0, no pasó nada y no hay que revisar nada más.

### Revisar las 8 con un bucle

```cpp
for (int i = 0; i < 8; i++)
{
    if (bitRead(cambios, i))
    {
        Serial.printf("%6.2f s  I0.%d %s\n", millis() / 1000.0, i, bitRead(entradas, i) ? "ON" : "OFF");
    }
}
```

Un solo bucle atiende a las 8 entradas: la que cambió se anota con su número y su estado nuevo. Agregar un sensor no agrega código.

### Las salidas de una vez

```cpp
JWPLC_IO.setOutputs(entradas & 0x0F);
```

`& 0x0F` se queda con los bits de `I0.0` a `I0.3` y pone los demás en 0. Ese byte va directo a las salidas: cada lámpara sigue a su entrada, y `Q0.4` a `Q0.7` quedan apagadas.

> [!WARNING] setOutputs() escribe las 8
> `setOutputs()` pisa todas las salidas. Si en el mismo programa usas `digitalWrite()` para otra salida, la siguiente vuelta la apaga. Elige una de las dos formas.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Aprieta las entradas de `I0.0` a `I0.3`, de a una y varias a la vez: cada lámpara sigue a su entrada y el Monitor anota cada cambio y el byte completo.

```text
Lección 24: entradas I0.0 a I0.3, lámparas Q0.0 a Q0.3
  2.10 s  I0.0 ON
Entradas: 00000001
  3.40 s  I0.2 ON
Entradas: 00000101
  4.02 s  I0.0 OFF
Entradas: 00000100
```

## Si algo no funciona

- **El Monitor se llena de líneas sin tocar nada:** falta `entradasAntes = entradas;` al final, y cada vuelta ve todo como cambio.
- **Una lámpara no se apaga nunca:** otra parte del programa usa `digitalWrite()` y `setOutputs()` a la vez.
- **El binario sale al revés:** el bit 7 va a la izquierda; el bucle de `enBinario()` va de 7 a 0.

## Para practicar

- **Cuánto estuvo activa:** al soltar una entrada, escribe cuánto tiempo estuvo activa, con un decimal: `I0.1 estuvo 1.2 s`. Pista: un arreglo `unsigned long inicioActiva[8]`, como los de la [lección 13](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/).
- **Dos finales a la vez:** B1 y B2 son finales de carrera opuestos: no pueden estar activos a la vez. Si pasa, enciende `Q0.4` y escribe una sola vez `Error: B1 y B2 a la vez`. Pista: la máscara `0x0C` (`00001100`): `(entradas & 0x0C) == 0x0C`.

## Resumen

- El equipo lee las 8 entradas juntas y guarda una **foto** en `JWPLC_IO`: todas son del mismo instante.
- Un byte son 8 bits, uno por entrada.
- `&` con una máscara se queda con algunos bits; `^` muestra cuáles cambiaron; `bitRead()` lee uno.
- Un bucle de 0 a 7 atiende a todas las entradas con el mismo código.

En la siguiente lección, [Proyecto: contador de lotes](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/25-proyecto-contador-de-lotes/), juntarás todo lo de esta unidad en una sola máquina.
