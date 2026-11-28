# Curso JWPLC Basic · Lección 50 · Consignas desde el celular

## Qué vas a aprender

- A dejar cambiar una variable desde el panel con `writable(WEB_OPERADOR)`.
- A poner límites con `range()`: el panel rechaza un valor fuera de rango.
- Cómo se hace una orden de un toque: el programa la cumple y la devuelve a falso.

## Qué conectar

- I0.0: sensor fotoeléctrico B1 de las cajas.
- I0.1: pulsador S1, lote nuevo (NA).
- I0.2: pulsador S2 de parada (NC).
- Q0.0: contactor KM1 de la banda.
- Cable de red; un celular o una PC en la misma red.

## Cómo probarlo

1. Entra al panel como en la lección 49 y cambia la «Meta del lote» a 3.
2. Arranca con S1 y pasa 3 cajas por B1: la banda para sola y sale «Meta cumplida: 3 cajas».
3. Prueba una meta de 500: el panel avisa que está fuera de rango y la meta no cambia.

## Para practicar

- Un «Contador a cero» en el panel: publica `bool reiniciar` con el id «reiniciar» y `writable(WEB_OPERADOR)`. Cuando vale verdadero, el programa pone `cajas` en 0, devuelve `reiniciar` a falso y escribe «Contador a cero desde el panel».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**. A los pocos segundos, la consola dice «Panel web: …» y el código de primer ingreso; el panel **Compilación** dice en qué dirección de la PC atiende el puerto 80 del PLC («Ethernet: puerto 80 del PLC en …»).
2. Abre esa dirección en el navegador de la PC, o en el celular si está en el mismo Wi-Fi (botón **Celular** de la barra). Escribe el código de 6 dígitos y elige tu usuario y tu clave.
3. En **Inicio**, «Cambiar valor» en la meta del lote. Arranca con **S1** y acciona **B1** desde su símbolo hasta llegar a la meta.

```text
Lección 50: la meta del lote se cambia desde el panel web
Panel web: http://192.168.250.10/
Caja 1 de 3
Caja 2 de 3
Caja 3 de 3
Meta cumplida: 3 cajas
```
