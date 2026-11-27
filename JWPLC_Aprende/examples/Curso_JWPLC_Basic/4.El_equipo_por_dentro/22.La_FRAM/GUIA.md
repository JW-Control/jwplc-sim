<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/22-la-fram.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 22: La FRAM: un contador que sobrevive a un corte

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** las lecciones [10](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/10-contadores/) y [12](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/12-clases-un-motor/)

Un contador de piezas marca 1 873. Se corta la luz un segundo. Vuelve la energía y el contador marca 0. El turno entero se perdió.

Las variables viven en la **RAM**, que se borra al apagar. Para lo que tiene que sobrevivir a un corte (contadores, horómetros, ajustes del operador) el JWPLC Basic trae una **FRAM**.

## Las memorias del equipo

| Memoria | Al apagar | Para qué |
|---|---|---|
| RAM | Se borra | Las variables del programa |
| Flash | Se conserva | El programa; escribirla seguido la gasta |
| **FRAM** (8 KB) | **Se conserva** | Datos que cambian seguido y no se pueden perder |
| microSD | Se conserva | Registros grandes, archivos (lección 23) |

La FRAM se puede escribir **un billón** de veces y cada escritura es instantánea. Por eso se puede guardar el contador **en cada pieza**, sin miedo a gastarla y sin esperar.

## Un bloque: guardar un struct entero

La FRAM está en el objeto **`JWPLC_FRAM`**. En lugar de guardar variable por variable, se junta todo en un `struct` (como en la [lección 12](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/12-clases-un-motor/)) y se guarda de una vez:

```cpp
JWPLC_FRAM.writeBlock(DIRECCION, cuenta, VERSION);   // Guarda
JWPLC_FRAM.readBlock(DIRECCION, cuenta, VERSION);    // Lee; true si salió bien
```

- **`DIRECCION`**: dónde empieza el bloque dentro de los 8192 bytes. Si guardas dos bloques distintos, dales direcciones separadas (por ejemplo, 0 y 256).
- **`VERSION`**: un número que tú eliges. `writeBlock()` lo guarda junto con los datos y una **suma de control**.

`readBlock()` devuelve `false` si en esa dirección no hay un bloque válido: una FRAM nueva, datos dañados o **una versión distinta**. Así, si agregas un campo al `struct` y subes `VERSION` a 2, el programa no lee el bloque viejo como si fuera el nuevo: lo descarta y arranca desde cero.

> [!WARNING] Cambia VERSION si cambias el struct
> Si agregas o quitas campos y dejas la misma versión, el bloque viejo puede leerse mal. Subir `VERSION` es la forma de decir «esto ya no es lo mismo».

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un sensor de piezas con salida PNP de 24 V (o un pulsador NA para probar).

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: salida del sensor de piezas (NA), alimentado desde **+24 V**.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 22.La_FRAM. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 22. **Detener** y **Ejecutar** en el Sim es como cortar la energía: la FRAM conserva lo que tenía.

## Cómo funciona el programa

### Al arrancar: recuperar o empezar

```cpp
if (JWPLC_FRAM.readBlock(DIRECCION, cuenta, VERSION))
{
    Serial.printf("Recuperado: %lu piezas\n", cuenta.piezas);
}
else
{
    cuenta.piezas = 0;
    guardar();
    Serial.println("FRAM nueva: contador en 0");
}
```

Si el bloque es válido, `readBlock()` llena `cuenta` con lo que había y el contador sigue donde quedó. Si no, se empieza en 0 y se guarda enseguida, para que el próximo arranque ya encuentre un bloque válido.

### Guardar en el momento

```cpp
cuenta.piezas = cuenta.piezas + 1;
guardar();
```

Cada pieza se guarda apenas se cuenta. Si se guardara cada minuto, un corte justo antes perdería las piezas de ese minuto. Con la FRAM no hay razón para esperar.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios: la primera vez dice `FRAM nueva`.
2. Da tres pulsos al sensor: `Piezas: 3`.
3. Corta la energía del equipo y vuelve a darla: `Recuperado: 3 piezas`.
4. ESC en la botonera pone el contador en 0.

```text
Lección 22: sensor de piezas I0.0, cuenta en la FRAM
FRAM nueva: contador en 0
Piezas: 1
Piezas: 2
Piezas: 3
Lección 22: sensor de piezas I0.0, cuenta en la FRAM
Recuperado: 3 piezas
```

## Si algo no funciona

- **Siempre dice «FRAM nueva»:** el bloque no se está guardando. Revisa que llames a `guardar()` después de cambiar `cuenta`, y que no cambies `VERSION` en cada subida.
- **Cuenta varias piezas por cada una:** falta el flanco de subida de la [lección 07](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/).
- **Dos bloques se pisan:** si guardas otro `struct`, ponlo en otra dirección, lejos del primero.

## Para practicar

- **Contar los encendidos:** agrega `unsigned long encendidos;` al `struct`, súmale 1 en `setup()` y escribe `Encendido n.º 2`. Sube `VERSION` a 2. Si el PLC se reinicia solo, este número lo delata.
- **Borrado seguro:** que un toque de ESC no borre nada. Solo ESC mantenido 2 segundos escribe `Contador en 0`. Pista: `isDown(BTN_ESC)` de la [lección 19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/) y un temporizador.

## Resumen

- Las variables viven en la RAM y se borran al apagar.
- La **FRAM** conserva los datos sin energía y se puede escribir en cada cambio.
- `writeBlock()` y `readBlock()` guardan y leen un `struct` entero, con versión y suma de control.
- `readBlock()` da `false` si el bloque no es válido: el programa decide cómo empezar.
- Cambia `VERSION` cuando cambies el `struct`.

En la siguiente lección, [La microSD](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/23-la-microsd/), guardarás un registro de eventos con fecha y hora en un archivo que se abre en la PC.
