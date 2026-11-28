<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-7/45-proyecto-presion-constante.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 45: Proyecto: presión constante en un edificio

**Nivel:** intermedio · **Tiempo:** unos 60 minutos · **Necesitas:** las lecciones [40](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/40-leer-un-transmisor/) a [44](https://jw-control.com/wiki/curso-jwplc-basic/unidad-7/44-control-pi/)

El proyecto de la unidad: el **equipo de presión constante** de un edificio, como los que se venden armados. Todo lo de la unidad en un solo programa:

| Parte | De la lección |
|---|---|
| La presión escalada y validada | 40 |
| La bomba con variador | 36 y 42 |
| El control PI con anti-windup | 44 |
| Reposo sin consumo y despertar por presión | Práctica de la 44 |
| H1 bomba en marcha, H2 alarma | 30 |
| Alarma de presión baja: bajo 2,0 bar durante 10 s con la bomba en marcha | Nueva |

## Un estado y cuatro partes

El equipo está en uno de tres **estados**: `DETENIDO`, `REGULANDO` o `REPOSO`, como el semáforo de la [lección 11](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados/). Y el `loop()` solo llama a cuatro partes, en el orden de un PLC:

`medir() → decidir() → actuar() → avisar()`

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- VF1: variador en la dirección 1 con la bomba (como en la [lección 36](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus/)).
- PT1: transmisor de presión de 0 a 10 bar con RS-485, en la dirección 2, instalado en la tubería de salida.
- Un pulsador de marcha (NA) y uno de parada (NC).
- Dos lámparas de 24 V DC.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, en cadena, como en la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/).
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).
3. **`Q0.0`**: H1, bomba en marcha. **`Q0.1`**: H2, alarma.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 7.Analogicas_y_control → 45.Proyecto_presion_constante. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 7, lección 45. Los equipos ya vienen cableados en el **Esquema**; la presión del transmisor y el consumo del edificio se cambian en su símbolo.

## Cómo funciona el programa

### Cada parte, su trabajo

- `medir()` lee y valida la presión.
- `decidir()` despierta la bomba si hace falta, corre el PI, pasa a reposo y vigila la presión baja.
- `actuar()` es el único lugar que escribe al variador y a las salidas.
- `avisar()` escribe la línea de la consola.

Si mañana cambia el variador, se toca solo `actuar()`. Si cambia el transmisor, solo `medir()`.

### Cambiar de estado en un solo lugar

```cpp
void cambiarEstado(Estado nuevo, String aviso)
```

Cada cambio reinicia la integral y el tiempo en el mínimo, y escribe su aviso. Así ningún cambio de estado se olvida de alguna de esas cosas.

### La alarma de presión baja

`bajaDesde` se pone en `millis()` mientras la presión esté sobre 2,0 bar. Si pasan 10 s sin que eso ocurra, con la bomba regulando, algo anda mal: una tubería rota o la bomba sin agua. Es el temporizador de la [lección 09](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/), escrito con `millis()`.

## Súbelo y pruébalo

1. Sube el programa y aprieta marcha: la presión llega a 4,0 bar y H1 se enciende.
2. Cierra todos los grifos: la bomba se va a reposo y H1 se apaga.
3. Abre grifos: la bomba despierta sola.

```text
Lección 45: presión constante 4,0 bar, marcha I0.0, parada NC I0.1
Equipo en marcha
Presión: 4.01 bar · 59.9 Hz
Presión: 4.11 bar · 51.6 Hz
Bomba en reposo
Bomba despierta
```

## Si algo no funciona

- **«Sin respuesta del transmisor»:** revisa A y B, la dirección y la velocidad (9600, 8N1), como en la Unidad 6.
- **La bomba entra y sale de reposo seguido:** la presión para despertar está muy cerca de la consigna; bájala.

## Para practicar

- **Falla segura del sensor:** sin medida, «Sensor de presión en falla: bomba a 45 Hz» una vez, la bomba a 45 Hz fijos y H2 encendida. Con el sensor de vuelta: «Sensor de presión normal», H2 apagada y el PI retoma. En un edificio, sin medida, es mejor dar agua con prudencia que dejar a todos sin agua.

## Resumen

- Un equipo real junta medida, PI, reposo y alarmas.
- Los estados dicen qué hace la máquina; las partes, quién hace qué.
- Un solo lugar escribe las salidas.
- La falla segura depende de la máquina.

Con esta lección terminas la **Unidad 7**. En la Unidad 8, [La red del tablero](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/46-la-red-del-tablero/), el JWPLC se une a la red Ethernet de la planta.
