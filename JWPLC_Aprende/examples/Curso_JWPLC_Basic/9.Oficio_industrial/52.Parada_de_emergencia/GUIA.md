<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-9/52-parada-de-emergencia.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 52: Parada de emergencia y rearme

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [11](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados/)

Con esta lección empieza la **Unidad 9, oficio industrial**: lo que separa un programa que funciona de un tablero que se puede entregar. Y lo primero en cualquier tablero es la **parada de emergencia**, la seta roja.

## Dos reglas

1. **La emergencia corta por cable.** Su contacto NC (11-12) va en serie con lo que mueve la máquina; aquí alimenta el común de la salida `Q0.0`. Si alguien aprieta la seta, la bobina de KM1 se queda sin tensión aunque el programa esté colgado. El programa la lee también (`I0.3`), pero solo para saber qué pasó.
2. **Soltar la seta no arranca nada.** Hace falta un **rearme** (el pulsador azul) y después una **marcha nueva**. Una máquina que arranca sola cuando alguien gira la seta es una máquina peligrosa.

> [!WARNING] Seguridad de verdad
> En máquinas con riesgo para las personas, la emergencia va con un **relé de seguridad** certificado, no solo con el PLC. Esta lección enseña la lógica; la categoría de seguridad la define la evaluación de riesgos de la máquina.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un motor con contactor de bobina 24 V DC y su guardamotor.
- Un pulsador de marcha (NA) y uno de parada (NC).
- Una seta de emergencia con contacto NC y un pulsador azul de rearme (NA).
- Una lámpara roja de 24 V DC.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).
3. **`+24 V`** → seta **11-12** → común de **`Q0.0`**; el mismo borne 12 también a **`I0.3`**.
4. **`I0.2`**: rearme (NA). **`Q0.0`**: bobina de KM1. **`Q0.1`**: lámpara H1.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 9.Oficio_industrial → 52.Parada_de_emergencia. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 9, lección 52. Los equipos ya vienen cableados en el **Esquema**; las fallas (bobina cortada, contactos soldados, cable cortado) se provocan con clic derecho sobre cada equipo.

## Cómo funciona el programa

### Tres estados

| Estado | Qué pasa | Se sale con |
|---|---|---|
| `NORMAL` | El motor obedece a marcha y parada | La seta |
| `EMERGENCIA` | Motor parado, seta apretada | Soltar la seta |
| `ESPERA_REARME` | Motor parado, seta suelta | Rearme |

Es una máquina de estados como la de la [lección 11](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/11-maquina-de-estados/). El motor solo puede andar en `NORMAL`: en los otros dos, `motor = false` en cada vuelta.

### Al encender

```cpp
if (digitalRead(I0_3) == LOW)
    estado = EMERGENCIA;
```

Si la placa se enciende con la seta apretada, el programa empieza en emergencia. Así un corte de luz no «olvida» la emergencia.

### El rearme no arranca

Al rearmar, el estado pasa a `NORMAL` pero `motor` sigue en `false`. Arranca solo con una marcha nueva, como manda la norma.

## Súbelo y pruébalo

1. Sube el programa y arranca el motor con marcha.
2. Aprieta la seta: el motor para y H1 se enciende.
3. Suelta la seta: el motor no vuelve. Aprieta rearme y después marcha.

```text
Lección 52: emergencia NC I0.3, rearme I0.2, marcha I0.0, parada NC I0.1
Motor en marcha
EMERGENCIA
Motor detenido
Emergencia liberada: apriete Rearme
Rearmado: la máquina espera una marcha
Motor en marcha
```

## Si algo no funciona

- **El motor no para con la seta:** la seta no está en serie con el común de `Q0.0`; el programa solo no alcanza.
- **Siempre en emergencia:** la seta está cableada como NA; tiene que ser el contacto 11-12.

## Para practicar

- **La lámpara según la norma:** en `EMERGENCIA`, H1 parpadea una vez por segundo; en `ESPERA_REARME` queda fija.
- **Avisar:** si se aprieta rearme con la seta todavía apretada, «Libere la emergencia antes de rearmar».

## Resumen

- La emergencia corta por cable; el programa la registra.
- Soltar la seta no arranca nada: rearme y marcha nueva.
- Al encender con la seta apretada, se empieza en emergencia.

En la siguiente lección, [Realimentación del contactor](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/53-realimentacion-del-contactor/), el programa comprueba que el contactor le hizo caso.
