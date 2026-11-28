# Curso JWPLC Basic · Lección 51 · Alarmas y tendencia en el panel web

## Qué vas a aprender

- A declarar una alarma con `addAlarm()` y a encenderla con `setAlarm()`.
- Qué hace el operador con una alarma: verla, reconocerla y mirar su historial.
- A guardar una variable en la tendencia con `trend()` y `trendEvery()`.

## Qué conectar

- I0.0: sensor fotoeléctrico B1 de las cajas.
- I0.1: pulsador S1 de marcha (NA).
- I0.2: pulsador S2 de parada (NC).
- I0.3: contacto 95-96 del relé térmico F1 (NC), para la práctica.
- Q0.0: contactor KM1 de la banda.
- Q0.1: piloto rojo H1 de falla.
- Cable de red; un celular o una PC en la misma red.

## Cómo probarlo

1. Entra al panel y arranca con S1.
2. Tapa el sensor B1 más de 3 s: la banda para, H1 se enciende y el panel muestra «Caja atascada frente a B1».
3. En la pestaña Alarmas, reconócela. Destapa B1 y vuelve a arrancar. En Tendencias, mira cómo suben las cajas.

## Para practicar

- Una segunda alarma: el relé térmico F1 en I0.3 (NC). Declara la alarma «termico» («Térmico del motor disparado», prioridad alta); con F1 abierto se enciende, la banda para y H1 se enciende, igual que con el atasco.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**. A los pocos segundos, la consola dice «Panel web: …» y el código de primer ingreso; el panel **Compilación** dice en qué dirección de la PC atiende el puerto 80 del PLC («Ethernet: puerto 80 del PLC en …»).
2. Abre esa dirección en el navegador de la PC, o en el celular si está en el mismo Wi-Fi (botón **Celular** de la barra). Escribe el código de 6 dígitos y elige tu usuario y tu clave.
3. Arranca con **S1**. Para el atasco, deja el sensor **B1** accionado más de 3 s; reconoce la alarma en la pestaña **Alarmas** del panel.

```text
Lección 51: alarma de atasco y tendencia en el panel web
Panel web: http://192.168.250.10/
Caja 1
Alarma: caja atascada
```
