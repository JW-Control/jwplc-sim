<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-8/47-servidor-modbus-tcp.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 47: El JWPLC servidor Modbus TCP: la PC mira y manda

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [46](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/46-la-red-del-tablero/) y la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/)

Una banda cuenta cajas en la planta y el jefe de producción quiere verlas desde su oficina, y arrancar la banda sin bajar al tablero. Los dos están en la misma red Ethernet. Lo que falta es un idioma común: **Modbus TCP**.

## Modbus, ahora por la red

Es el mismo Modbus de la Unidad 6, con las mismas tablas y funciones, pero viaja por Ethernet en lugar de RS-485:

| | Modbus RTU (Unidad 6) | Modbus TCP |
|---|---|---|
| Cable | RS-485, dos hilos | Ethernet |
| A quién se pregunta | Dirección 1 a 247 | Dirección IP y puerto 502 |
| Quién pregunta | El maestro | El **cliente** |
| Quién responde | El esclavo | El **servidor** |

En esta lección el JWPLC es el **servidor**: abre el puerto 502 y responde a quien le pregunte. La PC es el cliente.

## Las tablas del JWPLC

El programa declara sus tablas como variables comunes y se las presta a la red:

| Tabla | Direcciones | Variable | Quién la escribe |
|---|---|---|---|
| Bobinas | 00001 a 00008 | `bobinas[0]`, un bit por bobina | La PC (y el programa) |
| Holding | 40001 a 40008 | `holding[0]` a `holding[7]` | El programa (y la PC) |

El mapa de esta banda:

| Dirección | Qué es |
|---|---|
| 40001 | Cajas contadas |
| 40002 | Banda en marcha (1) o parada (0) |
| 00001 | Marcha de la banda, la manda la PC |

## Lo que necesitas

- El JWPLC Basic en la red, como en la lección 46.
- Un sensor fotoeléctrico PNP de 24 V DC (B1) que ve pasar las cajas.
- El contactor KM1 de la banda, con bobina de 24 V DC.
- Una PC en la misma red con **JW Modbus Tool**, o cualquier programa maestro Modbus TCP.

## Conexiones

1. **`I0.0`**: salida del sensor B1 (marrón a +24 V, azul a 0 V, negro a I0.0).
2. **`Q0.0`**: bobina del contactor KM1.
3. Cable de red al switch.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 8.Ethernet_y_Modbus_TCP → 47.Servidor_Modbus_TCP. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 8, lección 47. En el Esquema, la PC PC1 ya tiene abierto JW Modbus Tool: un clic en la bobina 00001 arranca la banda y el sensor B1 se acciona desde su símbolo.

## Cómo funciona el programa

### Prestar las tablas

```cpp
JWPLC_ModbusTCP.setCoils(bobinas, 8);
JWPLC_ModbusTCP.setHoldingRegisters(holding, 8);
JWPLC_ModbusTCP.beginServer(1, 502);
```

Las tablas son del programa; la librería solo las presta a la red. Cuando la PC escribe la bobina 00001, cambia el bit 0 de `bobinas[0]`, y cuando lee el 40001, recibe `holding[0]`. El servidor se atiende solo, sin nada en `loop()`. El `1` es la dirección (Unit ID) y el `502`, el puerto de Modbus TCP.

### Leer lo que manda la PC

```cpp
bool banda = (bobinas[0] & 0b00000001) != 0;
```

Las 8 bobinas van juntas en un byte, como las entradas del módulo remoto de la [lección 35](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/35-modulo-de-e-s-remotas/). La máscara `0b00000001` mira el bit 0, la bobina 00001.

### Publicar lo que lee la PC

```cpp
holding[0] = cajas;
holding[1] = banda ? 1 : 0;
```

Escribir en la tabla es dejar el dato listo. La PC lo lee cuando pregunta, cada vez que quiera.

## Súbelo y pruébalo

1. Sube el programa y espera la red (lección 46).
2. En JW Modbus Tool conecta a 192.168.250.10, puerto 502, Unit ID 1. Muestra los holding desde 40001 y las bobinas desde 00001.
3. Escribe 1 en la bobina 00001: la banda arranca y el 40002 pasa a 1.
4. Pasa cajas frente a B1: el 40001 sube de a uno.

```text
Lección 47: servidor Modbus TCP, cajas en 40001, marcha en la bobina 00001
Banda en marcha (desde la PC)
Caja 1
Caja 2
```

## Si algo no funciona

- **JW Modbus Tool no conecta:** prueba primero el `ping` de la lección 46. Revisa el puerto, 502.
- **Conecta, pero responde con error de dirección:** pediste más registros de los que tiene la tabla. Aquí son 8 bobinas y 8 holding.
- **Las direcciones parecen corridas en uno:** algunos programas cuentan desde 0 (holding 0) y otros desde 1 (40001). Son el mismo registro.

## Para practicar

- **Meta desde la PC:** la PC escribe la meta de cajas en el 40003. Al llegar a la meta, la banda para sola: el programa apaga el bit 0 de `bobinas[0]` y escribe «Meta cumplida: N cajas». El programa también puede escribir en lo que escribió la PC.

## Resumen

- Modbus TCP es Modbus por Ethernet: dirección IP y puerto 502 en lugar del número de esclavo.
- El JWPLC servidor presta sus tablas con `setCoils()` y `setHoldingRegisters()` y las atiende solo.
- La PC lee lo que el programa publica y escribe lo que el programa obedece.

En la siguiente lección, [E/S remotas por Ethernet](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/48-e-s-remotas-por-ethernet/), el JWPLC pasa a ser el cliente y pregunta él a un módulo de la red.
