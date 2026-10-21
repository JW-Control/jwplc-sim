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
| 7 | Polarity Inversion invierte el bit leído en Input Port, tanto en pines de entrada como de salida | Polarity Inversion Registers; [TI E2E](https://e2e.ti.com/support/interface-group/interface/f/interface-forum/1448098/tca6424a-question-about-register-settings) | Modelado — confirmado por respuesta de TI en E2E; **medir en placa** |
| 8 | Configuration bit = 1 → entrada en alta impedancia; = 0 → salida push-pull con el valor de Output | Configuration Registers | Modelado |
| 9 | AI = 1: tras cada byte se incrementan los 2 bits menos significativos saltando la dirección reservada (x0 → x1 → x2 → x0) | Control Register and Command Byte | Modelado — confirmado (SCPS193D) |
| 10 | AI = 0: los 2 bits menos significativos no se incrementan; bytes sucesivos acceden al mismo registro | Control Register and Command Byte | Modelado — confirmado (SCPS193D) |
| 10b | Valor del bit AI tras power-on sin byte de comando previo | Control Register and Command Byte | **Verificar**: el texto dice que el registro de control arranca en 0x00 y a la vez que AI arranca en 1. El modelo usa 0x00. No afecta al package: el driver siempre escribe el comando |
| 11 | INT (drenador abierto, activo en bajo) se activa ante un flanco en un pin en modo entrada; se libera al leer el Input Port que la generó o si el pin vuelve a su valor original; un pin de salida no genera interrupción; pasar de salida a entrada puede dar una interrupción falsa si el pin no coincide con el Input Port | §8.3.3 Interrupt Output (INT) | Modelado — confirmado (texto de §8.3.3) |
| 12 | RESET en bajo: registros a valores POR, el dispositivo no responde en I2C | RESET Input | Modelado (en JWPLC Basic no está cableado a un GPIO; ver supuestos) |
| 13 | Sin pull-ups internos: entrada sin manejar toma el nivel de reposo que imponga la placa | Electrical Characteristics | Modelado como red con nivel de reposo |
| 14 | Temporización I2C (100/400 kHz): la duración de cada transacción la calcula el bus (`9 bits × (1 + n)` por fase + START/STOP) | Timing Requirements | Modelado a nivel de bit, sin estiramiento de reloj |

## No modelado (fuera de alcance de G0/G1)

- Tiempos eléctricos de los pines (t_pv, t_iv, glitch filter de entrada).
- Corriente de salida, caída de tensión y contención eléctrica real (la red
  resuelve AND cableado y marca contención).
- Respuesta a General Call / Software Reset (0x00, 0x06).
- Comportamiento ante condiciones de bus ilegales (START/STOP fuera de byte).

## Puntos abiertos

1. Fila 10b (valor de AI tras power-on): no afecta al firmware del package.
2. Fila 7: confirmada por TI en su foro, no por el texto del datasheet;
   conviene medirla en un JWPLC Basic real con un sketch que active la
   polaridad en un pin de salida y lea el Input Port. El resultado se agrega
   como test de regresión (`tests/models/tca6424a_test.cpp`).

Fuentes: TI SCPS193D (TCA6424A), hilo de TI E2E 1448098, y el texto de
§8.3.3 citado en la librería
[TCA6424A_RT](https://github.com/RobTillaart/TCA6424A_RT).
