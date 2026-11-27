<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/23-la-microsd.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 23: La microSD: un registro con fecha y hora

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [21](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/)

El supervisor pregunta: «¿A qué hora paró la bomba anoche, y cuántas veces arrancó esta semana?». Con un **registro**, la respuesta está en un archivo: una línea por cada evento, con su fecha y hora.

La FRAM de la lección anterior guarda pocos datos que cambian seguido. Para un registro que crece todos los días está la **microSD**: gigas de espacio, y la tarjeta se saca y se lee en cualquier PC.

## Archivos: abrir, escribir, cerrar

La tarjeta está en el objeto **`JWPLC_SD`**, y cada archivo abierto es un **`JWPLCFile`**. Trabajar con un archivo siempre tiene tres pasos:

```cpp
JWPLCFile archivo = JWPLC_SD.open("/registro.csv", FILE_APPEND);   // 1. Abrir
archivo.printf("%s;%s\n", fecha, evento);                          // 2. Escribir
archivo.close();                                                   // 3. Cerrar
```

| Modo | Qué hace |
|---|---|
| `FILE_READ` | Abre para leer, desde el principio |
| `FILE_WRITE` | Abre para escribir **borrando** lo que había |
| `FILE_APPEND` | Abre para escribir **al final**, sin borrar |

Un registro siempre se abre con `FILE_APPEND`: cada evento se suma al final.

> [!WARNING] Cierra siempre el archivo
> Lo que escribes queda primero en la memoria del equipo y llega a la tarjeta al cerrar. Un archivo que nunca se cierra puede quedar vacío o dañado si se corta la energía. Abre, escribe y cierra en el mismo momento.

## CSV: un archivo que entiende Excel

**CSV** es un texto con una línea por fila y los datos separados por un signo. En Perú y en buena parte de Latinoamérica Excel espera **punto y coma**:

```text
2026-11-24 08:00:03;Arranque
2026-11-24 08:47:10;Parada
```

La fecha va como **año-mes-día**, con ceros a la izquierda. Así, ordenar las líneas como texto también las ordena por fecha.

## Lo que necesitas

- El JWPLC Basic, con el RTC en hora (lección 21) y una tarjeta microSD.
- Una fuente de 24 V DC.
- Un pulsador NA (marcha) y uno NC (paro).
- Un contactor con bobina de 24 V DC, y una lámpara de 24 V DC para practicar.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: MARCHA (NA). **`I0.1`**: PARO (NC). Los dos desde **+24 V**.
3. **`Q0.0`**: bobina del contactor del motor. **`Q0.1`**: lámpara de aviso (para practicar).

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 23.La_microSD. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 23. La tarjeta se saca con un clic en su zócalo, en la pestaña **Placa**.

## Cómo funciona el programa

### Sin tarjeta, la máquina sigue

```cpp
if (!JWPLC_SD.isReady())
{
    ...
    return;
}
```

Antes de escribir se pregunta si la tarjeta está lista. Si no está (alguien la sacó, se llenó, se dañó), el evento no se registra, se avisa **una sola vez** y la función termina. El motor **sigue funcionando**: perder un registro es malo, pero parar la producción por eso es peor.

### Una línea por evento

```cpp
archivo.printf("%s;%s\n", fechaHora().c_str(), evento.c_str());
```

`printf` también funciona con un archivo: escribe la fecha, un punto y coma, el evento y un salto de línea. `fechaHora()` arma el texto `2026-11-24 08:00:03` con `snprintf` y los ceros a la izquierda de la [lección 17](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/17-mensajes-para-el-operador/).

### Leer el archivo

```cpp
while (archivo.available())
{
    Serial.write(archivo.read());
}
```

`available()` dice cuántos caracteres quedan por leer, y `read()` entrega el siguiente. Mientras queden, se copian al Monitor Serie tal cual.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Arranca y para el motor un par de veces.
3. OK en la botonera: el Monitor muestra el archivo.
4. Apaga el equipo, saca la tarjeta y abre `registro.csv` en la PC.

```text
Lección 23: marcha I0.0, paro NC I0.1, motor Q0.0, registro en la microSD
Registrado: 2026-11-24 08:00:00;Encendido
Registrado: 2026-11-24 08:00:03;Arranque
Registrado: 2026-11-24 08:00:05;Parada
--- registro.csv ---
2026-11-24 08:00:00;Encendido
2026-11-24 08:00:03;Arranque
2026-11-24 08:00:05;Parada
--- fin ---
```

## Si algo no funciona

- **«Sin microSD: no se registra» con la tarjeta puesta:** la tarjeta tiene que estar formateada en FAT32. Las de más de 32 GB vienen en exFAT: formatéalas en FAT32 o usa una más chica.
- **Excel muestra todo en una sola columna:** tu Excel espera coma en lugar de punto y coma. Abre el archivo con Datos › Desde texto y elige el punto y coma.
- **La fecha no corresponde:** el RTC no está en hora (lección 21).

## Para practicar

- **Contar los eventos:** al arrancar el PLC, cuenta las líneas que ya tiene el archivo y escribe `Registro: 5 eventos`. Pista: abre con `FILE_READ` y cuenta los `'\n'` mientras `available()`.
- **Aviso sin tarjeta:** sin microSD, la lámpara de `Q0.1` se enciende, y el motor sigue funcionando. Pista: `JWPLC_SD.isReady()`.

## Resumen

- La microSD guarda registros grandes en archivos que se leen en la PC.
- Abrir, escribir y **cerrar**: lo escrito llega a la tarjeta al cerrar.
- `FILE_APPEND` suma al final; `FILE_WRITE` borra lo que había.
- Un CSV con fecha año-mes-día se abre en Excel y se ordena solo.
- Sin tarjeta, el registro se pierde, pero la máquina sigue.

En la siguiente lección, [El escaneo de E/S](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/24-el-escaneo-de-e-s/), verás cómo lee el equipo sus 8 entradas de una sola vez.
