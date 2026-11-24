# Curso JWPLC Basic · Lección 20 · El buzzer: avisos que se oyen

## Qué vas a aprender

- Hacer sonar el buzzer del equipo con JWPLC_Buzzer: beep(), play() y stop().
- Escribir una melodía como una lista de notas {frecuencia, duración}.
- Avisar antes de arrancar una máquina.
- Una alarma que suena hasta que alguien la reconoce.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: MARCHA (NA). I0.1: PARO (NC). I0.2: contacto 95-96 del térmico
  (NC). Todos desde +24 V.
- Q0.0: contactor del motor. Q0.1: lámpara de falla.
- El buzzer y la botonera ya vienen en el equipo.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. MARCHA: el buzzer avisa 2 segundos y recién ahí arranca el motor.
3. Con el motor en marcha, abre el térmico: se detiene, Q0.1 enciende y
   suena la alarma.
4. OK en la botonera la reconoce y la calla. Al cerrar el térmico, Q0.1 se
   apaga.

## Para practicar

- Mientras la alarma no esté reconocida, la lámpara de falla parpadea
  (medio segundo encendida, medio apagada); reconocida, queda fija.
- Durante una falla, MARCHA no arranca: escribe «Bloqueado: térmico
  abierto» y da un tono grave con JWPLC_Buzzer.beep(300, 600).

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**. **S2** y **F1** son NC: en reposo `I0.1` e `I0.2` ya están activas. Sube el volumen de la PC para oír el buzzer.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: suena el aviso y a los 2 s **KM1** se cierra.
3. Mantén apretado **F1 Térmico**: **KM1** se abre, **H1** enciende y suena la alarma.
4. En la pestaña **Placa** aprieta **OK** (o **Enter**): la alarma se calla. Suelta **F1**: **H1** se apaga.

```text
Lección 20: marcha I0.0, paro NC I0.1, térmico NC I0.2, motor Q0.0, falla Q0.1
Aviso de arranque
Motor en marcha
Falla: térmico
Alarma reconocida
Térmico normal
```
