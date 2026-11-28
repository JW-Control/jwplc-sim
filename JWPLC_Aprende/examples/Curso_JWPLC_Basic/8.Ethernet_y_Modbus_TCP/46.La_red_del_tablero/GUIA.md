<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-8/46-la-red-del-tablero.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 46: La red del tablero: dirección IP fija

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** la [Unidad 6](https://jw-control.com/wiki/curso-jwplc-basic/unidad-6/33-leer-un-controlador/)

En la Unidad 6 los equipos hablaban por dos hilos de RS-485. En las plantas de hoy también corre una **red Ethernet**: el mismo cable de las computadoras, con un switch en el tablero. Por ella la PC de la oficina mira lo que pasa en la máquina, y el JWPLC habla con otros equipos que estén lejos.

El JWPLC Basic trae su puerto Ethernet (el conector RJ45 del frente). En esta unidad lo usas, y en esta primera lección le das su lugar en la red.

## La dirección IP

En una red, cada equipo tiene una **dirección IP**, como el número de una casa en una calle. Son cuatro números del 0 al 255 separados por puntos:

| Dato | Valor en esta unidad | Para qué |
|---|---|---|
| IP del JWPLC | 192.168.250.10 | Su número en la red |
| Máscara | 255.255.255.0 | Dice que la «calle» es 192.168.250: los equipos de 192.168.250.1 a .254 se hablan directo |
| Puerta de enlace | 192.168.250.1 | El router, la salida hacia otras redes |

Hay dos formas de recibir la IP:

- **DHCP:** un servidor de la red (el router) la entrega al conectarse. Es lo que hace tu celular en el wifi. Cómodo, pero la dirección puede cambiar.
- **IP fija:** la escribe el programa. Es lo que se usa en un tablero, porque la PC y los demás equipos tienen que saber **siempre** dónde encontrar al JWPLC.

Sin nada en el programa, el JWPLC pide su IP por DHCP. Con `setStaticIP()` en `setup()` usa la que tú le das.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un cable de red y un switch (o el router de la oficina). Para probar basta conectar el JWPLC directo a tu PC.
- Una lámpara piloto de 24 V DC: H1, «red lista».

## Conexiones

1. Cable de red del RJ45 del JWPLC al switch.
2. **`Q0.0`**: lámpara H1, el piloto de red lista.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 8.Ethernet_y_Modbus_TCP → 46.La_red_del_tablero. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 8, lección 46. El JWPLC ya está en la red del Esquema junto a una PC; el estado de la red sale en el Monitor Serie.

## Cómo funciona el programa

### La dirección, en setup()

```cpp
JWPLC_Ethernet.setStaticIP(IP_JWPLC, ROUTER, ROUTER, MASCARA);
```

Los cuatro datos son la IP del JWPLC, el servidor de nombres (DNS), la puerta de enlace y la máscara. En una red de planta el DNS casi nunca se usa, y se pone el mismo router. Va en `setup()` porque la red arranca apenas termina: el JWPLC la atiende por su cuenta, sin nada en `loop()`.

### ¿Está lista?

`JWPLC_Ethernet.isReady()` es verdadero cuando el cable está conectado y la dirección ya está puesta. Arrancar la red toma unos segundos; mientras tanto, `diagnosticCode()` da el mismo código corto que la pantalla del JWPLC muestra junto a **ETH**:

| Código | Qué pasa |
|---|---|
| `INI`, `PHY` | Arrancando el chip de red |
| `LNK` | Sin enlace: el cable, el switch apagado, o el chip todavía negociando |
| `DHC` | Esperando al servidor DHCP |
| `---` | Lista: nada que reclamar |

### El piloto

`digitalWrite(Q0_0, redLista)` enciende H1 con la red lista. Si el cable se suelta, `isReady()` pasa a falso, se escribe «Red perdida» y H1 se apaga.

## Súbelo y pruébalo

1. Pon a tu PC una IP de la misma red, por ejemplo 192.168.250.50, máscara 255.255.255.0.
2. Sube el programa: durante unos segundos sale el estado de la red, y después la IP. H1 se enciende.
3. En una consola de tu PC escribe `ping 192.168.250.10`: el JWPLC responde.
4. Desconecta el cable: «Red perdida» y H1 se apaga.

```text
Lección 46: IP fija 192.168.250.10, piloto H1 en Q0.0
Esperando la red: LNK (Link OFF)
Esperando la red: LNK (Link OFF)
Red lista. IP: 192.168.250.10
```

## Si algo no funciona

- **Se queda en `LNK`:** el cable o el switch. Mira las luces del conector RJ45.
- **El ping no responde:** la PC está en otra red. Su IP tiene que empezar con 192.168.250 y no puede repetir la del JWPLC.
- **Dos equipos con la misma IP:** la red se vuelve loca y responde uno u otro. Lleva una lista de las IP del tablero.

## Para practicar

- **Piloto que parpadea:** mientras el JWPLC espera la red, H1 parpadea cada medio segundo; con la red lista queda fijo. Usa `millis()` como en la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/).

## Resumen

- Cada equipo de una red tiene su dirección IP; en un tablero se fija con `setStaticIP()`.
- La máscara dice qué equipos están en la misma red; la puerta de enlace es la salida hacia otras.
- `isReady()` dice si la red está lista y `diagnosticCode()` qué le falta.

En la siguiente lección, [El JWPLC servidor Modbus TCP](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/47-servidor-modbus-tcp/), la PC de la oficina lee y escribe datos del JWPLC por esta red.
