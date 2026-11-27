# Curso JWPLC Basic · Lección 16 · El programa en pestañas

## Qué vas a aprender

- Repartir un programa en pestañas (archivos), cada una con un solo
  trabajo, como la plantilla de proyecto JWPLC.
- El ciclo de scan de un PLC: leer las entradas, decidir, escribir las
  salidas.
- Archivos .h con #pragma once para los nombres y las herramientas.
- Dónde va cada cambio: la tabla de E/S en B_Tags, los tiempos en
  A_Config, la lógica en D_Logica.

## Las pestañas

- Principal: solo el orden del ciclo.
- A_Config.h: nombre del proyecto y tiempos fijos.
- B_Tags.h: qué bit usa cada equipo y las variables compartidas.
- C_Entradas: lee los bornes y resuelve los contactos NC.
- D_Logica: decide; no toca bornes.
- F_Salidas: escribe los bornes una vez por ciclo.
- J_Diagnostico: mensajes por el Monitor Serie.
- K_Utilidades.h: TON, TOF y Flanco de la lección 14.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: MARCHA (NA). I0.1: PARO (NC). I0.2: contacto 95-96 del térmico
  (NC). Todos desde +24 V.
- Q0.0: contactor del motor. Q0.1: lámpara de falla.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. MARCHA arranca el motor; PARO lo detiene.
3. Con el motor en marcha, abre el térmico: se detiene y Q0.1 enciende.

## Para practicar

- Agrega un arranque con aviso: con MARCHA, una sirena en Q0.3 suena 2
  segundos y recién ahí arranca el motor.
- Agrega una lámpara de marcha en Q0.2.
- Pon cada cambio en su pestaña: bits en B_Tags.h, el tiempo en
  A_Config.h, la decisión en D_Logica y la escritura en F_Salidas.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Mira la barra de pestañas sobre el código: cada archivo del sketch es una pestaña. Recórrelas antes de ejecutar.
2. Pulsa **Ejecutar** y mira la pestaña **Serie**. **S2** y **F1** son NC: en reposo `I0.1` e `I0.2` ya están activas.
3. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: **KM1** se cierra. Un toque a **S2 Paro** lo abre.
4. Arranca otra vez y aprieta **F1 Térmico**: **KM1** se abre y **H1** enciende.

```text
Lección 16: motor en pestañas
Motor en marcha
Motor detenido
Motor en marcha
Motor detenido por el térmico
```
