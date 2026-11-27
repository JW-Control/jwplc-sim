# Curso JWPLC Basic · Lección 15 · Modos de operación: manual y automático

## Qué vas a aprender

- Los modos de una máquina: manual, apagado y automático, con un selector
  de tres posiciones.
- Un enum para los modos y un switch con las reglas de cada uno.
- Funciones que devuelven un enum: leerModo().
- Por qué cambiar de modo siempre deja la máquina quieta.

## El caso: un agitador de mezcla

- MAN: el motor gira por impulsos, solo mientras se aprieta el pulsador.
  Sirve para pruebas y limpieza.
- 0: nada se mueve.
- AUT: un toque a CICLO mezcla 8 segundos y se detiene solo.

## Qué conectar

- Borne 1M a 0 V.
- Selector MAN-0-AUT: el contacto de MAN a I0.0 y el de AUT a I0.1, los
  dos desde +24 V.
- I0.2: pulsador de impulso (NA). I0.3: pulsador de CICLO (NA).
- Q0.0: contactor del motor. Q0.1: lámpara de manual. Q0.2: lámpara de
  automático.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Selector en MAN: Q0.1 enciende y el motor gira solo mientras aprietas
   I0.2.
3. Selector en AUT: Q0.2 enciende. Un toque a I0.3 cierra Q0.0 durante 8
   segundos.
4. Pasa el selector a 0 en mitad de un ciclo: el motor se detiene y el
   ciclo no sigue al volver a AUT.

## Para practicar

- Agrega la descarga: al terminar la mezcla, la válvula Q0.3 abre 3
  segundos. Pista: cambia el bool ciclo por un enum con los pasos.
- Haz que la lámpara de automático parpadee cada medio segundo mientras
  el ciclo está en curso.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) pon el selector **SA1** en **I** (MAN): **H1** enciende. Mantén apretado **S1 Impulso**: **KM1** se cierra solo mientras lo aprietas.
3. Pon **SA1** en **II** (AUT): **H2** enciende. Da un toque a **S2 Ciclo**: **KM1** se cierra 8 segundos y se abre solo.
4. Empieza otro ciclo y pasa **SA1** a **0**: todo se detiene.

```text
Lección 15: selector MAN I0.0 / AUT I0.1, impulso I0.2, ciclo I0.3
Modo: APAGADO
Modo: MANUAL
Modo: AUTOMATICO
Ciclo: mezclando
Ciclo terminado
```
