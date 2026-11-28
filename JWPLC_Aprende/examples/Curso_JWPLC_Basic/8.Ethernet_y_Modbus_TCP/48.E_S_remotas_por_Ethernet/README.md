# Curso JWPLC Basic · Lección 48 · E/S remotas por Ethernet: el JWPLC cliente Modbus TCP

## Qué vas a aprender

- A hacer del JWPLC un cliente Modbus TCP con `JWPLC_ModbusTCPClient`.
- A pedir sin esperar: `request…()`, `task()`, `done()`, `succeeded()` y `clearResult()`.
- A repartir el ciclo leer, decidir y escribir en dos pasos.

## Qué conectar

- Módulo de E/S remotas Modbus TCP en 192.168.250.20, puerto 502, en el mismo switch que el JWPLC, con 24 V DC.
- DI1: marcha S1 (NA). DI2: parada S2 (NC). Común DC al 0 V.
- DO1: contactor KM1 de la bomba. DO2: lámpara de marcha H1. Común C1 al +24 V.

## Cómo probarlo

1. Sube el programa: «Módulo en línea».
2. Marcha en DI1: KM1 y H1 encienden. Parada en DI2: se apagan.
3. Desconecta el cable del módulo: «Sin respuesta del módulo».

## Para practicar

- Suma el térmico en DI3 (NC): la bomba para, no arranca y se escribe «Falla: térmico» una vez; la lámpara de falla en DO3 mientras dure.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y espera «Módulo en línea» (la red tarda unos segundos en arrancar).
2. En **Mandos** (panel **Reto**), **S1** y **S2** están cableados al módulo **IO1**, no al JWPLC.
3. Toca **S1**: **KM1** cierra a través de DO1. **S2** lo detiene.

```text
Lección 48: E/S remotas por Ethernet en 192.168.250.20, bomba en DO1
Módulo en línea
Bomba en marcha
Bomba detenida
```
