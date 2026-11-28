# Curso JWPLC Basic · Lección 49 · El panel web: la banda en el celular

## Qué vas a aprender

- Qué es el panel web de `JWPLC_Web`: una página que el equipo arma sola con las variables del programa.
- A publicar variables con `publish()`, `label()` y `unit()`.
- Cómo es el primer ingreso: el código de 6 dígitos del equipo crea al administrador.

## Qué conectar

- I0.0: sensor fotoeléctrico B1 de las cajas (PNP, 24 V DC).
- I0.1: pulsador S1 de marcha (NA).
- I0.2: pulsador S2 de parada (NC).
- Q0.0: contactor KM1 de la banda.
- Cable de red al router o al switch de la planta; un celular o una PC en la misma red.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie: sale «Panel web: http://…» y el código de primer ingreso.
2. Abre esa dirección en el navegador, escribe el código y elige tu usuario y tu clave (10 caracteres o más).
3. Arranca con S1 y pasa cajas por B1: «Cajas contadas» y «Banda en marcha» cambian solos en el panel.

## Para practicar

- Publica también el tiempo de marcha de la banda: `unsigned long marchaSegundos`, que suma 1 cada segundo con la banda en marcha, con el id «marcha_s», la etiqueta «Tiempo de marcha» y la unidad «s».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**. A los pocos segundos, la consola dice «Panel web: …» y el código de primer ingreso; el panel **Compilación** dice en qué dirección de la PC atiende el puerto 80 del PLC («Ethernet: puerto 80 del PLC en …»).
2. Abre esa dirección en el navegador de la PC, o en el celular si está en el mismo Wi-Fi (botón **Celular** de la barra). Escribe el código de 6 dígitos y elige tu usuario y tu clave.
3. Arranca con **S1** y acciona el sensor **B1** desde su símbolo: el panel muestra las cajas y la banda en vivo.

```text
Lección 49: panel web de la banda
[JWPLC_Web] Primer ingreso: abrir el panel y escribir el codigo 534141
Panel web: http://192.168.250.10/
Caja 1
Caja 2
```
