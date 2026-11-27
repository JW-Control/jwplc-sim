<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-6/35-modulo-de-e-s-remotas.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 35: El módulo de E/S remotas: 8 entradas y 8 salidas más

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** las lecciones [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [33](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/)

La bomba está a 200 m del tablero. Llevar un cable por pulsador, por contactor y por lámpara es caro y difícil de mantener. La solución de la industria: un **módulo de E/S remotas** junto a la bomba. Los pulsadores y el contactor se conectan al módulo, y del módulo al tablero corre solo el bus.

Para el programa, el módulo es un esclavo más, con dos tipos de datos:

| Dato | Función | Del módulo |
|---|---|---|
| Entradas discretas 0–7 | 02, leer | DI1–DI8 |
| Bobinas 0–7 | 15, escribir varias | DO1–DO8 |

## Ocho bits en un byte

Las 8 entradas llegan juntas en un byte: el bit 0 es DI1 y el bit 7 es DI8. Para saber si DI2 está activa se usa una **máscara**: `(entradas[0] & 0b00000010) != 0`. Para encender DO1 y DO2 se usa `|`: `salidas[0] | 0b00000011`. Son los operadores de bits de C++: `&` deja pasar solo los bits marcados y `|` los enciende sin tocar los demás.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un módulo de E/S remotas Modbus RTU (8 DI, 8 DO) en la dirección 3, 9600 bps, 8N1.
- Un pulsador de marcha (NA), uno de parada (NC), un contactor y una lámpara.

## Conexiones

1. **`A`** y **`B`** del RS-485 del JWPLC a los bornes **A** y **B** de cada equipo, siempre A con A y B con B, en cadena (de un equipo al siguiente, sin derivaciones en estrella).
2. En los dos extremos de la cadena, una resistencia de terminación de 120 Ω entre A y B si el cable es largo.
3. En el módulo: **DI1** marcha (NA), **DI2** parada (NC), **DO1** contactor KM1, **DO2** lámpara H1.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 6.RS485_y_Modbus_RTU → 35.Modulo_de_E_S_remotas. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 6, lección 35. Los equipos del bus ya vienen cableados en el **Esquema** y responden como los de verdad; para probar una falla, corta un cable con clic derecho.

## Cómo funciona el programa

### Leer, decidir, escribir

Cada 100 ms el programa hace el ciclo de un PLC, pero por el bus:

1. **Leer** las 8 entradas del módulo en una pregunta (`readDiscreteInputsSync`).
2. **Decidir** con el enclavamiento de siempre: `bomba = (marcha || bomba) && paradaSinApretar`.
3. **Escribir** las 8 salidas en una orden (`writeMultipleCoilsSync`).

### Si el módulo no responde

```cpp
if (!JWPLC_ModbusRTU.readDiscreteInputsSync(MODULO, 0, 8, entradas))
{
    ...
    return;
}
```

Sin respuesta no hay entradas nuevas, y decidir con datos viejos es peligroso. El `return` salta el resto del ciclo. En la [lección 38](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/38-tiempos-y-errores/) verás qué hacer cuando el módulo se pierde del todo.

## Súbelo y pruébalo

1. Sube el programa y aprieta la marcha junto a la bomba: el contactor cierra y la lámpara se enciende.
2. Aprieta la parada: todo se apaga.
3. Mira los LED del módulo: muestran lo que el JWPLC le escribió.

```text
Lección 35: E/S remotas en la dirección 3, bomba en DO1
Bomba en marcha
Bomba detenida
```

## Si algo no funciona

- **«Sin respuesta» o «Timeout» siempre:** A y B cruzados, la dirección del equipo distinta de la del programa, o la velocidad y el formato (9600, 8N1) distintos en los dos lados.
- **Responde a veces:** cable sin trenzar o sin terminación en un tramo largo; o dos equipos con la misma dirección.
- **La bomba arranca con la entrada equivocada:** revisa el bit de la máscara; DI1 es el bit 0, no el 1.

## Para practicar

- **El térmico:** suma el térmico de la bomba en DI3 (NC). Si abre, la bomba para, no arranca y se escribe «Falla: térmico» una vez.
- **La lámpara de falla:** enciende DO3 mientras dure la falla.

## Resumen

- Un módulo de E/S remotas acerca las entradas y salidas a la máquina.
- Entradas discretas (02) y bobinas (15) van 8 por byte.
- Las máscaras `&` y `|` leen y escriben cada bit.
- Sin respuesta, no se decide con datos viejos.

En la siguiente lección, [Un variador por Modbus](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/36-un-variador-por-modbus/), mueves un motor a la velocidad que quieras por el mismo bus.
