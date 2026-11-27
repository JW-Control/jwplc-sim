<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/18-encuentra-el-error.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 18: Encuentra el error: depurar un programa

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/) y [17](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/17-mensajes-para-el-operador/)

Los errores de compilación son los fáciles: el compilador te dice la línea. Los difíciles son los programas que **compilan bien y hacen otra cosa**. La máquina arranca cuando no debe, cuenta de más, o falla una vez cada tanto. En una planta, encontrar esos errores rápido es lo que separa a un técnico que adivina de uno que sabe.

En esta lección no escribes un programa nuevo: recibes uno con **dos errores a propósito** y aprendes a encontrarlos con método.

## El método: reproducir, observar, suponer, probar

| Paso | Qué haces | Qué NO haces |
|---|---|---|
| **1. Reproducir** | Encuentra los pasos exactos que hacen aparecer la falla, siempre igual | Cambiar el programa «a ver si se arregla» |
| **2. Observar** | Mira los datos del programa justo donde se toma la decisión que sale mal | Suponer lo que vale una variable sin verla |
| **3. Suponer** | Con lo que viste, di una causa concreta: «cuenta en cada vuelta, no una vez por botella» | Buscar culpables lejos (el equipo, el package) antes de mirar tu código |
| **4. Probar** | Cambia **una sola cosa** y repite el paso 1 | Cambiar cinco cosas a la vez |

## Las herramientas

- **Mensajes por el Monitor Serie.** Funcionan en la placa y en el simulador. Un `Serial.printf()` en el lugar justo te dice cuánto vale una variable y cuándo pasa algo. Es la herramienta de siempre en campo.
- **Variables en vivo** (JWPLC Sim, pestaña **E/S y variables**). Escribes el nombre de una variable global y ves su valor mientras el programa corre, sin tocar el código. También puedes **forzar** una entrada a 0 o a 1.
- **Breakpoints** (JWPLC Sim). Un punto rojo en el margen de una línea: el programa se **detiene** justo antes de ejecutarla y la pestaña **Depuración** muestra todas las variables y desde qué función se llegó ahí. Desde ahí puedes **continuar** (F8) o avanzar **paso a paso**, línea por línea (F10).

## El caso: una empacadora

Las botellas pasan en fila frente a un sensor. Cada 6 botellas, un empujador neumático da un golpe de medio segundo y manda el paquete a la cinta de salida.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un sensor PNP o un pulsador NA que lo simule.
- Una electroválvula con bobina de 24 V DC, o una lámpara.
- Para los breakpoints, [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/). En la placa se depura con mensajes.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: sensor de botellas, desde **+24 V**.
3. **`Q0.0`**: bobina de la electroválvula del empujador.

## El programa (con dos errores)

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 18.Encuentra_el_error. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Esta lección se aprovecha mejor en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/): en **Aprender**, Unidad 3, lección 18. Trae la empacadora cableada, el depurador y una práctica que se califica sola.

## Cómo funciona el programa

Así lo pensó quien lo escribió:

```cpp
if (botella)
{
    botellas = botellas + 1;
}
```

Si hay una botella frente al sensor, suma una.

```cpp
if (botellas > 0 && botellas % POR_PAQUETE == 0 && !empujando)
{
    empujando = true;
    inicioEmpuje = millis();
    Serial.printf("Paquete listo: %lu botellas\n", botellas);
}
```

`%` es el **resto** de la división: `botellas % 6` vale 0 con 6, 12, 18 botellas… Cuando la cuenta llega a un múltiplo de 6, empieza el golpe y anota la hora.

```cpp
if (empujando && millis() - inicioEmpuje >= EMPUJE_MS)
{
    empujando = false;
}
```

A los 500 ms, el golpe termina. Es la técnica de `millis()` de la lección 06.

Léelo otra vez. Parece correcto, ¿verdad? Vamos a probarlo con método.

## Paso 1: reproducir

Sube el programa y abre el Monitor Serie. Pasa **una sola** botella frente al sensor (un toque a `I0.0`).

```text
Lección 18: sensor de botellas I0.0, empujador Q0.0
Paquete listo: 6 botellas
```

Con una botella, el empujador ya golpeó y el programa cree que hay 6. Repite: siempre pasa igual. La falla está reproducida.

## Paso 2: observar

