# Modelo DS3232M

RTC I2C con oscilador MEMS y 236 bytes de SRAM con batería (Maxim, hoy
Analog Devices), dirección 0x68, en el I2C0 del JWPLC Basic junto al
TCA6424A. Referencia: **DS3232M datasheet, 19-6340** (Maxim Integrated).
Implementación: [`ds3232m.cpp`](ds3232m.cpp), interfaz
[`../include/jwsim/models/ds3232m.h`](../include/jwsim/models/ds3232m.h). El
código bajo prueba es `JW_RTC` y el runtime del core (`JWPLC_Time`).

## Comportamiento modelado

| # | Comportamiento | Sección del datasheet | Estado |
|---|---|---|---|
| 1 | Valores tras alimentar por primera vez: OSF = 1 (hora no válida), Control = 1Ch, EN32kHz = 1, fecha 01/01/00 | Control / Status Register | Modelado |
| 2 | Hora y fecha en BCD (00h–06h) que avanzan con el **tiempo virtual**; siglo en el bit 7 del mes (2000–2199) | Timekeeping Registers | Modelado |
| 3 | Escribir los segundos reinicia la cadena del divisor: el siguiente segundo llega 1 s después de la escritura | Clock and Calendar | Modelado |
| 4 | Modo 12 h (bit 6 de horas, bit 5 = PM) | Clock and Calendar | Modelado |
| 5 | Buffers de lectura: la hora se congela al START (y cuando el puntero vuelve a 00h), así una lectura de varios bytes es coherente | Clock and Calendar | Modelado |
| 6 | Alarma 1 con sus 6 modos de máscara (A1M1–A1M4, DY/DT) y bandera A1F; las banderas solo se borran escribiendo 0 | Alarms / Status | Modelado (sin pin INT/SQW: no está cableado a un GPIO en el modelo de placa) |
| 7 | Alarma 2 (a los 00 s, 4 modos) y bandera A2F | Alarms | Modelado |
| 8 | Temperatura de 10 bits en 11h–12h (0,25 °C, complemento a dos); CONV termina al instante | Temperature Registers | Modelado (25,00 °C fijo, ajustable desde el modelo) |
| 9 | SRAM 14h–FFh; el puntero vuelve de FFh a 00h | SRAM | Modelado |
| 10 | Batería: hora, registros y SRAM se conservan entre corridas (`rtc.bin` en el directorio de estado) | Power Control | Modelado: el tiempo apagado cuenta como 0 s (reproducible) |
| 11 | Día de semana: contador propio que avanza a medianoche; escribir la fecha no lo cambia | Timekeeping Registers | Modelado |

## Hora de arranque

`--rtc fijo:AAAA-MM-DDTHH:MM:SS` pone esa hora (OSF = 0) y es reproducible;
`--rtc host` toma la hora local de la PC (no reproducible). Sin la opción, el
RTC sigue con la hora guardada en el estado o, sin estado, arranca sin hora
válida como un chip nuevo. La app usa la hora local de la PC al iniciar cada
sesión y la guarda en las grabaciones para reproducirlas igual.

## No modelado

- Pin INT/SQW y salida de 32 kHz; EOSC con batería; aging (se guarda, no
  cambia la frecuencia); BB32kHz/CRATE (se guardan sin efecto).
- Fechas inválidas escritas por el firmware (p. ej. 30 de febrero) se
  normalizan al día siguiente en vez de conservarse tal cual.
