# Curso JWPLC Basic · Lección 23 · La microSD: un registro con fecha y hora

## Qué vas a aprender

- Escribir un archivo en la microSD del equipo con JWPLC_SD y JWPLCFile.
- Abrir, escribir y cerrar; FILE_APPEND para sumar al final.
- Un registro CSV: una línea por evento, con fecha y hora del RTC.
- Leer el archivo y qué hacer si la tarjeta no está.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: MARCHA (NA). I0.1: PARO (NC). Los dos desde +24 V.
- Q0.0: contactor del motor. Q0.1: lámpara de aviso (para practicar).
- Una tarjeta microSD en la ranura del equipo.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Arranca y para el motor: cada evento se anota en /registro.csv.
3. OK en la botonera muestra el archivo.
4. Saca la tarjeta y lee registro.csv en la PC: se abre con Excel.

## Para practicar

- Al arrancar el PLC, cuenta las líneas del archivo y escribe «Registro: N
  eventos».
- Sin microSD, la lámpara de Q0.1 se enciende y el motor sigue funcionando.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. En esta práctica el reloj del Sim arranca a las **08:00:00**. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha** y otro a **S2 Paro**: cada evento queda registrado.
3. En la pestaña **Placa** aprieta **OK**: el Monitor muestra el archivo.
4. Para probar sin tarjeta, en la pestaña **Placa** haz clic en el zócalo de la microSD: la tarjeta sale. Otro clic la vuelve a poner.

```text
Lección 23: marcha I0.0, paro NC I0.1, motor Q0.0, registro en la microSD
Registrado: 2026-11-24 08:00:00;Encendido
Registrado: 2026-11-24 08:00:03;Arranque
Registrado: 2026-11-24 08:00:05;Parada
--- registro.csv ---
2026-11-24 08:00:00;Encendido
2026-11-24 08:00:03;Arranque
2026-11-24 08:00:05;Parada
--- fin ---
```
