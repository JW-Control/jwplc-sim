# Curso JWPLC Basic · Lección 26 · La pantalla: el estado de la máquina a la vista

## Qué vas a aprender

- Dibujar en la pantalla del equipo con el objeto JWPLC_TFT: texto, colores y recuadros.
- Las dos funciones que llama el package: jwplcUIEnter() para lo fijo y jwplcUIUpdate() para lo que cambia.
- Redibujar solo cuando algo cambia, para que la pantalla no parpadee.
- La pantalla de estado (IDLE) del equipo y la tuya (USER): cómo se pasa de una a otra.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador de MARCHA (NA), desde +24 V.
- I0.1: pulsador de PARADA (NC), desde +24 V.
- Q0.0: bobina del contactor de la bomba.

## Cómo probarlo

1. Sube el programa: al arrancar, la pantalla pasa sola a la vista de la bomba.
2. PARADA en rojo; MARCHA la pone en verde.
3. ESC vuelve a la pantalla de estado del equipo; OK abre otra vez la de la bomba.

## Para practicar

- Cuenta los arranques: muéstralos abajo en la pantalla y escríbelos en el
  Monitor Serie («Arranques: 2»).
- Agrega el térmico (I0.2, NC): abierto, la bomba para, la lámpara de falla
  Q0.1 enciende, el Monitor Serie dice «Falla: térmico» y la pantalla muestra
  FALLA en naranja.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**: la pantalla muestra **PARADA** en rojo. **S2** es NC: en reposo `I0.1` ya está activa.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: **KM1** se cierra y la pantalla pasa a **MARCHA** en verde.
3. **S2 Parada** la detiene. En la Placa, **ESC** muestra la pantalla de estado del equipo y **OK** vuelve a la de la bomba.

```text
Lección 26: la pantalla, bomba P1 marcha I0.0, parada NC I0.1
Motor en marcha
Motor detenido
```
