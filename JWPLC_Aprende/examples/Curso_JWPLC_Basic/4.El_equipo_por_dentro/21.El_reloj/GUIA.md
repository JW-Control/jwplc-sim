<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/21-el-reloj.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 21: El reloj: encender por horario

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** la lección [17](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/17-mensajes-para-el-operador/)

`millis()` cuenta desde que se encendió el equipo: sirve para medir **cuánto** dura algo, pero no sabe **qué hora** es. Si se corta la luz, vuelve a cero. Para un alumbrado que enciende a las 18:00, un riego a las 5 de la mañana o un registro con fecha, hace falta un reloj de verdad.

El JWPLC Basic trae un **RTC** (*real-time clock*, reloj de tiempo real): un chip con su propia **batería**, que sigue contando aunque el equipo esté apagado.

## La hora está en `JWPLC_Time`

El package lee el RTC solo, una vez por segundo, y deja la hora en el objeto **`JWPLC_Time`**. Preguntarle es instantáneo.

| Función | Qué devuelve |
|---|---|
| `JWPLC_Time.hour()`, `minute()`, `second()` | La hora: 0 a 23, 0 a 59, 0 a 59 |
| `JWPLC_Time.day()`, `month()`, `year()` | La fecha: 24, 11, 2026 |
| `JWPLC_Time.dayOfWeek()` | El día: 1 domingo, 2 lunes… 7 sábado |
| `JWPLC_Time.valid()` | `true` si la hora es confiable |
| `JWPLC_Time.lostPower()` | `true` si el RTC se quedó sin batería |

> [!WARNING] Primero, poner el reloj en hora
> Un equipo nuevo, o uno al que se le agotó la batería del RTC, no sabe qué hora es: `valid()` da `false`. El ejemplo **SetFromBuildTime** de la librería JW_RTC lo pone en hora con la de la PC al momento de compilar.

## Comparar horas: pásalas a segundos

¿Las 17:45:30 están entre las 18:00:00 y las 23:00:00? Comparar horas, minutos y segundos por separado se complica rápido. El truco es convertir cada hora en **un solo número**: los segundos que pasaron desde la medianoche.

```cpp
unsigned long segundosDelDia(unsigned long h, unsigned long m, unsigned long s)
{
    return h * 3600 + m * 60 + s;
}
```

- 18:00:00 → 18 × 3600 = **64 800**
- 23:00:00 → 23 × 3600 = **82 800**
- 17:45:30 → 61 200 + 2700 + 30 = **63 930**

Ahora la pregunta es entre números: ¿63 930 está entre 64 800 y 82 800? No. El alumbrado sigue apagado.

## Lo que necesitas

- El JWPLC Basic, con la batería del RTC y en hora.
- Una fuente de 24 V DC.
- Un contactor con bobina de 24 V DC para el alumbrado, o una lámpara.
- Una lámpara de 24 V DC más, para practicar.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`Q0.0`**: bobina del contactor del alumbrado.
3. **`Q0.1`**: lámpara de aviso (para practicar).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 21.El_reloj. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 21. En esa práctica el reloj arranca a las 17:59:50, así que el alumbrado enciende a los 10 segundos.

## Cómo funciona el programa

### Sin hora no se adivina

```cpp
if (!JWPLC_Time.valid())
{
    ...
    alumbrado = false;
    digitalWrite(Q0_0, alumbrado);
    return;
}
```

Si el RTC perdió la hora, el programa no sabe si son las 3 de la mañana o las 8 de la noche. En vez de adivinar, deja la carga en su **estado seguro** (apagada) y lo avisa una sola vez. Es la **falla segura**: ante la duda, lo que no hace daño. `return` termina esta vuelta del `loop()` sin seguir leyendo.

### ¿Estamos en horario?

```cpp
unsigned long ahora = segundosDelDia(JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
bool enHorario = ahora >= ENCENDIDO && ahora < APAGADO;
```

Fíjate en el `>=` y el `<`: a las 18:00:00 en punto ya enciende, y a las 23:00:00 en punto ya está apagado.

### Avisar solo los cambios

```cpp
if (enHorario != alumbrado)
{
    alumbrado = enHorario;
    Serial.printf("%s · alumbrado %s\n", horaActual().c_str(), alumbrado ? "ENCENDIDO" : "APAGADO");
}
```

El `loop()` pasa miles de veces por segundo. El mensaje sale solo cuando `enHorario` es distinto de lo que había: en el cambio. `alumbrado ? "ENCENDIDO" : "APAGADO"` elige uno de los dos textos según el `bool` (es un `if` en una sola expresión).

## Súbelo y pruébalo

1. Pon el equipo en hora con el ejemplo SetFromBuildTime de JW_RTC.
2. En el programa, cambia `ENCENDIDO` a un minuto después de la hora actual y súbelo.
3. Abre el Monitor Serie a 115200 baudios: cada 10 segundos llega la hora, y al llegar el horario el contactor se cierra.

```text
Lección 21: alumbrado por horario, KM1 en Q0.0
Horario: de 18:00:00 a 23:00:00
17:59:59 · alumbrado apagado
18:00:00 · alumbrado ENCENDIDO
```

## Si algo no funciona

- **Dice «RTC sin hora»:** el reloj no está en hora o se le agotó la batería. Ponlo en hora con SetFromBuildTime.
- **Enciende con una hora de diferencia:** el equipo quedó con la hora de otra zona. Vuelve a ponerlo en hora desde una PC con tu hora local.
- **Un horario de noche (de 22:00 a 06:00) nunca enciende:** el horario cruza la medianoche, así que `ahora >= ENCENDIDO && ahora < APAGADO` nunca se cumple. Ahí la condición es con `||`: `ahora >= ENCENDIDO || ahora < APAGADO`.

## Para practicar

- **Aviso previo:** los 5 segundos antes de encender, la lámpara de `Q0.1` parpadea (250 ms encendida, 250 ms apagada). En una vitrina real serían unos minutos; la regla es la misma.
- **Fin de semana:** sábado y domingo la vitrina no enciende. Escribe `Fin de semana: alumbrado apagado`. `dayOfWeek()` da 1 el domingo y 7 el sábado.

## Resumen

- `millis()` mide cuánto dura algo; el **RTC** sabe qué hora es, y con su batería no la pierde.
- `JWPLC_Time` entrega la fecha y la hora que el package ya leyó.
- Pasar una hora a **segundos del día** convierte un horario en una comparación de números.
- Sin hora válida, **falla segura**: la carga queda en el estado que no hace daño.

En la siguiente lección, [La FRAM](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/22-la-fram/), harás un contador que no se pierde cuando se corta la energía.
