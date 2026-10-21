# Modelo TCA6424A

Expansor de E/S de 24 bits por I2C de Texas Instruments. Referencia:
**TCA6424A datasheet, SCPS193** (TI). Implementación:
[`tca6424a.cpp`](tca6424a.cpp), interfaz
[`../include/jwsim/models/tca6424a.h`](../include/jwsim/models/tca6424a.h).

El modelo se escribe contra el datasheet, **no** contra el driver del
package (`cores/jwcontrol/peripherals/src/peripheral-tca6424a.c`). El driver
es el código bajo prueba.

## Comportamiento modelado

| # | Comportamiento | Sección del datasheet | Estado |
|---|---|---|---|
| 1 | Dirección 7 bits `0100 01A0` → 0x22 (ADDR=L) / 0x23 (ADDR=H) | Device Address | Modelado |
| 2 | Primer byte tras la dirección (escritura) = byte de comando; bits 6..0 = registro, bit 7 = AI (auto-incremento) | Control Register and Command Byte | Modelado |
| 3 | Mapa de registros: Input 0x00–0x02, Output 0x04–0x06, Polarity 0x08–0x0A, Configuration 0x0C–0x0E | Register Descriptions | Modelado |
| 4 | Valores tras power-on reset: Output = 0xFF, Polarity = 0x00, Configuration = 0xFF (todo entrada) | Register Descriptions / POR | Modelado |
| 5 | Input Port refleja el nivel lógico real de cada pin, sea entrada o salida | Input Port Registers | Modelado |
| 6 | Escrituras al Input Port no tienen efecto | Input Port Registers | Modelado |
| 7 | Polarity Inversion invierte el bit leído en Input Port para pines configurados como entrada | Polarity Inversion Registers | Modelado — **verificar** si aplica también a pines de salida |
| 8 | Configuration bit = 1 → entrada en alta impedancia; = 0 → salida push-pull con el valor de Output | Configuration Registers | Modelado |
| 9 | AI = 1: tras cada byte el puntero avanza dentro del grupo de 3 registros y vuelve al primero (x2 → x0) | Control Register and Command Byte | Modelado — **verificar** el envolvimiento exacto |
| 10 | AI = 0: el puntero no avanza; bytes sucesivos acceden al mismo registro | Control Register and Command Byte | Modelado — **verificar** |
| 11 | INT (drenador abierto, activo en bajo) se activa cuando un pin de entrada cambia respecto del valor leído por última vez; se libera al leer ese Input Port o si el pin vuelve a su valor | Interrupt Output (INT) | Modelado |
| 12 | RESET en bajo: registros a valores POR, el dispositivo no responde en I2C | RESET Input | Modelado (en JWPLC Basic no está cableado a un GPIO; ver supuestos) |
| 13 | Sin pull-ups internos: entrada sin manejar toma el nivel de reposo que imponga la placa | Electrical Characteristics | Modelado como red con nivel de reposo |
| 14 | Temporización I2C (100/400 kHz): la duración de cada transacción la calcula el bus (`9 bits × (1 + n)` por fase + START/STOP) | Timing Requirements | Modelado a nivel de bit, sin estiramiento de reloj |

## No modelado (fuera de alcance de G0/G1)

- Tiempos eléctricos de los pines (t_pv, t_iv, glitch filter de entrada).
- Corriente de salida, caída de tensión y contención eléctrica real (la red
  resuelve AND cableado y marca contención).
- Respuesta a General Call / Software Reset (0x00, 0x06).
- Comportamiento ante condiciones de bus ilegales (START/STOP fuera de byte).

## Cómo cerrar los puntos "verificar"

1. Contrastar las filas 7, 9 y 10 con SCPS193 (secciones *Control Register
   and Command Byte* y *Polarity Inversion Registers*).
2. Si es posible, medirlo en un JWPLC Basic real con un sketch que escriba
   el comando con AI=0 y AI=1 y lea 4 bytes seguidos; agregar el resultado
   como test de regresión del modelo (gate `JWSIM_G1_TCA6424A_MODEL`).
