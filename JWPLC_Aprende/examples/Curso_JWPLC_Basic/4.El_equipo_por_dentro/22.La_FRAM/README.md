# Curso JWPLC Basic · Lección 22 · La FRAM: un contador que sobrevive a un corte

## Qué vas a aprender

- Qué memorias tiene el equipo y cuál no se borra al apagar.
- Guardar y leer un struct entero en la FRAM con writeBlock() y readBlock().
- Para qué sirve la versión del bloque.
- Un contador de piezas que sigue donde quedó después de un corte.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: sensor de piezas (NA) desde +24 V.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Cada pulso del sensor suma una pieza.
3. Corta la energía y vuelve a darla: «Recuperado: N piezas».
4. ESC en la botonera pone el contador en 0.

## Para practicar

- Cuenta también los encendidos del PLC y, al arrancar, escribe «Encendido
  n.º 2». Al cambiar el struct, sube VERSION a 2.
- Que un toque de ESC no borre nada: solo ESC mantenido 2 segundos escribe
  «Contador en 0».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**: la primera vez dice «FRAM nueva».
2. En **Mandos** (panel **Reto**) da tres toques a **B1 Pieza**: «Piezas: 3».
3. Pulsa **Detener** y otra vez **Ejecutar**: es como cortar la energía. La cuenta sigue en 3.
4. En la pestaña **Placa** aprieta **ESC**: el contador vuelve a 0.

```text
Lección 22: sensor de piezas I0.0, cuenta en la FRAM
FRAM nueva: contador en 0
Piezas: 1
Piezas: 2
Piezas: 3
Lección 22: sensor de piezas I0.0, cuenta en la FRAM
Recuperado: 3 piezas
```
