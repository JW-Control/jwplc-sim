<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-2/10-contadores.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 10: Contadores

**Nivel:** básico · **Tiempo:** unos 25 minutos · **Necesitas:** las lecciones [07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/) y [09](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/)

Contar es una de las tareas más comunes de un PLC: piezas que pasan por una cinta, botellas que se llenan, ciclos de una prensa, vueltas de un tambor. Con la cuenta, la máquina decide cuándo detenerse, cuándo cambiar de lote o cuándo pedir mantenimiento.

Esta lección no trae ninguna instrucción nueva de C++. Su objetivo es otro: **juntar** lo que ya sabes (flancos, funciones y lógica de salidas) para resolver un caso real completo.

## El caso: llenar cajas en una cinta

1. La cinta avanza y cada pieza cae en una caja, pasando frente a un sensor.
2. Cada pieza que detecta el sensor suma 1 a la cuenta.
3. Al llegar a **10 piezas**, la cinta se detiene y se enciende la lámpara **«caja llena»**.
4. El operario cambia la caja y aprieta **RESET**: la cuenta vuelve a 0 y la cinta arranca otra vez.

## ¿Por qué contar flancos?

Una pieza tarda un tiempo en pasar frente al sensor: durante ese rato la entrada está activa, y `loop()` da cientos de vueltas. Si el programa sumara 1 cada vez que ve la entrada activa, una sola pieza contaría cientos.

Lo que hay que contar es el **flanco de subida**, el instante en que la pieza **llega** al sensor, como en la [lección 07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/). Y como en este programa hay dos señales con flanco (el sensor y el RESET), conviene escribir la detección **una sola vez**, en una función, como hiciste con los temporizadores.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un sensor PNP de piezas, o un pulsador para simularlo.
- Un pulsador normalmente abierto para el RESET.
- Opcional: el contactor del motor de la cinta y una lámpara.

## Conexiones

| Borne | Conecta |
|---|---|
| `1M` | 0 V de la fuente |
| `I0.0` | Sensor PNP de piezas (negro), o un pulsador desde +24 V |
| `I0.1` | Pulsador RESET, desde +24 V |
| `Q0.0` | Bobina del contactor del motor de la cinta |
| `Q0.1` | Lámpara «caja llena» |

