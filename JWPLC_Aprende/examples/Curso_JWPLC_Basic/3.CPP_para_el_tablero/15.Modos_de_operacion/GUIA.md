<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/15-modos-de-operacion.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 15: Modos de operación: manual y automático

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [11](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados/) y [14](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/14-temporizadores-como-clases/)

Casi todas las máquinas de una planta tienen en la puerta del tablero un selector con tres posiciones: **MAN - 0 - AUT**. En automático la máquina trabaja sola, siguiendo su ciclo. En manual el operador mueve cada parte a mano, para probar, limpiar o destrabar. Y en 0 no se mueve nada.

Cada modo tiene sus propias reglas. Si las mezclas en una sola lista de `if`, el programa se vuelve difícil de leer y aparecen casos raros: un ciclo automático que sigue corriendo en manual, o un pulsador manual que mueve la máquina en automático. En esta lección vas a ordenar el programa por modos.

## Un modo es un estado del tablero

En la lección 11 usaste `enum` para los estados de un semáforo y `switch` para hacer una cosa distinta en cada uno. Con los modos se hace igual:

```cpp
enum Modo
{
    MANUAL,
    APAGADO,
    AUTOMATICO
};
```

| Modo | Selector | Qué se puede hacer |
|---|---|---|
| `MANUAL` | MAN | El motor gira solo mientras se aprieta IMPULSO |
| `APAGADO` | 0 | Nada se mueve |
| `AUTOMATICO` | AUT | Un toque a CICLO mezcla 8 segundos y se detiene solo |

Y una regla que vale para todas las máquinas: **cambiar de modo deja la máquina quieta**. Si el operador pasa a manual en mitad de un ciclo, el ciclo se cancela; al volver a automático no sigue donde estaba, espera una orden nueva.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un selector de tres posiciones con dos contactos NA (uno cierra en MAN y otro en AUT).
- Dos pulsadores normalmente abiertos (IMPULSO y CICLO).
- Un contactor y dos lámparas piloto de 24 V DC.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. Selector: el contacto que cierra en **MAN** a **`I0.0`** y el que cierra en **AUT** a **`I0.1`**, los dos desde **+24 V**. En 0 los dos quedan abiertos.
3. **`I0.2`**: pulsador de IMPULSO. **`I0.3`**: pulsador de CICLO. Los dos NA, desde **+24 V**.
4. **`Q0.0`**: bobina del contactor del agitador. **`Q0.1`**: lámpara de manual. **`Q0.2`**: lámpara de automático.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 15.Modos_de_operacion. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 3, lección 15. Trae el agitador con su selector ya cableado y una práctica que se califica sola.

## Cómo funciona el programa

### Leer el selector

```cpp
Modo leerModo()
{
    if (digitalRead(I0_0) == HIGH)
    {
        return MANUAL;
    }
    if (digitalRead(I0_1) == HIGH)
    {
        return AUTOMATICO;
    }
    return APAGADO;
}
```

Una función puede devolver cualquier tipo, también uno tuyo. `leerModo()` convierte los dos contactos del selector en un `Modo`. `return` termina la función en el acto: si el contacto de MAN está cerrado, ni siquiera mira el de AUT. Si ninguno está cerrado, el selector está en 0.

Tener la lectura en una función tiene otra ventaja: si mañana el selector se cablea distinto, se cambia en un solo lugar.

### Detectar el cambio de modo

```cpp
Modo nuevo = leerModo();
if (nuevo != modo)
{
    modo = nuevo;
    ciclo = false;
    avisarModo(modo);
}
```

`modo` guarda el modo de la vuelta anterior. Si el selector cambió, se anota el modo nuevo, se **cancela el ciclo** y se avisa por el Monitor Serie. Es la idea del flanco de la lección 07, con un `enum` en lugar de un `bool`.

### Un `switch` por modo

```cpp
bool motor = false;

switch (modo)
{
case MANUAL:
    motor = digitalRead(I0_2) == HIGH;
    break;

case APAGADO:
    motor = false;
    break;

case AUTOMATICO:
    ...
    motor = ciclo;
    break;
}
```

Cada modo decide el motor con sus propias reglas, y solo con ellas. Los pulsadores de un modo no hacen nada en otro: en AUT el IMPULSO no se lee, y en MAN el CICLO tampoco. `motor` empieza en `false` en cada vuelta: si un modo se olvidara de decidirlo, el motor queda detenido, que es lo seguro.

### El ciclo automático

```cpp
if (digitalRead(I0_3) == HIGH && !ciclo)
{
    ciclo = true;
    Serial.println("Ciclo: mezclando");
}
if (tiempoMezcla.ejecutar(ciclo, MEZCLA_MS))
{
    ciclo = false;
    Serial.println("Ciclo terminado");
}
motor = ciclo;
```

Un toque a CICLO pone `ciclo` en `true`. El TON de la lección 14 mide cuánto lleva mezclando; a los 8 segundos el ciclo termina solo.

### Las lámparas dicen el modo

```cpp
digitalWrite(Q0_1, modo == MANUAL);
digitalWrite(Q0_2, modo == AUTOMATICO);
```

El operador tiene que ver de lejos en qué modo está la máquina. Las lámparas salen directo del modo, no de los contactos del selector: si el programa ve otra cosa que la que crees, las lámparas te lo dicen.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Selector en MAN: enciende `Q0.1`. El motor gira solo mientras aprietas `I0.2`.
3. Selector en AUT: enciende `Q0.2`. Un toque a `I0.3` cierra `Q0.0` durante 8 segundos.
4. Empieza un ciclo y pasa el selector a 0: el motor se detiene. Vuelve a AUT: el ciclo no sigue.

```text
Lección 15: selector MAN I0.0 / AUT I0.1, impulso I0.2, ciclo I0.3
Modo: APAGADO
Modo: MANUAL
Modo: AUTOMATICO
Ciclo: mezclando
Ciclo terminado
```

## Si algo no funciona

- **Las lámparas muestran el modo cambiado:** los contactos del selector están cruzados entre `I0.0` e `I0.1`.
- **El ciclo sigue al volver a AUT:** falta `ciclo = false;` en el cambio de modo.
- **Error `jump to case label`:** declaraste una variable dentro de un `case` sin llaves. Decláralas antes del `switch`, como `motor`.

## Para practicar

- Agrega la **descarga**: al terminar la mezcla, la válvula de `Q0.3` abre 3 segundos y recién ahí el ciclo termina. Pista: el ciclo ya tiene más de dos pasos; cambia el `bool ciclo` por un `enum` con `REPOSO`, `MEZCLANDO` y `DESCARGANDO`, como el semáforo de la lección 11.
- Haz que la lámpara de automático **parpadee** cada medio segundo mientras hay un ciclo en curso, y quede fija en automático sin ciclo.

## Resumen

- Un selector MAN-0-AUT da tres **modos**; un `enum` les pone nombre y un `switch` separa sus reglas.
- Una función puede devolver un `enum`: `leerModo()` traduce los contactos a un modo.
- **Cambiar de modo deja la máquina quieta**: el ciclo se cancela y espera una orden nueva.
- Lo que no decide ningún modo queda apagado: empieza cada vuelta con las salidas en `false`.

En la siguiente lección, [El programa en pestañas](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/16-programa-en-pestanas/), ordenarás un programa grande con la plantilla de proyecto JWPLC.