La decisión que sale mal es **contar**. Hay que ver `botellas` mientras pasa una botella.

**En JWPLC Sim:** en la pestaña **E/S y variables**, escribe `botellas` en **Variables del sketch** y pulsa **Agregar**. Da un toque a la botella: el valor salta de golpe a miles. Ahora fuerza `I0.0` a **1** con la columna **Forzar**, como si una botella se quedara parada frente al sensor: `botellas` no deja de subir.

**En la placa:** agrega un mensaje dentro del `if` que cuenta.

```cpp
if (botella)
{
    botellas = botellas + 1;
    Serial.printf("Cuento: %lu\n", botellas);
}
```

Con un toque, el Monitor Serie se llena de cientos de líneas `Cuento: …`. Quita el mensaje cuando termines: un `printf` que se repite en cada vuelta hace más lento el programa.

### Detener el programa en la línea

En JWPLC Sim, con `I0.0` todavía forzado a 1, haz clic en el margen izquierdo de la línea `botellas = botellas + 1;`. Aparece un punto rojo: un **breakpoint**. El programa se detiene enseguida en esa línea, y la pestaña **Depuración** muestra:

- **Pila de llamadas:** `loop()`, y debajo quien la llamó. Dice **por dónde** llegó el programa a esa línea.
- **Variables:** `botella = true`, `botellas = …` con su valor en ese instante.

Pulsa **Continuar** (F8). El programa se vuelve a detener en la misma línea, en la **vuelta siguiente** de `loop()`, y `botellas` subió uno. Con la misma botella. Otra vez F8: lo mismo.

## Paso 3: suponer

Ya no hay que adivinar: el `if (botella)` se cumple **en cada vuelta** mientras la botella tapa el sensor, y `loop()` da miles de vueltas por segundo. El programa cuenta vueltas, no botellas. Es el problema de la [lección 07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/): hay que contar en el **flanco de subida**, una sola vez por botella.

## Paso 4: probar

Cambia una sola cosa: el `if` que cuenta.

```cpp
bool botellaAnterior = false;   // arriba, junto a las otras variables

// en loop():
if (botella && !botellaAnterior)
{
    botellas = botellas + 1;
}
botellaAnterior = botella;
```

En JWPLC Sim, quita el breakpoint (otro clic en el punto rojo), pulsa **Liberar** en `I0.0` y ejecuta otra vez. Repite el paso 1: un toque, y `botellas` sube a 1. El primer error está resuelto.

Ahora pasa las 6 botellas. El empujador golpea… y vuelve a golpear cada medio segundo, una y otra vez, hasta que pasa la séptima. Ese es el **segundo error**, y es tu práctica.

## Si algo no funciona

- **El breakpoint queda gris y dice «sin código asociado»:** está en una línea vacía o en un comentario. Ponlo en una línea con código.
- **El programa no se detiene en el breakpoint:** esa línea nunca se ejecuta con los datos de ahora. Eso también es información: la condición del `if` de arriba no se cumple.
- **Las variables en vivo dicen que no encuentran el nombre:** solo se ven las variables **globales**, las declaradas fuera de las funciones.

## Para practicar

- **Encuentra el segundo error** con el mismo método. Pista: pon un breakpoint en `empujando = true;` y pasa las 6 botellas. Cuando se detenga la segunda vez, mira `botellas`: ¿cambió? ¿Por qué la condición del `if` sigue siendo cierta?
- Cuando lo corrijas, cuenta los paquetes y escribe `Paquetes: N` en cada golpe.

## Resumen

- Un programa que compila puede estar mal. Se depura con método: **reproducir, observar, suponer, probar**.
- **Observa** el dato justo donde se toma la decisión que falla; no supongas lo que vale.
- En la placa, con mensajes por el Monitor Serie. En JWPLC Sim, además, con **variables en vivo**, **entradas forzadas** y **breakpoints**.
- Cambia **una cosa** por vez y vuelve a reproducir.
- Contar en cada vuelta en vez de en el flanco es uno de los errores más comunes en un PLC.

Con esta lección termina la Unidad 3. Ya escribes C++ como en los programas de tablero de verdad: clases, arreglos, tu caja de herramientas, modos, pestañas y mensajes con formato, y sabes encontrar los errores. En la Unidad 4 conocerás el equipo por dentro: la botonera, el buzzer, el reloj y la memoria que no se borra.
