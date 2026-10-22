# Modelo del controlador Ethernet W5500

Controlador Ethernet del JWPLC Basic (VSPI, CS = GPIO5, 20 MHz; INTn =
GPIO15 con pull-up externo; `jwplc_spi_bus.h`, `jwplc_hardware_config.h`).
Referencia: **WIZnet W5500 Datasheet v1.1.0**. Implementación:
[`w5500.cpp`](w5500.cpp), interfaz
[`../include/jwsim/models/w5500.h`](../include/jwsim/models/w5500.h). El
driver bajo prueba es `utility/w5100.cpp` y `socket.cpp` de
`JWPLC_Ethernet` (derivados de la librería Ethernet de Arduino), sin
modificar. Tests: [`tests/models/w5500_test.cpp`](../../../tests/models/w5500_test.cpp)
(una prueba por fila).

El modelo no abre sockets del host: lo que el chip envía sale por el puerto
`W5500::Network` y lo que llega entra con `net_*`, cada cosa en un instante
virtual. Quién está del otro lado (la red del host, una red de prueba o
nadie) lo decide la placa.

## Comportamiento modelado

| # | Comportamiento | Sección | Estado |
|---|---|---|---|
| 1 | Trama SPI: dirección de 16 bits, byte de control (BSB[4:0], RWB, OM[1:0]) y datos con autoincremento de la dirección; OM = 00 de largo variable hasta subir SCSn | 2.2, 2.2.1–2.2.3 | Modelado |
| 2 | OM = 01/10/11: tramas de 1, 2 o 4 bytes de datos seguidas sin soltar SCSn | 2.2.2 | Modelado |
| 3 | Valores de reset de los registros comunes y de socket; VERSIONR = 04h, de solo lectura | 3.1, 3.2, 4 | Modelado |
| 4 | MR.RST reinicia los registros (MR vuelve a 00h); la detección de chips de `w5100.cpp` (primero W5200, luego W5500) identifica un W5500 | 4.1 (MR) | Modelado; las tramas de W5200 caen en un bloque reservado |
| 5 | Bloques reservados (BSB sin registro ni búfer): la escritura se ignora y la lectura da 00h | 2.2.2 | Modelado |
| 6 | PHY: LNK, SPD y DPX en PHYCFGR; enlace 1,5 s después del encendido, del reset del PHY (PHYCFGR.RST = 0 → 1) o de conectar el cable | 4.1 (PHYCFGR) | Modelado (`kAutoNegTime`); 100 Mbit/s full duplex |
| 7 | Búferes de 16 KiB de TX y de RX repartidos por Sn_TXBUF_SIZE/Sn_RXBUF_SIZE (0, 1, 2, 4, 8, 16 KiB; otro valor se ignora) en orden de socket; la dirección dentro del bloque da la vuelta en el tamaño del socket | 4.2 (Sn_RXBUF_SIZE, Sn_TXBUF_SIZE), 2.2.2 | Modelado |
| 8 | OPEN (TCP) → SOCK_INIT; CONNECT → SOCK_SYNSENT → SOCK_ESTABLISHED con Sn_IR.CON; Sn_CR vuelve a 00h al aceptar el comando; Sn_DHAR con la MAC del par | 4.2 (Sn_CR, Sn_SR) | Modelado; la MAC del par es 02:00:IP (administrada localmente) |
| 9 | SEND: los bytes entre Sn_TX_RD y Sn_TX_WR salen a la red; Sn_TX_FSR = tamaño − pendientes; SEND_OK y Sn_TX_RD = Sn_TX_WR al terminar la transmisión | 4.2 (Sn_TX_FSR, Sn_TX_RD, Sn_TX_WR) | Modelado (`kFrameOverhead` + 80 ns/byte) |
| 9b | Lo escrito en Sn_TX_WR toma efecto con SEND: hasta entonces la lectura devuelve el valor del SEND anterior (y Sn_TX_FSR no cambia) | 4.2 (Sn_TX_WR) | Modelado; EthernetUDP depende de esto: escribe el datagrama en partes con un desplazamiento acumulado sobre Sn_TX_WR (`socket.cpp`, `write_data`). La hoja de datos no lo dice explícitamente: a verificar en la placa |
| 10 | Plazos: sin respuesta al ARP, TIMEOUT tras RTR·(RCR+1) (1,8 s por defecto); sin respuesta del par TCP, tras Σ RTR·2^N + (RCR−M)·RTRmax (31,8 s por defecto); un rechazo del par cierra el socket con TIMEOUT | 4.1 (RTR, RCR) | Modelado |
| 11 | LISTEN → SOCK_LISTEN; una conexión entrante pasa a SOCK_ESTABLISHED con Sn_DIPR/Sn_DPORT del par | 4.2 (Sn_CR) | Modelado |
| 12 | Recepción TCP: los datos se escriben en Sn_RX_WR, Sn_RX_RSR y Sn_IR.RECV; RECV toma Sn_RX_RD; lo que no cabe espera en el par (ventana de TCP) y entra al liberar lugar | 4.2 (Sn_RX_RSR, Sn_RX_RD, Sn_RX_WR) | Modelado |
| 13 | UDP: OPEN → SOCK_UDP; SEND a Sn_DIPR:Sn_DPORT (la difusión no necesita ARP); cada datagrama recibido con cabecera de 8 bytes (IP, puerto, largo); el que no cabe entero se descarta | 5.2.2 | Modelado |
| 14 | DISCON: FIN, SOCK_FIN_WAIT y SOCK_CLOSED con Sn_IR.DISCON; FIN del par → SOCK_CLOSE_WAIT con DISCON; CLOSE cierra en el acto | 4.2 (Sn_CR, Sn_SR) | Modelado (FIN/ACK en `2 × kFrameOverhead`) |
| 15 | Interrupciones: Sn_IR se borra escribiendo 1; SIR = sockets con Sn_IR & Sn_IMR; INTn en bajo mientras IR & IMR o SIR & SIMR | 4.1 (IR, IMR, SIR, SIMR), 4.2 (Sn_IR, Sn_IMR) | Modelado; INTLEVEL no se modela (INTn baja en el acto) |
| 16 | RSTn: con el pin en bajo el chip no responde; al subir, valores de reset y nueva autonegociación | 5.5.1 | Modelado |

## No modelado

- MACRAW (SOCK_MACRAW se acepta en el socket 0 pero no transmite), PPPoE,
  Wake on LAN, multicast, IGMP, bloqueo de difusión/unicast (Sn_MR) y
  fragmentación IP (Sn_FRAG).
- ICMP: conflicto de IP (IR.CONFLICT) y destino inalcanzable (IR.UNREACH,
  UIPR/UPORTR); el modo ping (MR.PB) no tiene efecto.
- Keep-alive de TCP (SEND_KEEP, Sn_KPALVTR): se aceptan sin efecto.
- Tiempos internos de TCP (ventana, ACK diferido, retransmisión con
  pérdidas): la red del simulador no pierde paquetes.
- INTLEVEL (intervalo de INTn alto entre interrupciones).

## Tiempos

| Parámetro | Valor | Uso |
|---|---|---|
| `kAutoNegTime` | 1,5 s | autonegociación del PHY hasta el enlace (típico de 10/100BASE-T) |
| `kFrameOverhead` | 5 µs | cabeceras, IFG y proceso interno de cada envío |
| `kWireNsPerByte` | 80 ns | 100 Mbit/s |
| RTR, RCR | registros | plazos de ARP y de TCP del §4.1 |

Son parámetros del modelo, no medidos en la placa.
