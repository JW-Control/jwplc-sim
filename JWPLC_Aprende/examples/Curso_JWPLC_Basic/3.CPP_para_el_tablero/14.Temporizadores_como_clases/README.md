# Curso JWPLC Basic · Lección 14 · Temporizadores y flancos como clases

## Qué vas a aprender

- Armar tu caja de herramientas de PLC: TON, TOF y Flanco como clases.
- Un objeto por cada uso: cada temporizador recuerda su propio tiempo.
- Los mismos nombres que la pestaña K_Utilidades de la plantilla de
  proyecto JWPLC.

## El caso: un compresor de aire

- El presostato pide aire cuando la presión baja. Para no arrancar por un
  golpe de presión, tiene que pedirlo 2 segundos seguidos.
- El ventilador de enfriamiento sigue 5 segundos después de parar.
- Cada arranque se cuenta por el Monitor Serie.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: contacto del presostato, desde +24 V (cierra con presión baja).
- Q0.0: contactor del motor del compresor.
- Q0.1: contactor del ventilador.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Activa I0.0: a los 2 segundos se cierran Q0.0 y Q0.1.
3. Desactívalo: Q0.0 se abre enseguida y Q0.1, 5 segundos después.

## Para practicar

- Agrega un tiempo mínimo de parada: después de detenerse, el compresor no
  arranca hasta pasados 5 segundos (los motores grandes no aguantan
  arranques seguidos).
- Enciende una lámpara en Q0.2 mientras el presostato pide aire pero el
  compresor espera ese tiempo.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) pon el presostato **P1** en **I** (presión baja): a los 2 segundos se cierran **KM1** (compresor) y **KM2** (ventilador).
3. Vuelve **P1** a **0**: **KM1** se abre enseguida y **KM2** sigue 5 segundos.
4. Pásalo a **I** y a **0** en menos de 2 segundos: el compresor no arranca.

```text
Lección 14: presostato I0.0, compresor Q0.0, ventilador Q0.1
Arranques: 1
```
