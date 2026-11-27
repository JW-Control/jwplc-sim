<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/14-temporizadores-como-clases.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 14: Temporizadores y flancos como clases

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/), [09](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/) y [12](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/12-clases-un-motor/)

En un PLC comercial, un temporizador es un **bloque**: lo pones en el programa, le das un nombre (`T1`, `T2`…) y cada uno lleva su propia cuenta. Un programa de tablero usa decenas: filtros de sensores, retardos de arranque, tiempos de ventilación, avisos.

En la lección 09 escribiste el TON y el TOF. En la 07, el flanco. Ahora que sabes hacer clases, los vas a juntar en una **caja de herramientas** que se usa igual que los bloques de un PLC: un objeto por cada temporizador, y cada uno se maneja con `objeto.funcion()`.

## Las herramientas

| Clase | Bloque de PLC | Se usa así | Devuelve `true` |
|---|---|---|---|
| `TON` | Retardo a la conexión | `t.ejecutar(entrada, 2000)` | cuando la entrada lleva 2 s activa |
| `TOF` | Retardo a la desconexión | `t.ejecutar(entrada, 5000)` | con la entrada, y hasta 5 s después |
| `Flanco` | R_TRIG / F_TRIG | `f.subida(senal)` · `f.bajada(senal)` | solo en la vuelta en que la señal cambia |

Tienen los mismos nombres y funciones que la pestaña `K_Utilidades` de la **plantilla de proyecto JWPLC**, que verás en la lección 16. Lo que aprendas aquí te sirve tal cual allá.

## La regla de oro: un objeto por uso

Un temporizador recuerda **cuándo** empezó a contar. Si usas el mismo objeto para dos cosas, una pisa la hora de la otra y los dos tiempos salen mal. Por eso cada uso tiene su propio objeto, con un nombre que diga para qué es: `filtroPresostato`, `ventilacion`, `arranqueMotor`.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un presostato con contacto que cierra con presión baja, o un interruptor que lo simule.
- Dos contactores con bobina de 24 V DC, o dos lámparas.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: contacto del presostato, desde **+24 V**. Cierra cuando la presión baja y hace falta aire.
3. **`Q0.0`**: bobina del contactor del compresor. **`Q0.1`**: bobina del contactor del ventilador.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 14.Temporizadores_como_clases. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 3, lección 14. Trae el compresor ya cableado y una práctica que se califica sola.

## Cómo funciona el programa

### El TON por dentro

```cpp
bool ejecutar(bool entrada, uint32_t tiempoMs)
{
    if (!entrada)
    {
        contando = false;
        salida = false;
    }
    else
    {
        if (!contando)
        {
            contando = true;
            inicio = millis();
        }
        salida = millis() - inicio >= tiempoMs;
    }
    return salida;
}
```

Es el TON de la lección 09 con una mejora: anota la hora **una sola vez**, en el instante en que la entrada se activa (`contando` pasa de `false` a `true`). Mientras la entrada sigue activa, compara cuánto pasó desde esa hora. Si la entrada se apaga, todo vuelve a cero.

Los datos (`inicio`, `contando`, `salida`) son privados. Cada objeto `TON` tiene los suyos, y nadie los cambia sin pasar por `ejecutar()`.

### El TOF y el Flanco

El TOF es el mismo de la lección 09. El `Flanco` es la técnica de la lección 07 guardada en un objeto: recuerda la señal de la vuelta anterior en `anterior` y devuelve `true` solo cuando cambia. Tiene dos funciones: `subida()` para el paso de apagado a encendido y `bajada()` para el contrario. Usa una de las dos en cada objeto: las dos actualizan `anterior`.

### Los objetos de la máquina

```cpp
TON filtroPresostato;   // La presión tiene que estar baja 2 s seguidos.
TOF ventilacion;        // El ventilador sigue 5 s después de parar.
Flanco arranqueMotor;   // Para contar arranques.
```

Estas clases no tienen constructor: no necesitan datos para empezar. Se crean como una variable, con el tipo y el nombre.

### El filtro del presostato

```cpp
compresor = filtroPresostato.ejecutar(presionBaja, 2000);
```

Cuando arranca un consumo grande de aire, la presión puede bajar un instante y volver. Sin filtro, el compresor arrancaría y pararía enseguida. Con el TON, el presostato tiene que pedir aire **2 segundos seguidos**.

### Contar arranques con el flanco

```cpp
if (arranqueMotor.subida(compresor))
{
    arranques = arranques + 1;
    Serial.println("Arranques: " + String(arranques));
}
```

`compresor` es `true` muchas vueltas seguidas; el flanco de subida es `true` en una sola: la del arranque. Por eso cuenta uno por arranque.

### La ventilación

```cpp
digitalWrite(Q0_1, ventilacion.ejecutar(compresor, 5000));
```

El ventilador acompaña al compresor y sigue 5 segundos más para sacar el calor del motor. El resultado del TOF va directo al relé.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Cierra el contacto de `I0.0` un segundo y ábrelo: no pasa nada.
3. Ciérralo y déjalo cerrado: a los 2 segundos se cierran `Q0.0` y `Q0.1`, y el Monitor Serie dice `Arranques: 1`.
4. Ábrelo: `Q0.0` se abre enseguida y `Q0.1` se abre 5 segundos después.

## Si algo no funciona

- **El compresor arranca al instante:** el TON tiene que anotar la hora solo cuando `contando` pasa a `true`, no en cada vuelta.
- **Los tiempos se mezclan:** dos usos comparten un objeto. Crea uno por cada uso.
- **Cuenta muchos arranques de golpe:** se está contando `compresor` en vez de `arranqueMotor.subida(compresor)`.

## Para practicar

- Agrega un **tiempo mínimo de parada**: después de detenerse, el compresor no puede arrancar hasta pasados 5 segundos, aunque el presostato pida aire. Los motores grandes se calientan con arranques seguidos. Pista: un `TON` nuevo cuya entrada sea «el compresor está detenido».
- Enciende una lámpara en `Q0.2` mientras el presostato pide aire pero el compresor espera ese tiempo.

## Resumen

- TON, TOF y Flanco son clases: cada temporizador es un **objeto** con su propia memoria.
- **Un objeto por uso**, con un nombre que diga para qué es.
- Un TON sirve también de **filtro**: una señal tiene que sostenerse un tiempo para valer.
- Un flanco convierte una señal que dura muchas vueltas en un solo evento, para **contar**.

En la siguiente lección, [Modos de operación](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/15-modos-de-operacion/), harás que una máquina funcione en manual o en automático con un selector.
