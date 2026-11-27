# Curso JWPLC Basic · Lección 32 · Proyecto: la HMI de una cinta de lotes

## Qué vas a aprender

- Juntar toda la Unidad 5 en una máquina: campos, páginas, ajustes, tendencia y alarmas.
- Ordenar el `loop()` en funciones: `leerBotonera()`, `contarRitmo()` y el bloque de la cinta.
- Repartir la botonera: la ventana de alarma primero, después la edición, y recién después las páginas.
- Un atasco detectado por tiempo: 20 s en marcha sin piezas.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador de MARCHA (NA). I0.1: pulsador de PARADA (NC). I0.2: sensor de piezas al final de la cinta.
- Q0.0: contactor del motor de la cinta. Q0.1: lámpara de falla.

## Cómo probarlo

1. Sube el programa: la página PROCESO muestra la cinta, el lote (0 / 10), el total y el ritmo.
2. MARCHA y pasa diez piezas: la cinta para sola con «Lote completo: 10 piezas».
3. RIGHT: la página RITMO con la curva. RIGHT otra vez: AJUSTES; OK, UP y OK cambian el lote y lo guardan en la FRAM.
4. MARCHA sin pasar piezas: a los 20 s la cinta para, salta la ventana A01 ATASCO y H1 parpadea. OK la reconoce.

## Para practicar

- Al completar cada lote, escribe «Lote N completo en mm:ss», con N contando desde el encendido.
- Con la ventana A01 abierta, MARCHA no arranca: «Reconozca la alarma A01», como mucho una vez por segundo.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha** y diez toques a **B1**: el lote se completa y **KM1** se abre.
3. Recorre las páginas con **LEFT** y **RIGHT** (flechas del teclado). En **AJUSTES**, **OK** edita, **UP** y **DOWN** cambian, **OK** guarda y **ESC** cancela.
4. Arranca con **S1** y no toques **B1**: a los 20 s aparece **A01 ATASCO**. **OK** (o **Enter**) la reconoce.

```text
Lección 32: cinta de lotes, marcha I0.0, parada NC I0.1, sensor B1 I0.2, falla Q0.1
Lote: 10 piezas
Cinta en marcha
Lote completo: 10 piezas
Cinta en marcha
Alarma A01: atasco
A01 reconocida
```
