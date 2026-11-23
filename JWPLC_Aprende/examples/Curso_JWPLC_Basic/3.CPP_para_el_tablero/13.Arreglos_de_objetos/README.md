# Curso JWPLC Basic · Lección 13 · Arreglos de objetos: cuatro cintas

## Qué vas a aprender

- Arreglos: muchos objetos iguales bajo un solo nombre, con un índice.
- for: recorrer el arreglo sin escribir una línea por equipo.
- Un arranque escalonado: un equipo tras otro, sin delay().

## El caso: cuatro cintas en línea

- El material pasa de la cinta 1 a la 2, a la 3 y a la 4, que descarga.
- Se arranca desde la última hacia la primera, una cada 2 segundos, para
  no echar material sobre una cinta detenida.
- PARADA detiene todas a la vez.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador de MARCHA (NA). I0.1: pulsador de PARADA (NC).
- Q0.0 a Q0.3: bobinas de los contactores de las cintas 1 a 4.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Un toque a MARCHA: se cierra Q0.3 (cinta 4) y cada 2 segundos la
   anterior, hasta Q0.0.
3. PARADA abre los cuatro relés a la vez.

## Para practicar

- Cambia la parada para que vacíe las cintas: de la 1 a la 4, una por
  segundo.
- Enciende una lámpara en Q0.4 mientras dure el arranque o la parada.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**. La parada **S2** es NC: en reposo `I0.1` ya está activa.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: se cierra **KM4** (`Q0.3`) y, cada 2 segundos, **KM3**, **KM2** y **KM1**.
3. Da un toque a **S2 Parada**: los cuatro contactores se abren a la vez.

```text
Lección 13: marcha I0.0, parada NC I0.1, cintas en Q0.0 a Q0.3
Cinta 4 encendida
Cinta 3 encendida
Cinta 2 encendida
Cinta 1 encendida
Cinta 1 apagada
```
