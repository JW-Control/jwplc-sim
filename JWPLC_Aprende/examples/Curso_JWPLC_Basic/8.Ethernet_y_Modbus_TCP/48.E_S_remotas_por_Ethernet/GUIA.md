<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-8/48-e-s-remotas-por-ethernet.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 48: E/S remotas por Ethernet: el JWPLC cliente Modbus TCP

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [35](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/35-modulo-de-e-s-remotas/) y [47](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/47-servidor-modbus-tcp/)

La bomba de la lección 35 se manejaba con un módulo de E/S remotas por RS-485. Ahora el módulo es de los que tienen **puerto Ethernet**: va al switch más cercano y por la red de la planta llega al tablero. Sirve igual a 10 m que en otro galpón.

Esta vez el JWPLC pregunta: es el **cliente** Modbus TCP y el módulo es el servidor, en 192.168.250.20.

## Pedir sin esperar

En la Unidad 6, `readDiscreteInputsSync()` esperaba la respuesta del módulo antes de seguir: unos milisegundos en los que el programa no hacía nada más. Por la red se trabaja de otra forma:

1. El programa **pide** la lectura y sigue con su `loop()`.
2. `JWPLC_ModbusTCPClient.task()` atiende la conversación en cada vuelta.
3. Cuando llega la respuesta, `done()` es verdadero y `succeeded()` dice si salió bien.

Mientras tanto, el programa puede atender sus pulsadores, su pantalla o lo que necesite. Por eso el ciclo de la lección 35 (leer, decidir, escribir) va en **dos pasos**: primero pide las entradas y, al llegar, decide y pide escribir las salidas.

## Lo que necesitas

- El JWPLC Basic en la red, como en la lección 46.
- Un módulo de E/S remotas Modbus TCP con IP 192.168.250.20, puerto 502, alimentado con 24 V DC.
- Los mismos equipos de la lección 35, conectados al módulo: S1 marcha (NA) en DI1, S2 parada (NC) en DI2, KM1 en DO1 y la lámpara H1 en DO2.

## Conexiones

1. Cable de red del JWPLC y del módulo al mismo switch.
2. En el módulo: pulsadores a DI1 y DI2 con el común DC al 0 V, y salidas DO1 y DO2 con el común C1 al +24 V.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 8.Ethernet_y_Modbus_TCP → 48.E_S_remotas_por_Ethernet. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 8, lección 48. El módulo IO1 está en la red del Esquema; S1 y S2 están cableados a él, no al JWPLC.

## Cómo funciona el programa

### A quién preguntar

```cpp
JWPLC_ModbusTCPClient.begin(MODULO, 1, 502);
```

La IP del módulo, su Unit ID y el puerto. No abre la conexión todavía: la abre al hacer la primera pregunta y la reutiliza. Si se corta, la próxima pregunta vuelve a conectar sola.

### Los dos pasos

```cpp
enum Paso { LEER, ESCRIBIR };
```

Con `paso` en `LEER` el programa pide las 8 entradas (`requestReadDiscreteInputs()`), cada 100 ms. Cuando la respuesta llega bien, decide la bomba con el enclavamiento de siempre y pasa a `ESCRIBIR`: pide escribir las 8 salidas (`requestWriteMultipleCoils()`). Al llegar esa respuesta, vuelve a `LEER`.

### No pedir dos cosas a la vez

```cpp
if (JWPLC_ModbusTCPClient.busy())
    return;
```

Mientras una pregunta está en camino, no se hace otra. Y después de leer el resultado, `clearResult()` deja al cliente listo para la siguiente.

### Si el módulo no responde

`succeeded()` falso: se escribe «Sin respuesta del módulo» una sola vez, con el motivo de `resultString()`, y el programa vuelve a intentar. Las salidas del módulo no se escriben, y un buen módulo las apaga solo cuando pierde la comunicación.

## Súbelo y pruébalo

1. Sube el programa: «Módulo en línea» en cuanto la red está lista.
2. Marcha en DI1: el contactor de DO1 cierra y la lámpara de DO2 enciende.
3. Parada en DI2: los dos se apagan.
4. Desconecta el cable del módulo: «Sin respuesta del módulo». Al volver a conectarlo sigue solo.

```text
Lección 48: E/S remotas por Ethernet en 192.168.250.20, bomba en DO1
Módulo en línea
Bomba en marcha
Bomba detenida
```

## Si algo no funciona

- **«Sin respuesta del módulo: Timeout»:** el módulo no está en esa IP o no tiene alimentación. Pruébalo con un `ping` desde la PC.
- **«Connection refused» o similar:** el módulo está, pero no en el puerto 502.
- **Las entradas no cambian:** el común DC del módulo tiene que ir al 0 V.

## Para practicar

- Suma el térmico de la bomba en DI3 (NC): si abre, la bomba para, no arranca y se escribe «Falla: térmico» una vez. Enciende la lámpara de falla en DO3 mientras dure.

## Resumen

- Con Modbus TCP el JWPLC también es cliente: pregunta a otros equipos de la red.
- Las preguntas no bloquean: se pide, se atiende con `task()` y se lee el resultado con `done()`.
- El ciclo leer, decidir, escribir queda en dos pasos.

Con el JWPLC de servidor y de cliente ya cubres lo más común de una red de planta. En la siguiente lección, [El panel web](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/49-el-panel-web/), la banda se mira desde el celular, sin instalar nada.
