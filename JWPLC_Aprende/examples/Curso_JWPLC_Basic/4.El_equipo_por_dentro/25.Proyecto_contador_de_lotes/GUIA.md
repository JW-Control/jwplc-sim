<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/25-proyecto-contador-de-lotes.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 25: Proyecto: un contador de lotes con todo el equipo

**Nivel:** intermedio · **Tiempo:** unos 60 minutos · **Necesitas:** las lecciones 19 a 24 de esta unidad

Cierra la unidad con una máquina completa, como las que se entregan en planta. Al final de una cinta, un sensor cuenta las piezas. Cuando junta un **lote**, un empujador lo manda a la caja, suena un pitido y el lote queda anotado en la microSD. El operador ajusta el tamaño del lote desde el frente, y nada se pierde si se corta la luz.

## Qué hace cada parte del equipo

| Parte | Qué hace en esta máquina | Lección |
|---|---|---|
| Botonera | UP y DOWN cambian el lote; ESC mantenido borra los contadores | [19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/) |
| Buzzer | Un pitido por cada lote completo | [20](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/20-el-buzzer/) |
| Reloj | La fecha y la hora de cada lote | [21](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/) |
| FRAM | El tamaño del lote, las piezas y los lotes, a salvo de los cortes | [22](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/) |
| microSD | Un registro de cada lote, para el supervisor | [23](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/23-la-microsd/) |

## Lo que necesitas

- El JWPLC Basic, con el RTC en hora y una tarjeta microSD.
- Una fuente de 24 V DC.
- Un sensor de piezas con salida PNP de 24 V (o un pulsador NA para probar).
- Una electroválvula de 24 V DC para el empujador y un contactor para la cinta.
- Una lámpara de 24 V DC, para practicar.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: sensor de piezas (NA), desde **+24 V**.
3. **`Q0.0`**: electroválvula del empujador. **`Q0.1`**: bobina del contactor de la cinta.
4. **`Q0.2`**: lámpara «lote listo» (para practicar).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 25.Proyecto_contador_de_lotes. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 25. En esa práctica el reloj arranca a las 05:59:30.

## Cómo funciona el programa

### Todo lo que no se puede perder, en un struct

```cpp
struct Contadores
{
    unsigned long lote;     // Piezas por lote (el ajuste).
    unsigned long piezas;   // Piezas del lote en curso.
    unsigned long lotes;    // Lotes completos.
};
```

El ajuste del operador y los dos contadores van juntos en un bloque de la FRAM. Cada vez que cambia uno, se llama a `guardar()`. Al arrancar, si el bloque no es válido, se cargan **valores de fábrica**: un lote de 6 piezas.

### Una función por trabajo

`loteCompleto()` hace todo lo que pasa al juntar un lote: suma el lote, lo anota en la microSD, pone las piezas en 0, guarda en la FRAM, da el golpe del empujador y el pitido. El `loop()` solo pregunta «¿se completó?» y la llama. Si mañana el lote completo tiene que hacer algo más, se cambia en un solo lugar.

### Un ajuste que no rompe el lote en curso

```cpp
if (JWPLC_Buttons.pressed(BTN_DOWN) && cuenta.lote > LOTE_MIN && cuenta.lote > cuenta.piezas + 1)
```

Si el lote en curso ya tiene 5 piezas, bajar el tamaño a 5 o menos dejaría un lote que ya se pasó. La condición no deja bajar el lote por debajo de las piezas que ya están contadas.

### ESC mantenido, no un toque

```cpp
bool esc = JWPLC_Buttons.isDown(BTN_ESC);
if (esc && !escAntes)
{
    inicioEsc = millis();
}
if (esc && inicioEsc != 0 && millis() - inicioEsc >= BORRADO_MS)
```

Borrar los contadores de un turno es grave: un roce de la tecla no puede hacerlo. Al apretar ESC se anota la hora; si **sigue** apretada 2 segundos, se borra. `inicioEsc = 0` después de borrar hace que pase una sola vez, aunque el dedo siga en la tecla.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Da seis pulsos al sensor: el empujador da un golpe de 1 segundo, suena el pitido y el lote queda anotado.
3. UP en la botonera: el lote pasa a 7 piezas.
4. Corta la energía y vuelve a darla: el lote de 7 y las piezas siguen ahí.
5. Saca la tarjeta y abre `lotes.csv` en la PC.

```text
Lección 25: sensor I0.0, empujador Q0.0, cinta Q0.1
FRAM nueva: valores de fábrica
Lote de 6 · 0 piezas · 0 lotes
Pieza 1 de 6
Pieza 2 de 6
Pieza 3 de 6
Pieza 4 de 6
Pieza 5 de 6
Pieza 6 de 6
Lote 1 completo (6 piezas)
Lote de 7
```

## Si algo no funciona

- **Después de cambiar el struct, los valores salen raros:** sube `VERSION`, como en la lección 22.
- **El lote no se anota en la tarjeta:** mira si el Monitor dice `Sin microSD`; revisa la tarjeta como en la lección 23.
- **ESC borra con un toque:** usaste `pressed()` en lugar de `isDown()` con el tiempo.

## Para practicar

- **El operador reconoce cada lote:** al completar un lote, la cinta (`Q0.1`) se detiene y la lámpara de `Q0.2` parpadea hasta que el operador aprieta OK: `Lote reconocido`, y la cinta sigue.
- **Cambio de turno:** a las 06:00:00 empieza otro turno. Escribe `Cambio de turno: 1 lotes`, anótalo en la microSD y pon los lotes en 0. Pista: pasa la hora a segundos del día y detecta el instante en que cruza las 06:00:00: el valor anterior era menor y el actual es mayor o igual.

## Resumen

- Una máquina real junta botonera, buzzer, reloj, FRAM y microSD, cada uno con su trabajo.
- Lo que no se puede perder va en un `struct` en la FRAM, con valores de fábrica para la primera vez.
- Una función por trabajo: el `loop()` decide, las funciones hacen.
- Lo que borra datos se protege: una tecla **mantenida**, no un toque.

Con esto termina la Unidad 4. La siguiente, **Pantalla y HMI**, le da a esta máquina una pantalla para que el operador vea y ajuste todo sin el Monitor Serie.
