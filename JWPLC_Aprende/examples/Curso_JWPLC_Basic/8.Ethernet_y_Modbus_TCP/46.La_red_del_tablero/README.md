# Curso JWPLC Basic · Lección 46 · La red del tablero: dirección IP fija

## Qué vas a aprender

- Qué es una dirección IP, la máscara y la puerta de enlace.
- Por qué en un tablero se usa IP fija y no DHCP, y cómo se fija con `setStaticIP()`.
- A saber si la red está lista con `isReady()` y qué le falta con `diagnosticCode()`.

## Qué conectar

- Cable de red del RJ45 del JWPLC al switch.
- Q0.0: lámpara H1, piloto de red lista (24 V DC).

## Cómo probarlo

1. Pon a tu PC una IP de la misma red, por ejemplo 192.168.250.50.
2. Sube el programa: al rato sale «Red lista. IP: 192.168.250.10» y H1 se enciende.
3. Desde la PC: `ping 192.168.250.10`. Desconecta el cable: «Red perdida».

## Para practicar

- Mientras espera la red, H1 parpadea cada medio segundo; con la red lista queda fijo.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: el estado de la red sale cada 2 s en el **Monitor Serie**.
2. A los 6 s, más o menos, la red está lista y **H1** se enciende.
3. En el **Esquema**, la PC **PC1** está en la misma red: su JW Modbus Tool dice «sin conexión» porque este programa todavía no abre el servidor Modbus (eso es la lección 47).

```text
Lección 46: IP fija 192.168.250.10, piloto H1 en Q0.0
Esperando la red: LNK (Link OFF)
Esperando la red: LNK (Link OFF)
Red lista. IP: 192.168.250.10
```
