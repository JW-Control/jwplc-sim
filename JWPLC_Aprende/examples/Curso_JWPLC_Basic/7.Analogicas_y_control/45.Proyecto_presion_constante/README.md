# Curso JWPLC Basic · Lección 45 · Proyecto: presión constante en un edificio

## Qué vas a aprender

- A juntar medida, rampa, PI, reposo y alarmas en un solo programa.
- A ordenar el programa como un PLC: medir, decidir, actuar y avisar.
- A usar estados (detenido, regulando, reposo) para que cada parte sepa qué hacer.
- A elegir la falla segura de la máquina.

## Qué conectar

- VF1: variador en la dirección 1 con la bomba. PT1: transmisor de presión en la dirección 2.
- I0.0: marcha (NA). I0.1: parada (NC).
- Q0.0: lámpara H1 de bomba en marcha. Q0.1: lámpara H2 de alarma.

## Cómo probarlo

1. Sube el programa y aprieta marcha: la presión llega a 4,0 bar y H1 se enciende.
2. Cierra todos los grifos: la bomba se va a reposo y H1 se apaga.
3. Abre grifos: la bomba despierta sola.

## Para practicar

- Sin sensor: «Sensor de presión en falla: bomba a 45 Hz» una vez, la bomba a 45 Hz fijos y H2 encendida.
- Con el sensor de vuelta: «Sensor de presión normal», H2 apagada y el PI retoma.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: **H1** se enciende y la presión de **RED1** llega a 4,0 bar.
2. Baja el consumo de **RED1** a 0: a los segundos, «Bomba en reposo».
3. Sube el consumo: «Bomba despierta».

```text
Lección 45: presión constante 4,0 bar, marcha I0.0, parada NC I0.1
Equipo en marcha
Presión: 4.01 bar · 59.9 Hz
Presión: 4.11 bar · 51.6 Hz
Bomba en reposo
Bomba despierta
```