Las entradas se cablean como en la [lección 03](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/#conexiones) y las salidas como en la [lección 02](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/02-encender-un-rele/#conexiones).

## El programa

> [!NOTE] En Arduino IDE
> Archivo → Ejemplos → JWPLC_GlobalPeripherals → Curso_JWPLC_Basic → 2.Tiempo_y_logica → 10.Contadores. Llega con la próxima versión del package; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: menú **Ejemplos…**, grupo JWPLC_GlobalPeripherals, **Curso_JWPLC_Basic / 2.Tiempo_y_logica / 10.Contadores**. Para practicar con un tablero real en pantalla, prueba el caso [Cinta con contador de lote](https://jw-control.com/casos/07-cinta-contador/).

## Cómo funciona el programa

Vamos por partes.

### La meta y la cuenta

```cpp
const uint16_t PIEZAS_POR_CAJA = 10;
```

La meta, como constante: cambiar el tamaño de la caja es cambiar un solo número. `uint16_t` es un número entero sin signo de 16 bits, de 0 a 65 535: una cuenta nunca es negativa y caben cajas de sobra.

```cpp
uint16_t piezas = 0;
```

```cpp
bool sensorAntes = false;
bool resetAntes = false;
```

`piezas` es el contador. `sensorAntes` y `resetAntes` son la memoria de la vuelta anterior de cada señal: una para cada flanco que hay que detectar.

### Una función para detectar flancos

```cpp
bool flancoSubida(bool ahora, bool &antes)
{
    bool flanco = ahora && !antes;
    antes = ahora;
    return flanco;
}
```

Es la lógica de la lección 07, empaquetada. Recibe la lectura de ahora y la memoria de antes; devuelve `true` solo si hubo flanco de subida. Además actualiza `antes` para la próxima vuelta: por eso lleva `&`, como el temporizador de la [lección 09](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/). Así es imposible olvidar la línea `antes = ahora`.

### El antirrebote

```cpp
if (millis() - ultimaLectura < ANTIRREBOTE_MS)
{
    return;
}
ultimaLectura = millis();
```

Igual que en la lección 07: las entradas se leen cada 20 ms. Con un sensor electrónico no hace falta, pero si simulas las piezas con un pulsador, evita contar de más.

### Contar las piezas

```cpp
bool cajaLlena = piezas >= PIEZAS_POR_CAJA;
```

`>=` pregunta «mayor o igual que». Se calcula una vez para usarlo en las decisiones siguientes.

```cpp
if (flancoSubida(digitalRead(I0_0) == HIGH, sensorAntes) && !cajaLlena)
{
    piezas++;
```

Se suma una pieza si **hubo flanco en el sensor Y la caja no está llena**. Si alguna pieza rezagada pasa con la cinta ya detenida, no se cuenta.

```cpp
if (piezas == PIEZAS_POR_CAJA)
{
    Serial.println("Caja llena: cambia la caja y aprieta RESET");
}
```

Justo en la pieza que completa la caja, se avisa por el Monitor Serie.

### El RESET

```cpp
if (flancoSubida(digitalRead(I0_1) == HIGH, resetAntes))
{
    piezas = 0;
    Serial.println("RESET: caja nueva");
}
```

La misma función, con otra entrada y su propia memoria. Al apretar RESET, la cuenta vuelve a 0.

### Las salidas, al final

```cpp
cajaLlena = piezas >= PIEZAS_POR_CAJA;
digitalWrite(Q0_0, !cajaLlena);
digitalWrite(Q0_1, cajaLlena);
```

`cajaLlena` se calcula **otra vez**, porque en esta misma vuelta la cuenta pudo cambiar (llegó la décima pieza o apretaron RESET). Luego, la cinta anda mientras la caja **no** esté llena, y la lámpara se enciende cuando lo está.

Fíjate en el orden del programa: primero se leen las entradas y se actualiza la memoria, y **al final** se escriben las salidas. Es el mismo ciclo que siguen los PLC comerciales: leer, pensar, escribir.

## Súbelo y pruébalo

1. Sube el programa y abre el **Monitor Serie** a **115200 baudios**.
2. `Q0.0` está cerrado: la cinta avanza.
3. Activa `I0.0` diez veces. En la décima, `Q0.0` se abre y `Q0.1` se enciende.
4. Aprieta RESET: la cuenta vuelve a 0 y `Q0.0` se cierra otra vez.

```text
Lección 10: piezas en I0.0, RESET en I0.1
Piezas: 1
Piezas: 2
...
Piezas: 10
Caja llena: cambia la caja y aprieta RESET
RESET: caja nueva
```

## Si algo no funciona

- **Una pieza cuenta varias veces:** con un pulsador, sube `ANTIRREBOTE_MS`. Con un sensor, revisa que la pieza no pase dos veces frente a él.
- **La cuenta sigue subiendo después de 10:** falta `&& !cajaLlena` en la condición.
- **La cinta no se detiene en la décima pieza:** revisa que `cajaLlena` se calcule otra vez antes de escribir las salidas.

## Para practicar

- Cambia la meta a 24 piezas.
- Cuenta también las **cajas** llenas y muéstralas en el Monitor Serie después de cada RESET.

## Resumen

- Para contar eventos se cuentan flancos, no estados.
- Una función que detecta flancos se reutiliza para cada señal, cada una con su propia memoria.
- Comparar la cuenta con una meta (`>=`, `==`) permite detener la máquina en el momento justo.
- Un buen orden para `loop()`: leer las entradas, decidir y, al final, escribir las salidas.

En la siguiente lección, [Máquina de estados](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados/), cierras la unidad con un semáforo peatonal.
