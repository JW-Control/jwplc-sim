# Curso JWPLC Basic · Lección 19 · La botonera del frente: ajustar sin la PC

## Qué vas a aprender

- Leer la botonera del equipo con JWPLC_Buttons, sin cables ni digitalRead().
- pressed(): una sola vez por cada pulsación (el flanco ya viene hecho).
- isDown(): si la tecla sigue apretada.
- Ajustar un tiempo de la máquina desde el frente, con límites.

## Qué conectar

- Borne 1M a 0 V.
- Q0.0: bobina del contactor de la bomba dosificadora.
- La botonera (UP, DOWN, OK, ESC) ya viene en el frente del equipo.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. UP y DOWN cambian el tiempo de dosis de a 1 segundo, entre 1 y 10.
3. OK pone en marcha la bomba durante ese tiempo; ESC la detiene antes.

## Para practicar

- Al llegar a un límite, escribe una sola vez «Límite: 10 s» (o «Límite: 1 s»)
  en lugar de quedarte callado.
- Al mantener UP o DOWN apretado, después de 600 ms el tiempo cambia solo
  cada 200 ms, como el control remoto de un televisor.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. Abre la pestaña **Placa**: la botonera está a la derecha de la pantalla. También puedes usar las flechas, **Enter** (OK) y **Esc** del teclado.
3. Aprieta **UP** dos veces: el tiempo sube a 5 s. Aprieta **OK**: **KM1** se cierra 5 segundos.
4. Aprieta **OK** otra vez y, antes de que termine, **ESC**: la dosis se cancela.

```text
Lección 19: botonera del frente, bomba dosificadora Q0.0
Tiempo: 3 s
Tiempo: 4 s
Tiempo: 5 s
Dosificando 5 s
Dosis completa
Dosificando 5 s
Dosis cancelada
```
