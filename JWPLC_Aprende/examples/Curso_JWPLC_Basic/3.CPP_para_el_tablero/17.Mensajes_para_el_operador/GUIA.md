<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/17-mensajes-para-el-operador.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 17: Mensajes para el operador: un horómetro

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/) y [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/)

Un mensaje del programa lo lee una persona: el técnico que prueba la máquina, el supervisor que revisa un registro o el operador que mira la pantalla. `Motor: 1 7351` no le dice nada a nadie. `Arranque 1 · en marcha 00:02:15` se entiende al vuelo.

En esta lección vas a armar textos con formato y un **horómetro**: el contador de horas de marcha que traen todos los equipos grandes, porque el mantenimiento (cambiar aceite, rodamientos, filtros) se programa por horas de trabajo, no por fecha.

## `Serial.printf`: un molde con huecos

Hasta ahora unías textos con `Serial.print()` o con `+`. `printf` es otra forma: escribes la línea entera como un **molde**, y cada hueco (`%…`) se llena con un dato, en orden.

```cpp
Serial.printf("Arranque %lu de la bomba %s\n", arranques, nombre);
//                     │                │    │
//                     │                │    └── \n: salto de línea
//                     │                └── hueco para un texto
//                     └── hueco para un número entero
```

| Hueco | Qué escribe | Ejemplo |
|---|---|---|
| `%lu` | Un entero `unsigned long` | `7` |
| `%02lu` | El mismo, con 2 cifras y ceros a la izquierda | `07` |
| `%s` | Un texto | `Bomba 1` |
| `%.1f` | Un número con decimales, con 1 decimal | `92.3` |
| `%%` | Un signo `%` | `%` |

`printf` no agrega el salto de línea solo: ponlo tú con `\n` al final.

> [!WARNING] El tipo tiene que coincidir con el hueco
> `%lu` espera un `unsigned long`, que es el tipo que devuelve `millis()`. Por eso en esta lección los tiempos y contadores son `unsigned long`. Si el tipo no coincide con el hueco, el número sale mal y el compilador te avisa con un *warning* de `format`.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador NA (marcha) y uno NC (paro).
- Un contactor con bobina de 24 V DC, o una lámpara.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: MARCHA (NA). **`I0.1`**: PARO (NC). Los dos desde **+24 V**.
3. **`Q0.0`**: bobina del contactor del motor.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 17.Mensajes_para_el_operador. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 3, lección 17. Trae el motor ya cableado y una práctica que se califica sola.

## Cómo funciona el programa

### De milisegundos a hh:mm:ss

```cpp
String formatoHora(unsigned long ms)
{
    unsigned long segundos = ms / 1000;
    unsigned long horas = segundos / 3600;
    unsigned long minutos = (segundos / 60) % 60;
    segundos = segundos % 60;

    char texto[12];
    snprintf(texto, sizeof(texto), "%02lu:%02lu:%02lu", horas, minutos, segundos);
    return String(texto);
}
```

Primero las cuentas. Entre enteros, `/` da el cociente sin decimales y `%` el **resto**:

- 7 384 000 ms / 1000 = 7384 segundos.
- 7384 / 3600 = **2** horas.
- 7384 / 60 = 123 minutos; 123 % 60 = **3** minutos (los que sobran de las horas enteras).
- 7384 % 60 = **4** segundos.

Después, `snprintf` es el hermano de `printf` que, en vez de mandar el texto al Monitor Serie, lo escribe en `texto`, una fila de 12 caracteres (`char`). `sizeof(texto)` le dice cuánto cabe, para que nunca escriba de más. Con `%02lu` cada número sale con dos cifras: `02:03:04`. Al final, la función devuelve el texto como `String`.

### Usar un `String` en `printf`

```cpp
Serial.printf("Detenido tras %s\n", formatoHora(tramo).c_str());
```

`%s` espera el texto «crudo» de C, no un `String`. La función `.c_str()` de cualquier `String` lo entrega así.

### El horómetro

```cpp
unsigned long inicioTramo = 0;      // Cuándo arrancó esta vez.
unsigned long marchaAnterior = 0;   // Tiempo de marcha de los arranques anteriores.
```

Al arrancar se anota la hora. Al parar, lo que duró ese arranque (el **tramo**) se suma a `marchaAnterior`. La marcha total es lo de antes más lo que lleva el arranque actual:

```cpp
unsigned long marchaTotal()
{
    if (motor)
    {
        return marchaAnterior + (millis() - inicioTramo);
    }
    return marchaAnterior;
}
```

### Un reporte cada 5 segundos

```cpp
if (motor && millis() - ultimoReporte >= REPORTE_MS)
{
    ultimoReporte = ultimoReporte + REPORTE_MS;
    ...
}
```

La técnica de la lección 06. Fíjate que `ultimoReporte` avanza **exactamente** 5000 en lugar de tomar `millis()`: así los reportes no se atrasan unos milisegundos cada vez y caen siempre a los 5, 10, 15 segundos.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. MARCHA arranca el motor: cada 5 segundos llega un reporte.
3. PARO lo detiene y dice cuánto duró ese arranque.
4. Arranca otra vez: el total sigue sumando desde donde quedó.

```text
Lección 17: marcha I0.0, paro NC I0.1, motor Q0.0
Arranque 1
En marcha 00:00:05 | total 00:00:05
En marcha 00:00:10 | total 00:00:10
Detenido tras 00:00:11
Arranque 2
```

## Si algo no funciona

- **Los números salen gigantes o en 0:** el tipo no coincide con el hueco. Con `%lu`, la variable tiene que ser `unsigned long`.
- **Todo sale en una sola línea:** falta `\n` al final del molde.
- **En lugar del texto sale basura:** pasaste un `String` a `%s`; usa `.c_str()`.
- **El horómetro vuelve a cero al cortar la energía:** es lo esperado por ahora. En la Unidad 4 lo guardarás en la memoria FRAM, que no se borra.

## Para practicar

- **Aviso de mantenimiento:** al llegar a 30 segundos de marcha total (en una máquina real serían 500 horas), enciende una lámpara en `Q0.1` y escribe **una sola vez** `Mantenimiento: 00:00:30 de marcha`.
- **Porcentaje de uso:** en cada parada, escribe qué parte del tiempo, desde que se encendió el PLC, estuvo el motor en marcha, con un decimal: `Uso: 92.3 %`. Pista: `float uso = marchaAnterior * 100.0 / millis();` y el hueco `%.1f`. El `100.0` con punto hace que la cuenta se haga con decimales.

## Resumen

- `Serial.printf` escribe un molde con **huecos** que se llenan en orden: `%lu`, `%02lu`, `%s`, `%.1f`.
- El tipo de cada dato tiene que coincidir con su hueco; para tiempos, `unsigned long`.
- `/` y `%` entre enteros separan horas, minutos y segundos.
- `snprintf` arma el texto en una fila de `char` en lugar de mandarlo al Monitor Serie.
- Un horómetro suma el tiempo de cada arranque; el mantenimiento se programa por horas de marcha.

En la siguiente lección, [Encuentra el error](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/18-encuentra-el-error/), usarás el depurador de JWPLC Sim para detener el programa y ver sus variables por dentro.
