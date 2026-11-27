# Curso JWPLC Basic · Lección 36 · Un variador por Modbus: marcha y velocidad

## Qué vas a aprender

- A mandar un variador de frecuencia por Modbus: la orden en 2000H y la frecuencia en 2001H.
- A leer la frecuencia real del motor (2103H) mientras sube con la rampa.
- Qué hay que programar en el variador para que obedezca al bus (fuente de marcha y de frecuencia: RS-485).
- A escribir direcciones y bits en hexadecimal y binario (`0x2000`, `0b00010010`).

## Qué conectar

- Variador en el bus RS-485: SG+ al A del JWPLC y SG- al B. Dirección 1, 9600 bps, RTU 8N1; parámetros 02.00 = 3 y 02.01 = 3.
- Motor trifásico a U, V, W del variador; red monofásica a R y S.
- I0.0: pulsador de marcha (NA). I0.1: pulsador de parada (NC).

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie.
2. Marcha: «Ventilador en marcha a 30 Hz» y la frecuencia sube con la rampa hasta 30,0 Hz.
3. Parada: el variador frena en rampa hasta 0 Hz.

## Para practicar

- UP y DOWN cambian la velocidad de a 10 Hz, entre 10 y 60 Hz, y la envían al variador al instante: «Velocidad: 40 Hz».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y toca **S1** en **Mandos** (panel **Reto**).
2. La pantalla de **VF1** en el **Esquema** muestra la frecuencia subiendo; el motor **M1** gira.
3. **S2** lo detiene en rampa.

```text
Lección 36: variador por Modbus, marcha I0.0, parada NC I0.1
Ventilador en marcha a 30 Hz
Frecuencia: 7.3 Hz
Frecuencia: 17.3 Hz
Frecuencia: 27.3 Hz
Frecuencia: 30.0 Hz
Ventilador detenido
```
